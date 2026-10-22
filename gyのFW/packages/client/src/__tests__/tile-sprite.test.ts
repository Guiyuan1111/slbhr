/**
 * r38：TileSprite 私有画布在 WebGL 下的零消费消除。
 *
 * 失效模式都不报错：
 *  1) WebGL 下仍按显示尺寸构造 ⇒ 整幅 canvas + 等大 ImageData 白占（forest_01 背景
 *     1248×928 各 4.42MB），驻留账上却看不出一次绘制/上传；
 *  2) 只把 canvas 缩到 1×1 但没停 updateCanvas ⇒ 首帧渲染器又把 canvas 撑回整幅
 *     （TileSpriteWebGLRenderer 每帧调 updateCanvas），等于没省；
 *  3) 撑回显示尺寸时忘了 updateDisplayOrigin ⇒ displayOrigin 仍是 0.5×1，背景/
 *     绳索整体偏移半幅；尺寸不按构造器取整 ⇒ 与改前亚像素错位；
 *  4) Canvas 渲染器回退路径被一并改掉 ⇒ 非 WebGL 环境画面全黑（fillPattern 底片没了）。
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { makeTileSprite, tileSpriteSize } from "../scenes/tileSprite";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const GAME = "packages/client/src/scenes/GameScene.ts";
const TEMPLE = "packages/client/src/scenes/TempleScene.ts";
const HELPER = "packages/client/src/scenes/tileSprite.ts";

function fakeSprite() {
  return {
    width: 1,
    height: 1,
    dirty: true,
    displayFrame: { width: 256, height: 256 },
    updateDisplayOrigin: vi.fn(),
    updateCanvas: vi.fn(),
  };
}

function fakeScene(webgl: boolean) {
  const sprite = fakeSprite();
  const add = vi.fn(() => sprite);
  const scene = {
    sys: { game: { renderer: webgl ? { gl: {} } : {} } },
    add: { tileSprite: add },
  };
  return { scene: scene as never, sprite, add };
}

describe("r38 TileSprite 尺寸归一化（与 Phaser 构造器同口径）", () => {
  it("两维非零：向下取整", () => {
    expect(tileSpriteSize(1248.9, 928.4, 256, 256)).toEqual([1248, 928]);
    expect(tileSpriteSize(123.999, 19, 256, 256)).toEqual([123, 19]);
  });
  it("任一维为 0：该维回退到帧尺寸，另一维保持原值（不取整）", () => {
    expect(tileSpriteSize(0, 30, 256, 256)).toEqual([256, 30]);
    expect(tileSpriteSize(100, 0, 256, 512)).toEqual([100, 512]);
    expect(tileSpriteSize(0, 0, 256, 256)).toEqual([256, 256]);
  });
});

describe("r38 makeTileSprite", () => {
  it("WebGL：按 1×1 构造，撑回取整后的显示尺寸并刷新 displayOrigin", () => {
    const { scene, sprite, add } = fakeScene(true);
    const out = makeTileSprite(scene, 32, 32, 1248.9, 928.4, "TempleHall", "BackGround0000");
    expect(add).toHaveBeenCalledWith(32, 32, 1, 1, "TempleHall", "BackGround0000");
    expect(sprite.width).toBe(1248);
    expect(sprite.height).toBe(928);
    expect(sprite.updateDisplayOrigin).toHaveBeenCalledTimes(1);
    expect(out).toBe(sprite);
  });

  it("WebGL：updateCanvas 被停用（只清 dirty，不再重铺整幅画布）", () => {
    const { scene, sprite } = fakeScene(true);
    const original = sprite.updateCanvas;
    const out = makeTileSprite(scene, 0, 0, 100, 50, "TempleHall", "BackGround0000");
    sprite.dirty = true;
    expect((out as unknown as { updateCanvas: () => void }).updateCanvas).not.toBe(original);
    (out as unknown as { updateCanvas: () => void }).updateCanvas();
    expect(sprite.dirty).toBe(false);
    expect(original).not.toHaveBeenCalled();
  });

  it("WebGL：零尺寸沿用构造器回退（帧宽/帧高）", () => {
    const { scene, sprite } = fakeScene(true);
    makeTileSprite(scene, 0, 0, 0, 30, "TempleHall", "BackGround0000");
    expect(sprite.width).toBe(256);
    expect(sprite.height).toBe(30);
  });

  it("Canvas 回退：按原尺寸构造，updateCanvas 原样保留", () => {
    const { scene, sprite, add } = fakeScene(false);
    makeTileSprite(scene, 32, 32, 1248.9, 928.4, "TempleHall", "BackGround0000");
    expect(add).toHaveBeenCalledWith(32, 32, 1248.9, 928.4, "TempleHall", "BackGround0000");
    expect(sprite.updateCanvas).not.toHaveBeenCalled();
    expect(sprite.dirty).toBe(true);
  });
});

describe("r38 接线静态网", () => {
  it("房内/选关全部 TileSprite 走 makeTileSprite，无直呼点", () => {
    for (const file of [GAME, TEMPLE]) {
      const src = SRC(file);
      expect(src, `${file} 仍直呼 .tileSprite(`).not.toContain(".tileSprite(");
      expect(src).toContain('from "./tileSprite"');
    }
    expect(SRC(GAME).match(/makeTileSprite\(/g)?.length).toBe(5);
    expect(SRC(TEMPLE).match(/makeTileSprite\(/g)?.length).toBe(1);
  });

  it("客户端其余场景不得新增直呼 TileSprite（绕开 1×1 构造）", () => {
    const dir = path.join(ROOT, "packages/client/src");
    const offenders: string[] = [];
    for (const rel of readdirSync(dir, { recursive: true }) as string[]) {
      if (!rel.endsWith(".ts") || rel.endsWith(".test.ts") || rel === path.join("scenes", "tileSprite.ts")) continue;
      const src = readFileSync(path.join(dir, rel), "utf8");
      if (src.includes(".tileSprite(")) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("helper 保留 Canvas 回退，且 WebGL 分支只停画布重铺", () => {
    const src = SRC(HELPER);
    expect(src).toContain('"gl" in scene.sys.game.renderer');
    expect(src).toContain("webgl ? 1 : width");
    expect(src).toContain("sprite.dirty = false");
    expect(src).not.toContain("textures.remove");
  });
});
