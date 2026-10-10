/**
 * 路线产线·±Nf 容忍硬化器：node --import tsx scripts/e2e/routetool/optimize.mjs --level <id> [--route <path>] [--sweeps 10] [--scan 1] [--write]
 *
 * 对路线每个事件做 ±Nf 扫描统计致命数（fatal，--scan N 控制深度，默认 1；真实门禁
 * 曾现 CDP 抖动 ±1f 致挂，故关键关卡用 --scan 2），坐标下降成组平移（同角色 --win W
 * 帧内相邻事件连动，默认 12；顽固事件可 --win 24 扩词表）降低 fatal；每轮净恶化回滚历史最优。产出：
 *   --write        覆写路线 JSON（source 字段追加硬化记录）
 *   默认           写 <route>.opt.json（不覆盖原路线，人工比对后采用）
 * 收敛判据：fatal=0 即整条路线任意事件 ±1f 仍 WIN；最优快照随进度落盘断点续用。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { argOf, log, ROOT } from "../lib.mjs";
import { runKernel } from "./kernel.mjs";

const args = process.argv.slice(2);
const level = argOf(args, "level", "forest_01");
const routePath = argOf(args, "route", join(ROOT, "scripts", "e2e", "inputs", "routes", `${level}.json`));
const absRoute = isAbsolute(routePath) ? routePath : join(ROOT, routePath);
const SWEEPS = Number(argOf(args, "sweeps", "10"));
const SCAN = Math.max(1, Number(argOf(args, "scan", "1")));
/** 成组平移的邻域窗宽（帧）；顽固事件可加大词表（--win 24） */
const WIN = Math.max(4, Number(argOf(args, "win", "12")));
const routeDoc = JSON.parse(readFileSync(absRoute, "utf8"));

const SIDES = ["fb", "wg"];
const NB = routeDoc.fb.length;
const clone = (T) => ({ fb: T.fb.map((e) => ({ ...e })), wg: T.wg.map((e) => ({ ...e })) });
const local = (side, i) => (side === "fb" ? i : i - NB);

function run(T) {
  return runKernel(level, { totalFrames: routeDoc.totalFrames, fb: T.fb, wg: T.wg });
}

/** 逐事件 ±Nf 扫描（only 传平坦索引集合则只扫子集——验证移动局部性） */
function scanTables(T, only = null) {
  const fatal = [];
  const offs = [];
  for (let d = -SCAN; d <= SCAN; d++) if (d !== 0) offs.push(d);
  for (let s = 0; s < 2; s++) {
    const side = SIDES[s];
    for (let li = 0; li < T[side].length; li++) {
      const i = s * NB + li;
      if (only && !only.has(i)) continue;
      for (const d of offs) {
        const TT = clone(T);
        TT[side][li].f += d;
        if (!run(TT).won) { fatal.push({ i, side, li, f: T[side][li].f, dir: T[side][li].dir, type: T[side][li].type, d }); break; }
      }
    }
  }
  return fatal;
}

