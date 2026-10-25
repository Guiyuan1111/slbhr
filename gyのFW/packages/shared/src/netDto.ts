/**
 * 共享 DTO 快照类型草案（M12 挂账项，prep 草案、未接线）。
 *
 * 对应服务端 Schema 定义：packages/server/src/rooms/state.ts（本文件注释中的
 * "state.ts" 均指该文件，行号以 2026-10-23 HEAD 9813dc2 工作区为准）。
 * 每个接口一一对应一个 defineTypes 注册的状态类；字段名/种类由
 * packages/shared/__tests__/netDto.test.ts 逐一对照该类的 defineTypes 注册
 * 元数据（运行时读 ctor[Symbol.metadata]）做可编程校验，任何一侧漂移即红。
 *
 * 背景（note/audit/2026-10-21-code-audit/02-medium.md M12）：客户端网络边界大量
 * `String(x ?? "")` / `Number(x) || 0`，服务端 schema 字段漂移（0.3.25
 * BodyState.state 漏注册即此类）被静默吞成 0。0.3.42 已有客户端侧首快照校验
 * （packages/client/src/snapshotValidation.ts，内嵌字段清单）；本轮把字段清单
 * 上收为共享常量，供后续 snapshotValidation 改吃本清单（本轮不接线）。
 *
 * 类型方向：shared 不得反向依赖 server——本文件零 import，纯类型+常量；
 * 与服务端的一致性由测试文件（独立 import server schema 类）保证。
 */

// ---------------------------------------------------------------------------
// 线上值种类（wire kind）
// ---------------------------------------------------------------------------

/** defineTypes 基础 wire 类型归一后的三类运行时值（数值别名 int8..float64 归 "number"） */
export type WireKind = "string" | "number" | "boolean";

/** 由 TS 标量类型推出 WireKind：接口改类型而常量忘改 → 编译期即红 */
export type WireKindOf<T> = T extends string
  ? "string"
  : T extends number
    ? "number"
    : T extends boolean
      ? "boolean"
      : never;

/** 接口全部字段（均为标量）的 spec 视图 */
export type WireSpecOf<T> = { [K in keyof T]: WireKindOf<T[K]> };

// ---------------------------------------------------------------------------
// 状态类 DTO（与 state.ts 的 Schema 类一一对应）
// ---------------------------------------------------------------------------

/**
 * 对应 state.ts `PlayerState`（类声明 L17，defineTypes 注册 L174-189）。
 * 服务端 syncState 每 tick 全量写（ForestRoom.ts L608-635）；键为 Role
 * （"fireboy" | "watergirl"，见 types.ts ROLES）。席位未加入时该键缺席——
 * MapSchema 条目可选，字段本身必达（入房 encodeAll 全量下发）。
 */
export interface PlayerSnapshotDto {
  /** 关卡坐标 px（客户端渲染 +PAD）；服务端保留 1 位小数 */
  x: number;
  y: number;
  /** 速度 px/s（客户端 dead-reckoning 外推用，GameScene.updatePlayers） */
  vx: number;
  vy: number;
  /** 朝向：1 右 / -1 左 */
  facing: number;
  /** 动画状态机词表：idle | jumping | rising | falling（内核 character.ts AnimState） */
  anim: string;
  /** 头部倾角（屏幕弧度，服务端保留 3 位小数） */
  headTilt: number;
  /** 正踩在己方可涉液体上（原版 isOnLiquid，涉水脚步声判定） */
  inLiquid: boolean;
  /** 触液死亡演出中（烟雾一次性动画期间；本体随即隐藏） */
  dying: boolean;
  /** 遗留死亡标志（服务端仍下发；客户端现役读 isDead，此字段当前无消费点） */
  dead: boolean;
  /** 死亡终态（烟雾 onComplete 后，原版 sprite.visible=false 依据） */
  isDead: boolean;
  /** 已到本方门口（当前客户端无消费点，门开合以 doorFrame 驱动） */
  atDoor: boolean;
  /** 门扫帧 0..DOOR.frames（原版 21 帧到位；客户端 clamp 后 setFrame+门音） */
  doorFrame: number;
  /** 门已完全升起（当前客户端无消费点） */
  doorUp: boolean;
}

