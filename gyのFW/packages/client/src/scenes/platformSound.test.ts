import { describe, expect, it } from "vitest";
import { PlatformSoundTracker, type PlatformSoundHost } from "./platformSound";

class FakeHost implements PlatformSoundHost<string> {
  plays: string[] = [];
  stops: string[] = [];
  private seq = 0;
  private readonly enabled: boolean;
  constructor(enabled = true) {
    this.enabled = enabled;
  }
  play(id: string): string | null {
    this.plays.push(id);
    return this.enabled ? `${id}#${++this.seq}` : null;
  }
  stop(id: string, sound: string): void {
    this.stops.push(`${id}:${sound}`);
  }
}

describe("PlatformSoundTracker", () => {
  it("首见采样不出声，起步只起一个实例，持续运动不重复起播", () => {
    const host = new FakeHost();
    const t = new PlatformSoundTracker(host);
    t.update("p0", { x: 0, y: 0, angle: 0 });
    expect(host.plays).toEqual([]);
    t.update("p0", { x: 1, y: 0, angle: 0 });
    expect(host.plays).toEqual(["p0"]);
    t.update("p0", { x: 2, y: 0, angle: 0 });
    t.update("p0", { x: 3, y: 0, angle: 0 });
    expect(host.plays).toEqual(["p0"]);
    expect(host.stops).toEqual([]);
  });

  it("限位停住即停实例", () => {
    const host = new FakeHost();
    const t = new PlatformSoundTracker(host);
    t.update("p0", { x: 0, y: 0, angle: 0 });
    t.update("p0", { x: 1, y: 0, angle: 0 });
    t.update("p0", { x: 1, y: 0, angle: 0 });
    expect(host.stops).toEqual(["p0:p0#1"]);
    t.update("p0", { x: 1, y: 0, angle: 0 });
    expect(host.stops).toHaveLength(1);
  });

  it("反向时停旧起新", () => {
    const host = new FakeHost();
    const t = new PlatformSoundTracker(host);
    t.update("p0", { x: 0, y: 0, angle: 0 });
    t.update("p0", { x: 1, y: 0, angle: 0 });
    t.update("p0", { x: 0, y: 0, angle: 0 });
    expect(host.stops).toEqual(["p0:p0#1"]);
    expect(host.plays).toEqual(["p0", "p0"]);
  });

  it("转臂按角度差分起步与反向", () => {
    const host = new FakeHost();
    const t = new PlatformSoundTracker(host);
    t.update("r0", { x: 5, y: 5, angle: 0 });
    expect(host.plays).toEqual([]);
    t.update("r0", { x: 5, y: 5, angle: 0.02 });
    expect(host.plays).toEqual(["r0"]);
    t.update("r0", { x: 5, y: 5, angle: 0.01 });
    expect(host.stops).toEqual(["r0:r0#1"]);
    expect(host.plays).toEqual(["r0", "r0"]);
  });

  it("音效关闭时 play 返回 null 也不炸，clear 释放全部在播实例", () => {
    const off = new FakeHost(false);
    const t1 = new PlatformSoundTracker(off);
    t1.update("p0", { x: 0, y: 0, angle: 0 });
    t1.update("p0", { x: 1, y: 0, angle: 0 });
    t1.update("p0", { x: 1, y: 0, angle: 0 });
    expect(off.stops).toEqual([]);

    const host = new FakeHost();
    const t2 = new PlatformSoundTracker(host);
    t2.update("p0", { x: 0, y: 0, angle: 0 });
    t2.update("p1", { x: 0, y: 0, angle: 0 });
    t2.update("p0", { x: 1, y: 0, angle: 0 });
    t2.update("p1", { x: 0, y: 1, angle: 0 });
    t2.clear();
    expect(host.stops).toEqual(["p0:p0#1", "p1:p1#2"]);
  });
});
