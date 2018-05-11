import { Subject } from 'rxjs';
import { BuildStore, IBuildState, IBuildStore, initialState } from './build-store';
import { serial } from './operators';
import { createReporter } from './reporter';
import { TaskEvent, TaskOperator } from './task-event';

export interface IBuildContext {
    store: IBuildStore;
    close$: Subject<TaskEvent>;
    select<T> (selector: (state: IBuildState) => T): T;
    setState (state: IBuildState): void;
}

export class Build {
    private _context: IBuildContext;
    private _store: IBuildStore;

    constructor (buildState?: IBuildState) {
        this._store = new BuildStore({
            ...initialState,
            ...buildState
        });
        this._context = <IBuildContext> {
            store: this._store,
            select: <T>(selector: (state: IBuildState) => T): T => this._store.select(selector),
            setState: (state: IBuildState): void => this._store.setState(state),
            close$: new Subject<TaskEvent>()
        };
    }

    public start (...operations: Array<(context: IBuildContext) => TaskOperator>): void {
        let reporter = createReporter(this._store.select(state => state.reporter), this._store.select(state => state.prefixLimit || 7));

        let timeoutSeconds = this._store.select(state => state.timeoutSeconds || 0);
        let timeoutId: NodeJS.Timer | undefined;
        if (timeoutSeconds > 0) {
            timeoutId = setTimeout(() => {
                timeoutId = undefined;
                reporter.timeout(`Build timeout after ${timeoutSeconds} seconds. stopping build.`);
                reporter.unsubscribe();
                process.exitCode = 1;
            }, timeoutSeconds * 1000);
        }

        let tasks = serial(...operations)(this._context);

        // the build will start when the reporter subscribes
        reporter.subscribe(tasks, (err?: any) => {
            // on complete clear timeout if it was set. this allows main process to exit
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        });

        // if the main TaskEvent observable stream errors or is unsubscribed, the remaining events
        // will then be dispatched to closeSubject.
        this._context.close$.subscribe(event => reporter.next(event));

        process.on('SIGTERM', () => {
            reporter.log('SIGTERM received. stopping build');
            reporter.unsubscribe();
            process.exitCode = 1;
        });
    }
}
