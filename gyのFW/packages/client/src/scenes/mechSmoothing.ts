/**
 * 机关位姿平滑（M12 从 GameScene 抽出，逻辑与 rotcheck 10 号档一致）：
 * 服务端 60Hz 快照 → 有限差分估速（角度最短弧）→ lead 外推 → 指数收敛。
 * 纯表现层，不参与物理；GameScene 只负责把现在/帧间隔/snapPending 传进来。
 */

export interface MechPose {
  x: number;
  y: number;
  a: number;
}

interface MechSample {
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  va: number;
  t: number;
  rx: number;
  ry: number;
  ra: number;
  init: boolean;
}

/** lead 25ms/rate 30/s：final-b 风车实录 A/B 扫描选定（rms/max 双优）；60Hz patch 下 netopt §2.2 复检保留。 */
const LEAD_MS = 25;
/** 80ms≈多个 60Hz patch 周期：静止快照不再按 lead 外推，清残留速度防永久偏移。 */
const STATIC_MS = 80;
const RATE = 30;
const MIN_DT_S = 1 / 120;
const MAX_DT_S = 0.2;

function shortestArc(delta: number): number {
  return ((delta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

export class MechanismSmoother {
  private samples = new Map<string, MechSample>();
  private out: MechPose = { x: 0, y: 0, a: 0 };

  /**
   * r51：`k` 逐帧记忆。
   *
   * `k = 1 - exp(-RATE·Δ/1000)` 只取决于 (nowMs, deltaMs)，而**同一帧内所有机关
   * 传的是同一对值**（`GameScene.updateMechs` 每帧把 `nowMs`/`deltaMs` 存进
   * `curNow`/`curDelta` 后不再变）。`forest_bonus_2` 每帧约 91 次调用 → 91 次
   * `Math.exp`。本缓存把同帧的后续调用降到 0 次。
   *
   * 安全性：**输入相同、函数相同 → 结果逐位相同**，这是纯 memoization，
   * 不改任何浮点运算顺序。跨帧只保留最后一项（单槽缓存），无增长。
   */
  private kNow = NaN;
  private kDelta = NaN;
  private kVal = 0;

  clear(): void {
    this.samples.clear();
    this.kNow = NaN;
    this.kDelta = NaN;
    this.kVal = 0;
  }

  private rateK(nowMs: number, deltaMs: number): number {
    if (nowMs === this.kNow && deltaMs === this.kDelta) return this.kVal;
    const k = 1 - Math.exp((-RATE * deltaMs) / 1000);
    this.kNow = nowMs;
    this.kDelta = deltaMs;
    this.kVal = k;
    return k;
  }

  target(key: string, x: number, y: number, a: number, nowMs: number, deltaMs: number, snapPending: boolean): MechPose {
    let m = this.samples.get(key);
    if (!m) {
      m = { x, y, a, vx: 0, vy: 0, va: 0, t: nowMs, rx: x, ry: y, ra: a, init: false };
      this.samples.set(key, m);
    }
    if (!m.init || snapPending) {
      m.x = x;
      m.y = y;
      m.a = a;
      m.rx = x;
      m.ry = y;
      m.ra = a;
      m.t = nowMs;
      m.init = true;
      this.out.x = x;
      this.out.y = y;
      this.out.a = a;
      return this.out;
    }
    if (x !== m.x || y !== m.y || a !== m.a) {
      const dt = Math.min(MAX_DT_S, Math.max(MIN_DT_S, (nowMs - m.t) / 1000));
      m.vx = (x - m.x) / dt;
      m.vy = (y - m.y) / dt;
      m.va = shortestArc(a - m.a) / dt;
      m.x = x;
      m.y = y;
      m.a = a;
      m.t = nowMs;
    } else if (nowMs - m.t > STATIC_MS) {
      m.vx = m.vy = m.va = 0;
      m.t = nowMs;
    }
    /*
     * r51：静止收敛快路。
     *
     * 条件成立时 ``ex === m.rx``（因为 vx=vy=va=0 且 rx=x…），于是原式
     *   `m.rx += (ex - m.rx) * k` 就是 `m.rx += 0 * k` = `m.rx + 0`。
     * 唯一需要保留的语义是 **`+0` 归一化**（`-0 + 0` 得 `+0`），所以这里仍做
     * 三个 `+ 0`——不跳过它，否则 `ra` 为 `-0` 时会与旧行为差一个符号位。
     *
     * 实测（forest_bonus_2，10800 次调用）该分支命中 5752 次 = **53.3%**，
     * 跳掉的是 exp 缓存查表后的全部乘加与三次 `shortestArc`。
     */
    if (m.vx === 0 && m.vy === 0 && m.va === 0 && m.rx === m.x && m.ry === m.y && m.ra === m.a) {
      m.rx = m.rx + 0;
      m.ry = m.ry + 0;
      m.ra = m.ra + 0;
      this.out.x = m.rx;
      this.out.y = m.ry;
      this.out.a = m.ra;
      return this.out;
    }
    const ex = m.x + (m.vx * LEAD_MS) / 1000;
    const ey = m.y + (m.vy * LEAD_MS) / 1000;
    const ea = m.a + (m.va * LEAD_MS) / 1000;
    const k = this.rateK(nowMs, deltaMs);
    m.rx += (ex - m.rx) * k;
    m.ry += (ey - m.ry) * k;
    m.ra += shortestArc(ea - m.ra) * k;
    this.out.x = m.rx;
    this.out.y = m.ry;
    this.out.a = m.ra;
    return this.out;
  }
}