/** 对应 state.ts `DiamondState`（类声明 L52，defineTypes 注册 L191-193）；键为钻石 id */
export interface DiamondSnapshotDto {
  collected: boolean;
}

/** 对应 state.ts `LeverState`（类声明 L61，defineTypes 注册 L195-199）；键为机关 id 字符串 */
export interface LeverSnapshotDto {
  /** 机关组号（同组拉杆联动，音效/信号按组） */
  group: number;
  /** 组信号 0/1（原版灯罩换帧依据） */
  state: number;
  /** 杆角（屏幕弧度，服务端由 angleDeg 换算保留 3 位小数；客户端转贴图倾角） */
  angle: number;
}

/** 对应 state.ts `PusherState`（类声明 L75，defineTypes 注册 L201-206） */
export interface PusherSnapshotDto {
  group: number;
  state: number;
  /** 块体中心（屏幕 px，随 prismatic 下沉连续变化） */
  x: number;
  y: number;
}

/**
 * 对应 state.ts `BodyState`（类声明 L91，defineTypes 注册 L208-215）。
 * 复用于五条房间集合：platforms / props / hangings / pulleys / romans。
 */
export interface BodySnapshotDto {
  x: number;
  y: number;
  /** 屏幕弧度（服务端统一发 -body.GetAngle()，见 GameScene 头注） */
  angle: number;
  /** 仅平台用：组信号 OR（原版灯罩 light_on/off 换帧依据）；0.3.25 漏注册过，其余刚体恒 0 */
  state: number;
}

/** 对应 state.ts `WindState`（类声明 L107，defineTypes 注册 L217-220） */
export interface WindSnapshotDto {
  group: number;
  /** 风信号 0/1（客户端非 0 即吹） */
  state: number;
}

/** 对应 state.ts `BeamState`（灯光神庙光束：state 0/1 + 打包折线 "x,y|x,y" 屏幕取整 px） */
export interface BeamSnapshotDto {
  state: number;
  pts: string;
}

/**
 * 对应 state.ts `DoorState`（类声明 L119，defineTypes 注册 L222-229）。
 * 每关恰一对门、单条目（RoomState.doors 为引用非 Map）。
 * ⚠ 现状：客户端 GameScene 当前不读此结构（门开合走 PlayerState.doorFrame），
 * 字段登记保完整——是否裁剪归主会话裁决。
 */
export interface DoorSnapshotDto {
  fbAtDoor: boolean;
  wgAtDoor: boolean;
  fbFrame: number;
  wgFrame: number;
  fbUp: boolean;
  wgUp: boolean;
}

/**
 * 对应 state.ts `RoomState`（类声明 L138，defineTypes 注册 L231-246）。
 * 房间根快照；字段必达（入房全量编码），各集合条目按需存在。
 * 注意：没有独立 `paused` 字段——暂停经 phase 词表值 "paused"（断线冻结/
 * 玩家 F3 暂停是另一套，经 "pause-changed" 消息广播，见 net.ts PauseChangedMessage）。
 */
