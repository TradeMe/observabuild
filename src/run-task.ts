import { AnonymousSubscription } from 'rxjs/Subscription';
import { ChildProcess, spawn } from 'child_process';
import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
import 'rxjs/add/observable/of';
import 'rxjs/add/observable/using';
import 'rxjs/add/operator/concat';
const kill = require('tree-kill');

import { IRunTask } from './task';
import { IStore } from './store';
import { TaskData, TaskDataLogLevel, TaskDone, TaskError, TaskEvent, TaskStart } from './task-event';

export class RunTask implements AnonymousSubscription {
    private _process: ChildProcess;
    private _subject: Subject<TaskEvent> = new Subject<TaskEvent>();
    public taskEvents$: Observable<TaskEvent>;

    private _commandLine: string;
    private _startTime: Date = new Date();

    private _complete: boolean = false;
    private _unsubscribed: boolean = false;
    private _error: boolean = false;

    private _errorTimeoutId: NodeJS.Timer | undefined;

    constructor(
        private _task: IRunTask,
        private _store: IStore,
        private _closeSubject: Subject<TaskEvent>
    ) {
        let command = this._task.command;

        // if any of the args are functions then resolve the value now
        let args = (this._task.args || []).map(arg => typeof arg === 'function' ? this._store.select(arg) : arg);

        if (this._task.memoryLimitMb) {
            args = args || [];
            args.unshift(`--max-old-space-size=${this._task.memoryLimitMb}`);
        }

        this._commandLine = `${command} ${args.join(' ')}`;
        this._process = spawn(command, args, this._task.options);

        // only emit TaskStart after subscriber attaches
        this.taskEvents$ = Observable.of<TaskEvent>(new TaskStart(this._task, this._startTime, this._commandLine))
            .concat(this._subject);

        this._process.stdout.on('data', (data: string | Buffer): void => {
            let stdout = data.toString();
            this.log(stdout);
        });

        this._process.stderr.on('data', (data: string | Buffer): void => {
            let stderr = data.toString();

            // if this is a warning, emit as normal
            if (/warning/i.test(stderr)) {
                this.log(stderr, TaskDataLogLevel.warn);
                return;
            }
            this.error(stderr);
        });

        this._process.on('error', (err: Error): void => {
            this._error = true;
            this._store.setState({ success: false });
            this._subject.error(new TaskError(this._task, this._startTime, `process error`, err));
        });

        this._process.on('exit', exitCode => {
            this._complete = true;
            if (this._error || this._unsubscribed)
                return;
            if (!exitCode || this._task.haltOnErrors === false) {
                this._subject.next(new TaskDone(this._task, this._startTime));
                this._subject.complete();
            } else {
                this._store.setState({ success: false });
                this._subject.error(new TaskError(this._task, this._startTime, `process exited with code ${exitCode}`));
            }
        });
    }

    static create(task: IRunTask, store: IStore, closeSubject: Subject<TaskEvent>): Observable<TaskEvent> {
        return Observable.using(
            () => new RunTask(task, store, closeSubject),
            (resource: AnonymousSubscription) => (resource as RunTask).taskEvents$
        );
    }

    private log(message: string, logLevel?: TaskDataLogLevel): void {
        // allow task to consume or alter the stdout response stream from the child process
        if (this._task.response) {
            let result = this._task.response(message, this._store);
            if (typeof result !== 'string')
                return;
            message = result;
        }

        let filteredMessage = this.filterMessage(message);
        if (!filteredMessage)
            return;

        if (this._unsubscribed) {
            // if the _subject observable has been unsubscribed then we send the message
            // directly to the reporter
            this._closeSubject.next(new TaskData(this._task, filteredMessage, logLevel));
            return;
        }

        this._subject.next(new TaskData(this._task, filteredMessage, logLevel));
    }

    private error(message: string): void {
        if (this._unsubscribed || this._error) {
            // if the _subject observable has been unsubscribed then we send the error
            // directly to the reporter
            this._closeSubject.next(new TaskData(this._task, message, TaskDataLogLevel.error));
            return;
        }
        this._subject.next(new TaskData(this._task, message, TaskDataLogLevel.error));

        if (this._task.haltOnErrors === false)
            return;

        this._error = true;
        let stopMessage = `Stopping ${this._task.name || this._task.prefix || 'task'} due to errors`;
        
        let errorTimeoutMs = this._store.select(state => state.errorTimeoutMs || 0);
        if (errorTimeoutMs === 0) {
            // error grace period disabled
            this._store.setState({ success: false });
            this._subject.error(new TaskError(this._task, this._startTime, stopMessage));
            return;
        }

        // if another error has occurred within the error grace period then reset the timer
        if (this._errorTimeoutId)
            clearTimeout(this._errorTimeoutId);

        this._errorTimeoutId = setTimeout(() => {
            this._store.setState({ success: false });
            this._subject.error(new TaskError(this._task, this._startTime, stopMessage));
        }, errorTimeoutMs);
    }

    private stop(signal?: string): void {
        // npm run, yarn, and at-loader will spawn their own child processes. use tree-kill to also stop these children
        kill(this._process.pid, signal || 'SIGTERM', (err: Error) => {
            // use _closeSubject since at this point the _subject is unsubscribed
            if (err) {
                this._closeSubject.next(new TaskData(this._task, `${this._task.name} process could not be stopped (command: ${this._commandLine})`, TaskDataLogLevel.error, err));
                process.exitCode = 1;
            } else {
                let runTimeMs = Math.floor(new Date().getTime() - this._startTime.getTime());
                this._closeSubject.next(new TaskData(this._task, `${this._task.name} process stopped after ${runTimeMs}ms`, TaskDataLogLevel.info));
            }
        });
    }

    unsubscribe(): void {
        if (this._complete)
            return;
        this._unsubscribed = true;
        if (this._error) {
            // if this process triggered the error then the unsubscribe will occur before the process exits.
            // wait for a normal process exit before killing
            setTimeout(() => {
                if (this._complete)
                    return;
                this.stop();
            }, 1000);
        } else {
            this.stop();
        }
    }

    private filterMessage(message: string): string | null {
        if (!this._task.eventFilter || !this._task.eventFilter.length)
            return message;
        let filteredMessage: string | null = message;
        this._task.eventFilter.forEach(filterFunc => {
            if (filteredMessage === null)
                return;
            let filterResult: string | boolean;
            try {
                filterResult = filterFunc(filteredMessage);
            } catch(error) {
                // allow the task to stop the build by throwing from the event filter function
                this.error(error instanceof Error ? error.message : error);
                filterResult = false;
            }
            if (!filterResult)
                filteredMessage = null;
            else if (typeof filterResult === 'string')
                filteredMessage = filterResult;
        });
        return filteredMessage;
    }
}
