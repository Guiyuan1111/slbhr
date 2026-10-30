/**
 * box2d 内核 —— World 门面（服务端唯一入口）。
 *
 * 职责：构建关卡物理世界、驱动 60Hz（或对拍可变）步进、维护原版游戏流程：
 *   液体致死（feet 感应）→ 死亡烟雾 1.5s → isDead → gameover；
 *   门 64×8 感应带 → 25fps 扫帧 → 21 帧 isUp → 双门到位 → win；
 *   钻石 0.7m 感应、同色/Silver/FBWG 判定；正计时。
 * 原版流程证据：Door/character/Liquid/Level 类区段（TEMP/*-region.js）与 research/01 §3。
 *
 * 本类不负责：ready 倒计时（房间层）、触屏、存档。物理内核切换期间旧 world.ts 仍在；
 * server 切换后旧 world.ts 删除，本文件成为唯一 World。
 */
import type { LevelData } from "../level2.js";
import type { Role } from "../types.js";
import type { B2 } from "./b2.js";
import { b2, m2px } from "./b2.js";
import { GROUND_TYPE } from "../level2.js";
import { buildLevelWorld, type BuiltWorld, type DoorInfo } from "./build.js";
import { Character, type AnimState, type InputState } from "./character.js";
import { buildMechanisms, type MechEvent, type Mechanisms } from "./mechanisms.js";
import { RespawnManager } from "./respawn.js";

/** 坐标换算再导出（r1 perf 件3）：服务器序列化侧（ForestRoom/基准镜像）直读 mechanisms
 *  写 RoomState 时需要 m2px——保持单一换算定义，避免内联魔数漂移 */
export { m2px } from "./b2.js";

export type WorldPhase = "playing" | "won" | "gameover";

export type WorldEvent =
  | { type: "death"; role: Role }
  | { type: "gameover" }
  | { type: "diamond"; role: Role; kind: "red" | "blue" | "silver" | "fbwg" }
  | { type: "door-open"; role: Role }
  | { type: "mech"; event: MechEvent }
  | { type: "liquid-frozen" }
  | { type: "liquid-melted" }
  | { type: "win"; data: WinData };

export interface WinData {
  /** 双人合并普通钻（红/蓝各自角色计数） */
  fbDiamonds: number;
  wgDiamonds: number;
  silver: number;
  /** 正计时（ms） */
  timeMs: number;
}

export interface PlayerSnapshot {
  role: Role;
  /** 身体中心，屏幕 px */
  x: number;
  y: number;
  /** 屏幕速度 px/s（vx 右正、vy 下正） */
  vx: number;
  vy: number;
  anim: AnimState;
  /** 头部贴图水平翻转 −1/1 */
  facing: 1 | -1;
  headTilt: number;
  inLiquid: boolean;
  dying: boolean;
  dead: boolean;
  isDead: boolean;
  /** 本角色门状态 */
  atDoor: boolean;
  doorFrame: number;
  doorUp: boolean;
}

export interface WorldOptions {
  /**
   * 风力时基（F6 翻转）：原版 = 墙钟 elapsed 秒（页面加载起算，逐跑相位随机不可复现）；
   * 缺省 = 仿真时间 simTimeS（det 48 关位级门禁/金轨迹对拍/单测的确定性口径，位级可复现）。
   * 生产服务端传墙钟 `() => (Date.now() - epochMs) / 1000`；e2e/门禁服务端经
   * FW_WIND_PHASE 固定相位偏移 `() => simTimeS + PHASE`（PHASE=0 与缺省位级相同）。
   */
  windClockS?: () => number;
}

/**
 * 空音效钩子（模块级单例，r1 perf 件1）：step() 原为逐帧新建闭包——空函数语义不变，
 * 消除每步闭包分配与 tsx keep-names 的 __name 包装开销（hotspot 01 号档 §1.2/§3 #3）。
 */
const jumpSoundHook = (): void => {
  /* 音效属客户端，内核只留钩子 */
};

export class World {
  readonly level: LevelData;
  private built: BuiltWorld;
  private mechs: Mechanisms;
  private B: B2;
  private chars: Record<Role, Character>;
  /** 原版 data.diamonds 等价物从 Character 取 */
  private simTimeS = 0;
  /** 传送门 200ms 每体冷却（oracle body.lastTransport；键=body 跨门共享） */
  private portalLastTransport = new WeakMap<object, number>();
  /** F 部检查点/复活管理器（构造尾创建；respawn.ts 档头=oracle L61065-61179 对位） */
  respawn!: RespawnManager;
  /** R2 免费复活一次门禁（oracle 走激励广告，我方裁定=免费一次） */
  revived = false;
  /** 风力时基（F6）：缺省仿真时间，生产传墙钟（见 WorldOptions 注释） */
  private windClockS: () => number;

