// r15f 正向目标硬化器（optimize.mjs --one 模式的改造副本，仅存 TEMP 不入共享工具链）
//
// 与原版的差异（r15f 实证依据见 note/evidence/forest_15/logs/r15f-01-verify.txt）：
//  1. 扫描方向只有 +1/+2/+3 —— mc.mjs slip() 与真机 CDP 抖动均为"仅迟到"单侧模型，
//     负向致命不可触发；对称判据（±N 全净）是充分非必要条件，会把"前移进正影区"的
//     唯一可行解整体拒收（wg#11@958 实证：-1..-4 全净、+1 致命，前移后新 ±2 窗含旧
//     致命位 → 对称 optimize 永久拒绝，10 轮零 wg 采纳）。
//  2. 代价函数加权 Σ P(slip=d)（+1=0.02, +2=0.006, +3=0.002），与 MC 期望失败率对齐。
//  3. 快照写 <route>.posbest.json，产物写 <route>.posopt.json（不碰原版 .best.json 约定）。
//
// 用法: node --import tsx note/evidence/forest_15/tools/breakpoint-r15f/posopt.mjs --level forest_15 --route <path> [--sweeps 30] [--jobs 7]
import { readFileSync, writeFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { argOf, log, ROOT } from "../../scripts/e2e/lib.mjs";
import { runKernel } from "../../scripts/e2e/routetool/kernel.mjs";
import { ScanPool } from "../../scripts/e2e/routetool/pool.mjs";

const args = process.argv.slice(2);
const level = argOf(args, "level", "forest_15");
const routePath = argOf(args, "route", join(ROOT, "scripts", "e2e", "inputs", "routes", `${level}.json`));
const absRoute = isAbsolute(routePath) ? routePath : join(ROOT, routePath);
const SWEEPS = Number(argOf(args, "sweeps", "30"));
const JOBS = Number(argOf(args, "jobs", "0")) || undefined;
const routeDoc = JSON.parse(readFileSync(absRoute, "utf8"));
const pool = new ScanPool(JOBS);

const SIDES = ["fb", "wg"];
const NB = routeDoc.fb.length;
const clone = (T) => ({ fb: T.fb.map((e) => ({ ...e })), wg: T.wg.map((e) => ({ ...e })) });
const local = (side, i) => (side === "fb" ? i : i - NB);
const OFFS = [1, 2, 3];
const WEIGHT = { 1: 0.02, 2: 0.006, 3: 0.002 };
const cost = (F) => F.reduce((a, x) => a + WEIGHT[x.d], 0);

async function run(T) {
  return (await pool.run(level, { totalFrames: routeDoc.totalFrames, fb: T.fb, wg: T.wg })).won;
}

async function scanTables(T) {
  const jobs = [];
  for (let s = 0; s < 2; s++) {
    const side = SIDES[s];
    for (let li = 0; li < T[side].length; li++) {
      for (const d of OFFS) {
        const TT = clone(T);
        TT[side][li].f += d;
        jobs.push({ i: s * NB + li, side, li, f: T[side][li].f, d, route: { totalFrames: routeDoc.totalFrames, fb: TT.fb, wg: TT.wg } });
      }
    }
  }
  const rs = await Promise.all(jobs.map((j) => pool.run(level, j.route).catch(() => ({ won: false, err: "worker崩溃" }))));
  const errs = rs.filter((r) => r.err).length;
  if (errs) log(`[warn] 本轮扫描 ${errs} 个任务内核报错（计入 fatal，结果存疑建议重跑）`);
  const fatal = [];
  jobs.forEach((j, k) => { if (!rs[k].won) fatal.push({ i: j.i, side: j.side, li: j.li, f: j.f, d: j.d }); });
  return fatal;
}

function moveSets(T, i) {
  const side = SIDES[i >= NB ? 1 : 0];
  const li = local(side, i);
  const evs = T[side];
  const WIN = 12;
  let lo = li, hi = li;
  while (lo > 0 && evs[lo - 1].f >= evs[lo].f - WIN) lo--;
  while (hi < evs.length - 1 && evs[hi + 1].f <= evs[hi].f + WIN) hi++;
  const sets = [[li]];
  if (hi > lo) sets.push(Array.from({ length: hi - lo + 1 }, (_, k) => lo + k));
  return { side, sets };
}
function shifted(T, side, lis, d) {
  const TT = clone(T);
  for (const li of lis) TT[side][li].f += d;
  return TT;
}

let cur = clone(routeDoc);
let best = clone(cur);
let bestCost = Infinity;
const totalEvents = NB + routeDoc.wg.length;
const denom = totalEvents * OFFS.length;
const t0 = Date.now();

if (!(await run(cur))) { console.error("基线必须 WIN"); process.exit(1); }
const uniq = (F) => [...new Map(F.map((x) => [x.i, x])).values()];

for (let sweep = 0; sweep < SWEEPS; sweep++) {
  const F = await scanTables(cur);
  const c = cost(F);
  log(`sweep ${sweep}: 正向 fatal ${F.length}/${denom} cost ${c.toFixed(4)}（${uniq(F).length} 事件，累计 ${((Date.now() - t0) / 1000).toFixed(0)}s）`);
  if (c < bestCost) { bestCost = c; best = clone(cur); writeFileSync(absRoute + ".posbest.json", JSON.stringify({ ...routeDoc, fb: best.fb, wg: best.wg })); }
  if (F.length === 0) break;
  let adopted = false;
  for (const { i } of uniq(F)) {
    const { side, sets } = moveSets(cur, i);
    outer: for (const lis of sets) {
      for (const d of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
        const cand = shifted(cur, side, lis, d);
        if (!(await run(cand))) continue;
        // 局部正影预筛：移动集各成员 +1/+2/+3 必须全 WIN
        let ok = true;
        for (const li of lis) {
          for (const dd of OFFS) {
            const TT = clone(cand);
            TT[side][li].f += dd;
            if (!(await run(TT))) { ok = false; break; }
          }
          if (!ok) break;
        }
        if (!ok) continue;
        const Fc = await scanTables(cand);
        const cc = cost(Fc);
        if (cc < c - 1e-9) {
          cur = cand;
          bestCost = cc;
          best = clone(cur);
          writeFileSync(absRoute + ".posbest.json", JSON.stringify({ ...routeDoc, fb: best.fb, wg: best.wg }));
          log(`  [${side.toUpperCase()} f${lis.map((li) => cur[side][li].f).join("/")}] ${d >= 0 ? "+" : ""}${d} ✓ cost ${c.toFixed(4)}→${cc.toFixed(4)}（${F.length}→${Fc.length} 项）`);
          adopted = true;
          break outer;
        }
      }
    }
    if (adopted) break;
  }
  if (!adopted) { log("全词表无严格改善候选，收敛退出"); break; }
}

cur = clone(best);
const finalF = await scanTables(cur);
log(`final 正向 fatal ${finalF.length}/${denom} cost ${cost(finalF).toFixed(4)}（MC 期望 ≈${(100 * cost(finalF)).toFixed(1)}% 失败）`);
for (const x of uniq(finalF)) log(`  ${x.side.toUpperCase()}#${x.i} f${x.f} +${x.d}`);

const outDoc = {
  ...routeDoc,
  fb: cur.fb,
  wg: cur.wg,
  source: `${routeDoc.source ?? "unknown"}; r15f posopt(正向+1/+2/+3 加权) ${new Date().toISOString().slice(0, 10)} cost ${cost(finalF).toFixed(4)}`,
};
const outPath = absRoute.replace(/\.json$/, "") + ".posopt.json";
writeFileSync(outPath, JSON.stringify(outDoc, null, 1));
log(`已写 ${outPath}`);
pool.close();
process.exit(0);
