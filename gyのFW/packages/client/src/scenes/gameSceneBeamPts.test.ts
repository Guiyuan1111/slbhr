/**
 * #30 回归：cbBeamers 的所有「无有效光束」退出路径必须删除 lastBeamPts 缓存。
 *
 * drawDarkness/updateDust 把 lastBeamPts 条目一概视为「当前有光束」——熄灭分支、
 * 视图缺失分支、无效折线分支若只 return 不删除，黑幕会残留永不消失的亮带与光晕、
 * 浮尘掩膜继续生效，暗关谜题信息泄漏。
 *
 * #49（2026-10-28）：缓存决策抽 gameGuards.resolveBeamCache 后，三个退出路径的
 * 行为断言移至 gameGuards.test.ts（决策语义逐路径单测——源码文本契约对逻辑破坏
 * 假绿，#39 审计实测 6/6 仍 PASS，故退役）；本文件保留清单化兜底断言。
 */
import { describe, expect, it } from "vitest";
import { SCENE_STATE_KEYS } from "./sceneState.js";

describe("#30 beamer 熄灭时删除 lastBeamPts", () => {

  it("lastBeamPts 已纳入场景易失状态清单（#40 清单化兜底，#39）", () => {
    expect(SCENE_STATE_KEYS).toContain("lastBeamPts");
  });

  it("三个退出路径的行为断言在 gameGuards.test（resolveBeamCache：视图缺失/熄灭无 pts/短折线 → null，合法路径 → 点阵）", () => {
    // 占位断言承接文件结构：语义断言体已随 #49 抽离迁址（见 gameGuards.test.ts）
    expect(SCENE_STATE_KEYS).toContain("lastBeamPts");
  });
});