  phase: WorldPhase = "playing";
  timerMs = 0;

  /** 当前仿真秒（只读）：服务端 FW_WIND_PHASE 固定相位时基的读取点 */
  get simSeconds(): number {
    return this.simTimeS;
  }

  /** Step 期间的事件落点：接触回调直改状态并即时产事件（原版口径，F7） */
  private stepEvents: WorldEvent[] | null = null;
  private tpEvents: { kind: "pusher"; group: number; state: number }[] = [];
  // ---- 光束缓存签名（r12 Round A）：全动态体变换逐位快照 + 突变 epoch。
  // 变换全等与 epoch 一致时 beamer raycast 结果必然逐位相同（命中只依赖 fixture 变换与
  // beamer 自身位姿/state），可安全复用上一帧折线并重放照明标记；epoch 覆盖 freeze/melt
  // （filter/lp 翻转）与体销毁（钻石拾取）两类非变换突变。位级等价性论证见 r12 报告 RoundA。
  private lightSig: Float64Array = new Float64Array(0);
  private lightSigPrev: Float64Array = new Float64Array(0);
  private lightSigLen = -1;
  private lightSigStable = false;
  lightEpoch = 0;
  /** 传送门开闭态签名（态变 bump lightEpoch，防 Beamer 折线缓存吃到过期穿门路径） */
  private portalSig = "";
  private listener: any;
  private pendingRemove: any[] = [];

  constructor(level: LevelData, options: WorldOptions = {}) {
    this.level = level;
    this.B = b2();
    this.built = buildLevelWorld(level);
    this.mechs = buildMechanisms(this.B, this.built.world, this.built.groundBody, level);
    this.chars = {
      fireboy: new Character(this.B, this.built.world, "fireboy", level.spawn.fireboy),
      watergirl: new Character(this.B, this.built.world, "watergirl", level.spawn.watergirl),
    };
    this.windClockS = options.windClockS ?? (() => this.simTimeS);
    for (const wind of this.mechs.winds) {
      wind.registerCharBodies([
        ["fireboy", this.chars.fireboy.body],
        ["watergirl", this.chars.watergirl.body],
      ]);
    }
    this.installContactListener();
    // startFrozen（type55 冰面）：初始冻结（原版 _.delay(initialFreeze,10)——含一步 settle 物理，
    // light 数据无 55 砖不走此路；语义保留，02号档 §10-5）
    const startEvents: WorldEvent[] = [];
    for (const liq of this.built.liquids) {
      if (liq.startFrozen && liq.liquidType === GROUND_TYPE.WATER) this.freezeLiquid(liq, startEvents);
    }
    // F 部 RespawnManager（F 专属但恒挂：站定抓取纯记录，无 F 数据时队列恒空）
    this.respawn = new RespawnManager(this);
  }

  private installContactListener(): void {
    const B = this.B;
    const listener = new B.b2ContactListener();
    const self = this;
    // 原版口径（F7 翻转）：回调内直接改状态——液体致死/门带/钻石/脚底表在 Step 求解期间
    // 即时生效（research/11 §2B；box2d.ts 回调同步触发）。body 移除仍延迟到步后
    // （box2d 禁止回调内 DestroyBody，原版插件 _toRemove 同款，见 flushPendingRemove）。
    // stepEvents 为 null 时不处理（reset/DestroyBody 连带的步外 EndContact——按 fixture
    // 类型全为无操作，跳过与原版等价）。
    listener.BeginContact = function (contact: any) {
      if (self.stepEvents) self.classifyContactPair(contact, true, self.stepEvents);
    };
    listener.EndContact = function (contact: any) {
      if (self.stepEvents) self.classifyContactPair(contact, false, self.stepEvents);
    };
    this.listener = listener;
    this.built.world.SetContactListener(listener);
  }

  /** 接触对按"回调所有者视角"双向分类（feet/door/wind/diamond 四类回调的并集） */
  private classifyContactPair(contact: any, begin: boolean, events: WorldEvent[]): void {
    const fa = contact.GetFixtureA ? contact.GetFixtureA() : contact.m_fixtureA;
    const fb = contact.GetFixtureB ? contact.GetFixtureB() : contact.m_fixtureB;
    this.classifyContact(fa, fb, begin, events, contact);
    this.classifyContact(fb, fa, begin, events, contact);
  }

