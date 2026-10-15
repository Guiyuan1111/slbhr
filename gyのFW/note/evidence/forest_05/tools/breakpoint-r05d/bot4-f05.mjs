// f05 路线求解 v4（r05d）：东梯零杠杆路线（02号档 §4）
//  - fb/wg 同构爬东梯（P3东→右704台→P1东→东512台→P2东→东320台→中心块），仅 fb 翻杆2
//  - fb: 中心块→东跳b32→1056块→落b2自重下行→西跳进右ledge走廊→fb门948
//  - wg: 中心块→西行b33→192块西缘tip-off+东漂→左ledge→wg门304
//  - 东512台→P2东 = runJump(left) 全程压左：东320台底撞头(体心370)高于落点(383.5)，撞后弹道落 P2 东位带（02号档§3）
import { writeFileSync } from "node:fs";
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
import { NONE, S, drive, toRouteDoc } from "./botcore.mjs";

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const TOTAL = Number(argOf("total", "3600"));
const RIDE_HOP_Y = Number(argOf("ridey", "530"));   // fb b2 下行中西跳触发体心
const WG_TIP_K = Number(argOf("tipk", "28"));       // wg tip-off 后东漂帧数

// ---- 谓词 ----
const ms = (c) => c.w.mechSnapshot();
const p3East = (c) => ms(c).platforms[2].x >= 698;
const lev2On = (c) => ms(c).levers[1].state === 1;

// ---- 原语（沿用 r05b bot3 S2，实证可用）----
const S2 = {
  settle: (name = "落定") => ({ name, run: () => NONE, done: (c) => c.me.grounded && Math.abs(c.me.vy) < 8 && Math.abs(c.me.vx) < 8 }),
  wait: (pred, name = "等") => ({ name, run: () => NONE, done: pred }),
  sleep: (n, name = "sleep" + n) => { let t = 0; return { name, run: () => NONE, done: () => ++t >= n }; },
  hold: (dir, pred, name = "hold" + dir) => ({ name, run: () => ({ ...NONE, [dir]: true }), done: pred }),
  /** 刹车跳：驻留3帧垂直起跳，center<aboveY 后朝 dir 漂，越 brakeAtX 压反向刹（vx同向>30才压），落地完成 */
  brakedHop: (dir, aboveY, brakeAtX, name = "bh" + dir + brakeAtX) => {
    let jumped = false, gF = 0;
    const anti = dir === "right" ? "left" : "right";
    return {
      name,
      run: (c) => {
        if (!jumped) {
          if (c.me.grounded) { gF++; if (gF >= 3 && Math.abs(c.me.vx) < 160) return { ...NONE, up: true }; }
          else gF = 0;
          if (!c.me.grounded) jumped = true;
          return { ...NONE };
        }
        const past = dir === "right" ? c.me.x >= brakeAtX : c.me.x <= brakeAtX;
        if (c.me.y < aboveY && !past) return { ...NONE, [dir]: true };
        if (past) {
          const moving = dir === "right" ? c.me.vx > 30 : c.me.vx < -30;
          return moving ? { ...NONE, [anti]: true } : NONE;
        }
        return NONE;
      },
      done: (c) => jumped && c.me.grounded && c.me.vy >= -8,
    };
  },
  /** 助跑跳：hold dir 累速，越 line 落地即跳，空中持续压 dir 直到落地 */
  runJump: (dir, line, name = "rj" + dir + line) => {
    let jumped = false, air = false;
    return {
      name,
      run: (c) => {
        const i = { ...NONE, [dir]: true };
        if (!jumped && c.me.grounded && (dir === "right" ? c.me.x >= line : c.me.x <= line)) { i.up = true; jumped = true; }
        return i;
      },
      done: (c) => { if (jumped && !c.me.grounded) air = true; return jumped && air && c.me.grounded; },
    };
  },
  /** 缘口坠落：朝 dir 蠕2帧出缘，空中压反向 holdF 帧后真刹（同向>30才压），落地完成 */
  edgeDrop: (dir, holdF, name = "ed" + dir) => {
    const anti = dir === "right" ? "left" : "right";
    let t = 0, off = false;
    return {
      name,
      run: (c) => {
        if (!off) {
          if (t >= 2 && !c.me.grounded) { off = true; t = 0; return { ...NONE, [anti]: true }; }
          if (t < 2) { t++; return { ...NONE, [dir]: true }; }
          return { ...NONE, [dir]: true };
        }
        t++;
        if (t <= holdF) return { ...NONE, [anti]: true };
        const moving = dir === "right" ? c.me.vx < -30 : c.me.vx > 30;
        return moving ? { ...NONE, [dir]: true } : NONE;
      },
      done: (c) => off && c.me.grounded && c.me.vy >= -8,
    };
  },
};

