// probe-ice03-mech.mjs — ice_03 机关机理探针（fw-route-ice03 槽，2026-11-01）。
// 探明：slider puck x → 镜像体角 → beamer 光束折线 → 三片水域冻结映射。
// 探针手段：直接 SetPosition slider 体（仅探针用，非路线手段），步进 N 帧读快照。
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const { makeWorld } = kernel;

const stepN = (w, n, inp = { up: false, left: false, right: false }) => {
  for (let f = 0; f < n; f++) w.step(1 / 60, { fireboy: inp, watergirl: inp });
};

// ---- E1: slider x 扫描 → 镜像角/光束/冻结
console.log("== E1 slider x 扫描（SetPosition 后步 90f）");
for (const sx of [304, 320, 350, 380, 410, 425, 440, 455, 470, 500, 530, 560, 576]) {
  const w = makeWorld("ice_03");
  const sl = w.mechanisms.sliders[0];
  const p = sl.body.GetPosition();
  sl.body.SetPosition({ x: sx / -32, y: p.y });
  sl.body.SetAwake(true);
  stepN(w, 90);
  const M = w.mechSnapshot();
  const mr = M.infiniteMirrors.map((m) => +m.angle.toFixed(3));
  console.log(`sx=${sx} state→mir=${JSON.stringify(mr)} beam=${JSON.stringify(M.beamers[0].pts)} frozen=${JSON.stringify(M.liquidsFrozen)} sl=${JSON.stringify(M.sliders)}`);
}

// ---- E2: 精扫东半（光束若只随东半变化）——先看 E1 决定
// ---- E3: 冻结后光路反射（水面=镜）复核：手动冻结 A 片再读束
console.log("== E3 冻结 A 池后光束复核（sx=440 保持，手动 freeze A）");
{
  const w = makeWorld("ice_03");
  w.freezeLiquid(w.liquids[0], []);
  stepN(w, 30);
  const M = w.mechSnapshot();
  console.log("after freeze A: beam=", JSON.stringify(M.beamers[0].pts), "frozen=", JSON.stringify(M.liquidsFrozen));
}
