import { wgRun30 } from "./p50-wg-v30.mjs";
const r = wgRun30({ trace: (process.argv[2] || "") === "t" });
console.log("marks:", r.marks.map(m => `${m[1]}@f${m[0]}(${m[2]},${m[3]})`).join(" "));
console.log("done:", r.done);
console.log("levers:", r.levers, "doors:", JSON.stringify(r.doors), "world:", r.world);
