/**
 * 换关链（客户端半边）基准（r46）：won 相位点「继续」→ 下一关 Game 场景可玩的分段计时。
 *
 * 为什么需要它：r45 的 `perf-switch.mjs` 只量服务端 `advance` 的 World 构建（1ms 级）。
 * 玩家实际感知的换关延迟还包括：advance 消息往返 → fetch 新关数据（可走缓存）→
 * 黑幕 → `scene.stop("Game") + scene.start("Game")` 整场景重建（preload/create/地面烘焙/
 * 全部机关视图重建）→ 首个可玩帧。这条链此前**从未被任何量具覆盖**。
 *
 * 口径：
 * - headless chromium + 真服务器 + 双页入房（生产同构）；
 * - 通关走 **`FW_DEBUG_FORCE_DOORS=1`**（每 500ms 置双门 isOpen，驱动真实 25fps 扫帧
 *   → isUp → win 判定；与 e2e journey 同款，不注入假事件），再点 `__fwNextLevel()`；
 *   **注意**：该模式下换关后双门仍被反复置开，下一关同样会很快进 won——量具每轮只取
 *   第一次换关的里程碑，随后立即关闭页面；
 * - 分段里程碑（页内 performance.now）：
 *     click → advanceSent（ws.send 返回）→ sceneStopped（Game 停）→ sceneStarted（Game 起）
 *     → createDone（Game 首次 isActive）→ firstPlayable（首个 levelId 匹配的快照到达）
 * - 每轮换到不同关（按 temple 序推进），统计中位/最小值；结果存 results/advance-<label>.json
 *
 * 用法：
 *   node --import tsx benchmark/perf-advance.mjs [--no-build] [--runs 5] --save <label>
 *   node --import tsx benchmark/perf-advance.mjs --compare <label>
 * 产物：benchmark/results/advance-<label>.json
 */
import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { enterAs } from "../scripts/e2e/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = 3573;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "adv-pw";
const LEVEL = process.env.ADV_LEVEL ?? "forest_01";

const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const argSave = argOf("save", undefined);
const argCompare = argOf("compare", undefined);
const RUNS = Number(argOf("runs", 5));
const NO_BUILD = args.includes("--no-build");
const log = (...a) => console.log("[advance]", ...a);

if (!NO_BUILD) {
  log("构建客户端…");
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
}

