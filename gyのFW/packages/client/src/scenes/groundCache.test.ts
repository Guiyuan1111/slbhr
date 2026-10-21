import { describe, expect, it } from "vitest";
import { GroundCache, canvasBytes } from "./groundCache";

/** 单张 ≈3.81MB（1000×1000×4B）：预算 10MB 即容 2 张 */
const mk = (): { width: number; height: number } => ({ width: 1000, height: 1000 });
const BUDGET = 10_000_001;

describe("GroundCache", () => {
  it("字节账与预算内驻留：两张不逐出", () => {
    const c = new GroundCache(BUDGET);
    c.put("l1", mk());
    c.put("l2", mk());
    expect(c.size).toBe(2);
    expect(c.totalBytes).toBe(canvasBytes(mk()) * 2);
    expect(c.get("l1")).not.toBeNull();
  });

  it("超预算按插入序逐出最旧，且归还像素缓冲（width/height 归零）", () => {
    const c = new GroundCache(BUDGET);
    const a = mk();
    const b = mk();
    const d = mk();
    c.put("l1", a);
    c.put("l2", b);
    c.put("l3", d);
    expect(a.width).toBe(0);
    expect(a.height).toBe(0);
    expect(c.has("l1")).toBe(false);
    expect(c.size).toBe(2);
    expect(c.totalBytes).toBe(canvasBytes(b) * 2);
  });

  it("正绑定的那张绝不逐出——否则在场关的地面当场变黑", () => {
    const c = new GroundCache(BUDGET);
    const a = mk();
    c.put("l1", a);
    c.bound = a;
    c.put("l2", mk());
    c.put("l3", mk());
    expect(a.width).toBe(1000);
    expect(c.has("l1")).toBe(true);
    expect(c.totalBytes).toBeLessThanOrEqual(BUDGET + canvasBytes(a));
  });

  it("刚 put 的这张即便独自超预算也不被逐出（调用方马上要用它建地面）", () => {
    const c = new GroundCache(1);
    const huge = { width: 4000, height: 4000 };
    c.put("l1", huge);
    expect(huge.width).toBe(4000);
    expect(c.has("l1")).toBe(true);
  });

  it("get 触达改写逐出序：被摸过的最旧条目活到最后", () => {
    const c = new GroundCache(BUDGET);
    const a = mk();
    const b = mk();
    const d = mk();
    c.put("l1", a);
    c.put("l2", b);
    expect(c.get("l1")).toBe(a); // l1 变队尾，l2 成为最旧
    c.put("l3", d);
    expect(b.width).toBe(0);
    expect(a.width).toBe(1000);
    expect(c.has("l2")).toBe(false);
  });

  it("同关重复入缓存不重复计账", () => {
    const c = new GroundCache(BUDGET);
    const a = mk();
    const a2 = mk();
    c.put("l1", a);
    c.put("l1", a2);
    expect(c.size).toBe(1);
    expect(c.totalBytes).toBe(canvasBytes(a2));
    expect(c.get("l1")).toBe(a2);
  });

  it("clear（离房回选关）：全部归还像素缓冲、账归零，且 bound 一并置空", () => {
    const c = new GroundCache(BUDGET);
    const a = mk();
    const b = mk();
    c.put("l1", a);
    c.put("l2", b);
    c.bound = b;
    c.clear();
    expect(a.width).toBe(0);
    expect(b.height).toBe(0);
    expect(c.size).toBe(0);
    expect(c.totalBytes).toBe(0);
    expect(c.bound).toBeNull();
    // 清完再进关必须走重绑：bound 若还指着归零面具，地面会当场变黑
    const fresh = mk();
    c.put("l1", fresh);
    expect(c.get("l1")).toBe(fresh);
    expect(c.bound).toBeNull();
  });
});
