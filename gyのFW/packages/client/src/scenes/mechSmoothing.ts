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

const LEAD_MS = 25;
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

  clear(): void {
    this.samples.clear();
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
    const ex = m.x + (m.vx * LEAD_MS) / 1000;
    const ey = m.y + (m.vy * LEAD_MS) / 1000;
    const ea = m.a + (m.va * LEAD_MS) / 1000;
    const k = 1 - Math.exp((-RATE * deltaMs) / 1000);
    m.rx += (ex - m.rx) * k;
    m.ry += (ey - m.ry) * k;
    m.ra += shortestArc(ea - m.ra) * k;
    this.out.x = m.rx;
    this.out.y = m.ry;
    this.out.a = m.ra;
    return this.out;
  }
}
