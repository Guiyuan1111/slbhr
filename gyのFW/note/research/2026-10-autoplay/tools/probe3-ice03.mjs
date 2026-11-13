// probe3-ice03.mjs — 跳跃/空气动力学标定（fw-route-ice03 槽）。
// PG1: 垂直跳不输入 → vx/x 逐帧（跳跃是否清 vx、空气阻力系数）。
// PG2: 跳后空中持续右压 → 空中加速度/极速。
// PG3: 手动 vx=+5 起跳不输入 → vx 衰减曲线。
// PG4: 助跑不跳（地面持续右压）→ 地面加速曲线 + 极速。
// PG5: 45° 坡下降实测（A 东楼梯 (544,289)→(670,415) 向东走下坡）。
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const { makeWorld } = kernel;
const NONE = { up: false, left: false, right: false };
const R = (v) => +v.toFixed(1);
const st = (w, r) => { const s = w.snapshotPlayer(r); return [R(s.x), R(s.y), Math.round(s.vx), Math.round(s.vy)]; };
const teleport = (w, r, x, y, vx = 0) => {
  const b = w.players[r].body;
  b.SetPosition({ x: -x / 32, y: -y / 32 });
  b.SetLinearVelocity({ x: -vx / 32, y: 0 });
  b.SetAwake(true);
};

console.log("== PG1 垂直跳无输入（底板 x=400）");
{
  const w = makeWorld("ice_03");
  teleport(w, "watergirl", 400, 860);
  const rows = [];
  for (let f = 0; f < 80; f++) {
    const pre = st(w, "watergirl");
    w.step(1 / 60, { fireboy: NONE, watergirl: f === 3 ? { ...NONE, up: true } : NONE });
    if (f >= 3 && f <= 33) rows.push(`f${f}:${pre.join(",")}`);
  }
  console.log(rows.join(" "));
}

console.log("== PG2 跳后空中持续右压");
{
  const w = makeWorld("ice_03");
  teleport(w, "watergirl", 400, 860);
  const rows = [];
  for (let f = 0; f < 80; f++) {
    const pre = st(w, "watergirl");
    w.step(1 / 60, { fireboy: NONE, watergirl: f < 3 ? NONE : { ...NONE, up: true, right: true } });
    if (f >= 3 && f <= 43 && (f - 3) % 4 === 0) rows.push(`f${f}:${pre.join(",")}`);
  }
  console.log(rows.join(" "));
}

console.log("== PG3 手动 vx=+6 起跳无输入（vx 衰减）");
{
  const w = makeWorld("ice_03");
  teleport(w, "watergirl", 300, 860, 6);
  const rows = [];
  for (let f = 0; f < 80; f++) {
    const pre = st(w, "watergirl");
    w.step(1 / 60, { fireboy: NONE, watergirl: f === 3 ? { ...NONE, up: true } : NONE });
    if (f >= 3 && f <= 43 && (f - 3) % 4 === 0) rows.push(`f${f}:${pre.join(",")}`);
  }
  console.log(rows.join(" "));
}

console.log("== PG4 地面右压加速曲线（底板 x=100 起步）");
{
  const w = makeWorld("ice_03");
  teleport(w, "watergirl", 100, 860);
  const rows = [];
  for (let f = 0; f < 120; f++) {
    const pre = st(w, "watergirl");
    w.step(1 / 60, { fireboy: NONE, watergirl: f < 3 ? NONE : { ...NONE, right: true } });
    if (f >= 3 && (f - 3) % 8 === 0) rows.push(`f${f}:${pre.join(",")}`);
  }
  console.log(rows.join(" "));
}

console.log("== PG5 45° 下坡：摆 A 东楼梯顶(560,270) 向东走下坡到 (670,415)");
{
  const w = makeWorld("ice_03");
  teleport(w, "watergirl", 560, 270);
  const rows = [];
  let phase = 0, doneF = -1;
  for (let f = 0; f < 400; f++) {
    const pre = st(w, "watergirl");
    let inp = NONE;
    if (f >= 3 && phase === 0) { inp = { ...NONE, right: true }; if (pre[0] >= 660 && pre[1] >= 400) { phase = 1; doneF = f; } }
    w.step(1 / 60, { fireboy: NONE, watergirl: inp });
    if (f >= 3 && (f - 3) % 10 === 0) rows.push(`f${f}:${pre.join(",")}`);
    if (phase === 1) break;
  }
  console.log(`到东端f=${doneF} | ${rows.join(" ")}`);
}
