// 生成 DOM 皮肤合成贴图（r17 件A）：把连接面板 CSS 用到的 6 个图集帧无损裁出、
// 拼成一张 `assets/dom/dom-skin.png`（82,107B），让 HTML 临路径只拉这一张，
// 而不是 CharAssets+PopupAssets+MenuAssets 三张整图集（合计 1,241.1KB）。
//
// 为什么要有生成脚本而不是手摆 PNG：这 6 帧的来源是官方图集，帧坐标由打包器决定、
// 会随素材变动；脚本对着 atlas JSON 断言坐标，素材一变就红，而不是等到眼睛发现
// 石板错位。裁片用 ImageMagick `-crop`（整数矩形、RGBA 直通），拼接用固定坐标 +
// 2px 透明隔离带（隔离带让缩放采样核在帧边界只看透明，与图集邻帧内容彻底解耦）。
//
// 无损证明走**原始样本**而不是 magick 对拍：回读时自己 inflate IDAT + 反滤波取
// RGBA 字节，与图集原帧的同样字节逐位相比。原因很实际——`compare` 两侧都经过
// ImageMagick 的色彩管理，两侧一起变换就把 ±1 级的量化差抹平成 AE=0，"看着无损"
// 不等于"存着无损"；而 Chrome 是按文件里的样本值直接画，差的这一级就是屏幕上的差。
// 顺带断言输出 PNG 的辅助块集合与图集一致（图集只有 IHDR/IDAT/IEND，没有 gAMA/sRGB，
// 多写一个色彩块会让浏览器换一条解码路径）。
//
// 用法：
//   node scripts/build-dom-skin.mjs          # 生成/覆盖 assets/dom/dom-skin.png
//   node scripts/build-dom-skin.mjs --check   # 重新生成到 TEMP 并与在库 PNG 比字节（可复现性）
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets", "dom", "dom-skin.png");
const TEMP = join(ROOT, "TEMP", "dom-skin");
const CHECK = process.argv.includes("--check");
const SW = 1082;
const SH = 988;

/** sprite 布局 = index.html CSS 里 background-size/position 推导的唯一依据，改这里必须同步改 CSS。 */
const FRAMES = [
  { key: "panel", atlas: "PopupAssets", name: "PopupBackground0000", rect: [0, 205, 1082, 642], at: [0, 0] },
  { key: "avFire", atlas: "CharAssets", name: "fire_head_idle0000", rect: [0, 862, 130, 162], at: [0, 644] },
  { key: "avWater", atlas: "CharAssets", name: "water_head_idle0000", rect: [1340, 468, 130, 162], at: [132, 644] },
  { key: "btnRest", atlas: "MenuAssets", name: "StoneButton0000", rect: [0, 0, 252, 117], at: [0, 808] },
  { key: "btnHover", atlas: "MenuAssets", name: "StoneButton0001", rect: [256, 0, 252, 117], at: [254, 808] },
  { key: "cross", atlas: "PopupAssets", name: "CrossIcon0000", rect: [1122, 205, 61, 61], at: [0, 927] },
];

const im = (args) => execFileSync("magick", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
/** 解 8bit RGBA 无交错 PNG，返回原始样本（不经任何色彩管理，等同浏览器看到的字节） */
function decodePng(buf, tag) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${tag} 不是 PNG`);
  let p = 8;
  let ihdr = null;
  const chunks = [];
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    chunks.push(type);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    else if (type === "IDAT") idat.push(data);
    p += 12 + len;
  }
  if (ihdr.depth !== 8 || ihdr.color !== 6 || ihdr.interlace !== 0) throw new Error(`${tag} 非 8bit RGBA 无交错：${JSON.stringify(ihdr)}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = ihdr.w * 4;
  const out = Buffer.alloc(ihdr.h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < ihdr.h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, y * stride + stride);
    line.copy(cur);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      let v = cur[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error(`${tag} 未知滤波 ${f}`);
      cur[x] = v & 0xff;
    }
    prev = cur;
  }
  return { ...ihdr, data: out, chunks: chunks.filter((t) => t !== "IDAT").join(",") };
}
/** 把矩形区域从原始样本里拍平成一块 buffer（逐行 copy，越界即抛） */
function cropRaw(img, x, y, w, h) {
  if (x < 0 || y < 0 || x + w > img.w || y + h > img.h) throw new Error(`矩形 (${x},${y},${w},${h}) 越界 ${img.w}x${img.h}`);
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < h; i++) img.data.copy(out, i * w * 4, (y + i) * img.w * 4 + x * 4, (y + i) * img.w * 4 + x * 4 + w * 4);
  return out;
}
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");

mkdirSync(TEMP, { recursive: true });
const out = CHECK ? join(TEMP, "dom-skin.png") : OUT;
if (!CHECK) mkdirSync(dirname(OUT), { recursive: true });

