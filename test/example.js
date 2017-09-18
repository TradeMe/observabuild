// Step 1: yarn install (or npm install)

const OS = require('os');
const { execSync } = require('child_process');

const CMD_EXT = OS.platform().indexOf('win32') !== -1 ? '.cmd' : '';
execSync(`yarn${CMD_EXT} install`, { stdio: 'inherit' });

// Step 2: run Build

const { Build } = require('../lib'); // require('@trademe/observabuild');

const FAIL_BUILD = process.argv.join('').indexOf('--fail') !== -1;

Build.create({ failBuild: FAIL_BUILD })
    .do({ next: (task) => `New build !` })
    .parallel(tasks => {
        tasks.yarn({ command: 'test:delay', name: 'delay one', prefix: 'One', flowId: 'tcOne' });
        tasks.serial(buildTasks => {
            buildTasks
                .yarn({ command: 'test:delay', name: 'delay two', statusMessage: { start: 'delay two', success: 'two succeeded', fail: 'two failed' }, prefix: 'Two', flowId: 'tcTwo' })
                .do({ next: (task) => 'task after delay', statusMessage: { start: 'start after two', success: 'two finished' }, prefix: 'Two', flowId: 'tcTwo' });
        });
        tasks.if(state => !state.failBuild,
            successTasks => successTasks.yarn({ command: 'test:delay', name: 'delay three', prefix: 'Three', flowId: 'tcThree' }),
            failTasks => failTasks.yarn({ command: 'test:error', name: 'throw three', prefix: 'Three', flowId: 'tcThree' })
        );
    })
    .do({ next: (task) => { task.warn('this is a warning'); task.done() }, prefix: 'Warn' })
    .log('Build succeeded')
    .start();
