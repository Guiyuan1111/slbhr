/**
 * E 部（elements）multi 选关纯逻辑（TempleScene multi 模式的数据层；零 Phaser 依赖可直测，
 * mechSmoothing 先例：Scene 抽出纯逻辑供 vitest 直接 import——phaser 包在 node 下 import 即炸
 * "window is not defined"）。
 *
 * 语义源：E 包 bundle（Fireboy-and-Watergirl/output/E/js/init.8186f59168991c89.js，行号=字节
 * 偏移）+ 7 份 data/elements/各庙/temple.json 实况；汇总见 note/evidence/2026-10-30-elements
 * /01号档 §3。关键消费点：
 * - Progress.process @2198800 区：completedCount = 本庙 best 非空关数；learnedElements =
 *   全庙通关关 elements 并集；temple.elements := levels[0].elements；
 *   softLocked = !allIsLearned(temple, true)；hasNew = ∃level(isNew ∧ state>0 ∧ 非(forest∧id 0))。
 * - Progress.allIsLearned @2200263：无 elements → true；教学关(isTutorial) elements 去尾
 *   （slice(0,-1)，去掉本关要教的新元素）；逐项 ∈ learnedElements。
 * - Progress.unlockLevels @2200700 区：locked = unlock_key ≠ null ∧ ≠"free" ∧ ∉myKeys
 *   （E 数据 unlock_key 全 "free"、game.json defaultKeys=[] → 恒 false）。
 * - Progress.setStates 非 tree 分支 @2200250 区：best>0 → state=stars+1（2..4）；
 *   否则 allIsLearned(level, id===0) ∧ !level.locked ∧ completedCount≥required → 1，否则 0。
 *   （庙级 softLocked 不进 setStates——软锁门只在条带图标层拦截导航。）
 * - LevelMenuButtons.addContent @1919150 区：o=min(0.6·realHeight,700)、M=2o/√3（三角格）、
 *   G=min(o,M)<800 ? 0.45 : 0.55（LevelMenuGrid @1927540 档；tree 为 0.5/0.6）、
 *   B=(1−Δx)/2、C=(1−Δy)/2、X=(B+x−minx)·M、Y=(C+y−miny)·o；节点=(X−M/2, Y−o/2)；
 *   HybridButtons.layoutContent @1950050 区：网格组 y=−80。
 * - TempleSelectorHybrid @1952500 区：icon_distance=256·0.7=179.2、strip_height=300·0.7=210、
 *   图标 y=−C/2（条带原点=屏底心 (0,realHeight/2)，HybridMenu.addContent @1967300 区）→
 *   屏幕 y=H/2−105；条带锚 x=−179.2·当前庙 index（@1957950 区 `this._x=this.anchor=
 *   −icon_distance·p`）→ 当前庙图标恒居屏心（原版的"当前庙高亮"=居中，无独立高亮帧）；
 *   update @1960400 区 wrap 窗 ±3.5 格（7 庙环形轮播冻结在当前锚=静态等价）。
 * - HybridMenu @1965000 区：庙切换 onSelected→setTarget→(落定)onTarget→setTemple（仅当
 *   currentTemple!==data）；软锁庙图标 showSoftLockWarning 的 onShowPopup 在 HybridMenu
 *   无消费者（点击=无动作，仅 Button 基类音效）——本复刻同：不切换、不弹窗。
 */

/** E 七庙目录名（E 包 game.json gameConfig.temples = ["elements/fire","elements/forest",
 *  "elements/ice","elements/water","elements/crystal","elements/light","elements/wind"]；
 *  展示序只按各自 temple.json 的 index 排，本清单顺序仅承载 gameConfig 原序语义） */
export const ELEMENT_TEMPLE_DIRS = ["fire", "forest", "ice", "water", "crystal", "light", "wind"] as const;

/** 条带图标档（oracle 字节直证）：间距 256·0.7、图标缩放 0.7、条带高 300·0.7 */
export const ICON_DISTANCE = 179.2;
export const ICON_RESCALE = 0.7;
export const STRIP_HEIGHT = 210;

