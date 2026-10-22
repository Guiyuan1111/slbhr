// 结算面板按关类型拆张（r29）：把官方 `PopupAssets.png`（334.1KB / 111 帧 / 2048²）里的
// 结算内容帧重打包成三张按需图集——
//   PopupFinishGeneral.png  29 帧：FinishStone0000-0021 + 勾叉/成就/钻石/计时图标 + 箭头两帧
//   PopupFinishSpeed.png    29 帧：FinishStoneSpeed0000-0021 + 同上八帧
//   PopupFinishPuzzle.png   28 帧：FinishStonePuzzle0000-0021 + 勾叉/成就/银钻图标 + 箭头两帧
// 主图集 `PopupAssetsSlim.png` 里这些帧全部原地清零，只留进房就会上屏的 PauseButton/
// PopupBackground/Confetti（r26 的生成器口径，see scripts/atlas-slim/needs.mjs）。
//
// 拆的判据是**这一帧什么时候必须到位**：结算板只在通关那一刻打开，主图集不该为它背 178KB。
// 三张按关类型分是因为星碑四套（general/speed/puzzle/dark）里森林只用前三套，而图标集合随
// 布局两行/三行不同。一个会话只装本关这一张（GameScene.kickPopupFinish 预取、EndMenu.preload
// 兜底，装载时清掉另外两个变体），所以三张在库产物不是同时驻留。
//
// 无损证明与 r22/r23 的角色拆张同式：回读自己 inflate IDAT + 反滤波取 RGBA 字节，与官方图集
// 同帧矩形逐位相比；不做 magick 对拍。帧的 frame/sourceSize 照抄官方，只换容器坐标——官方
// 111 帧全部 trimmed:false 且 spriteSourceSize 偏移为 0（本脚本核对这一前提，变了就抛），故
// 渲染几何与整张版逐像素等价：结算板的精灵都是原生尺寸、整数左上角（板容器 (99,159) 整数、
// scale 1），源矩形换位置不引入重采样相位差。
//
// 帧集合的唯一口径在 `scripts/atlas-slim/needs.mjs` 的 `popupFinishNeed()`：
// `packages/client/src/__tests__/popup-finish.test.ts` 独立回算同样三份集合。
//
// 用法：
//   node scripts/split-popup-finish.mjs            # 生成/覆盖 assets/atlasses/PopupFinish{General,Speed,Puzzle}.{png,json}
//   node scripts/split-popup-finish.mjs --check    # 重建到 TEMP 并与在库六件产物比字节（复现性门禁）
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cropRaw, decodePng, encodePngRgba } from "./png-raw.mjs";
import { DEAD_RULES, POPUP_EARLY, POPUP_FINISH_TYPES, finishVariant, popupFinishNeed } from "./atlas-slim/needs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_PNG = join(ROOT, "assets", "atlasses", "PopupAssets.png");
const SRC_JSON = join(ROOT, "assets", "atlasses", "PopupAssets.json");
const TEMP = join(ROOT, "TEMP", "popup-finish-split");
const CHECK = process.argv.includes("--check");

/** 隔离带（角色拆张同规格）：缩放采样核在帧边界只看透明，与邻帧内容彻底解耦 */
const GUT = 2;
/** 排布行宽上限：与源图集同宽级（2048），保持 PNG 行间相关性利于滤波压缩 */
const MAX_W = 2048;

const PRODUCTS = POPUP_FINISH_TYPES.map((type) => ({
  type,
  base: `PopupFinish${type[0].toUpperCase()}${type.slice(1)}`,
  names: popupFinishNeed(type),
}));

const atlas = JSON.parse(readFileSync(SRC_JSON, "utf8"));
const byName = new Map(atlas.frames.map((f) => [f.filename, f]));
const missing = PRODUCTS.flatMap((p) => p.names).filter((n) => !byName.has(n));
if (missing.length) throw new Error(`官方图集缺帧（素材变动？）：${[...new Set(missing)].join(", ")}`);
// 归一化 spriteSourceSize 的前提：官方帧未被 trim、偏移为 0。任一不成立都必须改脚本，
// 悄悄归一化会把像素搬到错位置——"图还在、位置错"比缺图更难发现。
const trimmed = atlas.frames.filter((f) => f.trimmed || f.spriteSourceSize?.x || f.spriteSourceSize?.y);
if (trimmed.length) {
  throw new Error(`官方图集有 ${trimmed.length} 个 trimmed/带偏移的帧（首个：${trimmed[0].filename}），本脚本的几何等价前提失效`);
}

// 切分完备：主图集 keep ∪ 三张结算图集 ∪ DEAD 名单 = 官方全部 111 帧。
// 交集受控：三张之间的重叠只允许是**同一帧被多个类型共用**（图标/箭头），星碑不得跨张。
const early = new Set(POPUP_EARLY);
const seen = new Map();
for (const p of PRODUCTS) {
  for (const n of p.names) {
    if (early.has(n)) throw new Error(`帧 ${n} 同时在主图集 keep 与 ${p.base}（切分不唯一）`);
    if (seen.has(n) && /^FinishStone/.test(n)) throw new Error(`星碑帧 ${n} 同时出现在两张结算图集（${p.base}）`);
    seen.set(n, p.base);
  }
}
const finishUnion = new Set(PRODUCTS.flatMap((p) => p.names));
const declared = atlas.frames.map((f) => f.filename);
const dead = declared.filter((n) => !early.has(n) && !finishUnion.has(n));
const rule = DEAD_RULES.popup;
const badDead = dead.filter((n) => !rule.families.some((p) => n.startsWith(p)) && !rule.exact.includes(n));
if (badDead.length) {
  throw new Error(`${badDead.length} 个帧既不在主图集、也不在结算图集、也不在 DEAD 名单（${badDead.slice(0, 8).join(",")}）——先裁定`);
}
if (finishUnion.size !== 74 || early.size !== 6 || dead.length !== 31) {
  throw new Error(`账目漂移：finish=${finishUnion.size}（期望 74） early=${early.size}（期望 6） dead=${dead.length}（期望 31）`);
}

