import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
import { NONE, S, drive } from "../../scripts/e2e/routetool/botcore.mjs";
const feet = (c) => c.me.y + 35.2;
const JB4 = 12;
const H = (dir, gate, cap, name) => {
  let n = 0;
  return { name, run: () => ({ ...NONE, [dir]: true }), done: (c) => { n++; return gate(c) || n > cap; } };
};
const lv = (c, i) => c.w.mechs.levers[i].state;
const JD = (dir, d, b, name, done, cap) => {
  let t = -1, jumped = false, n = 0;
  return { name,
    run: (c) => {
      if (!jumped) { if (c.me.grounded && Math.abs(c.me.vx) < 15) { jumped = true; t = 0; return { ...NONE, up: true }; } return NONE; }
      t++;
      if (t >= d && t < d + b) return { ...NONE, [dir]: true };
      return NONE;
    },
    done: (c) => {
      if (!jumped || t <= d + b) return false;
      n++;
      return (done ? done(c) : (c.me.grounded && c.me.vy >= -8)) || n > (cap ?? 400);
    } };
};
const hopJump = (gate, cap, name) => {
  let n = 0;
  return { name, run: (c) => (c.me.grounded && Math.abs(c.me.vx) < 15 ? { ...NONE, up: true } : NONE),
    done: (c) => { n++; return gate(c) || n > cap; } };
};

