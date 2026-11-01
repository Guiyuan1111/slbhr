import { makeWorld } from '/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs';
const w = makeWorld('crystal_03');
for (const [role, d] of Object.entries(w.doors)) {
  const p = d.pos;
  console.log(role, 'pos:', JSON.stringify(p), ' char:', d.char);
}
