//  身体模型：头顶=core-21.76，脚底=core+35.2；满跳rise=102.5(vy-479.3,g≈1120)；跑加速600
//  原语 S2p 逐字沿用 bot6-f05.mjs（S1/W3/S2 已实证），runJump holdF=0 即空中零输入恒速弹道
import { writeFileSync } from "node:fs";
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
import { NONE, S, drive, toRouteDoc } from "../../../scripts/e2e/routetool/botcore.mjs";

// ---- 谓词 ----
const ms = (c) => c.w.mechSnapshot();
const p3East = (c) => ms(c).platforms[2].x >= 690;
const p3West = (c) => ms(c).platforms[2].x <= 585;
const lev2On = (c) => ms(c).levers[1].state === 1;
const lev2Off = (c) => ms(c).levers[1].state === 0;
const lev3On = (c) => ms(c).levers[2].state === 1;
const S2p = {
  wait: (pred, name) => ({ name, run: () => NONE, done: pred }),
  sleep: (n, name) => { let t = 0; return { name, run: () => NONE, done: () => ++t >= n }; },
  goTo: S.goTo,
  /** 走到线后助跑跳：hold dir 累速，core_x 过 line 且落地即跳，空中继续 dir 直到落地(holdF=0→空中零输入) */
  runJump: (dir, line, holdF, name) => {
    let jumped = false, air = false, t = 0;
    return {
      name,
      run: (c) => {
        const i = { ...NONE, [dir]: true };
        if (!jumped) {
          if (c.me.grounded && (dir === "right" ? c.me.x >= line : c.me.x <= line)) { i.up = true; jumped = true; t = 0; }
          return i;
        }
        t++;
        if (t > holdF) return NONE;
        return i;
      },
      done: (c) => { if (!c.me.grounded) air = true; return jumped && air && c.me.grounded && c.me.vy >= -8; },
    };
  },
  /** 停稳→ creep dir preRun 帧（vx≈10·pre）→ 起跳并持 dir holdF 帧 */
  creepJump: (dir, preRun, holdF, name) => {
    let phase = 0, t = 0, jumped = false, air = false;
    return {
      name,
      run: (c) => {
        const i = { ...NONE, [dir]: true };
        if (phase === 0) { if (c.me.grounded && Math.abs(c.me.vx) < 30) phase = 1; return NONE; }
        if (phase === 1) { if (++t >= preRun) { i.up = true; phase = 2; t = 0; jumped = true; } return i; }
        t++;
        if (t > holdF) return NONE;
        return i;
      },
      done: (c) => { if (!c.me.grounded) air = true; return jumped && air && c.me.grounded && c.me.vy >= -8; },
    };
  },
  /** 垂直 razor：站定起跳，driftAtF 帧后持 dir holdF 帧（T5/T6 用） */
  razorJump: (dir, driftAtF, holdF, name) => {
    let jumped = false, air = false, t = 0;
    return {
      name,
      run: (c) => {
        if (!jumped) {
          if (c.me.grounded && Math.abs(c.me.vx) < 20) { jumped = true; t = 0; return { ...NONE, up: true }; }
          return NONE;
        }
        t++;
        if (t >= driftAtF && t <= driftAtF + holdF) return { ...NONE, [dir]: true };
        return NONE;
      },
      done: (c) => { if (!c.me.grounded) air = true; return jumped && air && c.me.grounded && c.me.vy >= -8; },
    };
  },
  /** 缘口坠落：蠕 dir 2f 出缘，空中压反向 holdF 帧后刹 */
  edgeDrop: (dir, holdF, name) => {
    const anti = dir === "right" ? "left" : "right";
    let t = 0, off = false;
    return {
      name,
      run: (c) => {
        if (!off) {
          if (t >= 2 && !c.me.grounded) { off = true; t = 0; return { ...NONE, [anti]: true }; }
          t++; return { ...NONE, [dir]: true };
        }
        t++;
        if (t <= holdF) return { ...NONE, [anti]: true };
        const moving = dir === "right" ? c.me.vx < -30 : c.me.vx > 30;
        return moving ? { ...NONE, [dir]: true } : NONE;
      },
      done: (c) => off && c.me.grounded && c.me.vy >= -8,
    };
  },
  /** 竖井墬落：蠕 dir 出缘→中性落至 feet≥yThen→压反向 dir 直到落地（W10 用） */
  shaftDrop: (dir, yThen, name) => {
    const anti = dir === "right" ? "left" : "right";
    let t = 0, off = false;
    return {
      name,
      run: (c) => {
        if (!off) {
          if (t >= 2 && !c.me.grounded) { off = true; t = 0; return NONE; }
          t++; return { ...NONE, [dir]: true };
        }
        return c.me.y + 35.2 >= yThen ? { ...NONE, [anti]: true } : NONE;
      },
      done: (c) => off && c.me.grounded && c.me.vy >= -8,
    };
  },
};

