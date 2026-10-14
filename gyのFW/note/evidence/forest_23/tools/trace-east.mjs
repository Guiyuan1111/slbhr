// r23b: fb east-drop hypothesis: spawn -> run east off plateau -> terrace -> off east edge -> hub floor?
// usage: node --import tsx TEMP/r23b/trace-east.mjs [T] [relF]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const T = Number(process.argv[2] ?? 300);
const relF = Number(process.argv[3] ?? 9999);
const reF = Number(process.argv[4] ?? 99999);
const fb = [E(3, "right", "down")];
if (relF < 9999) fb.push(E(relF, "right", "up"));
if (reF < 99999) fb.push(E(reF, "right", "down"));
const ins = expandFlat(fb, [], T);
const w = makeWorld("forest_23");
for (let f = 0; f < T; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const s = w.snapshotPlayer("fireboy");
  if (s.dead || s.dying) { console.log(`f${f} DEAD (${s.x.toFixed(1)},${(s.y + 35.2).toFixed(1)})`); break; }
  if (f % 5 === 0) console.log(`f${f} (${s.x.toFixed(1)},${(s.y + 35.2).toFixed(1)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)})`);
}
