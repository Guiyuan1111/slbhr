/**
 * autosearch 纯函数单测（fw-autosearch-fix 槽，2026-11-01）。
 *
 * 运行：node --import tsx --test scripts/e2e/routetool/autosearch.test.mjs
 * 说明：vitest.config.ts include 只收 packages/**（本件不入该门禁）；autosearch.mjs 的
 * 搜索主循环有 CLI 直跑判据保护（argv[1] 指向本文件才执行），import 侧只装载词表与纯函数。
 *
 * 首批用例：定稿修剪·驻留件地板 dwellFloorOf（02号档-e_tutorial_fire.md §5-a 移交项——
 * trim 应保留带刹车 done 的驻留件 goTo/walkTo，不被 metIdx 浅剪按休眠件裁掉）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dwellFloorOf } from "./autosearch.mjs";

const sp = (n, ...a) => ({ n, a });

test("dwellFloorOf: 尾部 goTo/walkTo 抬高修剪下界（E0 十二轮 trim 裁 goTo 出窗的通用修复）", () => {
  // 02号档 §3 轮 12 实测形态：metIdx=4（goTo 刹驻途中 met），trim=[4,1] 裁掉 goTo(744,10)
  // → 锁存退化成 jd 行进方向键 → fb 跑出 [720,790] 窗。地板=5 令首剪即保留驻留件。
  const sf = [sp("sleep", 3), sp("hold", -1, 480), sp("jumpDrift", 1, 0, 50), sp("jumpDrift", 1, 0, 50), sp("goTo", 744, 10)];
  assert.equal(dwellFloorOf(sf), 5);
  assert.equal(dwellFloorOf([sp("sleep", 3), sp("walkTo", -1, 460, 70)]), 2); // walkTo 计入驻留件
});

test("dwellFloorOf: 无驻留件=0；驻留件位于浅剪上界之前时不约束（浅剪优先语义不变）", () => {
  assert.equal(dwellFloorOf([sp("sleep", 3), sp("jumpDrift", -1, 0, 40), sp("sleep", 60)]), 0);
  // crystal_03 C3 形态：walkTo 在程序头部，met 发生在其后——地板=1 ≤ mi，max() 无感
  const sf = [sp("walkTo", -1, 84, 70), sp("jumpDrift", -1, 0, 40), sp("sleep", 60)];
  assert.equal(dwellFloorOf(sf), 1);
});

test("dwellFloorOf: holdLev 状态门件不计入驻留件（完成后锁存方向键=e17e5b2 病灶）", () => {
  assert.equal(dwellFloorOf([sp("holdLev", 1, 0, 1), sp("sleep", 40)]), 0);
  // 混合程序只认最后一个 goTo/walkTo
  const sf = [sp("holdLev", 1, 0, 1), sp("walkTo", -1, 460, 70), sp("sleep", 40)];
  assert.equal(dwellFloorOf(sf), 2);
});
