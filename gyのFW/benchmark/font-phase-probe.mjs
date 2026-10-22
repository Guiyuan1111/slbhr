// 字体图集「重排等价性」探针（r24 归因件，常驻）：把两份图集按 Phaser CanvasRenderer 的画法
// （translate → scale → drawImage 源矩形 → 0,0，见 node_modules/phaser/src/gameobjects/bitmaptext/
// static/BitmapTextCanvasRenderer.js 的 glyphX = textureX + glyph.x 与 ctx.scale(scale)）各画一遍，
// 逐像素比较。它回答的是「图集帧字节逐字节相等，是否蕴含上屏像素相等」——答案是否定的：
// Chromium 的降采样核相位依赖源矩形在图里的绝对位置，只有 scale ∈ {1, 1/2, 3/8} 时与位置无关。
// 用法：node benchmark/font-phase-probe.mjs [官方png] [官方fnt] [对照png] [对照fnt]
// 缺省比官方 font.png/.fnt 与 assets/fonts/chinese/font-room.png/.fnt，字号取房内实际用到的 18/24/26/36/48。
import { chromium } from "playwright";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const A_PNG = process.argv[2] ?? join(ROOT, "assets/fonts/chinese/font.png");
const A_FNT = process.argv[3] ?? join(ROOT, "assets/fonts/chinese/font.fnt");
const B_PNG = process.argv[4] ?? join(ROOT, "assets/fonts/chinese/font-room.png");
const B_FNT = process.argv[5] ?? join(ROOT, "assets/fonts/chinese/font-room.fnt");
const ATLAS_SIZE = 48; // fnt <info size="48">

const parseFnt = (p) => {
  const m = {};
  const re = /<char id="(-?\d+)"([^>]*)\/>/g;
  const t = fs.readFileSync(p, "utf8");
  let x;
  while ((x = re.exec(t))) {
    const a = {};
    for (const kv of x[2].trim().split(/\s+/)) {
      const [k, v] = kv.split("=");
      a[k] = Number(v.replace(/"/g, ""));
    }
    m[Number(x[1])] = a;
  }
  return m;
};
const dataUrl = (p) => "data:image/png;base64," + fs.readFileSync(p).toString("base64");
const FA = parseFnt(A_FNT);
const FB = parseFnt(B_FNT);
// 候选集：两图 fnt 都声明了帧的 id。子集对未保留的字形会共指一块全透明帧——
// 那是有意为之的空白，不能算"重排不等价"；页内按 alpha 识别并剔除（见 evaluate）。
const chars = Object.keys(FA)
  .map(Number)
  .filter((id) => FA[id].width > 0 && FB[id]?.width > 0);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<canvas id=c width=256 height=256></canvas>");
const out = await page.evaluate(
  async ([A, B, FA, FB, chars, ATLAS]) => {
    const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
    const [ia, ib] = await Promise.all([load(A), load(B)]);
    const ctx = document.getElementById("c").getContext("2d");
    const grab = (img, g, scale, dx, dy) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 256, 256);
      ctx.save();
      ctx.translate(dx, dy);
      ctx.scale(scale, scale);
      ctx.drawImage(img, g.x, g.y, g.width, g.height, 0, 0, g.width, g.height);
      ctx.restore();
      return ctx.getImageData(0, 0, 200, 120).data;
    };
    const cmp = (p, q) => {
      let d = 0;
      for (let i = 0; i < p.length; i += 4) if (p[i] !== q[i] || p[i + 1] !== q[i + 1] || p[i + 2] !== q[i + 2] || p[i + 3] !== q[i + 3]) d++;
      return d;
    };
    // B 侧全透明帧 = 子集刻意不保留的字形（共指透明块），不参与等价性判断
    const blank = new Map();
    const isBlank = (img, g) => {
      const key = `${g.x},${g.y},${g.width},${g.height}`;
      if (blank.has(key)) return blank.get(key);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 256, 256);
      ctx.drawImage(img, g.x, g.y, g.width, g.height, 0, 0, g.width, g.height);
      const d = ctx.getImageData(0, 0, g.width, g.height).data;
      let any = false;
      for (let i = 3; i < d.length; i += 4) if (d[i]) { any = true; break; }
      blank.set(key, !any);
      return !any;
    };
    const kept = chars.filter((id) => !isBlank(ib, FB[id]));
    const rows = [];
    for (const size of [18, 24, 26, 36, 48]) {
      const scale = size / ATLAS;
      for (const [dx, dy] of [[10, 10], [10.5, 10.5], [11, 10]]) {
        let bad = 0, worst = 0, worstCh = "";
        for (const id of kept) {
          const a = FA[id], b = FB[id];
          const d = cmp(grab(ia, a, scale, dx, dy), grab(ib, b, scale, dx, dy));
          if (d) { bad++; if (d > worst) { worst = d; worstCh = String.fromCodePoint(id); } }
        }
        rows.push({ size, scale, dst: [dx, dy], bad, total: kept.length, worst, worstCh });
      }
    }
    return rows;
  },
  [dataUrl(A_PNG), dataUrl(B_PNG), FA, FB, chars, ATLAS_SIZE],
);

const dist = (r) => r.dst.join(",");
console.log(`对照：${A_PNG.split("/").pop()} vs ${B_PNG.split("/").pop()}，参与比较的保留字形 ${out[0].total} 个（B 侧全透明帧已剔除）`);
for (const r of out) {
  const tag = r.bad === 0 ? "逐字节同" : `差 ${r.bad}/${r.total}` + (r.bad ? `（最差 ${r.worstCh}:${r.worst}px）` : "");
  console.log(`  字号 ${String(r.size).padStart(2)}（scale=${r.scale.toFixed(4)}） dst=(${dist(r)})  ${tag}`);
}
const whole = [...new Set(out.filter((r) => r.bad === r.total).map((r) => r.size))];
const partial = [...new Set(out.filter((r) => r.bad > 0 && r.bad < r.total).map((r) => r.size))];
console.log(
  whole.length === 0 && partial.length === 0
    ? "结论：所有测试字号在各目标相位下逐字节相同——图集可任意重排。"
    : `结论：字号 ${[...whole, ...partial].sort((a, b) => a - b).join("/")} 的上屏像素依赖字形在图集中的绝对位置（重排后不等价）` +
      (partial.length ? `；其中 ${partial.join("/")} 只在部分目标相位上不同` : "") + "。",
);
await browser.close();
