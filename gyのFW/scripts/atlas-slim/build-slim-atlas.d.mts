/** scripts/atlas-slim/build-slim-atlas.mjs 的类型面。 */
import type { AtlasKey, AtlasSpec } from "./needs.mjs";

export interface BuildResult {
  key: AtlasKey;
  spec: AtlasSpec;
  w: number;
  h: number;
  declared: number;
  keep: string[];
  blank: string[];
  blankPixels: number;
  officialBytes: number;
  png: Buffer;
  saving: number;
  savingPct: number;
}

export function buildAll(root?: string): Promise<BuildResult[]>;
