/**
 * 房内字体子集链的静态防护网（r24 件1a）。与 font-prephase.test.ts 同形状，但守的是**房内**这条链：
 * 需求源来自 scripts/font-subset/room.mjs（关卡教学文本选中层 + 行钉字面量 + 动态数字点），
 * 产物是 assets/fonts/chinese/font-room.png + font-room.fnt。致命失效模式与前代一致：
 *  1. 某处房内 FONT_FULL 文案的字不在集合内 ⇒ 换装载后那个字当场画空白；
 *  2. 教学层选取规则或某关文案改动 ⇒ 需求集变了但产物没跟着重建；
 *  3. png 与 fnt 是**一对**必须同时重建的产物 ⇒ 只重建一边就"字还在、位置错"的鬼影。
 * 期望值全部由「官方 font.png/font.fnt 的字节与坐标」＋「产物 font-room.fnt 声明的新坐标」独立回算，
 * 故意不调用生成器 build-font-room.mjs 的装配代码——生成器若口径出错，这里仍能独立发现。
 * 解析一律走 room.mjs / prephase.mjs 的导出，绝不在此重复实现字形集/关卡/fnt 解析。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { decodePng } from "../../../../scripts/png-raw.mjs";
import { loadFontAtlas, loadSpec, parseFnt } from "../../../../scripts/font-subset/prephase.mjs";
import {
  ROOM_DYNAMIC_SITES,
  ROOM_LITERAL_SITES,
  assertRoomPins,
  diskLevelPaths,
  roomChars,
  roomLevelTexts,
} from "../../../../scripts/font-subset/room.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

/** 房内文件：位图字一律 FONT_FULL（GameScene + 三块面板 overlays） */
const IN_ROOM_FILES = ["packages/client/src/scenes/GameScene.ts", "packages/client/src/scenes/overlays.ts"];
/** 房内参数化实参的位图字：字形来源由 room.mjs 的 sites / 关卡教学文本交代 */
const PARAMETERISED = [
  "packages/client/src/scenes/GameScene.ts:1472", // t.text ← 关卡教学文本（roomLevelTexts）
  "packages/client/src/scenes/overlays.ts:300", // limitStr ← ROOM_DYNAMIC_SITES 结算板时限
];
/** 今日有教学文本、会进房内位图字的关卡（其余 46 关无教学层）：新增/改文案这里要红 */
const TUT_LEVELS = [
  { id: 1, filename: "tutorials/levels/forest_01.json", selectedLayer: "Tutorial_keyboard" },
  { id: 64, filename: "forest/levels/forest_bonus_1.json", selectedLayer: "Tutorial_keyboard" },
];

/** 剥掉注释（长度不变、换行保留，行号仍可映射）：不剥的话注释里的示例调用点会被当成真调用。 */
function stripComments(src: string): string {
  const out = src.split("");
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (out[i] !== "\n") out[i] = " ";
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      let j = i;
      while (j < src.length && src[j] !== "\n") j++;
      blank(i, j);
      i = j;
    } else if (c === "/" && n === "*") {
      const j = src.indexOf("*/", i + 2);
      const end = j < 0 ? src.length : j + 2;
      blank(i, end);
      i = end;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && (src[j] !== c || src[j - 1] === "\\")) j++;
      i = j + 1;
    } else i++;
  }
  return out.join("");
}

