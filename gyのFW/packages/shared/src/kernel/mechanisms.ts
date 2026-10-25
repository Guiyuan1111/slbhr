/**
 * box2d 内核 —— 机关全谱。
 *
 * 逐字节转写原版 Devices（证据：note/research/2026-10-fidelity/05-mechanism-constants.md，
 * 原始切片存 TEMP/extract-c/d01..d30）。坐标：物理 = (−screen/32, −screen/32)，+y=屏幕上。
 *
 * 组同步（MechManager）：Lever/Pusher 为"信号源"（hasSignal），state 翻转时 dispatch；
 * deviceChanged = 组内所有信号源 state 的 OR → 赋给组内非信号设备（平台/窗）并 _updateState。
 * 平台纯信号驱动（updateState 仅在信号时调用，SetMotorSpeed ±2 持续生效到行程端点）。
 */
import { windBodyPos, type BeamerDef, type BoxMirrorDef, type InfiniteMirrorDef, type LevelData, type LightPusherDef, type RotMirrorDef, type SliderDef } from "../level2.js";
import type { B2 } from "./b2.js";
import { boxFixture, circleFixture, FILTER, polygonFixture, px2m } from "./b2.js";

/** 屏幕像素点 → 物理 vec（新建 b2Vec2） */
function phys(B: B2, x: number, y: number): any {
  return new B.b2Vec2(-x / 32, -y / 32);
}

/** 机关事件（世界层转发为 WorldEvent / sfx） */
export type MechEvent =
  | { kind: "lever"; group: number; state: number }
  | { kind: "pusher"; group: number; state: number }
  | { kind: "lightpusher"; group: number; state: number }
  | { kind: "slider"; group: number; state: number };

/** 光束交互属性（fixture userData.lightProperties；02号档 §8/§9）。
 * iluminated/lightAt 由 Beamer raycast 写入，LightPusher 消费后自清，Liquid 只读不清（原版 quirk）。 */
export interface LightProperties {
  type: "normal" | "transparent" | "mirror";
  sensor?: boolean;
  iluminated?: string | null;
  lightAt?: { x: number; y: number } | null;
}

// ---------------------------------------------------------------- 基类

export abstract class Device {
  state = 0;
  readonly group: number;
  readonly hasSignal: boolean;
  protected B: B2;

  constructor(B: B2, group: number, hasSignal: boolean) {
    this.B = B;
    this.group = group;
    this.hasSignal = hasSignal;
  }

  abstract updateState(silent: boolean): void;
  abstract checkState(events: MechEvent[]): void;
  /** 信号驱动入口（原版 _updateState） */
  signalApply(): void {
    this.updateState(false);
  }
}

// ---------------------------------------------------------------- MechManager

/** 组成员的最小结构（Device 与 MovingPlatform 均满足） */
interface GroupMember {
  group: number;
  hasSignal: boolean;
  state: number;
  signalApply(): void;
}

export class MechManager {
  private groups = new Map<number, GroupMember[]>();

  register(d: GroupMember): void {
    const list = this.groups.get(d.group) ?? [];
    list.push(d);
    this.groups.set(d.group, list);
  }

  /**
   * 原版 deviceChanged（@1834423 逐字）：g = 派发设备 state → 组内信号源依次 `g = g || b.state`
   * （JS ||，保留连续值——滑轨 state ∈ ±π·max/2 直接透传）→ 赋给非信号设备 + _updateState。
   * group 缺省=全组遍历（forest 0/1 源下与旧布尔 OR 等价；传 group 时只处理该组——
   * 滑轨连续态下全组遍历会把其它组的分数态布尔化成 1，2026-10-25 light 集成修正）。
   */
  deviceChanged(group?: number): void {
    const process = (list: GroupMember[]): void => {
      const sources = list.filter((d) => d.hasSignal);
      if (sources.length === 0) return; // 原版仅信号源派发触达；无源组永不被重置（beamer 单组保 initialState）
      let g = 0;
      for (const s of sources) g = g || s.state;
      for (const d of list) {
        if (!d.hasSignal && d.state !== g) {
          d.state = g;
          d.signalApply();
        }
      }
    };
    if (group === undefined) {
      for (const list of this.groups.values()) process(list);
    } else {
      const list = this.groups.get(group);
      if (list) process(list);
    }
  }
}

// ---------------------------------------------------------------- Lever

export class Lever extends Device {
  readonly body: any;
  private joint: any;
  private readonly onis: number;
  /** 过零边沿检测：上一帧的 angle·onis 符号（null=未初始化） */
  /** 事件监听：翻转时通知（音效/快照） */
  onFlip: (() => void) | undefined;

  constructor(B: B2, world: any, groundBody: any, def: { x: number; y: number; group: number; onis: number; startPos: number }) {
    super(B, def.group, true);
    this.onis = def.onis;
    // level2 的 x,y 已是图块中心（BoxedDevice 中心矫正已在解析层完成）
    const center = phys(B, def.x, def.y);
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_dynamicBody;
    bd.position = center;
    bd.fixedRotation = false;
    this.body = world.CreateBody(bd);
    // 杆 fixture：半尺寸 0.15×0.7，中心 (0, +0.55m)；density 1.6 fr 0.7；cat1/mask61695
    const shape = new B.b2PolygonShape();
    shape.SetAsOrientedBox(0.15, 0.7, new B.b2Vec2(0, 0.55), 0);
    const fd = new B.b2FixtureDef();
    fd.shape = shape;
    fd.friction = 0.7;
    fd.restitution = 0;
    fd.density = 1.6;
    fd.filter.categoryBits = FILTER.GROUND_CAT;
    fd.filter.maskBits = FILTER.LIQUID_SENSOR_MASK;
    this.body.CreateFixture(fd);

    // revolute：支点 = 质心(GetWorldCenter) − 0.7m。金轨迹实证（lever 全程 0.0000、沉降位形逐帧吻合）：
    // 该形制与录制游戏等效——bundle 静态解读（双 fixture+origin 支点）反而偏 2.54px，resSprite/enable
    // 链存在未建模的等效性，金轨迹证据优先（2026-10-06）
    const wc = this.body.GetWorldCenter();
    const pivot = new B.b2Vec2(wc.x, wc.y - 0.7);
    const jd = new B.b2RevoluteJointDef();
    jd.Initialize(this.body, groundBody, pivot);
    jd.lowerAngle = -0.2 * Math.PI;
    jd.upperAngle = 0.2 * Math.PI;
    jd.enableLimit = true;
    jd.maxMotorTorque = 10;
    jd.enableMotor = true;
    jd.motorSpeed = 0; // 初值 0：未扳动不回弹
    this.joint = world.CreateJoint(jd);

    // startPos 定初始倾角：−1 → 下限，+1 → 上限
    if (def.startPos === -1) this.body.SetAngle(this.joint.GetLowerLimit());
    else this.body.SetAngle(this.joint.GetUpperLimit());
  }

  updateState(_silent: boolean): void {
    /* 拉杆不接收组信号（信号源） */
  }

