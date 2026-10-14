// r23b scan C2: settle (400,556) -> climb right rDur -> brake on hub west lip (412,548) -> hop right
// over the x416 seam -> stand hub floor -> run east.
// usage: node --import tsx TEMP/r23b/scan-c2.mjs [tC rA rB rStep hop]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const tC = Number(process.argv[2] ?? 480);
const RA = Number(process.argv[3] ?? 20), RB = Number(process.argv[4] ?? 40), RS = Number(process.argv[5] ?? 5);
const HOP = Number(process.argv[6] ?? 40);
for (let rDur = RA; rDur <= RB; rDur += RS) {
  const tH = tC + rDur + HOP;
  const fb = [
    E(2, "left", "down"),
    E(10, "up", "down"), E(50, "up", "up"), E(50, "left", "up"),
    E(70, "right", "down"),
    E(90, "up", "down"), E(130, "up", "up"),
    E(210, "left", "down"), E(230, "left", "up"),       // settle (400,556)
    E(tC, "right", "down"), E(tC + rDur, "right", "up"),// climb to lip, brake
    E(tH, "right", "down"), E(tH + 3, "up", "down"), E(tH + 33, "up", "up"), // hop over seam
  ];
  const T = tH + 150;
  const ins = expandFlat(fb, [], T);
  const w = makeWorld("forest_23");
  let out = "";
  for (let f = 0; f < T; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const s = w.snapshotPlayer("fireboy");
    if (s.dead || s.dying) { out = `DEAD f${f - tH}(${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)})`; break; }
    if (f === T - 1) out = `(${s.x.toFixed(0)},${(s.y + 35.2).toFixed(0)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)})`;
  }
  console.log(`rDur=${rDur}: ${out}`);
}
