import { b2 } from "/home/gy/桌面/dev/slbhr/gyのFW/packages/shared/src/kernel/b2.js";
import { Lever } from "/home/gy/桌面/dev/slbhr/gyのFW/packages/shared/src/kernel/mechanisms.js";
const B = b2();
const world = new B.b2World(new B.b2Vec2(0, -31.25), true);
const gbd = new B.b2BodyDef(); gbd.type = B.b2BodyType.b2_staticBody;
const ground = world.CreateBody(gbd);
const lv = new Lever(B, world, ground, { x: 424, y: 320, group: 0, onis: -1, startPos: 1 });
console.log("t=0 angle(deg):", lv.body.GetAngle() * 180 / Math.PI, "pivot world:", (() => { const wc = lv.body.GetWorldCenter(); return { x: wc.x, y: wc.y - 0.7 }; })(), "body pos:", (() => { const p = lv.body.GetPosition(); return { x: -32 * p.x, y: -32 * p.y }; })());
for (let i = 0; i <= 600; i++) {
  world.Step(1 / 60, 8, 3);
  lv.checkState([]);
  if (i % 120 === 0) console.log(`t=${(i / 60).toFixed(1)}s angle(deg):`, (lv.body.GetAngle() * 180 / Math.PI).toFixed(3), "jointAngle(deg):", (lv.joint.GetJointAngleRadians() * 180 / Math.PI).toFixed(3), "state:", lv.state);
}
// 再测 startPos=-1 / onis=+1
const lv2 = new Lever(B, world, ground, { x: 816, y: 514, group: 2, onis: 1, startPos: -1 });
for (let i = 0; i <= 600; i++) { world.Step(1 / 60, 8, 3); lv.checkState([]); lv2.checkState([]); if (i % 300 === 0) console.log(`lv2 t=${(i / 60).toFixed(1)}s angle(deg):`, (lv2.body.GetAngle() * 180 / Math.PI).toFixed(3), "state:", lv2.state); }