  checkState(events: MechEvent[]): void {
    // 原版 checkState 逐条直译（关节角 = −杆角，随 Initialize 顺序自动正确）：
    // state==0 && 关节角×onis<0 → state=1，马达 −4·onis；state==1 && 关节角×onis>0 → state=0，马达 +4·onis。
    const ja = this.joint.GetJointAngleRadians();
    if (this.state === 0 && ja * this.onis < 0) {
      this.state = 1;
      this.joint.SetMotorSpeed(-4 * this.onis);
      this.onFlip?.();
      events.push({ kind: "lever", group: this.group, state: this.state });
    } else if (this.state === 1 && ja * this.onis > 0) {
      this.state = 0;
      this.joint.SetMotorSpeed(4 * this.onis);
      this.onFlip?.();
      events.push({ kind: "lever", group: this.group, state: this.state });
    }
  }

  /** 快照：杆角（度，屏幕系） */
  angleDeg(): number {
    return (this.body.GetAngle() * 180) / Math.PI;
  }
}

// ---------------------------------------------------------------- Pusher

export class Pusher extends Device {
  readonly body: any;
  private joint: any;
  onFlip: (() => void) | undefined;

  constructor(B: B2, world: any, groundBody: any, def: { x: number; y: number; group: number }) {
    super(B, def.group, true);
    const center = phys(B, def.x, def.y); // level2 已是中心
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_dynamicBody;
    bd.position = center;
    this.body = world.CreateBody(bd);
    this.body.SetUserData("pusher");
    // 纯梯形（bundle @1745895-1746905 铁证）：底 ±(pw/2+0.5)@y0 → 顶 ±(pw/2)@yh，pw=1、h=0.6；
    // density 0.1 / 力 5N / motor −15。旧版 T 形底唇 + 0.03 + 7N 是 0.3.6 误转写（原版无唇）。
    // 贴图块 64×32 画在图块中心，梯形底边过 body origin、向上 19.2px —— 与贴图块下半重合。
    polygonFixture(this.body, B, [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0.5, y: 0.6 },
      { x: -0.5, y: 0.6 },
    ], {
      categoryBits: FILTER.GROUND_CAT,
      maskBits: FILTER.LIQUID_SENSOR_MASK,
      friction: 0.7,
      restitution: 0,
      density: 0.1,
      userData: "pusher",
    });

    // prismatic：bodyA=按钮、bodyB=地面，轴 (0,1)，行程 [0, 0.7]；锚点=质心（原版 GetWorldCenter @1746872）
    const jd = new B.b2PrismaticJointDef();
    jd.Initialize(this.body, groundBody, this.body.GetWorldCenter(), new B.b2Vec2(0, 1));
    jd.lowerTranslation = 0;
    jd.upperTranslation = 0.7;
    jd.enableLimit = true;
    jd.enableMotor = true;
    jd.motorSpeed = -15;
    jd.maxMotorForce = 5;
    this.joint = world.CreateJoint(jd);
  }

  updateState(_silent: boolean): void {
    /* 信号源 */
  }

  checkState(events: MechEvent[]): void {
    const t = this.joint.GetJointTranslation();
    if (this.state === 0 && t > 0.2) {
      this.state = 1;
      this.onFlip?.();
      events.push({ kind: "pusher", group: this.group, state: 1 });
    } else if (this.state === 1 && t <= 0.2) {
      this.state = 0;
      this.onFlip?.();
      events.push({ kind: "pusher", group: this.group, state: 0 });
    }
  }
}

// ---------------------------------------------------------------- MovingPlatform

export class MovingPlatform {
  readonly body: any;
  readonly group: number;
  readonly hasSignal = false;
  state = 0;
  private joint: any;
  private readonly isRevolute: boolean;
  private readonly dthetaPositive: boolean;
  private readonly B: B2;

  constructor(B: B2, world: any, groundBody: any, def: { x: number; y: number; w: number; h: number; dx: number; dy: number; group: number; dtheta?: number; offsetY?: number; rotation?: number }) {
    this.B = B;
    this.group = def.group;
    this.isRevolute = def.dtheta !== undefined;
    this.dthetaPositive = (def.dtheta ?? 0) > 0;

    // 宽<高（米）→ 交换并 shapeRotation=−π/2；中心化：横向 (x+=w/2, y+=h/2)、纵向 (x+=原h/2, y+=原w/2)（px）
    let wM = def.w / 32;
    let hM = def.h / 32;
    let cx = def.x;
    let cy = def.y;
    let shapeRotation = 0;
    if (wM < hM) {
      const t = wM;
      wM = hM;
      hM = t;
      cx += def.w / 2;
 // 原版 swap 后 x += 原 w/2（此前写反，竖直平台碰撞体偏 48px）
      cy += def.h / 2;
 // y += 原 h/2
      shapeRotation = -Math.PI / 2;
    } else {
      cx += def.w / 2;
      cy += def.h / 2;
    }

    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_dynamicBody;
    bd.position = phys(B, cx, cy);
    // 原版体角 = SetAngle(options.rotation)（bundle @1715777；Device 基类以 rad(c.rotation)
    // 预设，@1657987）。n=−π/2 只进 fixture（SetAsOrientedBox 第 4 参）。若把 n 同时烧进
    // 体角，两次 −90° 叠加 ≡ 横放——竖直平台/转臂碰撞体整体躺倒 96×28（原版竖立 28×96）。
    // rotation 多为 0（即此前 bd.angle=0 的等价形态），bonus_3 有 135° 斜台非零实义。
    bd.angle = ((def.rotation ?? 0) * Math.PI) / 180;
    this.body = world.CreateBody(bd);

    // 板 fixture：SetAsOrientedBox(w/2, h/2−padY 0.06)；friction 0.7；density 0（平移）/0.5（转臂）
    const shape = new B.b2PolygonShape();
    shape.SetAsOrientedBox(wM / 2, hM / 2 - 0.06, new B.b2Vec2(0, 0), shapeRotation);
    const fd = new B.b2FixtureDef();
    fd.shape = shape;
    fd.friction = 0.7;
    fd.restitution = 0;
    fd.density = this.isRevolute ? 0.5 : 0;
    fd.filter.categoryBits = FILTER.PLATFORM_CAT;
    fd.filter.maskBits = FILTER.GROUND_MASK;
    fd.userData = { reflection: true };
    this.body.CreateFixture(fd);

    if (this.isRevolute) {
      // 旋转臂：锚点 = 质心 − (offsetX||0, offsetY||0)（米，物理）
      const ox = 0;
      const oy = def.offsetY ?? 0;
      const anchor = new B.b2Vec2(this.body.GetPosition().x - ox, this.body.GetPosition().y - oy);
      const jd = new B.b2RevoluteJointDef();
      jd.Initialize(this.body, groundBody, anchor); // 原版序（bundle @1716690：Initialize(平台, 地面)）；关节角=−体角−π/2，参数序对调会把竖直转臂终位镜像 180°
      const limit = (Math.PI * (def.dtheta ?? 0)) / 180;
      if (this.dthetaPositive) {
        jd.lowerAngle = 0;
        jd.upperAngle = limit;
      } else {
        jd.lowerAngle = limit;
        jd.upperAngle = 0;
      }
      jd.enableLimit = true;
      jd.maxMotorTorque = 200;
      jd.enableMotor = true;
      this.joint = world.CreateJoint(jd);
    } else {
      // 平移：轴=(dx,dy)（米）；lower=−|axis|、upper=0；state1 屏幕位移 = −(dx·32, dy·32)px（17/19/20/22 四号蓝图内核实测勘误，旧注释"(dx,dy)"符号相反）
      const jd = new B.b2PrismaticJointDef();
      jd.Initialize(this.body, groundBody, this.body.GetPosition(), new B.b2Vec2(def.dx, def.dy));
      const len = Math.hypot(def.dx, def.dy);
      jd.lowerTranslation = -len;
      jd.upperTranslation = 0;
      jd.enableLimit = true;
      jd.enableMotor = true;
      jd.motorSpeed = 0.5; // 创建值；运行时 updateState 置 ±2
      jd.maxMotorForce = 220;
      this.joint = world.CreateJoint(jd);
    }
  }

