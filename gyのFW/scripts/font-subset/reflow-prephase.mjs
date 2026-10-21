#!/usr/bin/env node
/**
 * 生成**重排版**进房前字体图集：assets/fonts/chinese/font-prephase.png + font-prephase.fnt。
 *
 * 与 r18 那版（scripts/font-subset/build-font-prephase.mjs）的差别只有一件事：
 * r18 只清像素、不动 `.fnt` ⇒ 幅面被迫与全量同为 2191×1024 ⇒ 解码位图 8.56MB 原样驻留。
 * 本件把 52 个保留字形**换坐标**，并把 206 条未保留声明全部指向同一块透明块 ⇒ 幅面缩到 ~1006×377。
 * 收益口径：解码/上传位图 8.56MB → 约 1.45MB，PNG 304.5KB → 约 226KB。
 *
 * 三条不可让的等价约束（都由本脚本逐像素断言，不是注释里的承诺）：
 *  1. **区域＝帧矩形 ∪ padding 环带，逐字节搬源**。件0（reflow-measure.mjs）实测 258 条字形
 *     全部"墨迹顶到帧矩形边、帧外 1 texel 读到邻帧的墨"，所以换邻居必须把环带一起搬走，
 *     否则"LINEAR 滤波采到的字节与今日相同"这句话不成立。
 *  2. **墨迹守恒**：上一代子集（由口径层 composeSubset 当场复现，不读在库文件，因此本脚本幂等）
 *     里每一个非零像素都落在某个保留区域内（实测成立），于是重排产物 = 上一代的一次布局置换
 *     ——既不新增墨、也不丢墨。
 *  3. **幅面不得同时为 2 的幂**：Phaser 上传纹理时 `generateMipmap = IsSizePowerOfTwo(w,h)`
 *     （node_modules/phaser/src/renderer/webgl/wrappers/WebGLTextureWrapper.js:344）。
 *     今日 2191×1024 非 POT ⇒ 无 mipmap、纯 LINEAR；若产物恰好 POT×POT，采样级别会变，
 *     那已不是"只动坐标"，本脚本直接拒绝这种候选。
 *
 * `.fnt` 侧只改写 `<char>` 的 `x=`/`y=` 与 `<common>` 的 `scaleW`/`scaleH`：
 * width/height/xoffset/yoffset/xadvance/page/chnl/id 全部照抄官方行，`<info>`/`<pages>` 整行不动
 * （`<page file="font.png">` 是惰性的：Phaser 的 ParseXMLBitmapFont 从不读 file 属性，
 * png 由 load.bitmapFont 的 URL 决定）。因此逐行核对即可证明度量面零变更。
 *
 * 用法：
 *   node scripts/font-subset/reflow-prephase.mjs            # 写在库产物（png + fnt）
 *   node scripts/font-subset/reflow-prephase.mjs --dry      # 只打印候选布局与账目，不落盘
 *   node scripts/font-subset/reflow-prephase.mjs --check    # 重建到 TEMP 与在库比字节（复现性门禁）
 *   node scripts/font-subset/reflow-prephase.mjs --spacing 3
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { cropRaw, decodePng, encodePngRgba } from "../png-raw.mjs";
import { composeSubset, loadFontAtlas, loadSpec, pack, parseFnt, prephaseChars } from "./prephase.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FONT_DIR = "assets/fonts/chinese";
const SRC_PNG = join(ROOT, FONT_DIR, "font.png");
const SRC_FNT = join(ROOT, FONT_DIR, "font.fnt");
const CUR_PNG = join(ROOT, FONT_DIR, "font-prephase.png");
const OUT_PNG = CUR_PNG;
const OUT_FNT = join(ROOT, FONT_DIR, "font-prephase.fnt");
const TEMP = join(ROOT, "TEMP/font-prephase");

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const DRY = argv.includes("--dry");
const SPACING = Number(argv.includes("--spacing") ? argv[argv.indexOf("--spacing") + 1] : 2);
if (!Number.isInteger(SPACING) || SPACING < 1) throw new Error("--spacing 需 ≥1 的整数");

const kb = (n) => (n / 1024).toFixed(1);
const mb = (n) => (n / 1048576).toFixed(2);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const isPot = (n) => n > 0 && Number.isInteger(Math.log2(n));

const fnt = parseFnt(SRC_FNT);
const spec = loadSpec(ROOT);
const ring = spec._ring;
if (new Set(fnt.padding).size !== 1) throw new Error(`fnt padding=${fnt.padding.join(",")} 非各边相等，环带口径要重定`);
if (ring !== fnt.padding[0]) throw new Error(`声明环宽 ${ring} != fnt padding ${fnt.padding[0]}`);

const src = loadFontAtlas(SRC_PNG, fnt);
const { chars: charSet, kept, noGlyph } = prephaseChars(spec, fnt);

const declared = [...fnt.glyphs.values()].filter((g) => g.width > 0 && g.height > 0);
const zeroDecls = [...fnt.glyphs.values()].filter((g) => g.width === 0 || g.height === 0);
const keptCodes = new Set(kept.map((k) => k.glyph.id));
const keptList = declared.filter((g) => keptCodes.has(g.id));
const nonKept = declared.filter((g) => !keptCodes.has(g.id));
if (keptList.length === 0) throw new Error("保留字形为空——声明与 fnt 完全不交，先查文案");

// ---- 基线：上一代（r18）子集由口径层当场复现，不读在库文件 ----
// 读在库文件会让本脚本失去幂等性：重排一回，CUR_PNG 就变成自己的产物，
// 而"帧 ∪ 环带逐字节搬源"这条前提只在 r18 那代的坐标下成立（幅面也才与 fnt 相符）。
const base = composeSubset(src, fnt, kept, ring);
const basePng = encodePngRgba(src.w, src.h, base.out, src.ancillary);
const nonzero = (buf) => {
  let n = 0;
  for (let i = 0; i < buf.length; i += 4) if (buf[i] | buf[i + 1] | buf[i + 2] | buf[i + 3]) n++;
  return n;
};
const baseInk = nonzero(base.out);

// ---- 前置核验：上一代子集确实是"帧 ∪ 环带逐字节搬源、其余为零"，本件才有"布局置换"这句话可说 ----
const inRegion = new Uint8Array(src.w * src.h);
for (const g of keptList) {
  const x0 = Math.max(0, g.x - ring), y0 = Math.max(0, g.y - ring);
  const x1 = Math.min(src.w, g.x + g.width + ring), y1 = Math.min(src.h, g.y + g.height + ring);
  for (let y = y0; y <= y1 - 1; y++) for (let x = x0; x <= x1 - 1; x++) inRegion[y * src.w + x] = 1;
}
let staleBytes = 0;
let baseInkOutside = 0;
for (let i = 0; i < src.w * src.h; i++) {
  const o = i * 4;
  const nonZero = base.out[o] | base.out[o + 1] | base.out[o + 2] | base.out[o + 3];
  if (nonZero && !inRegion[i]) baseInkOutside++;
  if (inRegion[i] && Buffer.compare(base.out.subarray(o, o + 4), src.data.subarray(o, o + 4)) !== 0) staleBytes++;
}
if (baseInkOutside > 0) {
  throw new Error(`上一代子集有 ${baseInkOutside} 个非零像素落在"帧 ∪ 环带"之外——本件的"布局置换"前提不成立，先查 build-font-prephase 的口径`);
}
if (staleBytes > 0) {
  throw new Error(`上一代子集有 ${staleBytes} 个授权像素与源 font.png 字节不符（口径层漂移）：先重跑 build-font-prephase.mjs --check`);
}
// 在库文件若还是上一代幅面，逐字节核它＝口径层复现（幂等：重排后幅面已变，本步自动跳过）
if (existsSync(CUR_PNG)) {
  const onDisk = decodePng(readFileSync(CUR_PNG), "font-prephase.png");
  if (onDisk.w === src.w && onDisk.h === src.h) {
    if (Buffer.compare(readFileSync(CUR_PNG), basePng) !== 0) {
      throw new Error(`在库 font-prephase.png 与口径层复现的上一代子集字节不符（有人手改产物或源漂移）`);
    }
    console.log(`在库产物核对：上一代幅面 ${onDisk.w}x${onDisk.h}，字节＝composeSubset 复现 ✓`);
  } else {
    console.log(`在库产物已是重排代 ${onDisk.w}x${onDisk.h}（本脚本幂等重跑，基线一律取 composeSubset 复现的上一代）`);
  }
}

// ---- 布局：保留字形区域 ＋ 一块共享透明块 ----
const blkW = Math.max(...nonKept.map((g) => g.width)) + 2 * ring;
const blkH = Math.max(...nonKept.map((g) => g.height)) + 2 * ring;
const items = keptList.map((g) => ({ key: String(g.id), w: g.width + 2 * ring, h: g.height + 2 * ring }));
items.push({ key: "__block", w: blkW, h: blkH });
const packed = pack(items, SPACING, { forbidden: (w, h) => isPot(w) && isPot(h) });
const { w: W, h: H, place } = packed;
const block = place.get("__block");
if (isPot(W) && isPot(H)) throw new Error(`候选幅面 ${W}x${H} 同为 2 的幂 ⇒ Phaser 会生成 mipmap，采样级别变化，拒绝`);

/** 每条声明的落位：保留字形＝区域原点 +ring（帧矩形）；其余（含 0×0）＝透明块内 +ring */
const moveTo = new Map();
for (const g of keptList) {
  const p = place.get(String(g.id));
  moveTo.set(g.id, { x: p.x + ring, y: p.y + ring, region: p, regionW: g.width + 2 * ring, regionH: g.height + 2 * ring });
}
for (const g of nonKept) moveTo.set(g.id, { x: block.x + ring, y: block.y + ring, region: block, regionW: blkW, regionH: blkH });
for (const g of zeroDecls) moveTo.set(g.id, { x: block.x + ring, y: block.y + ring, region: block, regionW: blkW, regionH: blkH });

