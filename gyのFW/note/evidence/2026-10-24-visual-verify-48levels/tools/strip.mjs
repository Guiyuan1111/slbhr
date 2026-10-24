// 条带对比：oracle|ours 并排输出指定区域（原生坐标），用于差异归因
// 用法: node strip.mjs <level> <x> <y> <w> <h> <tag> [<zoom>]
import { chromium } from "playwright";
import fs from "node:fs";
const [level, x, y, w, h, tag, zoomArg] = process.argv.slice(2);
const zoom = Number(zoomArg || 2);
const b64 = (p) => "data:image/png;base64," + fs.readFileSync(p, "base64");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const out = await page.evaluate(async (args) => {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const [ia, ib] = await Promise.all([load(args.a), load(args.b)]);
  const W = args.w * 2 * args.z + 12, H = args.h * args.z;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x2 = c.getContext("2d");
  x2.imageSmoothingEnabled = false;
  x2.fillStyle = "#ff00ff"; x2.fillRect(0, 0, W, H);
  x2.drawImage(ia, args.x, args.y, args.w, args.h, 0, 0, args.w * args.z, args.h * args.z);
  x2.drawImage(ib, args.x, args.y, args.w, args.h, args.w * args.z + 12, 0, args.w * args.z, args.h * args.z);
  return c.toDataURL("image/png");
}, { a: b64(`TEMP/pvis/${level}/oracle.png`), b: b64(`TEMP/pvis/${level}/ours.png`), x: +x, y: +y, w: +w, h: +h, z: zoom });
fs.writeFileSync(`TEMP/pvis/${level}/strip-${tag}.png`, Buffer.from(out.split(",")[1], "base64"));
console.log(`written TEMP/pvis/${level}/strip-${tag}.png (左oracle|右ours, zoom=${zoom})`);
await browser.close();
