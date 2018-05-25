// run child Build
const path = require('path');
const { Build, log, parallel, requireBuild, serial, step } = require('../lib'); // require('@trademe/observabuild');

new Build({ multi: true })
    .start(
        log('New multi build !'),
        parallel(
            serial(
                requireBuild(path.join(__dirname, './child.js'), { name: 'Child One', flowId: 'tcOne' })
            )
        ),
        log('Multi build succeeded')
    );
