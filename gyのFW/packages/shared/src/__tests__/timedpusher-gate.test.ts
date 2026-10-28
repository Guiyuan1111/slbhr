/**
 * TimedPusher 组派发链行为钉（2026-10-28 ice_02 闸门保真修复）。
 *
 * 修复前：TimedPusher 被当成纯音效广播件（不入 MechManager 组、state 迁移不派发），
 * 组内平台永不动——ice_02 升降闸门 p2 卡死、门室封死、关卡在内核无解。
 * oracle 证据：C bundle @1726729 TimedPusher extends Pusher，构造器末尾 registerDevice()
 * 入组 + signal 接线 deviceChanged；checkState 三处 state 迁移（压下沿/到时沿/无 timer
 * 早松沿）即 signal.dispatch 点。
 *
 * 本文件以 ice_02（t0 group0 time4000 → p2 竖直平台 dy=3）实测全周期：
 * 不踩不动 / 踩下上升 / 持续踩住保持（按压重置计时）/ 离开 4s 后回落。
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseLevel, type LevelData } from "../level2.js";
import { World } from "../kernel/world.js";
import { b2 } from "../kernel/b2.js";
import type { InputState } from "../types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const NONE: InputState = { up: false, left: false, right: false };

function makeIce02(): World {
  const dir = `${ROOT}/data/tutorials/levels`;
  const json = JSON.parse(readFileSync(`${dir}/ice_02.json`, "utf8"));
  const data = parseLevel("ice_02", json, (source) =>
    JSON.parse(readFileSync(join(dir, source), "utf8")),
  );
  return new World(data);
}

/** 屏幕像素 → 物理 m（内核 y 取负，见 b2.ts px2m） */
function px(x: number, y: number): { x: number; y: number } {
  return { x: -x / 32, y: -y / 32 };
}

function stepN(w: World, n: number, fb: InputState = NONE, wg: InputState = NONE): void {
  for (let i = 0; i < n; i++) w.step(1 / 60, { fireboy: fb, watergirl: wg });
}

/** 把角色放到屏幕 px 坐标（清速度+唤醒；探针口径，settle 数帧即落在支撑面上） */
function teleport(w: World, role: "fireboy" | "watergirl", x: number, y: number): void {
  const B = b2();
  const ch = w.players[role];
  ch.body.SetPosition(new B.b2Vec2(px(x, y).x, px(x, y).y));
  ch.body.SetLinearVelocity(new B.b2Vec2(0, 0));
  ch.body.SetAwake(true);
}

describe("TimedPusher 组派发链（ice_02 闸门）", () => {
  it("不踩定时钮：p2 恒在原位（state0 马达守 upper=0）", () => {
    const w = makeIce02();
    stepN(w, 300);
    const m = w.mechSnapshot();
    expect(m.timedPushers[0].state).toBe(0);
    expect(m.platforms[2].y).toBe(112);
  });

  it("踩下 t0 → 派发链驱动 p2 上升；持续踩住保持不回落（按压重置计时）", () => {
    const w = makeIce02();
    teleport(w, "fireboy", 1168, 280); // t0 (1168,320) 台顶 320，落入梯形座
    stepN(w, 90);
    let m = w.mechSnapshot();
    expect(m.timedPushers[0].state).toBe(1);
    const upY = m.platforms[2].y;
    expect(upY).toBeLessThan(80); // 112 → −96px 行程（探针实测 16）
    stepN(w, 300); // 再按住 5s > time 4000ms
    m = w.mechSnapshot();
    expect(m.timedPushers[0].state).toBe(1);
    expect(Math.abs(m.platforms[2].y - upY)).toBeLessThan(4); // 限位处求解器微抖 ~1px
  });

  it("离开后 ~4s（time=4000）到时回弹：state→0、p2 回原位", () => {
    const w = makeIce02();
    teleport(w, "fireboy", 1168, 280);
    stepN(w, 90);
    expect(w.mechSnapshot().timedPushers[0].state).toBe(1);
    teleport(w, "fireboy", 1124, 288); // 移出按钮（仍在其站台 1120..1216 上）
    stepN(w, 420); // 到时 ≤4s + 回落行程 96px@2m/s≈1.5s
    const m = w.mechSnapshot();
    expect(m.timedPushers[0].state).toBe(0);
    expect(Math.abs(m.platforms[2].y - 112)).toBeLessThan(2);
  });
});
