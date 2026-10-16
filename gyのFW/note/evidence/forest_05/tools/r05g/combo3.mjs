import { runKernel } from "../../../../../scripts/e2e/routetool/kernel.mjs";
import { readFileSync } from "node:fs";
const doc = JSON.parse(readFileSync(new URL("../../../../../scripts/e2e/inputs/routes/forest_05.json", import.meta.url), "utf8"));
const SEED = Number(process.argv[2] ?? 42);
let s = SEED >>> 0;
const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const slip = () => { const r = rand(); return r < 0.02 ? 1 : r < 0.026 ? 2 : r < 0.028 ? 3 : 0; };
const jit = (arr) => arr.map(e => { const d = slip(); return { ...e, f: e.f + d, _d: d }; });
const fbRaw = jit(doc.fb), wgRaw = jit(doc.wg);
const slips = [];
for (const [who, arr] of [["fb", fbRaw], ["wg", wgRaw]]) arr.forEach((e, i) => { if (e._d) slips.push({ who, idx: i, d: e._d, tag: `${who}@${doc[who][i].f}+${e._d}${e.dir[0]}${e.type[0]}` }); });
console.log("slips:", slips.map(x => x.tag).join(" "));
const apply = (subset) => {
  const build = (who) => doc[who].map((e, i) => { const sl = slips.find(x => x.who === who && x.idx === i); return sl && subset.has(sl.tag) ? { ...e, f: e.f + sl.d } : e; }).sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
  return runKernel("forest_05", { ...doc, fb: build("fb"), wg: build("wg") }, {});
};
for (const arg of process.argv.slice(3)) {
  const names = arg.split(",");
  console.log(arg, ":", JSON.stringify(apply(new Set(names))));
}
