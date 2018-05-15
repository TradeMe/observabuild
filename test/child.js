// run child Build

const { Build, stepAsync, yarn } = require('../lib'); // require('@trademe/observabuild');

const build = new Build({}, module)
    .start(
        stepAsync(action => {
            action.log(`${ action.select(state => state.name || 'Child') } build ..`);
            setTimeout(() => action.done(), 5000);
        }),
        yarn({ command: 'test:delay', name: 'Delay', prefix: 'Delay' })
    );

module.exports = build;
