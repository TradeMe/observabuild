import { empty, Subject } from 'rxjs';
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
    private _store: BuildStore;
    private _isChildBuild: boolean;

    constructor (buildState?: IBuildState, parentModule?: NodeModule) {
        this._store = new BuildStore({
            ...initialState,
            ...buildState || {},
            ...this.getArgsState()
        });
        this._context = <IBuildContext> {
            store: this._store,
            select: <T>(selector: (state: IBuildState) => T): T => this._store.select(selector),
            setState: (state: IBuildState): void => this._store.setState(state),
            close$: new Subject<TaskEvent>()
        };
        this._isChildBuild = false;
        if (parentModule) {
            const operatorsPath = require.resolve('./operators');
            let parent: NodeModule | null = parentModule;
            while (parent) {
                if (parent.filename === operatorsPath) {
                    this._isChildBuild = true;
                    break;
                }
                parent = parent.parent;
            }
        }
    }

    public start (...operations: Array<(context: IBuildContext) => TaskOperator>): ((context: IBuildContext, state?: IBuildState) => TaskOperator) {
        if (this._isChildBuild) {
            return (context: IBuildContext, state?: IBuildState): TaskOperator => {
                this._store.link(context.store);
                const childContext = <IBuildContext> {
                    ...this._context,
                    close$: context.close$
                };
                if (state) {
                    this._store.setState(state);
                }
                return serial(...operations)(childContext);
            };
        }

        const reporter = createReporter(this._store);

        const timeoutSeconds = this._store.select(state => state.timeoutSeconds || 0);
        let timeoutId: NodeJS.Timer | undefined;
        if (timeoutSeconds > 0) {
            timeoutId = setTimeout(() => {
                timeoutId = undefined;
                reporter.timeout(`Build timeout after ${timeoutSeconds} seconds. stopping build.`);
                reporter.unsubscribe();
                process.exitCode = 1;
            }, timeoutSeconds * 1000);
        }

        const tasks = serial(...operations)(this._context);
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

        return (context: IBuildContext, state?: IBuildState) => empty();
    }

    private getArgsState (): IBuildState {
        let argsState: IBuildState = {};
        const args = process.argv.slice(2);
        for (const arg of args) {
            if (arg === '--verbose') {
                argsState.reporter = 'console';
            } else {
                let [name, value]: Array<string | undefined | boolean> = arg.replace(/^--/, '').split(/(=|:)/);
                if (name && name.length) {
                    if (!value) {
                        value = true;
                    } else {
                        value = value === 'true' ? true : value === 'false' ? false : value;
                    }
                    argsState[name.toLowerCase()] = value;
                }
            }
        }
        return argsState;
    }
}
