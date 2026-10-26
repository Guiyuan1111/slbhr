/**
 * #29 回归：GameScene 在 stop/start 间复用同一实例，Phaser DisplayList.shutdown 会把
 * 显示列表中的全部子对象逐个 destroy——darkRt 族/浮尘族/lastBeamPts 若不在 init 归零，
 * create 里的幂等条件（引用非空）会跳过重建，二次进入暗关/光柱关黑幕与浮尘永久丢失。
 *
 * GameScene 依赖完整 Phaser 运行时（无 headless harness），此处以源码契约为断言对象：
 * resetFxState 必须存在、必须覆盖全部长生命周期引用、init 必须调用它并清空 lastBeamPts。
 * 删除任一关键行都会让本测试变红。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./GameScene.ts", import.meta.url)), "utf8");

/** 截取 init() 方法体（到 resetFxState 声明前），断言只在 init 内部做 */
function initBody(): string {
  const start = src.indexOf("  init(): void {");
  expect(start, "找不到 init()").toBeGreaterThan(0);
  const end = src.indexOf("resetFxState(): void", start);
  expect(end, "找不到 resetFxState()").toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("#29 GameScene 复用残留引用清空", () => {
  it("init() 调用 resetFxState 并清空 lastBeamPts", () => {
    const body = initBody();
    expect(body).toContain("this.resetFxState()");
    expect(body).toContain("this.lastBeamPts.clear()");
  });

  it("resetFxState 归零黑幕/浮尘全部长生命周期引用", () => {
    const m = src.match(/resetFxState\(\): void \{([\s\S]*?)\n  \}/);
    expect(m, "找不到 resetFxState 方法体").toBeTruthy();
    const body = m![1];
    // dark 关黑幕族
    expect(body).toContain("this.darkRt = null");
    expect(body).toContain("this.darkHalo = null");
    expect(body).toContain("this.staticHaloRt = null");
    expect(body).toContain("this.staticHaloSig = null");
    // 光柱浮尘族
    expect(body).toContain("this.dustContainer = null");
    expect(body).toContain("this.dustMask = null");
    expect(body).toContain('this.dustMaskSig = ""');
    expect(body).toContain("this.dustWobble = []");
  });

  it("create 的幂等条件仍以引用非空判断（resetFxState 后语义成立）", () => {
    expect(src).toContain("if (this.darkRt || this.templeType !== \"dark\") return;");
    expect(src).toContain("if (level.beamers.length === 0 || this.dustContainer) return;");
  });
});
