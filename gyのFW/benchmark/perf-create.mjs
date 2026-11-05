/**
 * GameScene.create 分段耗时（r49 新增）。
 *
 * ## 为什么需要
 * 玩家**每次进关**、**每次重开**（Retry / 换关）都会完整走一遍 `GameScene.create()`，
 * 里面串了 12 个 `build*` 子步骤（地面/钻石/机关/液体/门/角色/装饰/教学/气泡/HUD/浮尘）。
 * 此前所有量具都量的是：
 *  - r45 `perf-build`：换关链的**构建**段（客户端侧整链的一段）
 *  - r46 `perf-advance`：换关链的**六个里程碑**（含重建 5.6%）
 *  - r48 `perf-temple`：选关菜单入场
 * **没有一件拆过 `create()` 内部**——所以「重建 61.9ms 里到底谁占大头」至今是黑箱。
 *
 * ## 口径
 * 页内打点（`performance.now`），用 `addInitScript` 在 Phaser 加载前挂 `GameScene.create`
 * 的进入/退出，并把 12 个 `build*` 方法逐个包一层计时。全部在页面内完成，
 * 不经 CDP，不受序列化开销影响。
 *
 * 里程碑：
 *   - `createTotal` —— `GameScene.create` 全程
 *   - 每个 `build*` 的 self 时间（只包一层，嵌套调用会重复计入；本场景各 build* 互不调用）
 *   - `unaccounted` —— createTotal 减去所有 build* 之和（含 HUD/BGM/输入绑定等）
 *
 * ⚠ 为什么不用 CDP CPU profile：`create()` 只跑一次（几毫秒到几十毫秒），
 *   采样剖析在这种短窗口上没有统计意义；而且 r48 已实测剖析器自开销会超过被测窗口本身。
 *   直接读挂钟分段是唯一可靠口径。
 *
 * 用法：
 *   node --import tsx benchmark/perf-create.mjs
 *   LEVEL=forest_bonus_2 ROUNDS=7 node --import tsx benchmark/perf-create.mjs --save r49-base
 *
 * 环境变量：LEVEL（缺省 forest_bonus_2 —— 结构最重关，35 箱 + 47 平台）、
 *          ROUNDS（缺省 7）、PORT（缺省 3621）。
 */
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = Number(process.env.PORT ?? 3621);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "create-pw";
const LEVEL = process.env.LEVEL ?? "forest_bonus_2";
const ROUNDS = Number(process.env.ROUNDS ?? 7);

const argSave = process.argv.includes("--save") ? process.argv[process.argv.indexOf("--save") + 1] : undefined;
const argCompare = process.argv.includes("--compare") ? process.argv[process.argv.indexOf("--compare") + 1] : undefined;
const log = (...a) => console.log("[create]", ...a);
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

const BUILD_METHODS = [
  "buildGround", "buildDiamonds", "buildMechs", "buildCovers", "buildLiquids",
  "buildDoors", "buildPlayers", "buildDecorations", "buildTutorial",
  "buildNavies", "buildHud", "buildDust",
];

/**
 * 页内钩子：包 GameScene.create 与 12 个 build* 方法。
 * 用 addInitScript 注入，早于任何 bundle 执行——但 GameScene 类在 bundle 里，
 * 所以要等 `window.__fw` 出现后再从 scene 实例上取原型。
 */
const HOOK = `(() => {
  window.__ct = { segs: [], done: false };
  const wrap = () => {
    const g = window.__fw;
    if (!g) return false;
    const scene = g.scene.getScene("Game");
    if (!scene || scene.__ctHooked) return true;
    const proto = Object.getPrototypeOf(scene);
    if (typeof proto.create !== "function") return false;
    scene.__ctHooked = true;
    const S = window.__ct;
    ${JSON.stringify(BUILD_METHODS)}.forEach((name) => {
      const orig = proto[name];
      if (typeof orig !== "function") return;
      proto[name] = function (...a) {
        const t0 = performance.now();
        try { return orig.apply(this, a); }
        finally { S.segs.push([name, performance.now() - t0]); }
      };
    });
    const origCreate = proto.create;
    proto.create = function (...a) {
      S.segs.length = 0;
      const t0 = performance.now();
      try { return origCreate.apply(this, a); }
      finally { S.segs.push(["createTotal", performance.now() - t0]); S.done = true; }
    };
    return true;
  };
  // 立即试一次；未就绪则轮询
  if (!wrap()) {
    const t = setInterval(() => { if (wrap()) clearInterval(t); }, 20);
    window.__ctStopPoll = () => clearInterval(t);
  }
  return true;
})()`;