  /** 逐帧 update（原版 MovingPlatform.update @1679971-1680049）：转臂关节角限位硬钳——
   * GetJointAngleRadians() < lower → SetAngle(−lower)；> upper → SetAngle(−upper)（每帧回钳，
   * 抵消马达压限位的求解器软过冲，实测无此钳稳态 −91.257° vs oracle −90°）。关节角=−体角
   * （Initialize(平台,地面) 序），故 SetAngle 取反号；prismatic 无 GetJointAngleRadians，
   * oracle 以存在性短路，我方以 isRevolute 分支等价。 */
  update(): void {
    if (!this.isRevolute) return;
    const a = this.joint.GetJointAngleRadians();
    const lo = this.joint.GetLowerLimit();
    const hi = this.joint.GetUpperLimit();
    if (a < lo) this.body.SetAngle(-lo);
    else if (a > hi) this.body.SetAngle(-hi);
  }

  /** 信号驱动（原版 updateState：SetMotorSpeed ±2 + 唤醒小力） */
  updateState(_silent: boolean): void {
    const b = this.isRevolute && this.dthetaPositive ? -2 : 2;
    if (this.state === 0) this.joint.SetMotorSpeed(b);
    else this.joint.SetMotorSpeed(-b);
    this.body.ApplyForce(new this.B.b2Vec2(1, 0), new this.B.b2Vec2(0, 0));
  }

  signalApply(): void {
    this.updateState(false);
  }

  checkState(_events: MechEvent[]): void {
    /* 平台无 state 翻转（纯信号驱动） */
  }
}

// ---------------------------------------------------------------- Box / Ball

export interface PropBody {
  body: any;
  kind: "box" | "boxheavy" | "ball";
}

export function buildBox(B: B2, world: any, def: { x: number; y: number; rotation?: number }, heavy: boolean): PropBody {
  // level2 的 x,y 已是图块中心；boxWidth/Height 1.77（BoxHeavy 同几何，密度/圆摩擦不同）
  const size = 1.77;
  const center = phys(B, def.x, def.y);
  const bd = new B.b2BodyDef();
  bd.type = B.b2BodyType.b2_dynamicBody;
  bd.position = center;
  // 原版 Box 家族体角 = SetAngle(options.rotation)（bundle @1725729；forest_24_1 箱子 17.4°）
  bd.angle = ((def.rotation ?? 0) * Math.PI) / 180;
  const body = world.CreateBody(bd);
  // 八边形主体（切角 0.1；源码 push 后 reverse）
  const g = 0.1;
  const h = size / 2;
  const pts = [
    { x: -h + g, y: -h },
    { x: h - g, y: -h },
    { x: h, y: -h + g },
    { x: h, y: h - g },
    { x: h - g, y: h },
    { x: -h + g, y: h },
    { x: -h, y: h - g },
    { x: -h, y: -h + g },
  ].reverse();
  polygonFixture(body, B, pts, {
    friction: heavy ? 0.4 : 0.4, // properties.friction 缺省 0.4
    restitution: 0,
    density: heavy ? 0.8 : 0.45,
  });
  // 四角滚轮：r=0.1 @ ±(h−0.06)；cat17/mask4097；friction 0.1（heavy 0.05）
  const f = h - 0.06;
  for (const [cx, cy] of [
    [-f, -f],
    [f, -f],
    [-f, f],
    [f, f],
  ]) {
    circleFixture(body, B, 0.1, { x: cx, y: cy }, {
      categoryBits: FILTER.PROP_CAT,
      maskBits: 4097,
      friction: heavy ? 0.05 : 0.1,
      density: 0,
    });
  }
  // 传送门感应圆 0.1（森林无传送门，保留）
  circleFixture(body, B, 0.1, { x: 0, y: 0 }, {
    categoryBits: FILTER.PORTAL_CAT,
    maskBits: FILTER.PORTAL_MASK,
    friction: 0.5,
    density: 0,
    userData: { "portal-sensor": true },
  });
  body.SetLinearDamping(1);
  body.SetAngularDamping(20);
  return { body, kind: heavy ? "boxheavy" : "box" };
}

export function buildBall(B: B2, world: any, def: { x: number; y: number }): PropBody {
  // 原版偏移：x−=mpx(0.5)（−16px）、y+=mpx(0.65)（+20.8px）；def 已是图块中心 → 净同原始公式结果
  const center = phys(B, def.x - 16, def.y + 20.8);
  const bd = new B.b2BodyDef();
  bd.type = B.b2BodyType.b2_dynamicBody;
  bd.position = center;
  const body = world.CreateBody(bd);
  circleFixture(body, B, 0.4, undefined, {
    categoryBits: FILTER.PROP_CAT, // mask 缺省 65535
    friction: 0.2,
    restitution: 0.1,
    density: 2.3,
  });
  circleFixture(body, B, 0.1, { x: 0, y: 0 }, {
    categoryBits: FILTER.PORTAL_CAT,
    maskBits: FILTER.PORTAL_MASK,
    friction: 0.5,
    density: 0,
    userData: { "portal-sensor": true },
  });
  return { body, kind: "ball" };
}

// ---------------------------------------------------------------- Hanging / Pulley

