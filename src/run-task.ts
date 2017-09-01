import { AnonymousSubscription } from 'rxjs/Subscription';
import { ChildProcess, execSync, spawn, SpawnOptions } from 'child_process';
import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
import 'rxjs/add/observable/of';
import 'rxjs/add/observable/using';
import 'rxjs/add/operator/concat';
const kill = require('tree-kill');

import { IReporter } from './reporter';
import { IRunTask } from './task';
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

    constructor(private _task: IRunTask, private _reporter: IReporter, private _errorTimeoutMs: number) {
        let command = this._task.command;
        let args = this._task.args;

        if (this._task.memoryLimitMb) {
            args = args || [];
            args.unshift(`--max-old-space-size=${this._task.memoryLimitMb}`);
        }

        this._commandLine = `${command} ${(args || []).join(' ')}`;
        this._process = spawn(command, args, this._task.options);

        // only emit TaskStart after subscriber attaches
        this.taskEvents$ = Observable.of<TaskEvent>(new TaskStart(this._task, this._startTime, this._commandLine))
            .concat(this._subject);

        this._process.stdout.on('data', (data: string | Buffer): void => {
            if (this._unsubscribed) {
                // if the _subject observable has been unsubscribed then we send the stdout
                // directly to the reporter
                this._reporter.next(new TaskData(this._task, data.toString()));
                return;
            }
            
            this._subject.next(new TaskData(this._task, data.toString()));
        });

        let errorTimeoutId: NodeJS.Timer | undefined;
        let lastError: string | undefined;

        this._process.stderr.on('data', (data: string | Buffer): void => {
            let stderr = data.toString();

            if (/warning/i.test(stderr)) {
                // if this is a warning, emit as normal
                this._subject.next(new TaskData(this._task, stderr, TaskDataLogLevel.warn));
                return;
            }

            if (this._task.haltOnErrors === false) {
                // if !haltOnErrors emit as normal
                this._subject.next(new TaskData(this._task, stderr, TaskDataLogLevel.error));
                return;
            }

            if (this._unsubscribed || this._error) {
                // if the _subject observable has been unsubscribed then we send the error
                // directly to the reporter
                this._reporter.next(new TaskData(this._task, stderr, TaskDataLogLevel.error));
                return;
            }

            this._error = true;

            if (!this._errorTimeoutMs) {
                // error grace period disabled
                this._subject.error(new TaskError(this._task, this._startTime, stderr));
                return;
            }

            if (lastError && errorTimeoutId) {
                // another error has occured within the error grace period
                // clear the timer and emit the previous error as normal
                clearTimeout(errorTimeoutId);
                this._subject.next(new TaskData(this._task, lastError, TaskDataLogLevel.error));
            }

            lastError = stderr;
            errorTimeoutId = setTimeout(() => {
                this._subject.error(new TaskError(this._task, this._startTime, stderr));
            }, this._errorTimeoutMs);
        });

        this._process.on('error', (err: Error): void => {
            this._error = true;
            this._subject.error(new TaskError(this._task, this._startTime, `process error`, err));
        });

        this._process.on('exit', (exitCode, signal) => {
            this._complete = true;
            if (this._error || this._unsubscribed)
                return;
            if (!exitCode) {
                this._subject.next(new TaskDone(this._task, this._startTime));
                this._subject.complete();
            } else {
                this._subject.error(new TaskError(this._task, this._startTime, `process exited with code ${exitCode}`));
            }
        });
    }

    static create(task: IRunTask, reporter: IReporter, errorTimeoutMs: number): Observable<TaskEvent> {
        return Observable.using(
            () => new RunTask(task, reporter, errorTimeoutMs),
            (resource: AnonymousSubscription) => (resource as RunTask).taskEvents$
        );
    }

    private stop(signal?: string): void {
        // npm run, yarn, and at-loader will spawn their own child processes. use tree-kill to also stop these children
        kill(this._process.pid, signal || 'SIGTERM', (err: Error) => {
            // use _reporter directly since at this point the _subject is unsubscribed
            if (err) {
                this._reporter.next(new TaskData(this._task, `${this._task.name} process could not be stopped (command: ${this._commandLine})`, TaskDataLogLevel.error, err));
                process.exitCode = 1;
            } else {
                let runTimeMs = Math.floor(new Date().getTime() - this._startTime.getTime());
                this._reporter.next(new TaskData(this._task, `${this._task.name} process stopped after ${runTimeMs}ms`, TaskDataLogLevel.info));
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
}
