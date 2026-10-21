/**
 * r18 字体两段化防护网（两件一体：子集产物语义 + 代码里 FONT_MAIN/FONT_FULL 的用法）。
 *
 * 为什么需要它：进房前只装 304.5KB 子集（assets/fonts/chinese/font-prephase.png），全量 font.png
 * 改由延迟通道以 font-full 键装载。这条链唯一致命的失效模式是"某处房内文案仍用 FONT_MAIN"——
 * 那个字当场画空白，而冷启动一切正常；反过来"某处进房前文案用了 FONT_FULL"则是白等 1.6MB。
 * 两种错都不出现在报错里，只能靠按调用点分类的静态断言挡住。
 *
 * 口径层与生成器共用 scripts/font-subset/prephase.mjs，测试与产物不可能各算一套字形集。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodePng } from "../../../../scripts/png-raw.mjs";
import {
  auditSubset,
  composeSubset,
  loadFontAtlas,
  loadSpec,
  parseFnt,
  prephaseChars,
} from "../../../../scripts/font-subset/prephase.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

/** 进房前场景（Boot→Menu→Temple→三弹窗→换关黑幕）：位图字一律 FONT_MAIN 子集 */
const PRE_ROOM_FILES = [
  "packages/client/src/scenes/MenuScene.ts",
  "packages/client/src/scenes/menus.ts",
  "packages/client/src/scenes/TempleScene.ts",
  "packages/client/src/scenes/transition.ts",
];
/** 房内场景：位图字一律 FONT_FULL，否则缺字形即画空白 */
const IN_ROOM_FILES = ["packages/client/src/scenes/GameScene.ts", "packages/client/src/scenes/overlays.ts"];
const PRE_ROOM_SITES = 12;
/** 参数化实参的位图字：字形来源由 prephase-chars.json 的调用侧声明交代 */
const PARAMETERISED = [
  "packages/client/src/scenes/menus.ts:52", // text ← toggleRow 实参（menus.ts:62/63 声明）
  "packages/client/src/scenes/menus.ts:85", // line ← lines 数组（menus.ts:81 声明）
  "packages/client/src/scenes/TempleScene.ts:186", // String(lv.id) → dynamic 数字
];
/** 今日 font.fnt 里没有字形的进房前字符：本来就画空白，本轮不改表现 */
const NO_GLYPH_TODAY = ".L乐于你全刻原员喜基复恭战挑效本版置设部音".split("");

/** 剥掉注释（长度不变、换行保留，行号仍可映射）：不剥的话 oracle 逆向注释里的
 *  `bitmapText(k.x, k.y, "font", …)` 会被当成调用点，静态网自缚于注释。 */
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
    // 跳过定义处：`function stoneButton(` 的形参列表也是 6+ 项
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
    .filter((c) => c.parts.length >= 6) // 真实调用至少 6 个实参
    .map((c) => ({ line: c.line, label: c.parts[4] ?? "", opts: c.parts[6] ?? "" }));

