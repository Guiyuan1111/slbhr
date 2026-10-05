// 视觉渲染复刻度基准（像素差分）
//
// 用法（Git Bash）：
//   export PATH="$PWD/TEMP/node:$PATH"
//   node --import tsx benchmark/visual-diff.mjs                 # 跑分打印
//   node --import tsx benchmark/visual-diff.mjs --save visual-v0.3.6
//
// 原理：
//   原版侧：capture.mjs 同款基建（8787 静态服 + route 拦截 + temple 跳关 + 物理步计数钩子），
//           forest_01 就绪后第 60 物理帧对 canvas 元素截图（无输入，角色 idle）。
//   我方侧：2567 服务器 + 双浏览器入房（e2e 同款流程），phase=started 后 ~1s 对 canvas 截图。
//   差分：页内把两张 PNG 归一化到 480×360 灰度，±48px 平移搜索取最优对齐，
//         报告容差 24/48 匹配率与平均绝对差；顶部 64px（原版画布内 HUD 区）单列。
import { chromium } from "playwright";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_A_DIR = path.resolve(ROOT, "../Fireboy-and-Watergirl/output/A");
const FRAME_TARGET = 60; // 就绪后第 60 物理帧采样
const OURS_WAIT_MS = 1000; // started 后等待（对齐采样时刻）
const argv = process.argv.slice(2);
const saveIdx = argv.indexOf("--save");

// ---------- 8787 静态服（原版站） ----------
const MIME = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".woff": "font/woff", ".css": "text/css" };
function serveStatic(rootDir, port) {
  const parentDir = path.resolve(rootDir, ".."); // /multiplayer.js 等绝对路径引用在 output/ 父目录
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent((req.url || "/").split("?")[0]);
      const rel = u === "/" ? "gameIndex.html" : u.replace(/^\//, "");
      let p = path.join(rootDir, rel);
      if (!p.startsWith(rootDir)) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(p)) p = path.join(parentDir, rel);
      fs.readFile(p, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { "Content-Type": MIME[path.extname(p).toLowerCase()] ?? "application/octet-stream" });
        res.end(data);
      });
    });
    srv.listen(port, "127.0.0.1", () => resolve(srv));
  });
}

// ---------- 我方 2567 服务器 ----------
async function spawnOurs() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "packages/server/src/index.ts"], {
      cwd: ROOT, env: { ...process.env, PORT: "2567" }, stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => reject(new Error("ours server timeout")), 30000);
    const ondata = (s) => {
      process.stderr.write("[ours] " + s);
      if (String(s).includes("http+ws") || String(s).includes("2567")) {
        clearTimeout(timer); resolve(child);
      }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", ondata);
    child.on("exit", (c) => reject(new Error("ours server exit " + c)));
  });
}

async function launchBrowser() {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel, headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
    } catch { /* next */ }
  }
  return chromium.launch({ headless: true });
}

// ---------- 原版侧 ----------
const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } })()`;
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } })()`;
const RESOLVE = `(function () {
  var g = require('Phaser').GAMES[0];
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
  var hit = temple.levels.find(function (l) { return l.filename.indexOf('/forest_01.json') >= 0; });
  return hit ? hit.filename : null;
})()`;
const NAVIGATE = `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'forest'; });
  var levelData = temple.levels.find(function (l) { return l.filename === __FNAME__; });
  g.currentTemple = temple;
  g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return true;
})()`;
const INSTALL_HOOK = `(function () {
  var g = require('Phaser').GAMES[0];
  var plugin = g.physics.box2d;
  if (window.__vhook) return true;
  window.__vhook = { f: 0, target: ${FRAME_TARGET}, done: false };
  var orig = plugin.update;
  plugin.update = function () { orig.call(this); if (!window.__vhook.done && !this.paused) { window.__vhook.f++; if (window.__vhook.f >= window.__vhook.target) window.__vhook.done = true; } };
  return true;
})()`;

