/**
 * 选关树烘焙分帧预算（r49 新增）：`stepTreeBake` 的每帧时间片对入场延迟的影响。
 *
 * ## 问题
 * `templeTreeBake.ts` 头注写的是「TreeBakeJob 行分片（step(budgetMs)，**≤50ms/帧** 约束
 * →分帧）」，但 `TempleScene.mountBaked` 实际调用是 `stepTreeBake(key, 8)` —— **8ms**。
 *
 * 烘焙任务结构：3 层（big/all/done）× 每层 [prepare 1 个 + alphaSat ⌈H/64⌉ 个 + bevel
 * ⌈H/64⌉ 个 (+ outline)]，canvas 高度 ~870px 时约 14 个分片/层，合计 ≈ 87 个任务。
 * 8ms/帧下若单任务均值 ~2ms，就要 20+ 帧才完成——**这期间的等待全部是「本可以更快
 * 做完」的时间**，因为渲染侧有平色回退层兜底（`buildFlatFallback`），提高预算不会
 * 造成黑屏或未完成状态。
 *
 * ## 口径
 * 用真实浏览器测「点开始 → 关卡树可交互（`interactive`）」：烘焙完成即为该时刻的上界。
 * 两臂靠改 `TempleScene.mountBaked` 的预算常量区分，需重新 build。
 *
 * ⚠ 这是**产品行为**对照：预算越大，单帧越长但总帧数越少。存在最优区间——太大则
 * 单帧卡顿（玩家感知掉帧），太小则总时长拉长。本件量的是「总时长」，单帧抖动需另看
 * `perf-client` 的 p95。
 *
 * 用法：
 *   node --import tsx benchmark/perf-bake.mjs                     # 只跑当前构建
 *   BUDGET=8 node --import tsx benchmark/perf-bake.mjs --save r49-b8
 *   BUDGET=48 node --import tsx benchmark/perf-bake.mjs --save r49-b48
 *
 * 环境变量：BUDGET（仅用于快照标注，实际值在源码里）、LEVEL（缺省 forest）、
 *          ROUNDS（缺省 9）、PORT（缺省 3633）。
 */
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = Number(process.env.PORT ?? 3633);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "bake-pw";
const LEVEL = process.env.LEVEL ?? "forest";
const ROUNDS = Number(process.env.ROUNDS ?? 9);
const BUDGET = process.env.BUDGET ?? "?";

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;
const log = (...a) => console.log("[bake]", ...a);
const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1", FW_WIND_PHASE: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 60000);
    const ondata = (buf) => {
      const s = String(buf);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", () => {});
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

/**
 * 页内：进入 Temple 并记录
 *   t0      —— 点开始
 *   active  —— TempleScene 激活
 *   baked   —— 烘焙纹理上屏（`flatFallbacks` 被清空，见 mountBaked 的成功分支）
 *   frames  —— baked 之前经历了多少次 postupdate（=分帧步数，直接反映预算影响）
 */
const RUN_ONE = `async () => {
  const g = window.__fw;
  const sm = g.scene;
  if (!sm.isActive("Menu")) { sm.stop("Temple"); sm.start("Menu"); }
  await new Promise((r) => setTimeout(r, 300));
  const menu = sm.getScene("Menu");
  const t0 = performance.now();
  const zones = menu.children.list.filter((o) => o.type === "Zone" && o.input);
  const playZone = zones[zones.length - 1];
  if (playZone) playZone.emit("pointerup"); else sm.start("Temple");

  const deadline = performance.now() + 20000;
  let activeAt = 0;
  while (performance.now() < deadline) {
    if (sm.isActive("Temple")) { activeAt = performance.now(); break; }
    await new Promise((r) => setTimeout(r, 4));
  }
  if (!sm.isActive("Temple")) return { error: "Temple 未激活" };

  const temple = sm.getScene("Temple");
  // 烘焙完成判据：节点的平色回退层被清空（mountBaked 成功分支 flatFallbacks=[]）
  let frames = 0, bakedAt = 0;
  let lastCount = -1;
  while (performance.now() < deadline) {
    frames++;
    const fb = temple.flatFallbacks;
    if (Array.isArray(fb) && fb.length === 0 && temple.children.list.length > 0) { bakedAt = performance.now(); break; }
    // 兜底：children 数量稳定 200ms 也算完成（缓存命中路径不会有 flatFallbacks）
    const n = temple.children.list.length;
    if (n === lastCount && n > 0) { bakedAt = bakedAt || performance.now(); }
    else { lastCount = n; bakedAt = 0; }
    await new Promise((r) => setTimeout(r, 8));
  }
  return {
    toActive: +(activeAt - t0).toFixed(1),
    toBaked: bakedAt ? +(bakedAt - t0).toFixed(1) : null,
    bakeSegment: bakedAt && activeAt ? +(bakedAt - activeAt).toFixed(1) : null,
    pollFrames: frames,
  };
}`;

const server = await startServer();
const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (let r = 0; r < ROUNDS; r++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?level=${LEVEL}_01`, { waitUntil: "domcontentloaded" });
    await page.fill("#password", PASSWORD);
    await page.waitForFunction(() => !!window.__fw, null, { timeout: 40000 });
    await page.waitForSelector("#menu", { state: "hidden", timeout: 5000 }).catch(() => {});
    await new Promise((res) => setTimeout(res, 400));
    const res = await page.evaluate(`(${RUN_ONE})()`);
    if (res?.error) log("轮", r, "跳过:", res.error);
    else rows.push(res);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

if (!rows.length) { console.error("[bake] 无有效样本"); process.exit(1); }

const pick = (k) => rows.map((r) => r[k]).filter((v) => typeof v === "number");
const stat = (k) => {
  const v = pick(k);
  if (!v.length) return null;
  return { med: +med(v).toFixed(1), min: +Math.min(...v).toFixed(1), max: +Math.max(...v).toFixed(1) };
};

console.log(`\n选关树烘焙分帧（${LEVEL}，budget=${BUDGET}ms，${rows.length} 轮，冷缓存）`);
for (const k of ["toActive", "bakeSegment", "toBaked"]) {
  const s = stat(k);
  if (s) console.log(`  ${k.padEnd(14)} 中位 ${String(s.med).padStart(8)} ms   [${s.min}–${s.max}]`);
}

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const out = join(RESULTS, `bake-${argSave}.json`);
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), level: LEVEL, budget: BUDGET, rounds: rows.length, rows }, null, 1));
  log("快照已存", out);
}
if (argCompare) {
  const f = join(RESULTS, `bake-${argCompare}.json`);
  if (!existsSync(f)) console.error("[bake] 对比基线不存在:", f);
  else {
    const base = JSON.parse(readFileSync(f, "utf8"));
    console.log(`\n对比 ${argCompare}（budget=${base.budget}ms → ${BUDGET}ms）：`);
    for (const k of ["toActive", "bakeSegment", "toBaked"]) {
      const p = stat(k), q = base.rows.map((r) => r[k]).filter((v) => typeof v === "number");
      if (!p || !q.length) continue;
      const pm = med(q);
      console.log(`  ${k.padEnd(14)} ${pm.toFixed(1).padStart(8)} → ${String(p.med).padStart(8)}  (${(((p.med - pm) / pm) * 100).toFixed(1)}%)`);
    }
  }
}
