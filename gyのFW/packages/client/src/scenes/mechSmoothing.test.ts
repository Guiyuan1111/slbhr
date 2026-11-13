import { describe, expect, it } from "vitest";
import { MechanismSmoother } from "./mechSmoothing";

describe("MechanismSmoother", () => {
  it("首次采样直贴，snapPending 帧重新直贴", () => {
    const s = new MechanismSmoother();
    expect(s.target("k", 12, 34, 0.5, 0, 16, false)).toEqual({ x: 12, y: 34, a: 0.5 });
    s.target("k", 20, 34, 0.5, 16, 16, false);
    expect(s.target("k", 99, 99, 9, 32, 16, true)).toEqual({ x: 99, y: 99, a: 9 });
  });

  it("超过 80ms 静止后清速度，不再按旧速度外推", () => {
    const s = new MechanismSmoother();
    s.target("k", 0, 0, 0, 0, 16, false);
    s.target("k", 10, 0, 0, 16, 16, false);
    let before = 0;
    for (const t of [32, 48, 64, 80, 96]) before = s.target("k", 10, 0, 0, t, 16, false).x;
    expect(before).toBeGreaterThan(10); // 连续同值帧仍按 25ms lead 外推
    const settled = s.target("k", 10, 0, 0, 196, 16, false).x;
    expect(settled).toBeLessThan(before);
    expect(settled).toBeGreaterThanOrEqual(10);
  });

  it("角度走最短弧，不跨 ±π 翻卷", () => {
    const s = new MechanismSmoother();
    s.target("k", 0, 0, 3.13, 0, 16, false);
    const next = s.target("k", 0, 0, -3.13, 16, 16, false);
    expect(next.a).toBeGreaterThan(3.13);
    expect(next.a).toBeLessThan(3.2);
  });

  it("clear 后下一次采样重新直贴", () => {
    const s = new MechanismSmoother();
    s.target("k", 0, 0, 0, 0, 16, false);
    s.target("k", 50, 0, 0, 16, 16, false);
    s.clear();
    expect(s.target("k", 7, 8, 0.1, 32, 16, false)).toEqual({ x: 7, y: 8, a: 0.1 });
  });
});

/**
 * r51：两处改动的**逐位等价**证明。
 *
 * 改动 1：`k = 1 - exp(-RATE·Δ/1000)` 改为同帧单槽缓存。
 * 改动 2：静止收敛时走快路（`vx=vy=va=0` 且 `rx/ry/ra` 已等于输入）。
 *
 * 两者都必须**逐位**（`Object.is`，区分 ±0 与 NaN）与改造前一致。差分用的是
 * 此处内联的 v1 参考实现（逐字复制改造前的 `target`），不是"重新实现的近似"。
 */
class SmootherRef {
  private samples = new Map<string, any>();
  private out = { x: 0, y: 0, a: 0 };
  clear() { this.samples.clear(); }
  target(key: string, x: number, y: number, a: number, nowMs: number, deltaMs: number, snapPending: boolean) {
    const LEAD_MS = 25, STATIC_MS = 80, RATE = 30, MIN_DT_S = 1 / 120, MAX_DT_S = 0.2;
    const shortestArc = (d: number) => ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    let m = this.samples.get(key);
    if (!m) {
      m = { x, y, a, vx: 0, vy: 0, va: 0, t: nowMs, rx: x, ry: y, ra: a, init: false };
      this.samples.set(key, m);
    }
    if (!m.init || snapPending) {
      m.x = x; m.y = y; m.a = a; m.rx = x; m.ry = y; m.ra = a; m.t = nowMs; m.init = true;
      this.out.x = x; this.out.y = y; this.out.a = a;
      return this.out;
    }
    if (x !== m.x || y !== m.y || a !== m.a) {
      const dt = Math.min(MAX_DT_S, Math.max(MIN_DT_S, (nowMs - m.t) / 1000));
      m.vx = (x - m.x) / dt; m.vy = (y - m.y) / dt; m.va = shortestArc(a - m.a) / dt;
      m.x = x; m.y = y; m.a = a; m.t = nowMs;
    } else if (nowMs - m.t > STATIC_MS) {
      m.vx = m.vy = m.va = 0; m.t = nowMs;
    }
    const ex = m.x + (m.vx * LEAD_MS) / 1000;
    const ey = m.y + (m.vy * LEAD_MS) / 1000;
    const ea = m.a + (m.va * LEAD_MS) / 1000;
    const k = 1 - Math.exp((-RATE * deltaMs) / 1000);
    m.rx += (ex - m.rx) * k;
    m.ry += (ey - m.ry) * k;
    m.ra += shortestArc(ea - m.ra) * k;
    this.out.x = m.rx; this.out.y = m.ry; this.out.a = m.ra;
    return this.out;
  }
}

