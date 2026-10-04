/**
 * 关卡加载（服务端，node:fs 版）。
 *
 * 使用 level2 全机制解析器（@fw/shared/level2）；官方 Tiled JSON 的 tileset 是外部
 * 引用（source 为相对路径），按关卡文件所在目录解析。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLevel, type LevelData } from "@fw/shared/level2";

/** packages/server/src → 项目根 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** 按顺序查找的关卡目录（相对项目根） */
const LEVEL_DIRS = ["data/forest/levels", "data/tutorials/levels"];

export interface LevelBundle {
  id: string;
  /** 原始 JSON（客户端可复用同一份做渲染） */
  json: unknown;
  /** 解析后的物理数据（level2 全机制） */
  level: LevelData;
}

/** 关卡是否存在（供房间校验与 /api/level 路由） */
export function levelExists(id: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return false;
  for (const dir of LEVEL_DIRS) {
    try {
      readFileSync(join(ROOT, dir, `${id}.json`), "utf8");
      return true;
    } catch {
      /* 试下一个目录 */
    }
  }
  return false;
}

/** 全部可用关卡 id */
export function listLevelIds(): string[] {
  const ids: string[] = [];
  for (const dir of LEVEL_DIRS) {
    try {
      for (const f of readdirSync(join(ROOT, dir))) {
        if (f.endsWith(".json")) ids.push(f.replace(".json", ""));
      }
    } catch {
      /* 目录缺失忽略 */
    }
  }
  return ids;
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
