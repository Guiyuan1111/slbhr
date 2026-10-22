/**
 * 进房前字体链的静态防护网（r18 两段化 + r19 图集重排，两件一体：产物语义 + 代码里 FONT_MAIN/FONT_FULL 的用法）。
 *
 * 为什么需要它：进房前只装子集图集（r18 件1 生成、r19 件1 重排：assets/fonts/chinese/font-prephase.png
 * ＋同目录 font-prephase.fnt），房内字体改由延迟通道按关装两把变体（r28）：
 * 教学两关 font-full 777KB / 其余 46 关 font-room 209.8KB。这条链致命的失效模式有三类：
 *  1. 某处房内文案仍用 FONT_MAIN ⇒ 那个字当场画空白，而冷启动一切正常；
 *  2. 某处进房前文案用了房内变体 ⇒ 白等 209.8～777KB 的房内字体；
 *  3.（r19 新增）png 与 fnt 是**一对**必须同时重建的产物 ⇒ 只重建一边就会把字形搬到错位置，
 *     画出来是"字还在、位置错"的鬼影，比空白更难发现。
 * 三种错都不出现在报错里，只能靠按调用点分类＋逐像素回算的静态断言挡住。
 *
 * 口径层与生成器共用 scripts/font-subset/prephase.mjs，测试与产物不可能各算一套字形集。
 * 但对重排版产物，本测试**故意不调用**生成器 scripts/font-subset/reflow-prephase.mjs 的任何装配代码：
 * 期望值全部由「官方 font.png/font.fnt 的字节与坐标」＋「fnt 声明的新坐标」独立回算，
 * 这样生成器自己的断言若有口径错误，这里仍会独立发现。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodePng } from "../../../../scripts/png-raw.mjs";
import {
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
/** 房内场景：位图字按本关变体取键（r28），否则缺字形即画空白 */
const IN_ROOM_FILES = ["packages/client/src/scenes/GameScene.ts", "packages/client/src/scenes/overlays.ts"];
const PRE_ROOM_SITES = 12;
/** 参数化实参的位图字：字形来源由 prephase-chars.json 的调用侧声明交代 */
const PARAMETERISED = [
  "packages/client/src/scenes/menus.ts:53", // text ← toggleRow 实参（menus.ts:63/64 声明）
  "packages/client/src/scenes/menus.ts:86", // line ← lines 数组（menus.ts:82 声明）
  "packages/client/src/scenes/TempleScene.ts:188", // String(lv.id) → dynamic 数字
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

/** 场景类体切分：`export class X extends Phaser.Scene` 起，到下一个同形声明止。
 *  只做粗切（不去尾括号），因为断言只关心类体内有没有某个标记。 */
function sceneClassBodies(src: string): { name: string; body: string }[] {
  const re = /^export class (\w+) extends Phaser\.Scene\b/gm;
  const marks: { name: string; start: number }[] = [];
  for (let m = re.exec(src); m !== null; m = re.exec(src)) marks.push({ name: m[1], start: m.index });
  return marks.map((mk, i) => ({
    name: mk.name,
    body: src.slice(mk.start, i + 1 < marks.length ? marks[i + 1].start : src.length),
  }));
}

const fnt = parseFnt(path.join(ROOT, "assets/fonts/chinese/font.fnt"));
const fontSrc = loadFontAtlas(path.join(ROOT, "assets/fonts/chinese/font.png"), fnt);
const spec = loadSpec(ROOT);
const { kept, noGlyph, chars } = prephaseChars(spec, fnt);
const subsetPath = path.join(ROOT, "assets/fonts/chinese/font-prephase.png");
const preFntPath = path.join(ROOT, "assets/fonts/chinese/font-prephase.fnt");
/** 重排后的子集声明（新坐标）；loadFontAtlas 顺带钉住"png 尺寸 == fnt scaleW/scaleH" */
const preFnt = parseFnt(preFntPath);
const prePng = loadFontAtlas(subsetPath, preFnt);
const ring = spec._ring;

/** 取一张原始 RGBA 图上的矩形字节（逐行拷贝，越界即抛） */
function region(img: { w: number; h: number; data: Buffer }, x: number, y: number, w: number, h: number): Buffer {
  if (x < 0 || y < 0 || x + w > img.w || y + h > img.h) {
    throw new Error(`矩形 (${x},${y},${w}x${h}) 越出 ${img.w}x${img.h}`);
  }
  const out = Buffer.alloc(w * h * 4);
  for (let r = 0; r < h; r++) img.data.copy(out, r * w * 4, ((y + r) * img.w + x) * 4, ((y + r) * img.w + x + w) * 4);
  return out;
}

const isPot = (n: number) => n > 0 && Number.isInteger(Math.log2(n));

describe("进房前子集产物语义（r19 重排版）", () => {
  it("重排只动坐标：逐条字形 width/height/xoffset/yoffset/xadvance 与官方 fnt 全等", () => {
    expect(preFnt.charLines).toBe(fnt.charLines); // 261 条 <char>（含 id=32 重复）
    expect(preFnt.dupes.length).toBe(fnt.dupes.length);
    expect(preFnt.size).toBe(fnt.size);
    expect(preFnt.lineHeight).toBe(fnt.lineHeight);
    expect(preFnt.base).toBe(fnt.base);
    expect(preFnt.pages).toBe(fnt.pages);
    expect(preFnt.padding.join(",")).toBe(fnt.padding.join(","));
    expect([...preFnt.glyphs.keys()].sort()).toEqual([...fnt.glyphs.keys()].sort());
    for (const [code, g] of fnt.glyphs) {
      const n = preFnt.glyphs.get(code)!;
      expect([n.width, n.height, n.xoffset, n.yoffset, n.xadvance, n.id], `字形 ${code} 度量被改动`).toEqual([g.width, g.height, g.xoffset, g.yoffset, g.xadvance, g.id]);
    }
  });

  it("每个保留字形的区域（帧 ∪ 环带）逐字节等于源图原坐标处字节——png 与 fnt 必须同代", () => {
    for (const k of kept) {
      const old = k.glyph;
      if (old.width === 0 || old.height === 0) continue;
      const now = preFnt.glyphs.get(old.id)!;
      const box = { w: old.width + 2 * ring, h: old.height + 2 * ring };
      // 区域必须整体在新画布内（生成器同口径：环带不许被画布边界切掉）
      expect(region(prePng, now.x - ring, now.y - ring, box.w, box.h), `字形 ${k.ch} 区域字节 != 源`).toEqual(
        region(fontSrc, old.x - ring, old.y - ring, box.w, box.h),
      );
    }
    expect(kept.filter((k) => k.glyph.width > 0 && k.glyph.height > 0).length).toBe(52);
  });

  it("未保留声明（含 0×0）全部指向全零区，且新图上非零像素只可能来自保留区域", () => {
    const keptCodes = new Set(kept.map((k) => k.glyph.id));
    const mask = new Uint8Array(prePng.w * prePng.h);
    for (const g of preFnt.glyphs.values()) {
      if (g.width === 0 || g.height === 0) continue;
      if (keptCodes.has(g.id)) {
        for (let r = -ring; r < g.height + ring; r++) {
          for (let c = -ring; c < g.width + ring; c++) mask[(g.y + r) * prePng.w + (g.x + c)] = 1;
        }
      } else {
        // 未保留者：帧矩形整块必须全零（今日画空白，重排后仍画空白）
        expect([...region(prePng, g.x, g.y, g.width, g.height)].every((b) => b === 0), `未保留字形 ${g.id} 的矩形里有非零字节`).toBe(true);
      }
    }
    let stray = 0;
    for (let i = 0; i < prePng.w * prePng.h; i++) {
      const o = i * 4;
      if ((prePng.data[o] | prePng.data[o + 1] | prePng.data[o + 2] | prePng.data[o + 3]) && !mask[i]) stray++;
    }
    expect(stray, "区域外有残留非零像素（重排后采样会读到计划外邻居）").toBe(0);
  });

  it("幅面确实缩小、块序与辅助块与源一致、且不得是 2 的幂对（POT 会触发 mipmap=换采样级别）", () => {
    expect(prePng.chunks).toBe(fontSrc.chunks);
    expect(prePng.w).toBeLessThan(fontSrc.w);
    expect(prePng.h).toBeLessThan(fontSrc.h);
    expect(prePng.w * prePng.h).toBeLessThan((fontSrc.w * fontSrc.h) / 2);
    expect(isPot(prePng.w) && isPot(prePng.h)).toBe(false);
    // 帧矩形总量是文案的字形面积账，改文案会动它
    const framePixels = kept.reduce((s, k) => s + k.glyph.width * k.glyph.height, 0);
    expect(framePixels).toBe(266074);
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

  it("房内两个文件的位图字全部走本关变体（唯一例外是 stoneButton 内部的 opts?.fontKey 缺省）", () => {
    let sites = 0;
    for (const file of IN_ROOM_FILES) {
      const expectedKey = file.endsWith("GameScene.ts") ? "this.roomFont" : "roomFontKey()";
      for (const call of bitmapTextCalls(file)) {
        sites++;
        const viaButtonHelper = call.parts[2]?.includes("opts?.fontKey") ?? false;
        expect(
          viaButtonHelper || call.parts[2] === expectedKey,
          `${file}:${call.line} 用了 ${call.raw}——房内文案必须走本关变体键 ${expectedKey}`,
        ).toBe(true);
      }
    }
    expect(sites).toBe(6); // GameScene 2 + overlays 4（stoneButton 内 1、暫停、时限、游戏结束）
  });

  it("凡画房内变体的场景都在自己的 preload 里声明装载（消费方自备，不靠上游兜底）", () => {
    // 失效模式（本轮实测抓到）：面板/ HUD 可以在"Game 的装载队列还没跑"的路径上被启动——
    // 刷新回座 won/gameover 时 enterGame 的黑幕把 Game 起步压到淡入之后，而 resumeWonIfNeeded
    // 与 onPhase("gameover") 已经 scene.start 了面板。此时变体键未进缓存，
    // add.bitmapText 抛 Invalid BitmapText key、create 中断，结算/失败面板开不出来。
    // 已缓存时声明也零成本：addFile(:532)→keyExists(:568) 跳过，队列空则 start() 当场 loadComplete。
    const declarers: string[] = [];
    for (const file of IN_ROOM_FILES) {
      for (const cls of sceneClassBodies(stripComments(SRC(file)))) {
        if (!/roomFontKey\(|this\.roomFont\b/.test(cls.body)) continue;
        declarers.push(`${file.split("/").pop()}:${cls.name}`);
        const body = cls.body.match(/preload\(\): void \{([\s\S]*?)\n  \}/)?.[1] ?? "";
        const declares = /loadRoomFont\(this\.load\)|loadGameAtlases\(this\.load\)/.test(body);
        expect(declares, `${cls.name} 画房内变体却没在自己的 preload 里声明装载`).toBe(true);
      }
    }
    expect(declarers.sort()).toEqual([
      "GameScene.ts:GameScene",
      "overlays.ts:EndMenu",
      "overlays.ts:GameOverMenu",
      "overlays.ts:PauseMenu",
    ]);
  });

  it("stoneButton 调用：房内六处显式 roomFontKey()，进房前三处用缺省子集且 label 在子集内", () => {
    const inRoom = stoneButtonCalls("packages/client/src/scenes/overlays.ts");
    expect(inRoom.length).toBe(6);
    for (const c of inRoom) {
      expect(c.opts.includes("fontKey: roomFontKey()"), `overlays.ts:${c.line} 的 opts=${c.opts || "（无）"} 未声明本关变体`).toBe(true);
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

  it("Boot 关键路径只装子集对，房内两把变体只在 loadRoomFont 里声明一次", () => {
    const boot = SRC("packages/client/src/scenes/BootScene.ts");
    // png 与 fnt 必须成对钉死：重排版把 x/y 改写进新布局，FONT_MAIN 若配上源 font.fnt
    // 就是"用旧坐标读新图"——字还在但每个都画到别处，冷启动看着仍是中文。
    expect(
      boot.includes(
        'this.load.bitmapFont(FONT_MAIN, "/assets/fonts/chinese/font-prephase.png", "/assets/fonts/chinese/font-prephase.fnt")',
      ),
    ).toBe(true);
    const declFn = boot.indexOf("export function loadRoomFont");
    const urlFn = boot.indexOf("export function roomFontPng");
    const atlasFnStart = boot.indexOf("export function loadGameAtlases");
    expect(declFn).toBeGreaterThan(-1);
    expect(urlFn).toBeGreaterThan(-1);
    expect(urlFn).toBeLessThan(declFn);
    expect(atlasFnStart).toBeGreaterThan(declFn);
    // r36：两把变体的 URL 收进 roomFontPng（结算窗预热共用同一出处），
    // 与官方 fnt 一起都落在 font 段内，且各只一处。
    const roomFn = boot.slice(urlFn, atlasFnStart);
    expect(roomFn.includes("/assets/fonts/chinese/font-roomblank.png")).toBe(true);
    expect(roomFn.includes("/assets/fonts/chinese/font-roombase.png")).toBe(true);
    expect(roomFn.split('"/assets/fonts/chinese/font.fnt"').length - 1).toBe(1);
    expect(roomFn).toContain("load.bitmapFont(key, roomFontPng(key), FONT_FNT)");
    // r28：Menu 暖装不知道下一关 ⇒ loadGameAtlases 不得再声明房内字体
    const atlasFn = boot.slice(atlasFnStart, boot.indexOf("export function loadCharsPlay", atlasFnStart));
    expect(atlasFn.includes("bitmapFont")).toBe(false);
    const preload = boot.slice(boot.indexOf("preload(): void"), boot.indexOf("create(): void"));
    expect(preload.includes("font.png")).toBe(false); // Boot 段再无房内字体下载
    expect(preload.includes("font-prephase.png")).toBe(true);
    expect(preload.includes("font-prephase.fnt")).toBe(true);
    // 源 font.fnt 只服务房内两把变体：出现在 loadRoomFont 体内、Boot 的 preload 之外
    expect(preload.includes('chinese/font.fnt"')).toBe(false);
    // 房内路径字面量全局只此一处：别处硬编码=绕过 keyExists 跳过逻辑的第二下载源。
    // 官方全量 font.png 在客户端源码里已无任何引用。
    const files = [
      "packages/client/src/scenes/BootScene.ts",
      "packages/client/src/scenes/GameScene.ts",
      "packages/client/src/scenes/overlays.ts",
      "packages/client/src/main.ts",
    ];
    const count = (re: RegExp) => files.reduce((n, f) => n + (stripComments(SRC(f)).match(re)?.length ?? 0), 0);
    expect(count(/fonts\/chinese\/font\.png/g)).toBe(0);
    expect(count(/fonts\/chinese\/font-roomblank\.png/g)).toBe(1);
    expect(count(/fonts\/chinese\/font-roombase\.png/g)).toBe(1);
    expect(count(/fonts\/chinese\/font\.fnt/g)).toBe(1);
    expect(count(/fonts\/chinese\/font-prephase\.fnt/g)).toBe(1);
  });
});
