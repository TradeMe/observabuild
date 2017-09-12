import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
const OS = require('os');
import 'rxjs/add/observable/if';
import 'rxjs/add/operator/filter';

import { initialState, IBuildState, IStore, Store } from './store';
import { ConsoleReporter } from './console-reporter';
import { DoTask } from './do-task';
import { RunTask } from './run-task';
import { IDoTask, IRunTask, ITaskAction } from './task';
import { TaskData, TaskEvent } from './task-event';
import { TaskList } from './task-list';
import { TeamCityReporter } from './teamcity-reporter';

const IS_WINDOWS = OS.platform().indexOf('win32') !== -1;
const CMD_EXT = IS_WINDOWS ? '.cmd' : '';

export class Build extends TaskList {
    private constructor(
        private _store: IStore,
        private _closeSubject: Subject<TaskEvent>,
        private _isSubTask: boolean
    ) {
        super();
    }

    static create(buildState?: IBuildState): Build {
        let store = new Store({
            ...initialState,
            ...buildState
        });
        let closeSubject = new Subject<TaskEvent>();
        return new Build(store, closeSubject, false);
    }

    select<T>(selector: (state: IBuildState) => T): T {
        return this._store.select(selector);
    }

    setState(state: IBuildState): Build {
        this._store.setState(state);
        return this;
    }

    serial(syncTasks: (build: Build) => void): Build {
        let build = this.createSubTask(syncTasks);
        if (build)
            this.add(build.asSync());
        return this;
    }

    parallel(asyncTasks: (build: Build) => void): Build {
        let build = this.createSubTask(asyncTasks);
        if (build)
            this.add(build.asAsync());
        return this;
    }

    do(task: IDoTask | ((task: ITaskAction) => string | void)): Build {
        if (typeof task === 'function')
            task = { next: task };
        this.add(DoTask.create(task, this._store));
        return this;
    }

    run(task: IRunTask): Build {
        let globalEventFilter = this._store.select(state => state.eventFilter);
        if (globalEventFilter && globalEventFilter.length)
            task.eventFilter = (task.eventFilter || []).concat(globalEventFilter);
        this.add(RunTask.create(task, this._store, this._closeSubject));
        return this;
    }

    if(condition: (state: IBuildState) => boolean, ifTasks: (build: Build) => void, elseTasks?: (build: Build) => void): Build {
        let build = this.createSubTask(ifTasks);
        if (build) {
            let elseBuild = elseTasks ? this.createSubTask(elseTasks) : null;
            let task = elseBuild
                ? Observable.if<TaskEvent, TaskEvent>(() => this._store.conditional(condition), build.asSync(), elseBuild.asSync())
                : Observable.if<TaskEvent, TaskEvent>(() => this._store.conditional(condition), build.asSync());
            this.add(task);
        }
        return this;
    }

    log(message: string): Build {
        this.add(Observable.of<TaskEvent>(new TaskData({}, message)));
        return this;
    }

    yarn(task: IRunTask): Build {
        let yarnTask = { ...task };
        yarnTask.command = `yarn${CMD_EXT}`;
        yarnTask.args = task.args || [];
        yarnTask.args.unshift(task.command);
        this.run(yarnTask);
        return this;
    }

    node(task: IRunTask): Build {
        let nodeTask = { ...task };
        nodeTask.command = 'node';
        nodeTask.args = task.args || [];
        nodeTask.args.unshift(task.command);
        this.run(nodeTask);
        return this;
    }

    nodeBin(task: IRunTask): Build {
        let command = `./node_modules/.bin/${task.command}`;
        if (IS_WINDOWS)
            command = command.replace(/\//g, '\\') + CMD_EXT;
        let nodeTask = { ...task, command: command };
        this.run(nodeTask);
        return this;
    }

    npm(task: IRunTask): Build {
        let npmTask = { ...task };
        npmTask.command = `npm${CMD_EXT}`;
        npmTask.args = task.args || [];
        npmTask.args.unshift(task.command);
        this.run(npmTask);
        return this;
    }

    npmRun(task: IRunTask): Build {
        let runTask = { ...task };
        runTask.command = 'run';
        runTask.args = task.args || [];
        runTask.args.unshift(task.command);
        this.npm(runTask);
        return this;
    }

    start(): void {
        if (this._isSubTask) {
            throw new Error('You cannot call Build.start() from a sub task');
        }
        if (this.empty()) {
            throw new Error('No tasks queued in the build');
        }

        let useTeamcity = this._store.select(state => state.teamcity);
        let reporter = useTeamcity ? new TeamCityReporter() : new ConsoleReporter();

        let timeoutSeconds = this._store.select(state => state.timeoutSeconds || 0);
        let timeoutId: NodeJS.Timer;
        if (timeoutSeconds > 0) {
            timeoutId = setTimeout(() => {
                reporter.log(`Build timeout after ${timeoutSeconds} seconds. stopping build.`);
                reporter.unsubscribe();
                process.exitCode = 1;
            }, timeoutSeconds * 1000);
        }

        // the build will start when the reporter subscribes
        reporter.subscribe(this.asSync(), (err?: any) => {
            // on complete clear timeout if it was set. this allows main process to exit
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        });

        // if the main TaskEvent observable stream errors or is unsubscribed, the remaining events
        // will then be dispatched to closeSubject.
        this._closeSubject.subscribe(event => reporter.next(event));
        
        process.on('SIGTERM', () => {
            reporter.log('SIGTERM received. stopping build');
            reporter.unsubscribe();
            process.exitCode = 1;
        });
    }

    private createSubTask(tasks: (build: Build) => void): Build | null {
        let build = new Build(this._store, this._closeSubject, true);
        tasks(build);
        if (build.empty())
            return null;
        return build;
    }
}
