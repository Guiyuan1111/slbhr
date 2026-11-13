/**
 * 关卡加载（服务端，node:fs 版）。
 *
 * 使用 level2 全机制解析器（@fw/shared/level2）；官方 Tiled JSON 的 tileset 是外部
 * 引用（source 为相对路径），按关卡文件所在目录解析。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLevel, type LevelData } from "@fw/shared/level2";

/** packages/server/src → 项目根 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** 按顺序查找的关卡目录（相对项目根）。light 第二部、ice 第三部（2026-10-25）、crystal 第四部
 *  （2026-10-30）入库；各部首关（forest_01/light_01/ice_02 等）在 tutorials 目录，故其优先级最低兜底。 */
const LEVEL_DIRS = [
  "data/forest/levels",
  "data/light/levels",
  "data/ice/levels",
  "data/crystal/levels",
  "data/elements/crystal/levels",
  "data/elements/fire/levels",
  "data/elements/forest/levels",
  "data/elements/ice/levels",
  "data/elements/light/levels",
  "data/elements/water/levels",
  "data/elements/wind/levels",
  "data/fairytales/levels",
  "data/tutorials/levels",
];

export interface LevelBundle {
  id: string;
  /** 原始 JSON（客户端可复用同一份做渲染） */
  json: unknown;
  /** 解析后的物理数据（level2 全机制） */
  level: LevelData;
}

/** 关卡是否存在（供房间校验与 /api/level 路由） */
const existsCache = new Set<string>();

export function levelExists(id: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return false;
  if (existsCache.has(id)) return true;
  for (const dir of LEVEL_DIRS) {
    try {
      // #45：statSync 存在性检查替代整文件 readFileSync（最大 ~60KB/次，/api/level/:id
      // 热路径可被低成本刷 IO/CPU）；关卡集合进程内不变，正例缓存后 O(1)。
      if (statSync(join(ROOT, dir, `${id}.json`)).isFile()) {
        existsCache.add(id);
        return true;
      }
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

/**
 * 逐关卡解析缓存（r2 perf 件5，2026-10-18）：loadLevel 每次调用都重新
 * readFileSync+JSON.parse 关卡与图块集并全量 parseLevel——房间创建
 * （ForestRoom onCreate / 切关）与多世界基准（perf-mem/serialize/sync、
 * det 每关双世界）逐次重付同成本。
 *
 * 共享安全（LevelData 为纯定义数据）：kernel 构建链只读不写（mechanisms/
 * character/build 全量审计无 def/level 字段赋值），World.reset() 整关重开
 * 本就复用同一 LevelData 实例重建世界——多世界共享解析产物的不变式既有。
 * 缓存键=关卡 id，条目=完整 LevelBundle（json 一并缓存，/api/level/:id 同享），
 * 上界=关卡总数（静态数据集，48 关量级）；关卡编辑属静态数据变更，走服务
 * 重启生效——与既有模型一致，不做失效监听。
 */
const bundleCache = new Map<string, LevelBundle>();

export function loadLevel(id: string): LevelBundle {
  const hit = bundleCache.get(id);
  if (hit) return hit;
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
    const bundle: LevelBundle = { id, json, level: parseLevel(id, json, getTileset) };
    bundleCache.set(id, bundle);
    return bundle;
  }
  throw new Error(`关卡不存在: ${id}（查找过 ${LEVEL_DIRS.join(", ")}）`);
}