const out = Buffer.alloc(W * H * 4);
const occupancy = new Uint8Array(W * H);
let copiedTexels = 0;
/** 逐区域墨迹之和（注意：源里保留区域的**并集**才是现行子集的墨迹，区域之间本就互相重叠——
 *  一个像素若同时属于两个保留区域，重排后它被搬两次（各自服务自己那一帧的邻域采样），
 *  所以这里不能用"总墨迹相等"当守恒式，要看 expectedInk 这条逐区域口径） */
let expectedInk = 0;
const claim = (x, y, n, who) => {
  for (let col = 0; col < n; col++) {
    const i = y * W + x + col;
    if (occupancy[i]) throw new Error(`区域重叠：${who} 在 (${x + col},${y}) 撞上已占用的 texel`);
    occupancy[i] = 1;
  }
};
for (const g of keptList) {
  const m = moveTo.get(g.id);
  const rx = g.x - ring, ry = g.y - ring;
  if (rx < 0 || ry < 0 || rx + m.regionW > src.w || ry + m.regionH > src.h) {
    throw new Error(`字形 ${g.id} 的环带越出源画布（区域 (${rx},${ry},${m.regionW}x${m.regionH}) 不在 ${src.w}x${src.h} 内）：件0 实测 0 处，出现即口径变了`);
  }
  const crop = cropRaw(src, rx, ry, m.regionW, m.regionH);
  for (let r = 0; r < m.regionH; r++) {
    claim(m.region.x, m.region.y + r, m.regionW, `字形 ${g.id}`);
    crop.copy(out, ((m.region.y + r) * W + m.region.x) * 4, r * m.regionW * 4, r * m.regionW * 4 + m.regionW * 4);
  }
  copiedTexels += m.regionW * m.regionH;
  for (let i = 0; i < crop.length; i += 4) {
    if (crop[i] | crop[i + 1] | crop[i + 2] | crop[i + 3]) expectedInk++;
  }
}
for (let r = 0; r < blkH; r++) claim(block.x, block.y + r, blkW, "透明块");
// 透明块不写任何字节（整块保持零），只是占位让未保留声明的矩形仍然落在画布内

