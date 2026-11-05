/**
 * `updateMechs` 内部按机关类的**批量**分解（r51 新增）。
 *
 * ## 为什么不用逐回调打点
 * `perf-update.mjs` 的 r51 版在每个 `cbXxx` 回调外包计时。`performance.now()` 在本
 * 环境量化到 **100 µs**，而**每个元素**触发一次 `cbXxx`（47 平台 = 47 次取时钟对），
 * 于是：① 单元素读数只有 0/100 两档；② 每次取时钟 + try/finally 的开销本身
 * 就与被测对象同量级，**测的是钩子不是代码**。r51 实测该口径下整帧 270.5µs，
 * 而无钩子消融口径基线 178.0µs——钩子凭空多出 92.5µs。
 *
 * ## 口径：批量
 * 对每一类跑 `N` 趟 `st.<coll>.forEach(cbXxx)`，只取 **1 对**时钟，
 * `N` 自适应到单趟 ≥20ms（100µs 量化 → 相对误差 <0.5%）。
 *
 * ## 固有局限（写进报告）
 * 反复喂**同一份快照**：首趟之后 Phaser 脏守卫生效、`MechanismSmoother` 也收敛，
 * 所以测到的是**稳态下界**（不含真实位移导致的 `setPosition/setAngle` 重绘）。
 * 本件同时报告「采样窗口内实际位移的机关数」用于对齐——两者合起来才能解释
 * 消融口径的 122µs。
 *
 * 用法：
 *   node --import tsx benchmark/perf-mech-class.mjs
 *   LEVEL=forest_bonus_2 ROUNDS=7 node --import tsx benchmark/perf-mech-class.mjs --save r51-mechclass
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { enterAs, waitForStarted } from "../scripts/e2e/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = Number(process.env.PORT ?? 3675);
const LEVEL = process.env.LEVEL ?? "forest_bonus_2";
const ROUNDS = Number(process.env.ROUNDS ?? 7);
const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;

/** 集合名 → 回调名（与 updateMechs 的 15 趟 + updatePlatformSound 的 1 趟一一对应） */
const CLASSES = [
  ["levers", "cbLevers"], ["pushers", "cbPushers"], ["platforms", "cbPlatforms"],
  ["props", "cbProps"], ["winds", "cbWinds"], ["hangings", "cbHangings"],
  ["pulleys", "cbPulleys"], ["romans", "cbRomans"],
  ["beamers", "cbBeamers"], ["rotMirrors", "cbRotMirrors"], ["boxMirrors", "cbBoxMirrors"],
  ["infiniteMirrors", "cbInfiniteMirrors"], ["lightPushers", "cbLightPushers"],
  ["sliders", "cbSliders"], ["timedPushers", "cbTimedPushers"],
];

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1", FW_WIND_PHASE: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 60000);
    child.stdout.on("data", (buf) => {
      const s = String(buf);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    });
    child.stderr.on("data", () => {});
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

