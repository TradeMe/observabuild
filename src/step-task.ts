import { Observable, Subscriber } from 'rxjs';

import { IBuildContext } from './build';
import { IBuildState, IBuildStore } from './build-store';
import { ITask } from './task';
import { TaskArtifact, TaskData, TaskDataLogLevel, TaskDone, TaskError, TaskEvent, TaskOperator, TaskStart } from './task-event';

export interface ITaskAction {
    log (message: string): void;
    artifact (path: string): void;
    info (message: string): void;
    warn (message: string): void;
    buildStatus (message: string): void;
    error (message: string, error?: Error): void;
    done (message?: string): void;
    select<T> (selector: (state: IBuildState) => T): T;
    setState (state: IBuildState): void;
}

export class StepTask implements ITaskAction {
    public static create = (next: (task: ITaskAction) => string | void, task: ITask | undefined, async: boolean) => (context: IBuildContext): TaskOperator => {
        return new Observable<TaskEvent>((subscriber: Subscriber<TaskEvent>) => {
            const stepTask = {
                ...task || {},
                flowId: (task ? task.flowId : undefined) || context.select(state => state.flowId)
            };
            const action = new StepTask(stepTask, subscriber, context.store);
            try {
                const result = next(action);
                if (!async) {
                    action.done(result || undefined);
                }
            } catch (error) {
                action.setState({ success: false });
                action.error('An error occurred in step task', error);
            }
        });
    }

    private _startTime: Date = new Date();

    constructor (private _task: ITask, private _subscriber: Subscriber<TaskEvent>, private _store: IBuildStore) {
        this._task.taskId = this._store.createTaskId();
        this._subscriber.next(new TaskStart(this._task, this._startTime));
    }

    public log (message: string): void {
        this._subscriber.next(new TaskData(this._task, message));
    }

    public artifact (path: string): void {
        this._subscriber.next(new TaskArtifact(this._task, path));
    }

    public info (message: string): void {
        this._subscriber.next(new TaskData(this._task, message, TaskDataLogLevel.info));
    }

    public warn (message: string): void {
        this._subscriber.next(new TaskData(this._task, message, TaskDataLogLevel.warn));
    }

    public buildStatus (message: string): void {
        this._subscriber.next(new TaskData(this._task, message, TaskDataLogLevel.buildStatus));
    }

    public error (message: string, error?: Error): void {
        this.setState({ success: false });
        this._subscriber.error(new TaskError(this._task, this._startTime, message, error));
    }

    public done (message?: string): void {
        if (this._subscriber.closed) {
            return;
        }
        if (message && message.length > 0) {
            this.log(message);
        }
        this._subscriber.next(new TaskDone(this._task, this._startTime));
        this._subscriber.complete();
    }

    public select<T> (selector: (state: IBuildState) => T): T {
        return this._store.select(selector);
    }

    public setState (state: IBuildState): void {
        this._store.setState(state);
    }
}
