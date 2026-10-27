/**
 * 场景级易失状态清单守卫（#29/#40）：
 * 1. clearSceneStates/resetFxStates 行为断言（纯逻辑，node 可测）；
 * 2. 守卫：GameScene 源码声明的每个 `= new Map` 字段（及 PlatformSoundTracker 实例）
 *    都必须登记在 SCENE_STATE_KEYS——防 #29→#40 式「同类新增再漏网」复发；
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clearSceneStates, FX_STATE_INIT, resetFxStates, SCENE_STATE_KEYS } from "../scenes/sceneState";

describe("clearSceneStates / resetFxStates 行为", () => {
  it("Map.clear / 数组清空 / 字符串复位，三型各按语义处理", () => {
    const target: Record<string, unknown> = {
      iceViews: new Map([["0:1", null]]),
      lastBeamPts: new Map([["L1", [[0, 0]]]]),
      lastLiquids: "1010",
      hudItems: [{}],
      rotMirrorOn: new Map([["1", true]]),
    };
    clearSceneStates(target, SCENE_STATE_KEYS);
    expect((target.iceViews as Map<string, unknown>).size).toBe(0);
    expect((target.lastBeamPts as Map<string, unknown>).size).toBe(0);
    expect((target.rotMirrorOn as Map<string, unknown>).size).toBe(0);
    expect(target.lastLiquids).toBe("");
    expect(target.hudItems).toEqual([]);
  });

  it("clear() 报毒的容器不炸（clear 非（函）数/值空态各型兜底）", () => {
    const target: Record<string, unknown> = { a: new Set([1]), b: undefined, c: 5 };
    expect(() => clearSceneStates(target, ["a" as never, "b" as never, "c" as never])).not.toThrow();
    expect((target.a as Set<number>).size).toBe(0);
    expect(target.b).toBeUndefined();
    expect(target.c).toBe(5); // 数值型不在清单语义内，原样保留
  });

  it("resetFxStates 复位 #29 八件且数组取新实例", () => {
    const target: Record<string, unknown> = {
      darkRt: {} as unknown,
      dustMaskSig: "sig",
      dustWobble: [{ img: {} as never, dir: 1, angle: 0 }],
    };
    resetFxStates(target);
    expect(target.darkRt).toBeNull();
    expect(target.dustMaskSig).toBe("");
    expect(target.dustWobble).toEqual([]);
    expect(target.dustWobble).not.toBe(FX_STATE_INIT.dustWobble);
  });
});

describe("SCENE_STATE_KEYS 守卫（防同类新增漏网）", () => {
  it("GameScene 源码声明的每个 `= new Map` 字段都已登记", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../scenes/GameScene.ts"), "utf-8");
    const declared = [...src.matchAll(/private (?:readonly )?(\w+) = new Map/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThanOrEqual(35);
    const missing = declared.filter((k) => !(SCENE_STATE_KEYS as readonly string[]).includes(k));
    expect(missing).toEqual([]);
  });

  it("FX_STATE_INIT 覆盖 #29 全部八件", () => {
    expect(Object.keys(FX_STATE_INIT).sort()).toEqual(
      ["darkHalo", "darkRt", "dustContainer", "dustMask", "dustMaskSig", "dustWobble", "staticHaloRt", "staticHaloSig"].sort(),
    );
  });

  it("create 的幂等条件仍以引用非空判断（init 归零后语义成立，#29 原契约保留）", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../scenes/GameScene.ts"), "utf-8");
    expect(src).toContain('if (this.darkRt || this.templeType !== "dark") return;');
    expect(src).toContain("if (level.beamers.length === 0 || this.dustContainer) return;");
  });
});

