// r35：选关/设置/HUD 共用的 MenuAssets 画布收缩。r31 把这张 1024² 图集的 31 个零消费帧原地清零，
// 线上 PNG 195,797→84,297B，但画布没动——每次进 Menu/temple/房间都要解 4.00MiB 纹理，而 29 个
// keep 帧的像素面积只有 362,483px（35%）。本脚本把 29 帧重打包到约 753×577（解码 1.66MiB），
// 清零帧以 `mainAlias` 别名到一块 4×4 透明区——JSON 仍声明官方全部 60 个帧名、顺序不变。
//
// 与 r32/r33 的区别：这里搬运的不只是帧矩形，还有**帧外 1px 的真实邻域**（含 Flash 导出留在
// 帧框外的挤出像素；越界坐标按 CLAMP_TO_EDGE 取源图边缘）。原因有两个：
//   1) TempleScene 的树烘焙（templeTreeBake）用 `menuTex.getSourceImage()` + 帧 `cutX/cutY`
//      直接读源图像素——重打包只换 cutX/cutY，帧矩形内的字节必须逐字节不变；
//   2) 星碑底座/Lock/NewSign 会按 scale 缩放，LINEAR 双线性在帧边缘会采到矩形外半纹素；
//      邻域照抄后，帧边 1px 内的采样值与旧图一致。
// 例外：treebake 的 mask 绘制（120→72/86.4px，Canvas2D drawImage）在 Chromium 里是整图相关的
// 缩放采样——同一帧放到不同尺寸/坐标/远处内容的图上，0.6/0.72 缩放的首段绘制会差 554px
// （Δ≤85，全在 mask 矩形内；帧与 1px 环仍逐字节相同）。任何重打包都无法位级复现旧图，
// 故树的烘焙金样按换样协议重钉（见 scripts/e2e/treebake.mjs 头注与 r35 报告）。
// 帧矩形在区块内偏移 1，区块之间再留 1px 透明 GAP，画布四周留 1px PAD。
//
// 像素账（r35 实测，prephase-canvas 五态）：menu 逐字节相同；temple/temple-numbers/settings/credits
// 分别 1042/849/117/6 个像素差，99.2% 为 Δ1、最大 Δ15，全部落在渐变/抗锯齿边，平面区 0。
// 两笔来源都已用对照实验钉死，均不改内容：
//   a) 1024²(POT)→753×577(NPOT) 使 Phaser 的 wrap 从 REPEAT 变 CLAMP_TO_EDGE，旧基线里贴边帧
//      （StoneButton0000 等 8 个 keep 帧）的 wrap 溢出条纹消失——POT 补白对照把 settings 117→13；
//   b) 帧在画布内的新位置改变 GPU 插值量化，帧边双线性权重差 1LSB（POT 补白后仍剩 1020 个 Δ1 为主的差）。
// 故按 prephase 的换代码协议 `--save --reason` 刷基线，机制与读数见 r35 报告。
//
// 几何等价前提：官方 60 帧全部 trimmed:false、spriteSourceSize 偏移 0（否则抛）。
// 无损证明：逐帧回读帧矩形与 Slim 同矩形逐字节比较；邻域逐像素与 CLAMP 采样比较；
// 帧矩形之外（区块外）全 0；别名块的 1px 环带全 0；区块两两不相交。
//
// 用法：
//   node --import tsx scripts/shrink-menu-main.mjs           # 生成/覆盖 assets/atlasses/MenuAssetsMini.{png,json}
//   node --import tsx scripts/shrink-menu-main.mjs --check   # 重建到 TEMP 并与在库两件产物比字节
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cropRaw, decodePng, encodePngRgba } from "./png-raw.mjs";
import { inspect } from "./atlas-slim/needs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_PNG = join(ROOT, "assets", "atlasses", "MenuAssetsSlim.png");
const SRC_JSON = join(ROOT, "assets", "atlasses", "MenuAssets.json");
const OUT_PNG = join(ROOT, "assets", "atlasses", "MenuAssetsMini.png");
const OUT_JSON = join(ROOT, "assets", "atlasses", "MenuAssetsMini.json");
const TEMP = join(ROOT, "TEMP", "shrink-menu-main");
const CHECK = process.argv.includes("--check");

/** 帧矩形外 1px 邻域 + 区块间/画布边 1px 透明带 */
const PAD = 1;
const GAP = 1;
/** 帧外邻域宽度 */
const RING = 1;
/** 别名块：所有清零帧都指向这块 4×4 透明区，源尺寸仍照抄官方 */
const ALIAS = { w: 4, h: 4 };

