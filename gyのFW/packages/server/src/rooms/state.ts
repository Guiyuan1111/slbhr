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
import { Schema, MapSchema, defineTypes, $filter } from "../colyseus.cjs.js";
import type { MapSchema as MapSchemaType } from "@colyseus/schema";

export class PlayerState extends Schema {
  declare x: number;
  declare y: number;
  declare vx: number;
  declare vy: number;
  declare facing: number;
  declare anim: string;
  declare headTilt: number;
  declare inLiquid: boolean;
  declare dying: boolean;
  declare dead: boolean;
  declare isDead: boolean;
  declare atDoor: boolean;
  declare doorFrame: number;
  declare doorUp: boolean;

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
  declare collected: boolean;

  constructor() {
    super();
    this.collected = false;
  }
}

export class LeverState extends Schema {
  declare group: number;
  declare state: number;
  /** 杆角（屏幕弧度，客户端转贴图倾角） */
  declare angle: number;

  constructor() {
    super();
    this.group = 0;
    this.state = 0;
    this.angle = 0;
  }
}

export class PusherState extends Schema {
  declare group: number;
  declare state: number;
  /** 块体中心（屏幕 px，随 prismatic 下沉连续变化） */
  declare x: number;
  declare y: number;

  constructor() {
    super();
    this.group = 0;
    this.state = 0;
    this.x = 0;
    this.y = 0;
  }
}

export class BodyState extends Schema {
  declare x: number;
  declare y: number;
  declare angle: number;
  /** 仅平台用：组信号 OR（原版灯罩 light_on/off 换帧依据），其余刚体恒 0 */
  declare state: number;

  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.state = 0;
  }
}

export class WindState extends Schema {
  declare group: number;
  declare state: number;

  constructor() {
    super();
    this.group = 0;
    this.state = 0;
  }
}

/** 光束状态：pts = 打包折线 "x,y|x,y"（屏幕 px 取整；客户端 LIGHTEN 双描线） */
export class BeamState extends Schema {
  declare state: number;
  declare pts: string;

  constructor() {
    super();
    this.state = 0;
    this.pts = "";
  }
}

/** 定时推杆（ice）：state 0/1 + 时钟进度 frac（0..1，客户端画倒数表盘） */
export class TimedPusherState extends Schema {
  declare state: number;
  declare frac: number;
  /** 按压物理沿（0=松开/1=压着；clock 尾音门控） */
  declare downState: number;
  declare x: number;
  declare y: number;

  constructor() {
    super();
    this.state = 0;
    this.frac = 0;
    this.downState = 0;
    this.x = 0;
    this.y = 0;
  }
}

/** 双门状态（每关恰一对，单条目足够） */
export class DoorState extends Schema {
  declare fbAtDoor: boolean;
  declare wgAtDoor: boolean;
  declare fbFrame: number;
  declare wgFrame: number;
  declare fbUp: boolean;
  declare wgUp: boolean;

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
  declare phase: string;
  declare levelId: string;
  /** 内核帧号镜像（服务端已完成的仿真步数；e2e 页内锚定用，客户端可忽略） */
  declare f: number;
  declare timerMs: number;
  declare players: MapSchemaType<PlayerState>;
  declare diamonds: MapSchemaType<DiamondState>;
  declare levers: MapSchemaType<LeverState>;
  declare pushers: MapSchemaType<PusherState>;
  declare platforms: MapSchemaType<BodyState>;
  declare props: MapSchemaType<BodyState>;
  declare winds: MapSchemaType<WindState>;
  /** 吊挂板（hanging platform）位姿；pulley 两板键 u{id}a / u{id}b；roman bar 位姿 */
  declare hangings: MapSchemaType<BodyState>;
  declare pulleys: MapSchemaType<BodyState>;
  declare romans: MapSchemaType<BodyState>;
  // ---- 灯光神庙（forest 关恒空 map/空串，零编码开销）----
  declare beamers: MapSchemaType<BeamState>;
  declare rotMirrors: MapSchemaType<BodyState>;
  declare boxMirrors: MapSchemaType<BodyState>;
  declare infiniteMirrors: MapSchemaType<BodyState>;
  declare lightPushers: MapSchemaType<PusherState>;
  declare sliders: MapSchemaType<BodyState>;
  declare timedPushers: MapSchemaType<TimedPusherState>;
  /** 液体冻结旗标串（每行段一位 0/1；无液体=""） */
  declare liquids: string;
  declare doors: DoorState;