export interface RoomSnapshotDto {
  /** 词表见 ROOM_PHASE_VALUES：lobby | ready | started | paused | won | gameover */
  phase: string;
  /** 当前关卡 id（advance 换关回声，双端差分出 onLevelId） */
  levelId: string;
  /** 正计时毫秒（仅 started 步进内累计；客户端 mmss 渲染） */
  timerMs: number;
  players: Readonly<Record<string, PlayerSnapshotDto>>;
  diamonds: Readonly<Record<string, DiamondSnapshotDto>>;
  levers: Readonly<Record<string, LeverSnapshotDto>>;
  pushers: Readonly<Record<string, PusherSnapshotDto>>;
  platforms: Readonly<Record<string, BodySnapshotDto>>;
  props: Readonly<Record<string, BodySnapshotDto>>;
  winds: Readonly<Record<string, WindSnapshotDto>>;
  /** 吊挂板（hanging platform）位姿；pulley 两板键 u{id}a / u{id}b */
  hangings: Readonly<Record<string, BodySnapshotDto>>;
  pulleys: Readonly<Record<string, BodySnapshotDto>>;
  romans: Readonly<Record<string, BodySnapshotDto>>;
  // ---- 灯光神庙（forest 关恒空 map/空串）----
  beamers: Readonly<Record<string, BeamSnapshotDto>>;
  rotMirrors: Readonly<Record<string, BodySnapshotDto>>;
  boxMirrors: Readonly<Record<string, BodySnapshotDto>>;
  infiniteMirrors: Readonly<Record<string, BodySnapshotDto>>;
  lightPushers: Readonly<Record<string, PusherSnapshotDto>>;
  sliders: Readonly<Record<string, BodySnapshotDto>>;
  /** 液体冻结旗标串（每行段一位 0/1） */
  liquids: string;
  doors: DoorSnapshotDto;
}

// ---------------------------------------------------------------------------
// 字段清单常量（供校验用；与上方接口由编译期双向锁死，与服务端由单测锁死）
// ---------------------------------------------------------------------------

/** 子状态类名（即服务端 Schema 类名，保持同名以便单测直查 ctor 元数据） */
export type SchemaChildName =
  | "PlayerState"
  | "DiamondState"
  | "LeverState"
  | "PusherState"
  | "BodyState"
  | "WindState"
  | "BeamState"
  | "DoorState";

export const PLAYER_SNAPSHOT_FIELDS: WireSpecOf<PlayerSnapshotDto> = {
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
};

export const DIAMOND_SNAPSHOT_FIELDS: WireSpecOf<DiamondSnapshotDto> = {
  collected: "boolean",
};

export const LEVER_SNAPSHOT_FIELDS: WireSpecOf<LeverSnapshotDto> = {
  group: "number",
  state: "number",
  angle: "number",
};

export const PUSHER_SNAPSHOT_FIELDS: WireSpecOf<PusherSnapshotDto> = {
  group: "number",
  state: "number",
  x: "number",
  y: "number",
};

export const BODY_SNAPSHOT_FIELDS: WireSpecOf<BodySnapshotDto> = {
  x: "number",
  y: "number",
  angle: "number",
  state: "number",
};

export const WIND_SNAPSHOT_FIELDS: WireSpecOf<WindSnapshotDto> = {
  group: "number",
  state: "number",
};

export const DOOR_SNAPSHOT_FIELDS: WireSpecOf<DoorSnapshotDto> = {
  fbAtDoor: "boolean",
  wgAtDoor: "boolean",
  fbFrame: "number",
  wgFrame: "number",
  fbUp: "boolean",
  wgUp: "boolean",
};

/** 子状态类 → 字段 spec 总表（键=服务端类名） */
export const CHILD_SNAPSHOT_FIELDS: Record<SchemaChildName, Readonly<Record<string, WireKind>>> = {
  PlayerState: PLAYER_SNAPSHOT_FIELDS,
  DiamondState: DIAMOND_SNAPSHOT_FIELDS,
  LeverState: LEVER_SNAPSHOT_FIELDS,
  PusherState: PUSHER_SNAPSHOT_FIELDS,
  BodyState: BODY_SNAPSHOT_FIELDS,
  WindState: WIND_SNAPSHOT_FIELDS,
  DoorState: DOOR_SNAPSHOT_FIELDS,
  BeamState: { state: "number", pts: "string" },
};

/** 房间字段 spec：标量 WireKind；集合 { map: 子类名 }；单引用 { ref: 子类名 } */
export type RoomFieldSpec =
  | WireKind
  | { readonly map: SchemaChildName }
  | { readonly ref: SchemaChildName };

