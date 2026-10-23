/**
 * P-03 S 档验收探针：对 data/ 真实文件（已落 cb32 改动）全流程验证。
 * 断言：fb/wg 先后从跑道起跳 → 双双落台(feet=288) → 走门 → phase=won。
 * 运行：node --import tsx TEMP/p03/probe3.mjs
 */
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const PLAT_TOP = 288;
const IDLE = { up: false, left: false, right: false };

function jumpOnce(w, role, launchX) {
  const c = w.players[role];
  const V = c.body.GetPosition().constructor;
  c.body.SetPosition(new V(-launchX / 32, -(384 - 35.5) / 32));
  for (let f = 0; f < 90; f++) w.step(1 / 60, { fireboy: IDLE, watergirl: IDLE });
  const rest = w.snapshotPlayer(role);
  const jump = { up: true, left: true, right: false };
  for (let f = 0; f < 240 && w.phase === "playing"; f++) {
    w.step(1 / 60, { fireboy: f < 60 ? jump : IDLE, watergirl: f < 60 ? jump : IDLE });
  }
  const end = w.snapshotPlayer(role);
  const feet = end.y + 35.5;
  return { restX: +rest.x.toFixed(1), x: +end.x.toFixed(1), feet: +feet.toFixed(1), onPlat: Math.abs(feet - PLAT_TOP) <= 2.5 && end.x >= 14 && end.x <= 252, dead: !!end.dead };
}

for (const level of ["forest_14", "forest_14_1"]) {
  const out = [];
  for (const x of [272, 292, 312]) {
    const w = makeWorld(level);
    const fb = jumpOnce(w, "fireboy", x);
    if (!fb.onPlat) { out.push({ x, fb, verdict: "FB_NO_LAND" }); continue; }
    const wg = jumpOnce(w, "watergirl", x);
    if (!wg.onPlat) { out.push({ x, fb, wg, verdict: "WG_NO_LAND" }); continue; }
    for (let f = 0; f < 420 && w.phase === "playing"; f++) {
      const adv = (role, tx) => {
        const s = w.snapshotPlayer(role);
        return Math.abs(s.x - tx) < 4 ? IDLE : { up: false, left: s.x > tx, right: s.x < tx };
      };
      w.step(1 / 60, { fireboy: adv("fireboy", 96), watergirl: adv("watergirl", 192) });
    }
    out.push({ x, fb, wg, phase: w.phase });
  }
  console.log(`== ${level} ==`);
  for (const r of out) console.log(JSON.stringify(r));
}
