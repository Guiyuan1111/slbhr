/**
 * 神庙进度（localStorage 持久化）。
 * 结构：{ [关卡 filename]: { stars: 1|2|3, time: 秒 } }（只保留最佳）。
 * 解锁规则（对齐原版 tree 传播）：initial 节点恒可玩；任一 edges 相邻节点已通关 → 可玩。
 * played 集（0.3.39，#13 NewSign）：oracle ProgressModel 逐关 played 布林
 * （setPlayed 于 LevelMenu.startLevel 点击进关即置，bundle:1935016；isNew 计算
 * :2150010 区——`played||initial||locked → 非 new`，否则 isNew=true 且 state>0 时
 * 置 temple.hasNew）。我方以独立键存 filename 集（不改 v1 结构）。
 * 全通庆典旗（0.3.40，P-02 #34）：oracle progress 双旗，与 played 完全独立——
 * - gameComplete：持久旗，process() 内 `this.set("gameComplete", b)`（:2149538），b=全关 best≥3 星；
 * - firstComplete：**运行时瞬态**，`b && !get("gameComplete") && (this.firstComplete = !0)`
 *   （:2149507），通关 merge（update :2153011 仅 best 刷新时）置位；
 *   消费=Menu/LevelMenu afterAddContent 首行置回 !1 并 bare start("gameComplete")
 *   （Menu :1939446/:1939549；LevelMenu :1932272/:1932358）——刷新页面即丢失（oracle 同：
 *   进程内旗，不落盘），gameComplete 已持久化故不重播。
 * 我方：fw-gamecomplete-v1 存 gameComplete；firstComplete 模块级内存变量。旧门
 * fw-complete-shown（0.3.38 临时键）读时迁移为 gameComplete=1 后删除（已庆不再重播）。
 */
export interface LevelBest {
  stars: number;
  time: number;
}

const KEY = "fw-temple-progress-v1";
const PLAYED_KEY = "fw-played-v1";
const COMPLETE_KEY = "fw-gamecomplete-v1";
const LEGACY_SHOWN_KEY = "fw-complete-shown";

/** 存储写入失败（隐私模式等）只提示一次，避免结算/标记链路逐次刷屏 */
let storageWarned = false;
function warnStorageFailed(): void {
  if (storageWarned) return;
  storageWarned = true;
  console.warn("[fw] localStorage 写入失败（隐私模式等），进度仅在本次会话内生效");
}

export function loadProgress(): Record<string, LevelBest> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

/** 存档写入且 best 被刷新时返回 true（oracle update :2152850 区 `betterThan → best=state` 门；
 *  调用方据此决定是否走 process 置位段——oracle 未刷新 best 不调 process） */
export function saveBest(filename: string, stars: number, timeSec: number): boolean {
  const all = loadProgress();
  const prev = all[filename];
  if (!prev || stars > prev.stars || (stars === prev.stars && timeSec < prev.time)) {
    all[filename] = { stars, time: Math.round(timeSec) };
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      // 写失败仍按成绩已刷新返回 true，结算链（星级/庆典判定）继续走
      warnStorageFailed();
    }
    return true;
  }
  return false;
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
  try {
    localStorage.setItem(PLAYED_KEY, JSON.stringify([...set]));
  } catch {
    warnStorageFailed();
  }
}

// —— 全通庆典双旗（P-02 #34，oracle ProgressModel.process/update 字节同构） ——

/** gameComplete 持久旗（oracle progress 键 "gameComplete"；缺旧门迁移：fw-complete-shown
 *  有值=0.3.38 门下已庆过，落 gameComplete=1 后删旧键，防升级重播） */
export function loadGameComplete(): boolean {
  try {
    const v = localStorage.getItem(COMPLETE_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
    if (localStorage.getItem(LEGACY_SHOWN_KEY)) {
      localStorage.setItem(COMPLETE_KEY, "1");
      localStorage.removeItem(LEGACY_SHOWN_KEY);
      return true;
    }
    return false;
  } catch {
    // 隐私模式 getItem 也可能抛 SecurityError：按未完成处理，不阻塞菜单/选关
    return false;
  }
}

/** firstComplete 瞬态旗：进程内变量，不落盘（oracle :1939549 消费即清、刷新即失——语义照抄） */
let firstComplete = false;

/** 通关 merge 后的 process 置位段（oracle :2149483-:2149538 逐句）：
 *  `b && !get("gameComplete") && (this.firstComplete = !0), this.set("gameComplete", b)`。
 *  仅在 best 刷新路径调用（saveBest true），oracle update 同门；全 3 星判定（b）由调用方
 *  以 temple.json 全集计算后传入（oracle process 遍历 temples 同口径）。 */
export function processWinResult(allThreeStar: boolean): void {
  if (allThreeStar && !loadGameComplete()) firstComplete = true;
  try {
    localStorage.setItem(COMPLETE_KEY, allThreeStar ? "1" : "0");
  } catch {
    /* 隐身模式等存储失败：庆典降级为本次会话内一次性（瞬态旗仍在），不阻塞通关流 */
  }
}

/** 消费点取旗（oracle Menu/LevelMenu.afterAddContent 首行 `firstComplete && (置 !1, 启动庆典)`）：
 *  读即清，两消费点（Temple≡LevelMenu / Menu≡Menu）先到先得，与 oracle 同。 */
export function takeFirstComplete(): boolean {
  const v = firstComplete;
  firstComplete = false;
  return v;
}