export function buildHanging(B: B2, world: any, groundBody: any, def: { pts: Array<{ x: number; y: number }>; fullRotation?: boolean; barWidth?: number }): { anchor: any; platform: any } {
  const barWidth = def.barWidth ?? 3.2;
  const anchorPx = def.pts[0];
  const posPx = def.pts[1];
  // 锚点体（cat 0，不与任何东西碰撞），被 revolute 钉死在地面
  const abd = new B.b2BodyDef();
  abd.type = B.b2BodyType.b2_dynamicBody;
  abd.position = phys(B, anchorPx.x, anchorPx.y);
  const anchorBody = world.CreateBody(abd);
  // 锚点 fixture：原版 enable(g) 自带精灵矩形（hanging_anchor0000 帧 38×35px，Body 构造
  // setRectangleFromSprite），@1647143 仅改 categoryBits=0，density=1/摩擦 0.2 为插件缺省
  // → mass 1.2988 / I 0.2821。若零惯量（旧实现 density 0 小圆），joint2 的反扭矩通道为零，
  // 板心在世界系焊死、绳向钟摆自由度丢失（31 号档 §1.3 P0）
  boxFixture(anchorBody, B, 38 / 2 / 32, 35 / 2 / 32, { x: 0, y: 0 }, 0, {
    categoryBits: 0,
    density: 1,
    friction: 0.2,
    restitution: 0,
  });

  // 板体：六边形（m=barWidth/2，端尖 +0.1，半厚 0.12）；density 2.5 fr 0.4；阻尼 0.4/0.3
  const m = barWidth / 2;
  const n = m + 0.1;
  const pbd = new B.b2BodyDef();
  pbd.type = B.b2BodyType.b2_dynamicBody;
  pbd.position = phys(B, posPx.x, posPx.y);
  const platform = world.CreateBody(pbd);
  polygonFixture(platform, B, [
    { x: m, y: 0.12 },
    { x: -m, y: 0.12 },
    { x: -n, y: 0 },
    { x: -m, y: -0.12 },
    { x: m, y: -0.12 },
    { x: n, y: 0 },
  ], { categoryBits: 65535, maskBits: 65535, friction: 0.4, restitution: 0, density: 2.5 });
  platform.SetLinearDamping(0.4);
  platform.SetAngularDamping(0.3);

  // 关节 1：distance（绳长=anchor→pos 距离）
  const dd = new B.b2DistanceJointDef();
  dd.Initialize(anchorBody, platform, phys(B, anchorPx.x, anchorPx.y), phys(B, posPx.x, posPx.y));
  world.CreateJoint(dd);
  // 关节 2：revolute（anchor↔platform），限位 ±0.425π（fullRotation 无限位）。
  // 轴点 = 板位置点 pos（原版 Hanging @1646198：o.Initialize(g, p, f)，f=pxm(pos)）——
  // 板绕自身板心自转（挂绳末端的风车板），轴错用锚点会退化成钟摆锤、丢失自转自由度
  const rd = new B.b2RevoluteJointDef();
  rd.Initialize(anchorBody, platform, phys(B, posPx.x, posPx.y));
  if (!def.fullRotation) {
    rd.lowerAngle = -0.425 * Math.PI;
    rd.upperAngle = 0.425 * Math.PI;
    rd.enableLimit = true;
  }
  world.CreateJoint(rd);
  // 关节 3：revolute 钉死锚点
  const rd2 = new B.b2RevoluteJointDef();
  rd2.Initialize(groundBody, anchorBody, phys(B, anchorPx.x, anchorPx.y));
  world.CreateJoint(rd2);
  return { anchor: anchorBody, platform };
}

export function buildPulley(B: B2, world: any, def: { pts: Array<{ x: number; y: number }>; barWidth?: number }): { plat1: any; plat2: any } {
  const barWidth = def.barWidth ?? 2.7;
  const [b1, w1, w2, b2] = def.pts;
  // 轮锚点 = polyline 点上移 2m（y −64px）
  // 轮锚点：原版 polyline[1]/[2] + (x, y − mpx(2))，Device.mpx 带负号（=−64px）→
  // 实际 = y + 64px（polyline 点下方 2m）——此前误放上方，力学几何错致平衡位差 4.6m
  const anchor1 = { x: w1.x, y: w1.y + 64 };
  const anchor2 = { x: w2.x, y: w2.y + 64 };
  const mkBoard = (posPx: { x: number; y: number }) => {
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_dynamicBody;
    bd.position = phys(B, posPx.x, posPx.y);
    bd.fixedRotation = true;
    const body = world.CreateBody(bd);
    body.SetUserData("reactable");
    body.SetLinearDamping(0.1);
    const m = barWidth / 2;
    const n = m + 0.1;
    polygonFixture(body, B, [
      { x: m, y: 0.12 },
      { x: -m, y: 0.12 },
      { x: -n, y: 0 },
      { x: -m, y: -0.12 },
      { x: m, y: -0.12 },
      { x: n, y: 0 },
    ], { friction: 0.4, restitution: 0, density: 3 });
    return body;
  };
  const plat1 = mkBoard(b1);
  const plat2 = mkBoard(b2);
  const jd = new B.b2PulleyJointDef();
  jd.Initialize(plat1, plat2, phys(B, anchor1.x, anchor1.y), phys(B, anchor2.x, anchor2.y), plat1.GetPosition(), plat2.GetPosition(), 1);
  world.CreateJoint(jd);
  return { plat1, plat2 };
}

// ---------------------------------------------------------------- Roman

export function buildRoman(B: B2, world: any, groundBody: any, def: { pts: Array<{ x: number; y: number }> }): { bar: any; base: any } {
  // 点序分支（@1748499–1748767）：首段竖直 → m=2·pxm(p2x−p1x)、d=−atan(k/(m/2))；否则 m=2·pxm(p1x−p0x)、d=+atan(k/(m/2))
  // Device.pxm 带负号：pxm(a) = −a/32
  const rel = def.pts.map((p) => p); // 绝对坐标
  const p0 = rel[0];
  const p1 = rel[1];
  let m: number;
  let k: number;
  let d: number;
  if (def.pts.length >= 3 && def.pts[0].x === def.pts[1].x) {
    m = 2 * -(rel[2].x - rel[1].x) / 32;
    k = -(rel[1].y - rel[0].y) / 32;
    d = -Math.atan(k / (m / 2));
  } else {
    m = 2 * -(p1.x - p0.x) / 32;
    k = -(p1.y - p0.y) / 32;
    d = Math.atan(k / (m / 2));
  }
  // bar 挂点 h = 折线顶点 p1 绝对坐标本身。
  // 原版 @1748970: h = options.xy + poly[1] + (mpx(1), −mpx(1))，其中 options.xy = Tiled 位 + (32,−32)
  // 且 mpx(1) = −32 → ±32 相消，h = Tiled 位 + poly[1] = 绝对 p1（oracle dump 实证：r0 枢轴 (624,448)、底座立于 (624,512) 地板面）。
  const h = { x: p1.x, y: p1.y };
  // bar：动力学体，梯形 (±m/2, ∓0.3)（顶面内收 2m），SetAngle(d)
  const bd = new B.b2BodyDef();
  bd.type = B.b2BodyType.b2_dynamicBody;
  bd.position = phys(B, h.x, h.y);
  bd.angle = d || 0;
  const bar = world.CreateBody(bd);
  polygonFixture(bar, B, [
    { x: -m / 2, y: -0.3 },
    { x: m / 2, y: -0.3 },
    { x: m / 2 - 2, y: 0.3 },
    { x: -m / 2 + 2, y: 0.3 },
  ], {
    categoryBits: 1,
    maskBits: 65535,
    friction: 0.7,
    restitution: 0,
    density: 0.1,
  });
  // 底座：静态三角 (−1,0),(0,k),(1,0)，density 0.1，位置 (h.x, h.y + 32k px)
  const baseCenter = { x: h.x, y: h.y + 32 * k };
  const bbd = new B.b2BodyDef();
  bbd.type = B.b2BodyType.b2_staticBody;
  bbd.position = phys(B, baseCenter.x, baseCenter.y);
  const base = world.CreateBody(bbd);
  polygonFixture(base, B, [
    { x: -1, y: 0 },
    { x: 0, y: k },
    { x: 1, y: 0 },
  ], {
    categoryBits: 1,
    maskBits: 65535,
    friction: 0.7,
    restitution: 0,
    density: 0.1,
  });
  // revolute：bar↔底座 @bar 质心，无马达无限位
  const rd = new B.b2RevoluteJointDef();
  rd.Initialize(base, bar, bar.GetPosition());
  world.CreateJoint(rd);
  return { bar, base };
  void groundBody;
}