/** 从 `(` 之后做括号配平，取出实参串并按顶层逗号切分 */
function callArgs(src: string, openParen: number): { raw: string; parts: string[] } {
  let depth = 0;
  let i = openParen;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const raw = src.slice(openParen + 1, i);
  const parts: string[] = [];
  let d = 0;
  let cur = "";
  for (const c of raw) {
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") d--;
    if (c === "," && d === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  parts.push(cur.trim());
  return { raw, parts };
}

function callsOf(src: string, name: string) {
  const re = new RegExp(`\\.${name}\\(|[\\s,(]${name}\\(`, "g");
  const out: { line: number; parts: string[]; raw: string }[] = [];
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    if (/function\s*$/.test(src.slice(Math.max(0, m.index - 24), m.index))) continue;
    const openParen = m.index + m[0].length - 1;
    const { raw, parts } = callArgs(src, openParen);
    out.push({ line: src.slice(0, m.index).split("\n").length, parts, raw: raw.replace(/\s+/g, " ") });
  }
  return out;
}

const bitmapTextCalls = (file: string) => callsOf(stripComments(SRC(file)), "bitmapText");
const stoneButtonCalls = (file: string) =>
  callsOf(stripComments(SRC(file)), "stoneButton")
    .filter((c) => c.parts.length >= 6)
    .map((c) => ({ line: c.line, label: c.parts[4] ?? "", opts: c.parts[6] ?? "" }));

/** 实参若是字符串字面量则取值，否则 null（=动态，须由声明交代来源） */
function literal(arg: string): string | null {
  const m = /^(["'])(?:[^"'\\]|\\.)*\1$|`(?:[^`\\]|\\.)*`$/.exec(arg);
  if (!m) return null;
  const body = arg.slice(1, -1);
  return body.includes("${") ? null : body;
}

/** 取一张原始 RGBA 图上的矩形字节（逐行拷贝，越界即抛） */
function region(img: { w: number; h: number; data: Buffer }, x: number, y: number, w: number, h: number): Buffer {
  if (x < 0 || y < 0 || x + w > img.w || y + h > img.h) throw new Error(`矩形 (${x},${y},${w}x${h}) 越出 ${img.w}x${img.h}`);
  const out = Buffer.alloc(w * h * 4);
  for (let r = 0; r < h; r++) img.data.copy(out, r * w * 4, ((y + r) * img.w + x) * 4, ((y + r) * img.w + x + w) * 4);
  return out;
}

const isPot = (n: number) => n > 0 && Number.isInteger(Math.log2(n));

const fnt = parseFnt(path.join(ROOT, "assets/fonts/chinese/font.fnt"));
const fontSrc = loadFontAtlas(path.join(ROOT, "assets/fonts/chinese/font.png"), fnt);
const spec = loadSpec(ROOT);
const ring = spec._ring;
const roomFntPath = path.join(ROOT, "assets/fonts/chinese/font-room.fnt");
const roomPngPath = path.join(ROOT, "assets/fonts/chinese/font-room.png");
/** loadFontAtlas 顺带钉住"png 尺寸 == fnt scaleW/scaleH" */
const roomFnt = parseFnt(roomFntPath);
const roomPng = loadFontAtlas(roomPngPath, roomFnt);

/** 需求集合/关卡文本要解析 TS，走 room.mjs 的动态 import；memo 化避免每个用例重算 */
let _room: ReturnType<typeof roomChars> | undefined;
const room = () => (_room ??= roomChars(ROOT, fnt));
let _levels: ReturnType<typeof roomLevelTexts> | undefined;
const levels = () => (_levels ??= roomLevelTexts(ROOT));

/** 48 关 parseLevel ＋两张 2191×1024 图集解码会超过 vitest 默认 5s，这里预热一次共用 memo。 */
const TT = 180000;
beforeAll(async () => {
  await room();
  await levels();
}, TT);

describe("房内需求集合与行钉", () => {
  it("行钉不漂移：所有字面量/动态点的字符都在房内集合内", async () => {
    assertRoomPins(ROOT); // 文案/行号一改就抛
    const { chars } = await room();
    for (const s of ROOM_LITERAL_SITES) {
      for (const t of s.texts) for (const ch of t) expect(chars.has(ch), `${s.file}:${s.line} 的 ${ch}`).toBe(true);
    }
    for (const d of ROOM_DYNAMIC_SITES) {
      for (const ch of d.chars) expect(chars.has(ch), `${d.file}:${d.line} 的 ${ch}`).toBe(true);
    }
  }, TT);

  it("房内需求恰为 114 字符、全部有帧（今日无漏字）", async () => {
    const { chars, kept, noGlyph } = await room();
    expect(chars.size).toBe(114);
    expect(kept.length).toBe(114);
    expect(noGlyph).toEqual([]);
    expect([...kept].every((k) => k.code === k.glyph.id && k.glyph.width > 0 && k.glyph.height > 0)).toBe(true);
    // kept 必须按 code 升序（生成器与集合口径都依赖这个序）
    const codes = kept.map((k) => k.code);
    expect(codes).toEqual([...codes].sort((a, b) => a - b));
  }, TT);

  it("关卡磁盘集合 == temple.json 列表（按关出图/漏字检测的地基）", async () => {
    const ls = await levels();
    expect(ls.length).toBe(48);
    const listed = new Set(ls.map((l) => l.filename));
    const disk = diskLevelPaths(ROOT);
    expect([...listed].sort()).toEqual([...disk].sort());
    expect(listed.size).toBe(disk.size);
  }, TT);

  it("48 关教学文本（选中层）每字符在集合内；选取规则钉住", async () => {
    const { chars } = await room();
    const withText = (await levels()).filter((l) => l.texts.length > 0);
    expect(withText.map((l) => ({ id: l.id, filename: l.filename, selectedLayer: l.selectedLayer }))).toEqual(TUT_LEVELS);
    for (const l of withText) {
      for (const t of l.texts) for (const ch of t) expect(chars.has(ch), `关卡 ${l.id} 的 ${ch} 不在房内集合`).toBe(true);
    }
    // 其余 46 关确无教学层文本（一旦某关新增 Tutorial_ 层却没进上面名单，这里红）
    const noText = (await levels()).filter((l) => l.texts.length === 0);
    expect(noText.length).toBe(46);
  }, TT);
});

describe("房内 FONT_FULL 调用点分类", () => {
  it("房内位图字只有 FONT_FULL 与 stoneButton 内部缺省两类；FONT_FULL 字面量字符都在集合内", async () => {
    const { chars } = await room();
    const parameterised: string[] = [];
    let fullSites = 0;
    let internalDefaults = 0;
    for (const file of IN_ROOM_FILES) {
      for (const call of bitmapTextCalls(file)) {
        const key = call.parts[2] ?? "";
        if (key.includes("opts?.fontKey")) {
          internalDefaults++; // overlays.ts:131 stoneButton 内部缺省，字体由调用方 opts.fontKey 决定
          continue;
        }
        expect(key, `${file}:${call.line} 用了 ${call.raw}——房内文案必须显式 FONT_FULL`).toBe("FONT_FULL");
        fullSites++;
        const text = literal(call.parts[3] ?? "");
        if (text === null) {
          parameterised.push(`${file}:${call.line}`);
          continue;
        }
        for (const ch of text) expect(chars.has(ch), `${file}:${call.line} 的 ${ch} 不在房内集合`).toBe(true);
      }
    }
    expect(internalDefaults).toBe(1); // 只此一处 stoneButton 内部
    expect(fullSites).toBe(5); // 1472 t.text / 1572 "00:00" / 186 暫停 / 300 limitStr / 356 游戏结束
    // 参数化点只能是被 sites/关卡文本交代的那两处
    expect(parameterised.sort()).toEqual([...PARAMETERISED].sort());
  }, TT);

  it("stoneButton 房内六处显式 FONT_FULL，且 label 字面量字符都在集合内", async () => {
    const { chars } = await room();
    const inRoom = stoneButtonCalls("packages/client/src/scenes/overlays.ts");
    expect(inRoom.length).toBe(6);
    for (const c of inRoom) {
      expect(c.opts.includes("fontKey: FONT_FULL"), `overlays.ts:${c.line} 的 opts=${c.opts || "（无）"} 未声明 FONT_FULL`).toBe(true);
      const text = literal(c.label);
      expect(text, `overlays.ts:${c.line} 的 label 应为字面量`).not.toBeNull();
      for (const ch of text!) expect(chars.has(ch), `overlays.ts:${c.line} 的 ${ch} 不在房内集合`).toBe(true);
    }
  }, TT);
});

describe("在库产物 font-room 的语义（png 与 fnt 必须同代）", () => {
  it("每个保留字形的区域（帧 ∪ 环带）逐字节等于源图原坐标处字节", async () => {
    const { kept } = await room();
    for (const k of kept) {
      const old = k.glyph;
      if (old.width === 0 || old.height === 0) continue;
      const now = roomFnt.glyphs.get(old.id)!;
      const box = { w: old.width + 2 * ring, h: old.height + 2 * ring };
      expect(region(roomPng, now.x - ring, now.y - ring, box.w, box.h), `字形 ${k.ch} 区域字节 != 源`).toEqual(
        region(fontSrc, old.x - ring, old.y - ring, box.w, box.h),
      );
    }
    expect(kept.filter((k) => k.glyph.width > 0 && k.glyph.height > 0).length).toBe(114);
  }, TT);

  it("用产物 fnt 的新坐标回算：每个字形帧矩形都落在画布内（防只重建一边的鬼影）", async () => {
    const { kept } = await room();
    const keptCodes = new Set(kept.map((k) => k.code));
    for (const k of kept) {
      const old = k.glyph;
      if (old.width === 0 || old.height === 0) continue;
      const now = roomFnt.glyphs.get(old.id)!;
      // 帧矩形与其 ring 授权区都必须整体在新画布内（与生成器同口径）
      expect(now.x - ring, `字形 ${k.ch} 帧左超出`).toBeGreaterThanOrEqual(0);
      expect(now.y - ring, `字形 ${k.ch} 帧上超出`).toBeGreaterThanOrEqual(0);
      expect(now.x + now.width + ring, `字形 ${k.ch} 帧右超出`).toBeLessThanOrEqual(roomPng.w);
      expect(now.y + now.height + ring, `字形 ${k.ch} 帧下超出`).toBeLessThanOrEqual(roomPng.h);
      // 且新坐标回算的帧字节 = 源帧字节（不只是区域一致）
      expect(region(roomPng, now.x, now.y, now.width, now.height), `字形 ${k.ch} 帧矩形 != 源`).toEqual(
        region(fontSrc, old.x, old.y, old.width, old.height),
      );
    }
    // 未保留声明（含 0×0）指向全零区：帧矩形整块必须全零
    for (const g of fnt.glyphs.values()) {
      if (keptCodes.has(g.id)) continue;
      if (g.width === 0 || g.height === 0) continue;
      const now = roomFnt.glyphs.get(g.id)!;
      expect([...region(roomPng, now.x, now.y, now.width, now.height)].every((b) => b === 0), `未保留字形 ${g.id} 矩形里有非零字节`).toBe(true);
    }
  }, TT);

  it("非零像素只可能来自保留区域；幅面缩小且非 2 的幂对", async () => {
    const { kept } = await room();
    const keptCodes = new Set(kept.map((k) => k.code));
    const mask = new Uint8Array(roomPng.w * roomPng.h);
    for (const g of roomFnt.glyphs.values()) {
      if (g.width === 0 || g.height === 0) continue;
      if (!keptCodes.has(g.id)) continue;
      for (let r = -ring; r < g.height + ring; r++) {
        for (let c = -ring; c < g.width + ring; c++) mask[(g.y + r) * roomPng.w + (g.x + c)] = 1;
      }
    }
    let stray = 0;
    for (let i = 0; i < roomPng.w * roomPng.h; i++) {
      const o = i * 4;
      if ((roomPng.data[o] | roomPng.data[o + 1] | roomPng.data[o + 2] | roomPng.data[o + 3]) && !mask[i]) stray++;
    }
    expect(stray, "区域外有残留非零像素（采样会读到计划外邻居）").toBe(0);
    expect(roomPng.chunks).toBe(fontSrc.chunks);
    expect(roomPng.w).toBeLessThan(fontSrc.w);
    // 房内并集比房前子集大 ⇒ 换坐标后**宽度**缩、**高度**反而长过源，但面积（驻留）仍显著下降
    expect(roomPng.w * roomPng.h).toBeLessThan((fontSrc.w * fontSrc.h) / 2);
    expect(isPot(roomPng.w) && isPot(roomPng.h)).toBe(false);
    // 幅面/墨迹按件0 口径钉死：改动需求集会让这里红（与生成器账目同数字）
    expect(`${roomPng.w}x${roomPng.h}`).toBe("871x1179");
    const framePixels = kept.reduce((s, k) => s + k.glyph.width * k.glyph.height, 0);
    expect(framePixels).toBeGreaterThan(0);
  }, TT);

  it("font-room.fnt 与官方 font.fnt 的 <char> 条数相等、除 x/y 外逐属性相等", () => {
    expect(roomFnt.charLines).toBe(fnt.charLines);
    expect(roomFnt.dupes.length).toBe(fnt.dupes.length);
    expect(roomFnt.size).toBe(fnt.size);
    expect(roomFnt.lineHeight).toBe(fnt.lineHeight);
    expect(roomFnt.base).toBe(fnt.base);
    expect(roomFnt.pages).toBe(fnt.pages);
    expect(roomFnt.padding.join(",")).toBe(fnt.padding.join(","));
    expect(roomFnt.scaleW).toBe(roomPng.w);
    expect(roomFnt.scaleH).toBe(roomPng.h);
    expect([...roomFnt.glyphs.keys()].sort()).toEqual([...fnt.glyphs.keys()].sort());
    let moved = 0;
    for (const [code, g] of fnt.glyphs) {
      const n = roomFnt.glyphs.get(code)!;
      expect([n.width, n.height, n.xoffset, n.yoffset, n.xadvance, n.id], `字形 ${code} 度量被改动`).toEqual([g.width, g.height, g.xoffset, g.yoffset, g.xadvance, g.id]);
      if (n.x !== g.x || n.y !== g.y) moved++;
    }
    // 至少保留字形都换了坐标（否则等于没重排）
    expect(moved).toBeGreaterThanOrEqual(114);
  }, TT);
});
