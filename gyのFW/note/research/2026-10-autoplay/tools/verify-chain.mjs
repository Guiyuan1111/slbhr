// auto-design 槽·E1b：检查点链断言可计算性验证——绿路线回放逐帧求值全部断言。
// 用法: cd gyのFW && node --import tsx note/research/2026-10-autoplay/tools/verify-chain.mjs [checkpoints.json] [route.json]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function findRoot(dir) {
  for (let d = dir; ; d = dirname(d)) {
    try { readFileSync(join(d, "package.json")); return d; } catch { /* 向上 */ }
  }
}
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
const { makeWorld } = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "kernel.mjs")).href);

const cpPath = process.argv[2] ?? fileURLToPath(new URL("./checkpoints-forest_01.json", import.meta.url));
const routePath = process.argv[3] ?? join(ROOT, "scripts/e2e/inputs/routes/forest_01.json");
const chain = JSON.parse(readFileSync(cpPath, "utf8"));
const route = JSON.parse(readFileSync(routePath, "utf8"));

// ---- 断言求值器：每条断言带 kernelFieldPath（取数路径，供设计档与实施槽对照）
const paths = {
  px: (r) => `snapshotPlayer(${r}).x`, py: (r) => `snapshotPlayer(${r}).y`, vx: (r) => `snapshotPlayer(${r}).vx`,
  grounded: (r) => `players.${r}.feetContacts.length>0`, alive: () => `!snapshotPlayer(*).dying&&!dead`,
  leverState: (id) => `mechSnapshot().levers[${id}].state`, platY: (id) => `mechSnapshot().platforms[${id}].y`,
  pusherState: (id) => `mechSnapshot().pushers[${id}].state`, propX: (id) => `mechSnapshot().props[${id}].x`,
  propY: (id) => `mechSnapshot().props[${id}].y`, atDoor: (r) => `snapshotPlayer(${r}).atDoor`,
  doorUp: (r) => `doors.${r}.isUp`, phaseWon: () => `phase==='won'`,
};
function makeEval(a) {
  switch (a.kind) {
    case "px": case "py": case "vx": {
      const k = a.kind === "px" ? "x" : a.kind === "py" ? "y" : "vx";
      return { path: paths[a.kind](a.role), f: (S, M, D) => S[a.role][k] >= a.min && S[a.role][k] <= a.max };
    }
    case "grounded": return { path: paths.grounded(a.role), f: (S, M, D) => S[a.role].grounded };
    case "alive": return { path: paths.alive(), f: (S) => !S.fb.dying && !S.fb.dead && !S.wg.dying && !S.wg.dead };
    case "leverState": return { path: paths.leverState(a.id), f: (S, M) => M.levers[a.id].state === a.value };
    case "platY": return { path: paths.platY(a.id), f: (S, M) => M.platforms[a.id].y >= a.min && M.platforms[a.id].y <= a.max };
    case "pusherState": return { path: paths.pusherState(a.id), f: (S, M) => M.pushers[a.id].state === a.value };
    case "propX": case "propY": {
      const k = a.kind === "propX" ? "x" : "y";
      return { path: paths[a.kind](a.id), f: (S, M) => M.props[a.id][k] >= a.min && M.props[a.id][k] <= a.max };
    }
    case "atDoor": return { path: paths.atDoor(a.role), f: (S) => S[a.role].atDoor };
    case "doorUp": return { path: paths.doorUp(a.role), f: (S, M, D) => D.doors[a.role === "fb" ? "fireboy" : "watergirl"].isUp };
    case "phaseWon": return { path: paths.phaseWon(), f: (S, M, D) => D.won };
    default: throw new Error(`未知断言 kind: ${a.kind}`);
  }
}
const compile = (list) => list.map((a) => ({ ...a, ...makeEval(a) }));
const allS = (compiled, S, M, D) => compiled.every((c) => c.f(S, M, D));

// ---- 回放 + 逐帧求值
const w = makeWorld(route.level);
const mk = (evs) => {
  const st = { up: false, left: false, right: false };
  const byF = new Map();
  for (const e of evs) byF.set(e.f, [...(byF.get(e.f) ?? []), [e.dir, e.type === "down"]]);
  return (f) => { for (const [k, v] of byF.get(f) ?? []) st[k] = v; return { ...st }; };
};
const fbIn = mk(route.fb), wgIn = mk(route.wg);