  // -------------------------------------------------- 公共查询

  get players(): Record<Role, Character> {
    return this.chars;
  }

  get liquids() {
    return this.built.liquids;
  }

  get diamonds() {
    return this.built.diamonds;
  }

  get doors(): Record<Role, DoorInfo> {
    return this.built.doors;
  }

  get mechanisms(): Mechanisms {
    return this.mechs;
  }

  /** 机关快照（server 每 tick 写入 schema；坐标屏幕 px、角度屏幕弧度） */
  mechSnapshot(): {
    levers: Array<{ id: number; group: number; state: number; angle: number }>;
    pushers: Array<{ id: number; group: number; state: number; x: number; y: number }>;
    platforms: Array<{ id: number; x: number; y: number; angle: number; state: number }>;
    props: Array<{ id: number; kind: string; x: number; y: number; angle: number }>;
    winds: Array<{ id: number; group: number; state: number }>;
    hangings: Array<{ id: number; x: number; y: number; angle: number }>;
    pulleys: Array<{ id: number; a: { x: number; y: number; angle: number }; b: { x: number; y: number; angle: number } }>;
    romans: Array<{ id: number; x: number; y: number; angle: number }>;
    beamers: Array<{ id: number; state: number; pts: string }>;
    rotMirrors: Array<{ id: number; x: number; y: number; angle: number }>;
    boxMirrors: Array<{ id: number; x: number; y: number; angle: number }>;
    infiniteMirrors: Array<{ id: number; angle: number }>;
    lightPushers: Array<{ id: number; group: number; state: number; x: number; y: number }>;
    sliders: Array<{ id: number; x: number; y: number }>;
    timedPushers: Array<{ id: number; state: number; x: number; y: number }>;
    liquidsFrozen: boolean[];
  } {
    return {
      levers: this.mechs.levers.map((l, id) => ({ id, group: l.group, state: l.state, angle: (l.angleDeg() * Math.PI) / 180 })),
      pushers: this.mechs.pushers.map((p, id) => {
        const pos = p.body.GetPosition();
        return { id, group: p.group, state: p.state, x: m2px(pos.x), y: m2px(pos.y) };
      }),
      platforms: this.mechs.platforms.map((p, id) => {
        const pos = p.body.GetPosition();
        return { id, x: m2px(pos.x), y: m2px(pos.y), angle: -p.body.GetAngle(), state: p.state };
      }),
      props: this.mechs.props.map((p, id) => {
        const pos = p.body.GetPosition();
        return { id, kind: p.kind, x: m2px(pos.x), y: m2px(pos.y), angle: -p.body.GetAngle() };
      }),
      winds: this.mechs.winds.map((wd, id) => ({ id, group: wd.group, state: wd.state })),
      // 吊挂/滑轮/罗马杆：+体角（同 lever 约定，客户端 +angle×180/π 直用；platforms/props 的
      // 负号是历史"双取负"口径——客户端有一层取负与之配对，勿混用）
      hangings: this.mechs.hangings.map((h, id) => {
        const pos = h.platform.GetPosition();
        return { id, x: m2px(pos.x), y: m2px(pos.y), angle: h.platform.GetAngle() };
      }),
      pulleys: this.mechs.pulleys.map((p, id) => {
        const pose = (b: any) => {
          const pos = b.GetPosition();
          return { x: m2px(pos.x), y: m2px(pos.y), angle: b.GetAngle() };
        };
        return { id, a: pose(p.plat1), b: pose(p.plat2) };
      }),
      romans: this.mechs.romans.map((r, id) => {
        const pos = r.bar.GetPosition();
        return { id, x: m2px(pos.x), y: m2px(pos.y), angle: r.bar.GetAngle() };
      }),
      // 灯光神庙：光束折线转屏幕 px（m2px=phys 逆）；角度同 lever 约定（体角原值）
      beamers: this.mechs.beamers.map((b, id) => ({
        id,
        state: b.state,
        pts: b.packed(),
      })),
      rotMirrors: this.mechs.rotMirrors.map((m, id) => {
        const pos = m.body.GetPosition();
        return { id, x: m2px(pos.x), y: m2px(pos.y), angle: m.body.GetAngle() };
      }),
      boxMirrors: this.mechs.boxMirrors.map((m, id) => {
        const pos = m.body.GetPosition();
        return { id, x: m2px(pos.x), y: m2px(pos.y), angle: m.body.GetAngle() };
      }),
      infiniteMirrors: this.mechs.infiniteMirrors.map((m, id) => ({ id, angle: m.body.GetAngle() })),
      lightPushers: this.mechs.lightPushers.map((m, id) => {
        const pos = m.body.GetPosition();
        return { id, group: m.group, state: m.state, x: m2px(pos.x), y: m2px(pos.y) };
      }),
      sliders: this.mechs.sliders.map((m, id) => {
        const pos = m.body.GetPosition();
        return { id, x: m2px(pos.x), y: m2px(pos.y) };
      }),
      timedPushers: this.mechs.timedPushers.map((m, id) => {
        const pos = m.body.GetPosition();
        return { id, state: m.state, x: m2px(pos.x), y: m2px(pos.y) };
      }),
      liquidsFrozen: this.built.liquids.map((l) => l.frozen),
    };
  }

