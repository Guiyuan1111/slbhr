#!/usr/bin/env node
/**
 * deploy-smoke：分发包「真开局」冒烟（#51 的验收盲区补网）。
 *
 * ## 为什么需要这个脚本
 *
 * 1.0.0 包按 DEPLOY.md 六步验收全绿，玩家一建房却必崩：六步里的第 ⑥ 步只
 * `create → leave`，房间状态从未真正广播过增量，所以「能起服不能开局」这一类
 * 缺陷在验收里完全隐形。#51 就是这样漏出去的。
 *
 * 本脚本补的正是那一段：**起服 → 建房 → 等相位推进 → 断言 patch 持续在流 →
 * 断言服务端进程始终存活 → 断言浏览器侧零 pageerror**。任何一环断掉都是失败。
 *
 * ## 用法（部署后、或 CI 打包后各跑一次）
 *
 *   node scripts/e2e/deploy-smoke.mjs --serve-dir /opt/gy-fw-forest-1.0.1
 *   node scripts/e2e/deploy-smoke.mjs --base http://127.0.0.1:2567      # 已跑着的服务
 *
 * `--serve-dir` 在给定目录里起服：分发包（1.0.1+）直跑预转译的
 * `packages/server/src/index.js`，源码树则回退到 `--import tsx …/index.ts`
 * （两种布局自动识别），跑完自动收尸；`--base` 只做客户端侧断言、不管进程。
 * 浏览器用例需要 playwright（devDependency，仅本仓库/CI 有；包里没有，故用
 * `--no-browser` 可跳过——但既然 CI 有 playwright，CI 侧恒带浏览器用例）。
 *
 * 判据（全绿退出码 0）：
 *  ① 服务端 stdout 无 uncaughtException / TypeError
 *  ② /healthz 200
 *  ③ colyseus.js 建房成功
 *  ④ 12 秒内 patch 计数持续增长（不是一次性首快照）
 *  ⑤ 全程进程存活（未崩溃重启）
 *  ⑥ 有浏览器时：Menu → 建房 → Game active、pageerror=0
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = argOf("base", "");
const SERVE_DIR = argOf("serve-dir", "");
const PORT = Number(argOf("port", BASE ? new URL(BASE).port || "80" : "2599"));
const NO_BROWSER = args.includes("--no-browser");
const PATCH_WINDOW_MS = Number(argOf("window", "12000"));

if (!BASE && !SERVE_DIR) {
  console.error("deploy-smoke: 需要 --serve-dir <目录> 或 --base <http://host:port>");
  process.exit(2);
}

/**
 * 起服入口自适应：分发包（1.0.1+）是预转译布局，直跑 .js；源码树只有 .ts，
 * 需经 tsx loader。两者都允许，由目录里实际存在哪个决定。
 */
function serverEntry(dir) {
  const js = join(dir, "packages/server/src/index.js");
  const ts = join(dir, "packages/server/src/index.ts");
  if (existsSync(js)) return { args: ["packages/server/src/index.js"], layout: "预转译 .js" };
  if (existsSync(ts)) return { args: ["--import", "tsx", "packages/server/src/index.ts"], layout: "源码 .ts（tsx loader）" };
  return null;
}
const entry = SERVE_DIR ? serverEntry(SERVE_DIR) : null;
if (SERVE_DIR && !entry) {
  console.error(`deploy-smoke: ${SERVE_DIR} 下既无 packages/server/src/index.js 也无 index.ts`);
  process.exit(2);
}

const base = BASE || `http://127.0.0.1:${PORT}`;
const failures = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

// ---- ① 起服（--serve-dir 模式）----
let server = null;
const serverOut = [];
if (SERVE_DIR) {
  console.log(`[smoke] 起服布局：${entry.layout}`);
  server = spawn(process.execPath, entry.args, {
    cwd: SERVE_DIR,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (b) => { const s = String(b); serverOut.push(s); process.stdout.write(s); });
  server.stderr.on("data", (b) => { const s = String(b); serverOut.push(s); process.stderr.write(s); });
  let exited = false;
  server.on("exit", (code) => { exited = true; console.log(`[smoke] server 退出 code=${code}`); });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("起服超时（30s）")), 30000);
    const tick = setInterval(() => {
      if (serverOut.join("").includes("http+ws")) { clearTimeout(t); clearInterval(tick); resolve(); }
      if (exited) { clearTimeout(t); clearInterval(tick); reject(new Error("server 提前退出")); }
    }, 200);
  });
  // 起服日志里必须见到 schema 自检通过（#51 第一道门）
  check(serverOut.join("").includes("schema 自检通过"), "schema 自检通过（启动期 fail-fast 门）");
}

