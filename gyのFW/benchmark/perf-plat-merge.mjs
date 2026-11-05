/**
 * `updatePlatformSound` 并入 `updateMechs` 的**同页配对 A/B**（r51 新增）。
 *
 * ## 要回答的问题
 * r50 留了个候选：`updateMechs` 与 `updatePlatformSound` 各遍历一次 `st.platforms`，
 * 合并可省一趟。r50 报告以「会让 `stepPlatforms` 承担声音副作用、且改变调用顺序」
 * 为由未做——但那是**定性**判断，没有量。
 *
 * ## 本件怎么量
 * 页内用真实 `st.platforms`（47 元素，Colyseus schema）构造两组等价调用：
 *
 *   A 臂（现状）：`st.platforms.forEach(cbPlatforms)` 然后 `st.platforms.forEach(cbPlatSnd)`
 *   B 臂（合并）：`st.platforms.forEach(cbMerged)`，其中 cbMerged 内部顺序调两个回调
 *
 * 两臂都**不改变视图状态**（cbPlatforms 走到 `mechSmoother` 后会因静止而快路；
 * cbPlatSnd 只在 tracker 里做差值比较），所以可以交替跑。
 *
 * **块计时**：100µs 量化下，单趟 ~5µs 必须累积。每块跑 BLOCK 趟只取 1 对时钟。
 *
 * ## 本件不能回答的（写进报告）
 * 1. **调用顺序变化的下游影响**：现状 `updatePlatformSound` 在 `update` 末尾
 *    （`GameScene.ts:1810`），合并后会在 `updateMechs`（`:1804`）里跑。两者之间隔着
 *    `updateFairies/updatePortals/flushFairyDrag/updateDust/drawDarkness`，这些都不读写
 *    `platformSounds` 或 `st.platforms`——本件只证明**省一趟遍历**值多少，不证明顺序变更
 *    的副作用为零（那要位级门禁 + 全量测试兜底）。
 * 2. **副作用归属**：合并后 `stepPlatforms` 检查 `state` 的同一趟里驱动音频实例，
 *    代码结构上确实变差。是否值得，看下面的数。
 *
 * 用法：
 *   node --import tsx benchmark/perf-plat-merge.mjs
 *   LEVEL=forest_bonus_2 ROUNDS=15 node --import tsx benchmark/perf-plat-merge.mjs --save r51-platmerge
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { enterAs, waitForStarted } from "../scripts/e2e/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = Number(process.env.PORT ?? 3677);
const LEVEL = process.env.LEVEL ?? "forest_bonus_2";
const ROUNDS = Number(process.env.ROUNDS ?? 15);
const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

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

const PROBE = `async ({ rounds }) => {
  const g = window.__fw;
  const scene = g.scene.getScene("Game");
  const st = scene.d?.net?.room?.state;
  if (!st?.platforms) return { error: "no platforms" };
  const cbp = scene.cbPlatforms, cbs = scene.cbPlatSnd;
  if (typeof cbp !== "function" || typeof cbs !== "function") return { error: "回调缺失" };

  let count = 0;
  st.platforms.forEach(() => { count++; });

  // B 臂用的合并回调：同一元素上顺序调两者（顺序与 A 臂的「先全部 cbp 再全部 cbs」不同，
  // 但两者互不依赖，故元素级顺序不影响结果）
  const merged = (b, id) => { cbp(b, id); cbs(b, id); };

  const BLOCK = 200; // 单块 200 趟 ≈ 1ms，量化误差 ~10%；配合 ROUNDS 取中位
  const runA = () => { for (let i = 0; i < BLOCK; i++) { st.platforms.forEach(cbp); st.platforms.forEach(cbs); } };
  const runB = () => { for (let i = 0; i < BLOCK; i++) { st.platforms.forEach(merged); } };

  // 语义一致性：两臂都必须「每个元素各调一次 cbp 与 cbs」
  let aCalls = 0, bCalls = 0;
  const cbp2 = scene.cbPlatforms;
  scene.cbPlatforms = (b, id) => { aCalls++; return cbp2(b, id); };
  st.platforms.forEach(scene.cbPlatforms); scene.cbPlatforms = cbp2;
  const cbs2 = scene.cbPlatSnd;
  scene.cbPlatSnd = (b, id) => { bCalls++; return cbs2(b, id); };
  st.platforms.forEach(scene.cbPlatSnd); scene.cbPlatSnd = cbs2;
  if (aCalls !== count || bCalls !== count) return { error: "回调次数异常 " + aCalls + "/" + bCalls + " vs " + count };

  // 预热
  runA(); runB(); runA(); runB();

  const tA = [], tB = [];
  for (let r = 0; r < rounds; r++) {
    if (r % 2 === 0) {
      let t0 = performance.now(); runA(); tA.push(((performance.now() - t0) / BLOCK) * 1000);
      t0 = performance.now(); runB(); tB.push(((performance.now() - t0) / BLOCK) * 1000);
    } else {
      let t0 = performance.now(); runB(); tB.push(((performance.now() - t0) / BLOCK) * 1000);
      t0 = performance.now(); runA(); tA.push(((performance.now() - t0) / BLOCK) * 1000);
    }
  }
  return { platforms: count, blockPasses: BLOCK, rounds, tA, tB,
    quantumUs: (() => { let prev = performance.now(), s = Infinity; for (let i = 0; i < 5000; i++) { const t = performance.now(); const d = t - prev; if (d > 0 && d < s) s = d; prev = t; } return s * 1000; })() };
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
    res = await page.evaluate(`(${PROBE})(${JSON.stringify({ rounds: ROUNDS })})`);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

if (!res || res.error) { console.error("[platmerge] 失败:", res?.error ?? "无结果"); process.exit(1); }

const mB = med(res.tB), mA = med(res.tA);
const d = ((mB - mA) / mA) * 100;
const sep = pct(res.tB, 0.75) < pct(res.tA, 0.25);
console.log(`\nst.platforms 双趟 vs 合并（${LEVEL}，${res.platforms} 平台，${res.rounds} 轮 × ${res.blockPasses} 趟/块）`);
console.log(`  量化 ${res.quantumUs.toFixed(0)} µs\n`);
console.log(`  臂                      中位(µs/次)   P25–P75        区间`);
console.log(`  A 双趟（现状）          ${mA.toFixed(3).padStart(10)}   ${pct(res.tA,0.25).toFixed(3)}–${pct(res.tA,0.75).toFixed(3)}`.padEnd(52) + `  ${Math.min(...res.tA).toFixed(3)}–${Math.max(...res.tA).toFixed(3)}`);
console.log(`  B 合并单趟              ${mB.toFixed(3).padStart(10)}   ${pct(res.tB,0.25).toFixed(3)}–${pct(res.tB,0.75).toFixed(3)}`.padEnd(52) + `  ${Math.min(...res.tB).toFixed(3)}–${Math.max(...res.tB).toFixed(3)}`);
console.log(`\n  Δ ${d.toFixed(1)}%（合并 − 现状）  ${sep ? "区间不重叠 → 可主张" : "区间重叠 → 带内，不主张"}`);
console.log(`  折合每次 update：${(mA - mB).toFixed(3)} µs`);

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const f = join(RESULTS, `platmerge-${argSave}.json`);
  writeFileSync(f, JSON.stringify({
    at: new Date().toISOString(), level: LEVEL, platforms: res.platforms, rounds: res.rounds,
    blockPasses: res.blockPasses, medTwoPassUs: +mA.toFixed(4), medMergedUs: +mB.toFixed(4),
    deltaPct: +d.toFixed(1), separated: sep, savingsPerUpdateUs: +(mA - mB).toFixed(4),
    tA: res.tA.map((x) => +x.toFixed(4)), tB: res.tB.map((x) => +x.toFixed(4)),
  }, null, 1));
  console.log(`\n[platmerge] 快照已存 ${f}`);
}
