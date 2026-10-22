/**
 * r30 机关图集按关变体的静态网：MechAssets 从"整关一张 Slim（152.9KB）"改为
 * 48 关 → 24 个帧子集（`assets/atlasses/mech/MechAssets-<id>.{png,json}`）。
 *
 * 失效模式都不报错：
 *  1) 空间版（r26 keep 口径同形）：帧集合算错 ⇒ 变体少一帧 ⇒ 那帧画透明；
 *  2) 换关版（r30 新增）：同键重载被 TextureManager.checkKey 静默跳过 ⇒ 新关机制帧全部缺失；
 *  3) 时间版（r23/r29 同形）：风动画在无风关注册 ⇒ 帧名解析成 `__BASE`（Animation.js:454）⇒
 *     整张图集当一帧贴满屏。
 *
 * 期望值独立回算：关卡字段 → 需求集（本文件手写映射），变体 id 按 FNV-1a 契约重算；
 * shared 的 mechAtlasFrames/mechVariantId 作为被核对对象，不参与期望值构造。
 * 复现性由生成器 `node --import tsx scripts/split-mech-atlas.mjs --check` 负责（逐字节比对在库产物）。
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { decodePng } from "../../../../scripts/png-raw.mjs";
import { ATLAS_SPECS, inspect } from "../../../../scripts/atlas-slim/needs.mjs";
import { MECH_EMPTY_FRAME, mechAtlasFrames, mechVariantId } from "@fw/shared/mech-needs";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const TT = 180_000;
const BOOT = "packages/client/src/scenes/BootScene.ts";
const GAME = "packages/client/src/scenes/GameScene.ts";
const MAIN = "packages/client/src/main.ts";
const DIR = path.join(ROOT, "assets/atlasses/mech");

const pad4 = (n: number) => String(n).padStart(4, "0");
const seq = (prefix: string, start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${pad4(start + i)}`);
/** 风区动画帧（wind_base 0..3 + wind_effect 0..29）：只给有风关卡 */
const WIND = [...seq("wind_base", 0, 3), ...seq("wind_effect", 0, 29)];
/** 风区灯层两帧（GameScene 建图时的 off 帧与事件 on 帧） */
const WIND_LIGHT = ["wind_base_light_off0000", "wind_base_light_on0000"];

/** 独立回算：关卡字段 → 本关机制帧（GameScene 建图与事件帧）；与 shared/mech-needs 的映射互证 */
function needOf(level: {
  pushers: unknown[];
  levers: unknown[];
  boxes: { heavy?: boolean }[];
  balls: unknown[];
  platforms: unknown[];
  hangings: unknown[];
  pulleys: unknown[];
  romans: unknown[];
  winds: unknown[];
  windows: unknown[];
}): string[] {
  const out = new Set<string>();
  if (level.winds.length) for (const n of [...WIND, ...WIND_LIGHT]) out.add(n);
  if (level.pushers.length) for (const n of ["pusher_block0000", "pusher_block_light0000"]) out.add(n);
  if (level.levers.length) {
    for (const n of [
      "lever_stick0000",
      "lever_stick_light_off0000",
      "lever_base0000",
      "lever_base_light_off0000",
      "lever_base_light_on0000",
      "lever_stick_light_on0000",
    ])
      out.add(n);
  }
  if (level.boxes.length) out.add("movingbox0000");
  if (level.boxes.some((b) => b.heavy)) out.add("movingbox20000");
  if (level.balls.length) out.add("ball0000");
  if (level.platforms.length) {
    for (const n of ["BarCapLeft0000", "BarCapRight0000", "BarCenter0000", "moving_platform_light_off0000", "moving_platform_light_on0000"])
      out.add(n);
  }
  if (level.hangings.length) for (const n of ["hanging_anchor0000", "pulley_rope0000", "hanging_platform0000", "hanging_base0000"]) out.add(n);
  if (level.pulleys.length) for (const n of ["pulley_base0000", "pulley_anchor0000", "pulley_rope0000", "pulley_platform0000"]) out.add(n);
  if (level.romans.length) for (const n of ["roman_center0000", "roman_base0000", "roman_bar0000", "roman_end0000"]) out.add(n);
  if (level.windows.length) for (const n of ["_default0000", "WindowLeft0000", "WindowRight0000", "WindowCenter0000"]) out.add(n);
  if (!out.size) out.add(MECH_EMPTY_FRAME);
  return [...out].sort();
}

