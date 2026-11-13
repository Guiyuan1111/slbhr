// probe4-ice03.mjs — 跳跃爬坡（bunny-hop）核心原语验证（fw-route-ice03 槽）。
// PH1: 塔顶→45°侧坡连续跳爬（750,470 起步，grounded 即跳+右压）→峰?
// PH2: 链跳爬：blob 顶(205,800) 起步，跳+右连跳 → (351,641)?→西岸
// PH3: 顶楼梯跳爬：A西岸(250,288) 跳+左连跳 → 顶台(192)?
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const { makeWorld } = kernel;
const NONE = { up: false, left: false, right: false };
const R = (v) => +v.toFixed(1);
const st = (w, r) => { const s = w.snapshotPlayer(r); return [R(s.x), R(s.y), Math.round(s.vx), Math.round(s.vy)]; };
const groundedOf = (w, r) => w.players[r].feetContacts.length > 0;
const teleport = (w, r, x, y) => {
  const b = w.players[r].body;
  b.SetPosition({ x: -x / 32, y: -y / 32 });
  b.SetLinearVelocity({ x: 0, y: 0 });
  b.SetAwake(true);
};
// hopDrift：grounded 即发 up（1f），全程压 dir；空中保持 dir
const hopDrive = (w, r, dir, maxF, stopFn, onMark) => {
  const marks = [];
  let jumps = 0;
  for (let f = 0; f < maxF; f++) {
    const inp = f < 3 ? NONE : { ...NONE, [dir]: true, up: groundedOf(w, r) };
    if (inp.up) jumps++;
    w.step(1 / 60, { fireboy: NONE, watergirl: r === "watergirl" ? inp : NONE, fireboy: NONE });
    const s = st(w, r);
    if ((f - 3) % 20 === 0) marks.push(`f${f}:${s.join(",")}`);
    if (stopFn(s, f)) { marks.push(`f${f} 达标 ${s.join(",")} jumps=${jumps}`); return { ok: true, f, s, marks, jumps }; }
    const snap = w.snapshotPlayer(r);
    if (snap.dead || snap.dying) { marks.push(`f${f} 死亡`); return { ok: false, f, s, marks, jumps }; }
  }
  marks.push(`超时 终=${st(w, r).join(",")} jumps=${jumps}`);
  return { ok: false, f: maxF, s: st(w, r), marks, jumps };
};

console.log("== PH1 塔顶→侧坡跳爬到峰");
{
  const w = makeWorld("ice_03");
  teleport(w, "watergirl", 750, 470);
  const r = hopDrive(w, "watergirl", "right", 800, (s) => s[0] >= 944 && s[1] <= 330 && groundedOf(w, "watergirl"));
  console.log(`ok=${r.ok} f=${r.f} jumps=${r.jumps} | ${r.marks.join(" | ")}`);
}

console.log("== PH2 blob→链跳爬→链顶");
for (const x0 of [190, 205, 218]) {
  const w = makeWorld("ice_03");
  teleport(w, "watergirl", x0, 764); // 直接摆 blob 顶（feet 800）
  const r = hopDrive(w, "watergirl", "right", 700, (s, f) => f > 20 && s[0] >= 344 && s[1] <= 660 && groundedOf(w, "watergirl"));
  console.log(`x0=${x0} ok=${r.ok} f=${r.f} jumps=${r.jumps} 终=${r.s.join(",")} | ${r.marks.slice(-4).join(" | ")}`);
}

console.log("== PH3 A西岸→顶楼梯跳爬到顶台");
{
  const w = makeWorld("ice_03");
  teleport(w, "watergirl", 250, 252); // 摆 A 西岸顶（feet 288）
  const r = hopDrive(w, "watergirl", "left", 700, (s, f) => f > 20 && s[1] <= 200 && s[0] <= 200 && groundedOf(w, "watergirl"));
  console.log(`ok=${r.ok} f=${r.f} jumps=${r.jumps} 终=${r.s.join(",")} | ${r.marks.join(" | ")}`);
}
