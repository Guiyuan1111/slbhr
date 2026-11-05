/**
 * 抓真实选关树的源 alpha（r49 诊断用，一次性）。
 *
 * 手段：包 `CanvasRenderingContext2D.prototype.getImageData`。树烘焙的 `prepare` 任务会对
 * 每层调用一次 `getImageData(0,0,canvasW,canvasH)` 读回整层像素——那里拿到的正是
 * `bevelColorMatrix` 的输入 alpha。不改源码。
 *
 * 输出：每层 alpha 通道的 base64 + 统计（像素覆盖率、R 窗口空占比 = 短路命中率）。
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3641;
const BASE = `http://127.0.0.1:${PORT}`;
const TEMPLE = process.env.TEMPLE ?? "forest";

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

/** 页内：截 getImageData，然后走 Play 进 Temple，等烘焙完成 */
const DUMP = `async () => {
  const cap = [];
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.getImageData;
  proto.getImageData = function (x, y, w, h) {
    const d = orig.call(this, x, y, w, h);
    // 只认整块读回（prepare 的签名），且排除小画布
    if (x === 0 && y === 0 && w > 500 && h > 400) {
      cap.push({ w, h, data: d.data });
    }
    return d;
  };

  const g = window.__fw;
  const sm = g.scene;
  if (!sm.isActive("Menu")) { sm.stop("Temple"); sm.start("Menu"); }
  await new Promise((r) => setTimeout(r, 300));
  const menu = sm.getScene("Menu");
  const zones = menu.children.list.filter((o) => o.type === "Zone" && o.input);
  const playZone = zones[zones.length - 1];
  if (playZone) playZone.emit("pointerup"); else sm.start("Temple");

  const deadline = performance.now() + 40000;
  while (performance.now() < deadline) {
    if (!sm.isActive("Temple")) { await new Promise((r) => setTimeout(r, 50)); continue; }
    const t = sm.getScene("Temple");
    if (Array.isArray(t.flatFallbacks) && t.flatFallbacks.length === 0 && t.children.list.length > 0) break;
    await new Promise((r) => setTimeout(r, 80));
  }
  proto.getImageData = orig;
  if (!cap.length) return { error: "未捕获到 getImageData" };

  // 三层各算统计：覆盖率 + R=7 / R=8 的窗口空占比
  const out = [];
  for (const c of cap) {
    const { w, h, data } = c;
    const a = new Uint8Array(w * h);
    let cover = 0;
    for (let i = 0; i < w * h; i++) { const v = data[i * 4 + 3]; a[i] = v; if (v) cover++; }
    // 前缀和 → O(1) 窗口空判定
    const stride = w + 1;
    const sat = new Int32Array(stride * (h + 1));
    for (let y = 0; y < h; y++) {
      let rs = 0; const row = y * w;
      for (let x = 0; x < w; x++) {
        rs += a[row + x];
        sat[(y + 1) * stride + (x + 1)] = sat[y * stride + (x + 1)] + rs;
      }
    }
    const winEmpty = (R) => {
      let n = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const xa = Math.max(0, x - R), ya = Math.max(0, y - R);
          const xb = Math.min(stride - 1, x + R + 1), yb = Math.min(h, y + R + 1);
          let s = 0;
          if (xb > xa && yb > ya) s = sat[yb * stride + xb] - sat[ya * stride + xb] - sat[yb * stride + xa] + sat[ya * stride + xa];
          if (s === 0) n++;
        }
      }
      return n / (w * h);
    };
    const rowsWithAlpha = (() => { let n = 0; for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) s += a[y * w + x]; if (s) n++; } return n / h; })();
    out.push({
      w, h,
      coverPct: +((cover / (w * h)) * 100).toFixed(2),
      rowsWithAlphaPct: +(rowsWithAlpha * 100).toFixed(1),
      winEmptyR7Pct: +(winEmpty(7) * 100).toFixed(1),
      winEmptyR8Pct: +(winEmpty(8) * 100).toFixed(1),
      b64: btoa(String.fromCharCode(...a.subarray(0, 0))) // 占位，真数据单独取
    });
  }
  return { n: cap.length, stats: out, raw: cap };
}`;

const server = await startServer();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`${BASE}/?level=${TEMPLE}_01`, { waitUntil: "domcontentloaded" });
await page.fill("#password", "dump-pw");
await page.waitForFunction(() => !!window.__fw, null, { timeout: 40000 });
await page.waitForSelector("#menu", { state: "hidden", timeout: 5000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 400));

const res = await page.evaluate(`(${DUMP})()`);

const stat = res.stats ?? [];
console.log(`\n真实树烘焙源 alpha（temple=${TEMPLE}，捕获 ${res.n} 层）`);
console.log("  层  canvas        覆盖率   有 alpha 的行   窗口空占比 R=7   R=8");
for (let i = 0; i < stat.length; i++) {
  const s = stat[i];
  console.log(`  ${i}   ${s.w}×${s.h}  ${String(s.coverPct).padStart(6)}%  ${String(s.rowsWithAlphaPct).padStart(12)}%  ${String(s.winEmptyR7Pct).padStart(13)}%  ${String(s.winEmptyR8Pct).padStart(5)}%`);
}

// 落盘原始 alpha（每层一个 .bin），供 perf-bevel --real 复用
if (res.raw?.length) {
  const dir = join(ROOT, "benchmark", "results");
  mkdirSync(dir, { recursive: true });
  const manifest = { temple: TEMPLE, at: new Date().toISOString(), layers: [] };
  for (let i = 0; i < res.raw.length; i++) {
    const { w, h, data } = res.raw[i];
    const a = new Uint8Array(w * h);
    for (let j = 0; j < w * h; j++) a[j] = data[j * 4 + 3];
    const name = `alpha-${TEMPLE}-l${i}.bin`;
    writeFileSync(join(dir, name), Buffer.from(a));
    manifest.layers.push({ file: name, w, h });
  }
  writeFileSync(join(dir, `alpha-${TEMPLE}.json`), JSON.stringify(manifest, null, 1));
  console.log(`\n原始 alpha 已存 benchmark/results/alpha-${TEMPLE}-l*.bin`);
}

await browser.close();
server.kill("SIGTERM");
