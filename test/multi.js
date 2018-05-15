// run child Build
const path = require('path');
const { Build, log, parallel, requireBuild, serial, step } = require('../lib'); // require('@trademe/observabuild');

new Build({ multi: true })
    .start(
        log('New multi build !'),
        parallel(
            serial(
                step(action => action.setState({ name: 'Child One', flowId: 'tcOne' })),
                requireBuild(path.join(__dirname, './child.js'))
            ),
            serial(
                step(action => action.setState({ name: 'Child Two', flowId: 'tcOne' })),
                requireBuild(path.join(__dirname, './child.js'))
            )
        ),
        log('Multi build succeeded')
    );
