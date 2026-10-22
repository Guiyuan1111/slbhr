/**
 * r34 庙宇图集拆张＋画布收缩的静态防护网。
 *
 * 现状问题：r26 清零后的 `TempleAssetsSlim.png` 仍是 1024×2048（解码 8.00MiB），60 帧里 42 帧是
 * 两扇门的开门动画——它们只在玩家踩门那一刻上屏，却随落定门一起进选关大厅/房间。
 *
 * 拆法：Core 14 真帧（落定门内必需）＋ 46 透明别名（42 Finish + 4 零消费帧），Finish 42 真帧
 * （create 之后 `kickTempleFinish` 取，离房释放）。两张都按 GUT=2 重打包，帧像素逐字节照抄官方。
 *
 * 失效模式都静默：坐标搬错 ⇒ 画透明；别名块被污染 ⇒ 藏起来的帧重新露出来；Core 少声明一个
 * Finish 帧名 ⇒ 漏改的消费点落进 Phaser `__BASE`（整张图集铺满屏）；Finish 未到位时直接 setFrame
 * ⇒ 门消失（而不是回落静帧）；离房不卸 ⇒ 选关大厅白背 3.72MiB。
 * 期望值全部独立回算自官方 PNG/JSON 与源码字面量；needs.mjs 只作为被核对对象。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cropRaw, decodePng } from "../../../../scripts/png-raw.mjs";
import { ATLAS_SPECS, TEMPLE_FIXED } from "../../../../scripts/atlas-slim/needs.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const BOOT = "packages/client/src/scenes/BootScene.ts";
const GAME = "packages/client/src/scenes/GameScene.ts";
const MAIN = "packages/client/src/main.ts";
const TEMPLE = "packages/client/src/scenes/TempleScene.ts";
const CORE_PNG = "assets/atlasses/Temples/forest/TempleAssetsCore.png";
const CORE_JSON = "assets/atlasses/Temples/forest/TempleAssetsCore.json";
const FINISH_PNG = "assets/atlasses/Temples/forest/TempleAssetsFinish.png";
const FINISH_JSON = "assets/atlasses/Temples/forest/TempleAssetsFinish.json";

const pad4 = (n: number) => String(n).padStart(4, "0");
const seq = (prefix: string, start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${pad4(start + i)}`);

/** 48 关装饰帧并集（r26 口径；needs.inspect 的 keep 是同一集合的被核对对象） */
const DECOR_FRAMES = [
  "decor_A0000",
  "decor_O_10000",
  "decor_O_20000",
  "decor_T_10000",
  "decor_T_20000",
  "decor_T_30000",
  "decor_V0000",
  "decor_X0000",
];
const EXPECTED_CORE = [...TEMPLE_FIXED, ...DECOR_FRAMES].sort();
const EXPECTED_FINISH = [...seq("FinishBoy", 1, 21), ...seq("FinishGirl", 1, 21)].sort();
const EXPECTED_DEAD = ["Icon0000", "Icon0001", "Icon0002", "Diamond1_Bkg_Empty0000"].sort();

const official = JSON.parse(readFileSync(path.join(ROOT, ATLAS_SPECS.temple.json), "utf8"));
const core = JSON.parse(readFileSync(path.join(ROOT, CORE_JSON), "utf8"));
const finish = JSON.parse(readFileSync(path.join(ROOT, FINISH_JSON), "utf8"));
const officialByName = new Map<string, any>(official.frames.map((f: any) => [f.filename, f]));
const coreByName = new Map<string, any>(core.frames.map((f: any) => [f.filename, f]));
const finishByName = new Map<string, any>(finish.frames.map((f: any) => [f.filename, f]));
const officialNames = official.frames.map((f: any) => f.filename);
const coreReal = core.frames.filter((f: any) => !f.mainAlias).map((f: any) => f.filename);
const coreAlias = core.frames.filter((f: any) => f.mainAlias).map((f: any) => f.filename);
const finishNames = finish.frames.map((f: any) => f.filename);

const officialPng = decodePng(readFileSync(path.join(ROOT, ATLAS_SPECS.temple.officialPng)), "TempleAssets.png");
const corePng = decodePng(readFileSync(path.join(ROOT, CORE_PNG)), "TempleAssetsCore.png");
const finishPng = decodePng(readFileSync(path.join(ROOT, FINISH_PNG)), "TempleAssetsFinish.png");
const crop = (img: ReturnType<typeof decodePng>, f: any) => cropRaw(img, f.frame.x, f.frame.y, f.frame.w, f.frame.h);
const alpha = (img: ReturnType<typeof decodePng>, x: number, y: number) => img.data[(y * img.w + x) * 4 + 3];
const bytes = (p: string) => readFileSync(path.join(ROOT, p)).length;