/** FNV-1a 32bit 契约（生成器/运行时/本测试三方必须一致） */
function idOf(frames: string[]): string {
  const s = frames.join("\n");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const officialJson = JSON.parse(SRC(ATLAS_SPECS.mech.json)) as {
  frames: { filename: string; frame: { x: number; y: number; w: number; h: number }; trimmed: boolean; spriteSourceSize?: { x: number; y: number } }[];
};
let needs: Awaited<ReturnType<typeof inspect>>;
/** id → { frames, levelIds }（独立回算的期望） */
let groups: Map<string, { frames: string[]; levelIds: (string | number)[] }>;
beforeAll(async () => {
  needs = await inspect(ROOT);
  groups = new Map();
  for (const l of needs.levels) {
    const frames = needOf(l.parsed);
    const id = idOf(frames);
    const prev = groups.get(id);
    if (prev) {
      expect(prev.frames, `变体 id 碰撞：${id}`).toEqual(frames);
      prev.levelIds.push(l.id);
    } else groups.set(id, { frames, levelIds: [l.id] });
  }
}, TT);

/** 剥注释（长度不变、换行保留）：注释里的示例路径/帧名不能当成消费点 */
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

/** 顶层函数体：从签名到第一个顶格 `}` */
function body(file: string, sig: string): string {
  const src = stripComments(SRC(file));
  const at = src.indexOf(sig);
  expect(at, `${file} 里找不到 ${sig}`).toBeGreaterThan(-1);
  const end = src.indexOf("\n}", at);
  expect(end, `${sig} 没有闭合`).toBeGreaterThan(at);
  return src.slice(at, end);
}

/** 类内方法体（两格缩进闭合）：body() 会一路取到 class 末尾 */
function methodBody(file: string, sig: string): string {
  const src = stripComments(SRC(file));
  const at = src.indexOf(sig);
  expect(at, `${file} 里找不到 ${sig}`).toBeGreaterThan(-1);
  const end = src.indexOf("\n  }", at);
  expect(end, `${sig} 没有闭合`).toBeGreaterThan(at);
  return src.slice(at, end);
}

describe("r30 变体账目（独立回算）", () => {
  it("48 关 → 24 个子集；逐关需求集/变体 id 与 shared、在库 JSON 三方一致", () => {
    expect(needs.levels.length).toBe(48);
    expect(groups.size).toBe(24);
    for (const l of needs.levels) {
      const frames = needOf(l.parsed);
      const id = idOf(frames);
      expect(mechAtlasFrames(l.parsed), `关卡 ${l.id} 的 shared 帧集`).toEqual(frames);
      expect(mechVariantId(l.parsed), `关卡 ${l.id} 的变体 id`).toBe(id);
      const json = JSON.parse(readFileSync(path.join(DIR, `MechAssets-${id}.json`), "utf8"));
      expect((json.frames as { filename: string }[]).map((f) => f.filename).sort(), `关卡 ${l.id} 的在库 JSON`).toEqual(frames);
      expect(json.meta.image, `关卡 ${l.id} 的 meta.image`).toBe(`MechAssets-${id}.png`);
      expect(json.meta.size).toEqual({ w: 2048, h: 2048 });
    }
  });

  it("风区 34 帧只进 15 个有风关；零机关两关只有 1×1 透明占位帧", () => {
    expect(needs.levels.filter((l) => l.parsed.winds.length > 0).length).toBe(15);
    for (const l of needs.levels) {
      const frames = new Set(needOf(l.parsed));
      const expected = l.parsed.winds.length > 0;
      expect(WIND.every((n) => frames.has(n)), `关卡 ${l.id} 风区帧`).toBe(expected);
      expect(WIND.some((n) => frames.has(n)), `关卡 ${l.id} 残留风区帧`).toBe(expected);
      expect(WIND_LIGHT.every((n) => frames.has(n)), `关卡 ${l.id} 风区灯帧`).toBe(expected);
    }
    const zero = needs.levels.filter((l) => needOf(l.parsed).length === 1);
    expect(zero.map((l) => l.filename).sort()).toEqual(["forest/levels/forest_06.json", "forest/levels/forest_06_1.json"]);
    for (const l of zero) expect(needOf(l.parsed)).toEqual([MECH_EMPTY_FRAME]);
    const dummy = JSON.parse(readFileSync(path.join(DIR, `MechAssets-${idOf([MECH_EMPTY_FRAME])}.json`), "utf8"));
    expect(dummy.frames).toEqual([
      {
        filename: MECH_EMPTY_FRAME,
        frame: { x: 0, y: 0, w: 1, h: 1 },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 },
        sourceSize: { w: 1, h: 1 },
      },
    ]);
  });

  it("48 关并集等于 r26 keep.mech（67 帧），其余 96 帧在所有变体里都属清零面", () => {
    const union = new Set([...groups.values()].flatMap((g) => g.frames).filter((n) => n !== MECH_EMPTY_FRAME));
    expect(union.size).toBe(67);
    expect([...union].sort()).toEqual([...needs.atlases.mech.keep].sort());
    expect(needs.atlases.mech.blank.length).toBe(96);
  });

  it("产物目录恰有 24×2 件，无孤儿变体", () => {
    const files = readdirSync(DIR);
    expect(files.length).toBe(48);
    const expected = new Set([...groups.keys()].flatMap((id) => [`MechAssets-${id}.png`, `MechAssets-${id}.json`]));
    expect(files.filter((n) => !expected.has(n))).toEqual([]);
  });
});

