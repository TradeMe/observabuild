import chalk from 'chalk';
import * as logSymbols from 'log-symbols';
import { ITask } from '../task';
import { TaskArtifact, TaskData, TaskDataLogLevel, TaskDone, TaskError, TaskStart } from '../task-event';
import { Reporter } from './reporter';

/* tslint:disable:no-console */

export class ConsoleReporter extends Reporter {
    constructor (private _prefixLimit: number) {
        super();
        if (this._prefixLimit < 1) {
            this._prefixLimit = 1;
        }
    }

    protected logStart (): void {
        console.log('Build started');
    }

    protected logData (event: TaskData): void {
        // trim trailing whitespace
        const message = (event.data || '').replace(/[\s\r\n]+$/, '');
        const prefix = this.addPrefix(event.task);
        switch (event.logLevel) {
            case TaskDataLogLevel.info:
                console.log(prefix, logSymbols.info, message);
                break;
            case TaskDataLogLevel.warn:
                console.warn(prefix, logSymbols.warning, chalk.yellow(message));
                break;
            case TaskDataLogLevel.error:
                console.error(prefix, logSymbols.error, chalk.red(message));
                if (event.error) {
                    console.error(prefix, logSymbols.error, chalk.red(event.error.toString()));
                }
                break;
            case TaskDataLogLevel.buildStatus:
                console.log(chalk.green(message));
                break;
            default:
                // add prefix to each line of output
                message.split('\n').map(line => console.log(prefix, line));
        }
    }

    protected logTaskStart (event: TaskStart): void {
        if (event.task.statusMessage && event.task.statusMessage.start) {
            console.log(chalk.white(`${this.addPrefix(event.task)}${event.task.statusMessage.start}`));
        } else if (event.task.name) {
            const formatCommand = event.commandLine ? `: ${event.commandLine}` : '';
            console.log(chalk.white(this.addPrefix(event.task, `${event.task.name}${formatCommand}`)));
        }
    }

    protected logTaskDone (event: TaskDone): void {
        if (event.task.statusMessage && event.task.statusMessage.success) {
            console.log(this.addPrefix(event.task), logSymbols.success, chalk.green(event.task.statusMessage.success));
        } else if (event.task.name) {
            // report run time if run was longer than 10 seconds
            const runTime = event.runTimeMs > 10000 ? ` in ${event.runTimeMs}ms` : '';
            console.log(this.addPrefix(event.task), logSymbols.success, chalk.green(`${event.task.name} completed${runTime}`));
        }
    }

    protected logError (error: TaskError, runTimeMs: number): void {
        console.error(this.addPrefix(error.task), logSymbols.error, chalk.red(error.message));
        if (error.error) {
            console.error(this.addPrefix(error.task), logSymbols.error, chalk.red(error.error.toString()));
        }
        if (error.task.statusMessage && error.task.statusMessage.fail) {
            console.error(this.addPrefix(error.task), logSymbols.error, chalk.red(error.task.statusMessage.fail));
        } else if (error.task.name) {
            console.error(this.addPrefix(error.task), logSymbols.error, chalk.red(`${error.task.name} failed after ${error.runTimeMs}ms`));
        }
    }

    protected logUnhandledError (error: any): void {
        console.error(logSymbols.error, chalk.red(error));
    }

    protected logArtifact (event: TaskArtifact): void {
        console.log(this.addPrefix(event.task), logSymbols.info, chalk.yellow(`Publish artifact [${event.path}]`));
    }

    protected logComplete (runTimeMs: number): void {
        const runTime = (runTimeMs / 1000).toFixed(2);
        console.log(logSymbols.success, chalk.green(`Build complete in ${runTime}s`));
    }

    protected logTimeout (message: string): void {
        console.error(logSymbols.error, chalk.red(message));
    }

    private addPrefix (task: ITask, message?: string): string {
        if (!task.prefix) {
            return message || '';
        }
        const prefix = `${task.prefix}:      `.substring(0, this._prefixLimit);
        return `${chalk.gray(prefix)}${message || ''}`;
    }
}
