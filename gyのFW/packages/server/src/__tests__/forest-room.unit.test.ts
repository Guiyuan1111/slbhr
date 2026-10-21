/**
 * ForestRoom 模块级防护单测（L3 环境变量 / M5 静态 onAuth 限流）。
 * 不启动服务器：直接测导出的纯函数与静态方法。
 */
import type { AuthContext } from "colyseus";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAuthRateLimit, envNumber, ForestRoom } from "../rooms/ForestRoom.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("envNumber（L3 环境变量范围校验）", () => {
  it("未设置/空串 → fallback", () => {
    delete process.env.FW_TEST_ENV_NUMBER;
    expect(envNumber("FW_TEST_ENV_NUMBER", 42, 1, 100)).toBe(42);
    process.env.FW_TEST_ENV_NUMBER = "";
    expect(envNumber("FW_TEST_ENV_NUMBER", 42, 1, 100)).toBe(42);
    delete process.env.FW_TEST_ENV_NUMBER;
  });

  it("合法值原样返回（含边界）", () => {
    process.env.FW_TEST_ENV_NUMBER = "1";
    expect(envNumber("FW_TEST_ENV_NUMBER", 42, 1, 100)).toBe(1);
    process.env.FW_TEST_ENV_NUMBER = "100";
    expect(envNumber("FW_TEST_ENV_NUMBER", 42, 1, 100)).toBe(100);
    process.env.FW_TEST_ENV_NUMBER = "7.5";
    expect(envNumber("FW_TEST_ENV_NUMBER", 42, 1, 100)).toBe(7.5);
    delete process.env.FW_TEST_ENV_NUMBER;
  });

  it.each(["abc", "Infinity", "NaN", "0", "101", "-3"])("非法值 %s → warn + fallback", (raw) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.FW_TEST_ENV_NUMBER = raw;
    expect(envNumber("FW_TEST_ENV_NUMBER", 42, 1, 100)).toBe(42);
    expect(warn).toHaveBeenCalledTimes(1);
    delete process.env.FW_TEST_ENV_NUMBER;
  });
});

describe("静态 onAuth IP 固定窗口限流（M5）", () => {
  it("60 次放行、第 61 次拒绝；窗口滚动后恢复", () => {
    const ip = `unit-window-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 60; i++) expect(checkAuthRateLimit(ip, 1_000_000)).toBe(true);
    expect(checkAuthRateLimit(ip, 1_000_000)).toBe(false);
    expect(checkAuthRateLimit(ip, 1_000_000 + 59_999)).toBe(false);
    expect(checkAuthRateLimit(ip, 1_000_000 + 60_000)).toBe(true);
  });

  it("static onAuth 超限抛 ServerError(4429)；未超限返回 true", async () => {
    const ip = `unit-static-${Date.now()}-${Math.random()}`;
    const context = { ip, headers: {}, req: undefined } as unknown as AuthContext;
    for (let i = 0; i < 60; i++) {
      await expect(ForestRoom.onAuth("", {}, context)).resolves.toBe(true);
    }
    await expect(ForestRoom.onAuth("", {}, context)).rejects.toMatchObject({
      code: 4429,
      message: "尝试过于频繁，请稍后再试",
    });
  });

  it("context 缺失时归入 unknown 桶但仍可限流", async () => {
    // 只验证不抛异常且返回 true（unknown 桶可能已被其他用例计数，不能用绝对次数断言）
    await expect(ForestRoom.onAuth("", {}, undefined)).resolves.toBe(true);
  });
});
