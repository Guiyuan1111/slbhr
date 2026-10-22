/** scripts/font-subset/room.mjs 的类型面（房内链共用口径层，生成器与静态测试共用）。 */
import type { Fnt, GlyphRect } from "./prephase.mjs";

export interface RoomLiteralSite {
  file: string;
  line: number;
  texts: string[];
  note: string;
}
export interface RoomDynamicSite {
  file: string;
  line: number;
  re: RegExp;
  chars: string;
  note: string;
}

export const ROOM_LITERAL_SITES: RoomLiteralSite[];
export const ROOM_DYNAMIC_SITES: RoomDynamicSite[];

export function assertRoomPins(root: string): void;
export function diskLevelPaths(root: string): Set<string>;

export interface RoomLevel {
  id: number;
  filename: string;
  selectedLayer: string;
  texts: string[];
}
export function roomLevelTexts(root: string): Promise<RoomLevel[]>;

export interface RoomKeptGlyph {
  ch: string;
  code: number;
  glyph: GlyphRect;
  where: string;
}
export function roomChars(root: string, fnt: Fnt): Promise<{
  chars: Set<string>;
  kept: RoomKeptGlyph[];
  noGlyph: { ch: string; where: string }[];
}>;
/** 基础集（r28）：行钉字面量 + 动态数字点，不依赖关卡；46/48 关只装它。 */
export function roomBaseChars(root: string, fnt: Fnt): {
  chars: Set<string>;
  kept: RoomKeptGlyph[];
  noGlyph: { ch: string; where: string }[];
};
/** 有教学文本的关卡（客户端按关选字体变体的依据）。 */
export function tutorialLevels(root: string): Promise<RoomLevel[]>;
export function roomCharsFromOfficial(root: string, fntPath?: string): Promise<{
  fnt: Fnt;
  chars: Set<string>;
  kept: RoomKeptGlyph[];
  noGlyph: { ch: string; where: string }[];
}>;
