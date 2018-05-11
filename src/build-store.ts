export type EventFilterFunction = (message: string) => boolean | string;

export interface IBuildState {
    // halt the build if it runs longer than this. set to 0 to disable
    timeoutSeconds?: number;

    // specify the reporter to use.
    // by default the build autodetects if we are running in teamcity, otherwise uses console
    reporter?: 'console' | 'teamcity';

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

    // additional user defined state
    [propName: string]: any;
}

export const initialState = <IBuildState> {
    timeoutSeconds: 60 * 60, // by default we halt the build after 1 hour ...
    prefixLimit: 7,
    errorTimeoutMs: 1000,
    eventFilter: [],
    success: true
};

export interface IBuildStore {
    select<T> (selector: (state: IBuildState) => T): T;
    conditional (selector: (state: IBuildState) => boolean): boolean;
    setState (state: IBuildState): void;
}

// basic store which allows persisting state between build steps
export class BuildStore implements IBuildStore {
    constructor (private _state: IBuildState) {}

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
    }
}
