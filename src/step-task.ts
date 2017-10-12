import { Observable } from 'rxjs/Observable';
import { Subscriber } from 'rxjs/Subscriber';

import { IBuildState, IBuildStore } from './build-store';
import { ITask, ITaskAction } from './task';
import { TaskArtifact, TaskData, TaskDataLogLevel, TaskDone, TaskError, TaskEvent, TaskStart } from './task-event';

export class StepTask implements ITaskAction {
    private _startTime: Date = new Date();

    constructor(private _task: ITask, private _observer: Subscriber<TaskEvent>, private _store: IBuildStore) {
        this._observer.next(new TaskStart(this._task, this._startTime));
    }

    static create(next: (task: ITaskAction) => string | void, task: ITask, store: IBuildStore): Observable<TaskEvent> {
        return new Observable<TaskEvent>((observer) => {
            let action = new StepTask(task, observer, store);
            try {
                let result = next(action);
                if (typeof result === 'string')
                    action.done(result);
            } catch (error) {
                action.setState({ success: false });
                action.error('An error occurred in step task', error);
            }
        });
    }

    log(message: string): void {
        this._observer.next(new TaskData(this._task, message));
    }

    artifact(path: string): void {
        this._observer.next(new TaskArtifact(this._task, path));
    }

    info(message: string): void {
        this._observer.next(new TaskData(this._task, message, TaskDataLogLevel.info));
    }

    warn(message: string): void {
        this._observer.next(new TaskData(this._task, message, TaskDataLogLevel.warn));
    }

    buildStatus(message: string): void {
        this._observer.next(new TaskData(this._task, message, TaskDataLogLevel.buildStatus));
    }

    error(message: string, error?: Error): void {
        this.setState({ success: false });
        this._observer.error(new TaskError(this._task, this._startTime, message, error));
    }

    done(message?: string): void {
        if (message && message.length > 0)
            this.log(message);
        this._observer.next(new TaskDone(this._task, this._startTime));
        this._observer.complete();
    }

    select<T>(selector: (state: IBuildState) => T): T {
        return this._store.select(selector);
    }

    setState(state: IBuildState): void {
        this._store.setState(state);
    }
}
