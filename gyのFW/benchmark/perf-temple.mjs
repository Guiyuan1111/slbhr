/**
 * 选关菜单入场延迟（r48 新增）：点「开始」→ TempleScene 烘焙完成可交互。
 *
 * ## 为什么需要独立一件
 * `perf-scene.mjs` 量的是「点创建 → GameScene 激活」（进对局）；
 * `perf-advance.mjs` 量的是「通关 → 下一关」（换关链）；
 * **「开始 → 选关树」这一段此前没有量具**，而它每局开始、每次换庙都会走。
 *
 * r48 在 `progress.ts` 给 `loadProgress` 加了原文串记忆，理论收益 22.4ms（node 微基准，
 * `perf-progress.mjs`）。本件用真实浏览器确认这段收益在页面里是否成立——微基准不等于
 * 页面口径（还要叠加 Phaser 场景 create、烘焙、图集加载）。
 *
 * ## 里程碑（页内 performance.now）
 *   click        —— 点「开始」按钮
 *   fadeStart    —— FadeScene 激活（黑幕淡入开始）
 *   templeActive —— TempleScene 激活
 *   interactive  —— 首个关卡节点 setInteractive 完成（=玩家可点的时刻）
 *
 * ⚠ 本件只测**单次入场**。烘焙结果有进程内缓存（templeTreeBake 的 LRU），
 * 所以同一庙第二次进场会更快——比较两臂时必须都用「冷缓存」首入，或都明确标注是复访。
 *
 * 用法：
 *   node --import tsx benchmark/perf-temple.mjs                 # 打印分段
 *   node --import tsx benchmark/perf-temple.mjs --save r48     # 存快照
 *   node --import tsx benchmark/perf-temple.mjs --compare r48  # 与快照对比
 *   LEVEL=forest ROUNDS=7 node --import tsx benchmark/perf-temple.mjs
 *
 * 环境变量：LEVEL（temple id，缺省 forest）、ROUNDS（轮数，缺省 7）、PORT。
 */
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = Number(process.env.PORT ?? 3619);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "temple-pw";
const LEVEL = process.env.LEVEL ?? "forest";
const ROUNDS = Number(process.env.ROUNDS ?? 7);

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;
const log = (...a) => console.log("[temple]", ...a);
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
      if (s.includes("EADDRINUSE")) {
        clearTimeout(timer);
        reject(new Error("端口被占用"));
      } else if (s.includes("http+ws")) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", () => {});
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("server 提前退出: " + code));
    });
  });
}

/** 页内打点：装一次，之后每轮 reset 再采 */
const HOOK = `(() => {
  const M = [];
  window.__tm = M;
  window.__tmReset = () => { M.length = 0; };
  const mark = (k) => M.push([k, performance.now()]);
  window.__tmMark = mark;

  // TempleScene 激活 + 首个可交互节点
  const g = window.__fw;
  if (!g) return { ok: false, why: "no __fw" };
  const sm = g.scene;
  const attach = (scene) => {
    if (!scene || scene.__tmHooked) return;
    scene.__tmHooked = true;
    scene.events.on("create", () => mark("templeCreate"));
  };
  attach(sm.getScene("Temple"));
  // 轮询补挂（场景可能是重启的实例）
  const timer = setInterval(() => attach(sm.getScene("Temple")), 50);
  window.__tmStopPoll = () => clearInterval(timer);
  return { ok: true };
})()`;

