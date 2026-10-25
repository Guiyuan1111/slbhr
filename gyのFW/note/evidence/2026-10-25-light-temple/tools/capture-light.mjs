/**
 * P-03 后·48 关加载初态双端视觉核实——单关采集+差分（闲时批量任务公用件）。
 * 从 benchmark/visual-diff.mjs 复制 oracle 跳关钩子/我方入房/像素差分（口径 39 号档 §3.2），
 * 参数化关卡；oracle/ours 侧每次运行独立 browser（17 号档 §4 纪律）。
 * 依赖：共享 8787 静态服（serve8787.mjs）+ 共享 2567 我方服（主会话起）。
 * 用法：node --import tsx TEMP/pvis/capture-one.mjs <level>
 * 产出：TEMP/pvis/<level>/{oracle.png, ours.png, diff.json}；stdout 一行 JSON 摘要。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_A_DIR = path.resolve(ROOT, "../Fireboy-and-Watergirl/output/B");
const STATIC_PORT = 8788;
const OURS_PORT = 2567;
const FRAME_TARGET = 60;
const OURS_WAIT_MS = 1000;
const HIDE_DOM_SELECTORS = "#menu,#hud,#toast";
const LEVEL = process.argv[2];
if (!LEVEL || !/^light_[0-9a-z_]+$/.test(LEVEL)) { console.error("用法: node capture-light.mjs <level>"); process.exit(2); }
const OUT = path.join(__dirname, LEVEL);
fs.mkdirSync(OUT, { recursive: true });

async function launchBrowser() {
  for (const channel of ["msedge", "chrome"]) {
    try { return await chromium.launch({ channel, headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] }); } catch { /* next */ }
  }
  return chromium.launch({ headless: true });
}

// ---------- oracle 侧（visual-diff.mjs 同款钩子，RESOLVE 参数化） ----------
const READY_PROG = `(() => { try { const g = require('Phaser').GAMES[0]; return !!(g && g.progress && g.progress.attributes && Array.isArray(g.progress.attributes.temples) && g.progress.attributes.temples.length > 0); } catch { return false; } })()`;
const READY_LEVEL = `(() => { try { const g = require('Phaser').GAMES[0]; const L = g.level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.groundBody); } catch { return false; } })()`;
const RESOLVE = `(function () {
  var g = require('Phaser').GAMES[0];
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'light'; });
  var hit = temple.levels.find(function (l) { return l.filename.indexOf('__FNAME__') >= 0; });
  return hit ? hit.filename : null;
})()`;
const NAVIGATE = `(function () {
  var g = require('Phaser').GAMES[0];
  var Level = require('States/Level/Level');
  var temple = g.progress.attributes.temples.find(function (t) { return t.id === 'light'; });
  var levelData = temple.levels.find(function (l) { return l.filename === __FNAME__ });
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
    if (!u.startsWith(`http://127.0.0.1:${STATIC_PORT}`)) return route.abort();
    if (/\.mp3(\?|$)/.test(u)) return route.abort();
    return route.continue();
  });
  await page.goto(`http://127.0.0.1:${STATIC_PORT}/gameIndex.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(READY_PROG, null, { timeout: 60000 });
  const fname = await page.evaluate(RESOLVE.replace("__FNAME__", `/${LEVEL}.json`));
  if (!fname) throw new Error(`${LEVEL} 未在 forest temple 解析到文件名`);
  await page.waitForFunction(`(() => { try { return require('Phaser').GAMES[0].load.isLoading === false; } catch { return false; } })()`, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.evaluate(NAVIGATE.replace(/__FNAME__/g, JSON.stringify(fname)));
  await page.waitForFunction(READY_LEVEL, null, { timeout: 60000 });
  await page.waitForFunction(`(() => { try { return require('Phaser').GAMES[0].physics.box2d.paused === false; } catch { return false; } })()`, null, { timeout: 30000 });
  await page.evaluate(INSTALL_HOOK);
  await page.waitForFunction(`window.__vhook.done === true`, null, { timeout: 30000 });
  const canvas = page.locator("canvas").first();
  const shot = await canvas.screenshot();
  const meta = await page.evaluate(`(() => { var g = require('Phaser').GAMES[0]; return { w: g.width, h: g.height, cw: g.canvas && g.canvas.width, ch: g.canvas && g.canvas.height }; })()`);
  await ctx.close();
  return { shot, meta };
}

// ---------- 我方侧（visual-diff.mjs 同款双浏览器入房） ----------
async function enterAs(page, mode, roomCode) {
  await page.goto(`http://127.0.0.1:${OURS_PORT}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  await page.fill("#password", "vw-pw");
  if (mode === "join") await page.fill("#roomcode", roomCode);
  await page.click(mode === "create" ? "#btn-create" : "#btn-join");
  try { await page.waitForSelector("#menu", { state: "hidden", timeout: 12000 }); }
  catch {
    await page.click(mode === "create" ? "#btn-create" : "#btn-join");
    await page.waitForSelector("#menu", { state: "hidden", timeout: 12000 });
  }
  await page.waitForFunction(() => /房间码 [^（\s]{4}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 20000 });
  const t = await page.textContent("#hud-room");
  return (t.match(/房间码 ([^（\s]+)/) || [])[1] ?? "";
}

