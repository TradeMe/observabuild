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
