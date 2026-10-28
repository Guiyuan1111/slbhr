/**
 * GameScene 可测决策逻辑抽离（#49，#39 后续）：把曾以「源码文本契约」钉住的四处
 * 决策抽成纯函数——文本契约对逻辑破坏假绿（#39 审计实测 6/6 仍 PASS），纯函数
 * 单测直接断言决策本身。抽离全部为行为等价重排，渲染/音频路径零变化（约束见 issue）。
 *
 * 不依赖 DOM/Phaser，node 环境可直测。
 */

/** dark 关黑幕 RT 的幂等守卫（原 `if (this.darkRt || this.templeType !== "dark") return;`）：
 *  已建过 RT（引用非空，#29 语义）或本关非 dark 类型 → 不建。 */
export function needsDarkRt(hasDarkRt: boolean, templeType: string): boolean {
  return !hasDarkRt && templeType === "dark";
}

/** 光柱浮尘装配的幂等守卫（原 `if (level.beamers.length === 0 || this.dustContainer) return;`）：
 *  本关没有 beamer 或浮尘容器已在 → 不装。 */
export function needsDust(beamerCount: number, hasDustContainer: boolean): boolean {
  return beamerCount > 0 && !hasDustContainer;
}

/** beamer 光束折线缓存决策（#30：视图不存在/熄灭/折线不合法都必须删缓存——
 *  drawDarkness/updateDust 把 lastBeamPts 条目一概视为「当前有光束」，残留即黑幕
 *  亮带与浮尘掩膜泄漏）。原 cbBeamers 各退出路径的 delete/return 语义：
 *  - 视图不存在（实体移除/换关）→ 删缓存；
 *  - 熄灭（state≠1）或快照无 pts → 删缓存；
 *  - pts 拆出的折线不足 2 点（画不出线段）→ 删缓存；
 *  - 其余 → 置缓存（返回折线点阵，调用方负责描线）。 */
export type BeamPath = number[][];
export function resolveBeamCache(viewExists: boolean, on: boolean, ptsRaw: string): BeamPath | null {
  if (!viewExists) return null;
  if (!on || !ptsRaw) return null;
  const path = ptsRaw.split("|").map((seg) => seg.split(",").map(Number));
  if (path.length < 2) return null;
  return path;
}

/** 定时推杆 clock 尾音起停决策（#22：clock 起停只由 downState/state 驱动，全局 stop
 *  会让多实例齐停齐启可听断续）。原 cbTimedPushers 尾段语义：
 *  - 推杆熄灭（on=false）→ 停（若在播）；
 *  - 在播且 downState≠0（按住/计时未独立走）→ 停；
 *  - downState===0（已松开倒计时独立走）且未在播 → 起播，seek=(22796-timeMs)/1000；
 *  - 其余不动。timeMs 由视图状态给出（快照不发）。 */
export type ClockSoundOp = { op: "stop" } | { op: "play"; seek: number } | { op: "none" };
export function clockSoundDecision(on: boolean, downState: number, isPlaying: boolean, timeMs: number): ClockSoundOp {
  if (!on) return isPlaying ? { op: "stop" } : { op: "none" };
  if (Number(downState) === 0) {
    if (!isPlaying) return { op: "play", seek: Math.max(0, (22796 - timeMs) / 1000) };
    return { op: "none" };
  }
  return isPlaying ? { op: "stop" } : { op: "none" };
}
