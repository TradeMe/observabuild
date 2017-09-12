// Step 1: yarn install (or npm install)

const OS = require('os');
const { execSync } = require('child_process');

const CMD_EXT = OS.platform().indexOf('win32') !== -1 ? '.cmd' : '';
execSync(`yarn${CMD_EXT} install`, { stdio: 'inherit' });

// Step 2: run Build

const { Build } = require('../lib'); // require('@trademe/observabuild');

const FAIL_BUILD = process.argv.join('').indexOf('--fail') !== -1;

Build.create()
    .do({ next: (task) => `New build !` })
    .parallel(tasks => {
        tasks.yarn({ command: 'test:delay', name: 'delay one', prefix: 'ONE', flowId: 'tcOne' });
        tasks.serial(buildTasks => {
            buildTasks
                .yarn({ command: 'test:delay', name: 'delay two', statusMessage: { start: 'begin two', success: 'two succeeded', fail: 'two failed' }, prefix: 'TWO', flowId: 'tcTwo' })
                .do({ next: (task) => 'task after delay', statusMessage: { start: 'start after two', success: 'two finished' }, prefix: 'TWO', flowId: 'tcTwo' });
        });
        if (!FAIL_BUILD) {
            tasks.yarn({ command: 'test:delay', name: 'delay three', prefix: 'THREE', flowId: 'tcThree' });
        } else {
            tasks.yarn({ command: 'test:error', name: 'throw three', prefix: 'THREE', flowId: 'tcThree' });
        }
    })
    .do({ next: (task) => { task.warn('this is a warning'); task.done() }, prefix: 'Warn' })
    .log('Build succeeded')
    .start();