// ---------------------------------------------------------------- Wind

export class Wind {
  readonly body: any;
  readonly group: number;
  /** 原版 Wind 无 signal（bundle 38737/38827/39906 仅 Lever/LightPusher/Pusher/Beamer 持有）→ 纯跟随端 */
  readonly hasSignal = false;
  state: number;
  private readonly lengthM: number;
  private readonly windWidth: number;
  private readonly activeRoles = new Set<"fireboy" | "watergirl">();
  private readonly B: B2;

  constructor(B: B2, world: any, def: { rect: { x: number; y: number; w: number; h: number }; rotation: number; lengthM: number; windWidth?: number; initialState: number; group: number }) {
    this.B = B;
    this.group = def.group;
    this.state = def.initialState;
    this.lengthM = def.lengthM;
    this.windWidth = def.windWidth ?? 2.6;
    // 机身中心 = windBodyPos（BoxedDevice 矫正，金轨迹实证）
    const { x: cx, y: cy } = windBodyPos(def);
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_staticBody;
    bd.position = phys(B, cx, cy);
    bd.angle = (Math.PI * (def.rotation + 90)) / 180;
    this.body = world.CreateBody(bd);
    // 机身梯形（非 flat）：底 3.7m 顶 2.5m 高 0.6m，density 0.2 → mass 0（静态化）
    polygonFixture(this.body, B, [
      { x: -1.85, y: 0 },
      { x: 1.85, y: 0 },
      { x: 1.25, y: 0.6 },
      { x: -1.25, y: 0.6 },
    ], { friction: 0.4, restitution: 0, density: 0.2 });
    // 风柱传感器：宽 windWidth（原版 properties.windWidth ?? 2.6 @1734124），高 length，机身上方 0.5m 起
    const shape = new B.b2PolygonShape();
    shape.SetAsOrientedBox(this.windWidth / 2, this.lengthM / 2, new B.b2Vec2(0, this.lengthM / 2 + 0.5), 0);
    const fd = new B.b2FixtureDef();
    fd.shape = shape;
    fd.isSensor = true;
    fd.userData = { type: "wind" };
    this.body.CreateFixture(fd);
  }

  /** 接触回调（World 分发）：风柱内角色进出 */
  setActive(role: "fireboy" | "watergirl", active: boolean): void {
    if (active) this.activeRoles.add(role);
    else this.activeRoles.delete(role);
  }

  /** 组信号到达（原版 deviceChanged→_updateState）：原版仅刷可见性/音效，物理在 update() 直读
   * state（invertInput 数据集零使用）→ 内核无需动作。 */
  signalApply(): void {}

  /** 施力（每步 pre-Step；nowS=仿真时间秒，dtS=本步步长秒）。
   * 原版 update()（bundle beautified L59569，原字节 md5 d637cb8c… 已核）：
   * 力 = d×(1.2+0.2·sin(t/1000))×100×(1−|a|/length)（无钳制，dist>length 为负=吸回）；
   * 阻尼 = v × 0.975^(elapsed_ms/(1000/60))——**dt 加权**：elapsed=当步 dt 毫秒
   * （init L14704 每 tick 施行前赋值；L136-138 开发者注释随原 bundle 分发，非再分发者所加），
   * 指数即 dt_s×60；随后 15m/s 限速。
   * fixed 1/60 时指数恰=1（1/60·60===1 float 验证）→ ×0.975 与旧实现位级一致，
   * det/fixtures/真机 e2e 基线零漂移；可变 dt（dtsweep 谱）下阻尼随步长正确缩放。
   * 金轨迹实证（forest_03 f724-760）：金 fb 贴墙上升 4px/帧 vs 旧实现 2.1——阻尼/限速段在
   * 录制游戏内真实生效。 */
  applyForce(nowS: number, dtS: number): void {
    if (this.state !== 1) return;
    const dir = new this.B.b2Vec2(0, 1);
    dir.SelfRotateRadians(this.body.GetAngle());
    const bp = this.body.GetPosition();
    for (const [role, body] of this.charBodies) {
      if (!this.activeRoles.has(role as "fireboy" | "watergirl")) continue;
      const cp = body.GetPosition();
      const dist = Math.hypot(cp.x - bp.x, cp.y - bp.y);
      const f = (1.2 + 0.2 * Math.sin(nowS)) * 100 * (1 - dist / this.lengthM);
      // oracle 无钳制（bundle L59568-59569：1−dist/length 可为负=柱顶外吸回；dist 恒按算）
      body.ApplyForce(new this.B.b2Vec2(dir.x * f, dir.y * f), new this.B.b2Vec2(0, 0));
      // 全向阻尼：v × 0.975^(dt·60)（oracle 原文 0.975 ** (elapsed/(1000/60))，严格同式）
      // + 15 m/s 限速
      const v = body.GetLinearVelocity();
      v.SelfMul(0.975 ** (dtS * 60));
      const speed = Math.hypot(v.x, v.y);
      if (speed > 15) {
        v.SelfMul(15 / speed);
      }
      body.SetLinearVelocity(v);
    }
  }

  private charBodies: Array<[string, any]> = [];
  registerCharBodies(bodies: Array<[string, any]>): void {
    this.charBodies = bodies;
  }
}

// ---------------------------------------------------------------- Window

// 注意：原版 Window 设备引用的 WindowLeft/Right/Center0000 帧在其全部已发行图集（A/B）
// 中均不存在——原版运行时缺帧渲染空白，窗框对玩家本就是隐形墙。此处仅复刻静态碰撞体
// （friction 0.7 / cat 1 / mask 61695），客户端刻意不渲染（仅 forest_bonus_1 两处）。

export function buildWindow(B: B2, world: any, def: { rect: { x: number; y: number; w: number; h: number } }): void {
  // 静态盒（宽<高 交换逻辑同平台，森林数据 w=64 h=32 不触发）
  let w = def.rect.w / 32;
  let h = def.rect.h / 32;
  const cx = def.rect.x + def.rect.w / 2;
  const cy = def.rect.y + def.rect.h / 2;
  let rot = 0;
  if (w < h) {
    const t = w;
    w = h;
    h = t;
    rot = -Math.PI / 2;
  }
  const bd = new B.b2BodyDef();
  bd.type = B.b2BodyType.b2_staticBody;
  bd.position = phys(B, cx, cy);
  const body = world.CreateBody(bd);
  const shape = new B.b2PolygonShape();
  shape.SetAsOrientedBox(w / 2, h / 2, new B.b2Vec2(0, 0), rot);
  const fd = new B.b2FixtureDef();
  fd.shape = shape;
  fd.friction = 0.7;
  fd.restitution = 0;
  fd.density = 0;
  fd.filter.categoryBits = 1;
  fd.filter.maskBits = 61695;
  body.CreateFixture(fd);
}

