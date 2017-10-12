# @trademe/observabuild - RXJS powered build coordinator

[![npm version](https://img.shields.io/npm/v/@trademe/observabuild.svg)](https://www.npmjs.com/package/@trademe/observabuild)

Allows you to run build tasks in serial or parallel, and chain tasks together.
Formats output automatically for console or TeamCity depending on environment.
Stops running child processes on error.

### Example:

```javascript
const { Build, log, node, parallel, step, yarn } = require('@trademe/observabuild');

new Build()
    .start(
        parallel(
            yarn({ command: 'test:delay', name: 'Async One', prefix: 'Async1' }),
            node({ command: './test/delay.js', name: 'Async Two', prefix: 'Async2' })
        ),
        step(task => {
            task.log('starting long running task');
            if (someLongRunningTask())
                task.done('finished long running task');
            else
                task.error('task failed');
        }, { name: 'Long running task', prefix: 'Three' }),
        log('Build succeeded')
    );
```
