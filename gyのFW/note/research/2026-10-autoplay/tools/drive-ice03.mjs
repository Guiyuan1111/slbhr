// drive-ice03.mjs — ice_03 链驱动件（fw-route-ice03 槽，2026-11-01）。
// 复用 autosearch.mjs evalchild 协议（只 import 只读，绝不改它）：
//   evaljob {level,segDef,totalCapF,batch:[{sf,sw}]}  → evaluate() rec 数组
//   robjob  {level,segDef,cands:[{sf,sw,endF,entryF,met}]} → [{fatal}]
//   finjob  {level,sf,sw,totalFrames} → replayEvents
//   exjob   {level,segDef,events,deadlineAbsF,list:[{side,i,dir}]} → [{ok,why}]
// 父进程零 makeWorld（vendor 泄漏阈值 ~20 世界）。程序为【累积制】：种子=上一段定稿全程序。
// 用法：
//   node --import tsx drive-ice03.mjs --solve 1        # 解第 1 段（1-based）
//   node --import tsx drive-ice03.mjs --status
//   node --import tsx drive-ice03.mjs --finalize       # 定稿 routes/ice_03.json
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const AUTO = join(ROOT, "scripts", "e2e", "routetool", "autosearch.mjs");
const CHAIN_PATH = join(ROOT, "note/research/2026-10-autoplay/tools/checkpoints-ice_03.json");
const OUT_DIR = join(ROOT, "note/research/2026-10-autoplay/tools/out/ice03");
const STATE_PATH = join(OUT_DIR, "state-ice03.json");
const ROUTE_PATH = join(ROOT, "scripts/e2e/inputs/routes/ice_03.json");
const LEVEL = "ice_03";
const GRACE_F = 25;
// BATCH=1：多世界同进程发散实证（ev.mjs），world#1 唯一可信；批量采样必失真（fw-route-ice03 槽规约）
const BATCH = 1;

const argOf = (k, d = null) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const chain = JSON.parse(readFileSync(CHAIN_PATH, "utf8"));
mkdirSync(OUT_DIR, { recursive: true });
const loadState = () => existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : { segs: [] };
const saveState = (st) => writeFileSync(STATE_PATH, JSON.stringify(st, null, 1));

// ---- evalchild 孵化（与 sweep-ice02-i4.mjs 同式；子进程内 autosearch 自写 dbg 到 tmpdir，忽略）
function runJob(payload, tag) {
  const jobPath = join(tmpdir(), `drive-ice03-${tag}-${process.pid}-${Math.random().toString(36).slice(2, 7)}.json`);
  writeFileSync(jobPath, JSON.stringify(payload));
  const args = ["--import", "tsx", AUTO, "--level", LEVEL, "--evalchild", `--${tag}`, jobPath];
  let out = "", err = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    out = res.stdout ?? ""; err = res.stderr ?? "";
    if (out.includes("##EVALRESULT##")) break;
  }
  const i = out.indexOf("##EVALRESULT##");
  if (i < 0) throw new Error(`${tag} child failed: ${err.slice(-600)}`);
  return JSON.parse(out.slice(i + "##EVALRESULT##".length));
}

const segDefOf = (seg) => ({
  id: seg.id, title: seg.title, entry: seg.entry, waypoints: seg.waypoints, target: seg.target, horizonF: seg.horizonF,
});

// ---- 候选生成：种子（累积前缀）+ 段 cands 的 dfb/dwg 后缀
function buildCandidates(seg, seed) {
  const list = [];
  for (const c of seg.cands ?? []) {
    list.push({
      note: c.note ?? "cand",
      sf: [...seed.sf, ...(c.dfb ?? [])],
      sw: [...seed.sw, ...(c.dwg ?? [])],
    });
  }
  return list;
}

const frozenAll = (rec) => {
  const fz = rec?.M?.liquidsFrozen;
  return Array.isArray(fz) && fz.length === 3 && fz.every(Boolean);
};

function chunkBatch(seg, cands, seedEndF) {
  const segDef = segDefOf(seg);
  const results = [];
  for (let k = 0; k < cands.length; k += BATCH) {
    const slice = cands.slice(k, k + BATCH);
    const totalCapF = seedEndF + seg.horizonF + GRACE_F + 120;
    const rs = runJob({ level: LEVEL, segDef, totalCapF, batch: slice.map((c) => ({ sf: c.sf, sw: c.sw })) }, "evaljob");
    slice.forEach((c, j) => results.push({ cand: c, rec: rs[j] }));
  }
  return results;
}

