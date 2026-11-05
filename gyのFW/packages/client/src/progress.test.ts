/**
 * 全通庆典双旗单测（P-02 #34，0.3.40）——oracle ProgressModel.process/update 字节语义：
 * - process 置位段 :2149483-:2149538：`b && !get("gameComplete") && (firstComplete=!0), set("gameComplete", b)`
 * - 消费 :1939549/:1932358：读即清（`firstComplete && ((firstComplete=!1), start)`）
 * - update merge 门 :2152850 区：仅 best 刷新才 process（saveBest 返回值对应）
 * - played 集（fw-played-v1）与 gameComplete（fw-gamecomplete-v1）两旗独立
 * node 环境无 localStorage——装最小 memory stub。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveBest,
  loadProgress,
  loadGameComplete,
  processWinResult,
  takeFirstComplete,
  markPlayed,
  loadPlayed,
} from "./progress";

type Store = Record<string, string>;
let backing: Store;

beforeEach(() => {
  backing = {};
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string): string | null => (k in backing ? backing[k] : null),
      setItem: (k: string, v: string): void => {
        backing[k] = String(v);
      },
      removeItem: (k: string): void => {
        delete backing[k];
      },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("全通庆典双旗（oracle firstComplete/gameComplete 同构）", () => {
  it("置位段：全 3 星 && gameComplete 未置 → firstComplete 置位，gameComplete 持久化", () => {
    processWinResult(true);
    expect(backing["fw-gamecomplete-v1"]).toBe("1");
    expect(takeFirstComplete()).toBe(true);
    expect(takeFirstComplete()).toBe(false); // 读即清（:1939549 消费置 !1）
  });

  it("b=false：不置 transient，gameComplete 落 0（oracle set 无条件写 b）", () => {
    processWinResult(false);
    expect(backing["fw-gamecomplete-v1"]).toBe("0");
    expect(takeFirstComplete()).toBe(false);
  });

  it("gameComplete 已置后再达 100%：不重置 transient（b && !get 门）", () => {
    processWinResult(true);
    takeFirstComplete(); // 已消费
    processWinResult(true); // 第二次全 3 星达成（如重开存档后）
    expect(takeFirstComplete()).toBe(false);
  });

  it("gameComplete=0 后再全 3 星：重新置位（get 门为假路径）", () => {
    processWinResult(false);
    processWinResult(true);
    expect(takeFirstComplete()).toBe(true);
  });

  it("旧门迁移：fw-complete-shown 有值 → gameComplete=1 且旧键删除（已庆不重播）", () => {
    backing["fw-complete-shown"] = "1";
    expect(loadGameComplete()).toBe(true);
    expect(backing["fw-complete-shown"]).toBeUndefined();
    expect(backing["fw-gamecomplete-v1"]).toBe("1");
  });

  it("saveBest 返回是否刷新 best（oracle update betterThan 门）", () => {
    expect(saveBest("tutorials/levels/forest_01.json", 2, 40)).toBe(true);
    expect(saveBest("tutorials/levels/forest_01.json", 2, 39)).toBe(true); // 同星优时
    expect(saveBest("tutorials/levels/forest_01.json", 2, 39)).toBe(false); // 持平
    expect(saveBest("tutorials/levels/forest_01.json", 1, 10)).toBe(false); // 星低不覆
    expect(saveBest("tutorials/levels/forest_01.json", 3, 99)).toBe(true); // 星高覆
    expect(loadProgress()["tutorials/levels/forest_01.json"]).toEqual({ stars: 3, time: 99 });
  });

  it("played 集与庆典旗两域独立（oracle played 与 firstComplete 独立进度标志）", () => {
    markPlayed("tutorials/levels/forest_01.json");
    processWinResult(true);
    expect(loadPlayed().has("tutorials/levels/forest_01.json")).toBe(true);
    expect(backing["fw-played-v1"]).toContain("forest_01");
    expect(backing["fw-gamecomplete-v1"]).toBe("1");
    // 删庆典旗不影响 played，反之亦然
    delete backing["fw-gamecomplete-v1"];
    expect(loadPlayed().has("tutorials/levels/forest_01.json")).toBe(true);
  });
});

describe("存储不可用降级（M13：隐私模式/配额满不阻断结算）", () => {
  it("写入抛错：markPlayed/saveBest 不抛，best 仍按刷新返回 true", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: () => {},
      },
    });
    expect(() => markPlayed("tutorials/levels/forest_01.json")).not.toThrow();
    expect(saveBest("tutorials/levels/forest_01.json", 3, 12)).toBe(true);
  });

  it("读取抛错：loadProgress/loadGameComplete 返回安全缺省", () => {    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {},
        removeItem: () => {},
      },
    });
    expect(loadProgress()).toEqual({});
    expect(loadGameComplete()).toBe(false);
  });
});

/**
 * r48：loadProgress 的原文串记忆缓存（选关菜单入场从 22.4ms 降到 37.6µs 的那一层）。
 * 这里钉死三条语义边界——缓存必须对调用方完全透明，否则会静默丢存档/读到假成绩。
 */
describe("loadProgress 原文串缓存（r48）", () => {
  it("外部写入立即可见（不返回陈旧数据）", () => {
    backing["fw-temple-progress-v1"] = JSON.stringify({ a: { stars: 1, time: 10 } });
    expect(loadProgress().a).toEqual({ stars: 1, time: 10 });
    // 绕过本模块直接改底层串（模拟另一个标签页写入）
    backing["fw-temple-progress-v1"] = JSON.stringify({ a: { stars: 3, time: 5 } });
    expect(loadProgress().a).toEqual({ stars: 3, time: 5 });
  });

  it("saveBest 写入后再次读取拿到新值（缓存随串自动失效）", () => {
    expect(saveBest("k", 2, 30)).toBe(true);
    expect(loadProgress()["k"]).toEqual({ stars: 2, time: 30 });
    expect(saveBest("k", 3, 20)).toBe(true);
    expect(loadProgress()["k"]).toEqual({ stars: 3, time: 20 });
  });

  it("写入抛错时不污染缓存（配额满/隐私模式仍读到写前的真实存档）", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    backing["fw-temple-progress-v1"] = JSON.stringify({ k: { stars: 1, time: 99 } });
    expect(loadProgress()["k"]).toEqual({ stars: 1, time: 99 }); // 先把缓存填上
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string): string | null => (k in backing ? backing[k] : null),
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: () => {},
      },
    });
    // saveBest 会复制缓存对象再改，写失败时底层串不变 → 再读仍是写前的值
    expect(saveBest("k", 3, 1)).toBe(true);
    expect(loadProgress()["k"]).toEqual({ stars: 1, time: 99 });
  });

  it("存档串损坏时按空存档降级，不抛错", () => {
    backing["fw-temple-progress-v1"] = "{ 不是 JSON";
    expect(loadProgress()).toEqual({});
    // 后续写入仍可恢复正常工作
    backing["fw-temple-progress-v1"] = "{}";
    expect(saveBest("k", 2, 40)).toBe(true);
    expect(loadProgress()["k"]).toEqual({ stars: 2, time: 40 });
  });
});
