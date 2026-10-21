// 字体位图解码探针（r18 归因件，常驻）：两张字体图（子集与全量，同尺寸 2191×1024）
// 在真实 Chromium 里的解码/上传耗时，用来判定 perf-load 上「点击→Game」的 ms 差
// 究竟来自位图还是传输（r18 结论：1600.3KB 传输在批内只占 36ms，解码差也比驻留差小）。
// 用法：node benchmark/font-decode-probe.mjs  （临时端口 PROBE_PORT，缺省 3777）
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startServer } from "../scripts/e2e/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PROBE_PORT ?? 3777);
const srv = await startServer(PORT);
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });

const urls = [
  "/assets/fonts/chinese/font.png",
  "/assets/fonts/chinese/font-prephase.png",
];
for (const u of urls) {
  const r = await page.evaluate(async (href) => {
    const t0 = performance.now();
    const blob = await (await fetch(href)).blob();
    const tFetch = performance.now() - t0;
    const t1 = performance.now();
    const bmp = await createImageBitmap(blob);
    const tDecode = performance.now() - t1;
    // 走 <img>.decode() 这条路（Phaser 实际用的是 object URL + Image.decode）
    const url = URL.createObjectURL(blob);
    const t2 = performance.now();
    const img = new Image();
    img.src = url;
    await img.decode();
    const tImg = performance.now() - t2;
    // 把整张位图绘进同尺寸 canvas：近似 Phaser 建帧表前对纹理的那次上传/拷贝
    const t3 = performance.now();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    ctx.getImageData(0, 0, 1, 1);
    const tDraw = performance.now() - t3;
    return { w: bmp.width, h: bmp.height, bytes: blob.size, tFetch, tDecode, tImg, tDraw };
  }, u);
  console.log(
    `${u}  ${r.w}x${r.h} ${(r.bytes / 1024).toFixed(1)}KB  fetch=${r.tFetch.toFixed(1)}ms ` +
      `createImageBitmap=${r.tDecode.toFixed(1)}ms img.decode=${r.tImg.toFixed(1)}ms draw+read=${r.tDraw.toFixed(1)}ms`,
  );
}
await browser.close();
srv.kill("SIGTERM");
