/**
 * r40 地面图集按消费面重打包的静态防护网。
 *
 * 现状问题：官方 `GroundAssets.png` 是 1024×2048（解码 8.00MiB）的 343 帧，但复刻只有 151 帧
 * 有消费点——液体三段循环 135 帧、冰膜静帧 3 帧、地面烘焙蒙版 13 帧。其余 192 帧（BeamDust/Dust
 * 等原版特效）永不上屏，却随落定门一起解进显存。
 *
 * 重打包：151 真帧按 GUT=2 货架排布到 634×584（解码 1.41MiB），其余 192 帧以 `mainAlias`
 * 别名到一块 4×4 透明区；JSON 仍声明官方全部 343 个帧名、顺序不变。失效模式都静默：
 * 坐标搬错 ⇒ 画透明；别名块被污染 ⇒ 藏起来的帧重新露出来；少搬一个消费帧 ⇒ 液体/地面烘焙
 * 缺帧或整块贴错。本测试的期望值全部独立回算自官方 PNG/JSON 与源码字面量。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cropRaw, decodePng } from "../../../../scripts/png-raw.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const BOOT = "packages/client/src/scenes/BootScene.ts";
const GAME = "packages/client/src/scenes/GameScene.ts";
const OFFICIAL_PNG = "assets/atlasses/GroundAssets.png";
const OFFICIAL_JSON = "assets/atlasses/GroundAssets.json";
const PLAY_PNG = "assets/atlasses/GroundAssetsPlay.png";
const PLAY_JSON = "assets/atlasses/GroundAssetsPlay.json";

const pad4 = (n: number) => String(n).padStart(4, "0");
const seq = (prefix: string, start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${pad4(start + i)}`);

/** 液体三段循环（BootScene.buildGameAnims：三个族 × 裸/Left/Right × 0..14） */
const LIQUID = ["WaterBox", "FireBox", "GreenBox"].flatMap((fam) =>
  ["", "Left", "Right"].flatMap((pos) => seq(`${fam}${pos}`, 0, 14)),
);
/** 冰膜静帧（GameScene.buildLiquids：IceBox{,Left,Right}0000） */
const ICE = ["", "Left", "Right"].map((pos) => `IceBox${pos}0000`);
/** 地面烘焙蒙版（GameScene.bakeGroundCanvas 的全部 stamp 名） */
const MASK = [
  ...Array.from({ length: 4 }, (_, i) => `MaskBox0000${i}`),
  ...Array.from({ length: 9 }, (_, i) => `MaskBox${i + 1}0000`),
];
const EXPECTED = [...LIQUID, ...ICE, ...MASK].sort();

const official = JSON.parse(readFileSync(path.join(ROOT, OFFICIAL_JSON), "utf8"));
const play = JSON.parse(readFileSync(path.join(ROOT, PLAY_JSON), "utf8"));
const officialByName = new Map<string, any>(official.frames.map((f: any) => [f.filename, f]));
const playByName = new Map<string, any>(play.frames.map((f: any) => [f.filename, f]));
const realNames = play.frames.filter((f: any) => !f.mainAlias).map((f: any) => f.filename);
const aliasNames = play.frames.filter((f: any) => f.mainAlias).map((f: any) => f.filename);

const officialPng = decodePng(readFileSync(path.join(ROOT, OFFICIAL_PNG)), "GroundAssets.png");
const playPng = decodePng(readFileSync(path.join(ROOT, PLAY_PNG)), "GroundAssetsPlay.png");
const crop = (img: ReturnType<typeof decodePng>, f: any) => cropRaw(img, f.frame.x, f.frame.y, f.frame.w, f.frame.h);
const alpha = (img: ReturnType<typeof decodePng>, x: number, y: number) => img.data[(y * img.w + x) * 4 + 3];
const bytes = (p: string) => readFileSync(path.join(ROOT, p)).length;

/** 帧四周 1px 环带必须全透明（GUT=2 的隔离带；LINEAR 越界采样只读到透明） */
function ringBad(img: ReturnType<typeof decodePng>, f: any, label: string): string[] {
  const { x, y, w, h } = f.frame;
  const bad: string[] = [];
  if (!(x - 1 >= 0 && y - 1 >= 0 && x + w + 1 <= img.w && y + h + 1 <= img.h)) return [`${label} 贴到了画布边`];
  for (let c = x - 1; c <= x + w; c++) {
    for (const r of [y - 1, y + h]) if (alpha(img, c, r) !== 0) bad.push(`${label} 上下环带 ${c},${r}`);
  }
  for (let r = y - 1; r <= y + h; r++) {
    for (const c of [x - 1, x + w]) if (alpha(img, c, r) !== 0) bad.push(`${label} 左右环带 ${c},${r}`);
  }
  return bad;
}

