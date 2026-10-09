// 动画保真度对拍基准（原版实机动画状态轨迹 vs 我方内核状态机）
//
// 用法（Git Bash，先注入便携 Node）：
//   node --import tsx benchmark/fidelity-anim.mjs --capture                  # 采原版参考轨迹（需本地参考包）
//   node --import tsx benchmark/fidelity-anim.mjs --save anim-f1-final       # 跑分并存快照
//   node --import tsx benchmark/fidelity-anim.mjs --compare anim-f1-baseline --legs-rule vx20
//
// 原理：
//   原版侧：capture.mjs 同款基建（8787 静态服 + temple 跳关 + Step 钩子 + --fixed-dt 0.0166667），
//           每物理步采样双角色 { b: 头动画名, lf: legs 帧名, lp: legs 播放中, fc: facing, 位姿 }。
//           输入脚本/帧数直接取自对应 fixeddt 金轨迹 meta（与 fidelity-score 同一输入源）。
//   我方侧：内核 World headless 复跑同一输入（SETTLE=5 / INPUT_SHIFT=1，与 fidelity-score 同口径），
//           每步采样 { anim, facing, 位姿 }；legs 态按客户端规则派生：
//           --legs-rule exact  b==="jumping" → running，否则 idle（= 原版 char-region.js:374-384）
//           --legs-rule vx20   旧近似：jumping 且 |vx屏幕|>20 才 running（F1 修正前）
//   对拍：逐帧比 b（头部状态机）、legs（腿部规则）、facing（仅双端都 jumping 的帧）；
//         对齐窗 = 该角色 |Δpos|≤0.1m 的帧——窗外偏差属物理混沌（fidelity-score 维度），不计入动画分。
//         另报 exBoundary 口径：剔除输入事件 ±2 帧邻域（INPUT_SHIFT 造成迁移沿 ±1 帧抖动属标定噪声）。
//   评分：animIndex = 100·(0.5·headRate + 0.5·legsRate)（对齐窗 + exBoundary）；composite = 各关均值。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { chromium } from "playwright";
import { parseLevel } from "../packages/shared/src/level2.js";
import { World } from "../packages/shared/src/kernel/world.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_A_DIR = resolve(ROOT, "../Fireboy-and-Watergirl/output/A");
const GOLDEN_DIR = join(ROOT, "scripts/baseline/golden");
const RESULTS = join(__dirname, "results");
const GAME_URL = "http://127.0.0.1:8787/gameIndex.html";

// 与 fidelity-score 完全同口径的三条金轨迹（输入脚本从 golden meta 读取）
const LEVELS = [
  { golden: "forest_01_a1_fixeddt" },
  { golden: "forest_03_wind_fixeddt" },
  { golden: "forest_07_ball_fixeddt" },
];
const SETTLE = Number(process.env.BENCH_SETTLE ?? 5);
const INPUT_SHIFT = Number(process.env.DIFF_SHIFT ?? 1);
const FIXED_DT = 0.0166667;
const ALIGNED_EPS = 0.1; // m，对齐窗判据（该角色位置误差）

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name) => argv.includes(name);
const LEGS_RULE = flag("--legs-rule") ?? "exact"; // exact | vx20
if (!["exact", "vx20"].includes(LEGS_RULE)) throw new Error("--legs-rule 只支持 exact|vx20");
const saveLabel = flag("--save");
const cmpLabel = flag("--compare");
const doCapture = has("--capture");

// ---------- 关卡加载（同 fidelity-score） ----------
const CANDIDATE_DIRS = ["data/tutorials/levels", "data/forest/levels"];
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

// ---------- 我方侧：内核复跑 + 客户端规则派生 ----------
const KEYMAP = {
  left: ["fireboy", "left"], right: ["fireboy", "right"], up: ["fireboy", "up"],
  a: ["watergirl", "left"], d: ["watergirl", "right"], w: ["watergirl", "up"],
};

function legsOf(anim, vxScreen) {
  if (LEGS_RULE === "vx20") return anim === "jumping" && Math.abs(vxScreen) > 20 ? "running" : "idle";
  return anim === "jumping" ? "running" : "idle";
}

