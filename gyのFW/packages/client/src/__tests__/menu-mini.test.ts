/**
 * r35 菜单图集画布收缩的静态防护网：`MenuAssetsSlim.png` 是 1024²（解码 4.00MiB），
 * 29 个 keep 帧的像素面积只有 362,483px。重打包到 753×577（1.66MiB）后，清零帧别名到
 * 4×4 透明块，官方 60 个帧名与顺序全部保留。
 *
 * 失效模式都不报错：
 *  1) 坐标搬错 ⇒ 帧画透明/串帧；
 *  2) 帧外 1px 邻域没照抄 ⇒ LINEAR 缩放采样在帧边渗到透明底，星碑底座/NewSign 边缘变淡；
 *  3) 清零帧别名块被污染 ⇒ 藏起来的 UI 族重新露出来；
 *  4) 少声明一个帧名 ⇒ 漏改的消费点落进 `__BASE`（整张图集铺满屏）；
 *  5) 树烘焙按 `cutX/cutY` 从源图取掩膜像素（TempleScene.maskFrame）——帧矩形内任何字节变化
 *     都会让 48 关的树浮雕悄悄偏色，故这里逐字节对 Slim。
 *
 * 期望值独立回算自官方 JSON/PNG 与 Slim，needs.mjs 只作为被核对对象。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { cropRaw, decodePng } from "../../../../scripts/png-raw.mjs";
import { ATLAS_SPECS, inspect } from "../../../../scripts/atlas-slim/needs.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const BOOT = "packages/client/src/scenes/BootScene.ts";
const TEMPLE = "packages/client/src/scenes/TempleScene.ts";
const MINI_PNG = "assets/atlasses/MenuAssetsMini.png";
const MINI_JSON = "assets/atlasses/MenuAssetsMini.json";
const SLIM_PNG = "assets/atlasses/MenuAssetsSlim.png";

const pad4 = (n: number) => String(n).padStart(4, "0");
const seq = (prefix: string, start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${pad4(start + i)}`);
/** 独立回算的 29 个 keep 帧（r31 口径：星碑三型 12 + 底座 4 + 按钮/HUD 13） */
const EXPECTED_KEEP = [
  "BackButton0000", "BackButton0001", "Lock0000", "MusicButton0000", "MusicButton0001",
  "FxButton0000", "FxButton0001", "Navy0000", "NewSign0000", "SettingsButton0002",
  "SettingsButton0003", "StoneButton0000", "StoneButton0001",
  ...["Diamond", "DiamondSpeed", "DiamondPuzzle"].flatMap((p) => seq(p, 0, 3)),
  ...["Diamond", "DiamondSpeed", "DiamondPuzzle", "DiamondDark"].map((p) => `${p}_Bkg_Mask0000`),
].sort();

const official = JSON.parse(readFileSync(path.join(ROOT, ATLAS_SPECS.menu.json), "utf8"));
const mini = JSON.parse(readFileSync(path.join(ROOT, MINI_JSON), "utf8"));
const officialByName = new Map<string, any>(official.frames.map((f: any) => [f.filename, f]));
const officialNames = official.frames.map((f: any) => f.filename as string);
const miniByName = new Map<string, any>(mini.frames.map((f: any) => [f.filename, f]));
const miniNames = mini.frames.map((f: any) => f.filename as string);
const real = mini.frames.filter((f: any) => !f.mainAlias);
const alias = mini.frames.filter((f: any) => f.mainAlias);
const realNames = real.map((f: any) => f.filename).sort();
const aliasNames = alias.map((f: any) => f.filename).sort();
const expectedAlias = officialNames.filter((n: string) => !EXPECTED_KEEP.includes(n)).sort();

