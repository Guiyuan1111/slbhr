import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_11");
console.log("spawn:", JSON.stringify(w.level.spawn));
console.log("doors:", JSON.stringify(w.level.doors, null, 1).slice(0, 800));
console.log("liquidRuns:", JSON.stringify(w.level.liquidRuns).slice(0, 600));
