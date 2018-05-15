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
            yarn({ command: 'test:delay', name: 'Delay one', prefix: 'One', flowId: 'tcOne' }),
            serial(
                yarn({ command: 'test:delay', name: 'Delay two', statusMessage: { start: 'Delay two', success: 'Delay two succeeded', fail: 'Two failed' }, prefix: 'Two', flowId: 'tcTwo' }),
                step(action => 'task after delay', { statusMessage: { start: 'Start after two', success: 'After two succeeded' }, prefix: 'Two', flowId: 'tcTwo' })
            ),
            iif(state => !state.failBuild,
                yarn({ command: 'test:delay', name: 'Delay three', prefix: 'Three', flowId: 'tcThree' }),
                yarn({ command: 'test:error', name: 'Throw three', prefix: 'Three', flowId: 'tcThree' })
            )
        ),
        step(action => {
            action.warn('This is a warning');
        }, { prefix: 'Warn' }),
        log('Build succeeded')
    );
