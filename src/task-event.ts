import { ITask } from './task';

export enum TaskDataLogLevel {
    default,
    info,
    warn,
    error,
    buildStatus
}

export class TaskData {
    constructor(
        public task: ITask,
        public data: string,
        public logLevel: TaskDataLogLevel = TaskDataLogLevel.default,
        public error?: Error
    ) {}
}

export class TaskStart {
    constructor(
        public task: ITask,
        public startTime: Date,
        public commandLine?: string
    ) {}
}

export class TaskDone {
    public finishTime: Date;
    public runTimeMs: number;
    
    constructor(
        public task: ITask,
        startTime: Date
    ) {
        this.finishTime = new Date();
        this.runTimeMs = Math.floor(this.finishTime.getTime() - startTime.getTime());
    }
}

export const ERROR_EXIT_CODE = 1;

export class TaskError extends TaskDone {
    constructor(
        task: ITask,
        startTime: Date,
        public message: string,
        public error?: Error,
        public exitCode: number = ERROR_EXIT_CODE
    ) {
        super(task, startTime);
    }
}

export class TaskArtifact {
    constructor(
        public task: ITask,
        public path: string
    ) { }
}

export type TaskEvent = TaskData | TaskStart | TaskDone | TaskArtifact;