/** temple.json 行（E 部 rows 型实况字段；type 仅 general（缺省）与 puzzle，E 无 speed/dark） */
export interface MultiLevel {
  id: number;
  _id: number;
  x: number;
  y: number;
  filename: string;
  type?: string;
  required: number;
  elements?: string[];
  unlock_key?: string;
  initial?: boolean; // E 数据无此字段（档卷 §3 末条），保留类型位以对齐 tree 侧
}
export interface MultiTemple {
  id: string;
  index: number;
  label: string;
  color: string;
  type?: string; // "rows"
  levels: MultiLevel[];
}

/** 学习元素集 = 全庙 best 非空关 elements 的并集（bundle process @2198900 区 `_.uniq(f.concat(e.elements))`；
 *  starsOf: filename → 已通关星数（0=未通）。我方进度键=filename（progress.ts 口径），教学关
 *  forest_01 在 A/E 两庙同 filename → 进度共享（原版按 temple.id+level.id 分槽，复刻既定偏离） */
export function computeLearnedElements(
  temples: MultiTemple[],
  starsOf: (filename: string) => number,
): Set<string> {
  const learned = new Set<string>();
  for (const t of temples)
    for (const lv of t.levels)
      if (starsOf(lv.filename) > 0 && lv.elements) for (const e of lv.elements) learned.add(e);
  return learned;
}

/** 本庙 completedCount = best 非空关数（bundle process 同处 `x++`；我方存储无 0 星 best，
 *  即 stars>0 关数） */
export function completedCountOf(temple: MultiTemple, starsOf: (filename: string) => number): number {
  let n = 0;
  for (const lv of temple.levels) if (starsOf(lv.filename) > 0) n++;
  return n;
}

/** allIsLearned（bundle @2200263 逐句）：无 elements → true；教学关去尾；逐项 ∈ learned */
export function allIsLearned(elements: string[] | undefined, isTutorial: boolean, learned: Set<string>): boolean {
  if (!elements) return true;
  const list = isTutorial ? elements.slice(0, elements.length - 1) : elements;
  for (const e of list) if (!learned.has(e)) return false;
  return true;
}

/** unlock_key 购买锁（bundle unlockLevels 谓词 @2200700 区逐句；null!=undefined 为 false →
 *  无 unlock_key 字段视为 free；myKeys=gameConfig.defaultKeys，E 恒 []） */
export function purchaseLocked(unlockKey: string | undefined, myKeys: string[]): boolean {
  return unlockKey != null && unlockKey !== "free" && myKeys.indexOf(unlockKey) < 0;
}

/** 庙级 softLock（bundle process：`softLocked = !allIsLearned(temple, true)`，
 *  temple.elements := levels[0].elements → levels[0].elements 去尾后须全学会） */
export function templeSoftLocked(temple: MultiTemple, learned: Set<string>, myKeys: string[] = []): boolean {
  const head = temple.levels[0];
  // 原版此处不查购买锁（softLocked 只看元素学习链）；levels[0] 缺失视为未锁（数据缺陷兜底）
  if (!head) return false;
  if (purchaseLocked(head.unlock_key, myKeys)) return false; // 购买锁庙走 buyTemple 弹窗，非软锁
  return !allIsLearned(head.elements, true, learned);
}

/** rows 关卡状态机（bundle setStates 非 tree 分支逐句）：0 锁定 / 1 可玩 / 2..4 星数+1 */
export function rowsLevelState(
  level: MultiLevel,
  stars: number,
  completed: number,
  learned: Set<string>,
  myKeys: string[] = [],
): number {
  if (stars > 0) return stars >= 3 ? 4 : stars === 2 ? 3 : 2;
  const locked = purchaseLocked(level.unlock_key, myKeys);
  return allIsLearned(level.elements, level.id === 0, learned) && !locked && completed >= level.required ? 1 : 0;
}

/** 庙图标 hasNew（bundle process 尾段：isNew = !(played∨initial∨locked)；hasNew =
 *  isNew ∧ state>0 ∧ 非(forest∧id 0)） */