function runOurs(goldenName) {
  const golden = JSON.parse(readFileSync(join(GOLDEN_DIR, `${goldenName}.json`), "utf8"));
  const level = loadLevel(golden.meta.level);
  const world = new World(level);
  const NONE = { up: false, left: false, right: false };
  for (let i = 0; i < SETTLE; i++) world.step(FIXED_DT, { fireboy: { ...NONE }, watergirl: { ...NONE } });
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
  const dt = FIXED_DT;
  const frames = [];
  const nFrames = golden.runs[0].frames.length;
  for (let f = 0; f < nFrames; f++) {
    for (const e of eventsByFrame.get(f) ?? []) states[e.role][e.key] = e.down;
    world.step(dt, { fireboy: { ...states.fireboy }, watergirl: { ...states.watergirl } });
    const rec = { f };
    for (const role of ["fireboy", "watergirl"]) {
      const c = world.players[role];
      const p = c.body.GetPosition();
      const v = c.body.GetLinearVelocity();
      rec[role] = {
        anim: c.anim,
        facing: c.facing,
        legs: legsOf(c.anim, -32 * v.x),
        x: +p.x.toFixed(4), y: +p.y.toFixed(4), vx: +v.x.toFixed(4), vy: +v.y.toFixed(4),
      };
    }
    frames.push(rec);
  }
  return { frames, inputScript: golden.meta.inputScript ?? [], levelId: golden.meta.level };
}

// ---------- 原版侧：实机动画轨迹采集 ----------
function serveStatic(rootDir, port) {
  const MIME = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".woff": "font/woff", ".css": "text/css" };
  const parentDir = resolve(rootDir, "..");
  return new Promise((res) => {
    const srv = http.createServer((req, res2) => {
      const u = decodeURIComponent((req.url || "/").split("?")[0]);
      const rel = u === "/" ? "gameIndex.html" : u.replace(/^\//, "");
      let p = join(rootDir, rel);
      if (!p.startsWith(rootDir)) { res2.writeHead(403); res2.end(); return; }
      if (!existsSync(p)) p = join(parentDir, rel);
      if (!existsSync(p)) { res2.writeHead(404); res2.end(); return; }
      res2.writeHead(200, { "Content-Type": MIME["." + join(p).split(".").pop()] ?? "application/octet-stream", "Cache-Control": "no-cache" });
      res2.end(readFileSync(p));
    });
    srv.listen(port, "127.0.0.1", () => res(srv));
  });
}

async function launchBrowser() {
  for (const channel of ["msedge", "chrome"]) {
    try {
      const b = await chromium.launch({
        channel, headless: true,
        args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
      });
      console.log(`[anim] browser channel: ${channel}`);
      return b;
    } catch { /* 下一个 channel */ }
  }
  throw new Error("no system Edge/Chrome found");
}

const INIT_HOOKS = `
  window.__KEYMAP = { left: 37, up: 38, right: 39, down: 40, a: 65, w: 87, d: 68, s: 83 };
  window.__dispatchKey = function (type, code) {
    var ev = new KeyboardEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'keyCode', { get: function () { return code; } });
    Object.defineProperty(ev, 'which', { get: function () { return code; } });
    Object.defineProperty(ev, 'key', { get: function () { return String(code); } });
    document.dispatchEvent(ev);
  };
`;
const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } })()`;
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { const g = require('Phaser').GAMES[0]; return g.physics && g.physics.box2d && g.physics.box2d.paused === false; } catch { return false; } })()`;

const RESOLVE_LEVEL = (level) => `(function () {
  var g = require('Phaser').GAMES[0];
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
  if (!temple) return null;
  var hit = temple.levels.find(function (l) { return l.filename.indexOf('/${level}.json') >= 0; });
  return hit ? hit.filename : null;
})()`;

const NAVIGATE = (filename) => `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
  var levelData = temple.levels.find(function (l) { return l.filename === ${JSON.stringify(filename)}; });
  if (!levelData) throw new Error('level not found: ${filename}');
  g.currentTemple = temple;
  g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return { filename: levelData.filename, id: levelData.id };
})()`;