// ---- 编码 + 对**重解码后的字节**做全部断言（验的是最终落盘产物） ----
const buf = encodePngRgba(W, H, out, src.ancillary);
const back = decodePng(buf, "font-prephase.png");
if (back.w !== W || back.h !== H) throw new Error(`重解码尺寸 ${back.w}x${back.h} 与候选 ${W}x${H} 不符`);
if (back.chunks !== src.chunks) throw new Error(`块序变化：${src.chunks} → ${back.chunks}`);
if (Buffer.compare(back.data, out) !== 0) throw new Error("重解码样本与合成样本不一致（编码有损）");

const problems = [];
let backInk = 0;
let outsideNonZero = 0;
for (let i = 0; i < W * H; i++) {
  const o = i * 4;
  if (back.data[o] | back.data[o + 1] | back.data[o + 2] | back.data[o + 3]) {
    backInk++;
    if (!occupancy[i]) outsideNonZero++;
  }
}
if (outsideNonZero > 0) problems.push(`区域外残留 ${outsideNonZero} 个非零像素`);
if (backInk !== expectedInk) problems.push(`逐区域墨迹不符：重排后 ${backInk} ≠ 计划 ${expectedInk}`);
if (backInk < baseInk) problems.push(`重排后墨迹 ${backInk} 少于上一代子集 ${baseInk}——有像素被搬丢`);
for (const g of keptList) {
  const m = moveTo.get(g.id);
  for (let r = -ring; r < g.height + ring; r++) {
    const srcRow = ((g.y + r) * src.w + (g.x - ring)) * 4;
    // 区域第 0 行对应 r=-ring（帧上方 ring 行），目的行因此要加回 ring
    const dstRow = ((m.region.y + r + ring) * W + m.region.x) * 4;
    if (Buffer.compare(back.data.subarray(dstRow, dstRow + m.regionW * 4), src.data.subarray(srcRow, srcRow + m.regionW * 4)) !== 0) {
      problems.push(`字形 ${g.id} 区域第 ${r + ring} 行与源字节不符`);
      break;
    }
  }
}
for (const g of fnt.glyphs.values()) {
  const m = moveTo.get(g.id);
  if (!m) { problems.push(`字形 ${g.id} 没有落位`); continue; }
  if (m.x < 0 || m.y < 0 || m.x + g.width > W || m.y + g.height > H) {
    problems.push(`字形 ${g.id} 重排后矩形 (${m.x},${m.y},${g.width}x${g.height}) 越出 ${W}x${H}`);
  }
}
if (problems.length) throw new Error(`重排断言失败：\n - ${[...new Set(problems)].slice(0, 12).join("\n - ")}`);