  /** 客户端/快照用角色状态（屏幕系） */
  snapshotPlayer(role: Role): PlayerSnapshot {
    const c = this.chars[role];
    const p = c.body.GetPosition();
    const v = c.body.GetLinearVelocity();
    const door = this.built.doors[role];
    return {
      role,
      x: m2px(p.x),
      y: m2px(p.y),
      vx: m2px(v.x),
      vy: m2px(v.y),
      anim: c.anim,
      facing: c.facing,
      headTilt: c.headTilt,
      inLiquid: c.isOnLiquid,
      dying: c.dying,
      dead: c.dead,
      isDead: c.isDead,
      atDoor: door.isOpen,
      doorFrame: Math.round(door.frac),
      doorUp: door.isUp,
    };
  }

  // -------------------------------------------------- 步进

  /** F 部仙女/杯访问（视图与测试用；mechs 本体保持私有） */
  get fairies() {
    return this.mechs.fairies;
  }

  get fairyCups() {
    return this.mechs.fairyCups;
  }

  /** D/E 部传送门访问（视图与测试用；mechs 本体保持私有） */
  get portals() {
    return this.mechs.portals;
  }

  /** 推进一帧。dt 秒（服务端 1/60；对拍时喂录制 dt 序列）。返回本帧事件。 */
  step(dt: number, inputs: Record<Role, InputState>): WorldEvent[] {
    const events: WorldEvent[] = [];
    if (this.phase !== "playing") return events;

    // 风力（原版在 device update 链中施力；施力顺序对求解器无影响）。时基 F6 翻转：
    // 生产=墙钟（windClockS 注入），缺省=simTimeS 保持 det/金轨迹位级确定
    for (const wind of this.mechs.winds) wind.applyForce(this.windClockS(), dt);
    this.chars.fireboy.update(this.B, dt, inputs.fireboy, jumpSoundHook);
    this.chars.watergirl.update(this.B, dt, inputs.watergirl, jumpSoundHook);

    // F 部仙女步进（oracle Fairy.update 每帧；时基=仿真钟保 det，oracle 墙钟偏差记档）
    if (this.mechs.fairies.length > 0) {
      const cps = [this.chars.fireboy.body.GetPosition(), this.chars.watergirl.body.GetPosition()];
      for (const f of this.mechs.fairies) f.update(this.simTimeS * 1000, cps);
      for (const f of this.mechs.fairies) f.checkLock((g) => this.mechs.manager.queryActive(g));
    }

    // 原版帧序（运行时探针 2026-10-09，forest_01 实测）：doors → wg → fb → 设备(逆注册序) → Step。
    // 机关检查与门扫帧在 Step【前】：checkState 读的是上一步的关节角，状态变化当帧进入求解。
    // 原实现放在 Step 后（反应滞后 1 帧）——research/11 §2B 驱动序残余的确定性来源之一。
    // 设备逐帧 update 链（原版每帧 device.update()）：当前唯一物理实义=转臂限位硬钳（P1-D1）
    for (const p of this.mechs.platforms) p.update();
    if (this.phase === "playing") {
      const mechEvents: MechEvent[] = [];
      for (const l of this.mechs.levers) l.checkState(mechEvents);
      for (const p of this.mechs.pushers) p.checkState(mechEvents);
      for (const ev of mechEvents) {
        events.push({ type: "mech", event: ev });
        this.mechs.manager.deviceChanged();
      }
      // 灯光神庙设备链（light 非空时）：逆创建序逐设备（原版 sprite 更新序探针口径）——
      // Beamer.update（raycast 标记 illumination）→ LightPusher.checkState（消费+派发）→
      // Slider.checkState（连续 state 派发）→ RotMirror.update（钳角）；InfiniteMirror 走信号。
      // 派发即调 deviceChanged(group)（原版 signal.dispatch 同步语义）。
      if (this.mechs.lightDevices.length > 0) {
        // 传送门开闭影响光束续射（D 槽 §1.5）：态变即失效 Beamer 折线缓存（bump epoch）
        if (this.mechs.portals.length > 0) {
          let sig = "";
          for (const p of this.mechs.portals) sig += p.state ? "1" : "0";
          if (sig !== this.portalSig) {
            this.portalSig = sig;
            this.lightEpoch++;
          }
        }
        this.collectLightSig();
        const lightEvents: MechEvent[] = [];
        for (let i = this.mechs.lightDevices.length - 1; i >= 0; i--) {
          const d = this.mechs.lightDevices[i];
          if (d.beamer) d.beamer.update(this.lightSigStable, this.lightEpoch);
          else if (d.rotMirror) d.rotMirror.update();
          else if (d.lightPusher) d.lightPusher.checkState(lightEvents);
          else if (d.slider) d.slider.checkState(lightEvents);
        }
        for (const ev of lightEvents) {
          events.push({ type: "mech", event: ev });
          if ("group" in ev) this.mechs.manager.deviceChanged(ev.group);
        }
        // 液体光照检查（原版 Liquid.update：蓝照水冻/红照水融，iluminated 不清=原版 quirk）
        for (const liq of this.built.liquids) {
          if (liq.liquidType !== GROUND_TYPE.WATER || liq.sensorLp.iluminated == null) continue;
          if (liq.sensorLp.iluminated === "blue") this.freezeLiquid(liq, events);
          else if (liq.sensorLp.iluminated === "red") this.meltLiquid(liq, events);
        }
      }
      // 定时推杆（ice，dt 走仿真钟）：events 只作音效广播；state 迁移沿（压下/到时/早松）
      // 即 oracle signal.dispatch 点（C @1726729 构造器 registerDevice 入组+接线）——
      // 同帧同步 deviceChanged(group) 驱动组内平台（ice_02 升降闸门，2026-10-28 保真修复）
      if (this.mechs.timedPushers.length > 0) {
        this.tpEvents.length = 0;
        for (const tp of this.mechs.timedPushers) {
          const prev = tp.state;
          tp.checkState(this.tpEvents, dt * 1000);
          if (tp.state !== prev) this.mechs.manager.deviceChanged(tp.group);
        }
        for (const ev of this.tpEvents) events.push({ type: "mech", event: ev });
      }
      // F 部仙女杯（oracle 走 contact 回调；内核确定性全量重算——圆-圆重叠与
      // TestOverlap 等价）：新成员设杯口吸附目标，checkState 迁移沿同步派发组信号
      if (this.mechs.fairyCups.length > 0) {
        const fEvents: MechEvent[] = [];
        for (const cup of this.mechs.fairyCups) {
          cup.refreshMembership(this.mechs.fairies);
          const prev = cup.state;
          cup.checkState(fEvents);
          if (cup.state !== prev) this.mechs.manager.deviceChanged(cup.group);
        }
        for (const ev of fEvents) events.push({ type: "mech", event: ev });
      }
      // D/E 部传送门：开门近面判定 + transport（oracle begin-contact 回调的确定性等价）。
      // 放 Step 前：出门位置当帧进求解；冷却=仿真钟 200ms 每体跨门共享（oracle body.lastTransport）
      if (this.mechs.portals.length > 0) this.updatePortals(events);
      this.updateDoors(dt, events);
    }

    this.stepEvents = events; // 接触回调内直改（F7，原版口径）
    this.built.world.Step(dt, 8, 3);
    this.stepEvents = null;
    this.simTimeS += dt;
    this.flushPendingRemove();

    if (this.phase === "playing") {
      // F 部站定检查点（oracle Level.update 每帧 respawnManager.update；纯记录不改物理）
      this.respawn.maybeCheckpoint(this.simTimeS * 1000, inputs);
      this.checkEnd(events);
      this.timerMs += dt * 1000;
    }
    return events;
  }

