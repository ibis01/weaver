const d = require('./pepe-buyers-final.json');
const v2 = require('./scripts/pattern-check-v2.js');

console.log('=== summary ===');
console.log('swapEventCount:  ', d.swapEventCount);
console.log('uniqueBuyers:    ', d.uniqueBuyers);
console.log('candidateCount:  ', d.candidateCount);
console.log('');
console.log('NOTE: swapEventCount == 1000 means the API truncated. Need chunked fetch.');

const routers = new Set(Object.keys(v2.ROUTERS).map(function(a) { return a.toLowerCase(); }));
const clean = d.candidates.filter(function(c) { return !routers.has(c.address.toLowerCase()); });

console.log('');
console.log('clean candidates:', clean.length);
console.log('');
console.log('top 20 clean:');
clean.slice(0, 20).forEach(function(c, i) {
  console.log('  ' + String(i+1).padStart(2) + '. ' + c.address + '  ' + c.amountFormatted);
});