const PROBE = `async ({ classes, rounds }) => {
  const g = window.__fw;
  const scene = g.scene.getScene("Game");
  const st = scene.d?.net?.room?.state;
  if (!st) return { error: "state 不可用" };
  const now = () => performance.now();
  const TARGET_MS = 20;

  const bench = (fn) => {
    // 标定：单趟 ≥20ms
    let n = 1;
    while (n < (1 << 20)) {
      const t0 = now();
      for (let i = 0; i < n; i++) fn();
      if (now() - t0 >= TARGET_MS) break;
      n *= 2;
    }
    for (let i = 0; i < 2; i++) { const t0 = now(); for (let j = 0; j < n; j++) fn(); } // 预热
    const out = [];
    for (let r = 0; r < rounds; r++) {
      const t0 = now();
      for (let j = 0; j < n; j++) fn();
      out.push(((now() - t0) / n) * 1000); // µs/pass
    }
    out.sort((a, b) => a - b);
    return { med: out[Math.floor(out.length / 2)], min: out[0], max: out[out.length - 1], n };
  };

  const res = { classes: [], moved: {} };
  for (const [coll, cbName] of classes) {
    const c = st[coll];
    let count = 0;
    try { c?.forEach?.(() => { count++; }); } catch { continue; }
    if (!count) continue;
    const cb = scene[cbName];
    if (typeof cb !== "function") continue;
    const m = bench(() => c.forEach(cb));
    res.classes.push({ coll, cb: cbName, count, med: m.med, min: m.min, max: m.max, n: m.n });
  }

  // 单趟 updateMechs 底价（回调全空桩）：16 趟 forEach 的骨架
  const cbNames = classes.map(([, cb]) => cb);
  const saved = {};
  for (const k of cbNames) { saved[k] = scene[k]; scene[k] = () => {}; }
  const skel = bench(() => scene.updateMechs(st, now(), 16.67));
  for (const k of cbNames) scene[k] = saved[k];
  res.skeleton = skel;

  // 空集合成本：st.platforms 遍历但回调空
  const emptyPass = bench(() => st.platforms.forEach(() => {}));
  res.emptyPass = emptyPass;

  // ── 决定性对照：稳态（脏守卫关闭） vs 位姿真变化（脏守卫打开）──
  // 两臂都传**普通对象**，排除 Colyseus 访问器差异 → 差值纯粹是视图写入成本。
  res.dirty = [];
  for (const [coll, cbName] of classes) {
    const c = st[coll];
    let count = 0;
    try { c?.forEach?.(() => { count++; }); } catch { continue; }
    if (!count) continue;
    const cb = scene[cbName];
    if (typeof cb !== "function") continue;
    const snap = [];
    c.forEach((b, i) => snap.push({ i, x: Number(b.x) || 0, y: Number(b.y) || 0, a: Number(b.angle) || 0, s: b.state }));
    let tick = 0;
    const plainSame = () => { for (const it of snap) cb({ x: it.x, y: it.y, angle: it.a, state: it.s }, it.i); };
    // 位移 0.05px/趟：超过 0.5px 的 MOVE_PX 阈值需要累积，但这里要的是**脏守卫**打开
    // （setPosition 精确比较），0.05 足够让 e.v.x !== px2
    const plainShift = () => { tick++; const d = (tick & 1) ? 0.05 : -0.05; for (const it of snap) cb({ x: it.x + d, y: it.y, angle: it.a, state: it.s }, it.i); };
    const same = bench(plainSame);
    const shift = bench(plainShift);
    res.dirty.push({ coll, cb: cbName, count, sameUs: same.med, shiftUs: shift.med, deltaUs: shift.med - same.med });
  }

  // ── 真实快照访问器 + 真实时间推进 ──
  // 前两臂都传普通对象，绕开了 Colyseus 的 schema 访问器（b.x 是原型 getter）。
  // 本臂直接把**真实 state 元素**传给回调，并推进时间戳——这是生产路径的最小复刻，
  // 用来解释消融口径的 122µs。
  res.realAccess = [];
  for (const [coll, cbName] of classes) {
    const c = st[coll];
    let count = 0;
    try { c?.forEach?.(() => { count++; }); } catch { continue; }
    if (!count) continue;
    const cb = scene[cbName];
    if (typeof cb !== "function") continue;
    const elems = [];
    c.forEach((b, i) => elems.push([b, i]));
    let t = now();
    const realPass = () => { t += 16.67; for (const [b, i] of elems) cb(b, i); };
    const r = bench(realPass);
    res.realAccess.push({ coll, cb: cbName, count, us: r.med, min: r.min, max: r.max });
  }

  res.quantum = (() => { let prev = now(), s = Infinity; for (let i = 0; i < 5000; i++) { const t = now(); const d = t - prev; if (d > 0 && d < s) s = d; prev = t; } return s * 1000; })();
  return res;
}`;

