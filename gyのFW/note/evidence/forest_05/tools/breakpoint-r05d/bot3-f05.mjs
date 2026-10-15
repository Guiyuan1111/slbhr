// f05 路线求解 v3（r05c）：v2 迭代结论固化
//  - 跳前 3 帧落地驻留（P1 移动板上落地帧起跳会被接触解算吃掉跳跃速度）
//  - fb 主动翻杆1（P2 东移 640-768），wg 等 P2 东到位后从 512台 邻接跳 P2 东端（无贴墙角依赖）
//  - y 谓词全部用体心（feet-35.5）
import { writeFileSync } from "node:fs";
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
import { NONE, drive, toRouteDoc, S } from "./botcore.mjs";

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const TOTAL = Number(argOf("total", "2600"));

// ---- 谓词（体心坐标）----
const ms = (c) => c.w.mechSnapshot();
const platX = (c, i) => ms(c).platforms[i].x; // [0]=P1 [1]=P2 [2]=P3（中心）
const p1West = (c) => platX(c, 0) <= 544.6;
const p3East = (c) => platX(c, 2) >= 698;
const p2East = (c) => platX(c, 1) >= 700;
const lev1On = (c) => ms(c).levers[0].state === 1;
const lev2On = (c) => ms(c).levers[1].state === 1;
const lev3On = (c) => ms(c).levers[2].state === 1;

