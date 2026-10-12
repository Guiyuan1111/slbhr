// f28-chain.mjs v2 — forest_28 双角色全路线内核验证（板缘即跳 pre=0）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const DT = 1/60;
const ins0 = { up:false, left:false, right:false };
const dir = (d) => d==="L" ? {up:false,left:true,right:false} : d==="R" ? {up:false,left:false,right:true} : {...ins0};
const w = makeWorld("forest_28");
for (let i=0;i<30;i++) w.step(DT, {fireboy:{...ins0},watergirl:{...ins0}});
let f = 0, winF = -1, dieF = -1;
const evs = [];
const cur = { fb:{...ins0}, wg:{...ins0} };
const pos = (r) => { const s = w.snapshotPlayer(r==="fb"?"fireboy":"watergirl"); return { x:Math.round(s.x*10)/10, feet:Math.round((s.y+35.2)*10)/10, dead:!!(s.dead||s.dying) }; };
function frame(iFB, iWG) {
  for (const [key, inp] of [["fb",iFB],["wg",iWG]]) {
    for (const k of ["up","left","right"]) if (!!inp[k] !== !!cur[key][k]) cur[key][k] = !!inp[k];
  }
  const ev = w.step(DT, { fireboy:{...cur.fb}, watergirl:{...cur.wg} });
  f++;
  for (const e of ev) {
    if (e.type === "win") { winF = f; evs.push(`f${f} WIN ${JSON.stringify(e.data)}`); }
    else if (e.type === "gameover") { dieF = f; evs.push(`f${f} GAMEOVER`); }
    else if (e.type === "mech") evs.push(`f${f} MECH ${JSON.stringify(e.event)}`);
  }
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
function* rj(role, d, k) {  // 板缘即跳：已由 walkU 拉满速
  yield { ...dir(d), up:true };
  for (let i=0;i<k;i++) yield dir(d);
}
const S = (tag) => console.log(`== f${f} ${tag} fb=${JSON.stringify(pos("fb"))} wg=${JSON.stringify(pos("wg"))}`);

function* fbScript() {
  yield S("F0 spawn");
  yield* walkU("fb","R", s => s.x >= 178, 200, "F1 sliver->178");
  yield S("F2 跳H1(pre=0)");
  yield* rj("fb","R", 45);
  yield* coast("fb");
  yield S("F3 H2盆涉水东行 出东坡上segment3");
  yield* walkU("fb","R", s => s.x >= 655, 400, "F3 ->655");
  yield* coast("fb", 20);
  yield S("F4 segment3跳H3(pre=0) 预期远航落segment5");
  yield* walkU("fb","R", s => s.x >= 665, 100, "F4a ->665");
  yield* rj("fb","R", 50);
  yield* coast("fb");
  yield S("F5 segment5东行 H5干洞直落416板");
  yield* walkU("fb","R", s => s.x >= 1000, 200, "F5 ->1000");
  yield* coast("fb");
  yield S("F6 416板西行 缺口西跳(pre=0)→west");
  yield* walkU("fb","L", s => s.x <= 912, 200, "F6a ->912");
  yield* rj("fb","L", 30);
  yield* coast("fb");
  yield S("F7 west西行 556缘 落576板");
  yield* walkU("fb","L", s => s.x <= 570, 300, "F7a ->570");
  yield* coast("fb");
  yield S("F8 576板西行 512缘 落704地板");
  yield* walkU("fb","L", s => s.x <= 524, 200, "F8a ->524");
  yield* coast("fb");
  yield S("F9 704地板东行 606缘 落底板入风廊");
  yield* walkU("fb","R", s => s.x >= 600, 200, "F9a ->600");
  yield* coast("fb");
  yield S("F10 底板持东300f：风送+熔岩湖→p1面(1041)钉住");
  for (let i=0;i<300;i++) yield dir("R");
  yield* coast("fb");
  yield S("F11 越p1尝试（预期挤压缝卡死）");
  yield* rj("fb","R", 35);
  yield* coast("fb");
  yield S("F12 end");
}
function* wgScript() {
  yield S("W0 spawn");
  yield* walkU("wg","R", s => s.x >= 168, 200, "W1 sliver->168");
  yield S("W2 跳H1+空中刹西(6R+12L) 落H1东坡/segment2西段");
  yield* rj("wg","R", 6);
  for (let i=0;i<12;i++) yield dir("L");
  for (let i=0;i<40;i++) yield ins0;
  yield* coast("wg");
  yield S("W3 segment2东行助跑 跳H2(pre=0)→segment3/H3");
  yield* walkU("wg","R", s => s.x >= 425, 200, "W3a ->425");
  yield* rj("wg","R", 45);
  yield* coast("wg");
  yield S("W4 涉H3 上segment4");
  yield* walkU("wg","R", s => s.x >= 760, 300, "W4 ->760");
  yield* coast("wg", 20);
  yield S("W5 segment4跳H4(pre=0) 远航→H5落416板");
  yield* walkU("wg","R", s => s.x >= 780, 100, "W5a ->780");
  yield* rj("wg","R", 50);
  yield* coast("wg");
  yield S("W6 416板西行 缺口西跳(pre=0)");
  yield* walkU("wg","L", s => s.x <= 912, 300, "W6a ->912");
  yield* rj("wg","L", 30);
  yield* coast("wg");
  yield S("W7 west→556缘→576板→512缘→704地板");
  yield* walkU("wg","L", s => s.x <= 570, 300, "W7a ->570");
  yield* coast("wg");
  yield* walkU("wg","L", s => s.x <= 524, 200, "W7b ->524");
  yield* coast("wg");
  yield S("W8 704地板西行进wg门 驻守505");
  yield* walkU("wg","L", s => s.x <= 505, 150, "W8 ->505");
  for (let i=0;i<1500;i++) yield ins0;
  yield S("W9 end");
}
const itFB = fbScript(), itWG = wgScript();
for (let i=0;i<5000;i++) {
  const a = itFB.next(), b = itWG.next();
  frame(a.value ?? ins0, b.value ?? ins0);
  if (a.done && b.done) break;
}
console.log(`FINAL f${f} win=${winF} die=${dieF}`);
console.log("fb", JSON.stringify(pos("fb")), "wg", JSON.stringify(pos("wg")));
console.log("doors:", JSON.stringify({ fb: w.built?.doors?.fireboy?.isUp, wg: w.built?.doors?.watergirl?.isUp }));
console.log("levers:", w.mechs.levers.map(l=>`g${l.group}=${l.state}`).join(" "));
console.log("platforms:", w.mechs.platforms.map(p=>`(${Math.round(p.body.GetPosition().x*-32)},${Math.round(p.body.GetPosition().y*-32)})`).join(" "));
console.log("events:", evs.slice(0,30).join("\n  "));
