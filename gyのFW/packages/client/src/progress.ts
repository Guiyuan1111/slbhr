/**
 * 神庙进度（localStorage 持久化）。
 * 结构：{ [关卡 filename]: { stars: 1|2|3, time: 秒 } }（只保留最佳）。
 * 解锁规则（对齐原版 tree 传播）：initial 节点恒可玩；任一 edges 相邻节点已通关 → 可玩。
 * played 集（0.3.39，#13 NewSign）：oracle ProgressModel 逐关 played 布林
 * （setPlayed 于 LevelMenu.startLevel 点击进关即置，bundle:1935016；isNew 计算
 * :2150010 区——`played||initial||locked → 非 new`，否则 isNew=true 且 state>0 时
 * 置 temple.hasNew）。我方以独立键存 filename 集（不改 v1 结构）。
 */
export interface LevelBest {
  stars: number;
  time: number;
}

const KEY = "fw-temple-progress-v1";
const PLAYED_KEY = "fw-played-v1";

export function loadProgress(): Record<string, LevelBest> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export function saveBest(filename: string, stars: number, timeSec: number): void {
  const all = loadProgress();
  const prev = all[filename];
  if (!prev || stars > prev.stars || (stars === prev.stars && timeSec < prev.time)) {
    all[filename] = { stars, time: Math.round(timeSec) };
    localStorage.setItem(KEY, JSON.stringify(all));
  }
}

export function starsOf(filename: string): number {
  return loadProgress()[filename]?.stars ?? 0;
}

/** 已进关卡 filename 集（NewSign 徽标门；缺失/损坏按空集处理） */
export function loadPlayed(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(PLAYED_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.map(String) : []);
  } catch {
    return new Set();
  }
}

/** 进关即标记（oracle setPlayed bundle:1935016 同语义；幂等） */
export function markPlayed(filename: string): void {
  const set = loadPlayed();
  if (set.has(filename)) return;
  set.add(filename);
  localStorage.setItem(PLAYED_KEY, JSON.stringify([...set]));
}
