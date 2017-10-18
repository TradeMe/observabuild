import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/concat';
import 'rxjs/add/observable/if';
import 'rxjs/add/observable/merge';
import * as os from 'os';
import * as path from 'path';

import { IBuildContext } from './build';
import { TaskData, TaskEvent, TaskOperator } from './task-event';
import { RunTask } from './run-task';
import { StepTask } from './step-task';
import { IIgnoreSecurityCheck, IRunTask, ITask, ITaskAction } from './task';
import { IBuildState } from './build-store';

const IS_WINDOWS = os.platform().indexOf('win32') !== -1;
const CMD_EXT = IS_WINDOWS ? '.cmd' : '';

export const serial = (...operations: ((build: IBuildContext) => TaskOperator)[]) => (context: IBuildContext): TaskOperator => {
    return Observable.concat<TaskEvent>(...operations.map(task => task(context)));
};

export const parallel = (...operations: ((build: IBuildContext) => TaskOperator)[]) => (context: IBuildContext): TaskOperator => {
    return Observable.merge<TaskEvent>(...operations.map(task => task(context)));
};

export const step = (next: (task: ITaskAction) => string | void, task?: ITask) => (context: IBuildContext): TaskOperator => {
    return StepTask.create(next, task || {}, context.store);
};

export const run = (task: IRunTask) => (context: IBuildContext): TaskOperator => {
    let globalEventFilter = context.select(state => state.eventFilter);
    if (globalEventFilter && globalEventFilter.length)
        task.eventFilter = (task.eventFilter || []).concat(globalEventFilter);
    return RunTask.create(task, context.store, context.close$);
};

export const check = (condition: (state: IBuildState) => boolean, ifTask: (context: IBuildContext) => TaskOperator, elseTask?: (context: IBuildContext) => TaskOperator) => (context: IBuildContext): TaskOperator =>  {
    return !!elseTask
        ? Observable.if<TaskEvent, TaskEvent>(() => context.store.conditional(condition), ifTask(context), elseTask(context))
        : Observable.if<TaskEvent, TaskEvent>(() => context.store.conditional(condition), ifTask(context));
};

export const log = (message: string) => (context: IBuildContext): TaskOperator => {
    return Observable.of<TaskEvent>(new TaskData({}, message));
};

export const yarn = (task: IRunTask) => (context: IBuildContext): TaskOperator => {
    let yarnTask = { ...task };
    yarnTask.command = `yarn${CMD_EXT}`;
    yarnTask.args = [task.command, ...task.args || []];
    return run(yarnTask)(context);
};

export const node = (task: IRunTask) => (context: IBuildContext): TaskOperator => {
    let nodeTask = { ...task };
    nodeTask.command = 'node';
    nodeTask.args = [task.command, ...task.args || []];
    return run(nodeTask)(context);
};

export const nodeBin = (task: IRunTask) => (context: IBuildContext): TaskOperator => {
    let command = `./node_modules/.bin/${task.command}`;
    if (IS_WINDOWS)
        command = command.replace(/\//g, '\\') + CMD_EXT;
    let nodeTask = { ...task, command: command };
    return run(nodeTask)(context);
};

export const npm = (task: IRunTask) => (context: IBuildContext): TaskOperator => {
    let npmTask = { ...task };
    npmTask.command = `npm${CMD_EXT}`;
    npmTask.args = [task.command, ...task.args || []];
    return run(npmTask)(context);
};

export const npmRun = (task: IRunTask) => (context: IBuildContext): TaskOperator => {
    let runTask = { ...task };
    runTask.command = 'run';
    runTask.args = [task.command, ...task.args || []];
    return npm(runTask)(context);
};

export const securityCheck = (projectPath: string, ignoreList?: Array<IIgnoreSecurityCheck>, task?: ITask) => (context: IBuildContext): TaskOperator => {
    const chalk = require('chalk');
    const dedent = require('dedent');
    const nsp = require('nsp');

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
    
    return step((action: ITaskAction): string | void => {
        const options = {
            package: path.join(projectPath, './package.json')
        };

        nsp.check(options, (err: any, securityVulnerabilities: any) => {
            if (err) {
                action.warn(`Warning! the Node Security Project check has failed. This probably means their API is down`);
                action.done(err.toString());
            } else {
                securityVulnerabilities = securityVulnerabilities || [];
                if (securityVulnerabilities.length === 0) {
                    action.done('Node Security found no dependencies with known vulnerabilities :)');
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
                        action.warn(`${chalk.yellow('WARNING:')} ${ignoreMessage}`);
                        action.warn(`${chalk.yellow('WARNING:')} ${formatSecurityVulnerability(vuln)}`);
                        return false;
                    });
                }
                if (securityVulnerabilities.length > 0) {
                    let errors = securityVulnerabilities.reduce((result: string, vuln: any) => `${result}${chalk.red('ERROR:')} ${formatSecurityVulnerability(vuln)}`, '');
                    action.error(`ERROR! One of our dependencies has a known security vulnerability!\n${errors}`);
                } else {
                    action.done();
                }
            }
        });
    }, task)(context);
};

export const publishArtifact = (srcPath: string, zipPath: string, task?: ITask) => (context: IBuildContext): TaskOperator => {
    const archiver = require('archiver');
    const fs = require('fs-extra');

    return step((action: ITaskAction): string | void => {
        let archive = archiver('zip');
        archive.on('error', (err: any) => {
            action.error(`Failed to create report zip file: ${zipPath}`, err);
        });
        fs.ensureDirSync(path.dirname(zipPath));
        let output = fs.createWriteStream(zipPath);
        output.on('close', () => {
            action.artifact(zipPath);
            action.done();
        });
        archive.pipe(output);
        archive.directory(srcPath, '');
        archive.finalize();
    }, task)(context);
};

export const copyFolder = (srcPath: string, destPath: string | undefined, task?: ITask) => (context: IBuildContext): TaskOperator => {
    const fs = require('fs-extra');
    const { ncp } = require('ncp');
    
    return step((action: ITaskAction): string | void => {
        if (!destPath) {
            action.done('No destination path was specified so nothing was copied');
            return;
        }
        fs.ensureDirSync(destPath);
        let ncpOptions = {
            stopOnErr: true,
            limit: 16
        };
        ncp(srcPath, destPath, ncpOptions, (err: any) => {
            if (err) {
                action.error(`Error copying files to ${destPath}`, err);
            } else {
                action.done(`Files were copied to ${destPath}`);
            }
        });
    }, task)(context);
};
