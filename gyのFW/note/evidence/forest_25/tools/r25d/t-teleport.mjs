// r25d t：teleport 可行性测试 —— body.SetTransform 是否可用于探针快进
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const w = makeWorld("forest_25");
for (let i = 0; i < 10; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
const fb = w.players.fireboy;
const B = w.B ?? null;
console.log("body proto has SetTransform:", typeof fb.body.SetTransform);
try {
  // 放到吊板上方 (770,690)，速度 vy=+100 落板（屏幕→物理双轴取负 /32）
  const B = globalThis.box2d;
  fb.body.SetTransformVecRadians(new B.b2Vec2(-770 / 32, -690 / 32), 0);
  fb.body.SetLinearVelocity(new B.b2Vec2(0, -100 / 32));
  fb.body.SetLinearVelocity({ x: 0, y: 100 / 32 });
  for (let i = 0; i < 30; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
  const p = w.snapshotPlayer("fireboy");
  console.log(`after tp+30f: (${px(p.x)},${px(p.y)}) v=(${px(p.vx)},${px(p.vy)}) ${p.anim} dead=${p.dead}`);
  const h = w.mechSnapshot().hangings[0];
  console.log(`board: (${px(h.x)},${px(h.y)}) ang=${h.angle.toFixed(4)}`);
} catch (e) {
  console.log("teleport failed:", e.message);
}