// 动画采样钩子：与 capture.mjs 同一 Step 包裹点，采样改为动画状态
const INSTALL_ANIM_HOOK = (script, maxFrames) => `(function () {
  var g = require('Phaser').GAMES[0];
  var L = g.level;
  var plugin = g.physics.box2d;
  var origUpdate = plugin.update;
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function animSample(pers) {
    try {
      var h = pers.bodyParts.head.animations;
      var l = pers.bodyParts.legs.animations;
      var p = pers.body.data.GetPosition(), v = pers.body.data.GetLinearVelocity();
      return {
        b: h.name || null,
        lf: pers.bodyParts.legs.frameName || null,
        lp: !!l.isPlaying, ln: l.name || null,
        fc: pers.facing === undefined ? null : String(pers.facing),
        x: r4(p.x), y: r4(p.y), vx: r4(v.x), vy: r4(v.y),
      };
    } catch (e) { return null; }
  }
  window.__cap = { frameIndex: 0, cursor: 0, keyState: {}, samples: [], script: ${JSON.stringify(script)}, maxFrames: ${maxFrames}, stopped: false, status: 'running' };
  var cap = window.__cap;
  plugin.update = function () {
    if (cap.stopped) { origUpdate.call(this); return; }
    var s = cap.script;
    while (cap.cursor < s.length && s[cap.cursor].f <= cap.frameIndex) {
      var step = s[cap.cursor++];
      var dn = step.down || [], up = step.up || [];
      for (var i = 0; i < dn.length; i++) {
        var c1 = window.__KEYMAP[dn[i]]; if (c1 == null) continue;
        if (!cap.keyState[dn[i]]) { cap.keyState[dn[i]] = true; window.__dispatchKey('keydown', c1); }
      }
      for (var j = 0; j < up.length; j++) {
        var c2 = window.__KEYMAP[up[j]]; if (c2 == null) continue;
        if (cap.keyState[up[j]]) { cap.keyState[up[j]] = false; window.__dispatchKey('keyup', c2); }
      }
    }
    var dt = Math.min(0.04, this.game.time.elapsed / 1e3);
    if (dt > 0) { /* 固定 dt：钉成常数与 fidelity-score 口径一致 */ }
    this.game.time.elapsed = ${FIXED_DT} * 1e3;
    origUpdate.call(this);
    if (this.paused) {
      if (!cap.pausedSampled) {
        cap.pausedSampled = true;
        cap.samples.push({ f: cap.frameIndex, fb: animSample(L.pers1), wg: animSample(L.pers2), fl: { ended: !!L.ended, dead1: !!L.pers1.isDead, dead2: !!L.pers2.isDead } });
        cap.endFrame = cap.frameIndex;
        cap.status = 'ended';
        cap.stopped = true;
      }
      return;
    }
    cap.samples.push({ f: cap.frameIndex, fb: animSample(L.pers1), wg: animSample(L.pers2), fl: { ended: !!L.ended, dead1: !!L.pers1.isDead, dead2: !!L.pers2.isDead } });
    cap.frameIndex++;
    var fl = cap.samples[cap.samples.length - 1].fl;
    if (fl.ended || fl.dead1 || fl.dead2) { cap.endFrame = cap.frameIndex; cap.status = fl.ended ? 'ended' : 'dead'; cap.stopped = true; }
    else if (cap.frameIndex >= cap.maxFrames) { cap.stopped = true; cap.status = 'frames-done'; }
  };
  return true;
})()`;

const DRAIN = `(function () {
  var cap = window.__cap;
  if (!cap) return { status: 'no-cap', chunk: [] };
  return { status: cap.status, frameIndex: cap.frameIndex, chunk: cap.samples.splice(0, cap.samples.length) };
})()`;

async function captureOnce(browser, levelId, script, maxFrames) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await context.newPage();
  await page.addInitScript(INIT_HOOKS);
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (!u.startsWith("http://127.0.0.1:8787")) return route.abort();
    if (/\.mp3(\?|$)/.test(u)) return route.abort();
    return route.continue();
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  try {
    await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(READY_PROG, null, { timeout: 90000, polling: 250 });
    const filename = await page.evaluate(RESOLVE_LEVEL(levelId));
    if (!filename) throw new Error(`level ${levelId} not found`);
    await page.evaluate(NAVIGATE(filename));
    try {
      await page.waitForFunction(READY_LEVEL, null, { timeout: 30000, polling: 100 });
    } catch {
      await page.evaluate(NAVIGATE(filename));
      try {
        await page.waitForFunction(READY_LEVEL, null, { timeout: 45000, polling: 100 });
      } catch {
        await page.evaluate(NAVIGATE(filename));
        await page.waitForFunction(READY_LEVEL, null, { timeout: 45000, polling: 100 });
      }
    }
    await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 100 });
    await page.evaluate(`require('Phaser').GAMES[0].lockRender = true`);
    await page.evaluate(INSTALL_ANIM_HOOK(script, maxFrames));
    const frames = [];
    let status = "running";
    for (let i = 0; i < 2000; i++) {
      const d = await page.evaluate(DRAIN);
      frames.push(...d.chunk);
      status = d.status;
      if (d.stopped || d.status !== "running") break;
      await page.waitForTimeout(120);
    }
    return { frames, status, errors };
  } finally {
    await context.close();
  }
}