describe("r30 像素账（原地清零口径，独立回算）", () => {
  it("每张变体与 Slim 同幅面；保留帧逐字节相同、非保留帧全 0；占位帧透明", () => {
    const slim = decodePng(readFileSync(path.join(ROOT, ATLAS_SPECS.mech.slimPng)), "MechAssetsSlim");
    const bad: string[] = [];
    for (const [id, g] of groups) {
      const png = decodePng(readFileSync(path.join(DIR, `MechAssets-${id}.png`)), `MechAssets-${id}`);
      if (png.w !== slim.w || png.h !== slim.h) {
        bad.push(`${id} 幅面 ${png.w}x${png.h}`);
        continue;
      }
      const need = new Set(g.frames);
      for (const f of officialJson.frames) {
        const { x, y, w, h } = f.frame;
        if (need.has(f.filename)) {
          for (let yy = y; yy < y + h; yy++) {
            const off = (yy * slim.w + x) * 4;
            if (!png.data.subarray(off, off + w * 4).equals(slim.data.subarray(off, off + w * 4))) {
              bad.push(`${id}/${f.filename} 与 Slim 像素不同`);
              break;
            }
          }
        } else {
          let dirty = false;
          for (let yy = y; yy < y + h && !dirty; yy++) {
            const off = (yy * slim.w + x) * 4;
            for (let i = off; i < off + w * 4; i++) {
              if (png.data[i] !== 0) {
                dirty = true;
                break;
              }
            }
          }
          if (dirty) bad.push(`${id}/${f.filename} 未被清零`);
        }
      }
      if (need.has(MECH_EMPTY_FRAME) && png.data[3] !== 0) bad.push(`${id} 占位帧 (0,0) 不透明`);
    }
    expect(bad).toEqual([]);
  }, TT);

  it("官方帧全部未 trim、偏移为 0（原地清零的几何等价前提，变了要先改生成器）", () => {
    const bad = officialJson.frames.filter((f) => f.trimmed || f.spriteSourceSize?.x || f.spriteSourceSize?.y);
    expect(bad.map((f) => f.filename)).toEqual([]);
  });
});

describe("r30 装载点（客户端接线）", () => {
  it("loadGameAtlases 不再声明 mech；loadMechAtlas 换变体前卸纹理与风动画", () => {
    const boot = stripComments(SRC(BOOT));
    const gate = boot.slice(boot.indexOf("export function loadGameAtlases"), boot.indexOf("export function loadMechAtlas"));
    expect(gate).not.toContain("ATLAS_MECH");
    const load = body(BOOT, "export function loadMechAtlas");
    expect(load).toContain("mechVariantId(level)");
    expect(load).toContain("mechVariant === id");
    expect(load).toContain("load.scene.textures.remove(ATLAS_MECH)");
    expect(load).toContain("load.scene.anims.remove(key)");
    expect(boot).toContain('const WIND_ANIM_KEYS = ["wind_base", "wind_effect"] as const');
    expect(load).toContain('load.atlas(ATLAS_MECH, `/assets/atlasses/mech/MechAssets-${id}.png`, `/assets/atlasses/mech/MechAssets-${id}.json`)');
  });

  it("GameScene.preload 声明本关变体；main.ts 在暖装门内补声明（落定后 no-op）", () => {
    expect(methodBody(GAME, "  preload(): void {")).toContain("loadMechAtlas(this.load, this.d.level)");
    expect(SRC(MAIN)).toContain("warmMechFor(currentLevel)");
    const warm = body(BOOT, "export function warmMechFor");
    expect(warm).toContain("warmState.settled");
    expect(warm).toContain("loadMechAtlas(warmState.scene.load, level)");
  });

  it("风动画按关注册：buildGameAnims 的 wind 分支受 opts.wind 控制", () => {
    expect(stripComments(SRC(GAME))).toContain(
      "buildGameAnims(this.anims, { wind: level.winds.length > 0 && this.textures.exists(ATLAS_MECH) })",
    );
    const build = body(BOOT, "export function buildGameAnims");
    expect(build).toContain("opts?: { wind?: boolean }");
    expect(build.indexOf('seq("wind_base"')).toBeGreaterThan(build.indexOf("if (opts?.wind)"));
    expect(build.indexOf('seq("wind_effect"')).toBeGreaterThan(build.indexOf("if (opts?.wind)"));
  });
});
