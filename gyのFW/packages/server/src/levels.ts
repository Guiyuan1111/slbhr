/**
 * 关卡加载（服务端，node:fs 版）。
 *
 * 官方 Tiled JSON 的 tileset 是外部引用（source 为相对路径），
 * 服务器与 Vite 公共目录里的相对位置一致，因此直接按相对路径解析。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLevel, type LevelData } from "@fw/shared";

/** packages/server/src → 项目根 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** 按顺序查找的关卡目录（相对项目根） */
const LEVEL_DIRS = ["data/forest/levels", "data/tutorials/levels"];

export interface LevelBundle {
  id: string;
  /** 原始 JSON（客户端可复用同一份做渲染） */
  json: unknown;
  /** 解析后的物理数据 */
  level: LevelData;
}

export function loadLevel(id: string): LevelBundle {
  for (const dir of LEVEL_DIRS) {
    const file = join(ROOT, dir, `${id}.json`);
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue; // 目录里没有，试下一个目录
    }
    const json = JSON.parse(raw) as object;
    const baseDir = dirname(file);
    const tilesetCache = new Map<string, object>();
    const getTileset = (source: string): object => {
      let ts = tilesetCache.get(source);
      if (!ts) {
        ts = JSON.parse(readFileSync(join(baseDir, source), "utf8")) as object;
        tilesetCache.set(source, ts);
      }
      return ts;
    };
    return { id, json, level: parseLevel(id, json, getTileset) };
  }
  throw new Error(`关卡不存在: ${id}（查找过 ${LEVEL_DIRS.join(", ")}）`);
}
