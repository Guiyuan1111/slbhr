#!/usr/bin/env node
/**
 * 生成进房前字体子集 assets/fonts/chinese/font-prephase.png。
 * 声明源：scripts/font-subset/prephase-chars.json；共用口径层：scripts/font-subset/prephase.mjs。
 *
 * 做法：解开源 font.png 的原始 RGBA 样本（scripts/png-raw.mjs，不经任何色彩管理），
 * 按 scripts/font-subset/prephase-chars.json 声明的"进房前会渲染的文案"保留对应字形帧矩形
 * （外加 fnt 声明的 packing padding 环带），其余像素 RGBA 全清零，再用与源同样的辅助块重编码。
 * 尺寸、页序、帧矩形、fnt 一律不变——所以 Phaser 侧只有"画得出不画得出"的差别，没有错位可能。
 *
 * 用法：
 *   node scripts/font-subset/build-font-prephase.mjs            # 写出 assets/fonts/chinese/font-prephase.png
 *   node scripts/font-subset/build-font-prephase.mjs --check    # 只重建到 TEMP，与在库产物比字节（复现性门禁）
 *   node scripts/font-subset/build-font-prephase.mjs --ring 0   # 探量用：临时改环宽，不写在库产物
 *
 * r19 换代说明：在库 font-prephase.png 已由"重排版"拥有（scripts/font-subset/reflow-prephase.mjs
 * 同时写 png＋配对的 font-prephase.fnt）。本脚本再写/再 --check 会被 guardReflowGeneration 挡下——
 * 因为"帧坐标不变"的那一代图与重排坐标的 fnt 是两种布局，混用只会画出位置全错、却不报错的鬼影。
 * 口径层 composeSubset 仍由本脚本定义，重排版直接从它复现上一代做账。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePngRgba } from "../png-raw.mjs";
import { auditSubset, composeSubset, inkOf, loadFontAtlas, loadSpec, parseFnt, prephaseChars } from "./prephase.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_PNG = join(ROOT, "assets/fonts/chinese/font.png");
const SRC_FNT = join(ROOT, "assets/fonts/chinese/font.fnt");
const OUT = join(ROOT, "assets/fonts/chinese/font-prephase.png");
const TEMP = join(ROOT, "TEMP/font-prephase");

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const ringArg = argv.indexOf("--ring");
const ringOverride = ringArg >= 0 ? Number(argv[ringArg + 1]) : null;
if (ringOverride !== null && !Number.isInteger(ringOverride)) throw new Error("--ring 需整数");

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
const sha = (b) => createHash("sha256").update(b).digest("hex");

const fnt = parseFnt(SRC_FNT);
const spec = loadSpec(ROOT);
const ring = ringOverride ?? spec._ring;
const src = loadFontAtlas(SRC_PNG, fnt);

// padding 断言：环宽必须等于 fnt 声明的 packing padding，否则"保留padding环"这句解释就不成立
const pad = fnt.padding;
if (new Set(pad).size !== 1) throw new Error(`fnt padding=${pad.join(",")} 非各边相等，环宽口径要重定`);
if (ring !== pad[0] && ringOverride === null) throw new Error(`声明环宽 ${ring} != fnt padding ${pad[0]}`);

const { chars: charSet, kept, noGlyph } = prephaseChars(spec, fnt);
const charTotal = charSet.size;
if (kept.length === 0) throw new Error("字形集为空——声明与 fnt 完全不交，先查文案");
const subset = composeSubset(src, fnt, kept, ring);
const audit = auditSubset(src, subset, fnt, kept);

const problems = [];
if (subset.overlaps > 0) problems.push(`fnt 声明帧矩形互相重叠 ${subset.overlaps} 像素`);
if (audit.outsideNonZero > 0) problems.push(`非授权区残留 ${audit.outsideNonZero} 个非零像素`);

if (problems.length) throw new Error(`子集断言失败：\n - ${problems.join("\n - ")}`);

const buf = encodePngRgba(src.w, src.h, subset.out, src.ancillary);
const back = decodePng(buf, "font-prephase.png");
if (back.chunks !== src.chunks) throw new Error(`块序变化：${src.chunks} → ${back.chunks}`);
if (Buffer.compare(back.data, subset.out) !== 0) throw new Error("重解码样本与合成样本不一致（编码有损）");

const srcInk = inkOf(src);
const srcBytes = readFileSync(SRC_PNG).length;

// 输出清单
console.log(`源  ${SRC_PNG.slice(ROOT.length + 1)}  ${src.w}x${src.h}  ${srcBytes.toLocaleString()}B (${kb(srcBytes)})  墨迹 ${srcInk.toLocaleString()} 像素`);
console.log(`fnt scaleW/scaleH=${fnt.scaleW}/${fnt.scaleH} pages=${fnt.pages} padding=${pad.join(",")} size=${fnt.size} <char> ${fnt.charLines} 行→生效字形 ${fnt.glyphs.size} 条${fnt.dupes.length ? `（重复 id: ${fnt.dupes.map((d) => d.id).join(",")}）` : ""}`);
console.log(`进房前文案字符 ${charTotal} 个（其中 ${kept.length} 个有字形）`);
console.log(`保留字形 ${kept.length} 个（帧像素 ${audit.framePixels.toLocaleString()}，授权像素 ${audit.keptPixels.toLocaleString()}=${((audit.keptPixels / audit.pixels) * 100).toFixed(1)}%）`);
console.log(`墨迹 保留帧内 ${audit.inkFrame.toLocaleString()} + 环带 ${audit.inkRingOnly.toLocaleString()} = ${audit.inkTotal.toLocaleString()} / ${srcInk.toLocaleString()}（清零掉 ${(srcInk - audit.inkTotal).toLocaleString()}）`);
console.log(`  其中环带墨迹有 ${audit.ringInkInOtherFrames.toLocaleString()} 个像素属未保留字形的帧矩形（滤波邻域保留，非保留字本身无从被进房前文案画出）`);
console.log(`无字形文案 ${noGlyph.length} 个：${noGlyph.map((n) => n.ch).join("")}（今日即渲染空白，行为不变）`);
console.log(`产物 ${buf.length.toLocaleString()}B (${kb(buf.length)})  相对源 ${buf.length - srcBytes >= 0 ? "+" : ""}${kb(buf.length - srcBytes)}  sha256 ${sha(buf).slice(0, 32)}…`);
if (ringOverride !== null) console.log(`（--ring ${ring} 探量模式：不写在库产物）`);

if (CHECK) {
  guardReflowGeneration();
  if (!existsSync(OUT)) throw new Error(`在库产物缺失：${OUT}`);
  mkdirSync(TEMP, { recursive: true });
  const probe = join(TEMP, "font-prephase.png");
  writeFileSync(probe, buf);
  const same = Buffer.compare(readFileSync(probe), readFileSync(OUT)) === 0;
  console.log(`可复现性：${same ? "字节一致 ✓" : "字节不一致 ✗"}`);
  writeFileSync(join(TEMP, "report.json"), JSON.stringify({ ring, kept: kept.length, srcBytes, outBytes: buf.length, sha: sha(buf), audit, srcInk }, null, 2));
  if (!same) process.exit(1);
} else if (ringOverride === null) {
  guardReflowGeneration();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, buf);
  console.log(`已写出 ${OUT.slice(ROOT.length + 1)}`);
}

/** 换代保护：r19 起在库 png 由 reflow-prephase.mjs 拥有（png 与 fnt 成对，坐标是重排后的）。
 *  本脚本单独重写 png＝用旧坐标的图去配新坐标的 fnt——字形都在但各画各的位置，且冷启动不会报错。 */
function guardReflowGeneration() {
  const pair = join(ROOT, "assets/fonts/chinese", "font-prephase.fnt");
  if (!existsSync(pair)) return;
  throw new Error(
    `在库 ${relative(ROOT, OUT)} 属 r19 重排代（同目录有配对的 font-prephase.fnt），本脚本只产上一代的"原坐标＋清零"图：` +
      `写下去就是旧布局的 png 配新坐标的 fnt。重建请跑 node scripts/font-subset/reflow-prephase.mjs（同时写 png+fnt）；` +
      `要探量本脚本口径请带 --ring 0 之类的探量参数（探量模式不碰在库产物）。`,
  );
}
