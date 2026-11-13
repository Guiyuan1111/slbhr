#!/usr/bin/env node
/**
 * 分发包自验收（随包出厂，被 deploy.sh 调用）。
 *
 * 覆盖 DEPLOY §5 六步 + 一条「真开局」断言。后者是 #51 的教训：第 ⑥ 步原先只
 * create→leave，房间状态从未广播过增量，于是「能起服、不能开局」的崩溃完全隐形。
 *
 * 用法：
 *   node scripts/verify.mjs [--base http://127.0.0.1:2567] [--no-browser]
 *
 * 若目标不可达且本目录有预转译的服务端（`packages/server/src/index.js`），会自动
 * 在 `--base` 的端口上临时起一个服务、跑完杀掉——这样打包链与 CI 可以只凭包内
 * 文件验证「交付出去的那条验收命令本身能跑」，不需要外部先起服。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = argOf("base", `http://127.0.0.1:${process.env.PORT ?? 2567}`);
const NO_BROWSER = args.includes("--no-browser");
const PATCH_WINDOW_MS = Number(argOf("window", "8000"));
const PORT = Number(new URL(BASE).port || 80);

const PKG_DIR = fileURLToPath(new URL("..", import.meta.url));
const SERVER_ENTRY = join(PKG_DIR, "packages/server/src/index.js");

/**
 * 本部认定：包内 data/ 下只剩本部目录（打包层已剪别部），故「存在的那个」即本部。
 * 校验的是**包自己声明的边界**（只含它该含的那部），而不是硬编码 forest——这样
 * 2.x（light）、3.x（ice）分包无需改脚本就能自证，且能挡住「打着 light 的包其实
 * 装了 forest 内容」这类夹带。
 */
const TEMPLES = ["forest", "light", "ice"];
/** 各部「只属于自己」的关卡 id（不跨部、不在 tutorials 交叉引用里）：用于反向边界断言
 *  ——装着 A 部的包，must 让 B 部的这个关 404。注意 ice 部没有 ice_01（首关是
 *  tutorials/ice_02.json），故取 ice_03。 */
const FOREIGN_LEVEL = { forest: "forest_02", light: "light_02", ice: "ice_03" };
const present = TEMPLES.filter((t) => existsSync(join(PKG_DIR, "data", t)));
const TEMPLE = present.length === 1 ? present[0] : argOf("temple", null);
if (!TEMPLE) {
  console.log(`[verify] 无法从 data/ 认定本部（存在：${present.join(", ") || "无"}）——请用 --temple 指定\n`);
}
/** 本部清单（temple.json levels）——注意清单会引用别部教学关（light 含 forest_01，
 *  ice 含 forest_01+light_01），那些是本部内容，不是越界。 */
function templeManifest() {
  if (!TEMPLE) return { ids: [] };
  try {
    const j = JSON.parse(readFileSync(join(PKG_DIR, "data", TEMPLE, "temple.json"), "utf8"));
    const ids = (j.levels ?? []).map((l) => String(l.filename ?? "").split("/").pop()?.replace(/\.json$/, "") ?? "").filter(Boolean);
    return { ids };
  } catch {
    return { ids: [] };
  }
}
const manifest = templeManifest();
/** 本部首关：与打包器/CI 同一份推导（tutorials 里的首关 + ice 的 initial 指别部关，
 *  两条陷阱都在 first-level.mjs 里统一处理） */
const FIRST_LEVEL = argOf(
  "level",
  TEMPLE ? execFileSync(process.execPath, [join(PKG_DIR, "scripts/first-level.mjs"), join(PKG_DIR, "data", TEMPLE, "temple.json"), TEMPLE], { encoding: "utf8" }).trim() : null,
);
/** 包内实际装了的关卡 id 全集（本部 levels 目录 + tutorials 目录） */
function packagedLevelIds() {
  const out = new Set();
  for (const rel of TEMPLE ? [`data/${TEMPLE}/levels`, "data/tutorials/levels"] : []) {
    const dir = join(PKG_DIR, rel);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith(".json")) out.add(f.replace(/\.json$/, ""));
  }
  return [...out].sort();
}
const PACKAGED_IDS = packagedLevelIds();

