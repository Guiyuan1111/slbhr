// fw-route-crystal3 槽 · crystal_03 环 10 相位扫描器 v2
// 相位旋钮=板跳延迟 δ（fb 落 416 板后延迟 δ 帧再跳）→ floor320 落点/踢箱位/推距全变 → box 入带相位变。
// 判定：box 首次 TP 后 70f 内——row19 x<1195 = ALIVE；回 floor320 = DEAD(回弹)；y>700 = LOST(坠世)。
// 用法: node --import tsx TEMP/fw-rc3-1/probe10c.mjs [dmax]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
function findRoot(dir) {
  for (let d = dir; ; d = dirname(d)) {
    try { readFileSync(join(d, "package.json")); return d; } catch { /* 向上 */ }
  }
}
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
const { makeWorld } = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "kernel.mjs")).href);
const B = (await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "kernel", "b2.js")).href)).b2();
const NONE = { up: false, left: false, right: false };
const place = (w, role, sx, sy) => {
  const b = w.players[role === "fb" ? "fireboy" : "watergirl"].body;
  b.SetPosition(new B.b2Vec2(-sx / 32, -sy / 32));
  b.SetLinearVelocity(new B.b2Vec2(0, 0));
  b.SetAwake(true);
};
const S = (w, role) => {
  const s = w.snapshotPlayer(role === "fb" ? "fireboy" : "watergirl");
  return { x: +s.x.toFixed(2), y: +s.y.toFixed(2), vx: +(s.vx ?? 0).toFixed(2) };
};
const G = (w, role) => w.players[role === "fb" ? "fireboy" : "watergirl"].feetContacts.length > 0;
const boxP = (w) => {
  const p = w.mechanisms.props[0].body.GetPosition();
  return { x: +(-p.x * 32).toFixed(2), y: +(-p.y * 32).toFixed(2) };
};

function run(delay, verbose = false) {
  const w = makeWorld("crystal_03");
  place(w, "fb", 611, 220.5);
  let st = "F0", jumpF = -1, tpF = -1, lastBoxY = 290, brakeF = -1;
  const marks = [];
  const backTo = delay; // 复用参数：fb 推位回退目标 X_b
  for (let f = 0; f < 700; f++) {
    const fb = S(w, "fb");
    const bx = boxP(w);
    let inp = {};
    if (st === "F0") {
      if (f >= 3) inp = { right: true };
      if (G(w, "fb") && f > 20 && fb.x > 750 && fb.x < 840 && fb.y > 370) { st = "F1"; jumpF = f; marks.push(`slab@f${f}[${fb.x},${fb.y},vx${fb.vx}]`); }
    } else if (st === "F1") {
      inp = f < jumpF + 12 ? { right: true, up: true } : { right: true };
      if (G(w, "fb") && f > jumpF + 20 && fb.y > 260 && fb.y < 310) { st = "F2a"; marks.push(`land@f${f}[${fb.x},feet${(fb.y + 35.2).toFixed(1)}]`); }
      if (f > jumpF + 160 && st === "F1") return { verdict: "NO-LAND", marks };
    } else if (st === "F2a") { // 回退到 backTo 停 8f 再上撞
      if (fb.x > backTo + 3) inp = { left: true };
      else if (fb.x < backTo - 3) inp = { right: true };
      else { inp = {}; if (brakeF < 0) brakeF = f; if (f - brakeF > 8) { st = "F2"; brakeF = -1; marks.push(`braked@f${f}[${fb.x}]`); } }
    } else if (st === "F2") {
      inp = { right: true };
      if (Math.abs(bx.y - lastBoxY) > 40) { tpF = f; st = "F3"; marks.push(`boxTP@f${f}[${bx.x},${bx.y}]`); }
    } else if (st === "F3") {
      inp = {};
      if (bx.y > 500 && bx.x < 1195) { marks.push(`settled[${bx.x},${bx.y}]@f${f}`); return { verdict: "ALIVE", marks, boxX: bx.x, tpF }; }
      if (bx.y < 400 && f > tpF + 30) { marks.push(`bounced[${bx.x},${bx.y}]@f${f}`); return { verdict: "DEAD", marks, boxX: bx.x, tpF }; }
      if (bx.y > 700) { marks.push(`fell@f${f}`); return { verdict: "LOST", marks, boxX: bx.x, tpF }; }
    }
    w.step(1 / 60, { fireboy: { ...NONE, ...inp }, watergirl: { ...NONE } });
    lastBoxY = bx.y;
    const s2 = S(w, "fb");
    if (s2.y > 900) { marks.push(`fbFell@f${f}`); return { verdict: "FBFELL", marks }; }
  }
  return { verdict: "TIMEOUT", marks };
}

const dmax = Number(process.argv[2] ?? 10);
const dstep = Number(process.argv[3] ?? 5);
for (let d = 850; d <= dmax; d += dstep) {
  const r = run(d);
  console.log(`backTo=${d}: ${r.verdict} | ${r.marks.join(" ")}`);
}
