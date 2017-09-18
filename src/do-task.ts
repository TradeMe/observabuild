import { Observable } from 'rxjs/Observable';
import { Subscriber } from 'rxjs/Subscriber';

import { IBuildState, IStore } from './store';
import { IDoTask, ITaskAction } from './task';
import { TaskArtifact, TaskData, TaskDataLogLevel, TaskDone, TaskError, TaskEvent, TaskStart } from './task-event';

const archiver = require('archiver');
const dedent = require('dedent');
const fs = require('fs-extra');
const { ncp } = require('ncp');
const nsp = require('nsp');
const path = require('path');

export class DoTask implements ITaskAction {
    private _startTime: Date = new Date();

    constructor(private _task: IDoTask, private _observer: Subscriber<TaskEvent>, private _store: IStore) {
        this._observer.next(new TaskStart(this._task, this._startTime));
    }

    static create(task: IDoTask, store: IStore): Observable<TaskEvent> {
        return new Observable<TaskEvent>((observer) => {
            let action = new DoTask(task, observer, store);
            try {
                let result = task.next(action);
                if (typeof result === 'string')
                    action.done(result);
            } catch (error) {
                action.setState({ success: false });
                action.error('An error occurred in do.next', error);
            }
        });
    }

    log(message: string): void {
        this._observer.next(new TaskData(this._task, message));
    }

    artifact(path: string): void {
        this._observer.next(new TaskArtifact(this._task, path));
    }

    info(message: string): void {
        this._observer.next(new TaskData(this._task, message, TaskDataLogLevel.info));
    }

    warn(message: string): void {
        this._observer.next(new TaskData(this._task, message, TaskDataLogLevel.warn));
    }

    error(message: string, error?: Error): void {
        this.setState({ success: false });
        this._observer.error(new TaskError(this._task, this._startTime, message, error));
    }

    done(message?: string): void {
        if (message && message.length > 0)
            this.log(message);
        this._observer.next(new TaskDone(this._task, this._startTime));
        this._observer.complete();
    }

    select<T>(selector: (state: IBuildState) => T): T {
        return this._store.select(selector);
    }

    setState(state: IBuildState): void {
        this._store.setState(state);
    }

    securityCheck(projectPath: string): void {
        const options = {
            package: path.join(projectPath, './package.json')
        };
        nsp.check(options, (err: any, securityVulnerabilities: any) => {
            if (err) {
                this.warn(`Warning! the Node Security Project check has failed. This probably means their API is down`);
                this.done(err.toString());
            } else {
                securityVulnerabilities = securityVulnerabilities || [];
                if (securityVulnerabilities.length) {
                    this.error(dedent(`
                        ERROR! One of our dependencies has a known security vulnerability!
                        NodeSecurityProject check has found matches: ${securityVulnerabilities.join('\r\n')}
                    `));
                } else {
                    this.done('Node Security found no dependencies with known vulnerabilities :)');
                }
            }
        });
    }

    publishArtifact(srcPath: string, zipPath: string): void {
        let archive = archiver('zip');
        archive.on('error', (err: any) => {
            this.error(`Failed to create report zip file: ${zipPath}`, err);
        });
        fs.ensureDirSync(path.dirname(zipPath));
        let output = fs.createWriteStream(zipPath);
        output.on('close', () => {
            this.artifact(zipPath);
            this.done();
        });
        archive.pipe(output);
        archive.directory(srcPath, '');
        archive.finalize();
    }
    
    copyFolder(srcPath: string, destPath: string | undefined): void {
        if (!destPath) {
            this.done('No destination path was specified so nothing was copied');
            return;
        }
        fs.ensureDirSync(destPath);
        let ncpOptions = {
            stopOnErr: true,
            limit: 16
        };
        ncp(srcPath, destPath, ncpOptions, (err: any) => {
            if (err) {
                this.error(`Error copying files to ${destPath}`, err);
            } else {
                this.done(`Files were copied to ${destPath}`);
            }
        });
    }
}
