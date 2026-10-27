import { wgRun24 } from "./p47-wg-v24.mjs";
const r = wgRun24({trace:true});
console.log(r.marks.map(m=>`${m[0]}→${m[1]}(${m[2]},${m[3]})`).join(" "));
console.log("ended=", r.done, "| levers:", r.levers, "| doors:", JSON.stringify(r.doors), "| world:", r.world);
