// 角色图集拆分（r22 件2 两张，r23 件1 三张）：把官方 `CharAssets.png`（714.9KB / 239 帧 / 2048²）
// 无损切成三张——
//   CharAssetsMenu.png  53 帧：开始界面首帧真正绘制/播放的 glow0000 + legs_idle0000 + head_idle 序列
//   CharAssetsEntry.png   7 帧：房内"可玩之前"就要解析的钻石四式 + death_smoke0000 + 双角色 stairs0000
//   CharAssetsPlay.png 182 帧：其余全部（跳跃/坠落/上升/跑步腿/楼梯序列/烟雾序列/冰腿/_default）
// 分段的判据是同一条：**这一帧在"可玩"之前是否必须到位**。Menu 张服务开始界面；Entry 张服务房间
// 首帧与构造期解析（钻石是首帧唯一可见的房内角色帧，另三处虽构造时不可见，帧名却当场解析）；
// Play 张全是"某状态发生时才播"的序列 ⇒ 不再进任何阻塞批，改由房间可玩之后的延迟通道取（r21 挪循环
// BGM 同一手法）。`ENTRY_SHARED` 那三帧**故意同时存在于 Entry 与 Play**（构造点与动画区间各取一边，
// 少一边就是 `__BASE` 花屏），故三张不是严格划分：Menu∩Play=∅、Menu∪Play=官方去掉钻石、Entry ⊆ 官方。
// r22 的 `ATLAS_CHARS_GAME`（186 帧一张、随 loadGameAtlases 进落定门）就是被这条判据再切一刀的产物。
//
// 为什么是"拆"而不是"额外再做一张子集"：239 帧面积合计 3,643,157px，各张与原图是同一批帧、只差容器，
// 所以密度直接读成字节比——整张 0.201 B/px，Menu+Play 两张合计 0.173 B/px，**两张相加仍比原图小**；
// 第三张只多付 8.8KB 会话字节（就是那三个重复帧）与 0.29MB 驻留像素，换进房阻塞批少付 434.4KB。
// 具体数每次生成后打印，`--check` 门禁保证在库产物与本脚本逐字节复现。
//
// 帧集合的唯一依据是消费点（改这里必须同步改代码，`__tests__/char-atlas-split.test.ts`
// 把三处对齐钉成断言，口径与 scripts/font-subset 那套 FONT_MAIN/FONT_FULL 分类同一形状）：
//   - Menu 张：MenuScene.ts:79-82 双角色 glow0000 + legs_idle0000 + head 精灵；BootScene.buildMenuAnims()
//     的 `{role}_idle` head_idle 帧区间（fire 0..18 / water 0..29）与 `{role}_legs_idle` 单帧。
//   - Entry 张：GameScene.ts:729 钻石（DIAMOND_FRAME :52-57，首帧可见）、:1101 `death_smoke0000`
//     （buildPlayers 构造，setVisible(false)）、:1684 `{p}_stairs0000`（won 演出构造即播）。
//   - Play 张：BootScene.buildCharAnims() 的十一式序列帧区间（legs_run/jump/fall/rising/stairs/smoke），
//     注册点已推迟到该张纹理到位之后——早一步就是 Texture.get 缺帧分支（Texture.js:248-253 只 warn
//     并交出 `firstFrame`/`__BASE`，于是那个对象把整张图集当一帧贴满屏）。
//
// 无损证明走**原始样本**（与 build-dom-skin.mjs 同式）：回读自己 inflate IDAT + 反滤波取
// RGBA 字节，与官方图集里同帧的同样矩形逐位相比；不做 magick 对拍（两侧同过色彩管理会把
// ±1 级量化差抹平成 AE=0，"看着无损"不等于"存着无损"）。帧的 frame/ sourceSize 照抄官方条目，
// 只换容器坐标——官方 239 帧全部 trimmed:false 且 spriteSourceSize 偏移为 0（本脚本会核对这一
// 前提，变了就抛），故渲染几何与整张版逐像素等价，prephase-canvas 像素门禁在换图集后仍能对拍。
//
// 用法：
//   node scripts/split-char-atlas.mjs            # 生成/覆盖 assets/atlasses/CharAssets{Menu,Entry,Play}.{png,json}
//   node scripts/split-char-atlas.mjs --check    # 重建到 TEMP 并与在库六件产物比字节（复现性门禁）
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cropRaw, decodePng, encodePngRgba } from "./png-raw.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_PNG = join(ROOT, "assets", "atlasses", "CharAssets.png");
const SRC_JSON = join(ROOT, "assets", "atlasses", "CharAssets.json");
const TEMP = join(ROOT, "TEMP", "char-atlas-split");
const CHECK = process.argv.includes("--check");

/** 隔离带（dom-skin 同规格）：缩放采样核在帧边界只看透明，与邻帧内容彻底解耦 */
const GUT = 2;
/** 排布行宽上限：与源图集同宽级（2048），保持 PNG 行间相关性利于滤波压缩 */
const MAX_W = 2048;

