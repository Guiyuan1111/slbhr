/** light_01 双人全编队 v34（接线纠正版）
 *  接线实证：lever(g2)→rotMirror(1021,163)转90°→黄光上折→group42(1024,32)亮→p1下沉；
 *  group41(1208,736)亮←箱镜反射→p2降(656)；翻杆后 group41 永灭→p2 永升→台口封死。
 *  ⇒ 时序铁律：两人都必须在翻杆前过完台口(p2)。
 *  fb：厅→柱→p3候→832跳→台地→箱舞M1-M7→massif→隙缝跳→舌台→基座[等wg过台口]→翻杆
 *     →回落→穿p1→走廊538→越钮西落→伺服推钮入窗[458,464]→等p0开槽→落槽→坑→门f(80)
 *  wg：晚170f→同径→箱舞→M7成(过台口)→"arrived"驻730→等p1沉(fx<600)→穿p1→走廊556
 *     →等槽开(p0≥295)→越钮→落槽→坑→门w(300) */
import { makeWorld } from "../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("light_01");
for (let f = 0; f < 30; f++) w.step(1 / 60, { fireboy: {}, watergirl: {} });
const ms = () => w.mechSnapshot();
const p0 = w.mechs.platforms[0], p1 = w.mechs.platforms[1], p3 = w.mechs.platforms[3];
const px = (b) => -b.GetPosition().x * 32, py = (b) => -b.GetPosition().y * 32;
const S = () => ms().sliders[0].x;
const sv = () => Math.abs(-w.mechs.sliders[0].body.GetLinearVelocity().x * 32);
const boxX = () => px(w.mechs.boxMirrors[0].body);
const boxV = () => Math.abs(-w.mechs.boxMirrors[0].body.GetLinearVelocity().x * 32);
const FB = { st: "run", jumpF: 0, runN: 0, burst: 0, settle: 0 };
const WG = { st: "run", jumpF: 0, runN: 0, burst: 0, settle: 0 };
let f = 0;
const log = (who, o, s) => console.log(`f${f} ${who}[${o.st}] ${s}`);
const mstep = (o, who, x, y, vx, inp, next) => {
  const bX = boxX();
  switch (o.st) {
    case "M1": inp.right = 1; if (x >= 947) { o.st = "M2"; log(who, o, `触箱 (${x.toFixed(0)})`); } break;
    case "M2": inp.right = 1; if (bX >= 1045) { o.st = "M3"; log(who, o, `箱让开 b=${bX.toFixed(0)}`); } break;
    case "M3": inp.right = 1; if (x >= 1000) { o.st = "M4"; o.jumpF = 0; } break;
    case "M4": if (o.jumpF++ < 30) { inp.up = 1; inp.right = 1; } else inp.right = 1;
      if (o.jumpF > 30 && y > 760 && x > 1040) { o.st = "M5"; o.burst = 0; log(who, o, `箱东落地 (${x.toFixed(0)},${y.toFixed(0)}) b=${bX.toFixed(0)}`); }
      if (o.jumpF > 220) o.st = "FAIL"; break;
    case "M5": if (o.burst < 8) { inp.left = 1; o.burst++; }
      else if (boxV() < 0.5) {
        if (bX > 1020) o.burst = 0;
        else { o.st = "M6"; o.burst = 0; log(who, o, `箱回位 b=${bX.toFixed(0)}`); } } break;
    case "M6": {
      let rec = false;
      if (bX < 988) { if (o.burst < 6) { inp.right = 1; o.burst++; }
        else if (boxV() < 0.5) { if (bX < 995) o.burst = 0; else rec = true; } }
      else rec = true;
      if (rec) { inp.right = 1;
        if (x >= 1048 && Math.abs(vx) < 0.05) { o.st = "M7"; o.settle = 0; o.jumpF = 0; } }
    } break;
    case "M7": if (++o.settle > 15) {
      if (o.jumpF++ < 40) { inp.up = 1; inp.left = 1; } else inp.left = 1;
      if (x <= 745 && y >= 530 && y <= 620) { o.st = next; log(who, o, `mount! (${x.toFixed(0)},${y.toFixed(0)}) p2=${py(w.mechs.platforms[2].body).toFixed(0)}`); }
      if (o.jumpF > 400) o.st = "FAIL";
    } break;
  }
};
const rec = { fb: [], wg: [] };
const FB_PAST = ["atmassif", "sliver", "tongue", "leverwait", "lever", "descend", "crossp1", "corridor", "jumpsl", "pushgo", "pushservo", "pushover", "pushtap", "slotwait", "toslot", "pocket", "DOOR"];
const WG_LEDGED = ["arrived", "waitp1", "crossp1", "corridor", "waitS", "jumpsl", "toslot", "pocket", "DOOR"];
for (f = 0; f < 3600; f++) {
  const fb = w.players.fireboy, wg = w.players.watergirl;
  const fx = px(fb.body), fy = py(fb.body) + 35.2;
  const wx = px(wg.body), wy = py(wg.body) + 35.2;
  let fi = {}, wi = {};
  // ================= FB =================
  if (FB.st[0] === "M") mstep(FB, "fb", fx, fy, fb.body.GetLinearVelocity().x, fi, "atmassif");
  else switch (FB.st) {
    case "run": fi = { right: 1 };
      if (fx > 550 && fx < 585 && fy > 890) { FB.st = "pillar"; FB.jumpF = 4; } break;
    case "pillar": fi = FB.jumpF-- > 0 ? { right: 1, up: 1 } : { right: 1 };
      if (fy > 890 && fx > 612) FB.st = "toramp"; break;
    case "toramp": fi = { right: 1 };
      if (fx >= 740 && fy > 860 && py(p3.body) < 850) fi = {};
      if (fx >= 740 && fx < 783 && fy > 860 && py(p3.body) > 850) { FB.st = "hop832"; FB.jumpF = 20; } break;
    case "hop832": fi = FB.jumpF-- > 0 ? { right: 1, up: 1 } : { right: 1 };
      if (fy < 838 && fy > 700 && fx > 795 && fx < 900) FB.st = "climbE";
      if (FB.jumpF < -40) FB.st = "FAIL"; break;
    case "climbE": fi = { right: 1 };
      if (fx >= 925 && fy > 766 && Math.abs(fb.body.GetLinearVelocity().y) < 0.05) { FB.st = "M1"; log("fb", FB, "抵台地"); } break;
    case "atmassif": fi = fx > 704 ? { left: 1 } : {};
      if (fx <= 704 && Math.abs(fb.body.GetLinearVelocity().x) < 0.05) { FB.st = "sliver"; FB.runN = 5; FB.jumpF = 40; } break;
    case "sliver": fi = FB.runN-- > 0 ? { right: 1 } : FB.jumpF-- > 0 ? { right: 1, up: 1 } : {};
      if (fy > 405 && fy < 452 && fx > 736 && fx < 772) { FB.st = "tongue"; log("fb", FB, `登舌台 (${fx.toFixed(0)},${fy.toFixed(0)})`); }
      if (FB.jumpF < -40) FB.st = "FAIL"; break;
    case "tongue": fi = { right: 1 };
      if (fy < 390 && fx > 802) { FB.st = "leverwait"; log("fb", FB, "基座候杆(西侧 810) 等wg过台口"); } break;
    case "leverwait": fi = fx > 810 ? { left: 1 } : {};
      if (fx <= 810 && WG_LEDGED.includes(WG.st)) FB.st = "lever"; break;
    case "lever": fi = fx < 900 ? { right: 1 } : {};
      if (ms().levers[0].state === 1) { FB.st = "descend"; log("fb", FB, "杆翻!"); } break;
    case "descend": fi = { left: 1 };
      if (fy > 538 && fy < 560 && fx < 742) FB.st = "crossp1"; break;
    case "crossp1": fi = py(p1.body) > 555 ? { left: 1 } : {};
      if (fx < 638 && py(p1.body) > 555) FB.st = "corridor"; break;
    case "corridor": fi = fx > 538 ? { left: 1 } : {};
      if (fx <= 538) { FB.st = "jumpsl"; FB.runN = 4; FB.jumpF = 40; } break;
    case "jumpsl": fi = FB.runN-- > 0 ? { left: 1 } : FB.jumpF-- > 0 ? { left: 1, up: 1 } : {};
      if (FB.jumpF < 5 && fy > 530 && fy < 562 && fx > 270 && fx < 436) { FB.st = "pushgo"; log("fb", FB, `越钮西落 (${fx.toFixed(0)},${fy.toFixed(0)})`); }
      if (FB.jumpF < -40) FB.st = "FAIL"; break;
    case "pushgo": fi = { right: 1 };
      if (fx >= S() - 26) { FB.st = "pushservo"; FB.burst = 0; } break;
    case "pushservo": {
      if (sv() < 0.5) {
        const s = S();
        if (s >= 458 && s <= 464) { FB.st = "slotwait"; FB.jumpF = 0; log("fb", FB, `钮入窗 S=${s.toFixed(1)}`); }
        else if (s < 458) { if (FB.burst < 2) { fi = { right: 1 }; FB.burst++; } else FB.burst = 0; }
        else { FB.st = "pushover"; FB.jumpF = 0; log("fb", FB, `钮过冲 S=${s.toFixed(1)} 跳东回拨`); }
      }
      FB.jumpF++;
      if (FB.jumpF > 900) FB.st = "FAIL";
    } break;
    case "pushover": if (FB.jumpF++ < 30) fi = { up: 1, right: 1 }; else fi = { right: 1 };
      if (FB.jumpF > 40 && Math.abs(fb.body.GetLinearVelocity().x) < 0.05 && fx > S() + 20) { FB.st = "pushtap"; FB.burst = 0; }
      if (FB.jumpF > 160) FB.st = "FAIL"; break;
    case "pushtap": {
      if (sv() < 0.5) {
        const s = S();
        if (s >= 458 && s <= 464) { FB.st = "slotwait"; FB.jumpF = 0; log("fb", FB, `钮入窗(东拨) S=${s.toFixed(1)}`); }
        else if (s > 464) { if (FB.burst < 1) { fi = { left: 1 }; FB.burst++; } else FB.burst = 0; }
        else { FB.st = "pushoverW"; FB.jumpF = 0; }
      }
      FB.jumpF++;
      if (FB.jumpF > 900) FB.st = "FAIL";
    } break;
    case "pushoverW": if (FB.jumpF++ < 30) fi = { up: 1, left: 1 }; else fi = { left: 1 };
      if (FB.jumpF > 40 && Math.abs(fb.body.GetLinearVelocity().x) < 0.05 && fx < S() - 20) { FB.st = "pushservo"; FB.burst = 0; }
      if (FB.jumpF > 160) FB.st = "FAIL"; break;
    case "slotwait": fi = {};
      if (px(p0.body) >= 295) { FB.st = "toslot"; log("fb", FB, `槽开 p0=${px(p0.body).toFixed(0)}`); }
      if (++FB.jumpF > 600) { FB.st = "FAIL"; log("fb", FB, `槽未开 p0=${px(p0.body).toFixed(0)} S=${S().toFixed(1)}`); } break;
    case "toslot": fi = { left: 1 };
      if (fy > 666 && fy < 680) { FB.st = "pocket"; log("fb", FB, `落坑底 (${fx.toFixed(0)},${fy.toFixed(0)})`); } break;
    case "pocket": fi = fx > 80 ? { left: 1 } : {};
      if (fx <= 82 && fy > 660) { FB.st = "DOOR"; log("fb", FB, "** 门f"); } break;
  }
  // ================= WG =================
  if (WG.st[0] === "M") mstep(WG, "wg", wx, wy, wg.body.GetLinearVelocity().x, wi, "arrived");
  else switch (WG.st) {
    case "run": wi = f >= 170 ? { right: 1 } : {};
      if (wx > 550 && wx < 585 && wy > 890) { WG.st = "pillar"; WG.jumpF = 4; } break;
    case "pillar": wi = WG.jumpF-- > 0 ? { right: 1, up: 1 } : { right: 1 };
      if (wy > 890 && wx > 612) WG.st = "toramp"; break;
    case "toramp": {
      if (!FB_PAST.includes(FB.st)) { wi = wx > 662 ? { left: 1 } : {}; break; }
      wi = { right: 1 };
      if (wx >= 740 && wy > 860 && py(p3.body) < 850) wi = {};
      if (wx >= 740 && wx < 783 && wy > 860 && py(p3.body) > 850) { WG.st = "hop832"; WG.jumpF = 20; }
    } break;
    case "hop832": wi = WG.jumpF-- > 0 ? { right: 1, up: 1 } : { right: 1 };
      if (wy < 838 && wy > 700 && wx > 795 && wx < 900) WG.st = "climbE";
      if (WG.jumpF < -40) WG.st = "FAIL"; break;
    case "climbE": wi = { right: 1 };
      if (wx >= 925 && wy > 766 && Math.abs(wg.body.GetLinearVelocity().y) < 0.05) { WG.st = "M1"; log("wg", WG, "抵台地"); } break;
    case "arrived": wi = wx > 732 ? { left: 1 } : {};
      if (wx <= 732) WG.st = "waitp1"; break;
    case "waitp1": wi = {};
      if (py(p1.body) > 555 && fx < 600) WG.st = "crossp1"; break;
    case "crossp1": wi = py(p1.body) > 555 ? { left: 1 } : {};
      if (wx < 638 && py(p1.body) > 555) WG.st = "corridor"; break;
    case "corridor": wi = wx > 576 ? { left: 1 } : {};
      if (wx <= 576) { WG.st = "waitS"; log("wg", WG, "钮东驻停 576 等槽开"); } break;
    case "waitS": wi = {};
      if (px(p0.body) >= 295) { WG.st = "jumpsl"; WG.runN = 4; WG.jumpF = 40; } break;
    case "jumpsl": wi = WG.runN-- > 0 ? { left: 1 } : WG.jumpF-- > 0 ? { left: 1, up: 1 } : {};
      if (WG.jumpF < 5 && wy > 530 && wy < 562 && wx > 270 && wx < 450) { WG.st = "toslot"; log("wg", WG, `越钮西落 (${wx.toFixed(0)},${wy.toFixed(0)})`); }
      if (WG.jumpF < -40) WG.st = "FAIL"; break;
    case "toslot": wi = { left: 1 };
      if (wy > 666 && wy < 680) { WG.st = "pocket"; log("wg", WG, `落坑底 (${wx.toFixed(0)},${wy.toFixed(0)})`); } break;
    case "pocket": wi = wx < 296 ? { right: 1 } : wx > 304 ? { left: 1 } : {};
      if (wx >= 296 && wx <= 304 && wy > 660) { WG.st = "DOOR"; log("wg", WG, "** 门w"); } break;
  }
  if (f === 1250 || f === 1300 || f === 1900) for (const [i, bm] of (w.mechs.beamers ?? []).entries()) console.log(`RAY f${f} b[${i}]: ${(bm.beamPts ?? []).map(pt => `(${(-pt.x*32).toFixed(0)},${(-pt.y*32).toFixed(0)})`).join(">")}`);
  if (f >= 1150 && f <= 1300) {
    const evs = w.stepEvents ?? [];
    if (evs.length) console.log(`EV f${f}: ${evs.map(e => JSON.stringify(e)).join(" ")}`);
  }
  if (w.phase !== "playing") { console.log(`\n*** ${w.phase.toUpperCase()} at f${f} ***`); break; }
  if (FB.st === "FAIL" || WG.st === "FAIL") { console.log(`** FAIL fb[${FB.st}] wg[${WG.st}] f${f}`); break; }
  rec.fb.push(fi); rec.wg.push(wi);
  w.step(1 / 60, { fireboy: fi, watergirl: wi });
  if (f % 100 === 0) console.log(`.. f${f} fb[${FB.st}](${fx.toFixed(0)},${fy.toFixed(0)}) wg[${WG.st}](${wx.toFixed(0)},${wy.toFixed(0)}) b=${boxX().toFixed(0)} S=${S().toFixed(0)} p0=${px(p0.body).toFixed(0)} p1=${py(p1.body).toFixed(0)} p2=${py(w.mechs.platforms[2].body).toFixed(0)} P=${ms().lightPushers.map(q => q.state).join("")} rm=${(w.mechs.rotMirrors[0].body.GetAngle()*180/Math.PI).toFixed(0)}`);
}
if (w.phase === "won" && process.argv[2] === "--record") {
  const SETTLE = 30; // FSM 主循环前的静置帧：事件平移，回放端无静置也对齐
  const compress = (arr) => {
    const ev = [];
    const cur = { left: 0, right: 0, up: 0 };
    arr.forEach((inp, f) => {
      for (const d of ["left", "right", "up"]) {
        const v = inp[d] ? 1 : 0;
        if (v !== cur[d]) { ev.push({ f: f + SETTLE, dir: d, type: v ? "down" : "up" }); cur[d] = v; }
      }
    });
    return ev;
  };
  const route = {
    level: "light_01",
    source: "bot v35 箱舞+伺服钮: 双人东梯箱舞mount(M1-M7 东推箱穿缝越东推回静定1048 {up,left})→坡链→massif→fb 隙缝跳→舌台→基座西810候 wg 过台口→翻杆(杠杆g2→rotMirror转→g42亮→p1沉)→穿p1→走廊538→越钮西落→伺服推钮入窗S458-464→等p0开槽208→304→落槽→坑→门f; wg 晚170f同径→箱舞→M7成(arrived 732)→等p1沉→穿p1→走廊576→等槽开→越钮→落槽→坑→门w",
    tickHz: 60,
    totalFrames: rec.fb.length + 30,
    fb: compress(rec.fb),
    wg: compress(rec.wg),
  };
  (await import("node:fs")).writeFileSync("scripts/e2e/inputs/routes/light_01.json", JSON.stringify(route, null, 1) + "\n");
  console.log(`route written: fb=${route.fb.length} wg=${route.wg.length} events, ${route.totalFrames} frames`);
  const { expandFlat } = await import("../scripts/e2e/routetool/kernel.mjs");
  const ins = expandFlat(route.fb, route.wg, route.totalFrames);
  let bad = -1;
  for (let f = 0; f < rec.fb.length; f++) {
    const a = ins.fb[f + 30], b = rec.fb[f];
    if (!!a.left !== !!b.left || !!a.right !== !!b.right || !!a.up !== !!b.up) { bad = f; break; }
  }
  console.log(`fb diff first at f=${bad}`);
  let badw = -1;
  for (let f = 0; f < rec.wg.length; f++) {
    const a = ins.wg[f + 30], b = rec.wg[f];
    if (!!a.left !== !!b.left || !!a.right !== !!b.right || !!a.up !== !!b.up) { badw = f; break; }
  }
  console.log(`wg diff first at f=${badw}`);
}
const fbF = w.players.fireboy, wgF = w.players.watergirl;
console.log(`final f${f} phase=${w.phase} fb[${FB.st}](${px(fbF.body).toFixed(0)},${(py(fbF.body)+35.2).toFixed(0)}) wg[${WG.st}](${px(wgF.body).toFixed(0)},${(py(wgF.body)+35.2).toFixed(0)}) b=${boxX().toFixed(0)} S=${S().toFixed(1)} p0=${px(p0.body).toFixed(0)}`);
