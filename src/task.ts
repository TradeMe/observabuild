import { SpawnOptions } from 'child_process';

import { IBuildState, IStore } from './store';

export interface ITaskStatusMessage {
    start?: string;
    success?: string;
    fail?: string;
}

export interface ITask {
    name?: string;
    prefix?: string;
    statusMessage?: ITaskStatusMessage;
    flowId?: string;
}

export interface ITaskAction {
    log: (message: string) => void,
    artifact: (path: string) => void,
    warn: (message: string) => void,
    error: (message: string, error?: Error) => void,
    done: (message?: string) => void,
    select<T>(selector: (state: IBuildState) => T): T;  
    setState(state: IBuildState): void;
    securityCheck(projectPath: string): void;
    publishArtifact(srcPath: string, zipPath: string): void;
    copyFolder(srcPath: string, destPath: string | undefined): void;
}

export interface IDoTask extends ITask {
    next: (task: ITaskAction) => string | void;
}

export type EventFilterFunction = (message: string) => boolean | string;

export interface IRunTask extends ITask {
    command: string;
    args?: (string | ((state: IBuildState) => string))[];
    options?: SpawnOptions;
    memoryLimitMb?: number;
    haltOnErrors?: boolean;
    redirectStdErr?: boolean;
    response?: (data: string, store: IStore) => string | void;
    eventFilter?: Array<EventFilterFunction>;
}