function scoreOne(seg, item) {
  const { rec } = item;
  if (!rec) return { score: -9e6, why: "no-rec" };
  if (rec.deathF >= 0) return { score: -1e6 - (rec.entryF < 0 ? 5000 : 0), why: `death ${rec.deadWho ?? ""}@${rec.deathF}` };
  const unlocked = rec.wpMetF.filter((x) => x >= 0).length;
  const met = rec.metAt >= 0 || rec.wonAt >= 0;
  let score = unlocked * 1000 + (met ? 5000 + Math.max(0, 2000 - rec.metAt) * 0.5 : 0) - rec.endF * 0.05;
  const failExtras = [];
  for (const ex of seg.extras ?? []) {
    if (ex === "liquidsAllFrozen" && !frozenAll(rec)) { score -= 6000; failExtras.push(ex); }
  }
  return { score, unlocked, met, failExtras };
}

const fmtS = (S) => `fb[${S.fb.x.toFixed(0)},${S.fb.y.toFixed(0)}${S.fb.grounded ? "g" : " "}${S.fb.dead ? "!" : ""}] wg[${S.wg.x.toFixed(0)},${S.wg.y.toFixed(0)}${S.wg.grounded ? "g" : " "}${S.wg.dead ? "!" : ""}]`;

// ---- 解一段：候选批评 → 选优 → robjob 过滤 → 记录定稿
function solveSeg(si) {
  const seg = chain.segments[si];
  const st = loadState();
  const seed = si === 0 ? { sf: [], sw: [], endF: 0 } : (st.segs[si - 1]?.final ?? null);
  if (!seed) { console.error(`段 ${seg.id} 缺前段种子，先解前段`); process.exit(1); }
  const seedEndF = seed.endF ?? 0;
  const cands = buildCandidates(seg, seed);
  console.log(`== 段 ${si + 1}/${chain.segments.length} ${seg.id} ${seg.title}`);
  console.log(`   种子: fb ${seed.sf.length} / wg ${seed.sw.length} 原语, 前缀 ${seedEndF}f; 候选 ${cands.length}`);
  let results = chunkBatch(seg, cands, seedEndF);
  results.forEach((it, i) => { it.sc = scoreOne(seg, it); it.note = cands[i].note; });
  results.sort((a, b) => b.sc.score - a.sc.score);
  for (const it of results.slice(0, 6)) {
    const r = it.rec ?? {};
    console.log(`   [${it.sc.score.toFixed(0)}] ${it.sc.why ?? ""}${it.sc.failExtras?.length ? " ✗" + it.sc.failExtras.join(",") : ""} un=${it.sc.unlocked ?? "-"} met=${!!it.sc.met} endF=${r.endF} entryF=${r.entryF} wp=[${(r.wpMetF ?? []).join(",")}] ${fmtS(r.S ?? { fb: {}, wg: {} })} :: ${it.note}`);
  }
  const metItems = results.filter((it) => it.sc.met && (it.sc.failExtras ?? []).length === 0);
  if (!metItems.length) {
    console.error(`   ${seg.id} 无 met 候选 —— 依据 dbg 迭代配方`);
    if (process.env.AS_DBG) {
      const best = results[0];
      const segDef = segDefOf(seg);
      const [dbg] = runJob({ level: LEVEL, segDef, totalCapF: seedEndF + seg.horizonF + GRACE_F + 120, batch: [{ sf: best.cand.sf, sw: best.cand.sw }] }, "evaljob");
      console.log(`   best 终态: ${fmtS(dbg.S)} death=${dbg.deathF}(${dbg.deadWho}) met=${dbg.metAt} endF=${dbg.endF} idxEnd=${JSON.stringify(dbg.idxEnd)} drain=${JSON.stringify(dbg.drainF)} frozen=${JSON.stringify(dbg.M?.liquidsFrozen)}`);
    }
    process.exit(2);
  }
  // robjob 鲁棒过滤（±1f 采样），取首个非 fatal
  let chosen = null, robLines = [];
  for (const it of metItems.slice(0, 5)) {
    const rs = runJob({ level: LEVEL, segDef: segDefOf(seg), cands: [{ sf: it.cand.sf, sw: it.cand.sw, endF: it.rec.endF, entryF: it.rec.entryF, met: true }] }, "robjob");
    robLines.push(`rob(fatal=${rs[0]?.fatal}) @${it.note}`);
    if (rs[0] && !rs[0].fatal) { chosen = it; break; }
  }
  if (!chosen) chosen = metItems[0]; // 全脆也先定稿，exjob 门另证
  console.log(`   chosen: ${chosen.note} | ${robLines.join(" | ")}`);
  const rec = chosen.rec;
  // M 侧信道落地实测
  console.log(`   终态: ${fmtS(rec.S)} frozen=${JSON.stringify(rec.M?.liquidsFrozen)} sliders=${JSON.stringify(rec.M?.sliders)} entryF=${rec.entryF} metAt=${rec.metAt} endF=${rec.endF}`);
  st.segs[si] = {
    id: seg.id, title: seg.title, solved: true,
    final: { sf: chosen.cand.sf, sw: chosen.cand.sw, endF: rec.endF, entryF: rec.entryF, metAt: rec.metAt },
    robFatal: robLines.some((l) => l.includes("fatal=true")), evals: results.length, chosenNote: chosen.note,
  };
  saveState(st);
  console.log(`   state 已存: ${STATE_PATH}`);
}