  /** 延迟移除已收集钻石体（box2d 禁止回调内 DestroyBody；原版插件 _toRemove 同款） */
  private flushPendingRemove(): void {
    if (this.pendingRemove.length) this.lightEpoch++;
    while (this.pendingRemove.length) {
      this.built.world.DestroyBody(this.pendingRemove.pop());
    }
  }

  /**
   * 原版回调全部挂在"感应 fixture 所有者"视角：
   *  - character 把回调挂在 feetSensor 上：其它 fixture 是液体致死 sensor → 液体逻辑；非 sensor → 脚底接触表；
   *  - Door 把回调挂在门 sensor 上：另一侧是该门角色的任意 fixture → isOpen 直设（begin/end）；
   *  - Diamond 把回调挂在钻石 sensor 上：另一侧角色同色/silver/fbwg → 拾取。
   * 因此这里以 fix=回调所有者视角分类，other=对侧。
   */
  private classifyContact(fix: any, other: any, begin: boolean, events: WorldEvent[], contact: any): void {
    const ud = fix.GetUserData ? fix.GetUserData() : fix.m_userData;
    const otherUd = other.GetUserData ? other.GetUserData() : other.m_userData;
    const fixBody = fix.GetBody ? fix.GetBody() : fix.m_body;
    const otherBody = other.GetBody ? other.GetBody() : other.m_body;

    // ---- 脚底感应（原版 character 的 feetSensor 回调）----
    if (ud === "feet") {
      const role = this.roleOfBody(fixBody);
      if (!role) return;
      const char = this.chars[role];
      const otherIsSensor = other.IsSensor ? other.IsSensor() : other.m_isSensor;
      if (otherIsSensor) {
        // Snow/冻面计数（原版 snowCount 回调 @57136-57142：雪砖/冻结冰面 → setOnIce）
        if (otherUd && typeof otherUd === "object" && (otherUd.type === "snow" || otherUd.type === "ice")) {
          if (begin) char.snowBegin();
          else char.snowEnd();
        }
        if (otherUd && typeof otherUd === "object" && otherUd.type === "liquid_death") {
          if (begin) {
            if (char.liquidTouched(otherUd.liquidType) && !char.dying) {
              char.kill();
              events.push({ type: "death", role });
            }
            char.isOnLiquid = true;
          } else {
            char.isOnLiquid = false;
          }
        }
        // 其它 sensor（门/钻石/液体显示带）不进接触表
        return;
      }
      if (begin) char.feetContactBegin(contact);
      else char.feetContactEnd(contact);
      return;
    }

    // ---- 门感应带（原版 Door 的 sensor 回调，匹配角色才置 isOpen）----
    if (ud && typeof ud === "object" && ud.type === "door") {
      const role: Role = ud.char === "fb" ? "fireboy" : "watergirl";
      if (this.roleOfBody(otherBody) !== role) return;
      // 原版：f ? isOpen=true : isOpen=false（begin/end 直设，无计数）
      this.built.doors[role].isOpen = begin;
      return;
    }

    // ---- 风柱（World 分发：机柱 sensor 进出 → Wind.activeRoles）----
    if (ud && typeof ud === "object" && ud.type === "wind") {
      const role = this.roleOfBody(otherBody);
      if (!role) return;
      const wind = this.mechs.winds.find((wd) => this.hasFixture(wd.body, fix));
      wind?.setActive(role, begin);
      return;
    }

    // ---- 液面 sensor 接触体（原版 Liquid setFixtureContactCallback @1664830：
    //      begin 入表/end 出表；freeze 时上推角色、冻结其余体）----
    if (ud && typeof ud === "object" && ud.type === "liquid") {
      const liq = this.built.liquids.find((l) => this.hasFixture(l.body, fix));
      if (!liq) return;
      const idx = liq.nearBodies.findIndex((e) => e.body === otherBody);
      if (begin && idx < 0) liq.nearBodies.push({ id: liq.nearBodies.length, body: otherBody });
      else if (!begin && idx >= 0) liq.nearBodies.splice(idx, 1);
      return;
    }

    // ---- 钻石（原版 Diamond 的 sensor 回调，仅 begin）----
    if (ud && typeof ud === "object" && ud.type === "diamond") {
      if (!begin) return;
      const role = this.roleOfBody(otherBody);
      if (!role) return;
      const diamond = this.built.diamonds.find((d) => this.hasFixture(d.body, fix));
      if (!diamond || diamond.collected) return;
      const char = this.chars[role];
      const eligible = diamond.char === "silver" || diamond.char === "fbwg" || char.char === diamond.char;
      if (!eligible) return;
      diamond.collected = true;
      if (diamond.char === "silver") char.silverDiamond += 1;
      else char.diamonds += 1;
      this.pendingRemove.push(diamond.body);
      events.push({ type: "diamond", role, kind: diamond.kind });
    }
  }

