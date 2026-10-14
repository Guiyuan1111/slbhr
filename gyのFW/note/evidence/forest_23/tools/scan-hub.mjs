// r23b: chute end (485,289) -> tap-left -> drop to hub floor (544)? then walk east.
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const La = Number(process.argv[2] ?? 400), Lb = Number(process.argv[3] ?? 420), m = Number(process.argv[4] ?? 2);
const T = Number(process.argv[5] ?? 700);
for (let tL = La; tL <= Lb; tL += 5) {
  const fb = [
    E(3, "right", "down"), E(35, "right", "up"),
    E(50, "right", "down"), E(66, "right", "up"),
    E(tL, "left", "down"), E(tL + m, "left", "up"),
    E(tL + 60, "right", "down"),
  ];
  const ins = expandFlat(fb, [], T);
  const w = makeWorld("forest_23");
  let out = "";
  for (let f = 0; f < T; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const s = w.snapshotPlayer("fireboy");
    const d = w.built.doors.fireboy;
    if (s.dead || s.dying) { out = `DEAD f${f - tL}(${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`; break; }
    if (f === T - 1) out = `(${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)}) door=${d.frac.toFixed(1)}${w.phase === "won" ? " WON" : ""}`;
  }
  console.log(`tL=${tL}: ${out}`);
}
