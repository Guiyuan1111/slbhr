// r23b fb-flow: spawn -> fulljump-left to west steps (46,336) -> walk down to west bank (96-128,416)
// -> brake -> fulljump-right over water13 -> land east bank -> slide off east end -> mid-west slope.
// usage: node --import tsx TEMP/r23b/fb-flow.mjs [jL jR]  (jump-left frame, jump-right frame)
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });
const jL = Number(process.argv[2] ?? 10);
const jR = Number(process.argv[3] ?? 90);
const fb = [
  E(2, "left", "down"),
  E(jL, "up", "down"), E(jL + 40, "up", "up"),          // hold jump while running left (fires on ground)
  E(jL + 40, "left", "up"),
  E(jR - 20, "right", "down"),                           // run east on bank
  E(jR, "up", "down"), E(jR + 40, "up", "up"),           // jump right over water
];
const T = jR + 200;
const ins = expandFlat(fb, [], T);
const w = makeWorld("forest_23");
for (let f = 0; f < T; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const s = w.snapshotPlayer("fireboy");
  if (s.dead || s.dying) { console.log(`f${f} DEAD (${s.x.toFixed(1)},${(s.y + 35.2).toFixed(1)})`); break; }
  if (f % 5 === 0) console.log(`f${f} (${s.x.toFixed(1)},${(s.y + 35.2).toFixed(1)}) v(${s.vx.toFixed(0)},${s.vy.toFixed(0)})`);
}
