import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/concat';
import 'rxjs/add/observable/merge';

import { TaskEvent } from './task-event';

export class TaskList {
    private _tasks: Observable<TaskEvent>[] = [];

    protected add(task: Observable<TaskEvent>) {
        this._tasks.push(task);
    }

    protected empty(): boolean {
        return this._tasks.length === 0;
    }

    protected asSync(): Observable<TaskEvent> {
        return Observable.concat<TaskEvent>(...this._tasks);
    }

    protected asAsync(): Observable<TaskEvent> {
        return Observable.merge<TaskEvent>(...this._tasks);
    }
}
