import { describe, expect, it } from "vitest";
import { validateSnapshot } from "./snapshotValidation";

/** 0.3.43 全量字段夹具（与共享 DTO PLAYER_SNAPSHOT_FIELDS 14 字段对齐） */
function player(x = 0, y = 0) {
  return {
    x, y, vx: 0, vy: 0, facing: 1, anim: "idle", headTilt: 0,
    inLiquid: false, dying: false, dead: false, isDead: false,
    atDoor: false, doorFrame: 0, doorUp: false,
  };
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
    levers: new Map([["l1", { group: 0, state: 0, angle: 0 }]]),
    platforms: new Map([["p1", { x: 0, y: 0, angle: 0, state: 0 }]]),
  };
}

describe("validateSnapshot", () => {
  it("合法快照返回空数组", () => {
    expect(validateSnapshot(baseState(), ["fireboy", "watergirl"])).toEqual([]);
  });

  it("角色缺席不算问题（入座时序/L-01 席位释放均合法），在场字段类型错误给出路径", () => {
    const st = baseState();
    st.players.delete("watergirl");
    (st.players.get("fireboy") as any).x = "12";
    const issues = validateSnapshot(st, ["fireboy", "watergirl"]);
    expect(issues).not.toContainEqual({ path: "players.watergirl", expected: "present" });
    expect(issues).toContainEqual({ path: "players.fireboy.x", expected: "finite number" });
  });

  it("可选机关组缺失不算问题，但存在且非 map 会告警", () => {
    const st = baseState();
    delete (st as any).platforms;
    expect(validateSnapshot(st, ["fireboy", "watergirl"])).toEqual([]);

    const bad = baseState();
    (bad as any).levers = 3; // 数组有 forEach 属合法集合（doors 之外各组实测为 MapSchema），非集合才告警
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

  it("doors 单对象纳入监控：字段类型漂移给出路径（客户端暂零消费仍告警）", () => {
    const st = baseState() as any;
    st.doors = { fbAtDoor: false, wgAtDoor: false, fbFrame: "x", wgFrame: 0, fbUp: false, wgUp: false };
    const issues = validateSnapshot(st, ["fireboy", "watergirl"]);
    expect(issues).toContainEqual({ path: "doors.fbFrame", expected: "finite number" });
  });

  it("Player 全量字段漂移（布尔位落数值）给出路径", () => {
    const st = baseState();
    (st.players.get("fireboy") as any).doorFrame = true;
    const issues = validateSnapshot(st, ["fireboy", "watergirl"]);
    expect(issues).toContainEqual({ path: "players.fireboy.doorFrame", expected: "finite number" });
  });
});

/** ---- #23：集合组清单由 ROOM_COLLECTION_CHILD 驱动，新增组不再漏检 ---- */
import { CHILD_SNAPSHOT_FIELDS, ROOM_COLLECTION_CHILD, type WireKind } from "@fw/shared";

/** 按 WireKind 造合法值 */
function good(k: WireKind): unknown {
  if (k === "number") return 0;
  if (k === "string") return "";
  return false;
}
/** 按 WireKind 造错误类型值 */
function bad(k: WireKind): unknown {
  if (k === "number") return "oops";
  if (k === "string") return 7;
  return "not-bool";
}
function entryOf(child: string, val: (k: WireKind) => unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [f, k] of Object.entries(CHILD_SNAPSHOT_FIELDS[child as keyof typeof CHILD_SNAPSHOT_FIELDS])) out[f] = val(k);
  return out;
}

const COLLECTION_GROUPS = Object.keys(ROOM_COLLECTION_CHILD).filter((g) => g !== "players" && g !== "diamonds");

describe("validateSnapshot #23 新机关组纳入校验", () => {
  it("beamers/timedPushers/rotMirrors 字段类型全错必报 issue（原漏检复现样例）", () => {
    const st: any = baseState();
    st.beamers = new Map([["0", { state: "oops", x: "nope", y: null }]]);
    st.timedPushers = new Map([["0", { state: "oops", frac: "half", downState: "no", x: "nope", y: null }]]);
    st.rotMirrors = new Map([["0", { x: "nope", y: null, angle: "deg" }]]);
    const issues = validateSnapshot(st, ["fireboy", "watergirl"]);
    expect(issues.some((i) => i.path.startsWith("beamers.0."))).toBe(true);
    expect(issues.some((i) => i.path.startsWith("timedPushers.0."))).toBe(true);
    expect(issues.some((i) => i.path.startsWith("rotMirrors.0."))).toBe(true);
  });

  it("全部集合组逐一漂移必报：ROOM_COLLECTION_CHILD 每个组（除 players/diamonds）都有校验面", () => {
    expect(COLLECTION_GROUPS.length).toBeGreaterThanOrEqual(15);
    for (const group of COLLECTION_GROUPS) {
      const st: any = baseState();
      st[group] = new Map([["0", entryOf(ROOM_COLLECTION_CHILD[group], bad)]]);
      const issues = validateSnapshot(st, ["fireboy", "watergirl"]);
      expect(
        issues.some((i) => i.path.startsWith(`${group}.0.`)),
        `组 ${group} 全字段错误类型未被检出`,
      ).toBe(true);
    }
  });

  it("含全部新组的合法快照返回空数组", () => {
    const st: any = baseState();
    for (const group of COLLECTION_GROUPS) {
      st[group] = new Map([["0", entryOf(ROOM_COLLECTION_CHILD[group], good)]]);
    }
    expect(validateSnapshot(st, ["fireboy", "watergirl"])).toEqual([]);
  });
});
