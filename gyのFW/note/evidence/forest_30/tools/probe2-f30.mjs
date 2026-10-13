// debug: 液体致死/传送/板1载人异常定位
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const inp = { fireboy: {}, watergirl: {} };
const teleport = (w, role, x, y) => {
  const b = w.chars[role].body;
  const Vec2 = b.GetPosition().constructor;
  b.SetTransformVecRadians(new Vec2(-x / 32, -y / 32), 0);
  b.SetLinearVelocity(new Vec2(0, 0));
  b.SetAwake(true);
};

// T1: 传送 fb (384,208) 逐步看体心/速度/事件
{
  const w = makeWorld("forest_30");
  const body = w.chars.fireboy.body;
  teleport(w, "fireboy", 384, 208);
  console.log("[T1] teleport后 body=", body.GetPosition().x * -32, body.GetPosition().y * -32, "vy=", body.GetLinearVelocity().y);
  for (let f = 0; f < 8; f++) {
    const evs = w.step(1 / 60, inp);
    const p = body.GetPosition();
    console.log(`[T1] f${f}: body=(${(p.x * -32).toFixed(2)},${(p.y * -32).toFixed(2)}) vy=${body.GetLinearVelocity().y.toFixed(3)} snap=`, JSON.stringify(w.snapshotPlayer("fireboy")), "ev=", JSON.stringify(evs));
  }
}
// T2: 不传送，fb 直接走跳？看正常坠落速度（出生即落 32px）
{
  const w = makeWorld("forest_30");
  const body = w.chars.fireboy.body;
  for (let f = 0; f < 8; f++) {
    const evs = w.step(1 / 60, inp);
    const p = body.GetPosition();
    if (f < 3) console.log(`[T2] f${f}: body=(${(p.x * -32).toFixed(2)},${(p.y * -32).toFixed(2)}) vy=${body.GetLinearVelocity().y.toFixed(3)} snap=`, JSON.stringify(w.snapshotPlayer("fireboy")));
  }
}
// T3: wg 传送进 W3 水体正中 (928,750)，小步长看死亡
{
  const w = makeWorld("forest_30");
  teleport(w, "watergirl", 928, 750);
  for (let f = 0; f < 30; f++) {
    const evs = w.step(1 / 60, inp);
    const p = w.snapshotPlayer("watergirl");
    if (f < 6 || p.dead) console.log(`[T3] f${f}: snap=`, JSON.stringify(p), "ev=", JSON.stringify(evs), "phase=", w.phase);
    if (p.dead) break;
  }
}
// T4: fb 传送站板1（无箱侧）精确落点与板响应，240f
{
  const w = makeWorld("forest_30");
  const M = w.mechanisms;
  for (let f = 0; f < 240; f++) w.step(1 / 60, inp);
  const box = M.props[1].body, Vec2 = box.GetPosition().constructor;
  box.SetTransformVecRadians(new Vec2(-200 / 32, -100 / 32), 0);
  box.SetLinearVelocity(new Vec2(0, 0)); box.SetAwake(true);
  for (let f = 0; f < 60; f++) w.step(1 / 60, inp);
  const sy1 = M.pulleys[0].plat1.GetPosition().y * -32;
  const sy2 = M.pulleys[0].plat2.GetPosition().y * -32;
  console.log(`[T4] 箱移走60f后 plat1=${sy1.toFixed(2)} plat2=${sy2.toFixed(2)}`);
  teleport(w, "fireboy", 336, 570);
  for (let f = 0; f < 240; f++) {
    w.step(1 / 60, inp);
    if (f % 40 === 0) {
      const p = w.snapshotPlayer("fireboy");
      const b = w.chars.fireboy.body.GetPosition();
      console.log(`[T4] f${f}: fb snap=(${p.x.toFixed(1)},${p.y.toFixed(1)}) body=(${(b.x * -32).toFixed(1)},${(b.y * -32).toFixed(1)}) vy=${w.chars.fireboy.body.GetLinearVelocity().y.toFixed(2)} plat1=${(M.pulleys[0].plat1.GetPosition().y * -32).toFixed(2)} plat2=${(M.pulleys[0].plat2.GetPosition().y * -32).toFixed(2)}`);
    }
  }
}
console.log("done");
