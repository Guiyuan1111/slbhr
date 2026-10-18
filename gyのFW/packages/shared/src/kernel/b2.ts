/**
 * box2d 内核 —— 引擎访问层。
 *
 * 引擎 = vendor/box2d.js（原版 init.js 字节级提取，Box2DFlash 2.1a 语义）。
 * 所有物理量以【米、秒、米/秒】工作；与屏幕像素的换算（原版 PointProxy 双取负，@505909）：
 *   physics = (−screenX/32, −screenY/32)，即 screen = (−32·bx, −32·by)。
 * 世界 y 轴向上（物理），重力 (0, −31.25)（= 1000px/s² ÷ 32）。
 *
 * 过滤常数全部来自源码逐字节证据（详见各处注释；Ground/character/Liquid/Device
 * 类区段原文存 TEMP/{ground,char,liquid,device,boxproto}-region.js）。
 */
import { loadBox2d } from "../box2d/load.js";

export type B2 = ReturnType<typeof loadBox2d>;

let cached: B2 | undefined;

/**
 * b2Timer 恒零遥测桩（r1 perf 件2，2026-10-18）：vendor 的 b2Timer 是纯遥测——
 * m_profile 只写不读（8 处赋值 + 2 处累加，GetProfile 全仓库无调用方）、
 * b2_toiTime/b2_toiCalls/b2_toiMaxTime 纯计数器，均不进任何物理分支（静态审计见
 * note/research/2026-10-18-perf-hotspot/01-hotspot.md §2.2/§3 #1）；而每步 12~13 次
 * `new Date().getTime()` + 等量时钟系统调用是剖析面最大免费项（idle self 13.4%、
 * replay 5.8%）。
 *
 * 求值后覆写（vendor 文件字节不动）：
 * - 原型方法 Reset/GetMilliseconds 恒零——vendor 求值期已创建的静态计时器
 *   （b2TimeOfImpact.s_timer / b2Island.s_timer）与此原型共享，一并覆盖；
 * - 构造器替换为免 new Date 的零桩，复用原原型（instanceof 语义不变）。
 *
 * 数值零依赖由实测背书：perf-determinism 48/48 位级一致 + fixture-runner 6/6。
 */
function stubB2TimerTelemetry(ns: B2): void {
  const proto = ns.b2Timer.prototype;
  proto.Reset = function (this: { m_start: number }) {
    this.m_start = 0;
    return this;
  };
  proto.GetMilliseconds = function () {
    return 0;
  };
  function ZeroTimer(this: { m_start: number }) {
    this.m_start = 0;
  }
  ZeroTimer.prototype = proto;
  ns.b2Timer = ZeroTimer;
}

export function b2(): B2 {
  if (!cached) {
    cached = loadBox2d();
    stubB2TimerTelemetry(cached);
  }
  return cached;
}

/** 原版碰撞过滤（categoryBits/maskBits，源码直证） */
export const FILTER = {
  /** 地面/液体/墙类静态体 fixture（createGroundFixture @ground-region） */
  GROUND_CAT: 1,
  GROUND_MASK: 4369, // 0x1111
  /** 角色（character 构造体：躯干/脚/梯形） */
  CHAR_CAT: 16,
  CHAR_MASK: 4353, // 0x1101：ground | platform(256) | portal(4096)
  /** 推箱/球的主体（BoxPrototype/Ball） */
  PROP_CAT: 17,
  /** 平台（research/01 §3.2：MovingPlatform category 256） */
  PLATFORM_CAT: 256,
  /** 传送门感应（portal-sensor 小圆） */
  PORTAL_CAT: 4096,
  PORTAL_MASK: 4096,
  /** 液体显示/光源带（Liquid sensorFixture） */
  LIQUID_SENSOR_MASK: 61695, // 0xF0FF：不含 bit8-11（bit8=平台 256）；实含角色 bit4
  /** 世界四壁（Phaser.Physics.Box2D.worldBoundsFilterCategory，vendor @setBounds） */
  WALL_CAT: 32768,
  WALL_MASK: 65535,
} as const;

/** 屏幕 px → 物理 m（取负，见文件头换算式） */
export function px2m(px: number): number {
  return -px / 32;
}

/** 物理 m → 屏幕 px */
export function m2px(m: number): number {
  return -m * 32;
}

export interface FixtureOptions {
  categoryBits?: number;
  maskBits?: number;
  groupIndex?: number;
  friction?: number;
  restitution?: number;
  density?: number;
  isSensor?: boolean;
  userData?: unknown;
}

/** b2FixtureDef 快捷构造（CreateFixture 只认 def，见前会话坑清单） */
export function makeFixtureDef(B: B2, opts: FixtureOptions & { shape?: unknown }): any {
  const fd = new B.b2FixtureDef();
  if (opts.shape !== undefined) fd.shape = opts.shape;
  if (opts.categoryBits !== undefined) fd.filter.categoryBits = opts.categoryBits;
  if (opts.maskBits !== undefined) fd.filter.maskBits = opts.maskBits;
  if (opts.groupIndex !== undefined) fd.filter.groupIndex = opts.groupIndex;
  if (opts.friction !== undefined) fd.friction = opts.friction;
  if (opts.restitution !== undefined) fd.restitution = opts.restitution;
  if (opts.density !== undefined) fd.density = opts.density;
  fd.isSensor = opts.isSensor ?? false;
  if (opts.userData !== undefined) fd.userData = opts.userData;
  return fd;
}

/** 多边形 fixture（顶点为物理坐标数组；CreateFixture(def)） */
export function polygonFixture(body: any, B: B2, pts: Array<{ x: number; y: number }>, opts: FixtureOptions): any {
  const shape = new B.b2PolygonShape();
  shape.Set(pts.map((p) => new B.b2Vec2(p.x, p.y)));
  return body.CreateFixture(makeFixtureDef(B, { shape, ...opts }));
}

/** 盒形 fixture（半宽半高，米；SetAsOrientedBox 语义） */
export function boxFixture(body: any, B: B2, hw: number, hh: number, center: { x: number; y: number }, angleRad: number, opts: FixtureOptions): any {
  const shape = new B.b2PolygonShape();
  shape.SetAsOrientedBox(hw, hh, new B.b2Vec2(center.x, center.y), angleRad);
  return body.CreateFixture(makeFixtureDef(B, { shape, ...opts }));
}

/** 圆 fixture（radius 米，圆心偏移 localOffset） */
export function circleFixture(body: any, B: B2, radius: number, localOffset: { x: number; y: number } | undefined, opts: FixtureOptions): any {
  const shape = new B.b2CircleShape(radius);
  if (localOffset) shape.m_p.SetXY(localOffset.x, localOffset.y);
  return body.CreateFixture(makeFixtureDef(B, { shape, ...opts }));
}
