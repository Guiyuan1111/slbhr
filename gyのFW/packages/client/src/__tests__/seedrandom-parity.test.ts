/**
 * seedrandom CSP 修复（2026-10-28）回归锚：new Function 字符串加载被 CSP 禁 eval
 * 拦截导致浏览器建房进 Game 全断（0.3.51–0.3.55），修复改为真实源码模块加载。
 * 修复当日已做 10000 步双实现对拍（逐数全等）；本测试把旧实现（new Function 路径，
 * node 无 CSP 可用）产出的序列硬编码为锚，钉住 z() 步进装饰复刻（G12）的确定性。
 */
import { describe, expect, it } from "vitest";
import { createSeedrandomFactory } from "../vendor/seedrandom.js";

describe("seedrandom：CSP 修复后的序列锚（G12 装饰步进）", () => {
  it('seed="ASDFA" 前 8 个数与修复前 new Function 路径逐数一致', () => {
    const rng = createSeedrandomFactory()("ASDFA");
    const anchor = [0.152243307579, 0.5385082898, 0.585685851861, 0.39318176172, 0.810036156013, 0.311816659261, 0.343346165063, 0.81438619916];
    for (let i = 0; i < anchor.length; i++) {
      expect(+rng().toFixed(12), `第 ${i} 步漂移`).toBe(anchor[i]);
    }
  });

  it("同种子序列确定（重入工厂再取同段全等）", () => {
    const a = Array.from({ length: 64 }, () => createSeedrandomFactory()("ASDFA")());
    const b = Array.from({ length: 64 }, () => createSeedrandomFactory()("ASDFA")());
    expect(b).toEqual(a);
  });
});
