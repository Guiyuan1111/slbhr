/**
 * #49：GameScene 可测决策逻辑抽离的行为断言（原为源码文本契约——对逻辑破坏假绿，
 * #39 审计实测 6/6 仍 PASS）。四组决策各钉退出路径语义；抽离为行为等价重排。
 */
import { describe, expect, it } from "vitest";
import { clockSoundDecision, needsDarkRt, needsDust, resolveBeamCache } from "../scenes/gameGuards.js";

describe("needsDarkRt（dark 黑幕幂等守卫，#29/#47-5 语义）", () => {
  it("仅未建 RT 且 templeType==='dark' 才建", () => {
    expect(needsDarkRt(false, "dark")).toBe(true);
    expect(needsDarkRt(true, "dark")).toBe(false); // 已建（引用非空）不重建
    for (const t of ["general", "speed", "", undefined as unknown as string]) {
      expect(needsDarkRt(false, t)).toBe(false); // 非 dark 恒不建
    }
  });
});

describe("needsDust（光柱浮尘幂等守卫）", () => {
  it("有 beamer 且未装配才装", () => {
    expect(needsDust(3, false)).toBe(true);
    expect(needsDust(0, false)).toBe(false); // 无 beamer 不装
    expect(needsDust(3, true)).toBe(false); // 已装不重装
  });
});

describe("resolveBeamCache（#30 各退出路径：残留=黑幕亮带/浮尘掩膜泄漏）", () => {
  it("视图不存在 → 删缓存（实体移除/换关）", () => {
    expect(resolveBeamCache(false, true, "1,2|3,4")).toBeNull();
  });
  it("熄灭或无 pts → 删缓存", () => {
    expect(resolveBeamCache(true, false, "1,2|3,4")).toBeNull();
    expect(resolveBeamCache(true, true, "")).toBeNull();
  });
  it("折线不足 2 点 → 删缓存（画不出线段）", () => {
    expect(resolveBeamCache(true, true, "1,2")).toBeNull();
  });
  it("合法路径 → 置缓存并返回点阵（字符串解析逐段逐数）", () => {
    expect(resolveBeamCache(true, true, "1,2|3,4|5,6")).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });
});

describe("clockSoundDecision（#22：clock 起停只由 downState/state 驱动）", () => {
  it("推杆熄灭 → 停（在播）或不动（未播）", () => {
    expect(clockSoundDecision(false, 0, true, 1000)).toEqual({ op: "stop" });
    expect(clockSoundDecision(false, 0, false, 1000)).toEqual({ op: "none" });
  });
  it("在播且按住（downState≠0）→ 停；未播不动", () => {
    expect(clockSoundDecision(true, 1, true, 1000)).toEqual({ op: "stop" });
    expect(clockSoundDecision(true, 1, false, 1000)).toEqual({ op: "none" });
  });
  it("已松开（downState===0）未播 → 起播，seek=(22796-timeMs)/1000 负值截 0", () => {
    expect(clockSoundDecision(true, 0, false, 12796)).toEqual({ op: "play", seek: 10 });
    expect(clockSoundDecision(true, 0, false, 99999)).toEqual({ op: "play", seek: 0 });
  });
  it("已松开且已在播 → 不动（不重启不 seek）", () => {
    expect(clockSoundDecision(true, 0, true, 12796)).toEqual({ op: "none" });
  });
});