const wg = [
  { name: "开局静置", run: () => NONE, done: (() => { let n = 0; return () => ++n >= 10; })() },
  S.settle(), S.runJump("left", 150), S.goTo(70, 10),
  H("right", (c) => c.me.grounded && feet(c) > 725 && c.me.x > 128 && c.me.x < 215, 90, "东落C块"),
  H("left", (c) => c.me.grounded && feet(c) > 890 && c.me.x < 100, 90, "西坠底层"),
  H("right", (c) => c.me.grounded && c.me.x >= 300 && c.me.x < 365 && feet(c) < 795, 300, "楼梯东上"),
  JD("left", 2, 40, "西跳736", (c) => c.me.grounded && c.me.x > 150 && c.me.x < 250 && feet(c) > 726 && feet(c) < 762),
  H("left", (c) => c.me.x <= 135 && feet(c) < 716, 90, "西走爬回岩台"),
  S.goTo(70, 10),
  S.jumpDrift("right", 0, 40), S.goTo(165, 8),
  S.jumpOnto("left", 500), S.goTo(78, 8),
  S.jumpDrift("right", 0, 20), S.goTo(200, 12),
  JD("right", 2, 2, "跳压l2", (c) => lv(c, 2) === 1 && c.me.grounded && feet(c) < 340),
  JD("right", 18, 40, "楼梯跳"),
  S.goTo(290, 6),
  JD("right", 8, 64, "棚顶跳→w口袋"),
  { name: "落定", run: () => NONE, done: (c) => c.me.grounded && Math.abs(c.me.vx) < 15 },
  JD("right", 2, 80, "大跳越岛", (c) => c.me.grounded && c.me.x > 646 && feet(c) > 460, 200),
  S.goTo(704, 10, "进w门"),
  S.stand((c) => c.w.phase === "won", "等won"),
];
const fb = [
  { name: "开局静置", run: () => NONE, done: (() => { let n = 0; return () => ++n >= 10; })() },
  S.settle(), S.runJump("right", 150), S.goTo(1178, 10), S.jumpDrift("left", 0, 40), S.goTo(1083, 8),
  S.jumpOnto("right", 748), S.goTo(1170, 8), S.jumpDrift("left", 0, 20),
  { name: "推臂西行到1040", run: () => ({ ...NONE, left: true }),
    done: (c) => c.me.grounded && c.me.x <= 1040 && feet(c) < 340 && Math.abs(c.me.vx) < 40 },
  H("right", (c) => c.me.grounded && c.me.x >= 1160 && feet(c) < 340, 300, "回东上shelf"),
  JD("right", 2, 30, "落C台448", (c) => c.me.grounded && c.me.x > 1100 && feet(c) > 430 && feet(c) < 480),
  H("left", (c) => c.me.grounded && feet(c) > 560 && feet(c) < 610 && c.me.x > 900 && c.me.x < 1090, 200, "C台西坠B台"),
  H("right", (c) => c.me.grounded && feet(c) > 690 && feet(c) < 730 && c.me.x > 1090 && c.me.x < 1190, 220, "B台东坠22台"),
  H("left", (c) => c.me.grounded && c.me.x <= 1038 && feet(c) > 720 && feet(c) < 760, 220, "22台西缘"),
  JD("left", 0, 40, "22台飞跃活塞→西块", (c) => c.me.grounded && c.me.x > 704 && c.me.x < 830 && feet(c) > 850 && feet(c) < 880, 2000),
  H("left", (c) => c.me.grounded && feet(c) > 885 && c.me.x > 600 && c.me.x < 704, 220, "西块西坠缺口"),
  S.goTo(650, 8, "占位650"),
  JD("left", 2, 40, "跃上416块顶", (c) => c.me.grounded && c.me.x > 400 && c.me.x < 560 && feet(c) > 845 && feet(c) < 885, 2000),
  JD("left", 2, 42, "块顶跃上板", (c) => c.me.grounded && c.me.x > 415 && c.me.x < 481 && feet(c) > 750 && feet(c) < 790, 2000),
  JD("left", 2, 40, "板顶西落底层", (c) => c.me.grounded && c.me.x <= 200 && feet(c) > 885, 2000),
  H("right", (c) => c.me.grounded && c.me.x >= 300 && c.me.x < 365 && feet(c) < 795, 2000, "楼梯东上"),
  JD("left", 2, 40, "西跳736", (c) => c.me.grounded && c.me.x > 150 && c.me.x < 250 && feet(c) > 726 && feet(c) < 762, 2000),
  H("left", (c) => c.me.x <= 135 && feet(c) < 716, 2000, "西走爬回岩台"),
  S.goTo(70, 10),
  S.jumpDrift("right", 0, 40), S.goTo(165, 8),
  S.jumpOnto("left", 500), S.goTo(78, 8),
  S.jumpDrift("right", 0, 20), S.goTo(200, 12),
  JD("right", 18, 40, "楼梯跳→刺顶", (c) => c.me.grounded && c.me.x > 224 && c.me.x < 262 && feet(c) > 178 && feet(c) < 205, 2000),
  S.goTo(290, 6, "梯顶占位"),
  JD("right", 8, 64, "飞跃尖塔→柱顶", (c) => c.me.grounded && c.me.x > 415 && c.me.x < 452 && feet(c) > 305 && feet(c) < 335, 2000),
  JD("right", 2, JB4, "柱顶跳下→棚西", (c) => c.me.grounded && c.me.x > 455 && c.me.x < 572 && feet(c) > 470 && feet(c) < 500, 2000),
  S.goTo(512, 10, "进f门"),
  S.stand((c) => c.w.phase === "won", "等won"),
];
const w = makeWorld("light_02");
const r = drive(w, { fb, wg }, +(process.env.FRAMES ?? 5200), { logSteps: true });
console.log("result:", JSON.stringify(r.result));
console.log("END wg", (() => { const s = w.snapshotPlayer("watergirl"); return `${s.x.toFixed(1)} ${(s.y + 35.2).toFixed(1)}`; })(),
  "| fb", (() => { const s = w.snapshotPlayer("fireboy"); return `${s.x.toFixed(1)} ${(s.y + 35.2).toFixed(1)}`; })());

if (r.result.won) {
  const { toRouteDoc } = await import("../../scripts/e2e/routetool/botcore.mjs");
  const { writeFileSync } = await import("node:fs");
  const doc = toRouteDoc("light_02", r.events, r.result.winF + 1, "bot v47 JB4=12 手工链; west ladder: floor→block→slab→floor→stairs→spur-top→stair-top→spire-fly→pillar-top→shelf-west→f-door; wg: shelf-east hop chain");
  writeFileSync(process.env.OUT ?? "light_02.route.json", JSON.stringify(doc));
  console.log("route doc written,", doc.fb.length, "+", doc.wg.length, "events, totalFrames", doc.totalFrames);
}