// ---- fb 线 ----
const fb = [
  S2.settle("落定"), S2.sleep(3, "起手"),
  S2.hold("right", (c) => c.me.x >= 465 && c.me.grounded && c.me.y > 850, "走到P3西下方"),
  S2.brakedHop("right", 860, 530, "跳上P3西"),
  S2.wait((c) => c.me.grounded && c.me.y < 820, "P3西面确认"),
  S.goTo(520, 6, "P3西段走位"),
  S2.brakedHop("left", 740, 470, "西跳左704台"),
  S2.wait((c) => c.me.grounded && c.me.y < 745, "704台确认"),
  S2.hold("left", (c) => lev2On(c) || c.me.x <= 412, "西行碰杆2"),
  S2.sleep(8, "杆2翻转确认"),
  S.goTo(470, 6, "台东端走位"),
  S2.edgeDrop("right", 2, "东出台缘落地板"),
  S2.wait((c) => c.me.grounded && c.me.y > 850, "地板落定"),
  S.goTo(580, 6, "地板东行"),
  S2.brakedHop("right", 850, 700, "地板跳上P3东位"),
  S2.wait((c) => c.me.grounded && c.me.y < 830 && c.me.x > 630, "P3东面确认"),
  S.goTo(695, 8, "P3东走位"),
  S2.brakedHop("right", 760, 790, "邻接跳右704台"),
  S2.wait((c) => c.me.grounded && c.me.y < 745 && c.me.x > 750, "右704台确认"),
  S.goTo(780, 6, "台西端走位"),
  S2.brakedHop("left", 660, 700, "西跳P1东位"),
  S2.wait((c) => c.me.grounded && c.me.y < 640, "P1东面确认"),
  S2.brakedHop("right", 560, 775, "东跳东512台"),
  S2.wait((c) => c.me.grounded && c.me.y < 530 && c.me.x > 745, "东512台确认"),
  S.goTo(800, 6, "台东段走位"),
  S2.brakedHop("left", 480, 710, "垂直跳西漂P2东(710刹)"),
  S2.wait((c) => c.me.grounded && c.me.y < 445 && c.me.x < 762, "P2东面确认"),
  S.goTo(745, 6, "P2东东端走位"),
  S2.brakedHop("right", 300, 850, "垂直跳东漂上东320台"),
  S2.wait((c) => c.me.grounded && c.me.y < 345 && c.me.x > 765, "东320台确认"),
  S2.hold("left", (c) => c.me.x <= 790 && c.me.grounded && c.me.y < 345, "台西端走位"),
  S2.runJump("left", 788, "满速西跳中心块"),
  S2.wait((c) => c.me.grounded && c.me.y < 260 && c.me.x > 540, "中心块确认"),
  S2.hold("right", (c) => c.me.x >= 690 && c.me.grounded && c.me.y < 260, "中心块东端走位"),
  S2.runJump("right", 692, "东跳768块/b32走廊"),
  S2.wait((c) => c.me.grounded && c.me.y < 170 && c.me.x > 770, "走廊确认"),
  S2.hold("right", (c) => c.me.grounded && c.me.y > 130 && c.me.y < 300 && c.me.x >= 1060, "东行1056端走出"),
  S2.wait((c) => c.me.grounded && c.me.y > 140 && c.me.y < 300 && c.me.x > 1055, "b2乘坐确认"),
  {
    name: "b2下行西跳",
    run: (c) => {
      if (c.me.grounded && c.me.y >= RIDE_HOP_Y) return { ...NONE, up: true, left: true };
      if (!c.me.grounded && c.me.x > 950) return { ...NONE, left: true };
      return NONE;
    },
    done: (c) => !c.me.grounded,
  },
  S2.wait((c) => c.me.grounded && c.me.y < 580 && c.me.x < 1050, "右ledge走廊落定"),
  S2.hold("right", (c) => c.me.x >= 944 && c.me.grounded && c.me.y < 580, "东行fb门带"),
  S2.sleep(300, "驻门WIN"),
];