const cleanup = () => {
  if (server && !server.killed) server.kill("SIGTERM");
};
process.on("exit", cleanup);

try {
  // ---- ② 健康探针 ----
  const hz = await fetch(`${base}/healthz`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  check(!!hz?.ok, "/healthz 200", JSON.stringify(hz));

  // ---- ③④⑤ 双人开局：建房 + 入房 → started → patch 持续 ----
  // 单人停在 lobby 时状态不变化、根本不出增量——旧六步验收正是只 create→leave，
  // 所以「增量编码崩」完全隐形。必须凑齐两人进 started，物理才会逐帧广播。
  const { Client } = await import("colyseus.js");
  const client = new Client(base.replace(/^http/, "ws"));
  const room = await client.create("forest", { levelId: "forest_01", password: "smoke1" });
  check(!!room.sessionId, "colyseus.js 建房（A）", `sessionId=${room.sessionId}`);
  const roomB = await client.joinById(room.roomId, { password: "smoke1" });
  check(!!roomB.sessionId, "colyseus.js 入房（B）", `sessionId=${roomB.sessionId}`);

  let patches = 0;
  let sawStarted = false;
  room.onStateChange(() => { patches++; });
  room.onMessage("role", () => {});
  roomB.onStateChange(() => {});
  roomB.onMessage("role", () => {});

  const t0 = Date.now();
  // started 相位是增量广播开始的前提（lobby/ready 期只在相位切换时推一次）
  while (Date.now() - t0 < 20000) {
    if (String(room.state?.phase) === "started") { sawStarted = true; break; }
    await new Promise((r) => setTimeout(r, 200));
  }
  check(sawStarted, "双人到齐进入 started 相位", `phase=${room.state?.phase}`);

  const before = patches;
  const t1 = Date.now();
  await new Promise((r) => setTimeout(r, PATCH_WINDOW_MS));
  const during = patches - before;
  const rate = during / ((Date.now() - t1) / 1000);
  // started 期服务端每 tick 出一次 patch（≈60Hz）；闸门取"明显持续"下限，防抖动误判
  check(during >= 30 && rate >= 5, `started 期 patch 持续在流（${(Date.now() - t1)}ms 内 +${during}，${rate.toFixed(1)}/s）`);
  check(room.state?.phase === "started", "状态可读且相位推进正常", `phase=${room.state?.phase}`);

  const serverText = serverOut.join("");
  const crashed = /uncaughtException|Symbol\(Symbol\.metadata\)|encodeValue/.test(serverText);
  check(!crashed, "服务端全程无 schema 编码崩溃");
  check(server === null || server.exitCode === null, "服务端进程存活", server ? `exitCode=${server.exitCode}` : "（--base 模式不检查）");

  await roomB.leave(true);
  await room.leave(true);

  // ---- ⑥ 浏览器侧（有 playwright 时才跑）----
  if (!NO_BROWSER) {
    let chromium = null;
    try {
      ({ chromium } = await import("playwright"));
    } catch {
      console.log("SKIP  浏览器用例（本机无 playwright——仅仓库/CI 有）");
    }
    if (chromium) {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
        const errs = [];
        page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
        page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 200)); });
        await page.goto(`${base}/?level=forest_01`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => !!globalThis.__fw, null, { timeout: 60000 });
        await page.waitForFunction(() => globalThis.__fw.scene.isActive("Menu"), null, { timeout: 60000 });
        await page.fill("#password", "smoke1");
        await page.click("#btn-create");
        await page.waitForFunction(() => /房间码/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 45000 });
        await page.waitForFunction(() => globalThis.__fw.scene.isActive("Game"), null, { timeout: 45000 });
        check(true, "浏览器建房 → Game 场景 active");
        await page.waitForTimeout(2500);
        check(errs.length === 0, "浏览器 pageerror=0", errs.length ? JSON.stringify(errs.slice(0, 3)) : "");
        await page.close();
      } finally {
        await browser.close();
      }
    }
  }
} catch (err) {
  check(false, "冒烟过程未抛异常", String(err).slice(0, 300));
} finally {
  cleanup();
}

console.log(failures.length ? `\n=== deploy-smoke FAILED（${failures.length} 项）===` : "\n=== deploy-smoke ALL GREEN ===");
process.exit(failures.length ? 1 : 0);
