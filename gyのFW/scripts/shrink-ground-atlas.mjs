// r40：地面图集按消费面重打包。官方 `GroundAssets.png`（1024×2048，解码 8.00MiB，343 帧）里
// **只有 151 帧会被上屏或参与烘焙**：
//   - 液体三段循环 135 帧：WaterBox/FireBox/GreenBox × 裸/Left/Right × 0000..0014
//     （BootScene.buildGameAnims 注册 `liquid_{water,lava,green}{,_left,_right}`，30fps 循环）；
//   - 冰膜静帧 3 帧：IceBox / IceBoxLeft / IceBoxRight 的 0000（GameScene.buildLiquids 建隐藏覆盖层）；
//   - 地面烘焙蒙版 13 帧：MaskBox00000..00003、MaskBox1..9 + "0000"（GameScene.bakeGroundCanvas
//     逐格盖章，再与 ForeGround 岩壁纹理合成整关地面）。
// 其余 192 帧（BeamDust/Dust 等原版特效，复刻里没有消费点）只贡献解码面积。本脚本把 151 个真帧
// 按 GUT=2 重打包到最小画布，清零帧以 `mainAlias` 别名到一块 4×4 透明区——JSON 仍声明官方全部
// 343 个帧名、顺序不变，漏改的按名取帧只会画透明（Phaser 3.90 的 `Texture.get` 缺帧回落
// `firstFrame`，本图集首帧就是透明别名），不会把整张图集当一帧贴满屏。
//
// 为什么这次不需要 MenuAssetsMini 那样的 1px 邻域：地面帧的所有消费者都是 **1:1 整数像素**绘制——
// 液体精灵 scale=1、位置 `col*32+16+32`（整数、origin 0.5），烘焙是 `drawImage(cutX,cutY,w,h, dx,dy,w,h)`
// 的整像素拷贝（GameScene.bakeGroundCanvas）。整数对齐时像素中心逐一对准纹素中心，LINEAR 采样不会
// 越出帧矩形；r24 的 canvas 相位探针在 scale=1 下 114 个采样点 0 差。GUT=2 只隔离相邻帧，保证
// 任何越界采样读到透明，而不是邻居。
//
// 几何等价前提：官方 343 帧全部 trimmed:false、rotated:false、spriteSourceSize 偏移 0（否则抛）。
// 无损证明：逐帧回读重打包 PNG 的帧矩形，与官方 PNG 同矩形逐字节比较；真帧以外的像素必须全 0；
// 别名块 1px 环带全 0。
//
// 用法：
//   node scripts/shrink-ground-atlas.mjs            # 生成/覆盖 assets/atlasses/GroundAssetsPlay.{png,json}
//   node scripts/shrink-ground-atlas.mjs --check    # 重建到 TEMP 并与在库两件产物比字节（复现性门禁）
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cropRaw, decodePng, encodePngRgba } from "./png-raw.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_PNG = join(ROOT, "assets", "atlasses", "GroundAssets.png");
const SRC_JSON = join(ROOT, "assets", "atlasses", "GroundAssets.json");
const OUT_PNG = join(ROOT, "assets", "atlasses", "GroundAssetsPlay.png");
const OUT_JSON = join(ROOT, "assets", "atlasses", "GroundAssetsPlay.json");
const TEMP = join(ROOT, "TEMP", "shrink-ground-atlas");
const CHECK = process.argv.includes("--check");

/** 帧间隔离带（与 split-char-atlas 同规格）：任何越界采样只读到透明 */
const GUT = 2;
/** 别名块：192 个零消费帧都指向这块 4×4 透明区，源尺寸照抄官方 */
const ALIAS = { w: 4, h: 4 };

