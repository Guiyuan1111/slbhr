// r15f 右墙定位修复：6990 跳跨越是刀锋跳（触地点 1:1 保留滑移误差，862 站位失准即超时）。
// 修复: right/up 7059→7250 延长按住让 wg 跑满到右墙 x≈1200（吸收全部触地误差，滑移只延迟不提前→名义是最长跑距），
//       再插一段左走 (7260..7260+D) 标定回到 862，接回原 7430 尾段。D 扫描取 f7400 时 wg.x 最近 862 者，过全 MC。
// 用法: node --import tsx TEMP/r15f/wallwalk.mjs <route路径> <out路径> [--jobs 6]
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { makeWorld, expandFlat } from "../../scripts/e2e/routetool/kernel.mjs";
import { ScanPool } from "../../scripts/e2e/routetool/pool.mjs";

const routePath = process.argv[2];
const outPath = process.argv[3];
const argOf = (a, k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
const JOBS = Number(argOf(process.argv, "jobs", "6"));
const N = 150;

const doc0 = JSON.parse(readFileSync(routePath, "utf8"));
const sortKey = (a, b) => a.f - b.f || (a.type === "up" ? -1 : 1);
function mkDraw(seed) {
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const slip = () => { const r = rand(); if (r < 0.02) return 1; if (r < 0.026) return 2; if (r < 0.028) return 3; return 0; };
  return (doc) => {
    s = seed >>> 0;
    const stream = [];
    for (let t = 0; t < N; t++) {
      const dm = (arr) => arr.map((e) => ({ e: { ...e }, d: slip() }));
      const fb = dm(doc.fb), wg = dm(doc.wg);
      const jit = (a) => a.map((x) => ({ ...x.e, f: x.e.f + x.d })).sort(sortKey);
      stream.push({ fbJ: jit(fb), wgJ: jit(wg) });
    }
    return stream;
  };
}
const draw42 = mkDraw(42), draw43 = mkDraw(43), draw44 = mkDraw(44);
const pool = new ScanPool(JOBS);
const runDoc = (d) => pool.run(doc0.level, { totalFrames: doc0.totalFrames, fb: d.fb, wg: d.wg }).then((r) => ({ won: r.won, winF: r.winF })).catch(() => ({ won: false }));
async function mc(doc, draw) {
  const stream = draw(doc);
  const rs = await Promise.all(stream.map((tr) => runDoc({ ...doc0, fb: tr.fbJ, wg: tr.wgJ })));
  return rs.filter((r) => r.won).length;
}

// 单跑（无抖动）: 返回 wg 在检查帧的位置与结论
function probe(doc, frames) {
  const ins = expandFlat(doc.fb, doc.wg, doc.totalFrames);
  const w = makeWorld(doc.level);
  const out = {};
  for (let f = 0; f < doc.totalFrames; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    if (frames.includes(f)) { const g = w.snapshotPlayer("watergirl"); out[f] = { x: g.x, y: g.y }; }
    if (w.phase === "won") return { ...out, winF: f };
    const fb = w.snapshotPlayer("fireboy"), wg2 = w.snapshotPlayer("watergirl");
    if (fb.dead || wg2.dead || fb.dying || wg2dead(wg2)) return { ...out, dead: f };
  }
  return { ...out, timeout: true };
}
const wg2dead = (g) => g.dead || g.dying;

// 候选: right/up 7059→RIGHTUP；left down@LD, left up@LD+D
const RIGHTUP = 7250, LD = 7260;
function build(D) {
  const T = { ...doc0, fb: doc0.fb.map((e) => ({ ...e })), wg: doc0.wg.map((e) => ({ ...e })) };
  const i = T.wg.findIndex((e) => e.f === 7059 && e.dir === "right" && e.type === "up");
  if (i < 0) throw new Error("7059 right/up 未找到");
  T.wg[i].f = RIGHTUP;
  T.wg.push({ f: LD, dir: "left", type: "down" });
  T.wg.push({ f: LD + D, dir: "left", type: "up" });
  T.wg.sort(sortKey);
  return T;
}

console.log("== D 扫描（目标 f7400 wg.x≈862） ==");
let best = null;
for (let D = 50; D <= 150; D += 5) {
  const T = build(D);
  const r = probe(T, [7400, 7420]);
  const x = r[7400]?.x;
  const status = r.winF ? `WIN@${r.winF}` : r.dead ? `DEAD@${r.dead}` : "TIMEOUT";
  if (x !== undefined) console.log(`D=${D}: f7400 wg.x=${x.toFixed(1)} f7420=${r[7420]?.x.toFixed(1)} ${status}`);
  else console.log(`D=${D}: ${status}`);
  if (r.winF && x !== undefined && (!best || Math.abs(x - 862) < Math.abs(best.x - 862))) best = { D, x };
}
if (!best) { console.log("无可行 D"); pool.close(); process.exit(2); }
console.log(`\n最优 D=${best.D}（f7400 wg.x=${best.x.toFixed(1)}），微扫 ±4:`);
for (const D of [best.D - 4, best.D - 2, best.D, best.D + 2, best.D + 4]) {
  const T = build(D);
  const r = probe(T, [7400]);
  const x = r[7400]?.x;
  if (r.winF && x !== undefined && (!best || Math.abs(x - 862) < Math.abs(best.x - 862))) best = { D, x };
  console.log(`D=${D}: x=${x?.toFixed(1)} ${r.winF ? "WIN" : r.dead ? "DEAD" : "TIMEOUT"}`);
}
console.log(`\n终选 D=${best.D}（x=${best.x.toFixed(1)}）全 MC:`);
const final = build(best.D);
const w42 = await mc(final, draw42), w43 = await mc(final, draw43), w44 = await mc(final, draw44);
console.log(`MC42=${w42}/150 MC43=${w43}/150 MC44=${w44}/150`);
if (w42 > 139) {
  const out = { ...doc0, fb: final.fb, wg: final.wg, source: `${doc0.source}; wallwalk rightUp7250+leftwalk D=${best.D}` };
  copyFileSync(routePath, outPath + ".bak");
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(`已写 ${outPath}`);
}
pool.close();
