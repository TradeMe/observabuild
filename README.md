# @trademe/observabuild - RXJS powered build coordinator

[![npm version](https://img.shields.io/npm/v/@trademe/observabuild.svg)](https://www.npmjs.com/package/@trademe/observabuild)

Allows you to run build tasks in serial or parallel, and chain tasks together.
Formats output automatically for console or TeamCity depending on environment.
Stops running child processes on error.

### Example:

```javascript
const { Build } = require('@trademe/observabuild');

new Build()
    .parallel(tasks => {
        tasks.yarn({ command: 'test:delay', name: 'Async One', prefix: 'Async1' });
        tasks.node({ command: './test/delay.js', name: 'Async Two', prefix: 'Async2' });
    })
    .do({
        next: (task) => {
            task.log('starting long running task');
            if (someLongRunningTask())
                task.done('finished long running task');
            else
                task.fail();
        },
        name: 'Long running task', prefix: 'Three'
    })
    .do({ next: (task) => `Build succeeded`)
    .start();
```
