/**
 * r7f font 子集化防护网（note/report/perf/2026-10-19-r7-font-subset.md）。
 *
 * 断言三件事：
 *  1. 手工固化的 MUST_RENDER 渲染串逐字符 ∈ 普查保留集——扫描器对会渲染的字符失明时立刻红；
 *  2. used-chars.json 与当前源码普查一致——新增文案不重跑 `node --import tsx
 *     scripts/font-subset/census.ts` 时红（清单漂移即测试失败）；
 *  3. 清单记录的 fnt 字形集与当前 font.fnt 一致——字库被换时红，提示重走子集化流程。
 *
 * 本轮（r7f）结论是保留原资产未子集化（方案 A 实测 -5.2%、B 面积上界 ~-5%，均 <20% 停止线），
 * 故本测试当前是纯一致性防护网；未来真正应用子集化后，断言 2/3 顺带成为"忘重跑子集化"的哨兵。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeCensus, MUST_RENDER } from "../../../../scripts/font-subset/census";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const MANIFEST_PATH = path.join(ROOT, "scripts", "font-subset", "used-chars.json");

describe("font-subset census 防护网", () => {
  const census = computeCensus();
  const keepSet = new Set(census.keep.map((ch) => ch.codePointAt(0)));

  it("MUST_RENDER 全部渲染串字符都在普查保留集内（scanner 失明检测）", () => {
    const missing: string[] = [];
    for (const s of MUST_RENDER) {
      for (const ch of s) {
        const cp = ch.codePointAt(0);
        if (census.fntIds.has(cp!) && !keepSet.has(cp!)) missing.push(ch);
      }
    }
    expect(missing, `这些会渲染的字符不在普查保留集：${[...new Set(missing)].join("")}`).toEqual([]);
  });

  it("used-chars.json 与当前源码普查一致（新增文案须重跑 census.ts）", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as { chars: number[] };
    const manifestSet = new Set(manifest.chars);
    const missing = census.keep.filter((ch) => !manifestSet.has(ch.codePointAt(0)!));
    const extra = [...manifestSet].filter((cp) => !census.fntIds.has(cp));
    expect(missing.join(""), "清单缺字符——跑 node --import tsx scripts/font-subset/census.ts 刷新").toBe("");
    expect(extra.length, "清单含 fnt 之外的码点——清单或 font.fnt 漂移").toBe(0);
    expect(manifest.chars.length).toBe(census.keep.length);
  });

  it("清单记录的 fnt 字形集与当前 font.fnt 一致（字库漂移检测）", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
      fntChars: number;
      fntIdsSorted: number[];
    };
    const currentIds = [...census.fntIds].sort((a, b) => a - b);
    expect(manifest.fntIdsSorted).toEqual(currentIds);
    expect(manifest.fntChars).toBe(census.fntChars);
  });

  it("保留集是 fnt 字形集的子集且普查覆盖了四个字符源", () => {
    expect(keepSet.size).toBe(census.keep.length);
    for (const ch of census.keep) expect(census.fntIds.has(ch.codePointAt(0)!)).toBe(true);
    // 四源都参与过普查（任一源缺目录会退化成 0，防静默漏扫）
    expect(census.perSource.client).toBeGreaterThan(0);
    expect(census.perSource.serverShared).toBeGreaterThan(0);
    expect(census.perSource.data).toBeGreaterThan(0);
    expect(census.perSource.oracle).toBeGreaterThan(0);
  });
});
