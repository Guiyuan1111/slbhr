import { describe, expect, it } from "vitest";
import { validateSnapshot } from "./snapshotValidation";

function player(x = 0, y = 0) {
  return { x, y, vx: 0, vy: 0, facing: 1, anim: "idle" };
}

function baseState() {
  return {
    phase: "started",
    levelId: "forest_01",
    timerMs: 0,
    players: new Map([
      ["fireboy", player()],
      ["watergirl", player()],
    ]),
    diamonds: new Map([["d1", { collected: false }]]),
    levers: new Map([["l1", { state: 0, angle: 0 }]]),
    platforms: new Map([["p1", { x: 0, y: 0, angle: 0, state: 0 }]]),
  };
}

describe("validateSnapshot", () => {
  it("合法快照返回空数组", () => {
    expect(validateSnapshot(baseState(), ["fireboy", "watergirl"])).toEqual([]);
  });

  it("缺失角色与角色字段类型错误给出路径", () => {
    const st = baseState();
    st.players.delete("watergirl");
    (st.players.get("fireboy") as any).x = "12";
    const issues = validateSnapshot(st, ["fireboy", "watergirl"]);
    expect(issues).toContainEqual({ path: "players.watergirl", expected: "present" });
    expect(issues).toContainEqual({ path: "players.fireboy.x", expected: "finite number" });
  });

  it("可选机关组缺失不算问题，但存在且非 map 会告警", () => {
    const st = baseState();
    delete (st as any).platforms;
    expect(validateSnapshot(st, ["fireboy", "watergirl"])).toEqual([]);

    const bad = baseState();
    (bad as any).levers = [];
    expect(validateSnapshot(bad, ["fireboy", "watergirl"])).toContainEqual({
      path: "levers",
      expected: "map",
    });
  });

  it("机关条目缺字段与钻石类型错误给出路径", () => {
    const st = baseState();
    (st.diamonds.get("d1") as any).collected = 0;
    delete (st.levers.get("l1") as any).angle;
    const issues = validateSnapshot(st, ["fireboy", "watergirl"]);
    expect(issues).toContainEqual({ path: "diamonds.d1.collected", expected: "boolean" });
    expect(issues).toContainEqual({ path: "levers.l1.angle", expected: "finite number" });
  });

  it("state 为空时返回根路径问题", () => {
    expect(validateSnapshot(null, [])).toEqual([{ path: "state", expected: "object" }]);
  });
});