// ---------------------------------------------------------------- 灯光神庙机关（第二部）

// 坐标约定沿用本文件头注：物理 = (−screen/32, −screen/32)，体角=+deg→rad（与 bundle SetAngle 同式）。
// 02号档：note/evidence/2026-10-25-light-temple/02号档-光机制反解.md（offset 级引用随行注）。

/** Beamer 光束分类回调（bundle @1629100 ReportFixture 逐字）：
 *  无 lp=不透明（记录命中，返回 fraction 继续裁剪）；transparent=穿透（返回 undefined=全射程）；
 *  normal/mirror=停束/反射，sensor 标记 iluminated/lightAt。返回值语义见 vendor b2World.RayCast。 */
function lightRaycast(B: B2, world: any, from: any, to: any, color: string): { point: any; normal: any | null; sensorLp: LightProperties | null } | null {
  let contact: { point: any; normal: any | null; sensorLp: LightProperties | null } | null = null;
  const cb = (fix: any, point: any, normal: any, fraction: number): number | undefined => {
    const ud = fix.GetUserData ? fix.GetUserData() : fix.m_userData;
    const lp: LightProperties | undefined = ud && typeof ud === "object" ? ud.lightProperties : undefined;
    if (!lp) {
      contact = { point: point.Clone(), normal: null, sensorLp: null };
      return fraction;
    }
    if (lp.type === "transparent") {
      if (lp.sensor) {
        lp.iluminated = color;
        lp.lightAt = { x: point.x, y: point.y };
      }
      return undefined;
    }
    if (lp.type === "normal") {
      contact = { point: point.Clone(), normal: null, sensorLp: lp.sensor ? lp : null };
      return fraction;
    }
    if (lp.type === "mirror") {
      contact = { point: point.Clone(), normal: normal.Clone(), sensorLp: lp.sensor ? lp : null };
      return fraction;
    }
    return undefined; // portal 等：light 数据未用
  };
  world.RayCast(cb, from, to);
  void B;
  return contact;
}

export class Beamer extends Device {
  readonly body: any;
  readonly color: string;
  /** 最近一次光束折线（物理米坐标；null=灭）。快照转屏幕 px 供客户端绘制 */
  beamPts: Array<{ x: number; y: number }> | null = null;
  private readonly worldRef: any;

  constructor(B: B2, world: any, def: BeamerDef) {
    super(B, def.group, false);
    this.worldRef = world;
    this.color = def.color;
    this.state = def.initialState; // 原版先 state=1 后 super 重置（=initialState，数据恒 1）
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_staticBody;
    bd.position = phys(B, def.x, def.y);
    bd.angle = (Math.PI * def.rotation) / 180;
    this.body = world.CreateBody(bd);
    // 发射座多边形（bundle @1626960 逐字；w=0.8 h=0.4）
    polygonFixture(this.body, B, [
      { x: 0, y: -0.8 / 2 - 0.6 },
      { x: 0, y: 0.8 / 2 + 0.6 },
      { x: -0.4, y: 0.8 / 2 },
      { x: -0.4, y: -0.8 / 2 },
    ], { categoryBits: 1, maskBits: 65535, friction: 0.7, restitution: 0, density: 0 });
  }

  updateState(_silent: boolean): void {
    /* 非信号端；state 由组派发（0=灭 1=亮），光束在 update 重算 */
  }

  checkState(_events: MechEvent[]): void {}

  /** 逐帧光束（bundle Beamer.update @1629930 逐字；≤11 折点） */
  update(): void {
    if (this.state !== 1) {
      this.beamPts = null;
      return;
    }
    const B = this.B;
    const p = this.body.GetPosition().Clone();
    let dir = new B.b2Vec2(-1, 0);
    dir.SelfRotateRadians(this.body.GetAngle());
    const pts: Array<{ x: number; y: number }> = [{ x: p.x, y: p.y }];
    for (let seg = 0; seg < 10 && pts.length < 11; seg++) {
      const from = p.Clone();
      const to = p.Clone().SelfAdd(dir.Clone().SelfMul(50));
      const hit = lightRaycast(B, this.worldRef, from, to, this.color);
      if (!hit) {
        // 世界四壁兜底（原版依赖边界墙恒命中）；无命中=安全断束
        pts.push({ x: to.x, y: to.y });
        break;
      }
      if (hit.sensorLp) {
        hit.sensorLp.iluminated = this.color;
        hit.sensorLp.lightAt = { x: hit.point.x, y: hit.point.y };
      }
      pts.push({ x: hit.point.x, y: hit.point.y });
      if (hit.normal) {
        // 反射（@1630033 逐字）：b=入射反向单位向量，f=法线×1（CrossVS），dir=b−2(b·f)f
        const bvec = from.Clone().SelfSub(to).SelfNormalize();
        const f = hit.normal.Clone().SelfCrossVS(1);
        dir = bvec.Clone().SelfSub(f.Clone().SelfMul(2 * bvec.Dot(f)));
        p.SetXY(hit.point.x, hit.point.y);
      } else {
        dir = null as unknown as B2["b2Vec2"]; // 停束
        break;
      }
    }
    this.beamPts = pts;
  }
}

export class RotMirror extends Device {
  readonly body: any;
  private joint: any;
  private readonly dir: number;

  constructor(B: B2, world: any, groundBody: any, def: RotMirrorDef) {
    super(B, def.group, false);
    this.dir = def.dir;
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_dynamicBody;
    bd.position = phys(B, def.x, def.y);
    bd.angle = (Math.PI * def.rotation) / 180;
    this.body = world.CreateBody(bd);
    // ①盒体 1.8×1.8 transparent（角色可站/推；bundle @1743260）
    boxFixture(this.body, B, 0.9, 0.9, { x: 0, y: 0 }, 0, {
      friction: 0.7,
      restitution: 0,
      density: 1,
      userData: { lightProperties: { type: "transparent" } as LightProperties },
    });
    // ②镜条 2×0.1 @45°（mirror）
    boxFixture(this.body, B, 1.0, 0.05, { x: 0, y: 0 }, Math.PI / 4, {
      friction: 0.7,
      restitution: 0,
      density: 0.2,
      userData: { lightProperties: { type: "mirror" } as LightProperties },
    });
    // ③④踏点圆帽 r=0.25 @盒角（bundle @1743395）
    circleFixture(this.body, B, 0.25, { x: 0.9 - 0.25, y: 0.9 - 0.25 }, { density: 1 });
    circleFixture(this.body, B, 0.25, { x: -(0.9 - 0.25), y: -(0.9 - 0.25) }, { density: 1 });
    // revolute 钳位（@1743400 逐字）：dir=1 → [−rot, −rot+π/2]，否则 [−rot−π/2, −rot]；motor 恒开 torque 100
    const rotRad = (Math.PI * def.rotation) / 180;
    const jd = new B.b2RevoluteJointDef();
    jd.Initialize(this.body, groundBody, this.body.GetWorldCenter());
    if (def.dir === 1) {
      jd.lowerAngle = -rotRad;
      jd.upperAngle = -rotRad + Math.PI / 2;
    } else {
      jd.lowerAngle = -rotRad - Math.PI / 2;
      jd.upperAngle = -rotRad;
    }
    jd.enableLimit = true;
    jd.maxMotorTorque = 100;
    jd.enableMotor = true;
    this.joint = world.CreateJoint(jd);
    // 初始角钉在对应限位（@1743413）
    this.body.SetAngle(def.dir === 1 ? -this.joint.GetLowerLimit() : -this.joint.GetUpperLimit());
  }

