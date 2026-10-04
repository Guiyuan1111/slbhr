import { readFileSync } from "node:fs";
const file = "D:/01_Guiyuan1111/GitHub/slbhr/Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js";
const src = readFileSync(file, "latin1");
function all(needle){
  const out=[]; let i=-1;
  while((i=src.indexOf(needle,i+1))!==-1) out.push(i);
  return out;
}
// 1. All defines with offsets
const defs = all('define("');
console.log("=== ALL define(" + defs.length + ") ===");
for(const d of defs){
  const end = src.indexOf('"', d+8);
  console.log(d, src.substring(d+8, end));
}
