import { describe, expect, it } from "vitest";
import { levelExists, listLevelIds, loadLevel } from "../levels.js";

/**
 * 服务端关卡加载面补测（fw-cov 批）：LEVEL_DIRS 13 目录枚举、正则门禁、
 * statSync 存在性缓存、逐关 bundle 缓存、缺失关显式抛错。
 * 断言锚点 = 仓库 data/ 实际文件（2026-10-30 ls 实测：forest 47 / light 39 /
 * ice 50 / crystal 35 / elements 37 / fairytales 30 / tutorials 8）。
 */
describe("levels：levelExists 门禁", () => {
  it("非法 id（路径穿越/空串/非法字符）一律 false，不触盘", () => {
    expect(levelExists("../evil")).toBe(false);
    expect(levelExists("forest_01/x")).toBe(false);
    expect(levelExists("")).toBe(false);
    expect(levelExists("forest 01")).toBe(false);
  });

  it("未知 id false；已知 id true 且二次查询走正例缓存", () => {
    expect(levelExists("no_such_level_xyz")).toBe(false);
    expect(levelExists("forest_02")).toBe(true);
    expect(levelExists("forest_02")).toBe(true); // existsCache 命中路径（行为等价，不抛不 false）
  });
});

describe("levels：listLevelIds 目录枚举", () => {
  it("汇总各目录 .json，含四部+elements+仙子代表关", () => {
    const ids = listLevelIds();
    expect(ids).toContain("forest_02"); // data/forest/levels
    expect(ids).toContain("light_02"); // data/light/levels
    expect(ids).toContain("ice_03"); // data/ice/levels
    expect(ids).toContain("crystal_04"); // data/crystal/levels
    expect(ids).toContain("ecrystal_crystal-1"); // data/elements/crystal/levels
    expect(ids).toContain("fairies-01"); // data/fairytales/levels
    expect(ids).toContain("forest_01"); // 首关兜底在 tutorials
    expect(ids.length).toBe(241); // 2026-10-30 各目录 .json 计数总和
    expect(new Set(ids).size).toBe(ids.length); // 目录间无同 id
  });
});

describe("levels：loadLevel", () => {
  it("缺失关显式抛错，报文含查找目录清单", () => {
    try {
      loadLevel("no_such_level_xyz");
      expect.unreachable("必须抛出");
    } catch (e) {
      expect((e as Error).message).toContain("关卡不存在: no_such_level_xyz");
      expect((e as Error).message).toContain("data/forest/levels");
      expect((e as Error).message).toContain("data/tutorials/levels");
    }
  });

  it("合法关返回 bundle：json 原文 + 解析产物，二次调用同实例（bundleCache）", () => {
    const b = loadLevel("forest_01");
    expect(b.id).toBe("forest_01");
    expect((b.json as { width: number }).width).toBe(39);
    // forest_01 Chars 层实证（level2.test 同锚）：fb 底边中点 (96,896)
    expect(b.level.spawn.fireboy).toEqual({ x: 96, y: 896 });
    expect(b.level.cols).toBe(39);
    expect(loadLevel("forest_01")).toBe(b);
  });

  it("跨目录兜底：crystal_03 只在 tutorials 目录也能加载", () => {
    const b = loadLevel("crystal_03");
    expect(b.level.spawn.fireboy.x).not.toBeNaN();
  });
});
