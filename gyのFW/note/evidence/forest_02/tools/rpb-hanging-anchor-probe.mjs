// rpb 探针：hanging 锚点体惯量语义对照（只读复用仓库源码，不改任何 .ts）
// 变体 A（ours 现状）= buildHanging 原样（锚点 fixture: circle r0.05 cat0 mask0 density0）
// 变体 B（原版对齐）= 同一构造逐行复制，唯锚点 fixture 换成原版 enable(g) 的精灵矩形
//   （MechAssets hanging_anchor0000 帧 38x35px → SetAsOrientedBox(19/32,17.5/32)，density1 fr0.2 rest0 cat0）
// 场景：锚 (384,264)、板 (384,408)（forest_02 h0 拓扑，fullRotation 语义→无限位），
//       1.77m 箱子空投板东端 (435,376)，逐帧记录板心位置与板角。
import { b2, polygonFixture, px2m } from "../../../../packages/shared/src/kernel/b2.js";
import { buildHanging, buildBox } from "../../../../packages/shared/src/kernel/mechanisms.js";

const B = b2();

function mkWorld() {
  const w = new B.b2World(new B.b2Vec2(0, -31.25), true);
  const gbd = new B.b2BodyDef();
  gbd.type = B.b2BodyType.b2_staticBody;
  const ground = w.CreateBody(gbd);
  return { w, ground };
}

// ours：直接调仓库 buildHanging（原样）
function buildA(w, ground) {
  return buildHanging(B, w, ground, { pts: [{ x: 384, y: 264 }, { x: 384, y: 408 }], fullRotation: true });
}

// original-faithful：逐行按原版 Hanging 构造（锚点矩形 fixture 是唯一差异）
function buildB(w, ground) {
  const anchorPx = { x: 384, y: 264 }, posPx = { x: 384, y: 408 };
  const abd = new B.b2BodyDef();
  abd.type = B.b2BodyType.b2_dynamicBody;
  abd.position = new B.b2Vec2(px2m(anchorPx.x), px2m(anchorPx.y));
  const anchor = w.CreateBody(abd);
  const shape = new B.b2PolygonShape();
  shape.SetAsOrientedBox(19 / 32, 17.5 / 32, new B.b2Vec2(0, 0), 0);
  const fd = new B.b2FixtureDef();
  fd.shape = shape;
  fd.friction = 0.2;   // 插件 world.friction 缺省
  fd.restitution = 0;  // 插件 world.restitution 缺省
  fd.density = 1;      // 插件 world.density 缺省
  fd.filter.categoryBits = 0; // 原版 @1647143 m_filter.categoryBits = 0
  anchor.CreateFixture(fd);

  const pbd = new B.b2BodyDef();
  pbd.type = B.b2BodyType.b2_dynamicBody;
  pbd.position = new B.b2Vec2(px2m(posPx.x), px2m(posPx.y));
  const platform = w.CreateBody(pbd);
  platform.SetLinearDamping(0.4);
  platform.SetAngularDamping(0.3);
  const m = 3.2 / 2, n = m + 0.1;
  polygonFixture(platform, B, [
    { x: m, y: 0.12 }, { x: -m, y: 0.12 }, { x: -n, y: 0 },
    { x: -m, y: -0.12 }, { x: m, y: -0.12 }, { x: n, y: 0 },
  ], { categoryBits: 65535, maskBits: 65535, friction: 0.4, restitution: 0, density: 2.5 });

  const e = new B.b2Vec2(px2m(anchorPx.x), px2m(anchorPx.y));
  const f = new B.b2Vec2(px2m(posPx.x), px2m(posPx.y));
  const dd = new B.b2DistanceJointDef();
  dd.Initialize(anchor, platform, e, f);
  w.CreateJoint(dd);
  const rd = new B.b2RevoluteJointDef();
  rd.Initialize(anchor, platform, f);           // 原版 @1648523（轴=板心，同 7024dd5 修复）
  w.CreateJoint(rd);
  const rd2 = new B.b2RevoluteJointDef();
  rd2.Initialize(anchor, ground, e);            // 原版 @1648883（body 序：锚, 地）
  w.CreateJoint(rd2);
  return { anchor, platform };
}

function run(tag, mk) {
  const { w, ground } = mkWorld();
  const { anchor, platform } = mk(w, ground);
  console.log(`[${tag}] anchor mass=${anchor.GetMass().toFixed(4)} inertia=${anchor.GetInertia().toFixed(4)} | board mass=${platform.GetMass().toFixed(4)}`);
  const box = buildBox(B, w, { x: 435, y: 376 }, false);
  box.body.SetTransformVecRadians ? null : null;
  const NONE = { up: false, left: false, right: false };
  for (let f = 1; f <= 240; f++) {
    w.Step(1 / 60, 8, 3);
    if (f % 30 === 0) {
      const p = platform.GetPosition(), a = platform.GetAngle() * 180 / Math.PI;
      const ap = anchor.GetAngle() * 180 / Math.PI;
      console.log(`  f${String(f).padStart(3)} board(${(p.x * -32).toFixed(1)},${(p.y * -32).toFixed(1)})px a=${a.toFixed(1)}° anchorA=${ap.toFixed(2)}°`);
    }
  }
}

run("A ours(density0 circle r0.05)", buildA);
run("B original(rect38x35 density1)", buildB);
