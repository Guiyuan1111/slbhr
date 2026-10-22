/**
 * r32 弹窗主图集画布收缩的静态防护网：r29 之后 Slim 的 111 帧里只有 6 帧真帧，
 * 但画布仍是 2048²（Game 进房批每次解 16.00MiB）。`PopupAssetsMini` 把 6 帧重打包到
 * 1086×696（2.88MiB），其余 105 帧以 `mainAlias` 别名到一块 4×4 透明区——JSON 仍声明
 * 全部帧名，`overlays.ts` 的降级路径（结算图集未落地时退回主图集）继续拿到透明帧而非
 * `__MISSING` 绿块。
 *
 * 失效模式与 r29/r30 同形且都静默：真帧坐标搬错会画到透明处、别名块若被像素污染会把
 * 本该隐藏的旧帧画出来、隔离带缺失会让缩放采样核读到邻帧。期望值全部独立回算自官方
 * PopupAssets.png/json；needs.mjs 的集合只作为被核对对象。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cropRaw, decodePng } from "../../../../scripts/png-raw.mjs";
import { ATLAS_SPECS, POPUP_EARLY } from "../../../../scripts/atlas-slim/needs.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const BOOT = "packages/client/src/scenes/BootScene.ts";
const MENUS = "packages/client/src/scenes/menus.ts";
const OVERLAYS = "packages/client/src/scenes/overlays.ts";
const MINI_PNG = "assets/atlasses/PopupAssetsMini.png";
const MINI_JSON = "assets/atlasses/PopupAssetsMini.json";
const SLIM_PNG = "assets/atlasses/PopupAssetsSlim.png";

const official = JSON.parse(readFileSync(path.join(ROOT, ATLAS_SPECS.popup.json), "utf8"));
const mini = JSON.parse(readFileSync(path.join(ROOT, MINI_JSON), "utf8"));
const officialByName = new Map<string, any>(official.frames.map((f: any) => [f.filename, f]));
const miniByName = new Map<string, any>(mini.frames.map((f: any) => [f.filename, f]));
const officialNames = official.frames.map((f: any) => f.filename);
const miniNames = mini.frames.map((f: any) => f.filename);
const realNames = mini.frames.filter((f: any) => !f.mainAlias).map((f: any) => f.filename);
const aliasNames = mini.frames.filter((f: any) => f.mainAlias).map((f: any) => f.filename);

const officialPng = decodePng(readFileSync(path.join(ROOT, ATLAS_SPECS.popup.officialPng)), "PopupAssets.png");
const miniPng = decodePng(readFileSync(path.join(ROOT, MINI_PNG)), "PopupAssetsMini.png");
const crop = (img: ReturnType<typeof decodePng>, f: any) => cropRaw(img, f.frame.x, f.frame.y, f.frame.w, f.frame.h);
const alpha = (img: ReturnType<typeof decodePng>, x: number, y: number) => img.data[(y * img.w + x) * 4 + 3];

/** overlays.ts 的降级路径会按名取的帧（结算图集未落地时的兜底） */
const FALLBACK_NAMES = [
  "FinishIcon0000",
  "DiamondsIcon0000",
  "SilverIcon0000",
  "TimeIcon0000",
  "TickIcon0000",
  "CrossIcon0000",
  "popupArrow0000",
  "popupArrow0001",
  "FinishStone0000",
];