// ---- .fnt：逐行改写 x/y + scaleW/scaleH，其余字节照抄 ----
const srcFntText = readFileSync(SRC_FNT, "utf8");
let rewritten = 0;
const fntText = srcFntText
  .replace(/<common\b[^>]*>/, (tag) =>
    tag.replace(/\bscaleW="\d+"/, `scaleW="${W}"`).replace(/\bscaleH="\d+"/, `scaleH="${H}"`))
  .replace(/<char\b[^>]*>/g, (tag) => {
    const id = Number(/\bid="(\d+)"/.exec(tag)[1]);
    const m = moveTo.get(id);
    if (!m) throw new Error(`<char id="${id}"> 没有落位`);
    rewritten++;
    return tag.replace(/\bx="\d+"/, `x="${m.x}"`).replace(/\by="\d+"/, `y="${m.y}"`);
  });
// 行级核：char 行遮掉 x/y、common 行遮掉 scaleW/scaleH 后必须与源逐字节相同
const mask = (line) =>
  /<char\b/.test(line)
    ? line.replace(/\bx="-?\d+"/, 'x="@"').replace(/\by="-?\d+"/, 'y="@"')
    : line.includes("<common")
      ? line.replace(/\bscaleW="\d+"/, 'scaleW="@"').replace(/\bscaleH="\d+"/, 'scaleH="@"')
      : line;