/** 真帧四周 1px 环带必须全透明（LINEAR 采样不渗到邻帧） */
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

describe("r34 庙宇拆张：Core 14 真帧 + 46 透明别名，Finish 42 真帧", () => {
  it("Core 声明官方全部 60 个帧名且顺序不变；真帧/别名集合独立回算一致", () => {
    expect(core.frames.map((f: any) => f.filename)).toEqual(officialNames);
    expect([...coreReal].sort()).toEqual(EXPECTED_CORE);
    expect([...finishNames].sort()).toEqual(EXPECTED_FINISH);
    expect([...coreAlias].sort()).toEqual([...EXPECTED_FINISH, ...EXPECTED_DEAD].sort());
    expect(coreReal.length).toBe(14);
    expect(finishNames.length).toBe(42);
  });

  it("真帧几何照抄官方（只换容器坐标），像素逐字节相等", () => {
    const bad: string[] = [];
    for (const [name, img, map] of [
      ...coreReal.map((n: string) => [n, corePng, coreByName] as const),
      ...finishNames.map((n: string) => [n, finishPng, finishByName] as const),
    ]) {
      const a = map.get(name);
      const o = officialByName.get(name);
      expect({ w: a.frame.w, h: a.frame.h }, `${name} 尺寸`).toEqual({ w: o.frame.w, h: o.frame.h });
      expect([a.rotated, a.trimmed, a.spriteSourceSize, a.sourceSize], `${name} 元数据被改动`).toEqual([
        o.rotated,
        o.trimmed,
        o.spriteSourceSize,
        o.sourceSize,
      ]);
      if (Buffer.compare(crop(img, a), crop(officialPng, o)) !== 0) bad.push(name);
    }
    expect(bad, "真帧像素与官方裁片不一致").toEqual([]);
  });

  it("46 个别名：4×4 透明块唯一、源尺寸照抄官方、环带全透明", () => {
    const rects = new Set<string>();
    for (const name of coreAlias) {
      const a = coreByName.get(name);
      const o = officialByName.get(name);
      expect({ w: a.frame.w, h: a.frame.h }, `${name} 别名尺寸`).toEqual({ w: 4, h: 4 });
      expect(a.sourceSize, `${name} 源尺寸`).toEqual(o.sourceSize);
      expect(a.trimmed, `${name} 不应走 trim`).toBe(false);
      rects.add(`${a.frame.x},${a.frame.y}`);
    }
    expect(rects.size, "别名块必须唯一").toBe(1);
    const [x, y] = [...rects][0].split(",").map(Number);
    for (let r = y - 1; r <= y + 4; r++) {
      for (let c = x - 1; c <= x + 4; c++) expect(alpha(corePng, c, r), `别名块环带 ${c},${r}`).toBe(0);
    }
  });

  it("每张图集的真帧四周 1px 环带全透明", () => {
    const bad = [
      ...coreReal.flatMap((n: string) => ringBad(corePng, coreByName.get(n), n)),
      ...finishNames.flatMap((n: string) => ringBad(finishPng, finishByName.get(n), n)),
    ];
    expect(bad).toEqual([]);
  });

  it("画布与线上字节：786×876 + 992×982，两件 PNG 合计轻于 Slim", () => {
    expect({ w: corePng.w, h: corePng.h }).toEqual({ w: 786, h: 876 });
    expect({ w: finishPng.w, h: finishPng.h }).toEqual({ w: 992, h: 982 });
    expect(core.meta.image).toBe("TempleAssetsCore.png");
    expect(finish.meta.image).toBe("TempleAssetsFinish.png");
    const slim = bytes(ATLAS_SPECS.temple.slimPng);
    expect(bytes(CORE_PNG) + bytes(FINISH_PNG)).toBeLessThan(slim);
    expect(bytes(CORE_JSON)).toBeLessThan(bytes(ATLAS_SPECS.temple.json));
    expect(bytes(CORE_PNG) + bytes(CORE_JSON)).toBeLessThan(slim);
    expect(corePng.w * corePng.h * 4).toBeLessThan(officialPng.w * officialPng.h * 4 * 0.34);
    expect(finishPng.w * finishPng.h * 4).toBeLessThan(officialPng.w * officialPng.h * 4 * 0.47);
  });
});

