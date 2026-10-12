// f28-p1.mjs — forest_28 探测 P1/P2：fb 西袋下井(贴左漂移)→l3 翻闸→p1 沉→沿缘回底→风廊东渡→熔岩湖→东底板→门
// wg 本探针闲置（spawn 台安全）。
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const DT = 1/60;
const ins0 = { up:false, left:false, right:false };
const dir = (d) => d==="L" ? {up:false,left:true,right:false} : d==="R" ? {up:false,left:false,right:true} : {...ins0};
const w = makeWorld("forest_28");
for (let i=0;i<30;i++) w.step(DT, {fireboy:{...ins0},watergirl:{...ins0}});
let f = 0;
const evs = [];
const cur = { fb:{...ins0}, wg:{...ins0} };
const leverG = (g) => w.mechs.levers.find(l => l.group === g);
const platG = (g) => w.mechs.platforms.find(p => p.group === g);
const pos = (r) => { const s = w.snapshotPlayer(r==="fb"?"fireboy":"watergirl"); return { x:Math.round(s.x*10)/10, feet:Math.round((s.y+35.2)*10)/10, dead:!!(s.dead||s.dying) }; };
function frame(iFB, iWG) {
  for (const [key, inp] of [["fb",iFB],["wg",iWG]]) {
    for (const k of ["up","left","right"]) {
      if (!!inp[k] !== !!cur[key][k]) cur[key][k] = !!inp[k];
    }
  }
  const ev = w.step(DT, { fireboy:{...cur.fb}, watergirl:{...cur.wg} });
  f++;
  for (const e of ev) if (e.type!=="mech") evs.push(`f${f} ${e.type} ${JSON.stringify(e.data||"")}`);
  for (const e of ev) if (e.type==="mech") evs.push(`f${f} MECH ${JSON.stringify(e.event)}`);
}
function* coast(role, max=90, tag="") {
  let last=null, stable=0;
  for (let i=0;i<max;i++) {
    const s = pos(role);
    if (last && Math.abs(s.x-last.x)<0.4 && Math.abs(s.feet-last.feet)<0.4) { stable++; if (stable>=8) return; } else stable=0;
    last = s; yield ins0;
  }
}
function* walkU(role, d, pred, max=400, tag="") {
  for (let i=0;i<max;i++) { if (pred(pos(role))) { console.log(`  [${tag}] done f${f} ${JSON.stringify(pos(role))}`); return; } yield dir(d); }
  console.log(`  [${tag}] TIMEOUT f${f} ${JSON.stringify(pos(role))}`);
}
const S = (tag) => { console.log(`== f${f} ${tag} fb=${JSON.stringify(pos("fb"))} wg=${JSON.stringify(pos("wg"))} l3=${leverG(0)?.state} p1=${JSON.stringify(platG(0)?.body.GetPosition().x*-32+","+(platG(0)?.body.GetPosition().y*-32))}`); };

function* fbScript() {
  yield S("F0 spawn");
  // F1 东行至 H1 西缘（板缘 190，角色半宽15 → 中心到 172 即贴缘）
  yield* walkU("fb","R", s => s.x >= 172, 200, "F1 walkR->172");
  yield* coast("fb", 15);
  yield S("F2 贴左下井 H1（掉落 232px 进西袋）");
  for (let i=0;i<60;i++) yield dir("L");   // 持左坠落+漂移
  yield* coast("fb");
  yield S("F3 走到拉杆东侧 (l3@112)");
  yield* walkU("fb","R", s => s.x >= 130, 120, "F3 ->130");
  yield* coast("fb", 15);
  yield S("F4 扳 l3（持西 ~35f）");
  for (let i=0;i<35;i++) yield dir("L");
  yield* coast("fb");
  yield S("F5 东行出板缘(190) 落西缘台(704)");
  yield* walkU("fb","R", s => s.x >= 188, 150, "F5 ->188");
  for (let i=0;i<40;i++) yield ins0;      // 直落 192px 至缘台 160-222
  yield* coast("fb");
  yield S("F6 缘台西行 掉西缘(160) 入底板风廊");
  yield* walkU("fb","L", s => s.x <= 150, 80, "F6 ->150");
  for (let i=0;i<50;i++) yield ins0;
  yield* coast("fb");
  yield S("F7 底板持东 风送东渡（过 l0@448、熔岩湖 800-960）");
  for (let i=0;i<400;i++) yield dir("R");  // 长按东：风+跑步+涉熔岩
  yield* coast("fb");
  yield S("F8 东底板行至 fb 门(1120-1184)");
  yield* walkU("fb","R", s => s.x >= 1150, 300, "F8 ->1150");
  yield* coast("fb");
  yield S("F9 门内停（回摆居中 1152）");
  yield* walkU("fb","L", s => s.x <= 1152, 60, "F9 ->1152");
  for (let i=0;i<60;i++) yield ins0;
  yield S("F10 end");
}
function* wgIdle() { for (let i=0;i<4000;i++) yield ins0; }

const itFB = fbScript(), itWG = wgIdle();
let done = false;
for (let i=0;i<4000 && !done;i++) {
  const a = itFB.next(), b = itWG.next();
  frame(a.value ?? ins0, b.value ?? ins0);
  if (a.done) done = true;
}
console.log("FINAL f"+f, "fb", JSON.stringify(pos("fb")), "wg", JSON.stringify(pos("wg")));
console.log("levers:", w.mechs.levers.map(l=>`g${l.group}=${l.state}`).join(" "));
console.log("platforms:", w.mechs.platforms.map(p=>`(${Math.round(p.body.GetPosition().x*-32)},${Math.round(p.body.GetPosition().y*-32)})`).join(" "));
console.log("events:", evs.slice(0,40).join("\n  "));