  updateState(_silent: boolean): void {
    // @1743524：state=0 → 马达 −1.5·dir；state=1 → +1.5·dir
    this.joint.SetMotorSpeed((this.state === 0 ? -1.5 : 1.5) * this.dir);
  }

  /** 逐帧钳角（@1743473；与 MovingPlatform.update 同式：关节角=−体角） */
  update(): void {
    const a = this.joint.GetJointAngleRadians();
    if (a < this.joint.GetLowerLimit()) this.body.SetAngle(-this.joint.GetLowerLimit());
    else if (a > this.joint.GetUpperLimit()) this.body.SetAngle(-this.joint.GetUpperLimit());
  }

  checkState(_events: MechEvent[]): void {}
}

export function buildBoxMirror(B: B2, world: any, def: BoxMirrorDef): { body: any } {
  // BoxPrototype（1.77 八边箱+四角滚轮，density 0.45）+ 箱体 lp=transparent + 45° 镜条 2×0.05
  const size = def.boxSize ?? 1.77;
  const center = phys(B, def.x, def.y);
  const bd = new B.b2BodyDef();
  bd.type = B.b2BodyType.b2_dynamicBody;
  bd.position = center;
  bd.angle = ((def.rotation ?? 0) * Math.PI) / 180;
  const body = world.CreateBody(bd);
  const g = 0.1;
  const h = size / 2;
  const pts = [
    { x: -h + g, y: -h },
    { x: h - g, y: -h },
    { x: h, y: -h + g },
    { x: h, y: h - g },
    { x: h - g, y: h },
    { x: -h + g, y: h },
    { x: -h, y: h - g },
    { x: -h, y: -h + g },
  ].reverse();
  polygonFixture(body, B, pts, {
    friction: def.friction ?? 0.4,
    restitution: 0,
    density: 0.45,
    userData: { lightProperties: { type: "transparent" } as LightProperties },
  });
  const f = h - 0.06;
  for (const [cx, cy] of [
    [-f, -f],
    [f, -f],
    [-f, f],
    [f, f],
  ]) {
    circleFixture(body, B, 0.1, { x: cx, y: cy }, {
      categoryBits: FILTER.PROP_CAT,
      maskBits: 4097,
      friction: 0.1,
      density: 0,
    });
  }
  circleFixture(body, B, 0.1, { x: 0, y: 0 }, {
    categoryBits: FILTER.PORTAL_CAT,
    maskBits: FILTER.PORTAL_MASK,
    friction: 0.5,
    density: 0,
    userData: { "portal-sensor": true },
  });
  // 镜条（bundle BoxMirror @1638591：2×0.05 @45°，friction 0 density 0，mirror）
  boxFixture(body, B, 1.0, 0.025, { x: 0, y: 0 }, Math.PI / 4, {
    friction: 0,
    restitution: 0,
    density: 0,
    userData: { lightProperties: { type: "mirror" } as LightProperties },
  });
  body.SetLinearDamping(1);
  body.SetAngularDamping(20);
  return { body };
}

export class InfiniteMirror extends Device {
  readonly body: any;
  private joint: any;

  constructor(B: B2, world: any, groundBody: any, def: InfiniteMirrorDef) {
    super(B, def.group, false);
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_dynamicBody;
    bd.position = phys(B, def.x, def.y);
    bd.angle = (Math.PI * def.rotation) / 180;
    this.body = world.CreateBody(bd);
    // 镜条 3×0.1 @45°（mirror；bundle @1749955）+ 双帽 r=0.3 @±1.1
    boxFixture(this.body, B, 1.5, 0.05, { x: 0, y: 0 }, Math.PI / 4, {
      friction: 0.7,
      restitution: 0,
      density: 0.2,
      userData: { lightProperties: { type: "mirror" } as LightProperties },
    });
    circleFixture(this.body, B, 0.3, { x: 1.1, y: 1.1 }, { density: 1 });
    circleFixture(this.body, B, 0.3, { x: -1.1, y: -1.1 }, { density: 1 });
    // revolute：enableLimit（初值 0,0）+ motor torque 500 speed 0（@1749860）
    const jd = new B.b2RevoluteJointDef();
    jd.Initialize(this.body, groundBody, this.body.GetWorldCenter());
    jd.enableLimit = true;
    jd.maxMotorTorque = 500;
    jd.motorSpeed = 0;
    jd.enableMotor = true;
    this.joint = world.CreateJoint(jd);
  }

  /** @1750060：SetLimits(state, state)——state=滑轨连续角或拉杆 0/1 */
  updateState(_silent: boolean): void {
    this.joint.SetLimits(this.state, this.state);
  }

  checkState(_events: MechEvent[]): void {}
}

export class LightPusher extends Device {
  readonly body: any;
  readonly color: string;
  private sensorLp: LightProperties;

  constructor(B: B2, world: any, def: LightPusherDef) {
    super(B, def.group, true); // 信号源（照到=1 / 光断=0 派发全组）
    this.color = def.color;
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_staticBody;
    bd.position = phys(B, def.x, def.y);
    bd.angle = (Math.PI * def.rotation) / 180;
    this.body = world.CreateBody(bd);
    // ①sensor 1.5×0.4（isSensor，normal+sensor；bundle @1657600）
    const box = new B.b2PolygonShape();
    box.SetAsOrientedBox(1.5 / 2, 0.4 / 2, new B.b2Vec2(0, 0), 0);
    this.sensorLp = { type: "normal", sensor: true, iluminated: null, lightAt: null };
    const sfd = new B.b2FixtureDef();
    sfd.shape = box;
    sfd.friction = 0.7;
    sfd.restitution = 0;
    sfd.density = 0;
    sfd.isSensor = true;
    sfd.userData = { lightProperties: this.sensorLp };
    this.body.CreateFixture(sfd);
    // ②梯形座 transparent（@1657700：±(w/2+0.5)@y0 → ±(w/2)@(h−0.1)）
    polygonFixture(this.body, B, [
      { x: -1 / 2 - 0.5, y: 0 },
      { x: 1 / 2 + 0.5, y: 0 },
      { x: 1 / 2, y: 0.4 - 0.1 },
      { x: -1 / 2, y: 0.4 - 0.1 },
    ], { friction: 0.7, restitution: 0, density: 0, userData: { lightProperties: { type: "transparent" } as LightProperties } });
  }

  updateState(_silent: boolean): void {
    /* 信号源 */
  }