const src = decodePng(readFileSync(SRC_PNG), "PopupAssets.png");

/** shelf 排布：按高降序、同高按帧名装行——同输入必同输出（复现性门禁依赖这一点） */
function pack(names) {
  const picked = names.map((n) => byName.get(n));
  const placed = [];
  let x = GUT;
  let y = GUT;
  let rowH = 0;
  let W = 0;
  for (const f of [...picked].sort((a, b) => b.frame.h - a.frame.h || a.filename.localeCompare(b.filename))) {
    const w = f.frame.w + GUT;
    const h = f.frame.h + GUT;
    if (x + w > MAX_W) {
      W = Math.max(W, x);
      x = GUT;
      y += rowH;
      rowH = 0;
    }
    placed.push({ f, px: x, py: y });
    x += w;
    rowH = Math.max(rowH, h);
  }
  W = Math.max(W, x) + GUT;
  const H = y + rowH + GUT; // 末行也要有隔离带：否则最高的那帧贴着画布下沿，采样核读到的是画布外
  const data = Buffer.alloc(W * H * 4); // 全透明底
  const frames = [];
  for (const { f, px, py } of placed) {
    const crop = cropRaw(src, f.frame.x, f.frame.y, f.frame.w, f.frame.h);
    for (let r = 0; r < f.frame.h; r++) {
      crop.copy(data, ((py + GUT + r) * W + px + GUT) * 4, r * f.frame.w * 4, (r + 1) * f.frame.w * 4);
    }
    frames.push({
      filename: f.filename,
      frame: { x: px + GUT, y: py + GUT, w: f.frame.w, h: f.frame.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: f.sourceSize.w, h: f.sourceSize.h },
      sourceSize: { w: f.sourceSize.w, h: f.sourceSize.h },
      ...(f.anchor ? { anchor: f.anchor } : {}),
    });
  }
  return { W, H, data, frames };
}

const report = [];
for (const p of PRODUCTS) {
  const { W, H, data, frames } = pack(p.names);
  const png = encodePngRgba(W, H, data);
  const json = `${JSON.stringify(
    {
      frames,
      meta: { app: "split-popup-finish", version: "1.0", image: `${p.base}.png`, format: "RGBA8888", size: { w: W, h: H }, scale: "1" },
    },
    null,
    1
  )}\n`;
  const back = decodePng(png, `${p.base}.png`);
  const bad = frames.filter(
    (jf) =>
      !cropRaw(back, jf.frame.x, jf.frame.y, jf.frame.w, jf.frame.h).equals(
        cropRaw(src, byName.get(jf.filename).frame.x, byName.get(jf.filename).frame.y, jf.frame.w, jf.frame.h),
      ),
  );
  if (bad.length) {
    throw new Error(`无损证明失败：${p.base} 有 ${bad.length} 帧回读与官方裁片不一致（${bad.slice(0, 3).map((f) => f.filename).join(", ")}）`);
  }
  if (finishVariant(p.type) !== p.type) throw new Error(`产品类型 ${p.type} 不是结算图集变体`);
  report.push({ base: p.base, png, json, count: frames.length, W, H });
}

if (CHECK) {
  rmSync(TEMP, { recursive: true, force: true });
  mkdirSync(TEMP, { recursive: true });
  for (const r of report) {
    const outPng = join(ROOT, "assets/atlasses", `${r.base}.png`);
    const outJson = join(ROOT, "assets/atlasses", `${r.base}.json`);
    if (!existsSync(outPng) || !existsSync(outJson)) throw new Error(`在库产物缺失：先不带 --check 跑一次（${r.base}）`);
    writeFileSync(join(TEMP, r.base), r.png);
    writeFileSync(join(TEMP, `${r.base}.json`), r.json);
    const sameP = Buffer.compare(readFileSync(join(TEMP, r.base)), readFileSync(outPng)) === 0;
    const sameJ = Buffer.compare(readFileSync(join(TEMP, `${r.base}.json`)), readFileSync(outJson)) === 0;
    rmSync(join(TEMP, r.base), { force: true });
    rmSync(join(TEMP, `${r.base}.json`), { force: true });
    if (!sameP || !sameJ) throw new Error(`复现性失败：${r.base} png 一致=${sameP} json 一致=${sameJ}`);
  }
  rmSync(TEMP, { recursive: true, force: true });
  console.log(`✓ 复现性：${report.map((r) => `${r.base}.{png,json}`).join(" + ")}（六件）与生成器逐字节一致：${report.map((r) => `${r.count}帧 ${(r.png.length / 1024).toFixed(1)}KB`).join(" + ")}`);
} else {
  for (const r of report) {
    writeFileSync(join(ROOT, "assets/atlasses", `${r.base}.png`), r.png);
    writeFileSync(join(ROOT, "assets/atlasses", `${r.base}.json`), r.json);
    console.log(
      `${r.base}：${r.count} 帧 ${r.W}×${r.H} PNG=${r.png.length}B=${(r.png.length / 1024).toFixed(1)}KB` +
        ` json=${(r.json.length / 1024).toFixed(1)}KB sha256=${createHash("sha256").update(r.png).digest("hex").slice(0, 12)}`,
    );
  }
}
