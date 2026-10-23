/**
 * 房内字体链的静态防护网（r28 按关双变体：font-roomblank 114 字 / font-roombase 27 字）。
 * 与 font-prephase.test.ts 同形状，但守的是**房内**这条链：
 * 需求源来自 scripts/font-subset/room.mjs（基础集 = 行钉字面量 + 动态数字点；全集再加关卡教学文本），
 * 产物是 assets/fonts/chinese/font-roomblank.png 与 font-roombase.png（官方 fnt 不动）。致命失效模式：
 *  1. 某处房内文案的字不在本关装载的变体内 ⇒ 换装载后那个字当场画空白；
 *  2. 教学层选取规则或某关文案改动 ⇒ 需求集变了但产物/名单没跟着重建；
 *  3. 清零越界碰到保留字形或其 ring 环带 ⇒ 26/36px 采样核读到被抹掉的邻居；
 *  4. BootScene 的教学关名单与 room.mjs 回算结果漂移 ⇒ 教学关装了 27 字变体。
 * 产物语义与 r24 的货架重排相反：**只允许动保留面之外的像素**，所有坐标/幅面/fnt 逐字节不动。
 * 期望值全部由「官方 font.png/font.fnt 的字节与坐标」独立回算，故意不调用生成器
 * build-font-blank.mjs 的装配代码——生成器若口径出错，这里仍能独立发现。
 * 解析一律走 room.mjs / prephase.mjs 的导出，绝不在此重复实现字形集/关卡/fnt 解析。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadFontAtlas, parseFnt } from "../../../../scripts/font-subset/prephase.mjs";
import {
  ROOM_DYNAMIC_SITES,
  ROOM_LITERAL_SITES,
  assertRoomPins,
  diskLevelPaths,
  roomBaseChars,
  roomChars,
  roomLevelTexts,
  tutorialLevels,
} from "../../../../scripts/font-subset/room.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

/** 房内文件：位图字按本关变体取键（GameScene `this.roomFont` / overlays `roomFontKey()`） */
const IN_ROOM_FILES = ["packages/client/src/scenes/GameScene.ts", "packages/client/src/scenes/overlays.ts"];
/** 房内参数化实参的位图字：字形来源由 room.mjs 的 sites / 关卡教学文本交代 */
const PARAMETERISED = [
  "packages/client/src/scenes/GameScene.ts:1549", // t.text ← 关卡教学文本（roomLevelTexts）
  "packages/client/src/scenes/overlays.ts:323", // limitStr ← ROOM_DYNAMIC_SITES 结算板时限
];
/** 今日有教学文本、会进房内位图字的关卡（其余 46 关无教学层）：新增/改文案这里要红 */
const TUT_LEVELS = [
  { id: 1, filename: "tutorials/levels/forest_01.json", selectedLayer: "Tutorial_keyboard" },
  { id: 64, filename: "forest/levels/forest_bonus_1.json", selectedLayer: "Tutorial_keyboard" },
];
/** 基础集 27 字的独立字面量（不经过 room.mjs：测试自己再数一遍） */
const BASE_EXPECTED = "暫停再试一次返回菜单继续游戏结束0:123456789";

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

const fnt = parseFnt(path.join(ROOT, "assets/fonts/chinese/font.fnt"));
const fontSrc = loadFontAtlas(path.join(ROOT, "assets/fonts/chinese/font.png"), fnt);
const ring = fnt.padding[0];
const blankPngPath = path.join(ROOT, "assets/fonts/chinese/font-roomblank.png");
const basePngPath = path.join(ROOT, "assets/fonts/chinese/font-roombase.png");
/** loadFontAtlas 顺带钉住"png 尺寸 == 官方 fnt scaleW/scaleH"（原地清零不改幅面） */
const blankPng = loadFontAtlas(blankPngPath, fnt);
const basePng = loadFontAtlas(basePngPath, fnt);