const srcLines = srcFntText.split("\n");
const newLines = fntText.split("\n");
if (srcLines.length !== newLines.length) throw new Error(`行数变化 ${srcLines.length} → ${newLines.length}`);
for (let i = 0; i < srcLines.length; i++) {
  if (mask(srcLines[i]) !== mask(newLines[i])) throw new Error(`第 ${i + 1} 行除 x/y|scaleW/scaleH 之外仍有差异：\n  ${srcLines[i]}\n  ${newLines[i]}`);
}
const srcCharLines = srcLines.filter((l) => /<char\b/.test(l)).length;
if (rewritten !== srcCharLines) throw new Error(`改写的 <char> 行数 ${rewritten} != 源 <char> 行数 ${srcCharLines}`);
const reparse = parseFntFromText(fntText, "font-prephase.fnt");
for (const [code, g] of fnt.glyphs) {
  const n = reparse.glyphs.get(code);
  if (!n) throw new Error(`新 fnt 丢了字形 ${code}`);
  for (const k of ["width", "height", "xoffset", "yoffset", "xadvance", "id"]) {
    if (n[k] !== g[k]) throw new Error(`字形 ${code} 的 ${k} 变了 ${g[k]} → ${n[k]}（只允许 x/y 变）`);
  }
  const m = moveTo.get(code);
  if (n.x !== m.x || n.y !== m.y) throw new Error(`字形 ${code} 落位 ${n.x},${n.y} != 计划 ${m.x},${m.y}`);
}
if (reparse.scaleW !== W || reparse.scaleH !== H) throw new Error(`新 fnt scaleW/scaleH ${reparse.scaleW}/${reparse.scaleH} != 幅面 ${W}x${H}`);
for (const k of ["size", "lineHeight", "base", "pages"]) {
  if (reparse[k] !== fnt[k]) throw new Error(`${k} 变了 ${fnt[k]} → ${reparse[k]}`);
}
if (reparse.padding.join(",") !== fnt.padding.join(",")) throw new Error(`padding 变了 ${fnt.padding} → ${reparse.padding}`);
if (reparse.charLines !== fnt.charLines) throw new Error(`<char> 行数变了 ${fnt.charLines} → ${reparse.charLines}`);
if (reparse.dupes.length !== fnt.dupes.length) throw new Error(`重复 id 结构变了 ${fnt.dupes} → ${reparse.dupes}`);

// ---- 账目 ----
const basePngBytes = basePng.length;
const srcPngBytes = readFileSync(SRC_PNG).length;
const frameArea = keptList.reduce((s, g) => s + g.width * g.height, 0);
console.log(`源 ${SRC_PNG.slice(ROOT.length + 1)} ${src.w}x${src.h} ${kb(srcPngBytes)}（解码 ${mb(src.w * src.h * 4)}MB）＝官方字节，本件不动它`);
console.log(`进房前文案字符 ${charSet.size}：有字形 ${kept.length}（帧 ${keptList.length} 个）/ 无字形 ${noGlyph.length}`);
console.log(`声明 ${fnt.glyphs.size} 条 = 保留 ${keptList.length} + 未保留 ${nonKept.length} + 0×0 ${zeroDecls.length}（全部仍留在 fnt 里，未保留者指向同一透明块）`);
console.log(`上一代（composeSubset 复现）${src.w}x${src.h} ${kb(basePngBytes)}（解码 ${mb(src.w * src.h * 4)}MB） 墨迹 ${baseInk.toLocaleString()}`);
console.log(`重排产物 ${W}x${H} PNG ${kb(buf.length)}（解码 ${mb(W * H * 4)}MB） 墨迹 ${backInk.toLocaleString()} 帧密度 ${((frameArea / (W * H)) * 100).toFixed(2)}%`);
console.log(`  搬运 ${copiedTexels.toLocaleString()} texel（区域＝帧 ∪ ${ring}px 环带，逐字节＝源）＋透明块 ${blkW}x${blkH}（承载 ${nonKept.length + zeroDecls.length} 条声明）`);
console.log(`  墨迹：上一代 ${baseInk.toLocaleString()}（全部落在保留区域内，区域外 0 个）→ 重排后 ${backInk.toLocaleString()}，差额 ${(-(baseInk - backInk)).toLocaleString()} 是"同一源像素属多个区域因而被搬两次"的邻域重复量`);
console.log(`  省：解码位图 ${mb(src.w * src.h * 4 - W * H * 4)}MB（-${(((src.w * src.h * 4 - W * H * 4) / (src.w * src.h * 4)) * 100).toFixed(1)}%）/ PNG ${kb(basePngBytes - buf.length)}（-${(((basePngBytes - buf.length) / basePngBytes) * 100).toFixed(1)}%）`);
console.log(`  幅面 ${W}x${H} 非 2 的幂对（POT=${isPot(W)}/${isPot(H)}）⇒ 与今日同为"无 mipmap、纯 LINEAR"采样级别`);
console.log(`fnt 改写：${rewritten} 条 <char> 的 x/y + <common> scaleW/scaleH；width/height/xoffset/yoffset/xadvance/page/chnl/lineHeight/base/padding 逐条核为不变`);
console.log(`产物 sha256 png=${sha(buf).slice(0, 32)}… fnt=${sha(Buffer.from(fntText)).slice(0, 32)}…`);

