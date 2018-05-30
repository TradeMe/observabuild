import { exec } from 'child_process';
import * as os from 'os';

interface IProcessNode {
    pid: number;
    ppid: number;
    cmd: string;
    parent?: IProcessNode;
    children: Array<IProcessNode>;
}

export function stopTask (pid: number, signal: string | undefined): Promise<void> {
    if (process.platform === 'win32') {
        return run(`taskkill /pid ${ pid } /T /F`)
            .then(() => {
                /* do not return stdout */
            });
    } else {
        return ps()
            .then((tasks: Map<number, IProcessNode>): void => {
                const task = tasks.get(pid);
                if (task) {
                    killTaskTree(task, signal);
                }
            });
    }
}

function killTaskTree (task: IProcessNode, signal: string | number | undefined): void {
    process.kill(task.pid, signal);
    for (const childTask of task.children) {
        killTaskTree(childTask, signal);
    }
}

function ps (): Promise<Map<number, IProcessNode>> {
    // run process status to get snapshot of process id, parent process id and commandline for each process
    return run(`ps -e -o pid= -o ppid= -o args=`)
        .then((stdout: string) => {
            const tasks = new Map<number, IProcessNode>();

            const lines = stdout.split(os.EOL).filter(line => line && line.length);
            // extract processes from ps result
            for (const line of lines) {
                const match = /\s*(\d+)\s+(\d+)\s+(.+)/.exec(line);
                if (match) {
                    const pid = parseInt(match[1], 10);
                    tasks.set(pid, {
                        pid,
                        ppid: parseInt(match[2], 10),
                        cmd: match[3],
                        children: []
                    });
                }
            }
            // map ppid's
            for (let task of tasks.values()) {
                const parent = tasks.get(task.ppid);
                if (parent) {
                    task.parent = parent;
                    parent.children.push(task);
                }
            }
            return tasks;
        });
}

function run (command: string): Promise<string> {
    return new Promise((resolve: (value?: any) => void, reject: (reason?: any) => void) => {
        try {
            exec(command, (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => {
                if (!error) {
                    resolve(stdout ? stdout.toString() : '');
                } else {
                    reject(error || (stderr ? stderr.toString() : `exec ${command} failed`));
                }
            });
        } catch (err) {
            reject(err);
        }
    });
}