/** 确定性 LCG，避免测试依赖 Math.random 的可复现性 */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

describe("r51 逐位等价（差分）", () => {
  it("混合轨迹 × 多机关键：与改造前逐位一致", () => {
    const rnd = lcg(20261105);
    const keys = ["p1", "p2", "p3", "b1", "u1a", "r1", "TP1"];
    for (let trial = 0; trial < 40; trial++) {
      const cur = new MechanismSmoother();
      const ref = new SmootherRef();
      let t = 0;
      const base: Record<string, [number, number, number]> = {};
      for (const k of keys) base[k] = [rnd() * 500, rnd() * 500, rnd() * 6 - 3];
      for (let f = 0; f < 120; f++) {
        t += 16 + Math.floor(rnd() * 5);
        const delta = 16 + Math.floor(rnd() * 5);
        const snap = f % 37 === 36;
        // 三种模式：完全静止 / 微小抖动 / 真实位移 —— 覆盖快路与参考路径
        const mode = f % 3;
        const scale = mode === 0 ? 0 : mode === 1 ? 0.001 : 3;
        for (const k of keys) {
          const b = base[k];
          if (scale) {
            b[0] += (rnd() - 0.5) * scale;
            b[1] += (rnd() - 0.5) * scale;
            b[2] += (rnd() - 0.5) * scale * 0.1;
          }
          const got = cur.target(k, b[0], b[1], b[2], t, delta, snap);
          const exp = ref.target(k, b[0], b[1], b[2], t, delta, snap);
          if (!Object.is(got.x, exp.x) || !Object.is(got.y, exp.y) || !Object.is(got.a, exp.a)) {
            throw new Error(
              `第 ${trial} 次试验 帧 ${f} 键 ${k} 不一致：` +
              `got(${got.x},${got.y},${got.a}) vs ref(${exp.x},${exp.y},${exp.a})`,
            );
          }
        }
      }
    }
  });

  it("静止快路保留 +0 归一化（-0 与 +0 的符号位）", () => {
    const cur = new MechanismSmoother();
    const ref = new SmootherRef();
    const gk = cur.target("k", 0, 0, -0, 0, 16, false);
    const rk = ref.target("k", 0, 0, -0, 0, 16, false);
    expect(Object.is(gk.a, rk.a)).toBe(true);
    for (let i = 1; i < 20; i++) {
      const g = cur.target("k", 0, 0, -0, i * 16, 16, false);
      const r = ref.target("k", 0, 0, -0, i * 16, 16, false);
      expect(Object.is(g.x, r.x)).toBe(true);
      expect(Object.is(g.y, r.y)).toBe(true);
      expect(Object.is(g.a, r.a)).toBe(true);
    }
  });

  it("同帧缓存不跨帧泄漏：delta 变化后必须重算", () => {
    const s = new MechanismSmoother();
    s.target("a", 0, 0, 0, 0, 16, false);
    const g1 = s.target("a", 10, 0, 0, 16, 16, false).x;
    s.target("b", 0, 0, 0, 16, 16, false)
    const g2 = s.target("a", 10, 0, 0, 32, 33, false).x;
    expect(g1).not.toBe(g2);
  });
});
