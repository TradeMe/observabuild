
let errorSeconds = 5;

console.log('start throw test');
console.log(`throw after ${errorSeconds} seconds ...`);
setTimeout(function() {
    throw new Error('TEST:throw');
}, errorSeconds * 1000);
