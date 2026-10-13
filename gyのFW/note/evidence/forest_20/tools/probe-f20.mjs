// forest_20 探针#2：平台信号位移实测、杠杆 f0 角度、推杆平移量、球沉降、风柱-钻石/地形相交
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs"));

const w = makeWorld("forest_20");
const M = w.mechanisms;
const out = [];
const P = (...a) => out.push(a.join(" "));
const step = (n) => { for (let i = 0; i < n; i++) w.step(1 / 60, { fireboy: {}, watergirl: {} }); };
const pos = (b) => { const p = b.GetPosition(); return [(p.x * -32), (p.y * -32)]; };

// 1) 沉降 120f 后的 f0 姿态
step(120);
P("== after120 lever states", M.levers.map((l) => `${l.id}:state${l.state}@${l.angleDeg().toFixed(2)}deg`).join(" | "));
P("   pusher trans", M.pushers.map((p, i) => `${p.id}:t${p.joint.GetJointTranslation().toFixed(3)}`).join(" | "));
P("   balls", M.props.filter((p) => p.kind === "ball").map((b) => pos(b.body).map((v) => v.toFixed(1)).join(",")).join(" | "));
P("   winds state", M.winds.map((f) => f.state).join(","));

// 2) 平台信号位移实测：state 置 1 → signalApply → 步进 → 读位移（屏幕 px，相对 A）
const platA = M.platforms.map((p) => pos(p.body));
P("== platform slide test (state=1, 240f)");
M.platforms.forEach((p, i) => {
  p.body.SetAwake(true);
  p.state = 1;
  p.signalApply();
});
step(240);
M.platforms.forEach((p, i) => {
  const [x, y] = pos(p.body);
  P(`   p${i} A=(${platA[i][0]},${platA[i][1]}) -> (${x.toFixed(1)},${y.toFixed(1)}) d=(${(x - platA[i][0]).toFixed(1)},${(y - platA[i][1]).toFixed(1)})`);
});
// 信号撤除回位测试（p2 only）
M.platforms[2].state = 0;
M.platforms[2].signalApply();
M.platforms[2].body.SetAwake(true);
step(240);
{
  const [x, y] = pos(M.platforms[2].body);
  P(`   p2 back-to-A test: (${x.toFixed(1)},${y.toFixed(1)}) d=(${(x - platA[2][0]).toFixed(1)},${(y - platA[2][1]).toFixed(1)})`);
}

// 3) 风柱四角/中心 是否嵌入地形（点在多边形，重扫 ground fixtures）
let fx = w.built.groundBody.GetFixtureList();
const polys = [];
while (fx) {
  const sh = fx.GetShape();
  if (sh && sh.m_vertices) polys.push(sh.m_vertices.map((q) => [((w.built.groundBody.GetPosition().x + q.x) * -32), ((w.built.groundBody.GetPosition().y + q.y) * -32)]));
  fx = fx.GetNext();
}
const inPoly = (x, y, vs) => { let ins = false; for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) { const [xi, yi] = vs[i], [xj, yj] = vs[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
const solidAt = (x, y) => polys.some((vs) => inPoly(x, y, vs));
const quad = [[697.0, 496.1], [613.8, 497.2], [608.9, 113.2], [692.1, 112.1]];
P("== wind column vs ground samples:");
for (const [qx, qy] of [[655, 480], [655, 400], [655, 300], [655, 224], [655, 180], [620, 200], [690, 200], [655, 130]]) {
  P(`   (${qx},${qy}) solid=${solidAt(qx, qy)}`);
}
// 钻石 (656,224) 在柱内?
{
  const [ax, ay] = quad[0], [bx, by] = quad[1], [cx, cy] = quad[2], [dx, dy] = quad[3];
  const inside = (px, py) => {
    let ins = false;
    const vs = quad;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const [xi, yi] = vs[i], [xj, yj] = vs[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  };
  P(`   diamond(656,224) in column: ${inside(656, 224)}`);
}

// 4) 风机开启实测：wind.state=1，角色放柱内看受力（粗验：把 fb 瞬移进柱内不做了，仅确认 applyForce 无异常）
M.winds[0].state = 1;
step(60);
P("== wind on 60f: phase", w.phase, "fb", (() => { const s = w.snapshotPlayer("fireboy"); return `(${s.x.toFixed(1)},${s.y.toFixed(1)})`; })(), "wg", (() => { const s = w.snapshotPlayer("watergirl"); return `(${s.x.toFixed(1)},${s.y.toFixed(1)})`; })());

console.log(out.join("\n"));