  /** @1659550：照到同色→state=1+派发；光断→state=0+派发；随后清 iluminated（每帧） */
  checkState(events: MechEvent[]): void {
    if (this.state === 0 && this.sensorLp.iluminated === this.color) {
      this.state = 1;
      events.push({ kind: "lightpusher", group: this.group, state: 1 });
    } else if (this.state === 1 && this.sensorLp.iluminated !== this.color) {
      this.state = 0;
      events.push({ kind: "lightpusher", group: this.group, state: 0 });
    }
    this.sensorLp.iluminated = null;
  }
}

export class Slider extends Device {
  readonly body: any;
  private joint: any;
  private readonly widthPx: number;
  private readonly max: number;
  private lastT: number;

  constructor(B: B2, world: any, groundBody: any, def: SliderDef) {
    super(B, def.group, true); // 连续信号源
    this.widthPx = def.widthPx;
    this.max = def.max;
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_dynamicBody;
    bd.position = phys(B, def.x, def.y); // 解析层已居中（x+widthPx/2）
    this.body = world.CreateBody(bd);
    circleFixture(this.body, B, 0.3, undefined, {
      friction: 0,
      density: 2, // 插件缺省密度（bundle fixture 未设 density；探针待核 02号档 §10）
    });
    // prismatic：轴 (−1,0)，行程 ±pxm(o/2)（Device.pxm 取负 → upper=+o/64, lower=−o/64，@1720119）
    const o = def.widthPx;
    const jd = new B.b2PrismaticJointDef();
    jd.Initialize(this.body, groundBody, this.body.GetWorldCenter(), new B.b2Vec2(-1, 0));
    jd.upperTranslation = o / 64; // 原版 = −pxm(o/2)，Device.pxm(a)=−a/32 → +o/64
    jd.lowerTranslation = -o / 64; // 原版 = +pxm(o/2) → −o/64
    jd.enableLimit = true;
    jd.motorSpeed = 0;
    jd.maxMotorForce = 20;
    jd.enableMotor = true;
    this.joint = world.CreateJoint(jd);
    this.body.SetLinearDamping(1);
    this.lastT = this.joint.GetJointTranslation();
  }

  updateState(_silent: boolean): void {
    /* 信号源 */
  }

  /** @1721500：translation 变化才派发；state = π·t·max / pxm(−width)（pxm(−w)=+w/32） */
  checkState(events: MechEvent[]): void {
    const t = this.joint.GetJointTranslation();
    if (t === this.lastT) return;
    this.lastT = t;
    this.state = (Math.PI * t * this.max) / (this.widthPx / 32);
    events.push({ kind: "slider", group: this.group, state: this.state });
  }
}

// ---------------------------------------------------------------- 总装

export interface Mechanisms {
  manager: MechManager;
  levers: Lever[];
  pushers: Pusher[];
  platforms: MovingPlatform[];
  props: PropBody[];
  winds: Wind[];
  hangings: Array<{ anchor: any; platform: any }>;
  pulleys: Array<{ plat1: any; plat2: any }>;
  romans: Array<{ bar: any; base: any }>;
  // ---- 灯光神庙（forest 数据恒为空）----
  beamers: Beamer[];
  rotMirrors: RotMirror[];
  boxMirrors: Array<{ body: any }>;
  infiniteMirrors: InfiniteMirror[];
  lightPushers: LightPusher[];
  sliders: Slider[];
  /** 光设备统一创建序（world 按【逆序】逐帧步进——原版 sprite 更新序探针口径） */
  lightDevices: Array<{ order: number; beamer?: Beamer; rotMirror?: RotMirror; lightPusher?: LightPusher; slider?: Slider; infiniteMirror?: InfiniteMirror }>;
}

export function buildMechanisms(B: B2, world: any, groundBody: any, level: LevelData): Mechanisms {
  const manager = new MechManager();
  const levers: Lever[] = [];
  const pushers: Pusher[] = [];
  const platforms: MovingPlatform[] = [];
  const props: PropBody[] = [];
  const winds: Wind[] = [];
  const hangings: Array<{ anchor: any; platform: any }> = [];
  const pulleys: Array<{ plat1: any; plat2: any }> = [];
  const romans: Array<{ bar: any; base: any }> = [];

  for (const d of level.levers) {
    const l = new Lever(B, world, groundBody, d);
    levers.push(l);
    manager.register(l);
  }
  for (const d of level.pushers) {
    const p = new Pusher(B, world, groundBody, d);
    pushers.push(p);
    manager.register(p);
  }
  for (const d of level.platforms) {
    const p = new MovingPlatform(B, world, groundBody, d);
    platforms.push(p);
    manager.register(p);
  }
  for (const d of level.boxes) props.push(buildBox(B, world, d, d.heavy));
  for (const d of level.balls) props.push(buildBall(B, world, d));
  for (const d of level.hangings) hangings.push(buildHanging(B, world, groundBody, d));
  for (const d of level.pulleys) pulleys.push(buildPulley(B, world, d));
  for (const d of level.romans) romans.push(buildRoman(B, world, groundBody, d));
  for (const d of level.winds) {
    const w = new Wind(B, world, d);
    winds.push(w);
    // 原版 Wind 构造器末尾 this.registerDevice()（bundle 40590）→ 进组受拉杆/推杆联动
    manager.register(w);
  }
  for (const d of level.windows) buildWindow(B, world, d);

  // ---- 灯光神庙机关（创建序=Tiled 对象序，与 forest 机关同池装配）----
  const beamers: Beamer[] = [];
  const rotMirrors: RotMirror[] = [];
  const boxMirrors: Array<{ body: any }> = [];
  const infiniteMirrors: InfiniteMirror[] = [];
  const lightPushers: LightPusher[] = [];
  const sliders: Slider[] = [];
  const lightDevices: Mechanisms["lightDevices"] = [];
  for (const d of level.beamers) {
    const m = new Beamer(B, world, d);
    beamers.push(m);
    manager.register(m);
    lightDevices.push({ order: lightDevices.length, beamer: m });
  }
  for (const d of level.rotMirrors) {
    const m = new RotMirror(B, world, groundBody, d);
    rotMirrors.push(m);
    manager.register(m);
    lightDevices.push({ order: lightDevices.length, rotMirror: m });
  }
  for (const d of level.boxMirrors) boxMirrors.push(buildBoxMirror(B, world, d));
  for (const d of level.infiniteMirrors) {
    const m = new InfiniteMirror(B, world, groundBody, d);
    infiniteMirrors.push(m);
    manager.register(m);
    lightDevices.push({ order: lightDevices.length, infiniteMirror: m });
  }
  for (const d of level.lightPushers) {
    const m = new LightPusher(B, world, d);
    lightPushers.push(m);
    manager.register(m);
    lightDevices.push({ order: lightDevices.length, lightPusher: m });
  }
  for (const d of level.sliders) {
    const m = new Slider(B, world, groundBody, d);
    sliders.push(m);
    manager.register(m);
    lightDevices.push({ order: lightDevices.length, slider: m });
  }

  return { manager, levers, pushers, platforms, props, winds, hangings, pulleys, romans, beamers, rotMirrors, boxMirrors, infiniteMirrors, lightPushers, sliders, lightDevices };
}