async function shootOurs(browser) {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  let code = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      code = await enterAs(a, "create");
      for (let i = 0; i < 10 && code.length < 4; i++) {
        await a.waitForTimeout(400);
        const t = await a.textContent("#hud-room").catch(() => "");
        const m = (t || "").match(/房间码 ([^（\s]+)/);
        if (m) code = m[1];
      }
      await new Promise((r) => setTimeout(r, 500));
      await enterAs(b, "join", code);
      break;
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  await a.waitForFunction(() => document.querySelector("#hud-status")?.textContent === "", null, { timeout: 25000 });
  await a.waitForTimeout(OURS_WAIT_MS);
  await a.evaluate(`(() => { const st = document.createElement("style"); st.textContent = ${JSON.stringify(HIDE_DOM_SELECTORS)} + "{display:none !important}"; document.head.appendChild(st); return true; })()`);
  await a.evaluate(`(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))()`);
  const canvas = a.locator("#game-root canvas").first();
  const shot = await canvas.screenshot();
  const meta = await a.evaluate(`(() => { var c = document.querySelector('#game-root canvas'); return { cw: c.width, ch: c.height, sw: c.style.width, sh: c.style.height }; })()`);
  await ctxA.close(); await ctxB.close();
  return { shot, meta };
}

// ---------- 差分（visual-diff.mjs DIFF_PROG 同款：480×360 灰度+平移对齐+12×9 网格） ----------
async function diffShots(browser, bufA, bufB) {
  const ctx = await browser.newContext();
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
    let best = null;
    for (let oy = -48; oy <= 48; oy += 4)
      for (let ox = -48; ox <= 48; ox += 4) {
        const s = score(ox, oy, "full");
        if (!best || s.rate48 > best.s.rate48) best = { ox, oy, s };
      }
    for (let oy = best.oy - 3; oy <= best.oy + 3; oy++)
      for (let ox = best.ox - 3; ox <= best.ox + 3; ox++) {
        const s = score(ox, oy, "full");
        if (s.rate48 > best.s.rate48) best = { ox, oy, s };
      }
    const zero = score(0, 0, "full");
    const GX = 12, GY = 9, CW = W / GX, CH = H / GY;
    const grid = [];
    for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
      let n = 0, bad48 = 0, sum = 0;
      for (let y = Math.floor(gy * CH); y < Math.floor((gy + 1) * CH); y++)
        for (let x = Math.floor(gx * CW); x < Math.floor((gx + 1) * CW); x++) {
          const xs = x + best.ox, ys = y + best.oy;
          if (xs < 0 || xs >= W || ys < 0 || ys >= H) continue;
          const d = Math.abs(ga[y * W + x] - gb[ys * W + xs]);
          n++; sum += d; if (d > 48) bad48++;
        }
      grid.push({ gx, gy, rate48: +(1 - bad48 / n).toFixed(3), mad: +(sum / n).toFixed(1) });
    }
    grid.sort((p, q) => p.rate48 - q.rate48);
    return {
      bestOffset: { x: best.ox, y: best.oy },
      full: { rate24: +best.s.rate24.toFixed(4), rate48: +best.s.rate48.toFixed(4), mad: +best.s.mad.toFixed(2) },
      zeroOffset: { rate24: +zero.rate24.toFixed(4), rate48: +zero.rate48.toFixed(4), mad: +zero.mad.toFixed(2) },
      worstGrid: grid.slice(0, 6),
    };
  }, { a64, b64 });
  await ctx.close();
  return result;
}

// ---------- 主流程 ----------
const browser = await launchBrowser();
const scope = { browser };
try {
  const oracle = await shootOriginal(browser);
  fs.writeFileSync(path.join(OUT, "oracle.png"), oracle.shot);
  const ours = await shootOurs(browser);
  fs.writeFileSync(path.join(OUT, "ours.png"), ours.shot);
  const diff = await diffShots(browser, oracle.shot, ours.shot);
  const report = { level: LEVEL, generatedAt: new Date().toISOString(), frameTarget: FRAME_TARGET, oracleCanvas: oracle.meta, oursCanvas: ours.meta, diff, visualScore: +(diff.full.rate48 * 100).toFixed(2) };
  fs.writeFileSync(path.join(OUT, "diff.json"), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ level: LEVEL, ok: true, rate48: report.visualScore, mad: diff.full.mad, bestOffset: diff.bestOffset }));
} catch (e) {
  fs.writeFileSync(path.join(OUT, "error.json"), JSON.stringify({ level: LEVEL, at: new Date().toISOString(), error: String(e?.message || e).slice(0, 500) }, null, 1));
  console.log(JSON.stringify({ level: LEVEL, ok: false, error: String(e?.message || e).slice(0, 200) }));
  process.exitCode = 1;
} finally {
  await scope.browser.close().catch(() => {});
}
