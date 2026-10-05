// 复刻度量化基准（保真度评分程序）
//
// 用法（Git Bash，先注入便携 Node）：
//   export PATH="$PWD/TEMP/node:$PATH"
//   node benchmark/fidelity-score.mjs                          # 跑分并打印
//   node benchmark/fidelity-score.mjs --save v0.3.4            # 跑分并存快照 benchmark/results/v0.3.4.json
//   node benchmark/fidelity-score.mjs --compare v0.3.4         # 跑分并与快照对比（前后表）
//
// 指标口径（对每条金轨迹的每个追踪刚体）：
//   maxDisp   逐帧位置误差 |Δp| 最大值（米）
//   finalDisp 末帧位置误差（米）——终态保真，最强信号
//   trajRMS   全帧位置误差均方根（米）——持续性漂移敏感
//   maxDv     速度误差最大值（m/s）
// 评分（0-100，平滑单调）：
//   bodyScore = 100·exp(−max(0, maxDisp−0.05)/0.6)   （0.05m→100，0.15→85，0.5→57，1→34，2→8）
//   endScore  = 100·exp(−max(0, finalDisp−0.02)/0.3) （0.02m→100，0.15→66，0.5→26）
//   综合复刻度 = 0.6·mean(bodyScore) + 0.4·mean(endScore)，全金轨迹全体取均值
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { parseLevel } from "../packages/shared/src/level2.js";
import { World } from "../packages/shared/src/kernel/world.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GOLDENS = [
  "forest_01_a1_fixeddt",
  "forest_03_wind_fixeddt",
  "forest_04_pulley_fixeddt",
  "forest_07_ball_fixeddt",
  "forest_bonus_2_boxheavy_fixeddt",
];
const CANDIDATE_DIRS = ["data/tutorials/levels", "data/forest/levels"];
const SETTLE = Number(process.env.BENCH_SETTLE ?? 5); // 金轨迹 f0=起跑后第5帧（角色下落3.45px 实证）
const INPUT_SHIFT = Number(process.env.DIFF_SHIFT ?? 1);

const KEYMAP = {
  left: ["fireboy", "left"], right: ["fireboy", "right"], up: ["fireboy", "up"],
  a: ["watergirl", "left"], d: ["watergirl", "right"], w: ["watergirl", "up"],
};

function loadLevel(levelId) {
  for (const d of CANDIDATE_DIRS) {
    const p = join(ROOT, d, `${levelId}.json`);
    if (existsSync(p)) {
      const dir = join(ROOT, d);
      return parseLevel(levelId, JSON.parse(readFileSync(p, "utf8")), (s) => {
        const u = new URL(s, "file:///" + dir.split("\\").join("/") + "/").pathname.replace(/^\/([A-Za-z]:)/, "$1");
        return JSON.parse(readFileSync(decodeURI(u), "utf8"));
      });
    }
  }
  throw new Error(`找不到关卡 ${levelId}`);
}

function bodyForTag(world, mechs, tag) {
  if (tag === "fb") return world.players.fireboy.body;
  if (tag === "wg") return world.players.watergirl.body;
  const m = tag.match(/^(.+?)_(\d+)$/);
  if (!m) return undefined;
  const kind = m[1], n = Number(m[2]);
  const boxProps = mechs.props.filter((p) => p.kind === "box");
  const heavyProps = mechs.props.filter((p) => p.kind === "boxheavy");
  const ballProps = mechs.props.filter((p) => p.kind === "ball");
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
    case "hanging": return mechs.hangings[n]?.platform;
    case "pulley": return mechs.pulleys[n]?.plat1;
    case "roman": return mechs.romans[n]?.bar;
    default: return undefined;
  }
}

