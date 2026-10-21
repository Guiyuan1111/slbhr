/** scripts/png-raw.mjs 的类型面（实现是 JSDoc 化的 ESM；本声明只为让 TS 侧的测试与脚本能用上它）。 */

export interface RgbaImage {
  w: number;
  h: number;
  depth: number;
  color: number;
  interlace: number;
  /** 原始 RGBA 样本，逐行紧密排列（w*h*4 字节），不经任何色彩管理 */
  data: Buffer;
  /** 非 IDAT/IEND 的辅助块，原序原字节（cHRM/pHYs/iTXt…），重编码时写回 */
  ancillary: { type: string; data: Buffer }[];
  /** 除 IDAT 外的块序指纹，用于断言"重编码没改色彩解释" */
  chunks: string;
}

export function decodePng(buf: Buffer, tag: string): RgbaImage;
export function cropRaw(img: RgbaImage, x: number, y: number, w: number, h: number): Buffer;
export function encodePngRgba(w: number, h: number, data: Buffer, ancillary?: { type: string; data: Buffer }[]): Buffer;
