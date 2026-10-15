// sweep1: 单事件帧数伸缩扫描——测每个关键步行段/跳跃的容差窗
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";

const doc = JSON.parse(readFileSync(join(import.meta.dirname, "../../scripts/e2e/inputs/routes/forest_15.json"), "utf8"));

// args: side#idx=d1,d2,... 例: wg#17=-20,0,20,40,60  多个用 | 分隔: wg#17=...|fb#25=...
const specs = process.argv[2].split("|").map(s => {
  const m = s.match(/^(fb|wg)#(\d+)=(.+)$/);
  return { side: m[1], idx: +m[2], deltas: m[3].split(",").map(Number) };
});

function runWith(mods) {
  const mk = (side) => doc[side].map((e, i) => {
    const d = mods.get(side + i);
    if (d === undefined) return { ...e };
    // 移动 down 事件提前/推后 up 事件推后 = 段伸缩; 简化: 只平移该事件
    return { ...e, f: e.f + d };
  });
  const tr = [];
  const res = runKernel("forest_15", { ...doc, fb: mk("fb"), wg: mk("wg") }, { traceTo: tr });
  const last = tr[tr.length - 1];
  const at = (f) => { const r = tr[Math.min(f, tr.length - 1)]; return `fb(${r.fb[0] | 0},${r.fb[1] | 0}) wg(${r.wg[0] | 0},${r.wg[1] | 0})`; };
  return { won: res.won, deathF: res.deathF, winF: res.winF, end: at(doc.totalFrames - 1), at4500: at(4500), at6000: at(6000), at7500: at(7500) };
}

for (const sp of specs) {
  console.log(`== ${sp.side}#${sp.idx} (nominal f${doc[sp.side][sp.idx].f} ${doc[sp.side][sp.idx].dir}-${doc[sp.side][sp.idx].type})`);
  for (const d of sp.deltas) {
    const r = runWith(new Map([[sp.side + sp.idx, d]]));
    console.log(`  d=${String(d).padStart(4)} won=${r.won ? "WIN@" + r.winF : r.deathF >= 0 ? "DEATH@" + r.deathF : "TIMEOUT"} end:${r.end} | f4500 ${r.at4500} | f6000 ${r.at6000} | f7500 ${r.at7500}`);
  }
}
