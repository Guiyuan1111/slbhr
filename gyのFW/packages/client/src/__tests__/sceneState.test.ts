/**
 * 场景级易失状态清单守卫（#29/#40）：
 * 1. clearSceneStates/resetFxStates 行为断言（纯逻辑，node 可测）；
 * 2. 守卫：GameScene 源码声明的每个 `= new Map` 字段（及 PlatformSoundTracker 实例）
 *    都必须登记在 SCENE_STATE_KEYS——防 #29→#40 式「同类新增再漏网」复发；
 * 3. iceViews 索引域前提/契约（light_28 / ice_11 fixture）：water 在全部 liquid run 中
 *    的位次 ≠ 只数 water 的位次（旧实现错位根因）；内核 world.liquids 顺序与
 *    level.liquidRuns 逐条对应（客户端按 liquidRuns 序消费 st.liquids 位串的契约）。
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clearSceneStates, FX_STATE_INIT, resetFxStates, SCENE_STATE_KEYS } from "../scenes/sceneState";
import { parseLevel } from "../../../shared/src/level2.js";
import { World } from "../../../shared/src/kernel/world.js";

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
  // #49：create 幂等条件的源码文本契约已退役——决策抽 gameGuards.needsDarkRt/needsDust，
  // 行为断言见 gameGuards.test.ts（文本契约对逻辑破坏假绿，#39 审计实测 6/6 仍 PASS）。
});

describe("iceViews 索引域契约（light_28 / ice_11 fixture，#40）", () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const DIR = (t: string) => join(ROOT, "data", t, "levels");

  function loadLevel(temple: string, id: string) {
    const dir = DIR(temple);
    const json = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf-8"));
    return parseLevel(id, json, (s: string) => JSON.parse(readFileSync(join(dir, s), "utf-8")));
  }

  it("错位前提成立：water 位次（全 run 序）≠ water-only 位次", () => {
    for (const [temple, id] of [
      ["light", "light_28"],
      ["ice", "ice_11"],
    ] as const) {
      const lv = loadLevel(temple, id);
      const waterRuns = lv.liquidRuns.filter((r) => r.kind === "water");
      expect(lv.liquidRuns.length).toBeGreaterThan(waterRuns.length); // 存在非 water run
      // 首个 water run 的全序下标必须与 water-only 下标不同（否则该关不构成错位 fixture）
      const firstWaterAll = lv.liquidRuns.findIndex((r) => r.kind === "water");
      expect(firstWaterAll).toBeGreaterThan(0);
      expect(waterRuns.length).toBeGreaterThan(0);
    }
  });

  it("内核契约：world.liquids 与 level.liquidRuns 逐条同序同段（位串下标=run 序）", () => {
    for (const [temple, id] of [
      ["light", "light_28"],
      ["ice", "ice_11"],
    ] as const) {
      const lv = loadLevel(temple, id);
      const w = new World(lv);
      const liquids = (w as unknown as { liquids: Array<{ row: number; col0: number; col1: number; kind: string }> }).liquids;
      expect(liquids.length).toBe(lv.liquidRuns.length);
      liquids.forEach((l, i) => {
        expect([l.row, l.col0, l.col1, l.kind]).toEqual([lv.liquidRuns[i].row, lv.liquidRuns[i].col0, lv.liquidRuns[i].col1, lv.liquidRuns[i].kind]);
      });
    }
  });
});
