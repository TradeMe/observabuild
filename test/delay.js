let delaySeconds = 10;

console.log('start delay');
console.log(`wait for ${delaySeconds} seconds ...`);
setTimeout(function() {
    console.log('end delay');
}, delaySeconds * 1000);
