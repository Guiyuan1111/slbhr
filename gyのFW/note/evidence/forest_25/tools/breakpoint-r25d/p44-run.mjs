import { wgRun20 } from "./p44-wg-v20.mjs";
const r=wgRun20({});
console.log(r.marks.map(m=>`f${m[0]}→${m[1]}(${m[2]},${m[3]})`).join(" "));
console.log("ended=",r.done||r.phase,"| levers:",JSON.stringify(r.levers.map(l=>l.state)),"| doors:",JSON.stringify(r.doors),"| world:",r.world);
