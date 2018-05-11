import { Observable, Subscription } from 'rxjs';

import { ERROR_EXIT_CODE, TaskArtifact, TaskData, TaskDone, TaskError, TaskEvent, TaskStart } from '../task-event';

export interface IReporter {
    subscribe (tasks: Observable<TaskEvent>, complete: () => void): void;
    unsubscribe (): void;
    next (value: TaskEvent): void;
    log (message: string): void;
    timeout (message: string): void;
}

export abstract class Reporter implements IReporter {
    private _subscription!: Subscription;
    private _startTime!: number;
    private _notifyComplete!: (err?: any) => void;

    public subscribe (tasks: Observable<TaskEvent>, complete: (err?: any) => void): void {
        this.logStart();
        this._notifyComplete = complete;
        this._startTime = Date.now();
        this._subscription = tasks.subscribe(
            event => this.next(event),
            error => this.error(error),
            () => this.complete()
        );
    }

    public unsubscribe (): void {
        this._subscription.unsubscribe();
    }

    public next (value: TaskEvent): void {
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

    public log (message: string): void {
        this.logData(new TaskData({}, message));
    }

    public timeout (message: string): void {
        this.logTimeout(message);
    }

    protected abstract logStart (): void;
    protected abstract logData (event: TaskData): void;
    protected abstract logTaskStart (event: TaskStart): void;
    protected abstract logTaskDone (event: TaskDone): void;
    protected abstract logError (error: TaskError, runTimeMs: number): void;
    protected abstract logUnhandledError (error: any): void;
    protected abstract logArtifact (event: TaskArtifact): void;
    protected abstract logComplete (runTimeMs: number): void;
    protected abstract logTimeout (message: string): void;

    private error (error: any): void {
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

    private complete (): void {
        let runTimeMs = Math.floor(Date.now() - this._startTime);
        this.logComplete(runTimeMs);
        this._notifyComplete();
    }
}