// ---- wg 线 ----
const wg = [
  S2.settle("落定"), S2.sleep(3, "起手"),
  S2.wait((c) => p3East(c), "等fb杆2→P3东"),
  S2.hold("left", (c) => c.me.x <= 812 && c.me.grounded && c.me.y > 850, "西行到起跳位"),
  S2.brakedHop("left", 860, 700, "西跳P3东位"),
  S2.wait((c) => c.me.grounded && c.me.y < 820 && c.me.x > 620, "P3东面确认"),
  S.goTo(695, 8, "P3东走位"),
  S2.brakedHop("right", 760, 790, "邻接跳右704台"),
  S2.wait((c) => c.me.grounded && c.me.y < 745 && c.me.x > 750, "右704台确认"),
  S.goTo(780, 6, "台西端走位"),
  S2.brakedHop("left", 660, 700, "西跳P1东位"),
  S2.wait((c) => c.me.grounded && c.me.y < 640, "P1东面确认"),
  S2.brakedHop("right", 560, 775, "东跳东512台"),
  S2.wait((c) => c.me.grounded && c.me.y < 530 && c.me.x > 745, "东512台确认"),
  S.goTo(800, 6, "台东段走位"),
  S2.brakedHop("left", 480, 710, "垂直跳西漂P2东(710刹)"),
  S2.wait((c) => c.me.grounded && c.me.y < 445 && c.me.x < 762, "P2东面确认"),
  S.goTo(745, 6, "P2东东端走位"),
  S2.brakedHop("right", 300, 850, "垂直跳东漂上东320台"),
  S2.wait((c) => c.me.grounded && c.me.y < 345 && c.me.x > 765, "东320台确认"),
  S2.hold("left", (c) => c.me.x <= 790 && c.me.grounded && c.me.y < 345, "台西端走位"),
  S2.runJump("left", 788, "满速西跳中心块"),
  S2.wait((c) => c.me.grounded && c.me.y < 260 && c.me.x > 540, "中心块确认"),
  S2.hold("left", (c) => c.me.x <= 240 && c.me.grounded && c.me.y < 260, "西行走廊(中心块→448块→b33)"),
  S2.hold("left", (c) => c.me.x <= 205 && c.me.grounded && c.me.y < 260, "b33西段→192块"),
  {
    ...S2.edgeDrop("left", WG_TIP_K, "192块西缘tip-off+东漂"),
    done: (c) => c.me.grounded && c.me.vy >= -8 && c.me.y < 600,
  },
  S2.wait((c) => c.me.grounded && c.me.y < 580 && c.me.x > 225, "左ledge落定"),
  S2.hold("right", (c) => c.me.x >= 300 && c.me.grounded && c.me.y < 580, "东行wg门带"),
  S2.sleep(300, "驻门WIN"),
];

const w = makeWorld("forest_05");
// 机构观测：每 30f 记录平台/杠杆状态（定位机关被谁翻动）
const mechLog = [];
const r = drive(w, { fb, wg }, TOTAL, {
  logSteps: true, traceAll: true,
  onFrame: (f) => {
    if (f % 30 !== 0) return;
    const m = w.mechSnapshot();
    const st = w.mechanisms.levers.map((l) => l.state).join(",");
    const sig = `${m.platforms.map((p) => p.x.toFixed(0)).join("/")}|${st}`;
    if (mechLog.length && mechLog[mechLog.length - 1].sig === sig) return;
    mechLog.push({ f, sig });
    console.log(`[mech] f${f} P=${m.platforms.map((p) => p.x.toFixed(0)).join("/")} levers=${st}`);
  },
});
writeFileSync("TEMP/r05d/t5v4.json", JSON.stringify(r.trace));
console.log("result:", JSON.stringify(r.result));
const fbS = w.snapshotPlayer("fireboy"), wgS = w.snapshotPlayer("watergirl");
console.log(`final fb=(${fbS.x.toFixed(1)},${fbS.y.toFixed(1)}) wg=(${wgS.x.toFixed(1)},${wgS.y.toFixed(1)}) phase=${w.phase} fbDoor=${fbS.doorFrame}/${fbS.atDoor} wgDoor=${wgS.doorFrame}/${wgS.atDoor}`);
const out = argOf("out", "");
if (out && r.result.won) {
  const doc = toRouteDoc("forest_05", r.events, Math.min(TOTAL, (r.result.winF ?? TOTAL) + 3), "r05d bot f05 v4 east-ladder");
  writeFileSync(out, JSON.stringify(doc, null, 1));
  console.log("route →", out, "fb/wg 事件:", doc.fb.length, doc.wg.length);
}
