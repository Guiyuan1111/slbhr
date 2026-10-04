/**
 * vendored Box2D bundle 的加载与数值冒烟测试。
 *
 * 断言的是"引擎可用性 + 积分器语义"两条基线；对拍金轨迹差分属于后续里程碑（不在此文件）。
 * 半隐式欧拉基线：g=31.25 m/s²、h=1/60、60 步自由落体位移
 *   Δ = g·h²·n(n+1)/2 = 31.25/3600 × 1830 = 15.8854166… m
 * 顶点 y = 1 − Δ = −14.8854（px 换算 ×32 = −476.33）。
 */
import { describe, expect, it } from "vitest";
import { loadBox2d } from "@fw/shared/box2d";

const B = loadBox2d();

describe("vendored box2d bundle", () => {
  it("导出内核所需的类", () => {
    for (const name of [
      "b2World", "b2Body", "b2BodyDef", "b2FixtureDef", "b2Fixture",
      "b2Vec2", "b2PolygonShape", "b2CircleShape",
      "b2RevoluteJointDef", "b2PrismaticJointDef", "b2DistanceJointDef",
      "b2BodyType", "b2Settings",
    ]) {
      expect(B[name], `缺少 ${name}`).toBeTruthy();
    }
  });

  it("body 类型枚举与 Flash 2.1a 一致（static=0/kinematic=1/dynamic=2）", () => {
    expect(B.b2BodyType.b2_staticBody).toBe(0);
    expect(B.b2BodyType.b2_kinematicBody).toBe(1);
    expect(B.b2BodyType.b2_dynamicBody).toBe(2);
  });

  it("自由落体 1 秒 = 15.8854 m（半隐式欧拉基线，先速度后位置）", () => {
    const world = new B.b2World(new B.b2Vec2(0, -31.25), true);
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_dynamicBody;
    bd.position = new B.b2Vec2(0, 1);
    const body = world.CreateBody(bd);
    const shape = new B.b2PolygonShape();
    shape.SetAsBox(0.5, 0.5);
    const fd = new B.b2FixtureDef();
    fd.shape = shape;
    fd.density = 1;
    body.CreateFixture(fd);
    for (let i = 0; i < 60; i++) world.Step(1 / 60, 8, 3);
    expect(body.GetPosition().y.toFixed(4)).toBe("-14.8854");
    expect(body.GetLinearVelocity().y.toFixed(3)).toBe("-31.250");
  });

  it("静态地面上的动态体：落地后停稳且不穿透", () => {
    const world = new B.b2World(new B.b2Vec2(0, -31.25), true);
    const gbd = new B.b2BodyDef();
    gbd.type = B.b2BodyType.b2_staticBody;
    gbd.position = new B.b2Vec2(0, 0);
    const ground = world.CreateBody(gbd);
    const gs = new B.b2PolygonShape();
    gs.SetAsBox(10, 0.5);
    const gfd = new B.b2FixtureDef();
    gfd.shape = gs;
    ground.CreateFixture(gfd);
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_dynamicBody;
    bd.position = new B.b2Vec2(0, 1.5);
    const body = world.CreateBody(bd);
    const shape = new B.b2PolygonShape();
    shape.SetAsBox(0.5, 0.5);
    const fd = new B.b2FixtureDef();
    fd.shape = shape;
    fd.density = 1;
    fd.friction = 0.5;
    body.CreateFixture(fd);
    for (let i = 0; i < 240; i++) world.Step(1 / 60, 8, 3);
    // 盒半高 0.5 立于地面上表面 0.5 → 中心平衡位 y=1.0；
    // Box2D 位置修正保留 linearSlop 级残余穿透/回弹（实测 ~0.024m），容差 0.03
    expect(Math.abs(body.GetPosition().y - 1.0)).toBeLessThan(0.03);
    expect(Math.abs(body.GetLinearVelocity().y)).toBeLessThan(0.5);
  });
});