  private hasFixture(body: any, fix: any): boolean {
    let f = body.GetFixtureList();
    while (f) {
      if (f === fix) return true;
      f = f.GetNext();
    }
    return false;
  }

  private roleOfBody(body: any): Role | undefined {
    if (!body || body.GetUserData() !== "pers") return undefined;
    return this.chars.fireboy.body === body ? "fireboy" : this.chars.watergirl.body === body ? "watergirl" : undefined;
  }

  /** 传送门逐帧步进（Step 前）：开门对全部可传载体（角色/箱/球/仙女——均带
   *  portal-sensor 标记）做近面判定，命中即 transport；音效队列排水为 mech 事件。 */
  private updatePortals(events: WorldEvent[]): void {
    const bodies: Array<{ body: any }> = [
      { body: this.chars.fireboy.body },
      { body: this.chars.watergirl.body },
    ];
    for (const p of this.mechs.props) bodies.push({ body: p.body });
    for (const f of this.mechs.fairies) bodies.push({ body: f.body });
    const nowMs = this.simTimeS * 1000;
    for (const p of this.mechs.portals) {
      p.checkTransport(bodies, this.portalLastTransport, nowMs);
      for (const sfx of p.soundQueue) {
        events.push({ type: "mech", event: { kind: "portal", sfx } });
      }
      p.soundQueue.length = 0;
    }
  }

