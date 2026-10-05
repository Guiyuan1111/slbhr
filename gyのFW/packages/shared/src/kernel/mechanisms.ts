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
import type { LevelData } from "../level2.js";
import type { B2 } from "./b2.js";
import { circleFixture, FILTER, polygonFixture, px2m } from "./b2.js";

/** 屏幕像素点 → 物理 vec（新建 b2Vec2） */
function phys(B: B2, x: number, y: number): any {
  return new B.b2Vec2(-x / 32, -y / 32);
}

/** 机关事件（世界层转发为 WorldEvent / sfx） */
export type MechEvent =
  | { kind: "lever"; group: number; state: number }
  | { kind: "pusher"; group: number; state: number };

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

  /** 原版 deviceChanged：组内信号源 state 取 OR → 赋给非信号设备 */
  deviceChanged(): void {
    for (const list of this.groups.values()) {
      const sources = list.filter((d) => d.hasSignal);
      if (sources.length === 0) continue;
      const g = sources.some((d) => d.state !== 0) ? 1 : 0;
      for (const d of list) {
        if (!d.hasSignal && d.state !== g) {
          d.state = g;
          d.signalApply();
        }
      }
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

    // revolute：支点 = 质心(GetWorldCenter) − 0.7m（原版 @1693630 用 GetWorldCenter；质心=fixture 中心，
    // 在 origin 上方 0.55m，故支点在 origin 下方仅 0.15m/4.8px——此前误用 origin−0.7m 致支点低 17.6px）；
    // Initialize 参数顺序与原版一致（bodyA=杆）：关节角 = −杆角，翻转/马达符号语义随之正确
    const wc = this.body.GetWorldCenter();
    const pivot = new B.b2Vec2(wc.x, wc.y - 0.7);
    const jd = new B.b2RevoluteJointDef();
    jd.Initialize(this.body, groundBody, pivot);
    jd.lowerAngle = -0.2 * Math.PI;
    jd.upperAngle = 0.2 * Math.PI;
    jd.enableLimit = true;
    jd.maxMotorTorque = 10;
    jd.enableMotor = true;
    jd.motorSpeed = 0; // 初值 0：未扳动不回弹（@1693931）
    this.joint = world.CreateJoint(jd);

    // startPos 定初始倾角：−1 → 下限，+1 → 上限
    if (def.startPos === -1) this.body.SetAngle(this.joint.GetLowerLimit());
    else this.body.SetAngle(this.joint.GetUpperLimit());
  }

  updateState(_silent: boolean): void {
    /* 拉杆不接收组信号（信号源） */
  }

  checkState(events: MechEvent[]): void {
    // 原版 checkState @1694485 逐条直译（关节角 = −杆角，随 Initialize 顺序自动正确）：
    // state==0 && 关节角×onis<0 → state=1，马达 −4·onis；state==1 && 关节角×onis>0 → state=0，马达 +4·onis。
    // 杆停所在侧（正侧=0/负侧=1），马达把杆压向所在侧限位；玩家对抗 10 N·m 扳过零即翻转。
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
    // 梯形：底 2m、顶 1m、高 0.6m（局部 y 0→0.6，物理向上）
    // 原版顶点（Pusher @1745895，w=1,h=0.6）：底 ±1、顶 ±0.5——此前误写 ±1.5 致碰撞面宽 1m
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

    // prismatic：bodyA=按钮、bodyB=地面，轴 (0,1)，行程 [0, 0.7]（translation=下沉深度）
    const jd = new B.b2PrismaticJointDef();
    jd.Initialize(this.body, groundBody, center, new B.b2Vec2(0, 1));
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

  constructor(B: B2, world: any, groundBody: any, def: { x: number; y: number; w: number; h: number; dx: number; dy: number; group: number; dtheta?: number; offsetY?: number }) {
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
      cx += def.w / 2; // 原版 swap 后 x += 原 w/2（此前写反，竖直平台碰撞体偏 48px）
      cy += def.h / 2; // y += 原 h/2
      shapeRotation = -Math.PI / 2;
    } else {
      cx += def.w / 2;
      cy += def.h / 2;
    }

    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_dynamicBody;
    bd.position = phys(B, cx, cy);
    bd.angle = shapeRotation;
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
      jd.Initialize(groundBody, this.body, anchor);
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
      // 平移：轴=(dx,dy)（米）；lower=−|axis|、upper=0；state1 = 原位+(dx,dy)（屏幕）
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

export function buildBox(B: B2, world: any, def: { x: number; y: number }, heavy: boolean): PropBody {
  // level2 的 x,y 已是图块中心；boxWidth/Height 1.77（BoxHeavy 同几何，密度/圆摩擦不同）
  const size = 1.77;
  const center = phys(B, def.x, def.y);
  const bd = new B.b2BodyDef();
  bd.type = B.b2BodyType.b2_dynamicBody;
  bd.position = center;
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
  circleFixture(anchorBody, B, 0.05, undefined, { categoryBits: 0, maskBits: 0, density: 0 });

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
  ], { friction: 0.4, restitution: 0, density: 2.5 });
  platform.SetLinearDamping(0.4);
  platform.SetAngularDamping(0.3);

  // 关节 1：distance（绳长=anchor→pos 距离）
  const dd = new B.b2DistanceJointDef();
  dd.Initialize(anchorBody, platform, phys(B, anchorPx.x, anchorPx.y), phys(B, posPx.x, posPx.y));
  world.CreateJoint(dd);
  // 关节 2：revolute（anchor↔platform），限位 ±0.425π（fullRotation 无限位）
  const rd = new B.b2RevoluteJointDef();
  rd.Initialize(anchorBody, platform, phys(B, anchorPx.x, anchorPx.y));
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
  // bar 挂点 h = p1 + (−32px, +32px)
  const h = { x: p1.x - 32, y: p1.y + 32 };
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
  state: number;
  private readonly lengthM: number;
  private readonly activeRoles = new Set<"fireboy" | "watergirl">();
  private readonly B: B2;

  constructor(B: B2, world: any, def: { rect: { x: number; y: number; w: number; h: number }; rotation: number; lengthM: number; initialState: number; group: number }) {
    this.B = B;
    this.group = def.group;
    this.state = def.initialState;
    this.lengthM = def.lengthM;
    // 机身中心（原版 BoxedDevice 矫正，金轨迹实证）：boxSize={x:−3,y:2} 经插件 mpx(正)→
    // e=(−48,+32)px，按 −(rotation+90)° 旋转；center = (原始x + e.x, 原始底边y − e.y)。
    // level2 的 rect.y 已换算顶边 → 底边 = rect.y + rect.h
    const rotDeg = def.rotation + 90;
    const eAng = (-rotDeg * Math.PI) / 180;
    const ex = -48 * Math.cos(eAng) - 32 * Math.sin(eAng);
    const ey = -48 * Math.sin(eAng) + 32 * Math.cos(eAng);
    const cx = def.rect.x + ex;
    const cy = def.rect.y + def.rect.h - ey;
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
    // 风柱传感器：宽 windWidth 2.6，高 length，从机身上方 0.5m 起
    const shape = new B.b2PolygonShape();
    shape.SetAsOrientedBox(2.6 / 2, this.lengthM / 2, new B.b2Vec2(0, this.lengthM / 2 + 0.5), 0);
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

  /** 施力（每步 pre-Step；nowS=仿真时间秒）。原版阻尼/限速段为镜像注入，不复刻。 */
  applyForce(nowS: number): void {
    if (this.state !== 1) return;
    const dir = new this.B.b2Vec2(0, 1);
    dir.SelfRotateRadians(this.body.GetAngle());
    const bp = this.body.GetPosition();
    for (const [role, body] of this.charBodies) {
      if (!this.activeRoles.has(role as "fireboy" | "watergirl")) continue;
      const cp = body.GetPosition();
      const dist = Math.hypot(cp.x - bp.x, cp.y - bp.y);
      const f = (1.2 + 0.2 * Math.sin(nowS)) * 100 * Math.max(0, 1 - dist / this.lengthM);
      body.ApplyForce(new this.B.b2Vec2(dir.x * f, dir.y * f), new this.B.b2Vec2(0, 0));
    }
  }

  private charBodies: Array<[string, any]> = [];
  registerCharBodies(bodies: Array<[string, any]>): void {
    this.charBodies = bodies;
  }
}

// ---------------------------------------------------------------- Window

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
  for (const d of level.winds) winds.push(new Wind(B, world, d));
  for (const d of level.windows) buildWindow(B, world, d);

  return { manager, levers, pushers, platforms, props, winds, hangings, pulleys, romans };
}