export const ROOM_SNAPSHOT_FIELDS = {
  phase: "string",
  levelId: "string",
  timerMs: "number",
  players: { map: "PlayerState" },
  diamonds: { map: "DiamondState" },
  levers: { map: "LeverState" },
  pushers: { map: "PusherState" },
  platforms: { map: "BodyState" },
  props: { map: "BodyState" },
  winds: { map: "WindState" },
  hangings: { map: "BodyState" },
  pulleys: { map: "BodyState" },
  romans: { map: "BodyState" },
  beamers: { map: "BeamState" },
  rotMirrors: { map: "BodyState" },
  boxMirrors: { map: "BodyState" },
  infiniteMirrors: { map: "BodyState" },
  lightPushers: { map: "PusherState" },
  sliders: { map: "BodyState" },
  liquids: "string",
  doors: { ref: "DoorState" },
} as const satisfies Record<keyof RoomSnapshotDto, RoomFieldSpec>;

// ---------------------------------------------------------------------------
// 导出字段名清单与派生工具
// ---------------------------------------------------------------------------

/** 字段名清单（供运行时校验逐字段遍历） */
export function fieldNamesOf(spec: Readonly<Record<string, unknown>>): readonly string[] {
  return Object.keys(spec);
}

/** 数值字段名子集（供 validateSnapshot 类校验器按 finite number 检查） */
export function numericFieldNames(spec: Readonly<Record<string, unknown>>): readonly string[] {
  return Object.keys(spec).filter((k) => spec[k] === "number");
}

/** 房间根字段名清单（21） */
export const ROOM_SNAPSHOT_FIELD_NAMES: readonly string[] = fieldNamesOf(ROOM_SNAPSHOT_FIELDS);

/** 各子状态类字段名清单（键=服务端类名） */
export const CHILD_SNAPSHOT_FIELD_NAMES: Record<SchemaChildName, readonly string[]> = {
  PlayerState: fieldNamesOf(PLAYER_SNAPSHOT_FIELDS),
  DiamondState: fieldNamesOf(DIAMOND_SNAPSHOT_FIELDS),
  LeverState: fieldNamesOf(LEVER_SNAPSHOT_FIELDS),
  PusherState: fieldNamesOf(PUSHER_SNAPSHOT_FIELDS),
  BodyState: fieldNamesOf(BODY_SNAPSHOT_FIELDS),
  WindState: fieldNamesOf(WIND_SNAPSHOT_FIELDS),
  DoorState: fieldNamesOf(DOOR_SNAPSHOT_FIELDS),
  BeamState: fieldNamesOf({ state: "number", pts: "string" }),
};

/** 房间集合字段 → 子状态类名（MapSchema 拓扑，供校验器遍历集合条目） */
export const ROOM_COLLECTION_CHILD: Readonly<Record<string, SchemaChildName>> = {
  players: "PlayerState",
  diamonds: "DiamondState",
  levers: "LeverState",
  pushers: "PusherState",
  platforms: "BodyState",
  props: "BodyState",
  winds: "WindState",
  hangings: "BodyState",
  pulleys: "BodyState",
  romans: "BodyState",
  beamers: "BeamState",
  rotMirrors: "BodyState",
  boxMirrors: "BodyState",
  infiniteMirrors: "BodyState",
  lightPushers: "PusherState",
  sliders: "BodyState",
};

/** 房间单引用字段（非集合非标量） */
export const ROOM_REF_FIELDS: Readonly<Record<string, SchemaChildName>> = {
  doors: "DoorState",
};

/**
 * phase 词表（state.ts 头注 L11 与 client net.ts 头注 L14 双侧对齐）。
 * "paused" 并非独立字段：断线冻结置 phase="paused"；玩家 F3 暂停另经
 * "pause-changed" 消息（paused/by 载荷，见 net.ts PauseChangedMessage）。
 */
export const ROOM_PHASE_VALUES = ["lobby", "ready", "started", "paused", "won", "gameover"] as const;
export type RoomPhase = (typeof ROOM_PHASE_VALUES)[number];
