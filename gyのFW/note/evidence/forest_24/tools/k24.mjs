// 内核侧 forest_24 质量/静息角对照（vs oracle d24-roman.out.json）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const w = makeWorld("forest_24");
for (let i = 0; i < 600; i++) w.step(1 / 60, { fireboy: {}, watergirl: {} });
const r4 = (v) => Math.round(v * 1e4) / 1e4;

console.log("== KERNEL romans ==");
for (const [i, r] of (w.mechs.romans || []).entries()) {
  const b = r.bar;
  const p = b.GetPosition();
  console.log(`r${i}: mass=${r4(b.GetMass())} inertia=${r4(b.GetInertia())} angle=${r4((b.GetAngle() * 180) / Math.PI)}° pos_px=(${r4(-p.x * 32)},${r4(-p.y * 32)})`);
}
console.log("== KERNEL props(箱) ==");
for (const [i, p] of (w.mechs.props || []).entries()) {
  const b = p.body;
  const pos = b.GetPosition();
  console.log(`box${i}: kind=${p.kind} mass=${r4(b.GetMass())} inertia=${r4(b.GetInertia())} pos_px=(${r4(-pos.x * 32)},${r4(-pos.y * 32)}) angle=${r4((b.GetAngle() * 180) / Math.PI)}°`);
}
console.log("== KERNEL chars ==");
for (const role of ["fireboy", "watergirl"]) {
  const b = w.players[role].body;
  const p = b.GetPosition();
  console.log(`${role}: mass=${r4(b.GetMass())} pos_px=(${r4(-p.x * 32)},${r4(-p.y * 32)})`);
}