// 每段断言组的首"联合"满足帧（组内全部断言同帧为真；-1=未满足）+ 断言级首满足帧（取数路径佐证）
const report = { level: route.level, totalFrames: route.totalFrames, segments: [] };
const compiledSegs = chain.segments.map((s) => ({
  id: s.id, title: s.title, greenRefF: s.greenRefF, horizonF: s.horizonF,
  entry: compile(s.entry), waypoints: s.waypoints?.map(compile) ?? [], target: compile(s.target),
}));
const firstJoint = compiledSegs.map((s) => ({
  entry: Infinity, waypoints: s.waypoints.map(() => Infinity), target: Infinity,
}));
const firstSat = compiledSegs.map((s) => ({
  entry: s.entry.map(() => Infinity), waypoints: s.waypoints.map((wp) => wp.map(() => Infinity)), target: s.target.map(() => Infinity),
}));

let won = false;
for (let f = 0; f < route.totalFrames; f++) {
  w.step(1 / 60, { fireboy: fbIn(f), watergirl: wgIn(f) });
  const sa = w.snapshotPlayer("fireboy"), sb = w.snapshotPlayer("watergirl");
  const S = {
    fb: { ...sa, grounded: w.players.fireboy.feetContacts.length > 0 },
    wg: { ...sb, grounded: w.players.watergirl.feetContacts.length > 0 },
  };
  const M = w.mechSnapshot();
  const D = { won: w.phase === "won", doors: w.doors };
  for (let si = 0; si < compiledSegs.length; si++) {
    const cs = compiledSegs[si], fj = firstJoint[si], fs = firstSat[si];
    if (!isFinite(fj.entry)) {
      cs.entry.forEach((c, i) => { if (c.f(S, M, D)) fs.entry[i] = Math.min(fs.entry[i], f); });
      if (allS(cs.entry, S, M, D)) fj.entry = f;
    }
    if (!isFinite(fj.entry)) continue; // 段未入场：waypoint/target 不计（搜索期同语义）
    cs.waypoints.forEach((wp, wi) => {
      if (isFinite(fj.waypoints[wi])) return;
      wp.forEach((c, i) => { if (c.f(S, M, D)) fs.waypoints[wi][i] = Math.min(fs.waypoints[wi][i], f); });
      if (allS(wp, S, M, D)) fj.waypoints[wi] = f;
    });
    if (!isFinite(fj.target)) {
      cs.target.forEach((c, i) => { if (c.f(S, M, D)) fs.target[i] = Math.min(fs.target[i], f); });
      if (allS(cs.target, S, M, D)) fj.target = f;
    }
  }
  if (w.phase === "won") { won = true; break; }
}
if (!won) console.log("警告：绿路线未 WIN？");

// ---- 汇总
let allOk = true;
for (let si = 0; si < compiledSegs.length; si++) {
  const cs = compiledSegs[si], fj = firstJoint[si], fs = firstSat[si];
  const ok = isFinite(fj.entry) && fj.waypoints.every(isFinite) && isFinite(fj.target);
  if (!ok) allOk = false;
  const seg = {
    id: cs.id, title: cs.title, computable: ok,
    entryFirstAllF: isFinite(fj.entry) ? fj.entry : null,
    waypointFirstAllF: fj.waypoints.map((x) => (isFinite(x) ? x : null)),
    targetFirstAllF: isFinite(fj.target) ? fj.target : null,
    greenRefF: cs.greenRefF, horizonF: cs.horizonF,
    assertions: [
      ...cs.entry.map((c, i) => ({ where: "entry", kind: c.kind, path: c.path, firstSatF: isFinite(fs.entry[i]) ? fs.entry[i] : null })),
      ...cs.waypoints.flatMap((wp, wi) => wp.map((c, i) => ({ where: `wp${wi}`, kind: c.kind, path: c.path, firstSatF: isFinite(fs.waypoints[wi][i]) ? fs.waypoints[wi][i] : null }))),
      ...cs.target.map((c, i) => ({ where: "target", kind: c.kind, path: c.path, firstSatF: isFinite(fs.target[i]) ? fs.target[i] : null })),
    ],
  };
  report.segments.push(seg);
  console.log(`${ok ? "OK " : "FAIL"} ${cs.id} entry@${seg.entryFirstAllF} wp=[${seg.waypointFirstAllF}] target@${seg.targetFirstAllF} (greenRef ${cs.greenRefF})`);
  if (!ok) for (const a of seg.assertions) if (a.firstSatF === null) console.log(`   永假: [${a.where}] ${a.kind} ${a.path}`);
}
report.allComputable = allOk;
writeFileSync(new URL("./chain-verify.json", import.meta.url), JSON.stringify(report, null, 1));
console.log(allOk ? "全部断言可计算且在绿路线上满足 ✓" : "存在永假断言（见上）");