  /** 门 25fps 扫帧（原版 Door.update：isOpen 推进 25·dt 帧，21 帧到位，闭合反向） */
  private updateDoors(dt: number, events: WorldEvent[]): void {
    for (const role of ["fireboy", "watergirl"] as const) {
      const door = this.built.doors[role];
      const advance = 25 * Math.min(0.04, dt);
      if (door.isOpen) {
        // 推进闸门必须用 frac 本身：round(frac)<21 会在 20.83 帧提前停摆，
        // isUp 永差一步（0.3.26 及之前真实游玩永不通关的根因，双门只能同帧脉冲到齐）
        if (door.frac < 21) {
          door.frac = Math.min(21, door.frac + advance);
        }
        if (door.frac >= 21 && !door.signaled) {
          door.signaled = true;
          events.push({ type: "door-open", role });
        }
      } else {
        if (door.frac > 0) {
          door.frac = Math.max(0, door.frac - advance);
          door.signaled = false;
        }
      }
      // 原版口径（45097 前后）：isUp 每帧由当前帧号重算（21===a）——
      // 站门期间持续为真（signal 每帧驱动 checkEndGame），离开即随扫帧回退
      door.isUp = door.frac >= 21;
    }
  }

  /** 全动态体变换签名（r12 Round A）：逐位比较上一帧；全等则光束复用合法。
   *  只扫动态体（static 恒定；体销毁/freeze 走 epoch）。零分配：复用缓冲。 */
  private collectLightSig(): void {
    let n = 0;
    for (let b = this.built.world.GetBodyList(); b; b = b.GetNext()) {
      if (b.GetType() !== this.B.b2BodyType.b2_dynamicBody) continue;
      const pos = b.GetPosition();
      if (n + 3 > this.lightSig.length) {
        const grown = new Float64Array(this.lightSig.length * 2 + 64);
        grown.set(this.lightSig);
        this.lightSig = grown;
        this.lightSigPrev = new Float64Array(this.lightSig.length);
      }
      this.lightSig[n] = pos.x;
      this.lightSig[n + 1] = pos.y;
      this.lightSig[n + 2] = b.GetAngle();
      n += 3;
    }
    if (n !== this.lightSigLen) {
      this.lightSigLen = n;
      this.lightSigStable = false;
      return;
    }
    let stable = true;
    for (let i = 0; i < n; i++) {
      if (this.lightSig[i] !== this.lightSigPrev[i]) {
        stable = false;
        break;
      }
    }
    this.lightSigStable = stable;
    for (let i = 0; i < n; i++) this.lightSigPrev[i] = this.lightSig[i];
  }

