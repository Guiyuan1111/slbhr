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

export function b2(): B2 {
  if (!cached) cached = loadBox2d();
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
  LIQUID_SENSOR_MASK: 61695, // 0xF0FF：不含角色 bit4
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