export function templeHasNew(
  temple: MultiTemple,
  starsOf: (filename: string) => number,
  played: Set<string>,
  learned: Set<string>,
  completed: number,
  myKeys: string[] = [],
): boolean {
  for (const lv of temple.levels) {
    const locked = purchaseLocked(lv.unlock_key, myKeys);
    const isNew = !played.has(lv.filename) && !lv.initial && !locked;
    if (isNew && rowsLevelState(lv, starsOf(lv.filename), completed, learned, myKeys) > 0 && !(temple.id === "forest" && lv.id === 0))
      return true;
  }
  return false;
}

// —— rows 网格几何（LevelMenuButtons.addContent @1919150 区 + HybridButtons 组偏移 −80） ——

export interface GridMetrics {
  o: number; // 行高 min(0.6H, 700)
  M: number; // 列距 2o/√3（三角格）
  G: number; // 节点按钮尺（Grid 档 0.45–0.55）
}

export function gridMetrics(H: number): GridMetrics {
  const o = Math.min(0.6 * H, 700);
  const M = (2 * o) / Math.sqrt(3);
  const G = Math.min(o, M) < 800 ? 0.45 : 0.55;
  return { o, M, G };
}

/** 归一化居中系数（B/C 与 minx/miny；oracle `B=(1−j)/2`） */
export function gridCentering(levels: Array<{ x: number; y: number }>): { B: number; C: number; minx: number; miny: number } {
  let minx = Infinity,
    maxx = -Infinity,
    miny = Infinity,
    maxy = -Infinity;
  for (const lv of levels) {
    if (lv.x < minx) minx = lv.x;
    if (lv.x > maxx) maxx = lv.x;
    if (lv.y < miny) miny = lv.y;
    if (lv.y > maxy) maxy = lv.y;
  }
  return { B: (1 - (maxx - minx)) / 2, C: (1 - (maxy - miny)) / 2, minx, miny };
}

/** 节点屏幕坐标（视口系）：X=W/2+(B+x−minx)·M−M/2、Y=H/2+(C+y−miny)·o−o/2−80（组偏移） */
export function gridNodeXY(
  lv: { x: number; y: number },
  levels: Array<{ x: number; y: number }>,
  m: GridMetrics,
  W: number,
  H: number,
): { x: number; y: number } {
  const { B, C, minx, miny } = gridCentering(levels);
  return {
    x: W / 2 + (B + lv.x - minx) * m.M - m.M / 2,
    y: H / 2 + (C + lv.y - miny) * m.o - m.o / 2 - 80,
  };
}

/** 烘焙输入：归一化居中坐标（烘焙侧自乘 Cf/Kf；oracle 先 d(x) 再入 canvas，等价合并） */
export function gridBakePts(
  levels: Array<{ x: number; y: number }>,
  m: GridMetrics,
): { pts: Array<{ x: number; y: number }>; canvasW: number; canvasH: number; Cf: number; Kf: number } {
  const { B, C, minx, miny } = gridCentering(levels);
  return {
    pts: levels.map((lv) => ({ x: B + lv.x - minx, y: C + lv.y - miny })),
    canvasW: Math.floor(m.M),
    canvasH: Math.floor(m.o),
    Cf: m.M,
    Kf: m.o,
  };
}

// —— 顶部条带几何（TempleSelectorHybrid，环形轮播冻结在当前锚） ——

/** 图标屏幕 x：wrap 后 d=((index−cur) 折进 ±3.5 格) → W/2+d·179.2（当前庙恒居屏心；
 *  oracle wrap：`e.x+_x ≥ 3.5·id → −7·id；< −3.5·id → +7·id`，先判上界同序） */
export function stripIconX(index: number, curIndex: number, W: number, count = 7): number {
  let d = (index - curIndex) % count;
  if (d >= count / 2) d -= count;
  else if (d < -count / 2) d += count;
  return W / 2 + d * ICON_DISTANCE;
}

/** 图标屏幕 y：条带原点=屏底心、图标条带局部 y=−strip_height/2（@1953xxx `-C/2`） */
export function stripIconY(H: number): number {
  return H / 2 - STRIP_HEIGHT / 2;
}