function startServer() {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")],
    { cwd: ROOT, env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1", FW_DEBUG_FORCE_DOORS: "1" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 60000);
    child.stdout.on("data", (buf) => {
      const s = String(buf);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    });
    child.stderr.on("data", (b) => process.stderr.write(b));
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

/** 页内探针：里程碑打点 + 场景生命周期钩子。
 *
 * ⚠ 两个坑（实测）：
 *  1. `fadeSwitch` 把 `scene.stop("Game")+scene.start("Game")` 排在 SceneManager 的下一帧
 *     批处理里，**2ms 轮询永远看不到 inactive**（分段全 NaN，还会把「levelId 恰好变化」
 *     误判成首帧可玩）。
 *  2. GameScene 的 `sys.events` 监听器在 shutdown 时被 Phaser 清空——挂在上面的钩子
 *     换关后就收不到了（实测只剩 click/advanceSent 两条）。
 *  所以改为在 GameScene 的 `sys.events` 上**每次 attach 后重新挂**，并用 FadeScene 的
 *  create/stop 标记黑幕段（fadeIn 500ms → ops() → fadeOut 500ms，oracle 同构）。 */
const INIT_HOOK = () => {
  const install = () => {
    const M = (globalThis.__fwA = []);
    const mark = (name, extra) => M.push({ name, t: performance.now(), ...extra });
    globalThis.__fwMark = mark;
    let armed = false;
    const hooked = new WeakSet();
    const attach = () => {
      const g = globalThis.__fw;
      if (!g || !g.scene) return;
      // 黑幕场景钩子（每次 create 都重挂：FadeScene 也会 stop/restart）
      let fade;
      try { fade = g.scene.getScene("XFade"); } catch { /* 未注册 */ }
      if (fade && fade.sys && !hooked.has(fade.sys)) {
        hooked.add(fade.sys);
        fade.sys.events.on("create", () => mark("fadeInStart"));
        fade.sys.events.on("shutdown", () => mark("fadeOutDone"));
      }
      let gs;
      try { gs = g.scene.getScene("Game"); } catch { return; }
      if (!gs || !gs.sys || hooked.has(gs.sys)) return;
      hooked.add(gs.sys);
      gs.sys.events.on("shutdown", () => mark("gameShutdown"));
      gs.sys.events.on("create", () => { mark("gameCreate"); armed = true; });
      gs.sys.events.on("update", () => {
        if (!armed) return;
        armed = false;
        const st = globalThis.__fwInit?.net?.room?.state;
        mark("firstPlayable", { levelId: String(st?.levelId ?? "") });
      });
    };
    setInterval(attach, 20);
    // 包装 advance 发送：记录点击时刻与发完时刻（__fwNextLevel 在页面生命周期后段才注入，
    // 故在此惰性取，不可在 install 时捕获）
    Object.defineProperty(globalThis, "__fwNextLevelProbed", {
      value: () => {
        const fn = globalThis.__fwNextLevel;
        if (typeof fn !== "function") throw new Error("__fwNextLevel 尚未注入");
        // 清空窗口：入关时也会记 gameShutdown/gameCreate/firstPlayable（首次进入 Game），
        // 不清会被当成换关里程碑（实测 waitForFunction 立即假命中、切片后只剩 click/advanceSent）
        M.length = 0;
        armed = false;
        mark("click");
        fn();
        mark("advanceSent");
      },
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
};

const summary = {};
function addSeg(name, ms) {
  (summary[name] ??= []).push(+ms.toFixed(2));
}

async function runOnce(browser, round) {
  // 双页入房（生产同构：create + joinById；单页会卡在 waiting 相位）
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  await ctxA.addInitScript(INIT_HOOK);
  await ctxB.addInitScript(INIT_HOOK);
  const page = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  pageB.on("pageerror", (e) => errs.push("B: " + String(e)));

  const waitStarted = async (p) =>
    p.waitForFunction(() => {
      const g = globalThis.__fw;
      const st = globalThis.__fwInit?.net?.room?.state;
      return g && g.scene && g.scene.isActive("Game") && st && String(st.phase) === "started";
    }, { timeout: 60000 });

  // A：建房、B：加房 —— 复用 e2e 的 DOM 表单流程（与真玩家路径一致，不走深链捷径）
  const roomCode = await enterAs(page, PORT, "create", "", LEVEL);
  await enterAs(pageB, PORT, "join", roomCode, LEVEL);
  await waitStarted(page);
  await waitStarted(pageB);
  if (round === 0) log(`首轮已双人开局（房 ${roomCode}），等待 FORCE_DOORS 通关…`);
  // 真通关：FORCE_DOORS 驱动双门扫帧 → win（不注入假事件）
  await page.waitForFunction(() => String(globalThis.__fwInit?.net?.room?.state?.phase) === "won", { timeout: 60000 });
  await page.waitForTimeout(300); // 结算面板演出
  // 用探针包装版（先记 click 与旧 levelId，再调真函数）
  await page.evaluate(() => globalThis.__fwNextLevelProbed());
  // 等首个可玩帧
  await page.waitForFunction(
    () => (globalThis.__fwA ?? []).some((m) => m.name === "firstPlayable"),
    { timeout: 30000 },
  );
  const marks = await page.evaluate(() => globalThis.__fwA);
  await ctxA.close();
  await ctxB.close();

  // 里程碑按 click 之后切窗：场景生命周期在整轮里有多次（入关一次、换关一次），
  // 只取「本关 click 之后」的那一段，否则会把入关时的 gameActive 算进来（曾出现负分段）
  const clickIdx = marks.findIndex((m) => m.name === "click");
  const w = clickIdx >= 0 ? marks.slice(clickIdx) : marks;
  const at = (n) => w.find((m) => m.name === n)?.t;
  const click = at("click"), sent = at("advanceSent"), fadeIn = at("fadeInStart");
  const down = at("gameShutdown"), created = at("gameCreate"), play = at("firstPlayable");
  if (click == null || play == null) throw new Error(`里程碑缺失：${JSON.stringify(w.map((m) => m.name))}`);
  // 分段定义（换关链，r46 口径）：
  //   clickToAdvanceSent    点击 → ws.send 返回
  //   advanceSentToFadeIn   服务端往返：advance 受理 → levelId 回声 → reloadLevel 拉关 → 黑幕起
  //   fadeInToOp            黑幕淡入 500ms（固定动画，oracle 同构）
  //   opToGameCreate        scene.stop("Game") + scene.start("Game") → 新场景 create 完成
  //   createToFirstPlayable create 完成 → 首个 update（首帧可玩）
  //   clickToFirstPlayable  合计（不含 500ms 淡出，玩家在该段已能看到新关但不可操作）
  addSeg("clickToAdvanceSent", sent - click);
  addSeg("advanceSentToFadeIn", fadeIn - sent);
  addSeg("fadeInToOp", down - fadeIn);
  addSeg("opToGameCreate", created - down);
  addSeg("createToFirstPlayable", play - created);
  addSeg("clickToFirstPlayable", play - click);
  return { round, seg: { clickToAdvanceSent: sent - click, clickToFirstPlayable: play - click }, errs };
}

const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);

const server = await startServer();
const browser = await chromium.launch({ args: ["--enable-precise-memory-info"] });
const runs = [];
try {
  for (let i = 0; i < RUNS; i++) {
    runs.push(await runOnce(browser, i));
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

const out = {};
for (const [k, v] of Object.entries(summary)) out[k] = +median(v).toFixed(2);
log("分段中位（ms）：");
for (const [k, v] of Object.entries(out)) log(`  ${k.padEnd(30)} ${String(v).padStart(8)}`);

const snapshot = {
  meta: {
    label: argSave ?? argCompare ?? "(run)",
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    node: process.version,
    runs: RUNS,
    level: LEVEL,
  },
  summary: out,
  raw: summary,
  perRun: runs,
};
if (argSave) {
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(join(RESULTS, `advance-${argSave}.json`), JSON.stringify(snapshot, null, 2));
  log(`快照：results/advance-${argSave}.json`);
}
if (argCompare) {
  const p = join(RESULTS, `advance-${argCompare}.json`);
  if (!existsSync(p)) { log(`对比快照不存在: ${p}`); process.exit(1); }
  const prev = JSON.parse(readFileSync(p, "utf8"));
  console.log(`\n[advance] 前后对比（中位 ms，before=${argCompare} → after=本次）`);
  for (const k of Object.keys(out)) {
    const a = prev.summary[k] ?? null;
    const b = out[k];
    const d = a != null && a > 0 ? `${(((b - a) / a) * 100).toFixed(1)}%` : "—";
    console.log(`  ${k.padEnd(30)} ${String(a ?? "—").padStart(8)} → ${String(b).padStart(8)}   ${d}`);
  }
}
