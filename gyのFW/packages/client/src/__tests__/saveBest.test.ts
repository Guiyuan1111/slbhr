/**
 * saveBest 防御性校验（#43）：非有限或入库即 ≤0 的时长必须拒绝——0 秒「最佳」一旦写入，
 * 之后任何真实成绩都无法刷新（time < prev.time 恒假），存档不可逆污染。
 * node 环境最小 localStorage stub（同 clipboard.test 口径）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { saveBest } from "../progress";

const store = new Map<string, string>();
const lsStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

afterEach(() => {
  store.clear();
  delete (globalThis as any).localStorage;
});

describe("saveBest 时长防御（#43）", () => {
  it("拒绝 0 / 负数 / NaN / Infinity", () => {
    (globalThis as any).localStorage = lsStub;
    expect(saveBest("forest_01", 3, 0)).toBe(false);
    expect(saveBest("forest_01", 3, -5)).toBe(false);
    expect(saveBest("forest_01", 3, Number.NaN)).toBe(false);
    expect(saveBest("forest_01", 3, Number.POSITIVE_INFINITY)).toBe(false);
    expect(store.size).toBe(0); // 一次都没写入
  });

  it("0.4s（四舍五入入库即 0）同样拒绝", () => {
    (globalThis as any).localStorage = lsStub;
    expect(saveBest("forest_01", 3, 0.4)).toBe(false);
    expect(store.size).toBe(0);
  });

  it("正常年份照常写入且只留最佳", () => {
    (globalThis as any).localStorage = lsStub;
    expect(saveBest("forest_01", 2, 30)).toBe(true);
    expect(saveBest("forest_01", 3, 25)).toBe(true); // 星级升
    expect(saveBest("forest_01", 3, 40)).toBe(false); // 同星更慢不写
    expect(JSON.parse(store.get("fw-temple-progress-v1")!)).toEqual({ forest_01: { stars: 3, time: 25 } });
  });
});
