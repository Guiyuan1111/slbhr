/** scripts/atlas-slim/needs.mjs 的类型面（实现是 ESM；声明只为让 vitest/TS 侧测试有类型）。 */

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasMetaFrame {
  filename: string;
  frame: FrameRect;
}

export interface AtlasMeta {
  frames: AtlasMetaFrame[];
  meta?: { image?: string; size?: { w: number; h: number } };
}

export interface AtlasSpec {
  json: string;
  officialPng: string;
  slimPng: string;
}

export const REPO_ROOT: string;
export const ATLAS_SPECS: Record<"mech" | "temple" | "popup" | "menu", AtlasSpec>;
export type AtlasKey = keyof typeof ATLAS_SPECS;
export const MECH_FIXED: string[];
export const TEMPLE_FIXED: string[];
/** r29：主图集保留的进房即上屏面（暂停键/板底/彩带） */
export const POPUP_EARLY: string[];
/** r31：MenuAssets 的固定消费面（选关星碑四套 + 底座 + 按钮/HUD） */
export const MENU_TYPE_PREFIXES: readonly string[];
export const MENU_FIXED: string[];
/** 结算图集按关类型的星碑前缀（general 无类型后缀；speed/puzzle 带） */
export const FINISH_STONE_PREFIX: Record<"general" | "speed" | "puzzle", string>;
export const POPUP_FINISH_TYPES: readonly ("general" | "speed" | "puzzle")[];
export function finishVariant(type?: string | null): "general" | "speed" | "puzzle";
export function popupFinishNeed(type?: string | null): string[];
export const DEAD_RULES: Record<AtlasKey, { families: string[]; exact: string[] }>;

export interface LevelEntry {
  id: number;
  filename: string;
  type: string;
  /** parseLevel 的产物（关卡字段面）；测试只读 decor/类型，脚本内部消费更多 */
  parsed: any;
  decor: string[];
}

export interface AtlasInspection {
  declared: string[];
  keep: string[];
  blank: string[];
  meta: AtlasMeta;
}

export interface Inspection {
  levels: LevelEntry[];
  keep: Record<AtlasKey, Set<string>>;
  atlases: Record<AtlasKey, AtlasInspection>;
}

export function verifyPins(root?: string): void;
export function decorFrames(level: any, makeRng: (seed: string) => () => number): string[];
export function mechNeed(level: any): { first: string[]; event: string[] };
export function inspect(root?: string): Promise<Inspection>;