  /** 液面冻结（原版 Liquid.freeze @1667963 逐字）：冰面 mask→16（仅对角色层）；
   *  nearBodies：角色上推 0.5m+唤醒，其余体转 static；液面 sensor lp 翻 mirror（冻面反光） */
  private freezeLiquid(liq: any, events: WorldEvent[]): void {
    if (liq.frozen) return;
    liq.frozen = true;
    this.lightEpoch++;
    liq.iceFixture.SetFilterData({ categoryBits: 1, maskBits: 16 });
    for (const { body } of liq.nearBodies) {
      const role = this.roleOfBody(body);
      if (role) {
        const pos = body.GetPosition();
        body.SetPosition(new this.B.b2Vec2(pos.x, pos.y + 0.5));
        body.SetAwake(true);
      } else {
        body.SetType(this.B.b2BodyType.b2_staticBody);
        liq.frozenBodies.push(body);
      }
    }
    liq.sensorLp.type = "mirror";
    events.push({ type: "liquid-frozen" });
  }

  /** 液面融化（原版 Liquid.melt @1671909 逐字）：冰面 mask→0，冻结体还原 dynamic，sensor 翻回 normal */
  private meltLiquid(liq: any, events: WorldEvent[]): void {
    if (!liq.frozen) return;
    liq.frozen = false;
    this.lightEpoch++;
    liq.iceFixture.SetFilterData({ categoryBits: 1, maskBits: 0 });
    for (const body of liq.frozenBodies) body.SetType(this.B.b2BodyType.b2_dynamicBody);
    liq.frozenBodies.length = 0;
    liq.sensorLp.type = "normal";
    events.push({ type: "liquid-melted" });
  }

  private checkEnd(events: WorldEvent[]): void {
    // 任一 isDead → gameover（原版 checkEndGame）
    if (this.chars.fireboy.isDead || this.chars.watergirl.isDead) {
      this.phase = "gameover";
      events.push({ type: "gameover" });
      return;
    }
    // 双门到位 → win（原版 animateFinish）
    if (this.built.doors.fireboy.isUp && this.built.doors.watergirl.isUp) {
    // 原版口径（45097）：gameFinish 在 1600ms 楼梯动画后取钟值——通关计时含楼梯演出
      this.phase = "won";
      const fb = this.chars.fireboy;
      const wg = this.chars.watergirl;
      events.push({
        type: "win",
        data: {
          fbDiamonds: fb.diamonds,
          wgDiamonds: wg.diamonds,
          silver: fb.silverDiamond + wg.silverDiamond,
          timeMs: this.timerMs + 1600,
        },
      });
    }
  }

  /** 整关重开（原版 retry 语义 = 重建世界；房间层调这个而不是复用实例） */
  reset(): void {
    this.built = buildLevelWorld(this.level);
    this.mechs = buildMechanisms(this.B, this.built.world, this.built.groundBody, this.level);
    this.chars = {
      fireboy: new Character(this.B, this.built.world, "fireboy", this.level.spawn.fireboy),
      watergirl: new Character(this.B, this.built.world, "watergirl", this.level.spawn.watergirl),
    };
    for (const wind of this.mechs.winds) {
      wind.registerCharBodies([
        ["fireboy", this.chars.fireboy.body],
        ["watergirl", this.chars.watergirl.body],
      ]);
    }
    this.phase = "playing";
    this.timerMs = 0;
    this.simTimeS = 0;
    this.stepEvents = null;
    this.pendingRemove.length = 0;
    this.installContactListener();
    this.respawn.clear(); // 旧快照引用的 body 已随重建销毁
    this.revived = false;
  }

  /** F 部免费复活一次（R2；oracle Level.revive @L62017：销毁重建双角 → 检查点回放 →
   *  计时回拨）。队列空（开局即死未抓过）返回 false，宿主退化整关 retry。 */
  revive(): boolean {
    if (this.revived || this.phase !== "gameover") return false;
    for (const c of [this.chars.fireboy, this.chars.watergirl]) this.built.world.DestroyBody(c.body);
    this.chars = {
      fireboy: new Character(this.B, this.built.world, "fireboy", this.level.spawn.fireboy),
      watergirl: new Character(this.B, this.built.world, "watergirl", this.level.spawn.watergirl),
    };
    for (const wind of this.mechs.winds) {
      wind.registerCharBodies([
        ["fireboy", this.chars.fireboy.body],
        ["watergirl", this.chars.watergirl.body],
      ]);
    }
    const t = this.respawn.loadLatest(this.simTimeS * 1000);
    if (t === null) return false;
    this.phase = "playing";
    this.timerMs = t; // oracle clock.resumeAt(gameTime) 的计时回拨
    this.revived = true;
    return true;
  }
}