const atlas = JSON.parse(readFileSync(SRC_JSON, "utf8"));
const byName = new Map(atlas.frames.map((f) => [f.filename, f]));
const declared = atlas.frames.map((f) => f.filename);
if (atlas.meta.size.w !== 1024 || atlas.meta.size.h !== 1024) {
  throw new Error(`官方 meta 尺寸变了：${atlas.meta.size.w}×${atlas.meta.size.h}——重打包前提需复核`);
}
const trimmed = atlas.frames.filter((f) => f.trimmed || f.rotated || f.spriteSourceSize?.x || f.spriteSourceSize?.y);
if (trimmed.length) {
  throw new Error(`官方有 ${trimmed.length} 个 trimmed/rotated/带偏移的帧（首个：${trimmed[0].filename}），几何等价前提失效`);
}

const { atlases } = await inspect(ROOT);
const menu = atlases.menu;
const keep = new Set(menu.keep);
if (keep.size !== 29) throw new Error(`keep 应为 29 帧（r31 口径），实际 ${keep.size}——先复核 needs.mjs`);
const blank = declared.filter((n) => !keep.has(n));
if (menu.blank.join("\n") !== blank.join("\n")) throw new Error("needs.inspect 的 blank 与官方差集不一致");

const slim = decodePng(readFileSync(SRC_PNG), "MenuAssetsSlim.png");
const official = decodePng(readFileSync(join(ROOT, "assets", "atlasses", "MenuAssets.png")), "MenuAssets.png");
if (slim.w !== atlas.meta.size.w || slim.h !== atlas.meta.size.h) {
  throw new Error(`Slim ${slim.w}×${slim.h} 与官方 meta ${atlas.meta.size.w}×${atlas.meta.size.h} 不一致`);
}
if (official.w !== slim.w || official.h !== slim.h) throw new Error("官方 PNG 与 Slim 画布尺寸不一致");

/** 像素级相等（RGBA 四通道；帧像素与邻域都要求逐字节） */
function same(a, b) {
  return a.length === b.length && Buffer.compare(a, b) === 0;
}

/** 以 CLAMP_TO_EDGE 取源图坐标：帧贴画布边时，官方采样会重复边缘像素 */
function clampPx(x, y) {
  const cx = Math.min(Math.max(x, 0), slim.w - 1);
  const cy = Math.min(Math.max(y, 0), slim.h - 1);
  return (cy * slim.w + cx) * 4;
}

/** 货架式打包：行高由该行最高区块决定。排序与候选宽度固定，产物可逐字节复现。 */
function shelf(items, capacity) {
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  let usedW = 0;
  const placed = [];
  for (const f of items) {
    const { w, h } = f.block;
    if (x + w + PAD > capacity) {
      x = PAD;
      y += rowH + GAP;
      rowH = 0;
    }
    placed.push({ f, x, y });
    x += w + GAP;
    usedW = Math.max(usedW, x - GAP);
    rowH = Math.max(rowH, h);
  }
  return { w: usedW + PAD, h: y + rowH + PAD, placed };
}

const items = [...keep]
  .map((name) => {
    const f = byName.get(name);
    return { filename: name, src: f.frame, block: { w: f.frame.w + 2 * RING, h: f.frame.h + 2 * RING } };
  })
  .sort((a, b) => b.block.h - a.block.h || b.block.w - a.block.w || a.filename.localeCompare(b.filename));
const area = items.reduce((s, f) => s + f.block.w * f.block.h, 0);
const maxW = Math.max(...items.map((f) => f.block.w));
const narrow = [Math.ceil(Math.sqrt(area)), Math.ceil(Math.sqrt(area) * 1.1), Math.ceil(Math.sqrt(area) * 1.25)];
const candidates = [...new Set([...narrow, 256, 384, 512, 640, 768, 896, 1024])]
  .map((w) => w + 2 * PAD)
  .filter((w) => w >= maxW + 2 * PAD)
  .sort((a, b) => a - b);
let best = null;
for (const cap of candidates) {
  const p = shelf(items, cap);
  const px = p.w * p.h;
  if (!best || px < best.px || (px === best.px && (p.h < best.p.h || (p.h === best.p.h && p.w < best.p.w)))) {
    best = { cap, p, px };
  }
}
const pack = best.p;

// 别名区放在打包区下方：高度 = 打包区 + GAP + 4 + PAD；宽度取打包区与别名区的较宽者
const W = Math.max(pack.w, PAD + ALIAS.w + PAD);
const H = pack.h + GAP + ALIAS.h + PAD;
const ali = { x: PAD, y: pack.h + GAP, w: ALIAS.w, h: ALIAS.h };
if (ali.x + ali.w + PAD > W || ali.y + ali.h + PAD > H) throw new Error(`别名块 ${ali.x},${ali.y} 越出 ${W}×${H} 画布`);

