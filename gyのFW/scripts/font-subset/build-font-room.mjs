#!/usr/bin/env node
/**
 * 生成房内中文字体子集：assets/fonts/chinese/font-room.png + font-room.fnt。
 *
 * 链路与 r18/r19 的进房前子集（prephase.mjs / reflow-prephase.mjs）同一定位、同一口径，只是需求源换成
 * 房内（GameScene + 三块面板 + 关卡教学文本）——由 scripts/font-subset/room.mjs 提供，与静态测试共用。
 * 做法与 reflow-prephase.mjs 逐条对齐：
 *  1. 授权区＝官方字形帧矩形 ∪ ring(=fnt padding) 环带，逐字节从 font.png 搬来（换邻居也一并搬走滤波邻域）。
 *  2. 货架打包 spacing=2，未保留声明全部指向同一块透明块 ⇒ 幅面缩到紧凑。
 *  3. 拒绝宽高同为 2 的幂的幅面（Phaser 会 generateMipmap，采样级别就变了）。
 *  4. `.fnt` 只改写 <char> 的 x/y 与 <common> 的 scaleW/scaleH，度量面逐行不变、声明一条不少。
 *
 * 用法：
 *   node --import tsx scripts/font-subset/build-font-room.mjs            # 写在库产物（png + fnt）
 *   node --import tsx scripts/font-subset/build-font-room.mjs --dry      # 只打印账目，不落盘
 *   node --import tsx scripts/font-subset/build-font-room.mjs --check     # 重建到 TEMP 与在库比字节（复现性门禁）
 *   node --import tsx scripts/font-subset/build-font-room.mjs --spacing 3
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { cropRaw, decodePng, encodePngRgba } from "../png-raw.mjs";
import { loadFontAtlas, loadSpec, pack, parseFnt } from "./prephase.mjs";
import { roomChars } from "./room.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FONT_DIR = "assets/fonts/chinese";
const SRC_PNG = join(ROOT, FONT_DIR, "font.png");
const SRC_FNT = join(ROOT, FONT_DIR, "font.fnt");
const OUT_PNG = join(ROOT, FONT_DIR, "font-room.png");
const OUT_FNT = join(ROOT, FONT_DIR, "font-room.fnt");
const TEMP = join(ROOT, "TEMP/font-room");

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
const { chars: charSet, kept, noGlyph } = await roomChars(ROOT, fnt);
if (kept.length === 0) throw new Error("房内字形集为空——声明与 fnt 完全不交，先查文案/关卡");

const declared = [...fnt.glyphs.values()].filter((g) => g.width > 0 && g.height > 0);
const zeroDecls = [...fnt.glyphs.values()].filter((g) => g.width === 0 || g.height === 0);
const keptCodes = new Set(kept.map((k) => k.glyph.id));
const keptList = declared.filter((g) => keptCodes.has(g.id));
const nonKept = declared.filter((g) => !keptCodes.has(g.id));

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
let expectedInk = 0;
let frameArea = 0;
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
    throw new Error(`字形 ${g.id} 的环带越出源画布（区域 (${rx},${ry},${m.regionW}x${m.regionH}) 不在 ${src.w}x${src.h} 内）`);
  }
  const crop = cropRaw(src, rx, ry, m.regionW, m.regionH);
  for (let r = 0; r < m.regionH; r++) {
    claim(m.region.x, m.region.y + r, m.regionW, `字形 ${g.id}`);
    crop.copy(out, ((m.region.y + r) * W + m.region.x) * 4, r * m.regionW * 4, r * m.regionW * 4 + m.regionW * 4);
  }
  copiedTexels += m.regionW * m.regionH;
  for (let i = 0; i < crop.length; i += 4) if (crop[i] | crop[i + 1] | crop[i + 2] | crop[i + 3]) expectedInk++;
  frameArea += g.width * g.height;
}
for (let r = 0; r < blkH; r++) claim(block.x, block.y + r, blkW, "透明块");
// 透明块不写任何字节（整块保持零），只是占位让未保留声明的矩形仍然落在画布内

// ---- 编码 + 对重解码后的字节做全部断言（验的是最终落盘产物） ----
const buf = encodePngRgba(W, H, out, src.ancillary);
const back = decodePng(buf, "font-room.png");
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
for (const g of keptList) {
  const m = moveTo.get(g.id);
  for (let r = -ring; r < g.height + ring; r++) {
    const srcRow = ((g.y + r) * src.w + (g.x - ring)) * 4;
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
    problems.push(`字形 ${g.id} 落位矩形 (${m.x},${m.y},${g.width}x${g.height}) 越出 ${W}x${H}`);
  }
}
if (problems.length) throw new Error(`房内图集断言失败：\n - ${[...new Set(problems)].slice(0, 12).join("\n - ")}`);

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
const reparse = parseFntFromText(fntText, "font-room.fnt");
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
const srcPngBytes = readFileSync(SRC_PNG).length;
const srcFntBytes = Buffer.byteLength(srcFntText);
console.log(`源 ${relative(ROOT, SRC_PNG)} ${src.w}x${src.h} ${kb(srcPngBytes)}（解码 ${mb(src.w * src.h * 4)}MB）＝官方字节，本件不动它`);
console.log(`房内文案字符 ${charSet.size}：有帧 ${keptList.length} / 无帧 ${noGlyph.length}${noGlyph.length ? `（${noGlyph.map((n) => n.ch).join("")}，今日即空白）` : ""}`);
console.log(`声明 ${fnt.glyphs.size} 条 = 保留 ${keptList.length} + 未保留 ${nonKept.length} + 0×0 ${zeroDecls.length}（全部仍留在 fnt，未保留者指向同一透明块）`);
console.log(`产物 ${W}x${H} PNG ${buf.length.toLocaleString()}B（${kb(buf.length)}）（解码 ${mb(W * H * 4)}MB） fnt ${Buffer.byteLength(fntText).toLocaleString()}B  墨迹 ${backInk.toLocaleString()}  帧密度 ${((frameArea / (W * H)) * 100).toFixed(2)}%`);
console.log(`  搬运 ${copiedTexels.toLocaleString()} texel（区域＝帧 ∪ ${ring}px 环带，逐字节＝源）＋透明块 ${blkW}x${blkH}（承载 ${nonKept.length + zeroDecls.length} 条声明）`);
const outBytes = buf.length + Buffer.byteLength(fntText);
console.log(`  省：线上 ${kb(srcPngBytes + srcFntBytes)}KB → ${kb(outBytes)}KB（−${kb(srcPngBytes + srcFntBytes - outBytes)}KB）/ 驻留 ${mb(src.w * src.h * 4)}MB → ${mb(W * H * 4)}MB（−${mb(src.w * src.h * 4 - W * H * 4)}MB）`);
console.log(`  幅面 ${W}x${H} 非 2 的幂对（POT=${isPot(W)}/${isPot(H)}）⇒ 与今日同为"无 mipmap、纯 LINEAR"采样级别`);
console.log(`fnt 改写：${rewritten} 条 <char> 的 x/y + <common> scaleW/scaleH；度量面逐条核为不变`);
console.log(`产物 sha256 png=${sha(buf).slice(0, 32)}… fnt=${sha(Buffer.from(fntText)).slice(0, 32)}…`);

if (DRY) {
  console.log(`（--dry：不落盘）`);
  process.exit(0);
}

if (CHECK) {
  if (!existsSync(OUT_PNG) || !existsSync(OUT_FNT)) throw new Error(`在库产物缺失：先不带 --check 跑一次`);
  mkdirSync(TEMP, { recursive: true });
  writeFileSync(join(TEMP, "font-room.png"), buf);
  writeFileSync(join(TEMP, "font-room.fnt"), fntText);
  const sameP = Buffer.compare(readFileSync(join(TEMP, "font-room.png")), readFileSync(OUT_PNG)) === 0;
  const sameF = Buffer.compare(readFileSync(join(TEMP, "font-room.fnt")), readFileSync(OUT_FNT)) === 0;
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