/** 需求集合/关卡文本要解析 TS，走 room.mjs 的动态 import；memo 化避免每个用例重算 */
let _room: ReturnType<typeof roomChars> | undefined;
const room = () => (_room ??= roomChars(ROOT, fnt));
let _levels: ReturnType<typeof roomLevelTexts> | undefined;
const levels = () => (_levels ??= roomLevelTexts(ROOT));
let _base: ReturnType<typeof roomBaseChars> | undefined;
const base = () => (_base ??= roomBaseChars(ROOT, fnt));

/** 48 关 parseLevel ＋三张 2191×1024 图集解码会超过 vitest 默认 5s，这里预热一次共用 memo。 */
const TT = 180000;
beforeAll(async () => {
  await room();
  await levels();
  base();
}, TT);

/** 原地清零产物语义：保留面（帧 ∪ ring 环带）逐字节等于官方原坐标；清零面全 0。返回保留掩码。 */
function assertInPlace(img: { w: number; h: number; data: Buffer }, used: { ch: string; glyph: { x: number; y: number; width: number; height: number } }[], label: string): Uint8Array {
  const mask = new Uint8Array(img.w * img.h);
  for (const k of used) {
    const g = k.glyph;
    const x0 = g.x - ring;
    const y0 = g.y - ring;
    const x1 = g.x + g.width + ring;
    const y1 = g.y + g.height + ring;
    expect(x0 >= 0 && y0 >= 0 && x1 <= img.w && y1 <= img.h, `${label} 字形 ${k.ch} 的环带越出画布`).toBe(true);
    for (let y = y0; y < y1; y++) mask.fill(1, y * img.w + x0, y * img.w + x1);
    expect(region(img, x0, y0, x1 - x0, y1 - y0), `${label} 字形 ${k.ch} 区域字节 != 官方`).toEqual(
      region(fontSrc, x0, y0, x1 - x0, y1 - y0),
    );
  }
  let stray = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) continue;
    const o = i * 4;
    if (img.data[o] | img.data[o + 1] | img.data[o + 2] | img.data[o + 3]) stray++;
  }
  expect(stray, `${label} 清零面有残留非零像素（会改变 26/36px 的采样邻域）`).toBe(0);
  return mask;
}