// ---- 原语 ----
const S2 = {
  settle: (name = "落定") => ({ name, run: () => NONE, done: (c) => c.me.grounded && Math.abs(c.me.vy) < 8 && Math.abs(c.me.vx) < 8 }),
  wait: (pred, name = "等") => ({ name, run: () => NONE, done: pred }),
  sleep: (n, name = "sleep" + n) => { let t = 0; return { name, run: () => NONE, done: () => ++t >= n }; },
  hold: (dir, pred, name = "hold" + dir) => ({ name, run: () => ({ ...NONE, [dir]: true }), done: pred }),
  /** 刹车跳：落地驻留 3 帧后垂直起跳（可携带 ≤160 动量），升过 aboveY 后朝 dir 漂，
   *  越过 brakeAtX 后压反向真刹车（vx 同向 >30 才压），慢了就松手滑行，落地完成 */
  brakedHop: (dir, aboveY, brakeAtX, name = "bh" + dir + brakeAtX) => {
    let jumped = false, gF = 0;
    const anti = dir === "right" ? "left" : "right";
    return {
      name,
      run: (c) => {
        if (!jumped) {
          if (c.me.grounded) { gF++; if (gF >= 3 && Math.abs(c.me.vx) < 160) return { ...NONE, up: true }; }
          else gF = 0;
          if (!c.me.grounded) jumped = true; // 意外离地
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
  /** 助跑跳：hold dir 累速，x 越 line 落地即跳，空中继续压方向直到落地（大目标面用） */
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
  /** 缘口坠落：朝 dir 蠕 2 帧出缘，空中压反向 holdF 帧后真刹（同向>30 才压），落地完成 */
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
const fbProg = [
  S2.settle("落定"), S2.sleep(3, "起手"),
  S2.hold("right", (c) => c.me.x >= 465 && c.me.grounded && c.me.y > 850, "走到b4西端下方"),
  S2.brakedHop("right", 860, 530, "跳上b4"),
  S2.wait((c) => c.me.grounded && c.me.y < 800, "b4面确认"),
  S.goTo(520, 6, "b4西段走位"),
  S2.brakedHop("left", 740, 470, "跳上左704台"),
  S2.wait((c) => c.me.grounded && c.me.y < 745, "704台确认"),
  S2.hold("left", (c) => lev2On(c) || c.me.x <= 412, "西行碰杠杆2"),
  S2.sleep(8, "杆2翻转确认"),
  S.goTo(445, 10, "杆旁站位"),
  S2.wait((c) => p1West(c), "等wg翻杆3→P1西"),
  S.goTo(458, 6, "回台东端"),
  S2.brakedHop("right", 660, 505, "跳上P1西"),
  S2.wait((c) => c.me.grounded && c.me.y < 640, "P1面确认"),
  S2.sleep(12, "P1站稳"),
  S2.brakedHop("left", 560, 430, "跳上西512台"),
  S2.wait((c) => c.me.grounded && c.me.y < 530, "512台确认"),
  S2.brakedHop("right", 470, 545, "跳上P2西"),
  S2.wait((c) => c.me.grounded && c.me.y < 445, "P2面确认"),
  S2.brakedHop("left", 360, 460, "跳上西320台"),
  S2.wait((c) => c.me.grounded && c.me.y < 345 && c.me.x > 438, "320台确认"),
  S2.hold("left", (c) => lev1On(c) || c.me.x <= 410, "西行碰杠杆1(P2东移)"),
  S2.sleep(8, "杆1翻转确认"),
  S2.wait((c) => p2East(c), "等P2东移到位"),
  S.goTo(468, 8, "320台东端走位"),
  S2.runJump("right", 470, "满速东跳中心块"),
  S2.wait((c) => c.me.grounded && c.me.y < 260 && c.me.x > 540, "中心块确认"),
  S2.hold("right", (c) => c.me.x >= 690 && c.me.grounded && c.me.y < 260, "中心块东端走位"),
  S2.runJump("right", 692, "东跳768块/b32走道"),
  S2.wait((c) => c.me.grounded && c.me.y < 170 && c.me.x > 770, "走道确认"),
  S2.hold("right", (c) => c.me.grounded && c.me.y > 130 && c.me.y < 300, "东行1056端走出→落b2"),
  S2.wait((c) => c.me.grounded && c.me.y > 130 && c.me.y < 300, "b2乘坐确认"),
  // 配重下滑：体心进入 [566,588]（=feet 601-623）触发西跳，投影过 x1024 平面 feet∈(505,544)
  {
    name: "走廊窗西跳",
    run: (c) => {
      if (c.me.grounded && c.me.y >= 566 && c.me.y <= 588) return { ...NONE, up: true, left: true };
      if (!c.me.grounded && c.me.y < 640) return { ...NONE, left: true };
      return NONE;
    },
    done: (c) => !c.me.grounded,
  },
  S2.wait((c) => c.me.grounded && c.me.y < 560 && c.me.x < 1030, "右ledge落定"),
  S2.hold("left", (c) => c.me.x <= 950 && c.me.grounded && c.me.y < 560, "西行fb门带"),
  S2.sleep(160, "驻门WIN"),
];

// ---- wg 线 ----
const wgProg = [
  S2.settle("落定"), S2.sleep(3, "起手"),
  S2.wait((c) => p3East(c), "等fb杆2→P3东"),
  S2.hold("left", (c) => c.me.x <= 812 && c.me.grounded && c.me.y > 850, "西行到起跳位(板东侧)"),
  S2.brakedHop("left", 860, 700, "跳上P3东"),
  S2.wait((c) => c.me.grounded && c.me.y < 800, "P3东面确认"),
  S.goTo(695, 8, "P3西段走位(坡西侧)"),
  (() => {
    const h = S2.brakedHop("right", 760, 790, "跳坡顶登右704台");
    return { ...h, name: h.name, done: (c) => c.me.grounded && c.me.vy >= -8 && c.me.x >= 755 && c.me.y < 745 };
  })(),
  S2.wait((c) => c.me.grounded && c.me.y < 745 && c.me.x > 750, "右704台确认"),
  S.goTo(780, 6, "台西端走位"),
  S2.brakedHop("left", 660, 700, "跳上P1东"),
  S2.wait((c) => c.me.grounded && c.me.y < 640, "P1面确认"),
  S2.brakedHop("right", 560, 775, "跳上东512台"),
  S2.wait((c) => c.me.grounded && c.me.y < 530 && c.me.x > 745, "512台确认"),
  S2.hold("right", (c) => lev3On(c) || c.me.x >= 805, "东行碰杠杆3"),
  S2.sleep(8, "杆3翻转确认"),
  S.goTo(780, 6, "回台西端"),
  S2.wait((c) => p2East(c), "等fb杆1→P2东"),
  S2.brakedHop("left", 470, 720, "邻接跳P2东端"),
  S2.wait((c) => c.me.grounded && c.me.y < 445, "P2面确认"),
  S2.brakedHop("right", 380, 850, "东跳东320台"),
  S2.wait((c) => c.me.grounded && c.me.y < 345 && c.me.x > 768, "东320台确认"),
  S2.hold("left", (c) => c.me.x <= 780 && c.me.grounded && c.me.y < 345, "台西端走位"),
  S2.runJump("left", 782, "满速西跳中心块"),
  S2.wait((c) => c.me.grounded && c.me.y < 260 && c.me.x > 550, "中心块确认"),
  S2.hold("left", (c) => c.me.x <= 558 && c.me.grounded && c.me.y < 260, "中心块西端走位"),
  S2.runJump("left", 560, "西跳b33"),
  S2.wait((c) => c.me.grounded && c.me.y < 170 && c.me.x < 420, "b33面确认"),
  S2.hold("left", (c) => c.me.x <= 232 && c.me.grounded && c.me.y < 170, "b33西端走位"),
  S2.edgeDrop("left", 2, "落tread1"),
  S2.wait((c) => c.me.grounded && c.me.y < 200, "tread1确认"),
  S2.edgeDrop("left", 8, "tread1西坠→楼梯平台"),
  S2.wait((c) => c.me.grounded && c.me.y < 400 && c.me.y > 355, "楼梯平台确认"),
  S2.hold("left", (c) => c.me.x <= 232 && c.me.grounded, "平台西端走位"),
  S2.edgeDrop("left", 900, "西坠→ledge"),
  S2.wait((c) => c.me.grounded && c.me.y < 560, "ledge落定"),
  S2.hold("left", (c) => c.me.x <= 306 && c.me.grounded && c.me.y < 560, "西行wg门带"),
  S2.sleep(160, "驻门WIN"),
];

const w = makeWorld("forest_05");
const r = drive(w, { fb: fbProg, wg: wgProg }, TOTAL, { logSteps: true, traceAll: true });
writeFileSync("TEMP/r05d/t5v3.json", JSON.stringify(r.trace));
console.log("result:", JSON.stringify(r.result));
const fbS = w.snapshotPlayer("fireboy"), wgS = w.snapshotPlayer("watergirl");
console.log(`final fb=(${fbS.x.toFixed(1)},${fbS.y.toFixed(1)}) wg=(${wgS.x.toFixed(1)},${wgS.y.toFixed(1)}) phase=${w.phase} fbDoor=${fbS.doorFrame} wgDoor=${wgS.doorFrame}`);
const out = argOf("out", "");
if (out && r.result.won) {
  const doc = toRouteDoc("forest_05", r.events, Math.min(TOTAL, (r.result.winF ?? TOTAL) + 3), "r05c bot f05 v3");
  writeFileSync(out, JSON.stringify(doc, null, 1));
  console.log("route →", out, "fb/wg 事件:", doc.fb.length, doc.wg.length);
}