async function shootOriginal(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await ctx.newPage();
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (!u.startsWith("http://127.0.0.1:8787")) return route.abort();
    if (/\.mp3(\?|$)/.test(u)) return route.abort();
    return route.continue();
  });
  await page.goto("http://127.0.0.1:8787/gameIndex.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log("[visual][orig] 等待 progress…");
  await page.waitForFunction(READY_PROG, null, { timeout: 60000 });
  const fname = await page.evaluate(RESOLVE);
  console.log("[visual][orig] level file:", fname);
  if (!fname) throw new Error("forest_01 未解析");
  // 等 menu 资产加载空闲再跳关：menu 的加载指示组销毁后其 loader 信号回调仍残留，
  // 若在 menu 载入中途跳关，level 加载完成时残留回调先引爆（a.game null）并中断派发链
  await page.waitForFunction(`(() => { try { return require('Phaser').GAMES[0].load.isLoading === false; } catch { return false; } })()`, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.evaluate(NAVIGATE.replace("__FNAME__", JSON.stringify(fname)));
  console.log("[visual][orig] 等待 level loadComplete…");
  await page.waitForFunction(READY_LEVEL, null, { timeout: 60000 });
  console.log("[visual][orig] level 就绪，等物理启动…");
  await page.waitForFunction(`(() => { try { return require('Phaser').GAMES[0].physics.box2d.paused === false; } catch { return false; } })()`, null, { timeout: 30000 });
  await page.evaluate(INSTALL_HOOK);
  await page.waitForFunction(`window.__vhook.done === true`, null, { timeout: 30000 });
  const canvas = page.locator("canvas").first();
  const shot = await canvas.screenshot();
  const meta = await page.evaluate(`(() => { var g = require('Phaser').GAMES[0]; return { w: g.width, h: g.height, cw: g.canvas && g.canvas.width, ch: g.canvas && g.canvas.height }; })()`);
  await ctx.close();
  return { shot, meta };
}

// ---------- 我方侧 ----------
async function enterAs(page, mode, roomCode) {
  await page.goto(`http://127.0.0.1:2567/?level=forest_01`, { waitUntil: "domcontentloaded" });
  await page.fill("#password", "vw");
  if (mode === "join") await page.fill("#roomcode", roomCode);
  await page.click(mode === "create" ? "#btn-create" : "#btn-join");
  try { await page.waitForSelector("#menu", { state: "hidden", timeout: 12000 }); }
  catch {
    console.log("[visual][ours] 第一次入房失败，menu-error:", await page.textContent("#menu-error").catch(() => "?"));
    await page.click(mode === "create" ? "#btn-create" : "#btn-join");
    try { await page.waitForSelector("#menu", { state: "hidden", timeout: 12000 }); }
    catch { console.log("[visual][ours] 第二次仍失败，menu-error:", await page.textContent("#menu-error").catch(() => "?")); throw new Error("入房失败"); }
  }
  await page.waitForFunction(() => /房间码 [A-Za-z0-9]+/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 20000 });
  const t = await page.textContent("#hud-room");
  return (t.match(/房间码 ([A-Za-z0-9]+)/) || [])[1] ?? "";
}

async function shootOurs(browser) {
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const code = await enterAs(a, "create");
  await enterAs(b, "join", code);
  await a.waitForFunction(() => document.querySelector("#hud-status")?.textContent === "", null, { timeout: 25000 });
  await a.waitForTimeout(OURS_WAIT_MS);
  const canvas = a.locator("#game-root canvas").first();
  const shot = await canvas.screenshot();
  const meta = await a.evaluate(`(() => { var c = document.querySelector('#game-root canvas'); return { cw: c.width, ch: c.height, sw: c.style.width, sh: c.style.height }; })()`);
  await ctxA.close(); await ctxB.close();
  return { shot, meta };
}

