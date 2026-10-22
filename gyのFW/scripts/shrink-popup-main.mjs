// r32：弹窗主图集画布收缩。r29 之后 `PopupAssetsSlim.png` 的 111 帧里只有 6 帧是真帧
// （HUD 暂停键、结算板底、选关三星彩带 4 帧），其余 105 帧已在原画布上清零；但画布仍是
// 2048²，Game 进房批每次都要解 16.78MB。本脚本把这 6 帧重打包到 1086×696（解码 2.92MiB），
// 并把清零帧以 `mainAlias` 形式别名到一块 4×4 透明区——JSON 仍声明全部 111 个帧名。
//
// 为什么保留别名帧：`overlays.ts` 的 EndMenu 在结算图集未落地时退回主图集同名帧
// （r29 的降级路径：板可用、图标缺失，不会落到 `__MISSING`）。别名帧让这条路径继续成立，
// 且任何按名取旧帧的代码只会拿到透明像素，不会抛错。
//
// 为什么不用一张只含 6 帧的 JSON：丢失帧名会让上面的降级路径变成绿块；而 111 条 JSON 与
// r31 装载的官方 JSON（23,232B）同量级，没有额外线上代价。
//
// 几何等价前提与 r29/r30 拆张同式：官方 111 帧全部 trimmed:false、spriteSourceSize 偏移 0，
// 6 个真帧原生尺寸、整数左上角；重打包只换容器坐标，不引入重采样相位差。隔离带 GUT=2
// 保证缩放采样核在帧边界只读到透明。
//
// 用法：
//   node scripts/shrink-popup-main.mjs           # 生成/覆盖 assets/atlasses/PopupAssetsMini.{png,json}
//   node scripts/shrink-popup-main.mjs --check   # 重建到 TEMP 并与在库两件产物比字节
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cropRaw, decodePng, encodePngRgba } from "./png-raw.mjs";
import { POPUP_EARLY } from "./atlas-slim/needs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_PNG = join(ROOT, "assets", "atlasses", "PopupAssets.png");
const SRC_JSON = join(ROOT, "assets", "atlasses", "PopupAssets.json");
const OUT_PNG = join(ROOT, "assets", "atlasses", "PopupAssetsMini.png");
const OUT_JSON = join(ROOT, "assets", "atlasses", "PopupAssetsMini.json");
const TEMP = join(ROOT, "TEMP", "shrink-popup-main");
const CHECK = process.argv.includes("--check");

/** 隔离带：帧矩形外 1px 环带全透明 */
const GUT = 2;
/** 别名块：所有清零帧都指向这块 4×4 透明区，源尺寸仍照抄官方 */
const ALIAS = { x: 200, y: 646, w: 4, h: 4 };

const LAYOUT = [
  { name: "PopupBackground0000", x: GUT, y: GUT }, // 1082×642
  { name: "PauseButton0000", x: GUT, y: GUT + 642 + GUT }, // 48×48
  ...["Confetti0000", "Confetti0001", "Confetti0002", "Confetti0003"].map((name, i) => ({
    name,
    x: GUT + 48 + GUT + i * (30 + GUT), // 30×28
    y: GUT + 642 + GUT,
  })),
];

const atlas = JSON.parse(readFileSync(SRC_JSON, "utf8"));
const byName = new Map(atlas.frames.map((f) => [f.filename, f]));
const early = new Set(POPUP_EARLY);
if (early.size !== 6) throw new Error(`POPUP_EARLY 应为 6 帧，实际 ${early.size}`);

const trimmed = atlas.frames.filter((f) => f.trimmed || f.spriteSourceSize?.x || f.spriteSourceSize?.y);
if (trimmed.length) {
  throw new Error(`官方图集有 ${trimmed.length} 个 trimmed/带偏移的帧（首个：${trimmed[0].filename}），几何等价前提失效`);
}
const missing = LAYOUT.map((e) => e.name).filter((n) => !byName.has(n));
if (missing.length) throw new Error(`官方图集缺帧（素材变动？）：${missing.join(", ")}`);
const layoutNames = new Set(LAYOUT.map((e) => e.name));
if (layoutNames.size !== early.size || [...early].some((n) => !layoutNames.has(n))) {
  throw new Error("布局与 POPUP_EARLY 不一致——先同步口径");
}

