/**
 * 全通庆典双旗单测（P-02 #34，0.3.40）——oracle ProgressModel.process/update 字节语义：
 * - process 置位段 :2149483-:2149538：`b && !get("gameComplete") && (firstComplete=!0), set("gameComplete", b)`
 * - 消费 :1939549/:1932358：读即清（`firstComplete && ((firstComplete=!1), start)`）
 * - update merge 门 :2152850 区：仅 best 刷新才 process（saveBest 返回值对应）
 * - played 集（fw-played-v1）与 gameComplete（fw-gamecomplete-v1）两旗独立
 * node 环境无 localStorage——装最小 memory stub。
 */
import { describe, it, expect, beforeEach } from "vitest";
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