describe("房内需求集合与行钉", () => {
  it("行钉不漂移：所有字面量/动态点的字符都在房内全集内", async () => {
    assertRoomPins(ROOT); // 文案/行号一改就抛
    const { chars } = await room();
    for (const s of ROOM_LITERAL_SITES) {
      for (const t of s.texts) for (const ch of t) expect(chars.has(ch), `${s.file}:${s.line} 的 ${ch}`).toBe(true);
    }
    for (const d of ROOM_DYNAMIC_SITES) {
      for (const ch of d.chars) expect(chars.has(ch), `${d.file}:${d.line} 的 ${ch}`).toBe(true);
    }
  }, TT);

  it("基础集恰为 27 字、全部有帧；与独立字面量一致且是全集子集", async () => {
    const b = base();
    const full = await room();
    expect([...b.chars].sort()).toEqual([...new Set(BASE_EXPECTED)].sort());
    expect(b.chars.size).toBe(27);
    expect(b.kept.length).toBe(27);
    expect(b.noGlyph).toEqual([]);
    expect([...b.kept].every((k) => k.code === k.glyph.id && k.glyph.width > 0 && k.glyph.height > 0)).toBe(true);
    const codes = b.kept.map((k) => k.code);
    expect(codes).toEqual([...codes].sort((a, b) => a - b)); // 生成器依赖 code 升序
    for (const ch of b.chars) expect(full.chars.has(ch), `基础字 ${ch} 不在房内全集`).toBe(true);
  }, TT);

  it("房内全集恰为 114 字符、全部有帧（今日无漏字）", async () => {
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

  it("48 关教学文本（选中层）每字符在全集内；选取规则钉住", async () => {
    const { chars } = await room();
    const withText = await tutorialLevels(ROOT);
    expect(withText.map((l) => ({ id: l.id, filename: l.filename, selectedLayer: l.selectedLayer }))).toEqual(TUT_LEVELS);
    for (const l of withText) {
      for (const t of l.texts) for (const ch of t) expect(chars.has(ch), `关卡 ${l.id} 的 ${ch} 不在房内全集`).toBe(true);
    }
    // 其余 46 关确无教学层文本（一旦某关新增 Tutorial_ 层却没进上面名单，这里红）
    const noText = (await levels()).filter((l) => l.texts.length === 0);
    expect(noText.length).toBe(46);
  }, TT);

  it("BootScene 的教学关名单与 room.mjs 回算一致（否则教学关会装 27 字变体）", async () => {
    const boot = stripComments(SRC("packages/client/src/scenes/BootScene.ts"));
    const m = /const TUTORIAL_LEVEL_FILES = \[([^\]]*)\] as const;/.exec(boot);
    expect(m, "BootScene 的 TUTORIAL_LEVEL_FILES 声明不见了").not.toBeNull();
    const pinned = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    const recomputed = (await tutorialLevels(ROOT)).map((l) => l.filename);
    expect(pinned).toEqual(recomputed);
    expect(pinned).toEqual(TUT_LEVELS.map((l) => l.filename));
  }, TT);
});

describe("房内变体调用点分类", () => {
  it("GameScene 用 this.roomFont、overlays 用 roomFontKey()；字面量字符都在基础集内", async () => {
    const b = base();
    const parameterised: string[] = [];
    let keyed = 0;
    let internalDefaults = 0;
    for (const file of IN_ROOM_FILES) {
      const expectedKey = file.endsWith("GameScene.ts") ? "this.roomFont" : "roomFontKey()";
      for (const call of bitmapTextCalls(file)) {
        const key = call.parts[2] ?? "";
        if (key.includes("opts?.fontKey")) {
          internalDefaults++; // overlays.ts:131 stoneButton 内部缺省，字体由调用方 opts.fontKey 决定
          continue;
        }
        expect(key, `${file}:${call.line} 用了 ${call.raw}——房内文案必须走本关变体键 ${expectedKey}`).toBe(expectedKey);
        keyed++;
        const text = literal(call.parts[3] ?? "");
        if (text === null) {
          parameterised.push(`${file}:${call.line}`);
          continue;
        }
        for (const ch of text) expect(b.chars.has(ch), `${file}:${call.line} 的 ${ch} 不在基础集`).toBe(true);
      }
    }
    expect(internalDefaults).toBe(1); // 只此一处 stoneButton 内部
    expect(keyed).toBe(5); // GameScene 2（教学文本/时钟）+ overlays 3（暫停/limitStr/游戏结束）
    // 参数化点只能是被 sites/关卡文本交代的那两处
    expect(parameterised.sort()).toEqual([...PARAMETERISED].sort());
  }, TT);

  it("stoneButton 房内六处显式 roomFontKey()，且 label 字面量字符都在基础集内", async () => {
    const b = base();
    const inRoom = stoneButtonCalls("packages/client/src/scenes/overlays.ts");
    expect(inRoom.length).toBe(6);
    for (const c of inRoom) {
      expect(c.opts.includes("fontKey: roomFontKey()"), `overlays.ts:${c.line} 的 opts=${c.opts || "（无）"} 未声明本关变体`).toBe(true);
      const text = literal(c.label);
      expect(text, `overlays.ts:${c.line} 的 label 应为字面量`).not.toBeNull();
      for (const ch of text!) expect(b.chars.has(ch), `overlays.ts:${c.line} 的 ${ch} 不在基础集`).toBe(true);
    }
  }, TT);
});

describe("在库产物：两个变体都按原地清零语义（坐标/幅面/fnt 不动）", () => {
  it("font-roomblank（114 字）：保留面逐字节等于官方，清零面全 0", async () => {
    const { kept } = await room();
    const used = kept.filter((k) => k.glyph.width > 0 && k.glyph.height > 0);
    expect(used.length).toBe(114);
    assertInPlace(blankPng, used, "font-roomblank");
  }, TT);

  it("font-roombase（27 字）：保留面逐字节等于官方，清零面全 0，且与全量变体同矩形同字节", () => {
    const b = base();
    const used = b.kept.filter((k) => k.glyph.width > 0 && k.glyph.height > 0);
    expect(used.length).toBe(27);
    assertInPlace(basePng, used, "font-roombase");
    // 两个变体在基础字形的环带矩形上必须同字节（都照抄官方；任何一边算法漂移都会在这里现形）
    for (const k of used) {
      const g = k.glyph;
      const x0 = g.x - ring;
      const y0 = g.y - ring;
      const w = g.width + 2 * ring;
      const h = g.height + 2 * ring;
      expect(region(basePng, x0, y0, w, h), `字形 ${k.ch} 两变体字节不同`).toEqual(region(blankPng, x0, y0, w, h));
    }
  });

  it("两变体幅面/chunks 与官方一致；产品不带自己的 fnt（客户端装官方 font.fnt）", () => {
    for (const [label, img] of [["font-roomblank", blankPng], ["font-roombase", basePng]] as const) {
      expect(img.w, label).toBe(fontSrc.w);
      expect(img.h, label).toBe(fontSrc.h);
      expect(`${img.w}x${img.h}`, label).toBe("2191x1024");
      expect(img.chunks, label).toBe(fontSrc.chunks);
    }
    expect(existsSync(path.join(ROOT, "assets/fonts/chinese/font-roomblank.fnt"))).toBe(false);
    expect(existsSync(path.join(ROOT, "assets/fonts/chinese/font-roombase.fnt"))).toBe(false);
  });

  it("冻结：两产物体积/字形计数；loadRoomFont 按关选 URL 并装官方 fnt", () => {
    const fullBytes = readFileSync(blankPngPath).length;
    const baseBytes = readFileSync(basePngPath).length;
    expect(fullBytes).toBe(795671);
    expect(baseBytes).toBe(214876);
    expect(baseBytes).toBeLessThan(fullBytes * 0.3); // 27/258 字形账，掉回全量说明清零口径坏了
    expect([...fnt.glyphs.values()].filter((g) => g.width > 0 && g.height > 0).length).toBe(258);
    const boot = stripComments(SRC("packages/client/src/scenes/BootScene.ts"));
    expect(
      boot.includes(
        'key === FONT_FULL ? "/assets/fonts/chinese/font-roomblank.png" : "/assets/fonts/chinese/font-roombase.png"',
      ),
      "loadRoomFont 的变体选择表达式漂移",
    ).toBe(true);
    expect(boot.includes('"/assets/fonts/chinese/font.fnt"')).toBe(true);
    expect(boot.includes('return (TUTORIAL_LEVEL_FILES as readonly string[]).includes(file) ? FONT_FULL : FONT_ROOM;')).toBe(true);
    expect(/load\.bitmapFont\(FONT_FULL[^)]*\/font\.png/.test(boot)).toBe(false);
    // 双键互斥：跨变体换关（forest_01 → forest_02 的「继续」）不得在同一会话叠两份 8.97MB 解码
    expect(boot.includes("const stale = key === FONT_FULL ? FONT_ROOM : FONT_FULL;")).toBe(true);
    expect(boot.includes("if (load.scene.textures.exists(stale)) load.scene.textures.remove(stale);")).toBe(true);
    // 教学目标关：777KB 全量字体必须在暖装门仍开时补进同一批，不得落到门后独占管道
    expect(boot.includes("export function warmRoomFontFor(levelFile?: string | null): void {")).toBe(true);
    expect(boot.includes("if (roomFontKey(levelFile) !== FONT_FULL) return;")).toBe(true);
    expect(boot.includes("loadRoomFont(warmState.scene.load, levelFile);")).toBe(true);
    const main = stripComments(SRC("packages/client/src/main.ts"));
    const warmCall = main.indexOf("warmRoomFontFor(currentTempleEntry?.filename);");
    expect(warmCall, "main.ts 未在关卡定出后补声明教学目标字体").toBeGreaterThan(-1);
    expect(main.indexOf("await bgWarmSettled();"), "补声明必须早于暖装门等待").toBeGreaterThan(warmCall);
    // 官方全量 font.png 在客户端源码里必须已无任何引用
    expect(stripComments(boot).match(/fonts\/chinese\/font\.png/g)).toBeNull();
  });
});
