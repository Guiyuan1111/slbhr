#!/usr/bin/env node
/**
 * r27 立、r28 扩：官方 font.png 未用字形**原地清零**，按关产两张变体：
 *  - font-roomblank.png：全量 114 字，只有带教学文本的 forest_01 / forest_bonus_1 装载；
 *  - font-roombase.png：基础 27 字（三块面板字面量 + 时钟/结算数字），其余 46 关装载。
 *
 * 与 r24 的 font-room（货架重排）是同一条需求链、相反的像素策略：
 *  - r24 把 114 个保留字形搬到新坐标（幅面 871×1179），像素核相位随源矩形绝对坐标变化，
 *    26px/36px 出现 52～407 px 差（[2026-10-22-r24-room-font-subset.md] §四），判负回退；
 *  - 本件**一个坐标都不改**：保留字形帧矩形照抄官方 x/y，四周 ring(=fnt padding=4) 环带逐字节
 *    从官方图集搬来，其余像素清零。画布幅面、`scaleW/scaleH`、fnt 全部不动 ⇒ 每个字形的源矩形
 *    与滤波邻域逐字节不变，任何字号的采样结果按构造与官方相同（roomtext 六面逐字节验）。
 *
 * 需求集只认 scripts/font-subset/room.mjs（房内教学选中层 + 行钉字面量 + 动态数字点），与
 * 静态网 font-roomblank.test.ts 共用一份口径。清零面之外的失效模式仍是"缺字形画空白"，所以
 * 需求集与房内调用点的对齐由测试独立回算，生成器不重复判断。
 *
 * 用法：
 *   node --import tsx scripts/font-subset/build-font-blank.mjs            # 写在库产物（两张）
 *   node --import tsx scripts/font-subset/build-font-blank.mjs --dry      # 只打印账目
 *   node --import tsx scripts/font-subset/build-font-blank.mjs --check    # 重建并与在库产物比字节
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePngRgba } from "../png-raw.mjs";
import { loadFontAtlas, parseFnt } from "./prephase.mjs";
import { roomBaseChars, roomChars } from "./room.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FONT_DIR = "assets/fonts/chinese";
const SRC_PNG = join(ROOT, FONT_DIR, "font.png");
const SRC_FNT = join(ROOT, FONT_DIR, "font.fnt");

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const DRY = argv.includes("--dry");
const kb = (n) => (n / 1024).toFixed(1);
const sha = (b) => createHash("sha256").update(b).digest("hex");

const fnt = parseFnt(SRC_FNT);
if (new Set(fnt.padding).size !== 1) throw new Error(`fnt padding=${fnt.padding.join(",")} 非各边相等，环带口径要重定`);
const ring = fnt.padding[0];
const src = loadFontAtlas(SRC_PNG, fnt);
const declared = [...fnt.glyphs.values()].filter((g) => g.width > 0 && g.height > 0).length;
const official = readFileSync(SRC_PNG);

/** 同一原地清零口径出一张变体；返回字节与账目，不落盘。 */
function buildVariant(kept, label) {
  const keptGlyphs = kept.map((k) => k.glyph).filter((g) => g.width > 0 && g.height > 0);
  if (keptGlyphs.length === 0) throw new Error(`${label} 字形集为空——声明与 fnt 完全不交，先查文案/关卡`);

  // 保留面＝used 字形帧矩形 ∪ 四周 ring 环带；环带原样保留，哪怕它属于邻帧。
  const keepMask = new Uint8Array(src.w * src.h);
  for (const g of keptGlyphs) {
    const x0 = g.x - ring;
    const y0 = g.y - ring;
    const x1 = g.x + g.width + ring;
    const y1 = g.y + g.height + ring;
    if (x0 < 0 || y0 < 0 || x1 > src.w || y1 > src.h) {
      throw new Error(`字形 ${g.id} 的环带 (${x0},${y0},${x1},${y1}) 越出画布 ${src.w}x${src.h}`);
    }
    for (let y = y0; y < y1; y++) keepMask.fill(1, y * src.w + x0, y * src.w + x1);
  }

  let keptTexels = 0;
  let keptInk = 0;
  let blankedInk = 0;
  const out = Buffer.alloc(src.data.length);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const i = y * src.w + x;
      const di = i * 4;
      if (keepMask[i]) {
        out[di] = src.data[di];
        out[di + 1] = src.data[di + 1];
        out[di + 2] = src.data[di + 2];
        out[di + 3] = src.data[di + 3];
        keptTexels++;
        if (src.data[di + 3] > 0) keptInk++;
      } else if (src.data[di + 3] > 0 || src.data[di] || src.data[di + 1] || src.data[di + 2]) {
        blankedInk++;
      }
    }
  }

  const buf = encodePngRgba(src.w, src.h, out, src.ancillary);
  const back = decodePng(buf, `${label}.png`);
  if (back.w !== src.w || back.h !== src.h) throw new Error(`重解码尺寸 ${back.w}x${back.h} != ${src.w}x${src.h}`);
  if (back.chunks !== src.chunks) throw new Error(`块序变化：${src.chunks} → ${back.chunks}`);
  let keepBad = 0;
  let outsideNonZero = 0;
  for (let i = 0; i < src.w * src.h; i++) {
    const di = i * 4;
    if (keepMask[i]) {
      if (
        back.data[di] !== src.data[di] ||
        back.data[di + 1] !== src.data[di + 1] ||
        back.data[di + 2] !== src.data[di + 2] ||
        back.data[di + 3] !== src.data[di + 3]
      ) keepBad++;
    } else if (back.data[di] || back.data[di + 1] || back.data[di + 2] || back.data[di + 3]) {
      outsideNonZero++;
    }
  }
  if (keepBad) throw new Error(`${label} 保留面有 ${keepBad} px 重解码后与源不符`);
  if (outsideNonZero) throw new Error(`${label} 清零面有 ${outsideNonZero} px 非零`);

  const account = {
    variant: label,
    dims: `${src.w}x${src.h}`,
    used: keptGlyphs.length,
    declared,
    ring,
    keptTexels,
    keptInk,
    blankedInk,
    officialBytes: official.length,
    outBytes: buf.length,
    savedKB: kb(official.length - buf.length),
  };
  console.log(JSON.stringify(account, null, 0));
  console.log(
    `font.png ${kb(official.length)}KB → ${label}.png ${kb(buf.length)}KB（−${account.savedKB}KB，${(
      (100 * buf.length) / official.length
    ).toFixed(1)}%），保留字形 ${account.used}/${account.declared}，环带 ${ring}px`,
  );
  return { buf, account };
}