/** 移动集：idx 与同角色 WINf 内相邻事件构成连续 run（单点 / 整 run 两档） */
function moveSets(T, i) {
  const side = SIDES[Math.floor(i / NB)];
  const li = local(side, i);
  const evs = T[side];
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
let bestFatal = Infinity;
const totalEvents = NB + routeDoc.wg.length;
const t0 = Date.now();

if (!run(cur).won) { console.error("基线必须 WIN（先跑通初排再硬化）"); process.exit(1); }

// --one：每采纳一个移动就整表重扫（消陈旧致命表的级联抖动；慢但稳，1 移动≈1 sweep）
const ONE = args.includes("--one");

if (ONE) {
  // --one 逐个击破：候选先过局部 ±SCAN 预筛，再全量重扫验收——只采纳「全局严格改善」
  // 的移动，每采纳一个即全量重扫再找下一个。为何验收必须全局：单帧移动会混沌级重塑
  // 整个致命集（research/11 §A，实测 fb#6-1 让 9 项致命里 5 项换位），局部 ±SCAN 验证
  // 兜不住远期耦合（修 A 破 B 只有全量重扫见真章）；且致命计数是内核版本相对的——
  // 内核一改（如 F7 接触时序），同一路线的致命集即洗牌，硬化必须在最终内核上重跑。
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    const F = scanTables(cur);
    log(`sweep ${sweep}: fatal ${F.length}/${totalEvents}（累计 ${((Date.now() - t0) / 1000).toFixed(0)}s）`);
    if (F.length < bestFatal) { bestFatal = F.length; best = clone(cur); writeFileSync(absRoute + ".best.json", JSON.stringify({ ...routeDoc, fb: best.fb, wg: best.wg })); }
    if (F.length === 0) break;
    let adopted = false;
    for (const { i } of F) {
      const { side, sets } = moveSets(cur, i);
      outer: for (const lis of sets) {
        for (const d of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
          const cand = shifted(cur, side, lis, d);
          if (!run(cand).won) continue;
          // 局部预筛（快速剔除明显劣化候选，省全量重扫）
          let ok = true;
          const verify = [];
          for (let dd = -SCAN; dd <= SCAN; dd++) if (dd !== 0) verify.push(dd);
          for (const li of lis) {
            for (const dd of verify) {
              const TT = clone(cand);
              TT[side][li].f += dd;
              if (!run(TT).won) { ok = false; break; }
            }
            if (!ok) break;
          }
          if (!ok) continue;
          const Fc = scanTables(cand);
          if (Fc.length < F.length) {
            cur = cand;
            log(`  [${side.toUpperCase()} f${lis.map((li) => cur[side][li].f).join("/")}] ${d >= 0 ? "+" : ""}${d} ✓ 全局 ${F.length}→${Fc.length}`);
            adopted = true;
            break outer;
          }
        }
      }
      if (adopted) break;
    }
    if (!adopted) { log("逐个击破：全词表无严格改善候选，收敛退出"); break; }
  }
} else {
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
  const F = scanTables(cur);
  log(`sweep ${sweep}: fatal ${F.length}/${totalEvents}（累计 ${((Date.now() - t0) / 1000).toFixed(0)}s）`);
  if (F.length < bestFatal) { bestFatal = F.length; best = clone(cur); writeFileSync(absRoute + ".best.json", JSON.stringify({ ...routeDoc, fb: best.fb, wg: best.wg })); }
  if (F.length === 0) break;
  for (const { i } of F) {
    const { side, sets } = moveSets(cur, i);
    let done = false;
    for (const lis of sets) {
      for (const d of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
        const cand = shifted(cur, side, lis, d);
        if (!run(cand).won) continue;
        // 局部验证：本集各成员 ±N（物理影响仅向前传播）
        let ok = true;
        const verify = [];
        for (let dd = -SCAN; dd <= SCAN; dd++) if (dd !== 0) verify.push(dd);
        for (const li of lis) {
          for (const dd of verify) {
            const TT = clone(cand);
            TT[side][li].f += dd;
            if (!run(TT).won) { ok = false; break; }
          }
          if (!ok) break;
        }
        if (!ok) continue;
        cur = cand;
        log(`  [${side.toUpperCase()} f${lis.map((li) => cur[side][li].f).join("/")}] ${d >= 0 ? "+" : ""}${d} ✓`);
        done = true;
        break;
      }
      if (done) break;
    }
    if (!done) log(`  [${side.toUpperCase()} i${i}] 顽固（同角色邻域内无可行移动）`);
    // --one：单一移动后整表重扫再决策（每移动一个 fatal 项即跳出本 sweep）
    if (ONE && done) break;
  }
  const F2 = scanTables(cur);
  if (F2.length <= bestFatal) { bestFatal = F2.length; best = clone(cur); writeFileSync(absRoute + ".best.json", JSON.stringify({ ...routeDoc, fb: best.fb, wg: best.wg })); }
  log(`sweep ${sweep} 末: fatal ${F2.length}（best ${bestFatal}）`);
  if (F2.length > bestFatal) cur = clone(best);
  if (F2.length === 0) break;
  }
}

// 以历史最优收尾（cur 可能劣于 best）
cur = clone(best);
const finalF = scanTables(cur);
log(`final fatal ${finalF.length}/${totalEvents}`);
for (const x of finalF) log(`  ${x.side.toUpperCase()}#${x.i} f${x.f} ${x.type} ${x.dir} ${x.d}`);

const outDoc = {
  ...routeDoc,
  fb: cur.fb,
  wg: cur.wg,
  source: `${routeDoc.source ?? "unknown"}; routetool/optimize.mjs ${new Date().toISOString().slice(0, 10)} fatal ${finalF.length}/${totalEvents}`,
};
const outPath = args.includes("--write") ? absRoute : absRoute.replace(/\.json$/, "") + ".opt.json";
writeFileSync(outPath, JSON.stringify(outDoc, null, 1));
log(`已写 ${outPath}（fatal ${finalF.length}/${totalEvents}）`);
process.exit(0);
