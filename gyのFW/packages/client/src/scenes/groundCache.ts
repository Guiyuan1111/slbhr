/**
 * 地面合成缓存（r13 从 GameScene 抽出）：整关地面 canvas 的有界 LRU + 绑定守卫。
 *
 * 抽成独立模块的唯一理由是把最容易出事的一条不变量做成可单测的纯逻辑：
 * **正被场景绑定的那张 canvas 绝不能被逐出**——逐出即 `width=0` 归还像素缓冲，
 * 在场关卡的地面会当场变黑（且 Phaser 的纹理还指着这张已空的面具）。
 * GameScene 只负责「取/烘/绑」三步，字节账与逐出序都在这里。
 *
 * 不依赖 DOM/Phaser：条目类型取结构化最小集 CanvasLike，故可在 node 环境直接单测。
 */

/** 缓存字节预算：单关 final canvas ≈5MB（1312×992×4B），24MB≈4 关常驻。
 *  够同时留住「在场关 + 结算期预烘的下一关 + 重玩的本关」，仍是常数级驻留。 */
export const GROUND_CACHE_BUDGET = 24 * 1024 * 1024;

export interface CanvasLike {
  width: number;
  height: number;
}

export function canvasBytes(c: CanvasLike): number {
  return c.width * c.height * 4;
}

export class GroundCache {
  /** 插入序即 LRU 序：命中后 delete+set 重插队尾，逐出从头取 */
  private entries = new Map<string, CanvasLike>();
  private bytes = 0;

  /** 当前绑到 "groundTex" 的那张：同一张再次上场景时整段跳过重绑，
   *  省掉一次 ≈5MB 的 texImage2D 全幅重传（重开同关/换关回看的路径）。 */
  bound: CanvasLike | null = null;

  constructor(private readonly budget: number = GROUND_CACHE_BUDGET) {}

  has(levelId: string): boolean {
    return this.entries.has(levelId);
  }

  /** LRU 触达取（重插队尾） */
  get(levelId: string): CanvasLike | null {
    const c = this.entries.get(levelId);
    if (!c) return null;
    this.entries.delete(levelId);
    this.entries.set(levelId, c);
    return c;
  }

  /** 入缓存 + 按字节预算逐出。两条不可逐出：正绑定的那张（在场场景还在引用）、
   *  刚进来的这张（调用方马上就要用它建地面，逐出=当场归零=地面变黑）。 */
  put(levelId: string, canvas: CanvasLike): void {
    const prev = this.entries.get(levelId);
    if (prev) {
      this.bytes -= canvasBytes(prev);
      this.entries.delete(levelId);
    }
    this.entries.set(levelId, canvas);
    this.bytes += canvasBytes(canvas);
    for (const [k, victim] of [...this.entries]) {
      if (this.bytes <= this.budget) break;
      if (victim === this.bound || victim === canvas) continue;
      this.bytes -= canvasBytes(victim);
      this.entries.delete(k);
      victim.width = 0; // 立刻归还像素缓冲，不等 GC
      victim.height = 0;
    }
  }

  get size(): number {
    return this.entries.size;
  }

  /** 离房回选关（main.ts leaveToMenu 在 Game 场景 stop 之后调用）：整条 LRU 归零。
   *  选关树不渲染地面，这 ≈5MB/张 的位图在菜单态纯属驻留；重进同关要重烘，
   *  实测 ≈12–17ms（perf-advance bakeMs 中位 12），落在 1s 入房链里不可见。
   *  `bound` 必须一并置空：留着一张已归零的面具自称"正绑着"，下一次进关会跳过
   *  重绑而把空纹理贴到地上（= 地面变黑）。 */
  clear(): void {
    for (const c of this.entries.values()) {
      c.width = 0;
      c.height = 0;
    }
    this.entries.clear();
    this.bytes = 0;
    this.bound = null;
  }

  get totalBytes(): number {
    return this.bytes;
  }
}
