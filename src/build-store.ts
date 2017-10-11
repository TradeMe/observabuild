import { EventFilterFunction } from './task';
import { isRunningInTeamCity } from './teamcity-reporter';

export interface IBuildState {
    // halt the build if it runs longer than this. set to 0 to disable
    timeoutSeconds?: number;
    // override automatic teamcity reporter detection
    teamcity?: boolean;
    // time to wait after a stderr before stopping the build.
    // allows multiple errors to be output before fail. set to 0 to disable
    errorTimeoutMs?: number;
    // filter .run() event output globally
    // return false to prevent message from being output, a string to rewrite message contents, or throw to stop build
    eventFilter?: Array<EventFilterFunction>;
    // true if the build is currently successful. set to false if a step fails.
    success?: boolean;
    // user defined state
    [propName: string]: any;
}

export const initialState = {
    timeoutSeconds: 60 * 60, // by default we halt the build after 1 hour ...
    teamcity: isRunningInTeamCity(),
    errorTimeoutMs: 1000,
    eventFilter: [],
    success: true
};

export interface IBuildStore {
    select<T>(selector: (state: IBuildState) => T): T;
    conditional(selector: (state: IBuildState) => boolean): boolean;
    setState(state: IBuildState): void;
}

// basic store which allows persisting state between build steps
export class BuildStore implements IBuildStore {
    constructor(private _state: IBuildState) {}

    select<T>(selector: (state: IBuildState) => T): T {
        return selector(this._state);
    }

    conditional(selector: (state: IBuildState) => boolean): boolean {
        return selector(this._state);
    }

    setState(state: IBuildState): void {
        this._state = {
            ...this._state,
            ...state
        };
    }
}
