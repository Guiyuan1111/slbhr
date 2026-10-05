/**
 * 金轨迹对拍差分器（保真硬验收）——泛化版：支持任意机关关。
 *
 * 用法（Git Bash，先注入便携 Node PATH）：
 *   node --import tsx scripts/baseline/diff-kernel.mjs [golden.json]
 *
 * 原理：吃原版插桩采集的 fixed-dt 金轨迹（scripts/baseline/golden/*.json），把同一
 * inputScript 以相同定步长喂给 @fw/shared/kernel 的 World，逐帧比对 tracked 刚体
 * (x,y,vx,vy)。体映射按 golden 的 trackedBodies tag 泛化解析（lever_N ↔ 内核同类下标）。
 *
 * 阈值口径：积分细节级 <0.05m、行为一致 <0.15m、>0.5m FAIL；RMS 为全刚体汇总敏感度指标。
 * 输入对齐：INPUT_SHIFT=+1 为实测标定（金轨迹采样钩 vs 内核逐步的 1 帧相位差，
 * 8.5m/s 巡航 × 1 帧 ≈ 0.14m，为 fb 剩余漂移主导项；扫描 −2..+2 取最优）。
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLevel } from "../../packages/shared/src/level2.js";
import { World } from "../../packages/shared/src/kernel/world.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const goldenPath = process.argv[2] ?? join(ROOT, "scripts", "baseline", "golden", "forest_01_a1_fixeddt.json");

const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
const LEVEL = golden.meta.level;
// 关卡目录查找：tutorials / forest（bonus 在 forest/levels 内）
const CANDIDATE_DIRS = ["data/tutorials/levels", "data/forest/levels"];
let levelDir = null;
for (const d of CANDIDATE_DIRS) {
  try {
    readFileSync(join(ROOT, d, `${LEVEL}.json`), "utf8");
    levelDir = join(ROOT, d);
    break;
  } catch { /* 试下一个 */ }
}
if (!levelDir) {
  console.error(`找不到关卡 ${LEVEL}（查过 ${CANDIDATE_DIRS.join(", ")}）`);
  process.exit(1);
}
const levelJson = JSON.parse(readFileSync(join(levelDir, `${LEVEL}.json`), "utf8"));
const level = parseLevel(LEVEL, levelJson, (source) => {
  const p = new URL(source, "file:///" + levelDir.split("\\").join("/") + "/").pathname.replace(/^\/([A-Za-z]:)/, "$1");
  return JSON.parse(readFileSync(decodeURI(p), "utf8"));
});

const world = new World(level);
const mechs = world.mechanisms;

/** 输入脚本 → 按帧查表（原版键名：方向键=火人、WASD=水女孩；INPUT_SHIFT 见文件头） */
const INPUT_SHIFT = 1;
const KEYMAP = {
  left: { role: "fireboy", key: "left" },
  right: { role: "fireboy", key: "right" },
  up: { role: "fireboy", key: "up" },
  a: { role: "watergirl", key: "left" },
  d: { role: "watergirl", key: "right" },
  w: { role: "watergirl", key: "up" },
};
const eventsByFrame = new Map();
for (const ev of golden.meta.inputScript ?? []) {
  for (const k of ev.down ?? []) {
    const m = KEYMAP[k];
    if (m) eventsByFrame.set(ev.f + INPUT_SHIFT, { role: m.role, key: m.key, down: true });
  }
  for (const k of ev.up ?? []) {
    const m = KEYMAP[k];
    if (m) eventsByFrame.set(ev.f + INPUT_SHIFT, { role: m.role, key: m.key, down: false });
  }
}
const states = {
  fireboy: { up: false, left: false, right: false },
  watergirl: { up: false, left: false, right: false },
};

/** tag → 内核体（同类下标一一对应：两侧都按对象层顺序创建） */
const boxProps = mechs.props.filter((p) => !p.heavy);
const heavyProps = mechs.props.filter((p) => p.heavy);
const ballProps = mechs.props.filter((p) => p.kind === "ball");
function bodyForTag(tag) {
  if (tag === "fb") return world.players.fireboy.body;
  if (tag === "wg") return world.players.watergirl.body;
  const m = tag.match(/^(.+?)_(\d+)$/);
  if (!m) return undefined;
  const [, kind, idxStr] = m;
  const n = Number(idxStr);
  switch (kind) {
    case "fb": return world.players.fireboy.body;
    case "wg": return world.players.watergirl.body;
    case "lever": return mechs.levers[n]?.body;
    case "pusher": return mechs.pushers[n]?.body;
    case "platform": return mechs.platforms[n]?.body;
    case "box": return boxProps[n]?.body;
    case "boxheavy": return heavyProps[n]?.body;
    case "ball": return ballProps[n]?.body;
    case "wind": return mechs.winds[n]?.body;
    case "hanging": return mechs.hangings[n]?.platform; // 原版 deviceBody 取锚点体时记录为待核
    case "pulley": return mechs.pulleys[n]?.plat1;
    case "roman": return mechs.romans[n]?.bar;
    default: return undefined; // window/ground 等静态体或未映射项跳过
  }
}

// 预沉降：原版 f0 前有未采样的开局帧（角色已落稳、机关就位）
const NONE = { up: false, left: false, right: false };
for (let i = 0; i < 60; i++) {
  world.step(1 / 60, { fireboy: { ...NONE }, watergirl: { ...NONE } });
}

const frames = golden.runs[0].frames;
const dt = frames[0].dt; // 原版 fixed-dt（≈1/60）
const tags = Object.keys(frames[0].b);
const tagToBody = {};
for (const tag of tags) {
  const body = bodyForTag(tag);
  if (body) tagToBody[tag] = body;
}
const unmapped = tags.filter((t) => !tagToBody[t] && t !== "ground");

const drift = {};
let divergedAt = -1;
const DIVERGE_M = 0.5;
let worldEvents = [];

for (let f = 0; f < frames.length; f++) {
  const ev = eventsByFrame.get(f);
  if (ev) states[ev.role][ev.key] = ev.down;
  worldEvents = worldEvents.concat(world.step(dt, { fireboy: { ...states.fireboy }, watergirl: { ...states.watergirl } }));
  const gf = frames[f].b;
  for (const [tag, body] of Object.entries(tagToBody)) {
    const g = gf[tag];
    if (!g) continue;
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

console.log(`\n=== 金轨迹对拍（${LEVEL}，${frames.length} 帧，dt=${dt}）===`);
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
if (unmapped.length) console.log(`未映射体（跳过比对）：${unmapped.join(", ")}`);
console.log(`\n首超 ${DIVERGE_M}m：${divergedAt < 0 ? "无（全程运动模式一致）" : `帧 ${divergedAt}`}`);
console.log(`全刚体 max-位移 RMS：${nBodies ? Math.sqrt(sumSq / nBodies).toFixed(4) : "n/a"} m（${nBodies} 体）`);
console.log(`力事件数：${worldEvents.length}（死亡/钻石/机关等）`);

const report = { golden: goldenPath, level: LEVEL, frames: frames.length, dt, drift, divergedAt, worstMeters: worst, events: worldEvents.length };
console.log("\n" + JSON.stringify(report, null, 1));