// 1) 断言：atlas JSON 里的帧矩形与在库布局一致（素材换打包 → 立刻红，而不是悄悄错位）
const rects = new Map();
for (const atlas of new Set(FRAMES.map((f) => f.atlas))) {
  const j = JSON.parse(readFileSync(join(ROOT, "assets", "atlasses", `${atlas}.json`), "utf8"));
  for (const fr of j.frames) rects.set(`${atlas}/${String(fr.filename).replace(/\.[a-z]+$/i, "")}`, fr);
}
for (const f of FRAMES) {
  const fr = rects.get(`${f.atlas}/${f.name}`);
  if (!fr) throw new Error(`图集 ${f.atlas} 找不到帧 ${f.name}`);
  const got = [fr.frame.x, fr.frame.y, fr.frame.w, fr.frame.h];
  if (got.join() !== f.rect.join()) throw new Error(`${f.name} 帧坐标变了：期望 ${f.rect.join()} 实得 ${got.join()}（同步改 FRAMES 与 index.html CSS）`);
  if (fr.rotated) throw new Error(`${f.name} 被旋转打包，裁片方案不适用`);
}

// 2) 逐帧整数裁片
const crops = FRAMES.map((f) => {
  const p = join(TEMP, `${f.key}.png`);
  im([join(ROOT, "assets", "atlasses", `${f.atlas}.png`), "-crop", `${f.rect[2]}x${f.rect[3]}+${f.rect[0]}+${f.rect[1]}`, "+repage", p]);
  const size = im([p, "-format", "%w %h %m", "info:"]);
  if (size.split(" ")[0] !== String(f.rect[2]) || size.split(" ")[1] !== String(f.rect[3])) throw new Error(`${f.key} 裁片尺寸不符：${size}`);
  return { ...f, crop: p };
});

// 3) 拼成固定布局画布（透明底），再无损重编码
const cmd = ["-size", `${SW}x${SH}`, "xc:none"];
for (const c of crops) cmd.push("(", c.crop, "-geometry", `+${c.at[0]}+${c.at[1]}`, ")", "-composite");
cmd.push("-define", "png:compression-level=9", "-strip", out);
execFileSync("magick", cmd, { stdio: ["ignore", "pipe", "pipe"] });

// 4) 回读对拍（原始样本）：合成图里每帧区域必须与图集原帧逐字节相同
const atlasImgs = new Map();
const atlasOf = (name) => {
  if (!atlasImgs.has(name)) atlasImgs.set(name, decodePng(readFileSync(join(ROOT, "assets", "atlasses", `${name}.png`)), `图集 ${name}`));
  return atlasImgs.get(name);
};
const spriteImg = decodePng(readFileSync(out), "合成贴图");
for (const c of crops) {
  const A = cropRaw(atlasOf(c.atlas), ...c.rect);
  const B = cropRaw(spriteImg, ...c.at, ...c.rect.slice(2));
  let diff = 0, max = 0;
  for (let i = 0; i < A.length; i++) {
    if (A[i] !== B[i]) { diff++; const d = Math.abs(A[i] - B[i]); if (d > max) max = d; }
  }
  if (diff !== 0) throw new Error(`${c.key} 原始样本变了（${diff}/${A.length} 字节不同，最大级差 ${max}）`);
  console.log(`  无损校验 ${c.key.padEnd(9)} ${A.length} 个 RGBA 样本字节全等`);
}
// 辅助块集合须与图集一致：图集只有 IHDR/IEND，多出的色彩块会让浏览器换解码路径
for (const [name, img] of atlasImgs) {
  if (img.chunks !== spriteImg.chunks) throw new Error(`合成贴图辅助块 ${spriteImg.chunks} 与图集 ${name} 的 ${img.chunks} 不一致`);
}
const bands = [
  [0, 642, SW, 2], // panel / avatars 之间
  [0, 806, SW, 2], // avatars / buttons 之间
  [0, 925, SW, 2], // buttons / cross 之间
  [130, 644, 2, 162], // 两颗头像之间
  [252, 808, 2, 117], // 按钮两帧之间
];
for (const [x, y, w, h] of bands) {
  const raw = cropRaw(spriteImg, x, y, w, h);
  for (let i = 0; i < raw.length; i++) if (raw[i] !== 0) throw new Error(`隔离带 (${x},${y}) 第 ${i} 字节非 0（${raw[i]}）`);
}
console.log(`dom-skin: ${SW}x${SH} → ${out.replace(ROOT + "/", "")}  ${readFileSync(out).length}B  sha256=${sha(out).slice(0, 16)}  块=${spriteImg.chunks}`);
for (const c of crops) console.log(`  ${c.key.padEnd(9)} atlas(${c.rect.join(",")}) → sprite(${c.at[0]},${c.at[1]}) ${c.rect[2]}x${c.rect[3]}`);

if (CHECK) {
  const committed = sha(OUT);
  const rebuilt = sha(out);
  rmSync(TEMP, { recursive: true, force: true });
  if (committed !== rebuilt) {
    console.error(`可复现性失败：在库 ${committed.slice(0, 16)} ≠ 重建 ${rebuilt.slice(0, 16)}`);
    process.exit(1);
  }
  console.log("可复现性：字节一致 ✓");
} else {
  rmSync(TEMP, { recursive: true, force: true }); // 裁片是中间产物，用完即清
}
