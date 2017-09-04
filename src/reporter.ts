import { Observable } from 'rxjs/Observable';
import { Subscription } from 'rxjs/Subscription';

import { ERROR_EXIT_CODE, TaskArtifact, TaskData, TaskDataLogLevel, TaskDone, TaskError, TaskEvent, TaskStart } from './task-event';

export type LogFilterFunction = (message: string, reporter: string, logLevel: TaskDataLogLevel) => boolean | string;

export interface IReporter {
    subscribe(tasks: Observable<TaskEvent>, complete: () => void): void;
    unsubscribe(): void;
    next(value: TaskEvent): void
    log(message: string): void;
}

export abstract class Reporter implements IReporter {
    private _subscription: Subscription;
    private _startTime: number;
    private _success: boolean = true;
    private _exitCode: number;
    private _notifyComplete: (err?: any) => void;
    
    constructor(private _logFilter?: Array<LogFilterFunction>) {
    }

    subscribe(tasks: Observable<TaskEvent>, complete: (err?: any) => void): void {
        this.logStart();
        this._notifyComplete = complete;
        this._startTime = Date.now();
        this._subscription = tasks.subscribe(
            event => this.next(event),
            error => this.error(error),
            () => this.complete()
        );
    }

    unsubscribe(): void {
        this._subscription.unsubscribe();
    }

    next(value: TaskEvent): void {
        if (value instanceof TaskData) {
            this.logData(value);
        } else if (value instanceof TaskStart) {
            this.logTaskStart(value);
        } else if (value instanceof TaskDone) {
            this.logTaskDone(value);
        } else if (value instanceof TaskArtifact) {
            this.logArtifact(value);
        }
    }

    private error(error: any): void {
        let exitCode: number;

        if (error instanceof TaskError) {
            exitCode = error.exitCode;
            let runTimeMs = Math.floor(Date.now() - this._startTime);
            this.logError(error, runTimeMs);
        } else {
            exitCode = ERROR_EXIT_CODE;
            this.logUnhandledError(error);
        }
        this._notifyComplete(error);
        process.exitCode = exitCode;
    }

    private complete(): void {
        let runTimeMs = Math.floor(Date.now() - this._startTime);
        this.logComplete(runTimeMs);
        this._notifyComplete();
    }

    log(message: string): void {
        this.logData(new TaskData({}, message));
    }

    protected abstract logStart(): void;
    protected abstract logData(event: TaskData): void;
    protected abstract logTaskStart(event: TaskStart): void;
    protected abstract logTaskDone(event: TaskDone): void;
    protected abstract logError(error: TaskError, runTimeMs: number): void;
    protected abstract logUnhandledError(error: any): void;
    protected abstract logArtifact(event: TaskArtifact): void;
    protected abstract logComplete(runTimeMs: number): void;
    
    // return false to filter out message, or a string to override output
    protected filterMessage(message: string, reporter: string, logLevel: TaskDataLogLevel): string | null {
        if (!this._logFilter || !this._logFilter.length)
            return message;
        let filteredMessage: string | null = message;
        this._logFilter.forEach(filterFunc => {
            if (filteredMessage === null)
                return;
            let filterResult = filterFunc(filteredMessage, reporter, logLevel);
            if (!filterResult) {
                filteredMessage = null;
            } else if (typeof filterResult === 'string') {
                filteredMessage = filterResult;
            }
        });
        return filteredMessage;
    }
}
