// rpb 探针2：横向冲量下 rope 摆动自由度对照（无限位关闭，用 forest_19 语义 ±0.425π 限位）
import { b2, polygonFixture, px2m } from "../../../../packages/shared/src/kernel/b2.js";
import { buildHanging } from "../../../../packages/shared/src/kernel/mechanisms.js";

const B = b2();
function mkWorld() {
  const w = new B.b2World(new B.b2Vec2(0, -31.25), true);
  const gbd = new B.b2BodyDef();
  gbd.type = B.b2BodyType.b2_staticBody;
  return { w, ground: w.CreateBody(gbd) };
}
function buildB(w, ground) {
  const anchorPx = { x: 384, y: 264 }, posPx = { x: 384, y: 408 };
  const abd = new B.b2BodyDef();
  abd.type = B.b2BodyType.b2_dynamicBody;
  abd.position = new B.b2Vec2(px2m(anchorPx.x), px2m(anchorPx.y));
  const anchor = w.CreateBody(abd);
  const shape = new B.b2PolygonShape();
  shape.SetAsOrientedBox(19 / 32, 17.5 / 32, new B.b2Vec2(0, 0), 0);
  const fd = new B.b2FixtureDef();
  fd.shape = shape; fd.friction = 0.2; fd.restitution = 0; fd.density = 1; fd.filter.categoryBits = 0;
  anchor.CreateFixture(fd);
  const pbd = new B.b2BodyDef();
  pbd.type = B.b2BodyType.b2_dynamicBody;
  pbd.position = new B.b2Vec2(px2m(posPx.x), px2m(posPx.y));
  const platform = w.CreateBody(pbd);
  platform.SetLinearDamping(0.4); platform.SetAngularDamping(0.3);
  const m = 1.5, n = m + 0.1;
  polygonFixture(platform, B, [
    { x: m, y: 0.12 }, { x: -m, y: 0.12 }, { x: -n, y: 0 },
    { x: -m, y: -0.12 }, { x: m, y: -0.12 }, { x: n, y: 0 },
  ], { categoryBits: 65535, maskBits: 65535, friction: 0.4, restitution: 0, density: 2.5 });
  const e = new B.b2Vec2(px2m(anchorPx.x), px2m(anchorPx.y));
  const f = new B.b2Vec2(px2m(posPx.x), px2m(posPx.y));
  const dd = new B.b2DistanceJointDef(); dd.Initialize(anchor, platform, e, f); w.CreateJoint(dd);
  const rd = new B.b2RevoluteJointDef();
  rd.Initialize(anchor, platform, f);
  rd.lowerAngle = (-0.85 * Math.PI) / 2; rd.upperAngle = (0.85 * Math.PI) / 2; rd.enableLimit = true;
  w.CreateJoint(rd);
  const rd2 = new B.b2RevoluteJointDef(); rd2.Initialize(anchor, ground, e); w.CreateJoint(rd2);
  return { anchor, platform };
}
function run(tag, mk) {
  const { w, ground } = mkWorld();
  const { anchor, platform } = mk(w, ground);
  // t=0 给板心 +x 方向 8 N·s 冲量（模拟角色横跳落板）
  platform.ApplyLinearImpulse(new B.b2Vec2(8, 0), platform.GetPosition(), true);
  for (let f = 1; f <= 180; f++) {
    w.Step(1 / 60, 8, 3);
    if (f % 30 === 0) {
      const p = platform.GetPosition();
      console.log(`  f${String(f).padStart(3)} board(${(p.x * -32).toFixed(1)},${(p.y * -32).toFixed(1)})px ropeDeg=${(anchor.GetAngle() * 180 / Math.PI).toFixed(2)} boardA=${(platform.GetAngle() * 180 / Math.PI).toFixed(1)}°`);
    }
  }
}
console.log("[A ours buildHanging 原样（barWidth3.2 限位±0.425π）]");
run("A", (w, g) => buildHanging(B, w, g, { pts: [{ x: 384, y: 264 }, { x: 384, y: 408 }] }));
console.log("[B original-faithful 锚点(38x35 density1) 同限位]");
run("B", buildB);
