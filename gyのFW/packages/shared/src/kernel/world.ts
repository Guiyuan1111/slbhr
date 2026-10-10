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
import { buildLevelWorld, type BuiltWorld, type DoorInfo } from "./build.js";
import { Character, type AnimState, type InputState } from "./character.js";
import { buildMechanisms, type MechEvent, type Mechanisms } from "./mechanisms.js";

export type WorldPhase = "playing" | "won" | "gameover";

export type WorldEvent =
  | { type: "death"; role: Role }
  | { type: "gameover" }
  | { type: "diamond"; role: Role; kind: "red" | "blue" | "silver" | "fbwg" }
  | { type: "door-open"; role: Role }
  | { type: "mech"; event: MechEvent }
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

interface ContactEvent {
  begin: boolean;
  contact: any;
}

export class World {
  readonly level: LevelData;
  private built: BuiltWorld;
  private mechs: Mechanisms;
  private B: B2;
  private chars: Record<Role, Character>;
  /** 原版 data.diamonds 等价物从 Character 取 */
  private simTimeS = 0;

  phase: WorldPhase = "playing";
  timerMs = 0;

  private contactEvents: ContactEvent[] = [];
  private listener: any;
  private pendingRemove: any[] = [];

  constructor(level: LevelData) {
    this.level = level;
    this.B = b2();
    this.built = buildLevelWorld(level);
    this.mechs = buildMechanisms(this.B, this.built.world, this.built.groundBody, level);
    this.chars = {
      fireboy: new Character(this.B, this.built.world, "fireboy", level.spawn.fireboy),
      watergirl: new Character(this.B, this.built.world, "watergirl", level.spawn.watergirl),
    };
    for (const wind of this.mechs.winds) {
      wind.registerCharBodies([
        ["fireboy", this.chars.fireboy.body],
        ["watergirl", this.chars.watergirl.body],
      ]);
    }
    this.installContactListener();
  }

  private installContactListener(): void {
    const B = this.B;
    const listener = new B.b2ContactListener();
    const self = this;
    listener.BeginContact = function (contact: any) {
      self.contactEvents.push({ begin: true, contact });
    };
    listener.EndContact = function (contact: any) {
      self.contactEvents.push({ begin: false, contact });
    };
    this.listener = listener;
    this.built.world.SetContactListener(listener);
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

  /** 推进一帧。dt 秒（服务端 1/60；对拍时喂录制 dt 序列）。返回本帧事件。 */
  step(dt: number, inputs: Record<Role, InputState>): WorldEvent[] {
    const events: WorldEvent[] = [];
    if (this.phase !== "playing") return events;

    const jumpSound = () => {
      /* 音效属客户端，内核只留钩子 */
    };
    // 风力（原版在 device update 链中施力；施力顺序对求解器无影响，取 simTimeS 为时基）
    for (const wind of this.mechs.winds) wind.applyForce(this.simTimeS);
    this.chars.fireboy.update(this.B, dt, inputs.fireboy, jumpSound);
    this.chars.watergirl.update(this.B, dt, inputs.watergirl, jumpSound);

    // 原版帧序（运行时探针 2026-10-09，forest_01 实测）：doors → wg → fb → 设备(逆注册序) → Step。
    // 机关检查与门扫帧在 Step【前】：checkState 读的是上一步的关节角，状态变化当帧进入求解。
    // 原实现放在 Step 后（反应滞后 1 帧）——research/11 §2B 驱动序残余的确定性来源之一。
    if (this.phase === "playing") {
      const mechEvents: MechEvent[] = [];
      for (const l of this.mechs.levers) l.checkState(mechEvents);
      for (const p of this.mechs.pushers) p.checkState(mechEvents);
      for (const ev of mechEvents) {
        events.push({ type: "mech", event: ev });
        this.mechs.manager.deviceChanged();
      }
      this.updateDoors(dt, events);
    }

    this.built.world.Step(dt, 8, 3);
    this.simTimeS += dt;
    this.processContactEvents(events);

    if (this.phase === "playing") {
      this.checkEnd(events);
      this.timerMs += dt * 1000;
    }
    return events;
  }

  /** 原版在接触回调里直接改状态（body 移除由插件 _toRemove 延迟）——这里统一出步后处理 */
  private processContactEvents(events: WorldEvent[]): void {
    for (const { begin, contact } of this.contactEvents) {
      const fa = contact.GetFixtureA ? contact.GetFixtureA() : contact.m_fixtureA;
      const fb = contact.GetFixtureB ? contact.GetFixtureB() : contact.m_fixtureB;
      this.classifyContact(fa, fb, begin, events, contact);
      this.classifyContact(fb, fa, begin, events, contact);
    }
    this.contactEvents.length = 0;
    // 延迟移除已收集钻石体
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
    this.contactEvents.length = 0;
    this.pendingRemove.length = 0;
    this.installContactListener();
  }
}
