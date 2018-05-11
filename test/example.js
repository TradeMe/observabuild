// Step 1: yarn install (or npm install)

const os = require('os');
const { execSync } = require('child_process');

const CMD_EXT = os.platform().indexOf('win32') !== -1 ? '.cmd' : '';
execSync(`yarn${CMD_EXT} install`, { stdio: 'inherit' });

// Step 2: run Build

const { Build, iif, log, parallel, serial, step, yarn } = require('../lib'); // require('@trademe/observabuild');

const FAIL_BUILD = process.argv.join('').indexOf('--fail') !== -1;

new Build({ failBuild: FAIL_BUILD })
    .start(
        step(action => 'New build !'),
        parallel(
            yarn({ command: 'test:delay', name: 'delay one', prefix: 'One', flowId: 'tcOne' }),
            serial(
                yarn({ command: 'test:delay', name: 'delay two', statusMessage: { start: 'delay two', success: 'two succeeded', fail: 'two failed' }, prefix: 'Two', flowId: 'tcTwo' }),
                step(action => 'task after delay', { statusMessage: { start: 'start after two', success: 'two finished' }, prefix: 'Two', flowId: 'tcTwo' })
            ),
            iif(state => !state.failBuild,
                yarn({ command: 'test:delay', name: 'delay three', prefix: 'Three', flowId: 'tcThree' }),
                yarn({ command: 'test:error', name: 'throw three', prefix: 'Three', flowId: 'tcThree' })
            )
        ),
        step(action => {
            action.warn('this is a warning');
        }, { prefix: 'Warn' }),
        log('Build succeeded')
    );
