import type Phaser from "phaser";

/** 复刻 Phaser TileSprite 构造器的尺寸归一化：两维都非零时向下取整，
 *  任一维为 0 时该维回退到帧的显示尺寸。 */
export function tileSpriteSize(width: number, height: number, frameW: number, frameH: number): [number, number] {
  if (!width || !height) return [width || frameW, height || frameH];
  return [Math.floor(width), Math.floor(height)];
}

/**
 * WebGL 下 TileSprite 的私有画布只服务于 Canvas 渲染器的 fillPattern 底片；
 * WebGL 渲染器只绑定 pot 尺寸的 fillPattern（见 TileSpriteWebGLRenderer）。
 * 按显示尺寸构造会白占一张整幅 canvas 与等大 ImageData（forest_01 背景
 * 1248×928 → 4.42MB + 4.42MB），却在 WebGL 里一次都不绘制、不上传。
 *
 * 因此 WebGL 下按 1×1 构造，再把显示尺寸与 displayOrigin 撑回构造器本会落到的值，
 * 并停掉每帧的 updateCanvas 画布重铺——渲染输入（displayFrame/fillPattern/
 * tileScale/tilePosition）不变。
 */
export function makeTileSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  key: string,
  frame?: string | number,
): Phaser.GameObjects.TileSprite {
  const webgl = "gl" in scene.sys.game.renderer;
  const sprite = scene.add.tileSprite(x, y, webgl ? 1 : width, webgl ? 1 : height, key, frame);
  if (webgl) {
    // displayFrame/updateCanvas 在 Phaser 类型里是私有成员，运行时存在（见 TileSprite.js）
    const internal = sprite as unknown as {
      displayFrame: { width: number; height: number };
      updateCanvas: () => void;
    };
    const [w, h] = tileSpriteSize(width, height, internal.displayFrame.width, internal.displayFrame.height);
    sprite.width = w;
    sprite.height = h;
    sprite.updateDisplayOrigin();
    internal.updateCanvas = () => {
      sprite.dirty = false;
    };
  }
  return sprite;
}
