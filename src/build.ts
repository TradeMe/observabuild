import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
const OS = require('os');

import { ConsoleReporter } from './console-reporter';
import { DoTask } from './do-task';
import { RunTask } from './run-task';
import { IDoTask, IRunTask } from './task';
import { IReporter } from './reporter';
import { TaskList } from './task-list';
import { isRunningInTeamCity, TeamCityReporter } from './teamcity-reporter';

const IS_WINDOWS = OS.platform().indexOf('win32') !== -1;
const CMD_EXT = IS_WINDOWS ? '.cmd' : '';

const DEFAULT_BUILD_TIMEOUT_SECONDS = 60 * 60; // halt build after 1 hour ...

export interface IBuildOptions {
    timeoutSeconds?: number; // halt the build if it runs longer than this. set to 0 to disable
    teamcity?: boolean; // override automatic teamcity reporter detection
    errorTimeoutMs?: number; // time to wait after a stderr before stopping the build. allows multiple errors to be output before fail. set to 0 to disable
}

export class Build extends TaskList {
    private _reporter: IReporter;
    private _options: IBuildOptions;
    private _isSubTask: boolean = false;
    private _indent: number = 0;

    constructor(options?: IBuildOptions) {
        super();
        this._options = {
            timeoutSeconds: DEFAULT_BUILD_TIMEOUT_SECONDS,
            teamcity: isRunningInTeamCity(),
            errorTimeoutMs: 1000,
            ...options
        };
        this._reporter = (this._options.teamcity === true)
            ? new TeamCityReporter()
            : new ConsoleReporter();
    }

    serial(syncTasks: (build: Build) => void): Build {
        let build = new Build();
        build._isSubTask = true;
        build._indent = this._indent + 1;
        syncTasks(build);
        if (!build.empty()) {
            this.add(build.asSync());
        }
        return this;
    }

    parallel(asyncTasks: (build: Build) => void): Build {
        let build = new Build();
        build._isSubTask = true;
        asyncTasks(build);
        if (!build.empty()) {
            this.add(build.asAsync());
        }
        return this;
    }

    do(task: IDoTask): Build {
        this.add(DoTask.create(task));
        return this;
    }

    run(task: IRunTask): Build {
        this.add(RunTask.create(task, this._reporter, this._options.errorTimeoutMs || 0));
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
        npmTask.command = 'npm';
        npmTask.args = task.args || [];
        npmTask.args.unshift(task.command);
        this.run(npmTask);
        return this;
    }

    start(): void {
        if (this._isSubTask) {
            throw new Error('You cannot call Build.start() from a sub task');
        }
        if (this.empty()) {
            throw new Error('No tasks queued in the build');
        }

        let timeoutId: NodeJS.Timer;

        // the build will start when the reporter subscribes
        this._reporter.subscribe(this.asSync(), (err?: any) => {
            // on complete clear timeout if it was set
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        });

        if (this._options.timeoutSeconds) {
            timeoutId = setTimeout(() => {
                this._reporter.log(`Build timeout after ${this._options.timeoutSeconds} seconds. stopping build.`);
                this._reporter.unsubscribe();
                process.exitCode = 1;
            }, this._options.timeoutSeconds * 1000);
        }

        process.on('SIGTERM', () => {
            this._reporter.log('SIGTERM received. stopping build');
            this._reporter.unsubscribe();
            process.exitCode = 1;
        });
    }
}