describe("r34 装载与门帧驱动", () => {
  it("Boot 的落定门只装 Core；Finish 由 loadTempleFinish 单独声明", () => {
    const boot = SRC(BOOT);
    expect(boot).toContain('export const ATLAS_TEMPLE_PNG = "/assets/atlasses/Temples/forest/TempleAssetsCore.png"');
    expect(boot).toContain('export const ATLAS_TEMPLE_JSON = "/assets/atlasses/Temples/forest/TempleAssetsCore.json"');
    expect(boot).toContain('export const ATLAS_TEMPLE_FINISH_PNG = "/assets/atlasses/Temples/forest/TempleAssetsFinish.png"');
    expect(boot).toContain('export const ATLAS_TEMPLE_FINISH_JSON = "/assets/atlasses/Temples/forest/TempleAssetsFinish.json"');
    expect(boot).toContain("load.atlas(ATLAS_TEMPLE, ATLAS_TEMPLE_PNG, ATLAS_TEMPLE_JSON)");
    expect(boot).toContain("load.atlas(ATLAS_TEMPLE_FINISH, ATLAS_TEMPLE_FINISH_PNG, ATLAS_TEMPLE_FINISH_JSON)");
    const gate = boot.slice(boot.indexOf("export function loadGameAtlases"), boot.indexOf("export function loadMechAtlas"));
    expect(gate).toContain("ATLAS_TEMPLE");
    expect(gate).not.toContain("ATLAS_TEMPLE_FINISH");
    const temple = SRC(TEMPLE);
    expect(temple).toContain("this.load.atlas(ATLAS_TEMPLE, ATLAS_TEMPLE_PNG, ATLAS_TEMPLE_JSON)");
  });

  it("Game create 在 chars-play 之后、结算图集之前预取门动画图集", () => {
    const game = SRC(GAME);
    const chars = game.indexOf("this.kickCharsPlay();");
    const finish = game.indexOf("this.kickTempleFinish();");
    const popup = game.indexOf("this.kickPopupFinish();");
    expect(chars).toBeGreaterThan(0);
    expect(finish).toBeGreaterThan(chars);
    expect(popup).toBeGreaterThan(finish);
    expect(game).toContain("loadTempleFinish(this.load)");
    expect(game).toContain("this.textures.exists(ATLAS_TEMPLE_FINISH)");
  });

  it("门帧驱动：Finish 未到位回落 Core 0000，且只在真正上屏后记帧号", () => {
    const game = SRC(GAME);
    const apply = game.slice(game.indexOf("private applyDoorFrame"), game.indexOf("private buildDoors"));
    expect(apply).toContain("frame > 0 && this.textures.exists(ATLAS_TEMPLE_FINISH)");
    expect(apply).toContain("s.setTexture(ATLAS_TEMPLE_FINISH");
    expect(apply).toContain("s.setTexture(ATLAS_TEMPLE, `${prefix}0000`)");
    expect(apply).toContain("return frame === 0");
    expect(game).toContain("const applied = this.applyDoorFrame(role, frame);");
    expect(game).toContain("if (applied) this.doorFrames.set(role, frame);");
    const reset = game.slice(game.indexOf("private resetRound"), game.indexOf("this.stairsSprites.get(role)?.destroy()"));
    expect(reset).toContain("this.applyDoorFrame(role, 0);");
  });

  it("离房释放门动画图集（3.72MiB 解码不留在选关大厅）", () => {
    const game = SRC(GAME);
    const main = SRC(MAIN);
    const release = game.slice(game.indexOf("static releaseTempleFinish"), game.indexOf("/** 地面：岩壁纹理"));
    expect(release).toContain("textures.remove(ATLAS_TEMPLE_FINISH)");
    expect(main).toContain("GameScene.releaseTempleFinish(phaser!.textures);");
    const grounds = main.indexOf("GameScene.releaseGrounds(phaser!.textures);");
    const finish = main.indexOf("GameScene.releaseTempleFinish(phaser!.textures);");
    expect(finish).toBeGreaterThan(grounds);
  });

  it("生成器在库且提供 --check 复现性门禁", () => {
    expect(existsSync(path.join(ROOT, "scripts/split-temple-atlas.mjs"))).toBe(true);
    const gen = SRC("scripts/split-temple-atlas.mjs");
    expect(gen).toContain('process.argv.includes("--check")');
    expect(gen).toContain("Buffer.compare(");
    expect(gen).toContain("mainAlias: true");
  });
});