const src = decodePng(readFileSync(SRC_PNG), "PopupAssets.png");
if (src.w !== atlas.meta.size.w || src.h !== atlas.meta.size.h) {
  throw new Error(`PNG ${src.w}×${src.h} 与 JSON meta ${atlas.meta.size.w}×${atlas.meta.size.h} 不一致`);
}

const W = Math.max(...LAYOUT.map((e) => e.x + byName.get(e.name).frame.w)) + GUT;
const H = Math.max(...LAYOUT.map((e) => e.y + byName.get(e.name).frame.h), ALIAS.y + ALIAS.h) + GUT;
if (ALIAS.x + ALIAS.w + GUT > W || ALIAS.y + ALIAS.h + GUT > H) {
  throw new Error(`别名块 ${ALIAS.x},${ALIAS.y} 越出 ${W}×${H} 画布`);
}

const data = Buffer.alloc(W * H * 4); // 全透明底
const frames = [];
for (const f of atlas.frames) {
  if (!layoutNames.has(f.filename)) {
    // trimmed:false ⇒ Phaser 的 JSON 解析不读 spriteSourceSize；省掉它是 6KB 线上字节。
    frames.push({
      filename: f.filename,
      frame: { ...ALIAS },
      rotated: false,
      trimmed: false,
      sourceSize: { w: f.sourceSize.w, h: f.sourceSize.h },
      mainAlias: true,
    });
    continue;
  }
  const e = LAYOUT.find((it) => it.name === f.filename);
  const crop = cropRaw(src, f.frame.x, f.frame.y, f.frame.w, f.frame.h);
  for (let r = 0; r < f.frame.h; r++) {
    crop.copy(data, ((e.y + r) * W + e.x) * 4, r * f.frame.w * 4, (r + 1) * f.frame.w * 4);
  }
  // 回读逐字节：重打包不得改动任何真帧像素
  const back = Buffer.alloc(f.frame.w * f.frame.h * 4);
  for (let r = 0; r < f.frame.h; r++) {
    data.copy(back, r * f.frame.w * 4, ((e.y + r) * W + e.x) * 4, ((e.y + r) * W + e.x + f.frame.w) * 4);
  }
  if (Buffer.compare(back, crop) !== 0) throw new Error(`回读不一致：${f.filename}`);
  frames.push({ ...f, frame: { x: e.x, y: e.y, w: f.frame.w, h: f.frame.h } });
}

// 别名块必须保持全透明：任何清零帧被重新画出来都会在这里先红
for (let r = ALIAS.y - 1; r <= ALIAS.y + ALIAS.h; r++) {
  for (let c = ALIAS.x - 1; c <= ALIAS.x + ALIAS.w; c++) {
    if (data[(r * W + c) * 4 + 3] !== 0) throw new Error(`别名块环带 ${c},${r} 不透明`);
  }
}

const png = encodePngRgba(W, H, data);
// 图集 JSON 是要过网的：紧凑序列化（Phaser 不关心空白），比官方 23,232B 还小。
const json = `${
  JSON.stringify({
    frames,
    meta: { app: "shrink-popup-main", version: "1.0", image: "PopupAssetsMini.png", format: "RGBA8888", size: { w: W, h: H }, scale: "1" },
  })
}\n`;

const aliasCount = frames.filter((f) => f.mainAlias).length;
console.log(
  `PopupAssetsMini: ${W}×${H}（解码 ${((W * H * 4) / 1048576).toFixed(2)}MiB，原 ${((src.w * src.h * 4) / 1048576).toFixed(2)}MiB）` +
    `｜真帧 ${frames.length - aliasCount}／别名 ${aliasCount}｜PNG ${png.length}B（官方 ${readFileSync(SRC_PNG).length}B）` +
    `｜JSON ${Buffer.byteLength(json)}B（官方 ${readFileSync(SRC_JSON).length}B）`
);

if (CHECK) {
  rmSync(TEMP, { recursive: true, force: true });
  mkdirSync(TEMP, { recursive: true });
  const tempPng = join(TEMP, "PopupAssetsMini.png");
  const tempJson = join(TEMP, "PopupAssetsMini.json");
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
