/**
 * r5 冷启剖析 II：分解「资产网络完→Menu active」段（~384ms 大头）。
 * 手段（全部页内钩子，文字化输出）：
 *  - Image onload 时间戳（Phaser onProcess blob→Image 解码完成时刻）
 *  - XHR loadend 时间戳
 *  - Boot scene loader filecomplete/complete 时刻
 *  - scene isActive(Boot/Menu) 翻转时刻（rAF 采样）
 *  - 首帧 Menu 渲染（rAF 采样连续帧）
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const PORT = 3572;
const BASE = `http://127.0.0.1:${PORT}`;
const LEVEL = "forest_01";
const rounds = Number(process.argv[2] ?? 2);
const log = (...a) => console.log("[r5b]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 60000);
    const ondata = (buf) => {
      const s = String(buf);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", (b) => process.stderr.write(b));
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

const INIT = `
(() => {
  const L = window.__log = { img: [], xhr: [], loaderDone: 0, bootCreate: 0, menuActive: 0, menuFirstFrame: 0, marks: {} };
  // Image onload 记录（Phaser blob→Image 解码完成）
  const OrigImage = window.Image;
  window.Image = function (w, h) {
    const img = new OrigImage(w, h);
    let onloadFn = null;
    Object.defineProperty(img, "onload", {
      get: () => onloadFn,
      set: (fn) => {
        onloadFn = fn;
        img.addEventListener("load", (ev) => {
          L.img.push({ ts: performance.now(), w: img.naturalWidth, h: img.naturalHeight });
          // 遮蔽原型 IDL 注册后浏览器不会再调 onload 属性——代为调用
          try { onloadFn && onloadFn.call(img, ev); } catch (e) { console.error(e); }
        }, { once: true });
      },
      configurable: true,
    });
    return img;
  };
  window.Image.prototype = OrigImage.prototype;
  // XHR loadend 记录
  const OrigOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u, ...rest) {
    this.__url = u;
    return OrigOpen.call(this, m, u, ...rest);
  };
  const OrigSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...a) {
    const t0 = performance.now();
    this.addEventListener("loadend", () => {
      L.xhr.push({ ts: performance.now(), start: t0, url: String(this.__url ?? ""), size: this.response?.size ?? 0 });
    }, { once: true });
    return OrigSend.apply(this, a);
  };
  // rAF 采样：fw 就绪 / Boot / Menu 激活
  const seen = {};
  const sample = () => {
    const g = globalThis.__fw;
    if (g && !seen.fw) { seen.fw = 1; L.marks.fwReady = performance.now(); hookLoader(g); }
    if (g && g.scene) {
      const sb = g.scene.getScene && (() => { try { return g.scene.getScene("Boot"); } catch { return null; } })();
      if (sb && !seen.bootActive) { seen.bootActive = 1; L.marks.bootActive = performance.now(); }
      let menuActive = false;
      try { menuActive = g.scene.isActive("Menu"); } catch {}
      if (menuActive && !L.menuActive) {
        L.menuActive = performance.now();
        L.menuFirstFrameTs = []; // 连续记录 5 帧
      }
      if (L.menuActive && L.menuFirstFrameTs.length < 5) L.menuFirstFrameTs.push(performance.now());
    }
    requestAnimationFrame(sample);
  };
  const hookLoader = (g) => {
    const tryHook = () => {
      const sb = (() => { try { return g.scene.getScene("Boot"); } catch { return null; } })();
      if (sb && sb.load) {
        sb.load.on("filecomplete", (key) => { if (!L.loaderDone) L["file_" + key] = performance.now(); });
        sb.load.on("complete", () => { L.loaderDone = performance.now(); });
        return true;
      }
      return false;
    };
    if (!tryHook()) { const iv = setInterval(() => { if (tryHook()) clearInterval(iv); }, 2); }
  };
  requestAnimationFrame(sample);
})();
`;

async function runRound(browser, round) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.addInitScript(INIT);
  const t0 = Date.now();
  await page.goto(`${BASE}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__fw?.scene?.isActive?.("Menu"), null, { timeout: 30000 });
  await page.waitForTimeout(150);
  const info = await page.evaluate(() => {
    const L = globalThis.__log;
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      nav: { dcl: nav?.domContentLoadedEventEnd, loadEvt: nav?.loadEventEnd },
      marks: L.marks, loaderDone: L.loaderDone, menuActive: L.menuActive, menuFirstFrameTs: L.menuFirstFrameTs,
      img: L.img, xhr: L.xhr.map((x) => ({ ...x, url: x.url.replace(location.origin, "") })),
      files: Object.fromEntries(Object.entries(L).filter(([k]) => k.startsWith("file_")).map(([k, v]) => [k.slice(5), v])),
    };
  });
  await ctx.close();
  return { round, wallMs: Date.now() - t0, info, errs };
}

const server = await startServer();
const browser = await chromium.launch({
  channel: process.env.FW_BROWSER_CHANNEL ?? undefined,
  headless: true,
  args: ["--mute-audio", "--enable-precise-memory-info"],
});
const all = { rounds: [] };
try {
  for (let i = 1; i <= rounds; i++) {
    const r = await runRound(browser, i);
    all.rounds.push(r);
  }
} finally {
  await browser.close().catch(() => {});
  try { process.kill(-server.pid, "SIGKILL"); } catch {}
  try { server.kill("SIGKILL"); } catch {}
}

for (const r of all.rounds) {
  const { nav, marks, loaderDone, menuActive, menuFirstFrameTs, img, xhr, files } = r.info;
  console.log(`\n===== round${r.round}（页内 ms）=====`);
  console.log(`DCL=${nav.dcl.toFixed(1)} loadEvt=${nav.loadEvt.toFixed(1)} fwReady=${marks.fwReady?.toFixed(1)} bootActive=${marks.bootActive?.toFixed(1)} loaderComplete=${loaderDone?.toFixed(1)} menuActive=${menuActive.toFixed(1)}`);
  console.log(`段：DCL→fw=${(marks.fwReady - nav.dcl).toFixed(1)} fw→bootActive=${(marks.bootActive - marks.fwReady).toFixed(1)} bootActive→loaderDone=${(loaderDone - marks.bootActive).toFixed(1)} loaderDone→menuActive=${(menuActive - loaderDone).toFixed(1)} | DCL→menuActive=${(menuActive - nav.dcl).toFixed(1)}`);
  console.log(`menu 后连续 5 帧采样：${menuFirstFrameTs.map((t) => t.toFixed(1)).join(", ")}`);
  console.log(`\nXHR（start→loadend，ms；size=blob 字节）：`);
  for (const x of xhr.sort((a, b) => a.start - b.start)) console.log(`  ${x.start.toFixed(1).padStart(7)}→${x.ts.toFixed(1).padStart(8)} (${(x.ts - x.start).toFixed(1).padStart(6)}ms) size=${String(x.size).padStart(8)} ${x.url.slice(0, 64)}`);
  console.log(`\nImage 解码 onload 完成时刻（ms；自然尺寸）：`);
  for (const i of img.sort((a, b) => a.ts - b.ts)) console.log(`  ${i.ts.toFixed(1).padStart(8)}  ${i.w}x${i.h}`);
  console.log(`\nloader filecomplete 时刻（ms）：`);
  for (const [k, v] of Object.entries(files).sort((a, b) => a[1] - b[1])) console.log(`  ${String(v.toFixed(1)).padStart(8)}  ${k}`);
}
mkdirSync(join(ROOT, "TEMP", "perfopt5"), { recursive: true });
  writeFileSync(join(ROOT, "TEMP", "perfopt5", "probe-decode.json"), JSON.stringify(all, null, 2));
log("done");