const slimPng = decodePng(readFileSync(path.join(ROOT, SLIM_PNG)), "MenuAssetsSlim.png");
const miniPng = decodePng(readFileSync(path.join(ROOT, MINI_PNG)), "MenuAssetsMini.png");
const crop = (img: ReturnType<typeof decodePng>, f: any) => cropRaw(img, f.frame.x, f.frame.y, f.frame.w, f.frame.h);
const rgbaAt = (img: ReturnType<typeof decodePng>, x: number, y: number) => {
  const i = (y * img.w + x) * 4;
  return img.data.subarray(i, i + 4);
};
const alpha = (img: ReturnType<typeof decodePng>, x: number, y: number) => img.data[(y * img.w + x) * 4 + 3];
const bytes = (p: string) => readFileSync(path.join(ROOT, p)).length;
const same = (a: Buffer, b: Buffer) => Buffer.compare(a, b) === 0;
let needs: Awaited<ReturnType<typeof inspect>>;
beforeAll(async () => {
  needs = await inspect(ROOT);
});
/** 区块 = 帧矩形 + 1px 邻域 */
const blockOf = (f: any) => ({ x: f.frame.x - 1, y: f.frame.y - 1, w: f.frame.w + 2, h: f.frame.h + 2 });
const clampSrc = (f: any, dx: number, dy: number) => {
  const x = Math.min(Math.max(f.frame.x + dx - 1, 0), slimPng.w - 1);
  const y = Math.min(Math.max(f.frame.y + dy - 1, 0), slimPng.h - 1);
  return rgbaAt(slimPng, x, y);
};

describe("MenuAssetsMini 声明面", () => {
  it("60 个帧名与官方逐一相同、顺序不变；29 真帧 + 31 别名", () => {
    expect(mini.frames.length).toBe(60);
    expect(miniNames).toEqual(officialNames);
    expect(real.length).toBe(29);
    expect(alias.length).toBe(31);
    expect(realNames).toEqual(EXPECTED_KEEP);
    expect(aliasNames).toEqual(expectedAlias);
  });

  it("真帧几何逐项照抄官方：w/h/sourceSize/trimmed/rotated", () => {
    for (const f of real) {
      const o = officialByName.get(f.filename);
      expect(f.frame.w, `${f.filename} w`).toBe(o.frame.w);
      expect(f.frame.h, `${f.filename} h`).toBe(o.frame.h);
      expect(f.sourceSize, `${f.filename} sourceSize`).toEqual(o.sourceSize);
      expect(f.trimmed).toBe(false);
      expect(f.rotated).toBe(false);
    }
  });

  it("别名帧共用一块 4×4 透明区，sourceSize 照抄官方", () => {
    const rects = new Set(alias.map((f: any) => JSON.stringify(f.frame)));
    expect(rects.size).toBe(1);
    const r = alias[0].frame;
    expect([r.w, r.h]).toEqual([4, 4]);
    for (const f of alias) expect(f.sourceSize, `${f.filename} sourceSize`).toEqual(officialByName.get(f.filename).sourceSize);
  });

  it("官方全部帧 trimmed:false 且无偏移（重打包几何等价前提）", () => {
    const bad = official.frames.filter(
      (f: any) => f.trimmed || f.rotated || f.spriteSourceSize?.x || f.spriteSourceSize?.y,
    );
    expect(bad.map((f: any) => f.filename)).toEqual([]);
  });
});

