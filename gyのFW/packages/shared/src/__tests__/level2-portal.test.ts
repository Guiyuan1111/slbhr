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
      const p = new URL(source, `file:///${baseDir}/`).pathname.replace(/^\/([A-Za-z]:)/, "$1");
      cache.set(source, JSON.parse(readFileSync(decodeURI(p), "utf8")));
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

// 传送门 def 提取（crystal 第四部/elements 第五部 Phase 2 前置）：语义（成对/触发/速度/冷却）
// 由内核按 oracle 取证实现；此处只锚定解析口径——localId 0/1 → inverted false/true、
// group/portalId 合并属性、LargeObjects firstgid 逐关漂移下按区间归属（E 部 §6 勘误）。
describe("level2 portal def 提取（crystal/elements 真数据）", () => {
  it("crystal_03 教学关：8 处 portal，解析不变量（group===portalId、inverted 双值、无 unknown）", () => {
    const lv = loadLevel("crystal_03", "tutorials/levels");
    expect(lv.portals).toHaveLength(8);
    // 实测不变量：group 与 portalId 数值恒等（tile 两 localId 的 tileproperties 同组默认）
    for (const p of lv.portals) expect(p.portalId).toBe(p.group);
    // inverted 两态都出现（tile 0/1）；配对拓扑不预判——group 0 实为双 true 无 false，
    // 成对/方向语义由内核按 oracle 取证实现（2026-10-30-crystal-temple 档卷）
    const vals = new Set(lv.portals.map((p) => p.inverted));
    expect(vals.size).toBe(2);
    expect(lv.unknown.filter((u) => u.includes("portal"))).toHaveLength(0);
  });

  it("ecrystal_Portals_1：4 处 portal 且不再入 unknown（E 部 firstgid 漂移勘误回归）", () => {
    const lv = loadLevel("ecrystal_Portals_1", "elements/crystal/levels");
    expect(lv.portals).toHaveLength(4);
    expect(lv.unknown.filter((u) => u.startsWith("LargeObjects:portal"))).toHaveLength(0);
  });

  it("portal def 字段完整性：矩形有限、rotation 数值、id 唯一", () => {
    const lv = loadLevel("crystal_03", "tutorials/levels");
    const ids = new Set(lv.portals.map((p) => p.id));
    expect(ids.size).toBe(lv.portals.length);
    for (const p of lv.portals) {
      expect(Number.isFinite(p.rect.x)).toBe(true);
      expect(Number.isFinite(p.rect.y)).toBe(true);
      expect(p.rect.w).toBeGreaterThan(0);
      expect(Number.isFinite(p.rotation)).toBe(true);
      expect(typeof p.group).toBe("number");
      expect(typeof p.portalId).toBe("number");
    }
  });
});