  constructor() {
    super();
    this.phase = "lobby";
    this.levelId = "";
    this.f = 0;
    this.timerMs = 0;
    this.players = new MapSchema();
    this.diamonds = new MapSchema();
    this.levers = new MapSchema();
    this.pushers = new MapSchema();
    this.platforms = new MapSchema();
    this.props = new MapSchema();
    this.winds = new MapSchema();
    this.hangings = new MapSchema();
    this.pulleys = new MapSchema();
    this.romans = new MapSchema();
    this.beamers = new MapSchema();
    this.rotMirrors = new MapSchema();
    this.boxMirrors = new MapSchema();
    this.infiniteMirrors = new MapSchema();
    this.lightPushers = new MapSchema();
    this.sliders = new MapSchema();
    this.timedPushers = new MapSchema();
    this.liquids = "";
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
  x: "number",
  y: "number",
});

defineTypes(BodyState, {
  x: "number",
  y: "number",
  angle: "number",
  // 组信号 OR（平台灯罩 light_on/off 换帧依据）——0.3.25 漏注册导致该字段
  // 从未真正下发，客户端灯罩恒为初始帧
  state: "number",
});

defineTypes(WindState, {
  group: "number",
  state: "number",
});

defineTypes(BeamState, {
  state: "number",
  pts: "string",
});

defineTypes(TimedPusherState, {
  state: "number",
  frac: "number",
  downState: "number",
  x: "number",
  y: "number",
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
  f: "uint16",
  timerMs: "number",
  players: { map: PlayerState },
  diamonds: { map: DiamondState },
  levers: { map: LeverState },
  pushers: { map: PusherState },
  platforms: { map: BodyState },
  props: { map: BodyState },
  winds: { map: WindState },
  hangings: { map: BodyState },
  pulleys: { map: BodyState },
  romans: { map: BodyState },
  beamers: { map: BeamState },
  rotMirrors: { map: BodyState },
  boxMirrors: { map: BodyState },
  infiniteMirrors: { map: BodyState },
  lightPushers: { map: PusherState },
  sliders: { map: BodyState },
  timedPushers: { map: TimedPusherState },
  liquids: "string",
  doors: DoorState,
});

/**
 * r4 perf 件2（2026-10-18）：声明侧遮蔽 Schema[$filter]。
 * @colyseus/schema Encoder.encode 对每个待编码字段都调 `ctor[$filter]`（缺省继承
 * Schema 基类静态：查 metadata[index].tag 再比较）——本状态树无任何 @view/@filter
 * 标签（filter(ref, index, undefined) 恒返回 tag===undefined 即 true），逐字段调用
 * 是纯开销（60Hz 出站下轻关 encode 段 ~10%，剖析见 r4 报告）。给各类定义自身静态
 * （own property = undefined）后 `filter && !filter(...)` 短路跳过调用，vendor 零改动。
 * 字节等价：filter 恒真 ⇒ 跳过与否不改变编码决策，出站字节逐字不变（TEMP 件
 * ab-filter.mjs：4 关×600 帧双路径 patch+encodeAll 逐字节相等 + det 48/48 + fixtures 6/6）。
 * hasFilters 不受影响（由 metadata view 标签驱动，TypeContext.discoverTypes），无
 * StateView/encodeView 路径被触及。
 */
// #26：BeamState/TimedPusherState（0.3.45/0.3.47 新增）曾漏登记，每字段编码白付一次 filter 调用
for (const cls of [RoomState, PlayerState, DiamondState, LeverState, PusherState, BodyState, WindState, DoorState, BeamState, TimedPusherState]) {
  (cls as unknown as Record<string, unknown>)[$filter as string] = undefined;
}