// 区块两两不相交（含 GAP 后的矩形也必须分开，避免邻域互相覆盖）
const placed = pack.placed.map(({ f, x, y }) => ({ name: f.filename, x, y, w: f.block.w, h: f.block.h }));
for (let i = 0; i < placed.length; i++) {
  for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i];
    const b = placed[j];
    const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    if (gapX < GAP && gapY < GAP) throw new Error(`区块重叠/间距不足：${a.name} 与 ${b.name}（${gapX},${gapY}）`);
  }
}
if (ali.y < pack.h + GAP) throw new Error("别名区与打包区重叠");

const data = Buffer.alloc(W * H * 4); // 全透明底
const frames = [];
for (const f of atlas.frames) {
  if (!keep.has(f.filename)) {
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
  const { x, y, w, h } = f.frame;
  // 帧矩形 + 1px 邻域（越界按 CLAMP_TO_EDGE 取源边缘）：整块逐像素搬运
  for (let dy = 0; dy < e.h; dy++) {
    for (let dx = 0; dx < e.w; dx++) {
      const s = clampPx(x + dx - RING, y + dy - RING);
      const d = ((e.y + dy) * W + e.x + dx) * 4;
      slim.data.copy(data, d, s, s + 4);
    }
  }
  // 帧矩形逐字节回读（与 Slim 原矩形比较）
  const crop = cropRaw(slim, x, y, w, h);
  const back = Buffer.alloc(w * h * 4);
  for (let r = 0; r < h; r++) {
    data.copy(back, r * w * 4, ((e.y + RING + r) * W + e.x + RING) * 4, ((e.y + RING + r) * W + e.x + RING + w) * 4);
  }
  if (!same(back, crop)) throw new Error(`帧矩形回读不一致：${f.filename}`);
  // 邻域逐像素核对（CLAMP 采样值）
  for (let dy = 0; dy < e.h; dy++) {
    for (let dx = 0; dx < e.w; dx++) {
      if (dx >= RING && dx < w + RING && dy >= RING && dy < h + RING) continue;
      const s = clampPx(x + dx - RING, y + dy - RING);
      const d = ((e.y + dy) * W + e.x + dx) * 4;
      if (data.readUInt32BE(d) !== slim.data.readUInt32BE(s)) throw new Error(`邻域不一致：${f.filename} @${dx},${dy}`);
    }
  }
  frames.push({ ...f, frame: { x: e.x + RING, y: e.y + RING, w, h } });
}

// 帧/邻域之外必须全透明（含画布边留白与区块间 GAP）
const covered = new Uint8Array(W * H);
for (const e of placed) {
  for (let r = e.y; r < e.y + e.h; r++) covered.fill(1, r * W + e.x, r * W + e.x + e.w);
}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (covered[y * W + x]) continue;
    if (data[(y * W + x) * 4 + 3] !== 0) throw new Error(`区块外像素不透明：${x},${y}`);
  }
}
// 别名块必须保持全透明（任何清零帧被重新画出来都会在这里先红）
for (let r = ali.y - 1; r <= ali.y + ali.h; r++) {
  for (let c = ali.x - 1; c <= ali.x + ali.w; c++) {
    if (c < 0 || r < 0 || c >= W || r >= H) continue;
    if (data[(r * W + c) * 4 + 3] !== 0) throw new Error(`别名块环带 ${c},${r} 不透明`);
  }
}

const png = encodePngRgba(W, H, data);
const json = `${
  JSON.stringify({
    frames,
    meta: { app: "shrink-menu-main", version: "1.0", image: "MenuAssetsMini.png", format: "RGBA8888", size: { w: W, h: H }, scale: "1" },
  })
}\n`;

const aliasCount = frames.filter((f) => f.mainAlias).length;
console.log(
  `MenuAssetsMini: ${W}×${H}（解码 ${((W * H * 4) / 1048576).toFixed(2)}MiB，原 ${((slim.w * slim.h * 4) / 1048576).toFixed(2)}MiB）` +
    `｜真帧 ${frames.length - aliasCount}／别名 ${aliasCount}｜PNG ${png.length}B（Slim ${readFileSync(SRC_PNG).length}B）` +
    `｜JSON ${Buffer.byteLength(json)}B（官方 ${readFileSync(SRC_JSON).length}B）`,
);

if (CHECK) {
  rmSync(TEMP, { recursive: true, force: true });
  mkdirSync(TEMP, { recursive: true });
  const tempPng = join(TEMP, "MenuAssetsMini.png");
  const tempJson = join(TEMP, "MenuAssetsMini.json");
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