if (DRY) {
  console.log(`（--dry：不落盘）`);
  process.exit(0);
}

if (CHECK) {
  if (!existsSync(OUT_PNG) || !existsSync(OUT_FNT)) throw new Error(`在库产物缺失：先不带 --check 跑一次`);
  mkdirSync(TEMP, { recursive: true });
  writeFileSync(join(TEMP, "font-prephase.png"), buf);
  writeFileSync(join(TEMP, "font-prephase.fnt"), fntText);
  const sameP = Buffer.compare(readFileSync(join(TEMP, "font-prephase.png")), readFileSync(OUT_PNG)) === 0;
  const sameF = Buffer.compare(readFileSync(join(TEMP, "font-prephase.fnt")), readFileSync(OUT_FNT)) === 0;
  console.log(`可复现性：png ${sameP ? "字节一致 ✓" : "不一致 ✗"}  fnt ${sameF ? "字节一致 ✓" : "不一致 ✗"}`);
  if (!sameP || !sameF) process.exit(1);
} else {
  mkdirSync(dirname(OUT_PNG), { recursive: true });
  writeFileSync(OUT_PNG, buf);
  writeFileSync(OUT_FNT, fntText);
  console.log(`已写出 ${relative(ROOT, OUT_PNG)} 与 ${relative(ROOT, OUT_FNT)}`);
}

/** 从文本解析 fnt（与 parseFnt 同口径，但输入是内存里的新文本，避免先落盘再读） */
function parseFntFromText(xml, tag) {
  const attrOf = (t, name) => {
    const m = new RegExp(`\\b${name}="([^"]*)"`).exec(t);
    if (!m) throw new Error(`${tag} 的 ${t.slice(0, 40)} 缺属性 ${name}`);
    return m[1];
  };
  const info = /<info\b[^>]*>/.exec(xml);
  const common = /<common\b[^>]*>/.exec(xml);
  if (!info || !common) throw new Error(`${tag} 缺 <info>/<common>`);
  const glyphs = new Map();
  const dupes = [];
  for (const m of xml.matchAll(/<char\b[^>]*>/g)) {
    const a = (name) => Number(attrOf(m, name));
    const g = { id: a("id"), x: a("x"), y: a("y"), width: a("width"), height: a("height"), xoffset: a("xoffset"), yoffset: a("yoffset"), xadvance: a("xadvance") };
    if (a("page") !== 0) throw new Error(`${tag}: 字形 ${g.id} 不在页 0`);
    if (glyphs.has(g.id)) dupes.push({ id: g.id, prev: glyphs.get(g.id), next: g });
    glyphs.set(g.id, g);
  }
  return {
    size: Number(attrOf(info, "size")),
    padding: attrOf(info, "padding").split(",").map(Number),
    scaleW: Number(attrOf(common, "scaleW")),
    scaleH: Number(attrOf(common, "scaleH")),
    pages: Number(attrOf(common, "pages")),
    lineHeight: Number(attrOf(common, "lineHeight")),
    base: Number(attrOf(common, "base")),
    charLines: glyphs.size + dupes.length,
    dupes,
    glyphs,
  };
}
