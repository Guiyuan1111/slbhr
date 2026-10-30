/**
 * M12 共享 DTO 草案一致性单测（netDto.ts ↔ 服务端 defineTypes 注册面）。
 *
 * 对照方式：运行时读服务端 Schema 类自身的 `ctor[Symbol.metadata]` 注册元数据
 * （defineTypes 的落点，@colyseus/schema 3.x），逐字段与 netDto 导出的字段清单
 * 常量比对（名 + 归一化 wire 种类）。两侧任何一侧漂移——少字段 / 多字段 / 改名 /
 * 改类型——即红。不维护第二份硬编码清单；"48" 仅作总量锚（2026-10-23 HEAD
 * 9813dc2 时点，state.ts 注册字段总数），新增字段时须同步 DTO 并更新锚。
 *
 * 漂移三例（少字段/多字段/改名）通过篡改「服务端注册元数据的副本」喂给与
 * 全等断言同一把 diff 梳子，演示其确实能检出（而非恒绿自证）。
 */
import { describe, expect, it } from "vitest";
import * as state from "../../server/src/rooms/state.js";
import {
  CHILD_SNAPSHOT_FIELDS,
  ROOM_COLLECTION_CHILD,
  ROOM_PHASE_VALUES,
  ROOM_REF_FIELDS,
  ROOM_SNAPSHOT_FIELDS,
  type SchemaChildName,
} from "../src/netDto.js";

// ---------------------------------------------------------------------------
// 服务端注册元数据读取（可编程对照源）
// ---------------------------------------------------------------------------

/** defineTypes 注册元数据的落点符号（@colyseus/schema 3.x：Symbol.metadata） */
const METADATA_KEY: symbol = (Symbol as unknown as { metadata?: symbol }).metadata ?? Symbol("no-metadata");

/** 注册字段表：字段名 → wire 类型声明（"number" | "string" | "boolean" | { map: Ctor } | Ctor） */
type ServerFields = Record<string, unknown>;

/**
 * 读类自身（own，非继承）的注册元数据。漏 defineTypes 的类没有 own 元数据——
 * 正是 0.3.25 BodyState.state 式漂移的根源，此处直接抛错使其无所遁形。
 */
function registeredFields(ctor: abstract new () => unknown): ServerFields {
  if (typeof METADATA_KEY !== "symbol") throw new Error("运行时缺少 Symbol.metadata（需 Node ≥ 22）");
  const bag = ctor as unknown as Record<symbol, unknown>;
  if (!Object.prototype.hasOwnProperty.call(bag, METADATA_KEY)) {
    throw new Error(`${ctor.name} 无自身 defineTypes 注册元数据（漏注册即漂移）`);
  }
  const md = bag[METADATA_KEY] as Record<string, unknown>;
  const out: ServerFields = {};
  for (const [key, value] of Object.entries(md)) {
    if (!/^\d+$/.test(key)) continue; // 跳过 ~descriptors / ~__numFields 等内部键
    const field = value as { name?: unknown; type?: unknown };
    if (typeof field.name === "string") out[field.name] = field.type;
  }
  return out;
}

const NUMERIC_WIRE = new Set([
  "number", "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "float32", "float64",
]);

/** 服务端类型声明 → 归一化种类（与 netDto 常量同构，可直接比对） */
function kindOf(decl: unknown): unknown {
  if (typeof decl === "string") {
    if (NUMERIC_WIRE.has(decl)) return "number";
    if (decl === "string" || decl === "boolean") return decl;
    throw new Error(`未知 wire 类型声明: ${decl}`);
  }
  if (typeof decl === "function") return { ref: decl.name };
  if (decl && typeof decl === "object" && "map" in (decl as Record<string, unknown>)) {
    const child = (decl as { map: unknown }).map;
    if (typeof child === "function") return { map: child.name };
  }
  if (decl && typeof decl === "object" && "array" in (decl as Record<string, unknown>)) {
    const child = (decl as { array: unknown }).array;
    if (typeof child === "function") return { array: child.name };
  }
  throw new Error(`无法识别的注册声明: ${String(decl)}`);
}

/** diff 梳子：DTO 清单 vs 服务端注册面（唯一比对实现，全等断言与漂移演示共用） */
function diffSpec(dto: Readonly<Record<string, unknown>>, server: ServerFields) {
  const dtoMissing: string[] = []; // 服务端注册了、DTO 未跟（服务端新增/未同步）
  const serverMissing: string[] = []; // DTO 声明了、服务端未注册（漏注册/被删）
  const typeMismatch: string[] = []; // 名同、种类不同
  for (const [name, decl] of Object.entries(server)) {
    if (!(name in dto)) {
      dtoMissing.push(name);
      continue;
    }
    if (JSON.stringify(dto[name]) !== JSON.stringify(kindOf(decl))) typeMismatch.push(name);
  }
  for (const name of Object.keys(dto)) {
    if (!(name in server)) serverMissing.push(name);
  }
  return { dtoMissing, serverMissing, typeMismatch };
}