async function captureLevel(browser, goldenName) {
  const golden = JSON.parse(readFileSync(join(GOLDEN_DIR, `${goldenName}.json`), "utf8"));
  const levelId = golden.meta.level;
  const script = golden.meta.inputScript ?? [];
  const maxFrames = golden.runs[0].frames.length;
  console.log(`[anim] capture ${levelId}: ${maxFrames} frames, ${script.length} input events`);
  const runs = [];
  for (let r = 0; r < 2; r++) {
    const run = await captureOnce(browser, levelId, script, maxFrames);
    if (run.errors.length) console.log(`[anim] ${levelId} run${r} pageerrors: ${run.errors.length}`);
    runs.push(run);
    console.log(`[anim] ${levelId} run${r}: ${run.frames.length} frames, status=${run.status}`);
  }
  // 确定性复验：状态层（b/fc）逐帧一致。lf 的 running 帧号由墙钟驱动（Phaser 2 Animation 用
  // game.time.now 推帧，--fixed-dt 钉不住），不进确定性判据；lf 仅取前缀派生 legs 态。
  const sig = (run) => run.frames.map((f) => `${f.fb ? f.fb.b + "|" + f.fb.fc : "x"}|${f.wg ? f.wg.b + "|" + f.wg.fc : "x"}`).join(";");
  const drift = sig(runs[0]) !== sig(runs[1]);
  if (drift) console.log(`[anim] ⚠ ${levelId} 两次运行状态轨迹有漂移，取 run0`);
  // 黄金自检：原版自身轨迹上验证腿部规则 b==="jumping" ⟺ legs 前缀 _legs_running
  let violation = 0;
  for (const f of runs[0].frames) {
    for (const s of [f.fb, f.wg]) {
      if (!s || !s.lf) continue;
      if ((s.b === "jumping") !== s.lf.includes("_legs_running")) violation++;
    }
  }
  console.log(`[anim] ${levelId} 原版腿部规则自检违例: ${violation}/${runs[0].frames.length * 2}`);
  return { level: levelId, golden: goldenName, date: new Date().toISOString(), fixedDt: FIXED_DT, frames: runs[0].frames, runs: 2, animDrift: drift, legsRuleViolations: violation, status: runs[0].status };
}

// ---------- 对拍评分 ----------
function refLegsState(s) {
  if (!s || !s.lf) return null;
  return s.lf.includes("_legs_running") ? "running" : "idle";
}

function compareRole(ourFrames, refFrames, role, inputScript) {
  const n = Math.min(ourFrames.length, refFrames.length);
  // 输入事件 ±2 帧邻域（INPUT_SHIFT 迁移沿抖动）
  const nearEvent = new Array(n).fill(false);
  for (const ev of inputScript) {
    for (let k = ev.f - 2; k <= ev.f + 2 + 1; k++) if (k >= 0 && k < n) nearEvent[k] = true;
  }
  let win = { n: 0, head: 0, legs: 0, face: { n: 0, ok: 0 } };
  let winEx = { n: 0, head: 0, legs: 0, face: { n: 0, ok: 0 } };
  let full = { n: 0, head: 0, legs: 0 };
  let firstMismatch = -1;
  for (let i = 0; i < n; i++) {
    const o = ourFrames[i][role];
    const r = refFrames[i][role === "fireboy" ? "fb" : "wg"];
    if (!o || !r) continue;
    const posErr = Math.hypot(o.x - r.x, o.y - r.y);
    const aligned = posErr <= ALIGNED_EPS;
    const hb = o.anim === r.b;
    const lb = o.legs === refLegsState(r);
    full.n++;
    if (hb) full.head++;
    if (lb) full.legs++;
    if (firstMismatch < 0 && (!hb || !lb)) firstMismatch = i;
    if (!aligned) continue;
    win.n++;
    if (hb) win.head++;
    if (lb) win.legs++;
    if (!nearEvent[i]) {
      winEx.n++;
      if (hb) winEx.head++;
      if (lb) winEx.legs++;
      if (o.anim === "jumping" && r.b === "jumping") {
        winEx.face.n++;
        if ((o.facing < 0) === (r.fc === "left")) winEx.face.ok++;
      }
    }
  }
  const rate = (a, b) => (b.n > 0 ? a / b.n : null);
  return {
    comparedFrames: n,
    alignedFrames: win.n,
    firstMismatch,
    window: { headRate: +rate(win.head, win).toFixed(4), legsRate: +rate(win.legs, win).toFixed(4) },
    windowExBoundary: {
      headRate: +rate(winEx.head, winEx).toFixed(4),
      legsRate: +rate(winEx.legs, winEx).toFixed(4),
      facingRate: winEx.face.n > 0 ? +rate(winEx.face.ok, winEx.face).toFixed(4) : null,
    },
    full: { headRate: +rate(full.head, full).toFixed(4), legsRate: +rate(full.legs, full).toFixed(4) },
  };
}