const seq = (prefix, start, end) =>
  Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${String(start + i).padStart(4, "0")}`);

/** Menu 张的帧集合（见头注两处消费点） */
const MENU_FRAMES = ["fire", "water"].flatMap((role) => [
  `${role}_glow0000`,
  `${role}_legs_idle0000`,
  ...seq(`${role}_head_idle`, 0, role === "fire" ? 18 : 29),
]);

/** Entry 张（r23 件1）：房内"可玩之前"必须解析到位的七帧——钻石四式首帧就画，
 *  smoke/stairs 的 0000 帧在 create/won 演出里构造即解析（构造时不可见不等于可以不装：
 *  缺帧走 `Texture.get` 的 `__BASE` 分支，等于把整张图集当一帧贴上来）。
 *  序列的其余帧都只在按了键/死了/通关那一刻才播，归 Play 张。 */
const DIAMOND_FRAMES = ["diamond_fb0000", "diamond_wg0000", "diamond_silver0000", "diamond_fbwg0000"];
/** 与 Play 张**故意重复**的三帧：它们同时是构造点的初始帧名（走 Entry）和动画区间的首帧（走 Play）。
 *  少任何一边都踩坑——Entry 没有 ⇒ create/won 当场解析不到帧，把整张图集当一帧贴上；
 *  Play 没有 ⇒ `seq(..., 0, 29)` 注册时首帧落 `__BASE`，动画带着错帧一直播（buildSeq 的 exists 幂等卫
 *  还禁止之后重建）。代价如实记账：png +8.8KB 会话字节、第三张容器 +0.29MB 驻留像素，
 *  换来进房阻塞批少付 434.4KB。 */
const ENTRY_SHARED = ["death_smoke0000", "fire_stairs0000", "water_stairs0000"];
const ENTRY_FRAMES = [...DIAMOND_FRAMES, ...ENTRY_SHARED];

const PRODUCTS = [
  { base: "CharAssetsMenu", names: MENU_FRAMES },
  { base: "CharAssetsEntry", names: ENTRY_FRAMES },
  // 其余全部：非 Menu 张、且不是钻石（钻石没有任何动画引用它，只被 Entry 画一次）
  { base: "CharAssetsPlay", names: null },
];

const atlas = JSON.parse(readFileSync(SRC_JSON, "utf8"));
const byName = new Map(atlas.frames.map((f) => [f.filename, f]));
const menuSet = new Set(MENU_FRAMES);
const diamondSet = new Set(DIAMOND_FRAMES);
const missing = [...MENU_FRAMES, ...ENTRY_FRAMES].filter((n) => !byName.has(n));
if (missing.length) throw new Error(`官方图集缺帧（素材变动？）：${missing.join(", ")}`);
// 归一化 spriteSourceSize 的前提：官方帧未被 trim、偏移为 0。任一不成立都必须改脚本，
// 悄悄归一化会把像素搬到错位置——"图还在、位置错"比缺图更难发现。
const trimmed = atlas.frames.filter((f) => f.trimmed || f.spriteSourceSize?.x || f.spriteSourceSize?.y);
if (trimmed.length) {
  throw new Error(`官方图集有 ${trimmed.length} 个 trimmed/带偏移的帧（首个：${trimmed[0].filename}），本脚本的几何等价前提失效`);
}
const src = decodePng(readFileSync(SRC_PNG), "CharAssets.png");

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

/** 无损证明 + 覆盖证明：逐帧回读与官方裁片逐字节比较；Menu/Play 两张不相交且并集恰等于官方去掉
 *  钻石之后的帧集，Entry 张 = 钻石四式 + `ENTRY_SHARED` 三帧（唯一允许的跨张重复） */
const seen = new Map();
const report = [];
for (const p of PRODUCTS) {
  const names = p.names ?? atlas.frames.map((f) => f.filename).filter((n) => !menuSet.has(n) && !diamondSet.has(n));
  for (const n of names) {
    const prev = seen.get(n);
    if (prev) {
      const ok = (p.base === "CharAssetsPlay" && ENTRY_SHARED.includes(n)) || (p.base === "CharAssetsEntry" && ENTRY_SHARED.includes(n));
      if (!ok) throw new Error(`帧 ${n} 同时出现在 ${prev} 与 ${p.base}（切分不唯一，且不在 ENTRY_SHARED 白名单里）`);
    }
    seen.set(n, `${prev ? `${prev}+${p.base}` : p.base}`);
  }
  const { W, H, data, frames } = pack(names);
  const png = encodePngRgba(W, H, data);
  const json = `${JSON.stringify(
    {
      frames,
      meta: { app: "split-char-atlas", version: "1.0", image: `${p.base}.png`, format: "RGBA8888", size: { w: W, h: H }, scale: "1" },
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
  report.push({ base: p.base, png, json, count: frames.length, W, H });
}
if (seen.size !== atlas.frames.length) {
  throw new Error(`覆盖不全：三张合计 ${seen.size} 帧，官方 ${atlas.frames.length} 帧`);
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
    if (!sameP || !sameJ) throw new Error(`复现性失败：${r.base} png 一致=${sameP} json 一致=${sameJ}`);
  }
  rmSync(TEMP, { recursive: true, force: true });
  console.log(`✓ 复现性：${report.map((r) => `${r.base}.{png,json}`).join(" + ")}（六件）与生成器逐字节一致：${report.map((r) => `${r.count}帧 ${(r.png.length / 1024).toFixed(1)}KB`).join(" + ")}`);
} else {
  let total = 0;
  for (const r of report) {
    writeFileSync(join(ROOT, "assets/atlasses", `${r.base}.png`), r.png);
    writeFileSync(join(ROOT, "assets/atlasses", `${r.base}.json`), r.json);
    total += r.png.length;
    console.log(
      `${r.base}：${r.count} 帧 ${r.W}×${r.H} PNG=${r.png.length}B=${(r.png.length / 1024).toFixed(1)}KB` +
        ` json=${(r.json.length / 1024).toFixed(1)}KB sha256=${createHash("sha256").update(r.png).digest("hex").slice(0, 12)}`,
    );
  }
  console.log(
    `三张 PNG 合计 ${(total / 1024).toFixed(1)}KB vs 官方整张 ${(readFileSync(SRC_PNG).length / 1024).toFixed(1)}KB` +
      `（差 ${((total - readFileSync(SRC_PNG).length) / 1024).toFixed(1)}KB）`,
  );
}