/** 落盘/校验一张变体；返回 sha256。 */
function emit(name, { buf }) {
  const out = join(ROOT, FONT_DIR, `${name}.png`);
  if (CHECK) {
    const cur = readFileSync(out);
    if (Buffer.compare(cur, buf) !== 0) {
      throw new Error(`在库 ${FONT_DIR}/${name}.png 与重建结果不一致：${sha(cur)} != ${sha(buf)}`);
    }
    console.log(`--check PASS ${name}.png sha256=${sha(buf)}`);
  } else if (DRY) {
    console.log(`dry-run：未落盘 ${name}.png`);
  } else {
    writeFileSync(out, buf);
    console.log(`written ${FONT_DIR}/${name}.png sha256=${sha(buf)}`);
  }
}

const full = await roomChars(ROOT, fnt);
if (full.noGlyph.length) throw new Error(`房内需求有 ${full.noGlyph.length} 个字符在 fnt 里没有字形：${full.noGlyph.join("")}——先补字再清零`);
const base = roomBaseChars(ROOT, fnt);
if (base.noGlyph.length) throw new Error(`基础需求有 ${base.noGlyph.length} 个字符在 fnt 里没有字形：${base.noGlyph.join("")}——先补字再清零`);

emit("font-roomblank", buildVariant(full.kept, "font-roomblank"));
emit("font-roombase", buildVariant(base.kept, "font-roombase"));
