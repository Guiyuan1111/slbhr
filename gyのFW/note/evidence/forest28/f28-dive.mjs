// f28-dive.mjs — wg 楔下潜入探测：H1床西缘(192)持西坠落 → 512板(jackpot) / 楔下被弹东→缘台704(兜底)
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const DT = 1/60;
const ins0 = { up:false, left:false, right:false };
const dir = (d) => d==="L" ? {up:false,left:true,right:false} : d==="R" ? {up:false,left:false,right:true} : {...ins0};
function run(holdL) {
  const w = makeWorld("forest_28");
  for (let i=0;i<30;i++) w.step(DT, {fireboy:{...ins0},watergirl:{...ins0}});
  let f = 0;
  const cur = {...ins0};
  const pos = () => { const s = w.snapshotPlayer("watergirl"); return { x:Math.round(s.x*10)/10, feet:Math.round((s.y+35.2)*10)/10, dead:!!(s.dead||s.dying) }; };
  const frame = (inp) => { for (const k of ["up","left","right"]) if (!!inp[k] !== !!cur[k]) cur[k] = !!inp[k]; w.step(DT, {fireboy:{...ins0},watergirl:{...cur}}); f++; };
  const trace = [];
  // 东行入床
  for (let i=0;i<400;i++) { frame(dir("R")); if (pos().x >= 200) break; }
  trace.push(`f${f} 床上 ${JSON.stringify(pos())}`);
  // 掉头西行出床西缘(192) 持西坠落
  for (let i=0;i<(holdL?90:90);i++) { frame(dir("L")); if (i<60) trace.push(`f${f} ${JSON.stringify(pos())}`); }
  // 静置
  for (let i=0;i<80;i++) frame({...ins0});
  trace.push(`f${f} 终 ${JSON.stringify(pos())}`);
  return trace;
}
console.log("== 持西坠落 90f ==");
console.log(run(true).join("\n"));
