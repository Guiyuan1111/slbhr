/**
 * 路线产线·多盆位逃逸器：常规 ±1f 下降收敛后若仍有致命刀锋，从「刀锋预移早/晚 1f 的
 * 内核 WIN 孪生盆位」重新下降，取全局最优（forest_01 实证：单盆位 2 刀锋混沌锁死，
 * fb#6@315 盆位一跳收敛到 ±1f fatal 0/222）。
 *
 * 用法：node --import tsx scripts/e2e/routetool/multistart.mjs --level <id> [--route <path>]
 *        [--scan 1] [--jobs 4] [--rounds 3] [--win 12]
 * 产出：<route>.multistart.json（最优路线，source 注明谱系）；已达标（fatal=0）则原样退出 0。
 */
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, isAbsolute, dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { argOf, log, ROOT } from "../lib.mjs";
import { runKernel } from "./kernel.mjs";
import { ScanPool } from "./pool.mjs";

const args = process.argv.slice(2);
const level = argOf(args, "level", "forest_01");
const routePath = argOf(args, "route", join(ROOT, "scripts", "e2e", "inputs", "routes", `${level}.json`));
const absRoute = isAbsolute(routePath) ? routePath : join(ROOT, routePath);
const SCAN = Math.max(1, Number(argOf(args, "scan", "1")));
const JOBS = Number(argOf(args, "jobs", "4"));
const ROUNDS = Number(argOf(args, "rounds", "3"));
const WINW = argOf(args, "win", "12");

const doc0 = JSON.parse(readFileSync(absRoute, "utf8"));
const clone = (T) => ({ fb: T.fb.map((e) => ({ ...e })), wg: T.wg.map((e) => ({ ...e })) });
const pool = new ScanPool(JOBS);
/** 内核回跑：返回完整工人应答（won/deathF/err），调用方自行判 won */
const run = (T) => pool.run(level, { totalFrames: doc0.totalFrames, fb: T.fb, wg: T.wg });

/** ±SCAN 全量致命表（含方向），供刀锋枚举 */
async function scanTables(T) {
  const offs = [];
  for (let d = -SCAN; d <= SCAN; d++) if (d !== 0) offs.push(d);
  const jobs = [];
  for (const side of ["fb", "wg"])
    for (let i = 0; i < T[side].length; i++)
      for (const d of offs) {
        const TT = clone(T);
        TT[side][i].f += d;
        jobs.push({ side, i, f: T[side][i].f, d, route: { totalFrames: doc0.totalFrames, fb: TT.fb, wg: TT.wg } });
      }
  const rs = await Promise.all(jobs.map((j) => pool.run(level, j.route).catch(() => ({ won: false, err: "worker崩溃" }))));
  const errs = rs.filter((r) => r.err).length;
  if (errs) log(`[warn] 本轮扫描 ${errs} 个任务内核报错（计入 fatal，结果存疑建议重跑）`);
  const fatal = [];
  jobs.forEach((j, k) => { if (!rs[k].won) fatal.push({ side: j.side, i: j.i, f: j.f, d: j.d }); });
  return fatal;
}

/** 调 optimize.mjs 对 <route> 做一轮全局验收下降，回其产物路径（.opt.json） */
function descend(route) {
  const out = route.replace(/\.json$/, "") + ".opt.json";
  rmSync(out, { force: true });
  execFileSync(process.execPath, [
    "--import", "tsx", join(ROOT, "scripts", "e2e", "routetool", "optimize.mjs"),
    "--level", level, "--route", route, "--scan", String(SCAN), "--one",
    "--win", String(WINW), "--sweeps", "20", "--jobs", String(JOBS),
  ], { cwd: ROOT, stdio: ["ignore", "ignore", "pipe"] });
  return out;
}

const workDir = join(ROOT, "TEMP", `multistart-${level}`);
mkdirSync(workDir, { recursive: true });
const mkCandidate = (doc, side, i, delta, tag) => {
  const T = clone(doc);
  T[side][i].f += delta;
  return { doc: { ...doc, fb: T.fb, wg: T.wg, source: `${doc.source ?? ""}; multistart ${tag}` }, path: join(workDir, `${basename(absRoute, ".json")}_${tag}.json`) };
};

let best = { route: absRoute, fatal: Infinity };
const t0 = Date.now();
try {
  // round 0：原路线常规下降
  const r0 = descend(absRoute);
  const d0 = JSON.parse(readFileSync(r0, "utf8"));
  const f0 = await scanTables(d0);
  log(`round0 常规下降: fatal ${f0.length}/${(d0.fb.length + d0.wg.length) * 2 * SCAN}`);
  best = { route: r0, doc: d0, fatal: f0.length };

  for (let round = 1; round <= ROUNDS && best.fatal > 0; round++) {
    // 刀锋枚举：只取单方向致命项（双向致命的预移无意义）；向安全方向移 1f
    const byEv = new Map(f0.map((x) => [`${x.side}#${x.i}`, []]));
    for (const x of f0) byEv.get(`${x.side}#${x.i}`).push(x.d);
    const blades = [...byEv.entries()].filter(([, ds]) => ds.length === 1)
      .map(([key, [d]]) => ({ key, side: key.split("#")[0], i: Number(key.split("#")[1]), shift: -d }));
    if (!blades.length) { log("无单方向刀锋可预移，停"); break; }
    log(`round${round}: ${blades.length} 个候选盆位（${blades.map((b) => `${b.key}@f${f0.find((x) => x.side === b.side && x.i === b.i).f}${b.shift > 0 ? "+" : ""}${b.shift}`).join(" ")}）`);
    let improved = false;
    for (const b of blades.slice(0, 4)) {
      const cand = mkCandidate(JSON.parse(readFileSync(best.route, "utf8")), b.side, b.i, b.shift, `r${round}_${b.key.replace("#", "")}`);
      writeFileSync(cand.path, JSON.stringify(cand.doc, null, 1));
      const base = await run(cand.doc);
      if (!base.won) { log(`  ${b.key} 预移 ${b.shift > 0 ? "+" : ""}${b.shift} → 内核 DEAD（deathF=${base.deathF ?? "-"}${base.err ? ` err=${base.err}` : ""}），跳过`); continue; }
      const r = descend(cand.path);
      const d = JSON.parse(readFileSync(r, "utf8"));
      const f = await scanTables(d);
      log(`  ${b.key} 盆位下降 → fatal ${f.length}${f.length < best.fatal ? " ✓ 新最优" : ""}`);
      if (f.length < best.fatal) { best = { route: r, doc: d, fatal: f.length }; improved = true; }
      if (best.fatal === 0) break;
    }
    if (!improved) { log("本轮无改善，停"); break; }
  }
} finally {
  pool.close();
}

if (best.fatal === Infinity) { console.error("multistart 失败：无有效产物"); process.exit(1); }
const outDoc = { ...best.doc, source: `${best.doc.source ?? ""}; multistart 收敛 ±${SCAN}f fatal ${best.fatal}` };
const outPath = absRoute.replace(/\.json$/, "") + ".multistart.json";
writeFileSync(outPath, JSON.stringify(outDoc, null, 1));
log(`已写 ${outPath}（±${SCAN}f fatal ${best.fatal}，累计 ${((Date.now() - t0) / 1000).toFixed(0)}s）`);
log(best.fatal === 0 ? `达标：任意单事件 ±${SCAN}f 抖动免疫——可采纳` : `残余 ${best.fatal} 项致命（可在 source 注明后人工评估采纳）`);
process.exit(best.fatal === 0 ? 0 : 2);
