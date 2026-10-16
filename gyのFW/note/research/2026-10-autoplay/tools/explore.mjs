// auto-design 槽·E1a：绿路线回放探查——反推 forest_01 检查点分段用的位置/机关时间线。
// 用法: 仓库内任意 cwd: node --import tsx note/research/2026-10-autoplay/tools/explore.mjs（输出写在本脚本旁 out/）
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
function findRoot(dir) {
  let d = dir;
  for (let i = 0; i < 8; i++) {
    try { readFileSync(join(d, "package.json")); return d; } catch { /* 向上 */ }
    d = dirname(d);
  }
  throw new Error("repo root not found");
}
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
const { makeWorld } = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "kernel.mjs")).href);

import { writeFileSync, mkdirSync } from "node:fs";

const route = JSON.parse(readFileSync(join(ROOT, "scripts/e2e/inputs/routes/forest_01.json"), "utf8"));
const w = makeWorld(route.level);
const ins = { fb: new Map(), wg: new Map() };
const mk = (evs) => {
  const st = { up: false, left: false, right: false };
  const byF = new Map();
  for (const e of evs) byF.set(e.f, [...(byF.get(e.f) ?? []), [e.dir, e.type === "down"]]);
  return (f) => {
    for (const [k, v] of byF.get(f) ?? []) st[k] = v;
    return { ...st };
  };
};
const fbIn = mk(route.fb), wgIn = mk(route.wg);

// 常量：出生点与门位
const spawnFb = w.level.spawn.fireboy, spawnWg = w.level.spawn.watergirl;
const doorFb = w.doors.fireboy.pos.x, doorWg = w.doors.watergirl.pos.x;

const sampled = []; // 每 5 帧采样
const events = [];  // 全事件
let leverFlips = [];
for (let f = 0; f < route.totalFrames; f++) {
  const evs = w.step(1 / 60, { fireboy: fbIn(f), watergirl: wgIn(f) });
  for (const e of evs) {
    const row = { f, ...e };
    if (e.type === "mech") {
      row.event = e.event;
      if (e.event.kind === "lever") leverFlips.push({ f, group: e.event.group, state: e.event.state });
    }
    events.push(row);
  }
  if (f % 5 === 0) {
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    const mech = w.mechSnapshot();
    sampled.push({
      f, fb: [Math.round(a.x), Math.round(a.y), Math.round(a.vx)], wg: [Math.round(b.x), Math.round(b.y), Math.round(b.vx)],
      lev: mech.levers.map((l) => l.state).join(""), plat: mech.platforms.map((p) => `${p.id}:${Math.round(p.y)}`).join(","),
      props: mech.props.map((p) => `${p.id}:${Math.round(p.x)},${Math.round(p.y)}`).join(";"),
    });
  }
  const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
  if (a.dead || a.dying || b.dead || b.dying) { console.log(`DEATH @f${f}`); break; }
  if (w.phase === "won") { console.log(`WIN @f${f}`); break; }
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "explore-trace.json"), JSON.stringify({ spawnFb, spawnWg, doorFb, doorWg, leverFlips, sampled }, null, 1));
writeFileSync(join(OUT, "explore-events.json"), JSON.stringify(events));

// 控制台摘要：每 100 帧一行的位置带
console.log(`spawn fb=(${spawnFb.x},${spawnFb.y}) wg=(${spawnWg.x},${spawnWg.y}) doorFb.x=${doorFb} doorWg.x=${doorWg}`);
console.log("lever flips:", JSON.stringify(leverFlips));
let last = -100;
for (const s of sampled) {
  if (s.f - last < 100) continue;
  last = s.f;
  console.log(`f${String(s.f).padStart(4)} fb=[${s.fb}] wg=[${s.wg}] lev=${s.lev} plat=${s.plat}`);
}
