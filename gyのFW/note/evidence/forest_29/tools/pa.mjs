// pa.mjs — wg 西行可行性探针：P-A 走出板缘 / P-B 各式跳跃弧 / P-C 东坠道
// 用法: node --import tsx pa.mjs [case]
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";

const run = (name, evs, total = 200) => {
  const st = { left: false, right: false, up: false };
  const byF = new Map();
  for (const e of evs) { if (!byF.has(e.f)) byF.set(e.f, []); byF.get(e.f).push(e); }
  const w = makeWorld("forest_29");
  const pts = [];
  let out = "";
  for (let f = 0; f < total; f++) {
    for (const e of byF.get(f) ?? []) st[e.dir] = e.type === "down";
    w.step(1 / 60, { fireboy: st, watergirl: { ...st } });
    const s = w.snapshotPlayer("watergirl");
    pts.push([+s.x.toFixed(1), +s.y.toFixed(1)]);
    if (s.dead) { out = `DEAD@f${f}`; break; }
    if (w.phase === "won") { out = `WIN@f${f}`; break; }
  }
  const samples = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 150, 180].filter(i => i < pts.length);
  console.log(`${name}: ${out || "alive"}  ${samples.map(i => `f${i}(${pts[i]})`).join(" ")}`);
  return pts;
};
const hold = (f1, f2, d) => [{ f: f1, dir: d, type: "down" }, { f: f2, dir: d, type: "up" }];
const tap = (f, d, n = 2) => hold(f, f + n, d);
const jmp = (f, d, air) => { const e = [{ f, dir: "up", type: "down" }, { f: f + air, dir: "up", type: "up" }]; if (d) e.push({ f, dir: d, type: "down" }, { f: f + air, dir: d, type: "up" }); return e; };

const C = process.argv[2] || "all";
const doCase = (n, fn) => { if (C === "all" || C === n) fn(); };

// P-A: 满速走出板缘（不刹车）
doCase("A1", () => run("A1 满速走出缘", hold(2, 120, "left"), 160));
// P-A2: 走到缘停住，再2f点
doCase("A2", () => run("A2 走缘停+2f点", [...hold(2, 13, "left"), ...tap(30, "left")], 120));
// P-A3: 走缘停住，跳（air55 全程按左）
doCase("A3", () => run("A3 缘停跳55", [...hold(2, 13, "left"), ...jmp(30, "left", 55)], 140));
// P-A4: 走缘停住，跳（短air20）
doCase("A4", () => run("A4 缘停短跳20", [...hold(2, 13, "left"), ...jmp(30, "left", 20)], 140));
// P-B1: 东行加速折返跳（折返满速）: 东行 f2-30, 西行 f31-, 跳 f58
doCase("B1", () => run("B1 东30折返f58跳air24", [...hold(2, 30, "right"), ...hold(31, 57, "left"), ...jmp(58, "left", 24)], 160));
doCase("B2", () => run("B2 东30折返f62跳air30", [...hold(2, 30, "right"), ...hold(31, 61, "left"), ...jmp(62, "left", 30)], 160));
doCase("B3", () => run("B3 东34折返f66跳air36", [...hold(2, 34, "right"), ...hold(35, 65, "left"), ...jmp(66, "left", 36)], 160));
doCase("B4", () => run("B4 东40折返f74跳air40", [...hold(2, 40, "right"), ...hold(41, 73, "left"), ...jmp(74, "left", 40)], 170));
// P-B5: 更强: 东45折返 f84 跳
doCase("B5", () => run("B5 东45折返f84跳air44", [...hold(2, 45, "right"), ...hold(46, 83, "left"), ...jmp(84, "left", 44)], 180));
// P-C: 板上中途跳(不走满): 东12折返 f40 跳
doCase("C1", () => run("C1 东12折返f40跳air30", [...hold(2, 12, "right"), ...hold(13, 39, "left"), ...jmp(40, "left", 30)], 160));
doCase("C2", () => run("C2 东20折返f50跳air30", [...hold(2, 20, "right"), ...hold(21, 49, "left"), ...jmp(50, "left", 30)], 160));
