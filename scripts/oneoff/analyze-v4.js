const d = require("../../pepe-buyers-final-v4.json");
const v2 = require("../pattern-check-v2.js");

console.log("=== summary ===");
console.log("swapEventCount:  ", d.swapEventCount);
console.log("uniqueBuyers:    ", d.uniqueBuyers);
console.log("candidateCount:  ", d.candidateCount);
console.log("");

const routers = new Set(Object.keys(v2.ROUTERS).map(function(a) { return a.toLowerCase(); }));
const clean = d.candidates.filter(function(c) { return !routers.has(c.address.toLowerCase()); });
const filtered = d.candidates.length - clean.length;

console.log("=== after router filter ===");
console.log("removed routers:", filtered);
console.log("clean candidates:", clean.length);
console.log("");
console.log("top 25 clean:");
clean.slice(0, 25).forEach(function(c, i) {
  console.log("  " + String(i+1).padStart(2) + ". " + c.address + "  " + c.amountFormatted);
});
