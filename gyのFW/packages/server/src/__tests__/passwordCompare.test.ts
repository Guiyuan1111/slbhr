import { describe, expect, it } from "vitest";
import { passwordEquals } from "../passwordCompare.js";

describe("passwordEquals（P3-15：口令常量时间比较）", () => {
  it("同串为真、同长错串为假、异长为假", () => {
    expect(passwordEquals("fire-and-water", "fire-and-water")).toBe(true);
    expect(passwordEquals("fire-and-wateR", "fire-and-water")).toBe(false);
    expect(passwordEquals("short", "fire-and-water")).toBe(false);
    expect(passwordEquals("", "")).toBe(true);
    expect(passwordEquals("a", "")).toBe(false);
  });

  it("多字节字符按 utf8 字节摘要比较", () => {
    expect(passwordEquals("水与火", "水与火")).toBe(true);
    expect(passwordEquals("水与火", "水与冰")).toBe(false);
  });

  it("常见前缀同长串不抛错（timingSafeEqual 走摘要等长路径）", () => {
    expect(passwordEquals("abcd".repeat(16), "abce".repeat(16))).toBe(false);
    expect(passwordEquals("abcd".repeat(16), "abcd".repeat(16))).toBe(true);
  });
});
