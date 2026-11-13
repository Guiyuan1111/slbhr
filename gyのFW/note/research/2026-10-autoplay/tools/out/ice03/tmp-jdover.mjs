import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const auto = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/autosearch.mjs")).href);
const { PRIM_TABLE } = auto;
const NONE = { up:false, left:false, right:false };
const stepOf = (sp) => PRIM_TABLE[sp.n](...sp.a);
const jd = (d,h) => ({n:"jumpDrift",a:[d,0,h]});
const wt = (d,x,v) => ({n:"walkTo",a:v?[d,x,v]:[d,x]});
// 三种跳越尝试：从 408/404/400 起跳（puck 跟随至 ~388/384/380）
for (const st of [408, 404, 400]) {
  const world = kernel.makeWorld("ice_03");
  const wgProg = [
    {n:"sleep",a:[3]}, wt(-1,1075,70), jd(-1,40), jd(-1,20),
    wt(-1,780,60), wt(-1,st,70), jd(-1,0,24),
  ];
  const progs = { wg: wgProg.map(stepOf) };
  const idx = { wg: 0 };
  const state = { wg: {...NONE} };
  const inputs = { wg: NONE };
  let lastWg = null, lastSl = null, jumpF = -1, landF = -1, minSl = 999;
  for (let f = 0; f < 900; f++) {
    const snapOf = (role) => { const s = world.snapshotPlayer(role === "wg" ? "watergirl" : role); return { x:s.x, y:s.y, vx:s.vx, vy:s.vy, grounded: world.players[role === "wg" ? "watergirl" : role].feetContacts.length > 0 }; };
    const me = snapOf("wg");
    const stp = progs.wg[idx.wg];
    if (stp) {
      const ctx = { f, w: world, me, other: me, mem: (stp._mem ??= {}), jumpHeld: state.wg.up };
      const inp = stp.run(ctx);
      const next = { up:!!inp?.up, left:!!inp?.left, right:!!inp?.right };
      state.wg = next; inputs.wg = next;
      if (stp.done(ctx)) idx.wg++;
    } else inputs.wg = NONE;
    world.step(1/60, { fireboy: NONE, watergirl: inputs.wg });
    const M = world.mechSnapshot();
    if (M.sliders[0].x < minSl) minSl = M.sliders[0].x;
    if (idx.wg >= 6 && jumpF < 0) jumpF = f;      // jd done → 已完成跳越
    if (idx.wg >= 6) { landF = f; break; }
    lastWg = me; lastSl = M.sliders[0].x;
  }
  console.log(`st=${st}: 跳越段结束 f=${landF} wg=(${lastWg?.x.toFixed(1)},${lastWg?.y.toFixed(1)}) puck=${lastSl?.toFixed(1)} minPuck=${minSl.toFixed(1)}`);
}
