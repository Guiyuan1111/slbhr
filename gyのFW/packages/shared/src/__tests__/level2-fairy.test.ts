import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLevel } from "../level2.js";

// packages/shared/src/__tests__ → 仓库根
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function makeProvider(baseDir: string) {
  const cache = new Map<string, any>();
  return (source: string) => {
    if (!cache.has(source)) {
      const p = fileURLToPath(new URL(source, `file:///${baseDir}/`));
      cache.set(source, JSON.parse(readFileSync(p, "utf8")));
    }
    return cache.get(source);
  };
}

const cache = new Map<string, ReturnType<typeof parseLevel>>();
function loadLevel(id: string, dir: string) {
  const key = `${dir}/${id}`;
  if (!cache.has(key)) {
    const json = JSON.parse(readFileSync(`${ROOT}/data/${dir}/${id}.json`, "utf8"));
    cache.set(key, parseLevel(id, json, makeProvider(`${ROOT}/data/${dir}`)));
  }
  return cache.get(key)!;
}

// F 部 fairytales：Tiled 1.x 数据（数组式 properties/tiles）归一化 + fairy/fairycup def 提取。
// 运行时语义（零重力体/拖拽/牵引入杯/检查点复活）由内核按 01号档取证实现。
describe("level2 F 部解析（Tiled 1.x 归一化 + fairy def）", () => {
  it("fairies_000：3 仙女（组色 4/0/5，数组式对象属性覆盖图块默认组 0）+ 4 仙女杯", () => {
    const lv = loadLevel("fairies_000", "tutorials/levels");
    expect(lv.fairies).toHaveLength(3);
    expect(lv.fairies.map((f) => f.group).sort()).toEqual([0, 4, 5]);
    // group=4/5 来自 Tiled 1.x 数组式对象属性——tile 默认为 0，覆盖生效即归一化正确
    expect(lv.fairyCups).toHaveLength(4);
    for (const c of lv.fairyCups) {
      expect(Number.isFinite(c.x)).toBe(true);
      expect(typeof c.group).toBe("number");
    }
  });

  it("fairy 不再误占 fireboy 出生点（spawn 仍为双角色）", () => {
    const lv = loadLevel("fairies_000", "tutorials/levels");
    expect(lv.spawn.fireboy).toBeDefined();
    expect(lv.spawn.watergirl).toBeDefined();
    expect(Number.isFinite(lv.spawn.fireboy.x)).toBe(true);
    expect(Number.isFinite(lv.spawn.watergirl.x)).toBe(true);
  });

  it("fairies-20：Objects 层 2 颗越界 diamond（引擎实锤丢弃）只记 unknown 不进 diamonds", () => {
    const lv = loadLevel("fairies-20", "fairytales/levels");
    const stray = lv.unknown.filter((u) => u.includes("@Chars"));
    expect(stray.length).toBeGreaterThanOrEqual(2);
    // 该关 Chars 层 diamond 正常入库（越界的在 Objects 层，不与 Chars 层混计）
    expect(lv.diamonds.length).toBeGreaterThan(0);
  });
});
