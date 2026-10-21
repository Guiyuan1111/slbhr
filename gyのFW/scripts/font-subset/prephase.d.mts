/** scripts/font-subset/prephase.mjs 的类型面（口径层，生成器与静态测试共用）。 */
import type { RgbaImage } from "../png-raw.mjs";

export interface GlyphRect {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
}

export interface Fnt {
  size: number;
  padding: number[];
  scaleW: number;
  scaleH: number;
  pages: number;
  lineHeight: number;
  base: number;
  /** `<char>` 行数（同 id 重复时多于生效条数） */
  charLines: number;
  dupes: { id: number; prev: GlyphRect; next: GlyphRect }[];
  glyphs: Map<number, GlyphRect>;
}

export interface PrephaseSource {
  file: string;
  line: number;
  texts: string[];
  note?: string;
}
export interface PrephaseDynamic {
  file: string;
  line: number;
  chars: string;
  note?: string;
}
export interface PrephaseSpec {
  _why: string;
  _ring: number;
  _ringWhy: string;
  sources: PrephaseSource[];
  dynamic: PrephaseDynamic[];
}

export interface KeptGlyph {
  ch: string;
  code: number;
  glyph: GlyphRect;
  where: string[];
}

export interface Subset {
  out: Buffer;
  keepMask: Uint8Array;
  boxes: { ch: string; code: number; where: string[]; box: { x: number; y: number; width: number; height: number } | null; ringPx?: number }[];
  owner: Int32Array;
  overlaps: number;
  keptPixels: number;
}

export interface SubsetAudit {
  pixels: number;
  framePixels: number;
  droppedFramePixels: number;
  ringInkInOtherFrames: number;
  outsideNonZero: number;
  inkTotal: number;
  inkFrame: number;
  inkRingOnly: number;
}

export function parseFnt(path: string): Fnt;
export function prephaseChars(spec: PrephaseSpec, fnt: Fnt): {
  chars: Map<string, string[]>;
  kept: KeptGlyph[];
  noGlyph: { ch: string; where: string[] }[];
};
export function loadSpec(root: string): PrephaseSpec;
export function composeSubset(srcImg: RgbaImage, fnt: Fnt, kept: KeptGlyph[], ring: number): Subset;
export function auditSubset(srcImg: RgbaImage, subset: Subset, fnt: Fnt, kept: KeptGlyph[]): SubsetAudit;
export function loadFontAtlas(pngPath: string, fnt: Fnt): RgbaImage;
export function inkOf(img: RgbaImage): number;
