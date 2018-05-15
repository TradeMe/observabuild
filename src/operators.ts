import * as os from 'os';
import * as path from 'path';
import { concat, iif as _iif, merge, Observable, of, throwError } from 'rxjs';
import { IBuildContext } from './build';
import { IBuildState } from './build-store';
import { IRunTask, RunTask } from './run-task';
import { ITaskAction, StepTask } from './step-task';
import { ITask } from './task';
import { TaskData, TaskEvent, TaskOperator } from './task-event';

const IS_WINDOWS = os.platform().indexOf('win32') !== -1;
const CMD_EXT = IS_WINDOWS ? '.cmd' : '';

export const serial = (...operations: Array<(build: IBuildContext) => TaskOperator>) => (context: IBuildContext): TaskOperator => {
    return concat<TaskEvent>(...operations.map(task => task(context)));
};

export const parallel = (...operations: Array<(build: IBuildContext) => TaskOperator>) => (context: IBuildContext): TaskOperator => {
    return merge<TaskEvent>(...operations.map(task => task(context)));
};

export const step = (next: (task: ITaskAction) => string | void, task?: ITask) => {
    return StepTask.create(next, task, false);
};

export const stepAsync = (next: (task: ITaskAction) => void, task?: ITask) => {
    return StepTask.create(next, task, true);
};

export const run = (task: IRunTask) => {
    return RunTask.create(task);
};

export const iif = (condition: (state: IBuildState) => boolean, ifTask: (context: IBuildContext) => TaskOperator, elseTask?: (context: IBuildContext) => TaskOperator) => (context: IBuildContext): TaskOperator =>  {
    return !!elseTask
        ? _iif<TaskEvent, TaskEvent>(() => context.store.conditional(condition), ifTask(context), elseTask(context))
        : _iif<TaskEvent, TaskEvent>(() => context.store.conditional(condition), ifTask(context));
};

export const requireBuild = (path: string, cwd?: string) => (context: IBuildContext): TaskOperator => {
    const build = require(path) as (context: IBuildContext, cwd?: string) => TaskOperator;
    if (!build) {
        return throwError(`Child build ${path} not found`);
    }
    return build(context, cwd);
};

export const log = (message: string) => (context: IBuildContext): TaskOperator => {
    return of<TaskEvent>(new TaskData({}, message));
};

export const yarn = (task: IRunTask) => {
    let yarnTask = { ...task };
    yarnTask.command = `yarn${CMD_EXT}`;
    yarnTask.args = [task.command, ...task.args || []];
    return run(yarnTask);
};

export const node = (task: IRunTask) => {
    let nodeTask = { ...task };
    nodeTask.command = 'node';
    nodeTask.args = [task.command, ...task.args || []];
    return run(nodeTask);
};

export const nodeBin = (task: IRunTask) => {
    let command = `./node_modules/.bin/${task.command}`;
    if (IS_WINDOWS) {
        command = command.replace(/\//g, '\\') + CMD_EXT;
    }
    const nodeTask = { ...task, command };
    return run(nodeTask);
};

export const npm = (task: IRunTask) => {
    let npmTask = { ...task };
    npmTask.command = `npm${CMD_EXT}`;
    npmTask.args = [task.command, ...task.args || []];
    return run(npmTask);
};

export const npmRun = (task: IRunTask) => {
    let runTask = { ...task };
    runTask.command = 'run';
    runTask.args = [task.command, ...task.args || []];
    return npm(runTask);
};

export interface IIgnoreSecurityCheck {
    module: string;
    version: string;
    expiry: Date;
    reason: string;
    user: string;
}

export const securityCheck = (projectPath: string, ignoreList?: Array<IIgnoreSecurityCheck>, task?: ITask) => {
    const chalk = require('chalk');
    const dedent = require('dedent');
    const nsp = require('nsp');

    function formatSecurityVulnerability (vuln: any) {
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

    return stepAsync((action: ITaskAction) => {
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
                        const ignoreVuln = ignoreList.filter(i => i.module === vuln.module && i.version === vuln.version && i.expiry.getTime() >= Date.now());
                        if (ignoreVuln.length === 0) {
                            return true;
                        }
                        const [ignore] = ignoreVuln;
                        const ignoreMessage = chalk.white(dedent(`
                            ${ignore.user} has disabled security check for ${ignore.module}@${ignore.version}

                            ${ignore.reason}
                        `));
                        action.warn(`${chalk.yellow('WARNING:')} ${ignoreMessage}`);
                        action.warn(`${chalk.yellow('WARNING:')} ${formatSecurityVulnerability(vuln)}`);
                        return false;
                    });
                }
                if (securityVulnerabilities.length > 0) {
                    const errors = securityVulnerabilities.reduce((result: string, vuln: any) => `${result}${chalk.red('ERROR:')} ${formatSecurityVulnerability(vuln)}`, '');
                    action.error(`ERROR! One of our dependencies has a known security vulnerability!\n${errors}`);
                } else {
                    action.done();
                }
            }
        });
    }, task);
};

export const publishArtifact = (srcPath: string, zipPath: string, task?: ITask) => {
    const archiver = require('archiver');
    const fs = require('fs-extra');

    return stepAsync((action: ITaskAction) => {
        const archive = archiver('zip');
        archive.on('error', (err: any) => {
            action.error(`Failed to create report zip file: ${zipPath}`, err);
        });
        fs.ensureDirSync(path.dirname(zipPath));
        const output = fs.createWriteStream(zipPath);
        output.on('close', () => {
            action.artifact(zipPath);
            action.done();
        });
        archive.pipe(output);
        archive.directory(srcPath, '');
        archive.finalize();
    }, task);
};

export const copyFolder = (srcPath: string, destPath: string | undefined, task?: ITask) => {
    const fs = require('fs-extra');
    const { ncp } = require('ncp');

    return stepAsync((action: ITaskAction) => {
        if (!destPath) {
            action.done('No destination path was specified so nothing was copied');
            return;
        }
        fs.ensureDirSync(destPath);
        const ncpOptions = {
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
    }, task);
};