/** 点击开始并等待 TempleScene 烘焙完成（页内轮询 GameObjects 数量稳定） */
const RUN_ONE = `async () => {
  const g = window.__fw;
  const M = window.__tm;
  M.length = 0;
  const mark = window.__tmMark;
  const sm = g.scene;

  // 回到 Menu（若在其它场景）
  if (!sm.isActive("Menu")) { sm.stop("Temple"); sm.start("Menu"); }
  await new Promise((r) => setTimeout(r, 350));

  const menu = sm.getScene("Menu");
  let started = false;
  const t0 = performance.now();
  mark("click");
  // Menu 的 Play 按钮是 pointerup 触发；直接派发到 canvas 中心不靠谱——
  // 改为调用场景内公开路径：点 zone。用 Phaser 的 input 事件更稳的做法是找 zone 对象。
  const zones = menu.children.list.filter((o) => o.type === "Zone" && o.input);
  const playZone = zones[zones.length - 1];
  if (playZone) playZone.emit("pointerup");
  else {
    // 兜底：直接 scene.start（等价于 Play 的最终效果，但跳过黑幕）
    sm.start("Temple");
  }
  started = true;

  // 等 Temple 激活并稳定
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    if (sm.isActive("Temple")) { mark("templeActive"); break; }
    await new Promise((r) => setTimeout(r, 4));
  }
  if (!sm.isActive("Temple")) return { error: "Temple 未激活", started };

  const temple = sm.getScene("Temple");
  // 等节点数稳定（烘焙是分帧的）
  let last = -1, stableAt = 0;
  while (performance.now() < deadline) {
    const n = temple.children.list.length;
    if (n === last && n > 0) { if (!stableAt) stableAt = performance.now(); if (performance.now() - stableAt > 120) break; }
    else { stableAt = 0; last = n; }
    await new Promise((r) => setTimeout(r, 16));
  }
  mark("interactive");
  const first = M.find(([k]) => k === "click")?.[1] ?? 0;
  const out = {};
  for (const [k, t] of M) if (k !== "click") out[k] = +(t - first).toFixed(1);
  out.total = M.length ? +(M[M.length - 1][1] - first).toFixed(1) : null;
  out.children = temple.children.list.length;
  window.__tmStopPoll?.();
  return out;
}`;

const server = await startServer();
const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (let r = 0; r < ROUNDS; r++) {
    // 每轮新 context：冷缓存 + 干净 localStorage，保证与首次用户一致的路径
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?level=${LEVEL}_01`, { waitUntil: "domcontentloaded" });
    await page.fill("#password", PASSWORD);
    await page.waitForFunction(() => !!window.__fw, null, { timeout: 30000 });
    // 预置一份"满存档"，让 starsOf 的调用成本落在真实上限（252 条 / 13KB）
    await page.evaluate(() => {
      const o = {};
      for (let i = 0; i < 252; i++) o[`tutorials/levels/forest_${String(i).padStart(2, "0")}.json`] = { stars: (i % 3) + 1, time: 60 + i };
      localStorage.setItem("fw-temple-progress-v1", JSON.stringify(o));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__fw, null, { timeout: 30000 });
    await page.evaluate(HOOK);
    await page.waitForSelector("#menu", { state: "hidden", timeout: 5000 }).catch(() => {});
    const res = await page.evaluate(`(${RUN_ONE})()`);
    if (res?.error) log("轮", r, "跳过:", res.error);
    else rows.push(res);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

if (!rows.length) {
  console.error("[temple] 无有效样本");
  process.exit(1);
}

const keys = ["templeActive", "interactive"];
console.log(`\n选关菜单入场（${LEVEL}，${rows.length} 轮，冷缓存每轮新 context）`);
for (const k of keys) {
  const vals = rows.map((r) => r[k]).filter((v) => typeof v === "number");
  if (!vals.length) continue;
  console.log(`  ${k.padEnd(14)} 中位 ${med(vals).toFixed(1).padStart(7)} ms   [${Math.min(...vals).toFixed(1)}–${Math.max(...vals).toFixed(1)}]`);
}
const totals = rows.map((r) => r.total).filter((v) => typeof v === "number");
console.log(`  ${"total".padEnd(14)} 中位 ${med(totals).toFixed(1).padStart(7)} ms   [${Math.min(...totals).toFixed(1)}–${Math.max(...totals).toFixed(1)}]`);
console.log(`  节点数 ${rows.map((r) => r.children).join(", ")}`);

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const out = join(RESULTS, `temple-${argSave}.json`);
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), level: LEVEL, rounds: rows.length, rows }, null, 1));
  log("快照已存", out);
}
if (argCompare) {
  const f = join(RESULTS, `temple-${argCompare}.json`);
  if (!existsSync(f)) {
    console.error("[temple] 对比基线不存在:", f);
  } else {
    const base = JSON.parse(readFileSync(f, "utf8"));
    const prev = med(base.rows.map((r) => r.total).filter((v) => typeof v === "number"));
    const now = med(totals);
    console.log(`\n对比 ${argCompare}: total ${prev.toFixed(1)}ms → ${now.toFixed(1)}ms  (${(((now - prev) / prev) * 100).toFixed(1)}%)`);
  }
}
