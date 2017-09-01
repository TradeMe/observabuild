const chalk = require('chalk');
const logSymbols = require('log-symbols');

import { ITask } from './task';
import { Reporter } from './reporter';
import { TaskArtifact, TaskData, TaskDataLogLevel, TaskDone, TaskError, TaskStart } from './task-event';

export class ConsoleReporter extends Reporter {
    logStart(): void {
        console.log('Build started');
    }

    logData(event: TaskData): void {
        // trim trailing whitespace
        let message = (event.data || '').replace(/[\s\r\n]+$/, '');
        switch (event.logLevel)
        {
            case TaskDataLogLevel.info:
                console.log(this.addPrefix(event.task), logSymbols.info, message);
                break;
            case TaskDataLogLevel.warn:
                console.warn(this.addPrefix(event.task), logSymbols.warning, chalk.yellow(message));
                break;
            case TaskDataLogLevel.error:
                console.error(this.addPrefix(event.task), logSymbols.error, chalk.red(message));
                if (event.error)
                    console.error(this.addPrefix(event.task), logSymbols.error, chalk.red(event.error));
                break;
            default:
                console.log(this.addPrefix(event.task, message));
        }
    }

    logTaskStart(event: TaskStart): void {
        if (event.task.statusMessage && event.task.statusMessage.start) {
            console.log(chalk.white(`${this.addPrefix(event.task)}${event.task.statusMessage.start}`));
        } else if (event.task.name) {
            let formatCommand = event.commandLine ? `: ${event.commandLine}` : '';
            console.log(chalk.white(this.addPrefix(event.task, `${event.task.name}${formatCommand}`)));
        }
    }

    logTaskDone(event: TaskDone): void {
        if (event.task.statusMessage && event.task.statusMessage.success) {
            console.log(this.addPrefix(event.task), logSymbols.success, chalk.green(event.task.statusMessage.success));
        } else if (event.task.name) {
            console.log(this.addPrefix(event.task), logSymbols.success, chalk.green(`${event.task.name} completed`));
            // console.log(this.addPrefix(event.task), logSymbols.success, chalk.green(`${event.task.name} completed in ${event.runTimeMs}ms`));
        }
    }

    logError(error: TaskError, runTimeMs: number): void {
        console.error(this.addPrefix(error.task), logSymbols.error, chalk.red(error.message));
        if (error.error)
            console.error(this.addPrefix(error.task), logSymbols.error, chalk.red(error.error));

        if (error.task.statusMessage && error.task.statusMessage.fail) {
            console.error(this.addPrefix(error.task), logSymbols.error, chalk.red(error.task.statusMessage.fail));
        } else if (error.task.name) {
            console.error(this.addPrefix(error.task), logSymbols.error, chalk.red(`${error.task.name} failed after ${error.runTimeMs}ms`));
        }
    }

    logUnhandledError(error: any): void {
        console.error(logSymbols.error, chalk.red(error));
    }

    logArtifact(event: TaskArtifact): void {
        console.log(logSymbols.info, chalk.yellow(this.addPrefix(event.task, `${event.task.name} publish artifact [${event.path}]`)));
    }

    logComplete(runTimeMs: number): void {
        let runTime = (runTimeMs / 1000).toFixed(2);
        console.log(logSymbols.success, chalk.green(`Build complete in ${runTime}s`));
    }

    private addPrefix(task: ITask, message?: string): string {
        if (!task.prefix)
            return message || '';
        let prefix = `${task.prefix}:      `.substring(0, 7);
        return `${chalk.gray(prefix)}${message || ''}`;
    }
}
