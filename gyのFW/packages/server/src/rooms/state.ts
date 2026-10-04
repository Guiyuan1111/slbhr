/**
 * 房间状态（Colyseus Schema，0.3.0 保真重写版）。
 *
 * 只放客户端渲染需要的字段；物理真身在 @fw/shared/kernel 的 World 里，
 * 每次仿真 tick 后由房间层把差异同步到这里（框架自动出增量补丁）。
 *
 * ⚠ 字段必须在 constructor 里赋值：schema 靠 prototype 的 setter 拦截来跟踪变更，
 * 原生 class fields（defineProperty 语义）会绕过拦截，导致编码时类型元数据缺失
 * （症状：encodeValue 读 Symbol.metadata 崩溃）。
 *
 * phase 词汇：lobby | ready | started | paused | won | gameover
 * （原版：双人就绪后延时开钟；任一人死整关重开；门扫帧 21 帧到位双门→won）
 */
import { Schema, MapSchema, defineTypes } from "../colyseus.cjs.js";
import type { MapSchema as MapSchemaType } from "@colyseus/schema";

export class PlayerState extends Schema {
  x!: number;
  y!: number;
  vx!: number;
  vy!: number;
  facing!: number;
  anim!: string;
  headTilt!: number;
  inLiquid!: boolean;
  dying!: boolean;
  dead!: boolean;
  isDead!: boolean;
  atDoor!: boolean;
  doorFrame!: number;
  doorUp!: boolean;

  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.anim = "idle";
    this.headTilt = 0;
    this.inLiquid = false;
    this.dying = false;
    this.dead = false;
    this.isDead = false;
    this.atDoor = false;
    this.doorFrame = 0;
    this.doorUp = false;
  }
}

export class DiamondState extends Schema {
  collected!: boolean;

  constructor() {
    super();
    this.collected = false;
  }
}

export class LeverState extends Schema {
  group!: number;
  state!: number;
  /** 杆角（屏幕弧度，客户端转贴图倾角） */
  angle!: number;

  constructor() {
    super();
    this.group = 0;
    this.state = 0;
    this.angle = 0;
  }
}

export class PusherState extends Schema {
  group!: number;
  state!: number;

  constructor() {
    super();
    this.group = 0;
    this.state = 0;
  }
}

export class BodyState extends Schema {
  x!: number;
  y!: number;
  angle!: number;

  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.angle = 0;
  }
}

export class WindState extends Schema {
  group!: number;
  state!: number;

  constructor() {
    super();
    this.group = 0;
    this.state = 0;
  }
}

/** 双门状态（每关恰一对，单条目足够） */
export class DoorState extends Schema {
  fbAtDoor!: boolean;
  wgAtDoor!: boolean;
  fbFrame!: number;
  wgFrame!: number;
  fbUp!: boolean;
  wgUp!: boolean;

  constructor() {
    super();
    this.fbAtDoor = false;
    this.wgAtDoor = false;
    this.fbFrame = 0;
    this.wgFrame = 0;
    this.fbUp = false;
    this.wgUp = false;
  }
}

export class RoomState extends Schema {
  phase!: string;
  levelId!: string;
  timerMs!: number;
  players!: MapSchemaType<PlayerState>;
  diamonds!: MapSchemaType<DiamondState>;
  levers!: MapSchemaType<LeverState>;
  pushers!: MapSchemaType<PusherState>;
  platforms!: MapSchemaType<BodyState>;
  props!: MapSchemaType<BodyState>;
  winds!: MapSchemaType<WindState>;
  doors!: DoorState;

  constructor() {
    super();
    this.phase = "lobby";
    this.levelId = "";
    this.timerMs = 0;
    this.players = new MapSchema();
    this.diamonds = new MapSchema();
    this.levers = new MapSchema();
    this.pushers = new MapSchema();
    this.platforms = new MapSchema();
    this.props = new MapSchema();
    this.winds = new MapSchema();
    this.doors = new DoorState();
  }
}

defineTypes(PlayerState, {
  x: "number",
  y: "number",
  vx: "number",
  vy: "number",
  facing: "number",
  anim: "string",
  headTilt: "number",
  inLiquid: "boolean",
  dying: "boolean",
  dead: "boolean",
  isDead: "boolean",
  atDoor: "boolean",
  doorFrame: "number",
  doorUp: "boolean",
});

defineTypes(DiamondState, {
  collected: "boolean",
});

defineTypes(LeverState, {
  group: "number",
  state: "number",
  angle: "number",
});

defineTypes(PusherState, {
  group: "number",
  state: "number",
});

defineTypes(BodyState, {
  x: "number",
  y: "number",
  angle: "number",
});

defineTypes(WindState, {
  group: "number",
  state: "number",
});

defineTypes(DoorState, {
  fbAtDoor: "boolean",
  wgAtDoor: "boolean",
  fbFrame: "number",
  wgFrame: "number",
  fbUp: "boolean",
  wgUp: "boolean",
});

defineTypes(RoomState, {
  phase: "string",
  levelId: "string",
  timerMs: "number",
  players: { map: PlayerState },
  diamonds: { map: DiamondState },
  levers: { map: LeverState },
  pushers: { map: PusherState },
  platforms: { map: BodyState },
  props: { map: BodyState },
  winds: { map: WindState },
  doors: DoorState,
});
