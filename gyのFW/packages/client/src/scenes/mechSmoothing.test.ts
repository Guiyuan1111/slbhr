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