// ---- ±1f 穷举门（exjob）+ finjob 事件表
function gateSeg(si) {
  const seg = chain.segments[si];
  const st = loadState();
  const fin = st.segs[si];
  if (!fin?.solved) { console.error(`段 ${seg.id} 未定稿`); process.exit(1); }
  const { sf, sw } = fin.final;
  const totalFrames = fin.final.endF + 2;
  const finReply = runJob({ level: LEVEL, sf, sw, totalFrames }, "finjob");
  const events = finReply.events; // replayEvents 返回 drive() 全对象 {events,trace,result}
  if (!events?.fb) throw new Error(`finjob 回复缺 events: ${JSON.stringify(finReply.result ?? {})}`);
  const allEv = [];
  const minF = Math.max(0, (fin.final.entryF ?? 0) - 30);
  for (const side of ["fb", "wg"]) for (let i = 0; i < events[side].length; i++) {
    if (events[side][i].f < minF) continue;
    allEv.push({ side, i, f: events[side][i].f });
  }
  const deadlineAbsF = (fin.final.entryF ?? 0) + seg.horizonF;
  let fatal = [];
  outer: for (let k = 0; k < allEv.length; k += 8) {
    const list = allEv.slice(k, k + 8).flatMap((e) => [{ ...e, dir: -1 }, { ...e, dir: 1 }]);
    const rs = runJob({ level: LEVEL, segDef: segDefOf(seg), events, deadlineAbsF, requireMet: true, list }, "exjob");
    rs.forEach((r, j) => { if (!r.ok) fatal.push({ ...list[j], why: r.why }); });
    if (fatal.length >= 6) break outer;
  }
  fin.exFatal = fatal.length;
  fin.exSamples = allEv.length * 2;
  if (fatal.length) {
    fin.exWhy = fatal.slice(0, 6).map((f) => `${f.side}#${f.i}@${f.f}${f.dir > 0 ? "+" : "-"}:${f.why}`);
    console.log(`   ${seg.id} exjob 门 fatal ${fatal.length}/${allEv.length * 2}: ${fin.exWhy.join(" | ")}`);
  } else {
    console.log(`   ${seg.id} exjob 门 PASS（${allEv.length * 2} 采样全 ok）`);
  }
  saveState(st);
}

// ---- 定稿：finjob 全程事件 → toRouteDoc → routes/ice_03.json
async function finalize() {
  const st = loadState();
  const last = [...st.segs].reverse().find((s) => s?.solved);
  if (!last) { console.error("无定稿段"); process.exit(1); }
  const { sf, sw } = last.final;
  const totalFrames = last.final.endF + 3;
  const finReply = runJob({ level: LEVEL, sf, sw, totalFrames }, "finjob");
  const events = finReply.events; // replayEvents 返回 drive() 全对象 {events,trace,result}
  if (!events?.fb) throw new Error(`finjob 回复缺 events: ${JSON.stringify(finReply.result ?? {})}`);
  const { toRouteDoc } = await import("file://" + join(ROOT, "scripts/e2e/routetool/botcore.mjs"));
  const doc = toRouteDoc(LEVEL, events, totalFrames, "fw-route-ice03 chain G1-G7 (checkpoints-ice_03.json v1; 推镜三冻 P1 实测)");
  writeFileSync(ROUTE_PATH, JSON.stringify(doc, null, 1));
  console.log(`route 已写 ${ROUTE_PATH} totalFrames=${totalFrames} fb事件=${doc.fb.length} wg事件=${doc.wg.length}`);
}

// ---- 主入口
const solveArg = argOf("solve");
const gateArg = argOf("gate");
if (argOf("status") !== null || process.argv.length <= 2) {
  const st = loadState();
  console.log(`chain ${chain.segments.length} 段; state: ${st.segs.filter(Boolean).map((s) => `${s.id}${s.solved ? "✓" : "?"}${s.exFatal !== undefined ? `(ex${s.exFatal}/${s.exSamples})` : ""}`).join(" ") || "（空）"}`);
  for (const [i, s] of st.segs.entries()) if (s) console.log(`  ${i + 1}. ${s.id} ${s.solved ? "solved" : "??"} evals=${s.evals} robFatal=${s.robFatal} :: ${s.chosenNote ?? ""}`);
} else if (solveArg !== null && solveArg !== undefined) {
  solveSeg(Number(solveArg) - 1);
} else if (gateArg !== null && gateArg !== undefined) {
  gateSeg(Number(gateArg) - 1);
} else if (argOf("finalize") !== null) {
  await finalize();
}
