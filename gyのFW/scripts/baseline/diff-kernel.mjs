/**
 * 金轨迹对拍差分器（保真硬验收）。
 *
 * 用法（Git Bash，先注入便携 Node PATH）：
 *   node --import tsx scripts/baseline/diff-kernel.mjs [golden.json]
 *
 * 原理：吃原版插桩采集的 fixed-dt 金轨迹（scripts/baseline/golden/forest_01_a1_fixeddt.json，
 * 结构见同目录 README），把同一 inputScript 以相同定步长喂给 @fw/shared/kernel 的 World，
 * 逐帧比对各刚体 (x,y,vx,vy,angle)，输出每体最大漂移与首分叉帧。
 *
 * 容差口径（对应 A 报告确定性数据）：原版自身 fixed-dt 双跑漂移 ~0.011m/720 帧；
 * 内核对拍容差按 0.15m 内为"积分细节级一致"，0.15–0.5m 为"行为一致但常数待查"，
 * >0.5m 或运动模式相异为 FAIL。
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLevel } from "../../packages/shared/src/level2.js";
import { World } from "../../packages/shared/src/kernel/world.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const goldenPath = process.argv[2] ?? join(ROOT, "scripts", "baseline", "golden", "forest_01_a1_fixeddt.json");

const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
const levelDir = join(ROOT, "data", "tutorials", "levels");
const levelJson = JSON.parse(readFileSync(join(levelDir, `${golden.meta.level}.json`), "utf8"));
const level = parseLevel(golden.meta.level, levelJson, (source) => {
  const p = new URL(source, "file:///" + levelDir.split("\\").join("/") + "/").pathname.replace(/^\/([A-Za-z]:)/, "$1");
  return JSON.parse(readFileSync(decodeURI(p), "utf8"));
});

const world = new World(level);
const B = world.B;

// 预沉降：原版 f0 前有未采样的开局帧（角色已落稳）
for (let i = 0; i < 60; i++) {
  world.step(1 / 60, { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } });
}

// 输入脚本 → 按帧查表（金轨迹键名 right/left/up；只驱动火人——原脚本仅箭头键）。
// shift=+1 为实测标定：金轨迹的帧序以原版采样钩为准，我们内核逐步对齐时输入事件
// 相差一帧（8.5m/s 巡航 × 1 帧 ≈ 0.14m，是 fb 剩余漂移的主导项；扫描 −2..+2 后取最优）。
const INPUT_SHIFT = 1;
const keymap = { right: "right", left: "left", up: "up" };
const script = golden.meta.inputScript;
const eventsByFrame = new Map();
for (const ev of script) {
  for (const k of ev.down ?? []) eventsByFrame.set(ev.f + INPUT_SHIFT, { key: keymap[k], down: true });
  for (const k of ev.up ?? []) eventsByFrame.set(ev.f + INPUT_SHIFT, { key: keymap[k], down: false });
}
const state = { up: false, left: false, right: false };
const NONE = { up: false, left: false, right: false };

// 金轨迹 tag → 内核体
const mechs = world.mechanisms;
const boxProp = mechs.props.find((p) => p.kind === "box");
const tagToBody = {
  fb: world.players.fireboy.body,
  wg: world.players.watergirl.body,
  pusher_0: mechs.pushers[0]?.body,
  pusher_1: mechs.pushers[1]?.body,
  platform_0: mechs.platforms[0]?.body,
  platform_1: mechs.platforms[1]?.body,
  box_0: boxProp?.body,
  lever_0: mechs.levers[0]?.body,
};

const frames = golden.runs[0].frames;
const dt = frames[0].dt; // 原版 fixed-dt 0.0167
const drift = {}; // tag → {maxDx,maxDy,maxDv,atFrame}
let divergedAt = -1;
const DIVERGE_M = 0.5; // 运动模式相异判据
let worldEvents = [];

for (let f = 0; f < frames.length; f++) {
  const ev = eventsByFrame.get(f);
  if (ev) state[ev.key] = ev.down;
  worldEvents = worldEvents.concat(world.step(dt, { fireboy: { ...state }, watergirl: { ...NONE } }));
  const gf = frames[f].b;
  for (const [tag, body] of Object.entries(tagToBody)) {
    const g = gf[tag];
    if (!g || !body) continue;
    const p = body.GetPosition();
    const v = body.GetLinearVelocity();
    const dx = Math.abs(p.x - g.x);
    const dy = Math.abs(p.y - g.y);
    const dv = Math.hypot(v.x - g.vx, v.y - g.vy);
    const d = (drift[tag] ??= { maxDx: 0, maxDy: 0, maxDv: 0, atFrame: 0 });
    if (dx > d.maxDx) d.maxDx = dx;
    if (dy > d.maxDy) d.maxDy = dy;
    if (dv > d.maxDv) { d.maxDv = dv; d.atFrame = f; }
    if (Math.hypot(dx, dy) > DIVERGE_M && divergedAt < 0) {
      divergedAt = f;
      console.error(`[diff] ${tag} 在帧 ${f} 超过 ${DIVERGE_M}m：gold=(${g.x.toFixed(3)},${g.y.toFixed(3)}) ours=(${p.x.toFixed(3)},${p.y.toFixed(3)})`);
    }
  }
}

console.log(`\n=== 金轨迹对拍（${golden.meta.level}，${frames.length} 帧，dt=${dt}）===`);
let worst = 0;
let sumSq = 0, nBodies = 0;
for (const [tag, d] of Object.entries(drift)) {
  const maxPos = Math.max(d.maxDx, d.maxDy);
  worst = Math.max(worst, maxPos);
  sumSq += maxPos * maxPos;
  nBodies++;
  const grade = maxPos < 0.05 ? "积分细节级" : maxPos < 0.15 ? "一致" : maxPos < 0.5 ? "行为一致(常数待查)" : "FAIL";
  console.log(`${tag.padEnd(12)} maxDx=${d.maxDx.toFixed(4)}m maxDy=${d.maxDy.toFixed(4)}m maxΔv=${d.maxDv.toFixed(3)}m/s @f${d.atFrame} → ${grade}`);
}
console.log(`\n首超 ${DIVERGE_M}m：${divergedAt < 0 ? "无（全程运动模式一致）" : `帧 ${divergedAt}`}`);
console.log(`全刚体 max-位移 RMS：${nBodies ? Math.sqrt(sumSq / nBodies).toFixed(4) : "n/a"} m（${nBodies} 体）`);
console.log(`力事件数：${worldEvents.length}（死亡/钻石/机关等）`);

const report = { golden: goldenPath, frames: frames.length, dt, drift, divergedAt, worstMeters: worst, events: worldEvents.length };
console.log("\n" + JSON.stringify(report, null, 1));