const CHILD_CLASSES: Record<SchemaChildName, abstract new () => unknown> = {
  PlayerState: state.PlayerState,
  DiamondState: state.DiamondState,
  LeverState: state.LeverState,
  PusherState: state.PusherState,
  BodyState: state.BodyState,
  WindState: state.WindState,
  DoorState: state.DoorState,
  BeamState: state.BeamState,
  TimedPusherState: state.TimedPusherState,
  FairyState: state.FairyState,
  FairyCupState: state.FairyCupState,
};
const CHILD_NAMES = Object.keys(CHILD_CLASSES) as SchemaChildName[];

// ---------------------------------------------------------------------------

describe("服务端 Schema 类注册面（可编程对照源可用性）", () => {
  it("11 个状态类全部有自身 defineTypes 注册元数据", () => {
    for (const name of [...CHILD_NAMES, "RoomState"] as const) {
      const ctor = name === "RoomState" ? state.RoomState : CHILD_CLASSES[name];
      expect(() => registeredFields(ctor), `${name} 应有自身注册元数据`).not.toThrow();
    }
  });

  it("元数据读取器能还原 PlayerState 全部注册字段（非空对照源）", () => {
    const fields = registeredFields(state.PlayerState);
    expect(Object.keys(fields).sort()).toEqual(
      ["anim", "atDoor", "dead", "doorFrame", "doorUp", "dying", "facing", "headTilt", "inLiquid", "isDead", "vx", "vy", "x", "y"],
    );
  });
});

describe("DTO 字段清单 ↔ 服务端注册字段逐一相符", () => {
  for (const name of CHILD_NAMES) {
    it(`${name}: 名与种类逐一相符`, () => {
      expect(diffSpec(CHILD_SNAPSHOT_FIELDS[name], registeredFields(CHILD_CLASSES[name]))).toEqual({
        dtoMissing: [],
        serverMissing: [],
        typeMismatch: [],
      });
    });
  }

  it("RoomState: 25 个字段（5 标量 + 19 集合 + 1 引用）名与种类逐一相符", () => {
    expect(diffSpec(ROOM_SNAPSHOT_FIELDS, registeredFields(state.RoomState))).toEqual({
      dtoMissing: [],
      serverMissing: [],
      typeMismatch: [],
    });
    expect(Object.keys(ROOM_SNAPSHOT_FIELDS)).toHaveLength(25);
  });

  it("总量锚：两侧字段总数一致且等于 73（2026-10-30 fairy 批：房间+2 数组集合 + FairyState 5 字段 + FairyCupState 2 字段；扩字段须同步 DTO 并更新本锚）", () => {
    const serverTotal =
      Object.keys(registeredFields(state.RoomState)).length +
      CHILD_NAMES.reduce((n, name) => n + Object.keys(registeredFields(CHILD_CLASSES[name])).length, 0);
    const dtoTotal =
      Object.keys(ROOM_SNAPSHOT_FIELDS).length +
      CHILD_NAMES.reduce((n, name) => n + Object.keys(CHILD_SNAPSHOT_FIELDS[name]).length, 0);
    expect(dtoTotal).toBe(serverTotal);
    expect(serverTotal).toBe(73);
  });
});

