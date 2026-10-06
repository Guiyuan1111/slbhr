/**
 * 神庙进度（localStorage 持久化）。
 * 结构：{ [关卡 filename]: { stars: 1|2|3, time: 秒 } }（只保留最佳）。
 * 解锁规则（对齐原版 tree 传播）：initial 节点恒可玩；任一 edges 相邻节点已通关 → 可玩。
 */
export interface LevelBest {
  stars: number;
  time: number;
}

const KEY = "fw-temple-progress-v1";

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
