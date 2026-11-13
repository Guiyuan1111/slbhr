// probe-ice03-fine.mjs — ice_03 精探针 #2（fw-route-ice03 槽，2026-11-01）。
// P1: slider x 4px 精扫 → 三片水域冻结窗口（sx 域）+ 光束命中点。
// P2: puck 保持性：SetPosition 后 600f 无输入，读漂移。
// P3: wg (32,832) 96px 跳 → 'd'(1,23) 顶 y736 实测（直接摆位+jump 单帧 up）。
// P4: fb 顶台静跳/走跳 rise 实测（标定 runJump 参数）。
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const { makeWorld } = kernel;
const NONE = { up: false, left: false, right: false };
const stepN = (w, n, fi = NONE, wi = NONE) => {
  for (let f = 0; f < n; f++) w.step(1 / 60, { fireboy: fi, watergirl: wi });
};
const px = (w, r) => { const s = w.snapshotPlayer(r); return [+s.x.toFixed(1), +s.y.toFixed(1), +s.vx.toFixed(0), +s.vy.toFixed(0)]; };

// ---- P1 冻结窗口精扫
console.log("== P1 冻结窗口（sx 4px 步进，各 fresh world，步 120f）");
const wins = { A: [], B: [], C: [] };
for (let sx = 440; sx <= 576; sx += 4) {
  const w = makeWorld("ice_03");
  const sl = w.mechanisms.sliders[0];
  const p = sl.body.GetPosition();
  sl.body.SetPosition({ x: sx / -32, y: p.y });
  sl.body.SetAwake(true);
  stepN(w, 120);
  const M = w.mechSnapshot();
  const fz = M.liquidsFrozen.map((v) => (v ? 1 : 0)).join("");
  if (fz !== "000") {
    const hit = M.beamers[0].pts.split("|").map((s) => s.split(",").map(Number));
    console.log(`sx=${sx} frozen=${fz} beamEnd=${JSON.stringify(hit[hit.length - 1])} pts=${M.beamers[0].pts}`);
    if (fz[0] === "1") wins.A.push(sx);
    if (fz[1] === "1") wins.B.push(sx);
    if (fz[2] === "1") wins.C.push(sx);
  }
}
console.log("窗口: A=[%s] B=[%s] C=[%s]", wins.A.length ? `${wins.A[0]}-${wins.A.at(-1)}` : "-", wins.B.length ? `${wins.B[0]}-${wins.B.at(-1)}` : "-", wins.C.length ? `${wins.C[0]}-${wins.C.at(-1)}` : "-");

// ---- P2 puck 保持性
console.log("== P2 puck 保持（sx=545 摆位步 600f）");
{
  const w = makeWorld("ice_03");
  const sl = w.mechanisms.sliders[0];
  const p = sl.body.GetPosition();
  sl.body.SetPosition({ x: 545 / -32, y: p.y });
  sl.body.SetAwake(true);
  stepN(w, 600);
  const M = w.mechSnapshot();
  console.log("600f 后 sl=", JSON.stringify(M.sliders), "frozen=", JSON.stringify(M.liquidsFrozen));
}

// ---- P3 wg (32,832) 起跳实测：摆位到 '\'(1,26) hyp 上，站稳后原地跳
console.log("== P3 wg 静跳 rise @ ~(36,834)");
for (const [jx, jy] of [[36, 834], [40, 838], [48, 846]]) {
  const w = makeWorld("ice_03");
  // 传送到目标点下方一点，让物理落稳
  const wg = w.players.watergirl;
  const bp = wg.body.GetPosition();
  wg.body.SetPosition({ x: jx / -32, y: (jy - 20) / -32 });
  wg.body.SetLinearVelocity({ x: 0, y: 0 });
  wg.body.SetAwake(true);
  stepN(w, 60); // 落稳
  const s0 = px(w, "watergirl");
  // 单帧 up 跳
  stepN(w, 1, NONE, { up: true });
  stepN(w, 90, NONE, NONE);
  const s1 = px(w, "watergirl");
  console.log(`jx=${jx}: 站稳=${JSON.stringify(s0)} 落地=${JSON.stringify(s1)} rise=${(s0[1] - minY).toFixed(1)}`);
  var minY = 0;
}

// rise 精确测法重跑（逐帧 minFeet = center.y+35 最小值）
console.log("== P3b wg 静跳逐帧 minFeet（feet=y+35.2 近似 center−? 用 center 记录最小 y）");
for (const jx of [36, 44]) {
  const w = makeWorld("ice_03");
  const wg = w.players.watergirl;
  wg.body.SetPosition({ x: jx / -32, y: (814) / -32 });
  wg.body.SetLinearVelocity({ x: 0, y: 0 });
  wg.body.SetAwake(true);
  stepN(w, 60);
  const y0 = w.snapshotPlayer("watergirl").y;
  let minY = y0;
  stepN(w, 1, NONE, { up: true });
  for (let f = 0; f < 120; f++) {
    stepN(w, 1);
    minY = Math.min(minY, w.snapshotPlayer("watergirl").y);
  }
  console.log(`jx=${jx} y0=${y0.toFixed(1)} minY=${minY.toFixed(1)} rise=${(y0 - minY).toFixed(1)}`);
}

// ---- P4 fb 顶台走跳距离标定（满速东跳从 (150,192) 沿顶台）
console.log("== P4 fb 走跳：顶台 (150,192) 满充东跳落点/漂移");
{
  const w = makeWorld("ice_03");
  const fb = w.players.fireboy;
  fb.body.SetPosition({ x: 60 / -32, y: 170 / -32 });
  fb.body.SetLinearVelocity({ x: 0, y: 0 });
  fb.body.SetAwake(true);
  const trace = [];
  let jumped = false;
  for (let f = 0; f < 260; f++) {
    const s = w.snapshotPlayer("fireboy");
    const inp = { up: false, right: true, left: false };
    if (!jumped && s.x >= 150 && w.players.fireboy.feetContacts.length > 0) { inp.up = true; jumped = true; trace.push(["jump@", f, +s.x.toFixed(1), +s.y.toFixed(1), +s.vx.toFixed(0)]); }
    w.step(1 / 60, { fireboy: inp, watergirl: NONE });
    trace.push(["f" + f, +s.x.toFixed(1), +s.y.toFixed(1), +s.vx.toFixed(0), +s.vy.toFixed(0)]);
  }
  const last = trace.at(-1);
  console.log("jump信息:", JSON.stringify(trace[trace.findIndex((t) => t[0] === "jump@")]));
  console.log("终态:", JSON.stringify(last));
  // 逐帧最小 y（弧顶）与落地帧
  let apex = null;
  for (const t of trace) if (t[0] !== "jump@") { const y = t[2]; if (apex === null || y < apex[2]) apex = t; }
  console.log("apex:", JSON.stringify(apex));
}