const server = await startServer();
const browser = await chromium.launch({ headless: true });
let res;
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  try {
    const code = await enterAs(page, PORT, "create", "", LEVEL);
    await enterAs(pageB, PORT, "join", code, LEVEL);
    await waitForStarted(page, 30000);
    await waitForStarted(pageB, 30000);
    res = await page.evaluate(`(${PROBE})(${JSON.stringify({ classes: CLASSES, rounds: ROUNDS })})`);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

if (!res || res.error) { console.error("[mechclass] 失败:", res?.error ?? "无结果"); process.exit(1); }

const total = res.classes.reduce((a, c) => a + c.med, 0);
console.log(`\nupdateMechs 机关类批量分解（${LEVEL}，${ROUNDS} 轮，量化 ${res.quantum.toFixed(0)} µs）`);
console.log(`  说明：反复喂同一快照 → 稳态下界（脏守卫已收敛）\n`);
console.log("  机关类          元素   µs/趟   区间(µs)     占类合计");
for (const c of [...res.classes].sort((a, b) => b.med - a.med)) {
  const pct = total ? ((c.med / total) * 100).toFixed(1) : "0";
  console.log(`  ${c.coll.padEnd(16)} ${String(c.count).padStart(4)}  ${c.med.toFixed(2).padStart(7)}  [${c.min.toFixed(2)}–${c.max.toFixed(2)}]`.padEnd(44) + `${pct.padStart(6)}%`);
}
console.log(`  ${"类合计".padEnd(16)} ${"".padStart(4)}  ${total.toFixed(2).padStart(7)}`);
console.log(`\n  updateMechs 骨架（回调全空桩，16 趟遍历）：${res.skeleton.med.toFixed(2)} µs/趟`);
console.log(`  st.platforms 单趟遍历（回调空）：        ${res.emptyPass.med.toFixed(2)} µs/趟`);

// 决定性对照：脏守卫关 vs 开
if (res.dirty?.length) {
  console.log(`\n  ── 脏守卫成本（同样位姿 vs 每次位移 0.05px）──`);
  console.log("  机关类           同值(µs)  位移(µs)   差值(µs)");
  let dsum = 0;
  for (const d of [...res.dirty].sort((a, b) => b.deltaUs - a.deltaUs)) {
    dsum += d.deltaUs;
    console.log(`  ${d.coll.padEnd(16)} ${d.sameUs.toFixed(2).padStart(7)} ${d.shiftUs.toFixed(2).padStart(8)} ${d.deltaUs.toFixed(2).padStart(9)}`);
  }
  console.log(`  ${"合计".padEnd(16)} ${"".padStart(7)} ${"".padStart(8)} ${dsum.toFixed(2).padStart(9)}`);
}

// 真实 state 访问器口径
if (res.realAccess?.length) {
  console.log(`\n  ── 真实 Colyseus 访问器（直接传 state 元素 + 推进时间）──`);
  const rsum = res.realAccess.reduce((a, d) => a + d.us, 0);
  console.log("  机关类           元素      µs/趟");
  for (const d of [...res.realAccess].sort((a, b) => b.us - a.us)) {
    console.log(`  ${d.coll.padEnd(16)} ${String(d.count).padStart(4)} ${d.us.toFixed(2).padStart(9)}`);
  }
  console.log(`  ${"合计".padEnd(16)} ${"".padStart(4)} ${rsum.toFixed(2).padStart(9)}`);
  console.log(`  （对比：批量同值口径 ${total.toFixed(2)} µs / 消融口径 122.0 µs）`);
}

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const f = join(RESULTS, `mechclass-${argSave}.json`);
  writeFileSync(f, JSON.stringify({
    at: new Date().toISOString(), level: LEVEL, rounds: ROUNDS, quantumUs: res.quantum,
    classes: res.classes, classTotalUs: +total.toFixed(2),
    skeletonUs: res.skeleton.med, emptyPlatformPassUs: res.emptyPass.med,
  }, null, 1));
  console.log(`\n[mechclass] 快照已存 ${f}`);
}
