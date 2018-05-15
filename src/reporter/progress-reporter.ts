import chalk from 'chalk';
// tslint:disable-next-line:no-var-requires
const elegantSpinner = require('elegant-spinner');
import * as figures from 'figures';
import * as logSymbols from 'log-symbols';
import * as logUpdate from 'log-update';
import { ITask } from '../task';
import { TaskArtifact, TaskData, TaskDataLogLevel, TaskDone, TaskError, TaskStart } from '../task-event';
import { Reporter } from './reporter';

/* tslint:disable:no-console */

interface IProgressTask {
    taskId: number;
    task: ITask;
    description: string;
    event: TaskData;
}

export class ProgressReporter extends Reporter {
    private _spinner = elegantSpinner();
    private _updating = false;
    private _tasks: Array<IProgressTask> = [];
    private _timerId: NodeJS.Timer | undefined;

    constructor (private _prefixLimit: number) {
        super();
        if (this._prefixLimit < 1) {
            this._prefixLimit = 1;
        }
    }

    protected logStart (): void {
        this.persistLog(chalk.white('Build started'));
        this.startUpdate();
    }

    protected logData (event: TaskData): void {
        const progressTask = this._tasks.find(pt => pt.taskId === event.task.taskId);
        if (!progressTask) {
            return;
        }
        progressTask.event = event;

        // trim trailing whitespace
        const message = (event.data || '').replace(/[\s\r\n]+$/, '');
        switch (event.logLevel) {
            case TaskDataLogLevel.error:
                const prefix = this.addPrefix(event.task);
                this.persistError(prefix, logSymbols.error, chalk.red(message));
                if (event.error) {
                    this.persistError(prefix, logSymbols.error, chalk.red(event.error.toString()));
                }
                break;
            case TaskDataLogLevel.buildStatus:
                this.persistLog(chalk.green(message));
                break;
        }
    }

    protected logTaskStart (event: TaskStart): void {
        let description: string | undefined;
        if (event.task.statusMessage && event.task.statusMessage.start) {
            description = chalk.white(event.task.statusMessage.start);
        } else if (event.task.name) {
            const formatCommand = event.commandLine ? `: ${event.commandLine}` : '';
            description = `${chalk.white(event.task.name)}${chalk.gray(formatCommand)}`;
        } else {
            description = 'Build';
        }
        this._tasks.push(<IProgressTask> {
            taskId: event.task.taskId,
            task: event.task,
            description
        });
    }

    protected logTaskDone (event: TaskDone): void {
        this._tasks = this._tasks.filter(pt => pt.taskId !== event.task.taskId);
        if (event.task.statusMessage && event.task.statusMessage.success) {
            this.persistLog(logSymbols.success, chalk.white(event.task.statusMessage.success));
        } else if (event.task.name) {
            this.persistLog(logSymbols.success, chalk.white(event.task.name));
        }
    }

    protected logError (error: TaskError, runTimeMs: number): void {
        this._tasks = [];
        this.stopUpdate();
        const prefix = this.addPrefix(error.task);
        this.persistError(prefix, logSymbols.error, chalk.red(error.message));
        if (error.error) {
            this.persistError(prefix, logSymbols.error, chalk.red(error.error.toString()));
        }
        if (error.task.statusMessage && error.task.statusMessage.fail) {
            this.persistError(prefix, logSymbols.error, chalk.red(error.task.statusMessage.fail));
        } else if (error.task.name) {
            this.persistError(prefix, logSymbols.error, chalk.red(`${error.task.name} failed after ${error.runTimeMs}ms`));
        }
    }

    protected logUnhandledError (error: any): void {
        this.persistError(logSymbols.error, chalk.red(error));
    }

    protected logArtifact (event: TaskArtifact): void {
        this.persistLog(logSymbols.info, chalk.yellow(`Publish artifact ${event.path}`));
    }

    protected logComplete (runTimeMs: number): void {
        this.stopUpdate();
        const runTime = (runTimeMs / 1000).toFixed(2);
        this.persistLog(logSymbols.success, chalk.green(`Build complete in ${runTime}s`));
    }

    protected logTimeout (message: string): void {
        this.persistError(logSymbols.error, chalk.red(message));
    }

    private startUpdate (): void {
        this._timerId = setInterval(() => this.update(), 100);
    }

    private stopUpdate (): void {
        if (this._timerId) {
            clearInterval(this._timerId);
            this._timerId = undefined;
        }
    }

    private update (): void {
        if (this._updating) {
            return;
        }
        this._updating = true;
        let text: string = '';
        const spinner = this._spinner();
        for (let progessTask of this._tasks) {
            text += `${spinner} ${progessTask.description}\n`;
            let data: string | undefined = progessTask.event ? this.updateData(progessTask.event) : undefined;
            if (data) {
                text += `${data}\n`;
            }
        }
        logUpdate(text);
        this._updating = false;
    }

    private updateData (event: TaskData): string {
        let icon: string | undefined = figures.pointer;
        let color: ((...text: Array<string>) => string) = chalk.white;

        switch (event.logLevel) {
            case TaskDataLogLevel.info:
                icon = logSymbols.info;
                break;
            case TaskDataLogLevel.warn:
                icon = logSymbols.warning;
                color = chalk.yellow;
                break;
            case TaskDataLogLevel.error:
                icon = logSymbols.error;
                color = chalk.red;
                break;
            case TaskDataLogLevel.buildStatus:
                color = chalk.green;
                break;
        }
        const data = (event.data || '').replace(/[\s\r\n]+$/, ''); // trim trailing whitespace
        const lines = data.split('\n').filter(line => line && line.trim().length > 0);
        const message = lines.length > 0 ? lines[0] : '';
        return ` ${icon} ${color(message)}`;
    }

    private persistLog (...args: Array<any>): void {
        logUpdate.clear();
        console.log(...args);
    }

    private persistError (...args: Array<any>): void {
        logUpdate.clear();
        console.error(...args);
    }

    private addPrefix (task: ITask, message?: string): string {
        if (!task.prefix) {
            return message || '';
        }
        const prefix = `${task.prefix}:      `.substring(0, this._prefixLimit);
        return `${chalk.gray(prefix)}${message || ''}`;
    }
}
