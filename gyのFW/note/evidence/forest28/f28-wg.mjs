// f28-wg.mjs — forest_28 wg 探测：H1 泳潜入西袋 → l3 翻闸(p1沉) → 东出落缘台 → 泳渡704池 → 704地板 → 门
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const DT = 1/60;
const ins0 = { up:false, left:false, right:false };
const dir = (d) => d==="L" ? {up:false,left:true,right:false} : d==="R" ? {up:false,left:false,right:true} : d==="U" ? {up:true,left:false,right:false} : d==="D" ? {up:false,left:false,right:true,down:true} : {...ins0};
const w = makeWorld("forest_28");
for (let i=0;i<30;i++) w.step(DT, {fireboy:{...ins0},watergirl:{...ins0}});
let f = 0;
const evs = [];
const cur = { wg:{...ins0} };
const leverG = (g) => w.mechs.levers.find(l => l.group === g);
const platG = (g) => w.mechs.platforms.find(p => p.group === g);
const pos = (r) => { const s = w.snapshotPlayer("watergirl"); return { x:Math.round(s.x*10)/10, feet:Math.round((s.y+35.2)*10)/10, dead:!!(s.dead||s.dying) }; };
function frame(inp) {
  for (const k of ["up","left","right","down"]) if (!!inp[k] !== !!cur.wg[k]) cur.wg[k] = !!inp[k];
  const ev = w.step(DT, { fireboy:{...ins0}, watergirl:{...cur.wg} });
  f++;
  for (const e of ev) evs.push(`f${f} ${e.type} ${e.type==="mech"?JSON.stringify(e.event):JSON.stringify(e.data||"")}`);
}
function* coast(role, max=90) {
  let last=null, stable=0;
  for (let i=0;i<max;i++) {
    const s = pos(role);
    if (last && Math.abs(s.x-last.x)<0.4 && Math.abs(s.feet-last.feet)<0.4) { stable++; if (stable>=8) return; } else stable=0;
    last = s; yield ins0;
  }
}
function* walkU(role, d, pred, max=400, tag="") {
  for (let i=0;i<max;i++) { if (pred(pos(role))) { console.log(`  [${tag}] f${f} ${JSON.stringify(pos(role))}`); return; } yield dir(d); }
  console.log(`  [${tag}] TIMEOUT f${f} ${JSON.stringify(pos(role))}`);
}
const S = (tag) => console.log(`== f${f} ${tag} wg=${JSON.stringify(pos("wg"))} l3=${leverG(0)?.state} p1Y=${Math.round(platG(0)?.body.GetPosition().y*-32)}`);

function* wgScript() {
  yield S("W0 spawn(128)");
  // W1 东行到水箱西缘（板缘190 → 中心180贴缘），直接走入水中
  yield* walkU("wg","R", s => s.x >= 178, 200, "W1 ->178(入水沿)");
  // W2 水中潜下+持西：从水面(256)下沉过楔(底部~281)入袋，随重力落 512 板
  yield S("W2 潜水过楔下(持W+自然下沉 80f)");
  for (let i=0;i<80;i++) yield dir("L");
  yield* coast("wg");
  yield S("W3 袋内落到 512 板? 走到杆东侧");
  yield* walkU("wg","R", s => s.x >= 126, 120, "W3 ->126");
  yield* coast("wg", 15);
  yield S("W4 扳 l3（持W 35f）");
  for (let i=0;i<35;i++) yield dir("L");
  yield* coast("wg");
  yield S("W5 东行出板缘(190) 落缘台(704)");
  yield* walkU("wg","R", s => s.x >= 188, 150, "W5 ->188");
  for (let i=0;i<45;i++) yield ins0;
  yield* coast("wg");
  yield S("W6 缘台东行 下水 泳渡 704 池");
  yield* walkU("wg","R", s => s.x >= 210, 100, "W6 ->210(下水)");
  // 泳渡：浮游持东（若浮力顶住则持续按东即可），最多 300f
  for (let i=0;i<300;i++) yield dir("R");
  yield* coast("wg");
  yield S("W7 东岸爬出 走进门(480-544)");
  yield* walkU("wg","R", s => s.x >= 510, 200, "W7 ->510");
  yield* coast("wg");
  yield S("W8 门内微调驻守");
  yield* walkU("wg","L", s => s.x <= 505, 40, "W8 ->505");
  for (let i=0;i<60;i++) yield ins0;
  yield S("W9 end");
}
const it = wgScript();
for (let i=0;i<3000;i++) {
  const a = it.next();
  frame(a.value ?? ins0);
  if (a.done) break;
}
console.log("FINAL f"+f, JSON.stringify(pos("wg")));
console.log("levers:", w.mechs.levers.map(l=>`g${l.group}=${l.state}`).join(" "));
console.log("platforms:", w.mechs.platforms.map(p=>`(${Math.round(p.body.GetPosition().x*-32)},${Math.round(p.body.GetPosition().y*-32)})`).join(" "));
console.log("events:", evs.join("\n  "));
