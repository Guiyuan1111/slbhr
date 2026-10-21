/**
 * temple.json 加载失败重试（M11）：一次网络抖动不得把空数组固化为成功结果。
 * 模块级 pending 用 vi.resetModules + 动态 import 隔离。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LEVEL = { filename: "tutorials/levels/forest_01.json", time: 60, type: "general" };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("loadTempleLevels", () => {
  it("HTTP 非 ok → 本次返回 []，下一次调用重新请求并成功", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ levels: [LEVEL] }) });
    vi.stubGlobal("fetch", fetchMock);
    const { loadTempleLevels } = await import("./templeData");

    await expect(loadTempleLevels()).resolves.toEqual([]);
    await expect(loadTempleLevels()).resolves.toEqual([LEVEL]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("网络 reject → 本次返回 []，下一次调用重试", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ levels: [LEVEL] }) });
    vi.stubGlobal("fetch", fetchMock);
    const { loadTempleLevels } = await import("./templeData");

    await expect(loadTempleLevels()).resolves.toEqual([]);
    await expect(loadTempleLevels()).resolves.toEqual([LEVEL]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("成功结果在页面生命周期内只请求一次", async () => {
    const json = vi.fn(async () => ({ levels: [LEVEL] }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json });
    vi.stubGlobal("fetch", fetchMock);
    const { loadTempleLevels } = await import("./templeData");

    await loadTempleLevels();
    await loadTempleLevels();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(json).toHaveBeenCalledTimes(1);
  });
});