/** 目标不可达且包内有服务端 → 自己起一个（返回 close 函数） */
async function ensureServer() {
  const alive = await fetch(`${BASE}/healthz`).then((r) => r.ok).catch(() => false);
  if (alive) {
    console.log(`[verify] 复用已在运行的服务 ${BASE}\n`);
    return () => {};
  }
  if (!existsSync(SERVER_ENTRY)) {
    console.log(`[verify] ${BASE} 不可达，且本目录无 packages/server/src/index.js\n`);
    return () => {};
  }
  console.log(`[verify] 目标不可达，临时起服 :${PORT} …`);
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: PKG_DIR,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1", FW_WIND_PHASE: process.env.FW_WIND_PHASE ?? "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (b) => { out += String(b); });
  child.stderr.on("data", (b) => { out += String(b); });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await fetch(`${BASE}/healthz`).then((r) => r.ok).catch(() => false)) {
      console.log("[verify] 临时服务就绪\n");
      return () => child.kill("SIGTERM");
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill("SIGTERM");
  console.log(`[verify] 临时服务起不来，输出：\n${out.slice(0, 1500)}`);
  return () => {};
}

const stopServer = await ensureServer();
process.on("exit", stopServer);

const failures = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

const j = async (url) => {
  try {
    const r = await fetch(url);
    return { status: r.status, ct: r.headers.get("content-type") ?? "", body: r };
  } catch {
    return { status: 0, ct: "", body: null };
  }
};

console.log(`[verify] 目标 ${BASE}\n`);

// ① 健康探针
{
  const r = await j(`${BASE}/healthz`);
  let ok = false;
  let txt = "";
  if (r.body) {
    txt = await r.body.text();
    try { ok = JSON.parse(txt).ok === true; } catch { ok = false; }
  }
  check(ok, "① /healthz 200 且 ok:true", txt.slice(0, 80));
}

// ② 首页
{
  const r = await j(`${BASE}/`);
  check(r.status === 200 && r.ct.includes("text/html"), "② 首页 200 + text/html", `${r.status} ${r.ct}`);
}

// ③ 关卡清单只含包内实装的关卡（"只含一部"的核心断言）
{
  const r = await j(`${BASE}/api/levels`);
  let ids = [];
  if (r.body) {
    try { ids = JSON.parse(await r.body.text()).ids ?? []; } catch { ids = []; }
  }
  // 判据是「服务端列的 == 包内实装的」，而不是「前缀必须等于本部」——后者会被
  // tutorial 交叉引用误判（light 包合法含 forest_01）。多一个 = 夹带了别部内容；
  // 少一个 = 包被剪坏。
  const pkgSet = new Set(PACKAGED_IDS);
  const extra = ids.filter((x) => !pkgSet.has(String(x)));
  const missing = PACKAGED_IDS.filter((x) => !ids.includes(x));
  check(
    ids.length > 0 && extra.length === 0 && missing.length === 0,
    `③ /api/levels == 包内实装（${TEMPLE}，${PACKAGED_IDS.length} 关）`,
    `列出 ${ids.length} 关${extra.length ? " 夹带=" + extra.slice(0, 3) : ""}${missing.length ? " 缺失=" + missing.slice(0, 3) : ""}`,
  );
}

// ④ 分发边界：本部首关 200；别部专属关 404（预期行为，见 §9）
{
  const first = FIRST_LEVEL;
  const ok = await j(`${BASE}/api/level/${first}`);
  const others = TEMPLES.filter((t) => t !== TEMPLE);
  const bad = [];
  for (const o of others) {
    const id = FOREIGN_LEVEL[o];
    if (!id) continue;
    const r = await j(`${BASE}/api/level/${id}`);
    if (r.status !== 404) bad.push(`${id}=${r.status}`);
  }
  check(
    ok.status === 200 && bad.length === 0,
    `④ ${first}=200 / ${others.map((o) => `${FOREIGN_LEVEL[o]}=404`).join(" ")}`,
    `${ok.status}${bad.length ? " " + bad.join(" ") : ""}`,
  );
}

