import { wgRun26 } from "./p49-wg-v26.mjs";
const r = wgRun26({trace:true});
console.log(r.marks.map(m=>`${m[0]}→${m[1]}(${m[2]},${m[3]})`).join(" "));
console.log("ended=", r.done, "| levers:", r.levers, "| doors:", JSON.stringify(r.doors), "| world:", r.world);