describe("r40 地面图集重打包：151 真帧 + 192 透明别名", () => {
  it("声明官方全部 343 个帧名且顺序不变；真帧/别名集合独立回算一致", () => {
    expect(play.frames.map((f: any) => f.filename)).toEqual(official.frames.map((f: any) => f.filename));
    expect([...realNames].sort()).toEqual(EXPECTED);
    expect(realNames.length).toBe(151);
    expect(aliasNames.length).toBe(192);
    expect([...realNames, ...aliasNames].sort()).toEqual([...officialByName.keys()].sort());
    expect(EXPECTED.length).toBe(151);
  });

  it("真帧几何照抄官方（只换容器坐标），像素逐字节相等", () => {
    const bad: string[] = [];
    for (const name of realNames) {
      const a = playByName.get(name);
      const o = officialByName.get(name);
      expect({ w: a.frame.w, h: a.frame.h }, `${name} 尺寸`).toEqual({ w: o.frame.w, h: o.frame.h });
      expect([a.rotated, a.trimmed, a.spriteSourceSize, a.sourceSize], `${name} 元数据被改动`).toEqual([
        o.rotated,
        o.trimmed,
        o.spriteSourceSize,
        o.sourceSize,
      ]);
      if (Buffer.compare(crop(playPng, a), crop(officialPng, o)) !== 0) bad.push(name);
    }
    expect(bad, "真帧像素与官方裁片不一致").toEqual([]);
  });

  it("192 个别名：4×4 透明块唯一、源尺寸照抄官方、环带全透明", () => {
    const rects = new Set<string>();
    for (const name of aliasNames) {
      const a = playByName.get(name);
      const o = officialByName.get(name);
      expect({ w: a.frame.w, h: a.frame.h }, `${name} 别名尺寸`).toEqual({ w: 4, h: 4 });
      expect(a.sourceSize, `${name} 源尺寸`).toEqual(o.sourceSize);
      expect(a.trimmed, `${name} 不应走 trim`).toBe(false);
      expect(a.rotated, `${name} 不应旋转`).toBe(false);
      expect(a.spriteSourceSize, `${name} 别名不应带偏移`).toBeUndefined();
      rects.add(`${a.frame.x},${a.frame.y}`);
    }
    expect(rects.size, "别名块必须唯一").toBe(1);
    const [x, y] = [...rects][0].split(",").map(Number);
    for (let r = y - 1; r <= y + 4; r++) {
      for (let c = x - 1; c <= x + 4; c++) expect(alpha(playPng, c, r), `别名块环带 ${c},${r}`).toBe(0);
    }
  });

  it("真帧四周 1px 环带全透明；零消费帧确实是别名", () => {
    const bad = realNames.flatMap((n: string) => ringBad(playPng, playByName.get(n), n));
    expect(bad).toEqual([]);
    for (const name of ["BeamDust0000", "BeamDust0001", "Dust0000"]) {
      expect(officialByName.has(name), `官方缺帧 ${name}，零消费清单需复核`).toBe(true);
      expect(aliasNames, `${name} 应保持零消费（若新增消费点，先改生成器）`).toContain(name);
    }
  });

  it("画布与线上字节：634×584，PNG+JSON 轻于官方整张", () => {
    expect({ w: playPng.w, h: playPng.h }).toEqual({ w: 634, h: 584 });
    expect(play.meta.size).toEqual({ w: playPng.w, h: playPng.h });
    expect(official.meta.size).toEqual({ w: officialPng.w, h: officialPng.h });
    expect(play.meta.image).toBe("GroundAssetsPlay.png");
    expect(play.meta.app).toBe("shrink-ground-atlas");
    expect(playPng.w * playPng.h * 4).toBeLessThan(officialPng.w * officialPng.h * 4 * 0.2);
    expect(bytes(PLAY_PNG) + bytes(PLAY_JSON)).toBeLessThan(bytes(OFFICIAL_PNG) + bytes(OFFICIAL_JSON));
    expect(bytes(PLAY_PNG)).toBeLessThan(bytes(OFFICIAL_PNG));
    expect(bytes(PLAY_JSON)).toBeLessThan(bytes(OFFICIAL_JSON));
  });
});

describe("r40 装载与消费点", () => {
  it("Boot 的落定门只装 Play 图集，官方整张不再出现在运行时源码里", () => {
    const boot = SRC(BOOT);
    expect(boot).toContain('export const ATLAS_GROUND_PNG = "/assets/atlasses/GroundAssetsPlay.png"');
    expect(boot).toContain('export const ATLAS_GROUND_JSON = "/assets/atlasses/GroundAssetsPlay.json"');
    expect(boot).toContain("load.atlas(ATLAS_GROUND, ATLAS_GROUND_PNG, ATLAS_GROUND_JSON)");
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "__tests__") walk(p);
        } else if (e.name.endsWith(".ts") && /GroundAssets\.(png|json)/.test(readFileSync(p, "utf8"))) {
          offenders.push(path.relative(ROOT, p));
        }
      }
    };
    walk(path.join(ROOT, "packages/client/src"));
    expect(offenders, "运行时源码不得再装载官方整张地面图集").toEqual([]);
  });

  it("消费点字面量与真帧集合对齐（液体 0..14、冰膜 0000、13 个 MaskBox 名）", () => {
    const boot = SRC(BOOT);
    expect(boot).toContain("seq(`liquid_${key}`, ATLAS_GROUND, base, 0, 14, 30, -1);");
    expect(boot).toContain("seq(`liquid_${key}_left`, ATLAS_GROUND, `${base}Left`, 0, 14, 30, -1);");
    expect(boot).toContain("seq(`liquid_${key}_right`, ATLAS_GROUND, `${base}Right`, 0, 14, 30, -1);");
    const game = SRC(GAME);
    for (const s of [
      "`${fam}${pos}0000`",
      "`${fam}Right0000`",
      "`IceBox${ipos}0000`",
      '"IceBoxRight0000"',
      "`MaskBox0000${Math.floor(rnd() * 4)}`",
      "`MaskBox${t}0000`",
      "`MaskBox${typeAt(cy * cols + a)}0000`",
      '"MaskBox80000"',
      '"MaskBox90000"',
    ]) {
      expect(game, `GameScene 缺消费字面量 ${s}`).toContain(s);
    }
  });

  it("生成器在库且提供 --check 复现性门禁", () => {
    expect(existsSync(path.join(ROOT, "scripts/shrink-ground-atlas.mjs"))).toBe(true);
    const gen = SRC("scripts/shrink-ground-atlas.mjs");
    expect(gen).toContain('process.argv.includes("--check")');
    expect(gen).toContain("Buffer.compare(");
    expect(gen).toContain("mainAlias: true");
  });
});