// ==== 扫参主程序：W3 弹幕 ====
const mkFb = () => [
  S.settle("落定"), S2p.sleep(6, "起手"),
  S2p.runJump("right", 450, 30, "S1"),
  S2p.wait((c) => c.me.grounded && c.me.y < 830 && c.me.x > 504, "P3西落定"),
  S2p.goTo(548, 4, "S2走位"),
  S2p.creepJump("left", 7, 45, "S2"),
  S2p.wait((c) => c.me.grounded && c.me.y < 745 && c.me.x < 500, "西704落定"),
  { name: "杆2首翻", run: (c) => ({ ...NONE, left: true }), done: (c) => lev2On(c) && c.me.x <= 412 },
  S2p.sleep(12, "杆2确认"),
  S2p.wait((c) => p3East(c), "等P3驻东"),
  { name: "FB完", run: () => NONE, done: () => false },
];

function trial(pos, pre, hold) {
  const w = makeWorld("forest_05");
  const fbSteps = mkFb();
  const wgSteps = [
    S.settle("落定"),
    S2p.wait((c) => lev2On(c) && p3East(c), "等P3东驻"),
    S.hold("left", (c) => c.me.x <= pos && c.me.grounded, "西行" + pos),
    S2p.sleep(8, "驻停"),
    S2p.creepJump("left", pre, hold, "W3扫" + pre + "+" + hold),
    { name: "观测", run: () => NONE, done: () => false },
  ];
  let onTop = false, topF = -1, minY = 9999, maxRise = 0, p3AtJump = -1, wgJumped = false, death = "";
  const res = drive(w, { fb: fbSteps, wg: wgSteps }, 560, {
    onFrame: (f) => {
      const s = w.snapshotPlayer("watergirl");
      const m = w.mechSnapshot();
      if (!wgJumped && (s.vy < -50)) { wgJumped = true; p3AtJump = Math.round(m.platforms[2].x); }
      if (s.y < minY) minY = s.y;
      if (s.grounded && Math.abs(s.y - 768.8) < 6 && s.x > 634 && s.x < 766) { onTop = true; topF = f; }
      maxRise = Math.max(maxRise, 860.5 - s.y);
    },
  });
  if (minY < 9999 && !wgJumped) p3AtJump = -2;
  if (res.result && !res.result.won) death = res.result.who + "@" + res.result.deathF;
  return { pos, pre, hold, onTop, topF, p3AtJump, death, minY: Math.round(minY * 10) / 10, maxRise: Math.round(maxRise * 10) / 10 };
}

const results = [];
let hits = 0;
for (let pos = 660; pos <= 790; pos += 10) {
  for (const pre of [1, 3, 5, 7, 9, 11]) {
    for (const hold of [0, 8, 20, 40]) {
      const r = trial(pos, pre, hold);
      results.push(r);
      if (r.onTop) { hits++; console.log("HIT:", JSON.stringify(r)); }
    }
  }
}
console.log(`\n总计 ${results.length} 组合，登上P3东顶：${hits}`);
writeFileSync("/home/gy/桌面/dev/slbhr/gyのFW/TEMP/r05f/w3sweep.json", JSON.stringify(results));