describe("任务点名覆盖面", () => {
  it("RoomState 标量：phase/levelId 为 string，timerMs 为 number", () => {
    const server = registeredFields(state.RoomState);
    expect(server.phase).toBe("string");
    expect(server.levelId).toBe("string");
    expect(server.timerMs).toBe("number");
    expect(ROOM_SNAPSHOT_FIELDS.phase).toBe("string");
    expect(ROOM_SNAPSHOT_FIELDS.levelId).toBe("string");
    expect(ROOM_SNAPSHOT_FIELDS.timerMs).toBe("number");
  });

  it("PlayerState：双角色（fireboy/watergirl 同类）数值、anim 与布尔组全覆盖", () => {
    const server = registeredFields(state.PlayerState);
    // 数值组：位姿/速度/朝向/头部倾角/门扫帧
    for (const f of ["x", "y", "vx", "vy", "facing", "headTilt", "doorFrame"]) {
      expect(server[f], `players.*.${f}`).toBe("number");
    }
    // anim：内核 AnimState 词表（idle|jumping|rising|falling）以 string 下发
    expect(server.anim).toBe("string");
    // 布尔组：液体/死亡演出/死亡终态/遗留 dead/门口/门升
    for (const f of ["inLiquid", "dying", "dead", "isDead", "atDoor", "doorUp"]) {
      expect(server[f], `players.*.${f}`).toBe("boolean");
    }
    // 双角色键共用同一 PlayerState 类：映射经 ROOM_COLLECTION_CHILD 固定
    expect(ROOM_COLLECTION_CHILD.players).toBe("PlayerState");
  });

  it("DiamondState：collected 布尔", () => {
    expect(registeredFields(state.DiamondState).collected).toBe("boolean");
    expect(CHILD_SNAPSHOT_FIELDS.DiamondState).toEqual({ collected: "boolean" });
  });

  it("十八条机关/仙女集合全部挂对子类且字段相符（platforms/props/hangings/pulleys/romans 复用 BodyState；fairies/fairyCups 为 ArraySchema）", () => {
    const server = registeredFields(state.RoomState);
    for (const [field, child] of Object.entries(ROOM_COLLECTION_CHILD)) {
      const decl = server[field] as unknown;
      const isMap = typeof decl === "object" && decl !== null && "map" in (decl as object);
      expect(decl, `${field} 应挂子类 ${child}`).toEqual(isMap ? { map: state[child] } : { array: state[child] });
      expect(diffSpec(CHILD_SNAPSHOT_FIELDS[child], registeredFields(CHILD_CLASSES[child]))).toEqual({
        dtoMissing: [],
        serverMissing: [],
        typeMismatch: [],
      });
    }
    // 复用 BodyState 的五条集合
    for (const field of ["platforms", "props", "hangings", "pulleys", "romans"]) {
      expect(ROOM_COLLECTION_CHILD[field]).toBe("BodyState");
    }
    // F 部仙女两条数组集合（fw-net/fw-fairy-view 契约）
    for (const field of ["fairies", "fairyCups"]) {
      expect(server[field]).toEqual({ array: state[ROOM_COLLECTION_CHILD[field]] });
    }
  });

  it("doors：单引用 DoorState，六字段两布尔两数值两布尔相符", () => {
    expect(ROOM_REF_FIELDS.doors).toBe("DoorState");
    expect(registeredFields(state.RoomState).doors).toBe(state.DoorState);
    expect(diffSpec(CHILD_SNAPSHOT_FIELDS.DoorState, registeredFields(state.DoorState))).toEqual({
      dtoMissing: [],
      serverMissing: [],
      typeMismatch: [],
    });
  });

  it("paused 非独立注册字段：经 phase 词表值 'paused'（+pause-changed 消息）表达", () => {
    expect(ROOM_PHASE_VALUES).toContain("paused");
    expect(registeredFields(state.RoomState)).not.toHaveProperty("paused");
  });
});

describe("漂移检出演示（篡改注册元数据副本，喂同一把 diff 梳子）", () => {
  it("少字段：defineTypes 漏注册 anim（0.3.25 BodyState.state 式）→ serverMissing 报出", () => {
    const drifted = { ...registeredFields(state.PlayerState) };
    delete drifted.anim;
    const d = diffSpec(CHILD_SNAPSHOT_FIELDS.PlayerState, drifted);
    expect(d.serverMissing).toContain("anim");
    expect(d.dtoMissing).toEqual([]);
  });

  it("多字段：服务端新增 ghostSpeed 而 DTO 未跟 → dtoMissing 报出", () => {
    const drifted = { ...registeredFields(state.PlayerState), ghostSpeed: "number" };
    const d = diffSpec(CHILD_SNAPSHOT_FIELDS.PlayerState, drifted);
    expect(d.dtoMissing).toContain("ghostSpeed");
    expect(d.serverMissing).toEqual([]);
  });

  it("改名：doorFrame → doorframe → serverMissing 与 dtoMissing 同时报出", () => {
    const drifted = { ...registeredFields(state.PlayerState) };
    delete drifted.doorFrame;
    drifted.doorframe = "number";
    const d = diffSpec(CHILD_SNAPSHOT_FIELDS.PlayerState, drifted);
    expect(d.serverMissing).toContain("doorFrame");
    expect(d.dtoMissing).toContain("doorframe");
  });

  it("改类型：anim 注册成 number → typeMismatch 报出（String()||0 静默吞掉的对立面）", () => {
    const drifted = { ...registeredFields(state.PlayerState), anim: "number" };
    expect(diffSpec(CHILD_SNAPSHOT_FIELDS.PlayerState, drifted).typeMismatch).toContain("anim");
  });
});
