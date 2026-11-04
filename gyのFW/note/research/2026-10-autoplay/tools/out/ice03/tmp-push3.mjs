import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const auto = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/autosearch.mjs")).href);
const { PRIM_TABLE, NONE } = auto;
const world = kernel.makeWorld("ice_03");
const FWIN = { up:false, left:false, right:false };
const stepOf = (sp) => PRIM_TABLE[sp.n](...sp.a);
const jd = (d,h) => ({n:"jumpDrift",a:[d,0,h]});
const wt = (d,x,v) => ({n:"walkTo",a:v?[d,x,v]:[d,x]});
const wgProg = [
  {n:"sleep",a:[3]}, wt(-1,1075,70), jd(-1,40), jd(-1,20),
  wt(-1,780,60), wt(-1,482,50), jd(-1,24), {n:"hold",a:[-1,330]},
  wt(1,450,40), {n:"sleep",a:[60]},
  wt(1,502,40), {n:"sleep",a:[60]},
  wt(1,508,40), {n:"sleep",a:[60]},
  wt(1,538,40), {n:"sleep",a:[60]},
  wt(1,552,40),
];
const fbProg = [ {n:"sleep",a:[3]}, wt(1,270,70) ];
const progs = { fb: fbProg.map(stepOf), wg: wgProg.map(stepOf) };
const idx = { fb: 0, wg: 0 };
const state = { fb: {...NONE}, wg: {...NONE} };
const inputs = { fb: NONE, wg: NONE };
const NONEIN = { up:false,left:false,right:false };
for (let f = 0; f < 1100; f++) {
  const snapOf = (role) => { const s = world.snapshotPlayer(role); return { x:s.x, y:s.y, vx:s.vx, vy:s.vy, atDoor:s.atDoor, grounded: world.players[role].feetContacts.length > 0, dead: s.dead || s.dying }; };
  const meS = { fb: snapOf("fireboy"), wg: snapOf("watergirl") };
  for (const role of ["fb","wg"]) {
    const stp = progs[role][idx[role]];
    if (!stp) continue;
    const ctx = { f, w: world, me: meS[role], other: meS[role==="fb"?"wg":"fb"], mem: (stp._mem ??= {}), jumpHeld: state[role].up };
    const inp = stp.run(ctx);
    const next = { up:!!inp?.up, left:!!inp?.left, right:!!inp?.right };
    state[role] = next; inputs[role] = next;
    if (stp.done(ctx)) idx[role]++;
  }
  world.step(1/60, { fireboy: inputs.fb, watergirl: inputs.wg });
  if (f % 40 === 0) {
    const M = world.mechSnapshot();
    const wg = world.snapshotPlayer("watergirl"); const fb = world.snapshotPlayer("fireboy");
    console.log(`f${f} fb=${fb.x.toFixed(1)},${fb.y.toFixed(1)} wg=${wg.x.toFixed(1)} sl.x=${M.sliders[0].x.toFixed(1)} frozen=${JSON.stringify(M.liquidsFrozen)} idxF=${idx.fb} idxW=${idx.wg} fbIn=(${inputs.fb.left?1:0},${inputs.fb.right?1:0})`);
  }
  if (idx.wg >= wgProg.length && f > 900) break;
}