/** 触发一次 create：直接 restart 当前关（等价于玩家点 Retry + 换关的服务端回声） */
const TRIGGER = `async () => {
  const g = window.__fw;
  window.__ct.segs.length = 0;
  window.__ct.done = false;
  const sm = g.scene;
  // 停再起 = 完整重跑 create（与换关路径同构：FadeScene 的 ops 里正是 stop+start("Game")）
  sm.stop("Game");
  sm.start("Game");
  const deadline = performance.now() + 20000;
  while (performance.now() < deadline && !window.__ct.done) {
    await new Promise((r) => setTimeout(r, 4));
  }
  if (!window.__ct.done) return { error: "create 未完成" };
  const out = {};
  for (const [k, v] of window.__ct.segs) {
    out[k] = +(Number(out[k] ?? 0) + v).toFixed(3);
  }
  const total = out.createTotal ?? 0;
  const buildSum = Object.entries(out).filter(([k]) => k !== "createTotal")
    .reduce((a, [, v]) => a + v, 0);
  out.__buildSum = +buildSum.toFixed(3);
  out.__unaccounted = +(total - buildSum).toFixed(3);
  return out;
}`;

const server = await startServer();
const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (let r = 0; r < ROUNDS; r++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
    await page.fill("#password", PASSWORD);
    await page.click("#btn-create");
    await page.waitForFunction(() => !!window.__fw, null, { timeout: 40000 });
    await page.waitForFunction(() => {
      try { return window.__fw.scene.isActive("Game"); } catch { return false; }
    }, null, { timeout: 40000 });
    await page.evaluate(HOOK);
    // 等钩子挂上
    const hooked = await page.evaluate(() => {
      const s = window.__fw.scene.getScene("Game");
      return !!s?.__ctHooked;
    });
    if (!hooked) { log("轮", r, "钩子未挂上，跳过"); await ctx.close(); continue; }
    await new Promise((res) => setTimeout(res, 250)); // 让首帧稳定
    const res = await page.evaluate(`(${TRIGGER})()`);
    if (res?.error) log("轮", r, "跳过:", res.error);
    else rows.push(res);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

if (!rows.length) {
  console.error("[create] 无有效样本");
  process.exit(1);
}

const allKeys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
const ordered = ["createTotal", ...BUILD_METHODS.filter((k) => rows.some((r) => k in r)), "__buildSum", "__unaccounted"];
const summary = ordered.filter((k) => allKeys.includes(k)).map((k) => {
  const vals = rows.map((r) => r[k]).filter((v) => typeof v === "number");
  return { key: k, med: +med(vals).toFixed(2), min: +Math.min(...vals).toFixed(2), max: +Math.max(...vals).toFixed(2) };
});

console.log(`\nGameScene.create 分段（${LEVEL}，${rows.length} 轮，每轮新 context）`);
const total = summary.find((s) => s.key === "createTotal")?.med ?? 0;
for (const s of summary) {
  const pct = total ? ((s.med / total) * 100).toFixed(1) : "-";
  const label = s.key === "createTotal" ? "── 合计 ──" : s.key.startsWith("__") ? s.key : `  ${s.key}`;
  console.log(`  ${label.padEnd(20)} 中位 ${String(s.med).padStart(8)} ms  [${s.min}–${s.max}]  ${pct.padStart(6)}%`);
}

if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  const out = join(RESULTS, `create-${argSave}.json`);
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), level: LEVEL, rounds: rows.length, summary, rows }, null, 1));
  log("快照已存", out);
}
if (argCompare) {
  const f = join(RESULTS, `create-${argCompare}.json`);
  if (!existsSync(f)) console.error("[create] 对比基线不存在:", f);
  else {
    const base = JSON.parse(readFileSync(f, "utf8"));
    console.log(`\n对比 ${argCompare}（中位，ms）：`);
    for (const s of summary) {
      const prev = base.summary.find((x) => x.key === s.key);
      if (!prev) continue;
      const d = ((s.med - prev.med) / prev.med) * 100;
      console.log(`  ${s.key.padEnd(20)} ${String(prev.med).padStart(8)} → ${String(s.med).padStart(8)}  ${(d >= 0 ? "+" : "") + d.toFixed(1)}%`);
    }
  }
}
