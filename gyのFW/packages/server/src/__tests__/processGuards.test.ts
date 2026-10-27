/** logFatal 工厂单测（#45 抽取件）：标签前缀 + 原样透传给 console.error */
import { describe, expect, it, vi } from "vitest";
import { logFatal } from "../processGuards.js";

describe("processGuards.logFatal（#45）", () => {
  it("以 [fw] <tag>: 前缀写 console.error 并透传原值", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const boom = new Error("boom");
      logFatal("uncaughtException")(boom);
      expect(err).toHaveBeenCalledWith("[fw] uncaughtException:", boom);
    } finally {
      err.mockRestore();
    }
  });
});
