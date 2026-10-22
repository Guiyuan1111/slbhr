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
export const ATLAS_SPECS: Record<"mech" | "temple" | "popup", AtlasSpec>;
export type AtlasKey = keyof typeof ATLAS_SPECS;
export const MECH_FIXED: string[];
export const TEMPLE_FIXED: string[];
export const POPUP_FIXED: string[];
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
export function popupNeed(type: string): string[];
export function inspect(root?: string): Promise<Inspection>;
