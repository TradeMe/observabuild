import { Observable } from 'rxjs/Observable';
import { Subscriber } from 'rxjs/Subscriber';

import { IBuildState, IBuildStore } from './build-store';
import { IDoTask, IIgnoreSecurityCheck, ITaskAction } from './task';
import { TaskArtifact, TaskData, TaskDataLogLevel, TaskDone, TaskError, TaskEvent, TaskStart } from './task-event';

const archiver = require('archiver');
const chalk = require('chalk');
const dedent = require('dedent');
const fs = require('fs-extra');
const { ncp } = require('ncp');
const nsp = require('nsp');
const path = require('path');

export class DoTask implements ITaskAction {
    private _startTime: Date = new Date();

    constructor(private _task: IDoTask, private _observer: Subscriber<TaskEvent>, private _store: IBuildStore) {
        this._observer.next(new TaskStart(this._task, this._startTime));
    }

    static create(task: IDoTask, store: IBuildStore): Observable<TaskEvent> {
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

    buildStatus(message: string): void {
        this._observer.next(new TaskData(this._task, message, TaskDataLogLevel.buildStatus));
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

    securityCheck(projectPath: string, ignoreList?: Array<IIgnoreSecurityCheck>): void {
        function formatSecurityVulnerability(vuln: any) {
            return chalk.white(dedent(`
                Dependency ${vuln.module}@${vuln.version} has a security vulnerability
                
                ${vuln.title}
                
                ${vuln.overview}
                
                ${vuln.recommendation}
                
                ${chalk.yellow(`To fix this error edit ./package.json and update the "${ vuln.path[1] }" dependency to a patched version.`)}
    
                Advisory: ${vuln.advisory}
                Vulnerable versions: ${vuln.vulnerable_versions}
                Patched versions: ${vuln.patched_versions}
                Dependency path: ${vuln.path.join(' => ')}
            `));
        }

        const options = {
            package: path.join(projectPath, './package.json')
        };
        nsp.check(options, (err: any, securityVulnerabilities: any) => {
            if (err) {
                this.warn(`Warning! the Node Security Project check has failed. This probably means their API is down`);
                this.done(err.toString());
            } else {
                securityVulnerabilities = securityVulnerabilities || [];
                if (securityVulnerabilities.length === 0) {
                    this.done('Node Security found no dependencies with known vulnerabilities :)');
                    return;
                }
                if (ignoreList && ignoreList.length > 0) {
                    // allow ignoring of nsp check vulnerabilities with user, expiry and reason
                    // this should only be used for devDependencies, and until module fix is deployed
                    securityVulnerabilities = securityVulnerabilities.filter((vuln: any) => {
                        let ignoreVuln = ignoreList.filter(i => i.module === vuln.module && i.version === vuln.version && i.expiry.getTime() >= Date.now());
                        if (ignoreVuln.length === 0)
                            return true;
                        let [ignore] = ignoreVuln;
                        let ignoreMessage = chalk.white(dedent(`
                            ${ignore.user} has disabled security check for ${ignore.module}@${ignore.version}

                            ${ignore.reason}
                        `));
                        this.warn(`${chalk.yellow('WARNING:')} ${ignoreMessage}`);
                        this.warn(`${chalk.yellow('WARNING:')} ${formatSecurityVulnerability(vuln)}`);
                        return false;
                    });
                }
                if (securityVulnerabilities.length > 0) {
                    let errors = securityVulnerabilities.reduce((result: string, vuln: any) => `${result}${chalk.red('ERROR:')} ${formatSecurityVulnerability(vuln)}`, '');
                    this.error(`ERROR! One of our dependencies has a known security vulnerability!\n${errors}`);
                } else {
                    this.done();
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
