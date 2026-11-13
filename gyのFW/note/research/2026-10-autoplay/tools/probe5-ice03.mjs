// probe5-ice03.mjs — 推 Ice_03 slider puck 实测 + 冻结窗 2px 复扫（fw-route-ice03 槽，2026-11-01）。
// 背景：PC3 探针从未真正推到 puck（45°坡卡死）；冻结窗 C=[464,480] B=[528] A=[556,560] 为 4px 扫描，
// B 单点、A 边缘需 2px 复扫。本探针两件事：
//   P1: wg 传送至 puck 西侧 (>=f3 防 NaN)，hold right 240f —— 验证人物步行推力可否克服 slider 马达，
//       记录 puck.x 轨迹与 liquidsFrozen 变化帧；随后 hold left 90f 验证马达回位/保持。
//   P2: puck x 2px 复扫 [516,536] 与 [548,568]，读 frozen 位图。
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const { makeWorld } = kernel;

const teleport = (w, role, x, y) => {
  const b = w.players[role].body;
  b.SetPosition({ x: -x / 32, y: -y / 32 });
  b.SetLinearVelocity({ x: 0, y: 0 });
  b.SetAwake(true);
};
const snap = (w) => w.snapshotPlayer("watergirl");

// ---- P1: 推 puck 实测
{
  const w = makeWorld("ice_03");
  teleport(w, "watergirl", 405, 830); // puck 西侧半身位（向右走推其东行，同 WG 正式路线动作）
  const RIGHT = { up: false, left: false, right: true };
  const LEFT = { up: false, left: true, right: false };
  const NONE = { up: false, left: false, right: false };
  let lastFrozen = "?????";
  const marks = [];
  for (let f = 0; f < 560; f++) {
    const inp = f < 3 ? NONE : f < 243 ? RIGHT : LEFT; // 前 3f 怠速；240f 向右（推西）；随后向左（推东）
    w.step(1 / 60, { fireboy: NONE, watergirl: inp });
    if (f % 30 === 0 || f === 240 || f === 241) {
      const s = snap(w);
      const M = w.mechSnapshot();
      const fz = JSON.stringify(M.liquidsFrozen);
      if (fz !== lastFrozen) { marks.push(`f${f} frozen=${fz}`); lastFrozen = fz; }
      console.log(`f${f} wg=[${s.x.toFixed(1)},${s.y.toFixed(1)}] puck=${M.sliders[0].x.toFixed(1)} frozen=${fz}`);
    }
  }
  console.log("P1 frozen 变化点:", marks.length ? marks.join(" | ") : "（无）");
}

// ---- P2: 2px 复扫冻结窗
console.log("== P2 2px 复扫 B/A 窗");
const scan = (lo, hi) => {
  const out = [];
  for (let sx = lo; sx <= hi; sx += 2) {
    const w = makeWorld("ice_03");
    const sl = w.mechanisms.sliders[0];
    const p = sl.body.GetPosition();
    sl.body.SetPosition({ x: sx / -32, y: p.y });
    sl.body.SetAwake(true);
    for (let f = 0; f < 90; f++) w.step(1 / 60, { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } });
    out.push(`sx${sx}:${JSON.stringify(w.mechSnapshot().liquidsFrozen)}`);
  }
  return out;
};
console.log("B区[516,536]:", scan(516, 536).join(" "));
console.log("A区[548,568]:", scan(548, 568).join(" "));
console.log("C区[460,484]:", scan(460, 484).join(" "));