function runGolden(name) {
  const golden = JSON.parse(readFileSync(join(ROOT, "scripts/baseline/golden", `${name}.json`), "utf8"));
  const level = loadLevel(golden.meta.level);
  const world = new World(level);
  const mechs = world.mechanisms;
  const NONE = { up: false, left: false, right: false };
  for (let i = 0; i < SETTLE; i++) world.step(1 / 60, { fireboy: { ...NONE }, watergirl: { ...NONE } });
  const eventsByFrame = new Map();
  for (const ev of golden.meta.inputScript ?? []) {
    for (const k of [...(ev.up ?? []), ...(ev.down ?? [])]) {
      const mk = KEYMAP[k];
      if (!mk) continue;
      const fk = ev.f + INPUT_SHIFT;
      if (!eventsByFrame.has(fk)) eventsByFrame.set(fk, []);
      eventsByFrame.get(fk).push({ role: mk[0], key: mk[1], down: (ev.down ?? []).includes(k) });
    }
  }
  const states = { fireboy: { ...NONE }, watergirl: { ...NONE } };
  const frames = golden.runs[0].frames;
  const dt = frames[0].dt;
  const tags = Object.keys(frames[0].b).filter((t) => t !== "ground");
  const tracked = {};
  for (const tag of tags) {
    const body = bodyForTag(world, mechs, tag);
    if (body) tracked[tag] = { body, maxDisp: 0, maxDv: 0, sumSq: 0, n: 0, final: 0 };
  }
  for (let f = 0; f < frames.length; f++) {
    for (const e of eventsByFrame.get(f) ?? []) states[e.role][e.key] = e.down;
    world.step(dt, { fireboy: { ...states.fireboy }, watergirl: { ...states.watergirl } });
    const gf = frames[f].b;
    for (const [tag, t] of Object.entries(tracked)) {
      const g = gf[tag];
      if (!g) continue;
      const p = t.body.GetPosition();
      const v = t.body.GetLinearVelocity();
      const disp = Math.hypot(p.x - g.x, p.y - g.y);
      const dv = Math.hypot(v.x - g.vx, v.y - g.vy);
      if (disp > t.maxDisp) t.maxDisp = disp;
      if (dv > t.maxDv) t.maxDv = dv;
      t.sumSq += disp * disp;
      t.n++;
      t.final = disp;
    }
  }
  const bodies = {};
  for (const [tag, t] of Object.entries(tracked)) {
    bodies[tag] = {
      maxDisp: +t.maxDisp.toFixed(4),
      finalDisp: +t.final.toFixed(4),
      trajRMS: +(Math.sqrt(t.sumSq / Math.max(1, t.n))).toFixed(4),
      maxDv: +t.maxDv.toFixed(3),
      bodyScore: +(100 * Math.exp(-Math.max(0, t.maxDisp - 0.05) / 0.6)).toFixed(2),
      endScore: +(100 * Math.exp(-Math.max(0, t.final - 0.02) / 0.3)).toFixed(2),
    };
  }
  const all = Object.values(bodies);
  const composite = +(
    0.6 * (all.reduce((s, b) => s + b.bodyScore, 0) / all.length) +
    0.4 * (all.reduce((s, b) => s + b.endScore, 0) / all.length)
  ).toFixed(2);
  return { golden: name, level: golden.meta.level, frames: frames.length, bodies, composite };
}

function gitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const argv = process.argv.slice(2);
const saveIdx = argv.indexOf("--save");
const cmpIdx = argv.indexOf("--compare");

const report = { meta: { generatedAt: new Date().toISOString(), git: gitSha(), inputShift: INPUT_SHIFT, settle: SETTLE }, levels: [], composite: 0 };
for (const g of GOLDENS) {
  const r = runGolden(g);
  report.levels.push(r);
  console.log(`\n=== ${r.golden}（${r.frames} 帧）综合 ${r.composite} ===`);
  for (const [tag, b] of Object.entries(r.bodies)) {
    console.log(
      `  ${tag.padEnd(12)} max=${String(b.maxDisp).padStart(7)}m 终态=${String(b.finalDisp).padStart(7)}m rms=${String(b.trajRMS).padStart(7)}m ` +
      `Δv=${String(b.maxDv).padStart(6)} 分=${String(b.bodyScore).padStart(6)}/终${String(b.endScore).padStart(6)}`
    );
  }
}
report.composite = +(report.levels.reduce((s, l) => s + l.composite, 0) / report.levels.length).toFixed(2);
console.log(`\n████ 综合复刻度指数：${report.composite} / 100 █████`);

if (saveIdx >= 0) {
  const label = argv[saveIdx + 1];
  mkdirSync(join(ROOT, "benchmark/results"), { recursive: true });
  const out = join(ROOT, "benchmark/results", `${label}.json`);
  writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(`已保存快照 → ${out}`);
}

if (cmpIdx >= 0) {
  const label = argv[cmpIdx + 1];
  const before = JSON.parse(readFileSync(join(ROOT, "benchmark/results", `${label}.json`), "utf8"));
  console.log(`\n===== 对比：基线 ${label}（${before.meta.git}）vs 当前（${report.meta.git}）=====`);
  console.log(`综合：${before.composite} → ${report.composite}（${(report.composite - before.composite).toFixed(2)}）`);
  for (let i = 0; i < report.levels.length; i++) {
    const B = before.levels[i], A = report.levels[i];
    const rows = [];
    for (const tag of Object.keys(A.bodies)) {
      const b = B.bodies[tag], a = A.bodies[tag];
      if (!b) continue;
      const d = +(a.maxDisp - b.maxDisp).toFixed(3);
      if (Math.abs(d) > 0.005) rows.push(`${tag} ${b.maxDisp}→${a.maxDisp}m（${d > 0 ? "+" : ""}${d}）`);
    }
    console.log(`${A.golden}: 综合 ${B.composite}→${A.composite}${rows.length ? "\n    " + rows.join("\n    ") : "（逐体无显著变化）"}`);
  }
}
