import { ITask } from '../task';
import { TaskArtifact, TaskData, TaskDataLogLevel, TaskDone, TaskError, TaskStart } from '../task-event';
import { Reporter } from './reporter';
import { TeamCityLogger } from './teamcity-logger';

export function isRunningInTeamCity (): boolean {
    return ('TEAMCITY_VERSION' in process.env);
}

/* tslint:disable:no-console */

export class TeamCityReporter extends Reporter {
    private _logger: TeamCityLogger = new TeamCityLogger();

    protected logStart (): void {
        this._logger.message('Build started');
    }

    protected logData (event: TaskData): void {
        if (event.data.indexOf('##teamcity') !== -1) {
            console.log(event.data);
            return;
        }
        // trim trailing whitespace
        let message = (event.data || '').replace(/[\s\r\n]+$/, '');
        message = this.addPrefix(event.task, message);
        switch (event.logLevel) {
            case TaskDataLogLevel.warn:
                this._logger.warning(message, event.task.flowId);
                break;
            case TaskDataLogLevel.error:
                const errorDetails = event.error ? event.error.toString() : null;
                this._logger.error(message, errorDetails, event.task.flowId);
                break;
            case TaskDataLogLevel.buildStatus:
                this._logger.buildStatus(event.data);
                break;
            default:
                this._logger.message(message, event.task.flowId);
        }
    }

    protected logTaskStart (event: TaskStart): void {
        if (event.task.name) {
            this._logger.progress(event.task.name);
        }
        this.openBlock(event.task);
        if (event.task.statusMessage && event.task.statusMessage.start) {
            this._logger.message(event.task.statusMessage.start, event.task.flowId);
        } else if (event.task.name) {
            const formatCommand = event.commandLine ? `: ${event.commandLine}` : '';
            this._logger.message(this.addPrefix(event.task, `${event.task.name}${formatCommand}`), event.task.flowId);
        }
    }

    protected logTaskDone (event: TaskDone): void {
        if (event.task.statusMessage && event.task.statusMessage.success) {
            this._logger.message(event.task.statusMessage.success, event.task.flowId);
        } else if (event.task.name) {
            this._logger.message(this.addPrefix(event.task, `${event.task.name} completed in ${event.runTimeMs}ms`), event.task.flowId);
        }
        this.closeBlock(event.task);
    }

    protected logError (error: TaskError, runTimeMs: number): void {
        const message = error.message || '';
        if (error.message.indexOf('##teamcity') !== -1) {
            console.log(error.message);
        } else {
            // log error
            const errorDetails = error.error ? error.error.toString() : null;
            this._logger.error(this.addPrefix(error.task, message), errorDetails, error.task.flowId);
            // log task fail
            if (error.task.statusMessage && error.task.statusMessage.fail) {
                this._logger.message(error.task.statusMessage.fail, error.task.flowId);
            } else if (error.task.name) {
                this._logger.message(`${error.task.name} failed after ${error.runTimeMs}ms`, error.task.flowId);
            }
        }
        this.closeBlock(error.task);
        this._logger.buildProblem(`${error.task.name || error.task.prefix ||  'Build'} failed`);
    }

    protected logUnhandledError (error: any): void {
        if (typeof error === 'string' && error.indexOf('##teamcity') !== -1) {
            console.log(error);
            return;
        }
        this._logger.error('unhandled error', error ? error.toString() : null);
    }

    protected logArtifact (event: TaskArtifact): void {
        this._logger.publishArtifacts(event.path);
    }

    protected logComplete (runTimeMs: number): void {
        const runTime = (runTimeMs / 1000).toFixed(2);
        this._logger.message(`Build complete in ${runTime}s`);
    }

    protected logTimeout (message: string): void {
        this._logger.error(message, null);
        this._logger.buildProblem('Build timed out');
    }

    private openBlock (task: ITask): void {
        const blockName = task.prefix || task.name;
        if (blockName) {
            this._logger.blockOpened(blockName, task.name || task.prefix || '', task.flowId);
        }
    }

    private closeBlock (task: ITask): void {
        const blockName = task.prefix || task.name;
        if (blockName) {
            this._logger.blockClosed(blockName, task.flowId);
        }
    }

    private addPrefix (task: ITask, message: string): string {
        if (task.flowId) {
            return message; // ignore prefix if a flowId is specified as they perform the same function
        }
        return task.prefix ? `${task.prefix}: ${message || ''}` : message;
    }
}
