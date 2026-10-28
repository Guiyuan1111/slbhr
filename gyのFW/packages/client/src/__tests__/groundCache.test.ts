/**
 * r13 移植单测：地面合成缓存 LRU 的纯逻辑（node 直测，不依赖 DOM/Phaser）。
 *
 * 钉住：①按字节预算逐出且插入序即 LRU 序；②正绑定的那张绝不逐出（逐出=地面变黑）；
 * ③刚 put 的当前张绝不逐出；④clear 归零所有位图并复位 bound；⑤命中重插队尾刷新 LRU 序。
 */
import { describe, expect, it } from "vitest";
import { GROUND_CACHE_BUDGET, GroundCache, canvasBytes } from "../scenes/groundCache.js";

/** 假 canvas：width/height 即字节账（4B/px），置零可观测 */
const fake = (w: number, h: number) => ({ width: w, height: h });
const MB = 1024 * 1024;

describe("GroundCache：字节账与 LRU 序", () => {
  it("put 记字节账，get 命中重插队尾，逐出从最旧开始", () => {
    const c = new GroundCache(5 * MB); // 预算 5MB，单张 2.5MB → 最多 2 张
    const a = fake(800, 781); // ≈2.5MB
    const b = fake(800, 781);
    const d = fake(800, 781);
    c.put("a", a);
    c.put("b", b);
    expect(c.size).toBe(2);
    c.get("a"); // 触达 a → LRU 序变 b,a
    c.put("d", d); // 逐出 b（最旧未被触达）
    expect(c.has("b")).toBe(false);
    expect(c.has("a")).toBe(true);
    expect(c.has("d")).toBe(true);
    expect(b.width).toBe(0); // 被逐出即归零归还像素缓冲
    expect(a.width).toBe(800);
  });

  it("同键 put 覆盖不重复记账", () => {
    const c = new GroundCache();
    const a = fake(100, 100);
    c.put("a", a);
    const a2 = fake(100, 100);
    c.put("a", a2);
    expect(c.size).toBe(1);
    expect(c.totalBytes).toBe(canvasBytes(a2));
  });
});

describe("GroundCache：不可逐出不变量", () => {
  it("正绑定（bound）的那张绝不逐出——在场关卡地面不能变黑", () => {
    const c = new GroundCache(5 * MB);
    const bound = fake(800, 781);
    c.put("bound", bound);
    c.bound = bound;
    for (let i = 0; i < 4; i++) c.put(`x${i}`, fake(800, 781)); // 持续超预算施压
    expect(c.has("bound")).toBe(true);
    expect(bound.width).toBe(800);
  });

  it("刚 put 的当前张绝不逐出（超预算也不清调用方正要用的）", () => {
    const c = new GroundCache(5 * MB);
    c.put("old", fake(800, 781));
    const cur = fake(800, 781);
    c.put("cur", cur); // put 后 5MB 恰好达标；再来一张压测
    c.put("x", fake(800, 781));
    expect(c.has("cur")).toBe(true);
    expect(cur.width).toBe(800);
  });
});

describe("GroundCache：clear（离房释放）", () => {
  it("全部位图归零、账目清零、bound 复位", () => {
    const c = new GroundCache();
    const a = fake(800, 781);
    c.put("a", a);
    c.bound = a;
    c.clear();
    expect(c.size).toBe(0);
    expect(c.totalBytes).toBe(0);
    expect(c.bound).toBeNull();
    expect(a.width).toBe(0); // 像素缓冲立即归还
  });

  it("预算缺省 24MB（≈4 张 1312×992）", () => {
    expect(GROUND_CACHE_BUDGET).toBe(24 * 1024 * 1024);
  });
});