/** 实参若是字符串字面量则取值，否则 null（=动态，须由声明交代来源） */
function literal(arg: string): string | null {
  const m = /^(["'])(?:[^"'\\]|\\.)*\1$|`(?:[^`\\]|\\.)*`$/.exec(arg);
  if (!m) return null;
  const body = arg.slice(1, -1);
  return body.includes("${") ? null : body;
}

const fnt = parseFnt(path.join(ROOT, "assets/fonts/chinese/font.fnt"));
const fontSrc = loadFontAtlas(path.join(ROOT, "assets/fonts/chinese/font.png"), fnt);
const spec = loadSpec(ROOT);
const { kept, noGlyph, chars } = prephaseChars(spec, fnt);
const subsetPath = path.join(ROOT, "assets/fonts/chinese/font-prephase.png");
const subsetOfCode = () => composeSubset(fontSrc, fnt, kept, spec._ring);
const committedSubset = () => decodePng(readFileSync(subsetPath), subsetPath);

describe("r18 字体两段化：子集产物语义", () => {
  it("子集与源同尺寸、同块序（改页/改色彩解释块=appearance 生成改变，须走三步流程）", () => {
    const committed = committedSubset();
    expect([committed.w, committed.h]).toEqual([fontSrc.w, fontSrc.h]);
    expect(committed.chunks).toBe(fontSrc.chunks);
  });

  it("在库子集逐字节等于由声明推出的合成结果（改文案不重建、手改产物 → 红）", () => {
    expect(Buffer.compare(subsetOfCode().out, committedSubset().data)).toBe(0);
  });

  it("保留字形帧矩形逐行字节等于源，且非授权区 RGBA 全 0", () => {
    const expected = subsetOfCode();
    const audit = auditSubset(fontSrc, { ...expected, out: committedSubset().data }, fnt, kept);
    expect(audit.outsideNonZero).toBe(0);
    expect(audit.inkFrame).toBeGreaterThan(0);
    expect(audit.framePixels).toBe(266074); // 53 个保留字形的帧像素总量，改文案会动它
  });

  it("进房前文案的字形全部保留；无字形者今日即空白（本轮不改表现）", () => {
    expect(kept.length).toBe(53);
    for (const k of kept) expect(k.glyph.width).toBeGreaterThanOrEqual(0);
    expect([...noGlyph.map((n) => n.ch)].sort()).toEqual([...NO_GLYPH_TODAY].sort());
  });

  it("声明的每一处文案都进入字符集", () => {
    for (const s of spec.sources) {
      for (const t of s.texts) for (const ch of t) expect(chars.has(ch), `${s.file}:${s.line} 的 ${ch}`).toBe(true);
    }
    for (const d of spec.dynamic) for (const ch of d.chars) expect(chars.has(ch), `${d.file}:${d.line} 的 ${ch}`).toBe(true);
  });
});

describe("r18 字体两段化：调用点分类", () => {
  it("进房前四个文件的位图字全部用 FONT_MAIN，字面量字符都在子集内", () => {
    let sites = 0;
    for (const file of PRE_ROOM_FILES) {
      for (const call of bitmapTextCalls(file)) {
        sites++;
        expect(call.parts[2], `${file}:${call.line} 应使用 FONT_MAIN，实为 ${call.raw}`).toBe("FONT_MAIN");
        const text = literal(call.parts[3] ?? "");
        if (text === null) continue;
        for (const ch of text) expect(chars.has(ch), `${file}:${call.line} 的字符 ${ch} 不在子集声明内`).toBe(true);
      }
    }
    expect(sites).toBe(PRE_ROOM_SITES);
  });

  it("进房前位图字的参数化实参只能是已声明的那三处", () => {
    const found: string[] = [];
    for (const file of PRE_ROOM_FILES) {
      for (const call of bitmapTextCalls(file)) {
        if (literal(call.parts[3] ?? "") === null) found.push(`${file}:${call.line}`);
      }
    }
    expect(found.sort()).toEqual([...PARAMETERISED].sort());
  });

  it("房内两个文件的位图字全部用 FONT_FULL（唯一例外是 stoneButton 内部的 opts?.fontKey 缺省）", () => {
    let sites = 0;
    for (const file of IN_ROOM_FILES) {
      for (const call of bitmapTextCalls(file)) {
        sites++;
        const viaButtonHelper = call.parts[2]?.includes("opts?.fontKey") ?? false;
        expect(
          viaButtonHelper || call.parts[2] === "FONT_FULL",
          `${file}:${call.line} 用了 ${call.raw}——房内文案必须显式 FONT_FULL`,
        ).toBe(true);
      }
    }
    expect(sites).toBe(6); // GameScene 2 + overlays 4（stoneButton 内 1、暫停、时限、游戏结束）
  });

  it("stoneButton 调用：房内六处显式 FONT_FULL，进房前三处用缺省子集且 label 在子集内", () => {
    const inRoom = stoneButtonCalls("packages/client/src/scenes/overlays.ts");
    expect(inRoom.length).toBe(6);
    for (const c of inRoom) {
      expect(c.opts.includes("fontKey: FONT_FULL"), `overlays.ts:${c.line} 的 opts=${c.opts || "（无）"} 未声明 FONT_FULL`).toBe(true);
    }
    const preRoom = stoneButtonCalls("packages/client/src/scenes/menus.ts");
    expect(preRoom.length).toBe(3);
    for (const c of preRoom) {
      expect(c.opts, `menus.ts:${c.line} 进房前弹窗应走缺省子集`).toBe("");
      const text = literal(c.label);
      expect(text, `menus.ts:${c.line} 的 label 应为字面量`).not.toBeNull();
      for (const ch of text!) expect(chars.has(ch), `menus.ts:${c.line} 的 ${ch} 不在子集内`).toBe(true);
    }
  });

  it("Boot 关键路径只装子集，1.6MB 全量字体只出现在延迟装载函数里", () => {
    const boot = SRC("packages/client/src/scenes/BootScene.ts");
    expect(boot.includes('this.load.bitmapFont(FONT_MAIN, "/assets/fonts/chinese/font-prephase.png"')).toBe(true);
    expect(boot.includes('load.bitmapFont(FONT_FULL, "/assets/fonts/chinese/font.png"')).toBe(true);
    const warmFn = boot.indexOf("export function loadGameAtlases");
    const fullLoad = boot.indexOf("load.bitmapFont(FONT_FULL");
    expect(fullLoad).toBeGreaterThan(warmFn); // 全量字体在延迟通道函数体内
    const preload = boot.slice(boot.indexOf("preload(): void"), boot.indexOf("create(): void"));
    expect(preload.includes("font.png")).toBe(false); // Boot 段再无那次 1.6MB 下载
    expect(preload.includes("font-prephase.png")).toBe(true);
  });
});
