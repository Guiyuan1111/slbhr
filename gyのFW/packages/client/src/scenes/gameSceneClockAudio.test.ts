/**
 * #22 回归：定时推杆 clock 音效的两处生命周期缺陷。
 *
 * 1. drainSfx 的 pusher 分支曾对全部 timedPusherViews 做全局 stop——任意推杆
 *   （普通/任意定时实例）事件都会齐停所有倒计时音，下一帧又同 seek 重启成可听断续；
 *    起停必须只由各视图自身的 downState/state 驱动（cbTimedPushers）。
 * 2. clockSnd 是挂在全局 SoundManager 上的实例，场景 SHUTDOWN 不自动销毁——
 *    必须逐视图 stop+destroy，并把 sfx_clock 纳入兜底 stopByKey 列表。
 *
 * GameScene 依赖完整 Phaser 运行时（无 headless harness），以源码契约为断言对象。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./GameScene.ts", import.meta.url)), "utf8");

function slice(startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  expect(start, `找不到 ${startMarker}`).toBeGreaterThan(0);
  const end = src.indexOf(endMarker, start);
  expect(end, `找不到结束边界 ${endMarker}`).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("#22 clock 音局部化+销毁", () => {
  it("drainSfx 的 pusher 分支不再全局停 clock", () => {
    const body = slice("private drainSfx(): void {", "private updatePlayers(");
    expect(body).toContain('m.kind === "pusher"');
    expect(body).not.toContain("timedPusherViews");
    expect(body).not.toContain("clockSnd");
  });

  it("cbTimedPushers 保持 downState 驱动起停", () => {
    const body = slice("if (Number(ts.downState) === 0)", "private cbSliders =");
    expect(body).toContain('this.sound.add("sfx_clock")');
    expect(body).toContain("v.clockSnd.play(");
    expect(body).toContain("v.clockSnd.stop()");
  });

  it("SHUTDOWN 逐视图销毁 clockSnd 并把 sfx_clock 纳入兜底停音", () => {
    const body = slice("Events.SHUTDOWN, () => {", "});");
    expect(body).toContain("for (const v of this.timedPusherViews.values())");
    expect(body).toContain("v.clockSnd.stop()");
    expect(body).toContain("v.clockSnd.destroy()");
    expect(body).toContain('"sfx_clock"');
  });
});