describe("r32 弹窗主图集：6 真帧 + 105 透明别名", () => {
  it("帧账与官方一致：111 个名字一个不少、顺序不变；真帧正好是 POPUP_EARLY", () => {
    expect(miniNames).toEqual(officialNames);
    expect(new Set(realNames)).toEqual(new Set(POPUP_EARLY));
    expect(realNames.length).toBe(6);
    expect(aliasNames.length).toBe(105);
  });

  it("6 个真帧：几何照抄官方（只换容器坐标），像素逐字节相等", () => {
    const bad: string[] = [];
    for (const name of realNames) {
      const a = miniByName.get(name);
      const o = officialByName.get(name);
      expect({ w: a.frame.w, h: a.frame.h }, `${name} 尺寸`).toEqual({ w: o.frame.w, h: o.frame.h });
      expect(
        [a.rotated, a.trimmed, a.spriteSourceSize, a.sourceSize],
        `${name} 元数据被改动`
      ).toEqual([o.rotated, o.trimmed, o.spriteSourceSize, o.sourceSize]);
      if (Buffer.compare(crop(miniPng, a), crop(officialPng, o)) !== 0) bad.push(name);
    }
    expect(bad, "真帧像素与官方裁片不一致").toEqual([]);
  });

  it("105 个别名：4×4 透明块、源尺寸照抄官方、渲染尺寸只有 4×4（不会露出旧像素）", () => {
    const aliasRects = new Set<string>();
    for (const name of aliasNames) {
      const a = miniByName.get(name);
      const o = officialByName.get(name);
      expect({ w: a.frame.w, h: a.frame.h }, `${name} 别名尺寸`).toEqual({ w: 4, h: 4 });
      expect(a.sourceSize, `${name} 源尺寸`).toEqual(o.sourceSize);
      expect(a.trimmed, `${name} 不应走 trim`).toBe(false);
      aliasRects.add(`${a.frame.x},${a.frame.y}`);
    }
    expect(aliasRects.size, "别名块必须唯一").toBe(1);
    const [x, y] = [...aliasRects][0].split(",").map(Number);
    for (let r = y - 1; r <= y + 4; r++) {
      for (let c = x - 1; c <= x + 4; c++) {
        expect(alpha(miniPng, c, r), `别名块环带 ${c},${r}`).toBe(0);
      }
    }
  });

  it("每个真帧四周 1px 环带全透明（隔离带）", () => {
    const bad: string[] = [];
    for (const name of realNames) {
      const { x, y, w, h } = miniByName.get(name).frame;
      if (!(x - 1 >= 0 && y - 1 >= 0 && x + w + 1 <= miniPng.w && y + h + 1 <= miniPng.h)) {
        bad.push(`${name} 贴到了画布边`);
        continue;
      }
      for (let c = x - 1; c <= x + w; c++) {
        for (const r of [y - 1, y + h]) if (alpha(miniPng, c, r) !== 0) bad.push(`${name} 上下环带 ${c},${r}`);
      }
      for (let r = y - 1; r <= y + h; r++) {
        for (const c of [x - 1, x + w]) if (alpha(miniPng, c, r) !== 0) bad.push(`${name} 左右环带 ${c},${r}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("画布与线上字节：1086×696 解码 2.88MiB（原 16.00MiB），PNG+JSON 轻于 Slim+官方 JSON", () => {
    expect({ w: miniPng.w, h: miniPng.h }).toEqual({ w: 1086, h: 696 });
    expect({ w: officialPng.w, h: officialPng.h }).toEqual({ w: 2048, h: 2048 });
    expect(mini.meta.image).toBe("PopupAssetsMini.png");
    expect({ w: mini.meta.size.w, h: mini.meta.size.h }).toEqual({ w: 1086, h: 696 });
    const bytes = (f: string) => readFileSync(path.join(ROOT, f)).length;
    expect(bytes(MINI_PNG)).toBeLessThan(bytes(SLIM_PNG));
    expect(bytes(MINI_JSON)).toBeLessThan(bytes(ATLAS_SPECS.popup.json));
    expect(bytes(MINI_PNG) + bytes(MINI_JSON)).toBeLessThan(bytes(SLIM_PNG) + bytes(ATLAS_SPECS.popup.json));
    expect(miniPng.w * miniPng.h * 4).toBeLessThan(officialPng.w * officialPng.h * 4 * 0.2);
  });

  it("装载收敛：Boot 与 CompleteScene 都用 Mini 常量；降级路径的帧名全部是别名帧", () => {
    const boot = SRC(BOOT);
    const menus = SRC(MENUS);
    expect(boot).toContain('export const ATLAS_POPUP_PNG = "/assets/atlasses/PopupAssetsMini.png"');
    expect(boot).toContain('export const ATLAS_POPUP_JSON = "/assets/atlasses/PopupAssetsMini.json"');
    expect(boot).toContain("load.atlas(ATLAS_POPUP, ATLAS_POPUP_PNG, ATLAS_POPUP_JSON)");
    expect(menus).toContain("ATLAS_POPUP_JSON");
    expect(menus).toContain("this.load.atlas(ATLAS_POPUP, ATLAS_POPUP_PNG, ATLAS_POPUP_JSON)");
    for (const p of [BOOT, MENUS]) {
      expect(SRC(p), `${p} 仍引用 Slim 或官方 JSON`).not.toContain("PopupAssetsSlim.png");
    }
    // overlays 的兜底用 uiAtlas 变量取帧，源码里的字面量在这里钉死
    const overlays = SRC(OVERLAYS);
    expect(overlays).toContain('const uiAtlas = this.textures.exists(finishKey) ? finishKey : ATLAS_POPUP;');
    for (const name of FALLBACK_NAMES) {
      expect(miniByName.has(name), `${name} 必须留在 Mini JSON 里（降级路径）`).toBe(true);
      expect(miniByName.get(name).mainAlias, `${name} 应是透明别名帧`).toBe(true);
    }
  });

  it("生成器在库且提供 --check 复现性门禁", () => {
    expect(existsSync(path.join(ROOT, "scripts/shrink-popup-main.mjs"))).toBe(true);
    const gen = SRC("scripts/shrink-popup-main.mjs");
    expect(gen).toContain('process.argv.includes("--check")');
    expect(gen).toContain("Buffer.compare(");
    expect(gen).toContain("POPUP_EARLY");
    expect(gen).toContain("mainAlias: true");
  });
});