const pad4 = (n) => String(n).padStart(4, "0");
const seq = (prefix, start, end) => Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${pad4(start + i)}`);

/** 液体循环帧（BootScene.buildGameAnims 的三段动画 × 15 帧） */
const LIQUID_FAMILIES = ["WaterBox", "FireBox", "GreenBox"];
const LIQUID_POSITIONS = ["", "Left", "Right"];
const LIQUID_FRAMES = LIQUID_FAMILIES.flatMap((fam) => LIQUID_POSITIONS.flatMap((pos) => seq(`${fam}${pos}`, 0, 14)));
/** 冰膜静帧（GameScene.buildLiquids：IceBox{Left,Right,}0000） */
const ICE_FRAMES = LIQUID_POSITIONS.map((pos) => `IceBox${pos}0000`);
/** 地面烘焙蒙版（GameScene.bakeGroundCanvas 的全部 stamp 名） */
const MASK_FRAMES = [
  ...Array.from({ length: 4 }, (_, i) => `MaskBox0000${i}`),
  ...Array.from({ length: 9 }, (_, i) => `MaskBox${i + 1}0000`),
];
/** 真帧集合 = 151；顺序固定，产物可复现 */
const REAL_FRAMES = [...LIQUID_FRAMES, ...ICE_FRAMES, ...MASK_FRAMES];

const atlas = JSON.parse(readFileSync(SRC_JSON, "utf8"));
const byName = new Map(atlas.frames.map((f) => [f.filename, f]));
const declared = atlas.frames.map((f) => f.filename);
const real = new Set(REAL_FRAMES);
if (real.size !== REAL_FRAMES.length) throw new Error("REAL_FRAMES 有重复帧名");
const missing = REAL_FRAMES.filter((n) => !byName.has(n));
if (missing.length) throw new Error(`官方图集缺帧（素材变动？）：${missing.join(", ")}`);
const trimmed = atlas.frames.filter((f) => f.trimmed || f.rotated || f.spriteSourceSize?.x || f.spriteSourceSize?.y);
if (trimmed.length) {
  throw new Error(`官方有 ${trimmed.length} 个 trimmed/rotated/带偏移的帧（首个：${trimmed[0].filename}），几何等价前提失效`);
}
if (atlas.meta.size.w !== 1024 || atlas.meta.size.h !== 2048) {
  throw new Error(`官方 meta 尺寸变了：${atlas.meta.size.w}×${atlas.meta.size.h}——重打包前提需复核`);
}

const src = decodePng(readFileSync(SRC_PNG), "GroundAssets.png");

/** 货架式打包：按高降序、同高按宽降序、再按帧名——同输入必同输出（复现性门禁依赖） */
function shelf(items, capacity) {
  let x = GUT;
  let y = GUT;
  let rowH = 0;
  let usedW = 0;
  const placed = [];
  for (const f of items) {
    const w = f.frame.w + GUT;
    const h = f.frame.h + GUT;
    if (x + w > capacity) {
      x = GUT;
      y += rowH;
      rowH = 0;
    }
    placed.push({ f, px: x, py: y });
    x += w;
    usedW = Math.max(usedW, x);
    rowH = Math.max(rowH, h);
  }
  return { w: usedW + GUT, h: y + rowH + GUT, placed };
}

const items = REAL_FRAMES.map((n) => byName.get(n)).sort(
  (a, b) => b.frame.h - a.frame.h || b.frame.w - a.frame.w || a.filename.localeCompare(b.filename),
);
const area = items.reduce((s, f) => s + (f.frame.w + GUT) * (f.frame.h + GUT), 0);
const maxW = Math.max(...items.map((f) => f.frame.w + GUT));
const candidates = [
  ...new Set([Math.ceil(Math.sqrt(area)), Math.ceil(Math.sqrt(area) * 1.15), Math.ceil(Math.sqrt(area) * 1.3), 384, 512, 640, 768, 1024]),
]
  .filter((w) => w >= maxW)
  .sort((a, b) => a - b);
let best = null;
for (const cap of candidates) {
  const p = shelf(items, cap);
  const px = p.w * p.h;
  if (!best || px < best.px || (px === best.px && (p.h < best.p.h || (p.h === best.p.h && p.w < best.p.w)))) {
    best = { p, px };
  }
}
const pack = best.p;

// 别名区放在打包区下方：打包区的下边距本身就是 GUT，别名块再留 GUT + 4 + GUT
const W = Math.max(pack.w, GUT + ALIAS.w + GUT);
const ali = { x: GUT, y: pack.h, w: ALIAS.w, h: ALIAS.h };
const H = ali.y + ali.h + GUT;

// 区块两两不相交（真帧矩形之间至少隔 GUT）
const placed = pack.placed.map(({ f, px, py }) => ({ name: f.filename, x: px + GUT, y: py + GUT, w: f.frame.w, h: f.frame.h }));
for (let i = 0; i < placed.length; i++) {
  for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i];
    const b = placed[j];
    const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    if (gapX < GUT && gapY < GUT) throw new Error(`区块重叠/间距不足：${a.name} 与 ${b.name}（${gapX},${gapY}）`);
  }
}

const data = Buffer.alloc(W * H * 4); // 全透明底
const frames = [];
for (const f of atlas.frames) {
  if (!real.has(f.filename)) {
    // trimmed:false ⇒ Phaser 的 JSON 解析不读 spriteSourceSize；省掉它是线上字节。
    frames.push({
      filename: f.filename,
      frame: { ...ali },
      rotated: false,
      trimmed: false,
      sourceSize: { w: f.sourceSize.w, h: f.sourceSize.h },
      mainAlias: true,
    });
    continue;
  }
  const e = placed.find((it) => it.name === f.filename);
  const crop = cropRaw(src, f.frame.x, f.frame.y, f.frame.w, f.frame.h);
  for (let r = 0; r < f.frame.h; r++) {
    crop.copy(data, ((e.y + r) * W + e.x) * 4, r * f.frame.w * 4, (r + 1) * f.frame.w * 4);
  }
  frames.push({ ...f, frame: { x: e.x, y: e.y, w: f.frame.w, h: f.frame.h } });
}

// 真帧之外必须全透明（含画布留白、帧间隔离带、别名块）
const covered = new Uint8Array(W * H);
for (const e of placed) for (let r = e.y; r < e.y + e.h; r++) covered.fill(1, r * W + e.x, r * W + e.x + e.w);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (covered[y * W + x]) continue;
    if (data[(y * W + x) * 4 + 3] !== 0) throw new Error(`帧矩形外像素不透明：${x},${y}`);
  }
}

const png = encodePngRgba(W, H, data);
const json = `${
  JSON.stringify({
    frames,
    meta: { app: "shrink-ground-atlas", version: "1.0", image: "GroundAssetsPlay.png", format: "RGBA8888", size: { w: W, h: H }, scale: "1" },
  })
}\n`;

// 无损证明：回读编码后的 PNG，逐帧与官方裁片逐字节比较
const back = decodePng(png, "GroundAssetsPlay.png");
const bad = placed.filter((e) => {
  const f = byName.get(e.name);
  return !cropRaw(back, e.x, e.y, e.w, e.h).equals(cropRaw(src, f.frame.x, f.frame.y, f.frame.w, f.frame.h));
});
if (bad.length) throw new Error(`无损证明失败：${bad.length} 帧回读与官方裁片不一致（${bad.slice(0, 3).map((e) => e.name).join(", ")}）`);

const aliasCount = frames.filter((f) => f.mainAlias).length;
console.log(
  `GroundAssetsPlay: ${W}×${H}（解码 ${((W * H * 4) / 1048576).toFixed(2)}MiB，原 ${((src.w * src.h * 4) / 1048576).toFixed(2)}MiB）` +
    `｜真帧 ${REAL_FRAMES.length}／别名 ${aliasCount}｜PNG ${png.length}B（官方 ${readFileSync(SRC_PNG).length}B）` +
    `｜JSON ${Buffer.byteLength(json)}B（官方 ${readFileSync(SRC_JSON).length}B）`,
);
console.log(
  `真帧分类：液体 ${LIQUID_FRAMES.length}＋冰膜 ${ICE_FRAMES.length}＋烘焙蒙版 ${MASK_FRAMES.length} = ${REAL_FRAMES.length}` +
    `；未消费 ${declared.length - REAL_FRAMES.length} 帧别名到 ${ALIAS.w}×${ALIAS.h}`,
);

if (CHECK) {
  rmSync(TEMP, { recursive: true, force: true });
  mkdirSync(TEMP, { recursive: true });
  const tempPng = join(TEMP, "GroundAssetsPlay.png");
  const tempJson = join(TEMP, "GroundAssetsPlay.json");
  writeFileSync(tempPng, png);
  writeFileSync(tempJson, json);
  if (!existsSync(OUT_PNG) || !existsSync(OUT_JSON)) throw new Error("在库产物缺失：先不带 --check 跑一次");
  for (const [a, b, tag] of [
    [readFileSync(OUT_PNG), png, "PNG"],
    [readFileSync(OUT_JSON), Buffer.from(json), "JSON"],
  ]) {
    if (Buffer.compare(a, b) !== 0) throw new Error(`${tag} 与重建不一致`);
  }
  console.log("--check PASS：两件产物与重建逐字节一致");
} else {
  writeFileSync(OUT_PNG, png);
  writeFileSync(OUT_JSON, json);
}
