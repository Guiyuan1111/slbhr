/**
 * P-03 roman 跷跷板动力学探针。
 *  R1: 无载静止态（plank 两端位置/角度 随时间）。
 *  R2: 玩家从 mega 平台走上 plank（西端登板）东行——板如何转、玩家到哪。
 *  R3: 玩家站东端锚定 + 第二玩家西行（双角色协作）。
 *  R4: 箱子从 NE 台西缘推落——落点/板反应。
 * 运行：node --import tsx TEMP/p03r/probe-roman.mjs
 */
import { makeWorld } from "../../../../../scripts/e2e/routetool/kernel.mjs";

const IDLE = { up: false, left: false, right: false };
const HALF = 35.5;
const snap = (w, role) => w.snapshotPlayer(role);

function plankEnds(w) {
  const bar = w.mechs.romans[0].bar;
  const p = bar.GetPosition();
  const a = bar.GetAngle();
  const half = 208 / 32; // m
  const c = Math.cos(a), s = Math.sin(a);
  const e1 = { x: p.x + half * c, y: p.y + half * s };
  const e2 = { x: p.x - half * c, y: p.y - half * s };
  const px = (v) => +(-v.x * 32).toFixed(0);
  const py = (v) => +(-v.y * 32).toFixed(0);
  return { angleDeg: +((-a * 180 / Math.PI)).toFixed(1), endA: [px(e1), py(e1)], endB: [px(e2), py(e2)] };
}

function tp(w, role, x, feetY) {
  const c = w.players[role];
  const V = c.body.GetPosition().constructor;
  c.body.SetPosition(new V(-x / 32, -(feetY - HALF) / 32));
  c.body.SetLinearVelocity(new V(0, 0));
}

// R1 静止态
{
  const w = makeWorld("forest_14");
  for (let f = 0; f < 400; f++) w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE });
  console.log("R1 静止:", JSON.stringify(plankEnds(w)));
}

// R2 fb 从西端登板东行
{
  const w = makeWorld("forest_14");
  for (let f = 0; f < 200; f++) w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE });
  tp(w, "fireboy", 620, 410);
  const log = [];
  for (let f = 0; f < 400; f++) {
    const i = { ...IDLE, right: true };
    w.step(1 / 60, { fireboy: i, watergirl: IDLE });
    if (f % 30 === 0) {
      const s = snap(w, "fireboy");
      log.push({ f, x: +s.x.toFixed(0), feet: +(s.y + HALF).toFixed(0), ...plankEnds(w) });
    }
    const s2 = snap(w, "fireboy");
    if (f > 60 && Math.abs(s2.vx) < 3 && Math.abs(s2.vy) < 3) { log.push({ f, REST: true, x: +s2.x.toFixed(0), feet: +(s2.y + HALF).toFixed(0), ...plankEnds(w) }); break; }
  }
  console.log("R2 fb东行:", JSON.stringify(log));
}

// R4 箱子位置（初始）+ 直接把箱传到板东端上方落下看反应
{
  const w = makeWorld("forest_14");
  for (let f = 0; f < 200; f++) w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE });
  const box = w.mechs.props.find((p) => p.kind === "box");
  console.log("R4 箱初始:", JSON.stringify({ x: box?.body ? -box.body.GetPosition().x * 32 : "?", y: box?.body ? -box.body.GetPosition().y * 32 : "?" }));
  // 推箱：fb 站箱西侧向东推 300f
  const s = snap(w, "fireboy");
  tp(w, "fireboy", 1020, 190);
  const log = [];
  for (let f = 0; f < 600; f++) {
    w.step(1 / 60, { fireboy: { ...IDLE, right: true }, watergirl: IDLE });
    if (f % 40 === 0) {
      const b = w.mechs.props.find((p) => p.kind === "box");
      log.push({ f, bx: +(-b.body.GetPosition().x * 32).toFixed(0), by: +(-b.body.GetPosition().y * 32).toFixed(0), ...plankEnds(w) });
    }
  }
  console.log("R4 推箱600f:", JSON.stringify(log));
}
