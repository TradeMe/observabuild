import { SpawnOptions } from 'child_process';

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
    securityCheck(projectPath: string): void;
    publishArtifact(srcPath: string, zipPath: string): void;
    copyFolder(srcPath: string, destPath: string | undefined): void;
}

export interface IDoTask extends ITask {
    next: (task: ITaskAction) => string | void;
}

export interface IRunTask extends ITask {
    command: string;
    args?: string[];
    options?: SpawnOptions;
    memoryLimitMb?: number;
    haltOnErrors?: boolean;
}