// ⑤ 音频流式路由
{
  const r = await j(`${BASE}/assets/audio/s/MenuMusic`);
  check(r.status === 200 && r.ct.includes("octet-stream"), "⑤ 音频流 200 + octet-stream", `${r.status} ${r.ct}`);
}

// ⑥+ 真开局：双人 started + patch 持续
{
  try {
    const { Client } = await import("colyseus.js");
    const client = new Client(BASE.replace(/^http/, "ws"));
    const pw = "verify1";
    const a = await client.create("forest", { levelId: FIRST_LEVEL, password: pw });
    check(!!a.sessionId, "⑥ 建房成功", `roomId=${a.roomId}`);
    const b = await client.joinById(a.roomId, { password: pw });
    check(!!b.sessionId, "⑥ 第二人入房成功", `sessionId=${b.sessionId}`);
    a.onMessage("role", () => {});
    b.onMessage("role", () => {});

    let patches = 0;
    a.onStateChange(() => { patches++; });

    const t0 = Date.now();
    let started = false;
    while (Date.now() - t0 < 20000) {
      if (String(a.state?.phase) === "started") { started = true; break; }
      await new Promise((r) => setTimeout(r, 200));
    }
    check(started, "⑦ 双人到齐进入 started", `phase=${a.state?.phase}`);

    const before = patches;
    const t1 = Date.now();
    await new Promise((r) => setTimeout(r, PATCH_WINDOW_MS));
    const gained = patches - before;
    const secs = (Date.now() - t1) / 1000;
    // started 期服务端每 tick 一次 patch（≈60Hz）；取「明显持续」下限防抖动误判
    check(gained >= 30 && gained / secs >= 5, "⑧ started 期 patch 持续在流", `${secs.toFixed(0)}s 内 +${gained}（${(gained / secs).toFixed(1)}/s）`);

    await b.leave(true).catch(() => {});
    await a.leave(true).catch(() => {});
  } catch (err) {
    check(false, "⑥⑦⑧ 联机真开局", String(err).slice(0, 200));
  }
}

// ⑨ 浏览器（可选）
if (!NO_BROWSER) {
  let chromium = null;
  try { ({ chromium } = await import("playwright")); } catch { /* 包里没有，跳过 */ }
  if (!chromium) {
    console.log("SKIP  ⑨ 浏览器用例（本机无 playwright；服务端断言已覆盖开局崩溃）");
  } else {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e).slice(0, 150)));
      page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 150)); });
      await page.goto(`${BASE}/?level=${FIRST_LEVEL}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !!globalThis.__fw, null, { timeout: 60000 });
      await page.waitForFunction(() => globalThis.__fw.scene.isActive("Menu"), null, { timeout: 60000 });
      await page.fill("#password", "verify1");
      await page.click("#btn-create");
      await page.waitForFunction(() => /房间码/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 45000 });
      await page.waitForFunction(() => globalThis.__fw.scene.isActive("Game"), null, { timeout: 45000 });
      check(true, "⑨ 浏览器建房 → Game 场景 active");
      await page.waitForTimeout(2000);
      check(errs.length === 0, "⑨ 浏览器零报错", errs.length ? JSON.stringify(errs.slice(0, 2)) : "");
      await page.close();
    } catch (err) {
      check(false, "⑨ 浏览器用例", String(err).slice(0, 150));
    } finally {
      await browser.close();
    }
  }
}

console.log(failures.length ? `\n=== 验收未通过（${failures.length} 项）===` : "\n=== 验收全绿 ===");
process.exit(failures.length ? 1 : 0);