describe("MenuAssetsMini 像素账", () => {
  it("PNG 幅面与 meta 一致；解码 ≤1.75MiB 且 ≤1024² 的 45%；PNG/JSON 预算", () => {
    expect([miniPng.w, miniPng.h]).toEqual([mini.meta.size.w, mini.meta.size.h]);
    expect(mini.meta.image).toBe("MenuAssetsMini.png");
    expect(miniPng.w).toBeLessThanOrEqual(1024);
    expect(miniPng.h).toBeLessThanOrEqual(1024);
    expect(miniPng.w * miniPng.h * 4).toBeLessThanOrEqual(Math.floor(1.75 * 1048576));
    expect(miniPng.w * miniPng.h).toBeLessThanOrEqual(Math.floor(0.45 * 1024 * 1024));
    expect(bytes(MINI_PNG)).toBeLessThanOrEqual(80_000);
    expect(bytes(MINI_JSON)).toBeLessThanOrEqual(11_000);
    // 线上合计必须小于 r31 的 Slim PNG + 官方 JSON（96,848B）
    expect(bytes(MINI_PNG) + bytes(MINI_JSON)).toBeLessThan(bytes(SLIM_PNG) + bytes(ATLAS_SPECS.menu.json));
  });

  it("每个真帧的矩形像素与 Slim 同坐标裁剪逐字节相等（树烘焙读的就是这块源图）", () => {
    for (const f of real) {
      const o = officialByName.get(f.filename);
      const expectPx = crop(slimPng, o);
      const gotPx = crop(miniPng, f);
      expect(same(gotPx, expectPx), `${f.filename} 帧像素`).toBe(true);
    }
  });

  it("每个真帧的帧外 1px 邻域等于 Slim 的 CLAMP 采样（LINEAR 缩放边缘不渗色）", () => {
    for (const f of real) {
      const o = { frame: officialByName.get(f.filename).frame };
      const { w, h } = f.frame;
      for (let dy = 0; dy < h + 2; dy++) {
        for (let dx = 0; dx < w + 2; dx++) {
          if (dx >= 1 && dx < w + 1 && dy >= 1 && dy < h + 1) continue;
          const got = rgbaAt(miniPng, f.frame.x - 1 + dx, f.frame.y - 1 + dy);
          const want = clampSrc(o, dx, dy);
          if (!same(got, want)) throw new Error(`${f.filename} 邻域 ${dx},${dy} 不一致`);
        }
      }
    }
  });

  it("区块外全透明；区块两两不相交；画布四周恰好留 1px", () => {
    const blocks: Array<{ name: string; x: number; y: number; w: number; h: number }> = real.map((f: any) => ({
      name: f.filename,
      ...blockOf(f),
    }));
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i];
        const b = blocks[j];
        const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
        const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlapX && overlapY, `${a.name} 与 ${b.name} 区块重叠`).toBe(false);
      }
    }
    const covered = new Uint8Array(miniPng.w * miniPng.h);
    for (const b of blocks) for (let r = b.y; r < b.y + b.h; r++) covered.fill(1, r * miniPng.w + b.x, r * miniPng.w + b.x + b.w);
    for (let y = 0; y < miniPng.h; y++) {
      for (let x = 0; x < miniPng.w; x++) {
        if (!covered[y * miniPng.w + x] && alpha(miniPng, x, y) !== 0) {
          throw new Error(`区块外像素不透明：${x},${y}`);
        }
      }
    }
    expect(Math.min(...blocks.map((b) => b.x))).toBe(1);
    expect(Math.min(...blocks.map((b) => b.y))).toBe(1);
    expect(Math.max(...blocks.map((b) => b.x + b.w))).toBe(miniPng.w - 1);
    const aliasRect = alias[0].frame;
    expect(Math.max(...blocks.map((b) => b.y + b.h), aliasRect.y + aliasRect.h)).toBe(miniPng.h - 1);
    expect(aliasRect.x).toBe(1);
    expect(aliasRect.y).toBeGreaterThanOrEqual(Math.max(...blocks.map((b) => b.y + b.h)));
  });

  it("别名块及其 1px 环带全透明（清零帧不会重新露出来）", () => {
    const r = alias[0].frame;
    for (let y = r.y - 1; y <= r.y + r.h; y++) {
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        if (x < 0 || y < 0 || x >= miniPng.w || y >= miniPng.h) continue;
        expect(alpha(miniPng, x, y), `别名环带 ${x},${y}`).toBe(0);
      }
    }
  });
});

describe("MenuAssetsMini 装载与消费口径", () => {
  it("BootScene 指向 Mini PNG/JSON，且是菜单图集的唯一装载点", () => {
    const boot = SRC(BOOT);
    expect(boot).toContain('export const ATLAS_MENU_PNG = "/assets/atlasses/MenuAssetsMini.png"');
    expect(boot).toContain('export const ATLAS_MENU_JSON = "/assets/atlasses/MenuAssetsMini.json"');
    expect(boot).toContain("load.atlas(ATLAS_MENU, ATLAS_MENU_PNG, ATLAS_MENU_JSON)");
    expect(boot).not.toContain("MenuAssetsSlim.png");
    expect(boot).not.toContain('/assets/atlasses/MenuAssets.json"');
  });

  it("树烘焙继续按帧 cutX/cutY 从源图取掩膜（重打包后坐标由 JSON 决定，不能写死）", () => {
    const temple = SRC(TEMPLE);
    expect(temple).toContain("menuTex.getSourceImage()");
    expect(temple).toContain("f.cutX");
    expect(temple).toContain("f.cutY");
  });

  it("keep 口径与 needs.mjs 一致（29/31），生成器在库", () => {
    expect([...needs.atlases.menu.keep].sort()).toEqual(EXPECTED_KEEP);
    expect([...needs.atlases.menu.blank].sort()).toEqual(expectedAlias);
    expect(existsSync(path.join(ROOT, "scripts/shrink-menu-main.mjs"))).toBe(true);
  });
});
