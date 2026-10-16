// bisect: 对指定滑动事件逐个/组合回放，定位致败滑点
import { runKernel } from "../../../../../scripts/e2e/routetool/kernel.mjs";
import { readFileSync } from "node:fs";

const doc = JSON.parse(readFileSync(new URL("../../../../../scripts/e2e/inputs/routes/forest_05.json", import.meta.url), "utf8"));
const SEED = Number(process.argv[2] ?? 42);
const TRIALS = Number(process.argv[3] ?? 1);

const makeJit = () => {
  let s = SEED >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const slip = () => { const r = rand(); return r < 0.02 ? 1 : r < 0.026 ? 2 : r < 0.028 ? 3 : 0; };
  return (arr) => arr.map(e => { const d = slip(); return d ? { ...e, f: e.f + d, _d: d } : { ...e, _d: 0 }; });
};

// 生成该 trial 的原始滑动标注
const jit = makeJit();
const fbRaw = jit(doc.fb), wgRaw = jit(doc.wg);
const slips = [];
for (const [who, arr] of [["fb", fbRaw], ["wg", wgRaw]]) {
  arr.forEach((e, i) => { if (e._d) slips.push({ who, idx: i, f: doc[who][i].f, d: e._d, tag: `${who}@${doc[who][i].f}+${e._d}${e.dir[0]}${e.type[0]}` }); });
}
console.log("slips:", slips.map(x => x.tag).join(" "));

const applySlips = (subset) => {
  const build = (who) => doc[who].map((e, i) => {
    const sl = slips.find(x => x.who === who && x.idx === i);
    return sl && subset.has(sl.tag) ? { ...e, f: e.f + sl.d } : e;
  }).sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
  return runKernel("forest_05", { ...doc, fb: build("fb"), wg: build("wg") }, {});
};

const all = new Set(slips.map(x => x.tag));
console.log("ALL:", JSON.stringify(applySlips(all)));
// 单个
for (const tag of slips.map(x => x.tag)) {
  console.log(tag, ":", JSON.stringify(applySlips(new Set([tag]))));
}
// 去一
for (const tag of slips.map(x => x.tag)) {
  const rest = new Set([...all].filter(t => t !== tag));
  const r = applySlips(rest);
  if (r.won) console.log("去" + tag, "→ WON (该滑点是必要致败因子)");
}
