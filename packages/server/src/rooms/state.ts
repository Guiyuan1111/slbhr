/**
 * 房间状态（Colyseus Schema）。
 *
 * 只放客户端渲染需要的字段；物理真身在 @fw/shared 的 World 里，
 * 每次仿真 tick 后由房间层把差异同步到这里（框架自动按 50ms 出增量补丁）。
 *
 * ⚠ 字段必须在 constructor 里赋值：schema 靠 prototype 的 setter 拦截来跟踪变更，
 * 原生 class fields（defineProperty 语义）会绕过拦截，导致编码时类型元数据缺失
 * （症状：encodeValue 读 Symbol.metadata 崩溃）。
 */
import { Schema, MapSchema, defineTypes } from "../colyseus.cjs.js";
import type { MapSchema as MapSchemaType } from "@colyseus/schema";

export class PlayerState extends Schema {
  x!: number;
  y!: number;
  facing!: number;
  anim!: string;
  alive!: boolean;
  atDoor!: boolean;
  deaths!: number;

  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.facing = 1;
    this.anim = "idle";
    this.alive = true;
    this.atDoor = false;
    this.deaths = 0;
  }
}

export class DiamondState extends Schema {
  collected!: boolean;

  constructor() {
    super();
    this.collected = false;
  }
}

export class PlatformState extends Schema {
  x!: number;
  y!: number;

  constructor() {
    super();
    this.x = 0;
    this.y = 0;
  }
}

export class RoomState extends Schema {
  phase!: string;
  levelId!: string;
  timerMs!: number;
  players!: MapSchemaType<PlayerState>;
  diamonds!: MapSchemaType<DiamondState>;
  platforms!: MapSchemaType<PlatformState>;

  constructor() {
    super();
    this.phase = "lobby"; // lobby | playing | paused | finished
    this.levelId = "";
    this.timerMs = 0;
    this.players = new MapSchema();
    this.diamonds = new MapSchema();
    this.platforms = new MapSchema();
  }
}

defineTypes(PlayerState, {
  x: "number",
  y: "number",
  facing: "number",
  anim: "string",
  alive: "boolean",
  atDoor: "boolean",
  deaths: "number",
});

defineTypes(DiamondState, {
  collected: "boolean",
});

defineTypes(PlatformState, {
  x: "number",
  y: "number",
});

defineTypes(RoomState, {
  phase: "string",
  levelId: "string",
  timerMs: "number",
  players: { map: PlayerState },
  diamonds: { map: DiamondState },
  platforms: { map: PlatformState },
});
