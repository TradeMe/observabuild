import { BehaviorSubject, Observable } from 'rxjs';

export type EventFilterFunction = (message: string) => boolean | string;

export interface IBuildState {
    // halt the build if it runs longer than this. set to 0 to disable
    timeoutSeconds?: number;

    // specify the reporter to use.
    // by default the build autodetects if we are running in teamcity, otherwise uses progress
    // use console by passing --verbose on command line
    reporter?: 'console' | 'progress' | 'teamcity';

    // reporting prefix limit
    prefixLimit?: number;

    // time to wait after a stderr before stopping the build.
    // allows multiple errors to be output before fail. set to 0 to disable
    errorTimeoutMs?: number;

    // global filter for .run() event output
    // return false to prevent message from being output, a string to rewrite message contents, or throw to stop build
    eventFilter?: Array<EventFilterFunction>;

    // success is true if no prior build steps have failed
    success?: boolean;

    // set default current working directory for run tasks
    cwd?: string;

    // default teamcity flow id
    flowId?: string;

    // additional user defined state
    [propName: string]: any;
}

export const initialState = <IBuildState> {
    timeoutSeconds: 60 * 60, // by default we halt the build after 1 hour ...
    prefixLimit: 7,
    errorTimeoutMs: 1000,
    eventFilter: [],
    success: true,
    _nextTaskId: 1
};

export interface IBuildStore {
    select<T> (selector: (state: IBuildState) => T): T;
    conditional (selector: (state: IBuildState) => boolean): boolean;
    setState (state: IBuildState): void;
    createTaskId (): number;
}

// basic store which allows persisting state between build steps
export class BuildStore implements IBuildStore {
    private _state$: BehaviorSubject<IBuildState>;
    private _parentState: IBuildState | undefined;

    constructor (private _state: IBuildState) {
        this._state$ = new BehaviorSubject<IBuildState>(this._state);
    }

    public select<T> (selector: (state: IBuildState) => T): T {
        return selector(this._state);
    }

    public conditional (selector: (state: IBuildState) => boolean): boolean {
        return selector(this._state);
    }

    public setState (state: IBuildState): void {
        this._state = {
            ...this._state,
            ...state
        };
        if (this._parentState) {
            Object.setPrototypeOf(this._state, this._parentState);
        }
        this._state$.next(this._state);
    }

    public link (store: IBuildStore): void {
        const buildStore = store as BuildStore;
        if (!buildStore) {
            return;
        }
        this._state._nextTaskId = buildStore.createTaskId() * 1000;
        buildStore._state$.subscribe((state: IBuildState) => {
            this._parentState = state;
            Object.setPrototypeOf(this._state, this._parentState);
        });
    }

    public createTaskId (): number {
        const nextId = this._state._nextTaskId;
        this.setState({ _nextTaskId: nextId + 1 });
        return nextId;
    }
}