// ---------- 差分（页内计算） ----------
const DIFF_PROG = async (bufA, bufB) => {
  const ctx = await globalThis.__diffBrowser.newContext();
  const page = await ctx.newPage();
  const a64 = "data:image/png;base64," + bufA.toString("base64");
  const b64 = "data:image/png;base64," + bufB.toString("base64");
  const result = await page.evaluate(async (args) => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const [ia, ib] = await Promise.all([load(args.a64), load(args.b64)]);
    const W = 480, H = 360;
    const gray = (img) => {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data;
      const g = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      return g;
    };
    const ga = gray(ia), gb = gray(ib);
    const score = (ox, oy, band) => {
      let n = 0, ok24 = 0, ok48 = 0, sum = 0;
      const y0 = band === "top" ? 0 : Math.round(H * 0.14), y1 = band === "top" ? Math.round(H * 0.14) : H;
      for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
        const xs = x + ox, ys = y + oy;
        if (xs < 0 || xs >= W || ys < 0 || ys >= H) continue;
        const d = Math.abs(ga[y * W + x] - gb[ys * W + xs]);
        n++; sum += d;
        if (d <= 24) ok24++; if (d <= 48) ok48++;
      }
      return { n, rate24: ok24 / n, rate48: ok48 / n, mad: sum / n };
    };
    // 平移搜索（-48..48 步长 4，粗搜索）
    let best = null;
    for (let oy = -48; oy <= 48; oy += 4)
      for (let ox = -48; ox <= 48; ox += 4) {
        const s = score(ox, oy, "full");
        if (!best || s.rate48 > best.s.rate48) best = { ox, oy, s };
      }
    // 最优偏移处细搜
    for (let oy = best.oy - 3; oy <= best.oy + 3; oy++)
      for (let ox = best.ox - 3; ox <= best.ox + 3; ox++) {
        const s = score(ox, oy, "full");
        if (s.rate48 > best.s.rate48) best = { ox, oy, s };
      }
    const top = score(0, 0, "top");
    const zero = score(0, 0, "full");
    return {
      bestOffset: { x: best.ox, y: best.oy },
      full: { rate24: +best.s.rate24.toFixed(4), rate48: +best.s.rate48.toFixed(4), mad: +best.s.mad.toFixed(2) },
      zeroOffset: { rate24: +zero.rate24.toFixed(4), rate48: +zero.rate48.toFixed(4), mad: +zero.mad.toFixed(2) },
      topBand: { rate24: +top.rate24.toFixed(4), rate48: +top.rate48.toFixed(4), mad: +top.mad.toFixed(2) },
    };
  }, { a64, b64 });
  await ctx.close();
  return result;
};

// ---------- 主流程 ----------
(async () => {
  const srv8787 = await serveStatic(OUT_A_DIR, 8787);
  const ours = await spawnOurs();
  await new Promise((r) => setTimeout(r, 2000));
  const browser = await launchBrowser();
  globalThis.__diffBrowser = browser;
  let original, oursShot, diff;
  try {
    console.log("[visual] 原版截图…");
    original = await shootOriginal(browser);
    console.log("[visual] 原版画布:", JSON.stringify(original.meta));
    console.log("[visual] 我方截图…");
    oursShot = await shootOurs(browser);
    console.log("[visual] 我方画布:", JSON.stringify(oursShot.meta));
    fs.mkdirSync(path.join(ROOT, "benchmark/results"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "benchmark/results/visual-original.png"), original.shot);
    fs.writeFileSync(path.join(ROOT, "benchmark/results/visual-ours.png"), oursShot.shot);
    console.log("[visual] 差分计算…");
    diff = await DIFF_PROG(original.shot, oursShot.shot);
    const visualScore = +(diff.full.rate48 * 100).toFixed(2);
    const report = {
      meta: { generatedAt: new Date().toISOString(), frameTarget: FRAME_TARGET, note: "forest_01 就绪后第60物理帧，无输入 idle" },
      originalCanvas: original.meta, oursCanvas: oursShot.meta,
      diff, visualScore,
    };
    console.log("\n=== 视觉差分（forest_01 idle @60物理帧）===");
    console.log("最优平移:", JSON.stringify(diff.bestOffset));
    console.log("全帧  容差48匹配率:", (diff.full.rate48 * 100).toFixed(2) + "%", " 容差24:", (diff.full.rate24 * 100).toFixed(2) + "%", " 平均|Δ|:", diff.full.mad);
    console.log("零偏移 容差48:", (diff.zeroOffset.rate48 * 100).toFixed(2) + "%");
    console.log("顶部HUD带 容差48:", (diff.topBand.rate48 * 100).toFixed(2) + "%");
    console.log("████ 视觉复刻度指数（容差48匹配率）:", visualScore, "/ 100 ████");
    if (saveIdx >= 0) {
      const label = argv[saveIdx + 1];
      fs.writeFileSync(path.join(ROOT, "benchmark/results", `${label}.json`), JSON.stringify(report, null, 1));
      console.log("已保存 → benchmark/results/" + label + ".json");
    }
  } finally {
    await browser.close().catch(() => {});
    ours.kill();
    srv8787.close();
  }
})().catch((e) => { console.error("[visual] 失败:", e.message); process.exit(1); });