function scoreLevel(ours, ref) {
  const out = { level: ref.level };
  let sum = 0, cnt = 0;
  for (const role of ["fireboy", "watergirl"]) {
    const c = compareRole(ours.frames, ref.frames, role, ours.inputScript);
    out[role] = c;
    const { headRate, legsRate } = c.windowExBoundary;
    if (headRate != null && legsRate != null) {
      out[role].animScore = +(100 * (0.5 * headRate + 0.5 * legsRate)).toFixed(2);
      sum += out[role].animScore;
      cnt++;
    }
  }
  out.animIndex = cnt > 0 ? +(sum / cnt).toFixed(2) : null;
  return out;
}

// ---------- 主流程 ----------
mkdirSync(RESULTS, { recursive: true });

if (doCapture) {
  const srv = await serveStatic(OUT_A_DIR, 8787);
  try {
    for (const lv of LEVELS) {
      // 每关独立浏览器进程：同一进程内"跑满采集帧的 context"之后新 context 可能卡关卡加载
      //（金轨迹时代的 capture.mjs 每次调用只采一关，从未跨越此边界）
      const browser = await launchBrowser();
      try {
        const ref = await captureLevel(browser, lv.golden);
        const out = join(RESULTS, `anim-ref-${ref.level}.json`);
        writeFileSync(out, JSON.stringify(ref));
        console.log(`[anim] 参考轨迹已写入 ${out} (${ref.frames.length} 帧, drift=${ref.animDrift}, 违例=${ref.legsRuleViolations})`);
      } finally {
        await browser.close();
      }
    }
  } finally {
    srv.close();
  }
  process.exit(0);
}

// 评分：读参考轨迹 + 我方内核复跑
const levelScores = [];
for (const lv of LEVELS) {
  const golden = JSON.parse(readFileSync(join(GOLDEN_DIR, `${lv.golden}.json`), "utf8"));
  const refPath = join(RESULTS, `anim-ref-${golden.meta.level}.json`);
  if (!existsSync(refPath)) throw new Error(`缺参考轨迹 ${refPath}——先跑 --capture`);
  const ref = JSON.parse(readFileSync(refPath, "utf8"));
  const ours = runOurs(lv.golden);
  levelScores.push(scoreLevel(ours, ref));
}
const composite = +(
  levelScores.reduce((s, l) => s + (l.animIndex ?? 0), 0) / levelScores.filter((l) => l.animIndex != null).length
).toFixed(2);

const result = {
  label: saveLabel ?? cmpLabel ?? "run",
  date: new Date().toISOString(),
  legsRule: LEGS_RULE,
  levels: Object.fromEntries(levelScores.map((l) => [l.level, l])),
  composite,
};

for (const l of levelScores) {
  console.log(`\n== ${l.level} ==  animIndex=${l.animIndex}`);
  for (const role of ["fireboy", "watergirl"]) {
    const r = l[role];
    console.log(`  ${role}: score=${r.animScore} 对齐窗 ${r.alignedFrames}/${r.comparedFrames} 帧 | head ${r.window.headRate}→exBoundary ${r.windowExBoundary.headRate} | legs ${r.window.legsRate}→exB ${r.windowExBoundary.legsRate} | facing ${r.windowExBoundary.facingRate ?? "-"} | 首个不一致 f${r.firstMismatch}`);
  }
}
console.log(`\n动画复刻度 composite = ${composite}（legsRule=${LEGS_RULE}）`);

if (saveLabel) {
  const out = join(RESULTS, `${saveLabel}.json`);
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`快照已写入 ${out}`);
}

if (cmpLabel) {
  const base = JSON.parse(readFileSync(join(RESULTS, `${cmpLabel}.json`), "utf8"));
  console.log(`\n===== 前后对比（基线 ${cmpLabel}，legsRule=${base.legsRule} → 当前 ${LEGS_RULE}） =====`);
  console.log("关卡        | 基线 composite→当前 | fb 基线→当前 | wg 基线→当前");
  for (const l of levelScores) {
    const b = base.levels[l.level];
    if (!b) continue;
    console.log(
      `${l.level.padEnd(11)} | ${b.animIndex} → ${l.animIndex} | ${b.fireboy.animScore} → ${l.fireboy.animScore} | ${b.watergirl.animScore} → ${l.watergirl.animScore}`,
    );
  }
  console.log(`composite: ${base.composite} → ${composite}`);
}
