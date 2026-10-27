// r25d p12：wg 全链 v5 反馈探针（新内核定稿版）
// 链：走落入池→池底西行→阶梯弹射→台沿 UR28 跳塔顶→脉冲踱出塔顶西缘→落横带→
//     东行扳 l0 关风→折返全速走落带西缘→落 y352 台→东行 UR12 跳上 r8 台→UL16 跳上 c4\ 坡→上坡→b0 站
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UR = { up: true, left: false, right: true };
const UL = { up: true, left: true, right: false };

export function wgRun(urC2 = 28, urJ = 12, ulL = 16, trace = false, trigX = 468, ulG = 30) {
  const w = makeWorld("forest_25");
  const marks = [];
  const mark = (name, f, p) => { if (marks[marks.length - 1]?.[1] !== name) marks.push([f, name, px(p.x), px(p.y)]); };
  let phase = "A", sub = 0, jt = -1, hop2 = -1, hop3 = -1, windOffF = -1, b0F = -1, done = "";
  for (let f = 0; f < 3400; f++) {
    const inp = f < 90 ? N : (() => {
      const p = w.snapshotPlayer("watergirl");
      switch (phase) {
        case "A": if (p.y > 200) mark("B", f, p), phase = "B"; return L;
        case "B": if (p.x < 545 && p.y > 250) mark("C", f, p), phase = "C"; return L;
        case "C":
          if (p.y > 245 && p.y < 262 && Math.abs(p.vx) < 5 && p.x > 320 && p.x < 352) { mark("C2", f, p), phase = "C2", jt = 0; }
          return L;
        case "C2": // 台沿 UR 跳塔顶
          jt++;
          if (p.y > 175 && p.y < 215 && Math.abs(p.vy) < 5 && p.x > 435 && p.x < 495) { mark("D", f, p), phase = "D", sub = 0; }
          return jt <= urC2 ? UR : N;
        case "D": // 塔顶脉冲踱出西缘（低速垂落横带）
          sub++;
          if (p.y > 240) mark("E", f, p), phase = "E";
          return sub % 10 < 3 ? L : N;
        case "E": // 落横带站稳
          if (p.y > 395 && p.y < 428 && Math.abs(p.vy) < 5) mark("F", f, p), phase = "F";
          return N;
        case "F": // 东行扳 l0
          if (w.mechanisms.winds[0].state === 0) { windOffF = f; mark("G", f, p); phase = "G"; }
          return R;
        case "G": // 西行，接近凸块(x352-416,顶y352)时 UL 跳上块顶
          if (p.x < trigX) { phase = "G2", jt = 0; return UL; }
          return L;
        case "G5": // （备用）带西段
          return L;
        case "G2": { // UL 跳，目标块顶 (352-384, y352)
          jt++;
          if (p.y > 305 && p.y < 330 && Math.abs(p.vy) < 5 && p.x > 348 && p.x < 392) { mark("G3", f, p), phase = "G4", jt = 0; return N; }
          if (jt > 90) { phase = "FAIL"; return N; }
          return jt <= ulG ? UL : N;
        }
        case "G4": { // 块顶 UL 长跳西→同高落 y352 台（三级爬升第一级）
          jt++;
          if (p.y > 300 && p.y < 333 && Math.abs(p.vy) < 5 && p.x < 165) { mark("H", f, p), phase = "I", sub = 0; return N; }
          if (jt > 100) { phase = "FAIL"; return N; }
          return jt <= ulG ? UL : N;
        }
        case "H": // 落 y352 台
          if (p.y > 300 && p.y < 333 && Math.abs(p.vy) < 5) { mark("I", f, p), phase = "I", sub = 0; }
          return N;
        case "I": // 台上东行
          if (p.x > 138 && Math.abs(p.vx) < 60) { mark("J", f, p), phase = "J", jt = 0; }
          return L;
        case "J": // UR 短跳上 r8 台
          jt++;
          if (p.y > 200 && p.y < 233 && Math.abs(p.vy) < 5) { mark("K", f, p), phase = "K", hop2 = jt; }
          return jt <= urJ ? UR : N;
        case "K": // r8 台西段站定
          if (Math.abs(p.vx) < 20 && p.x < 230) { mark("L", f, p), phase = "L", hop3 = 0; }
          return N;
        case "L": // UL 跳西上坡
          hop3++;
          if (p.y < 200 && p.y > 60 && Math.abs(p.vy) < 5) { mark("M", f, p), phase = "M", sub = 0; }
          return hop3 <= ulL ? UL : N;
        case "M": // 坡/平台西行至 b0
          if (p.x < 95 && p.y < 140 && Math.abs(p.vx) < 5) { mark("N", f, p), phase = "N"; }
          return L;
        case "N":
          if (Math.abs(p.vx) < 3 && p.x < 100) { b0F = f; mark("DONE", f, p), phase = "DONE"; }
          return L;
        default: return N;
      }
    })();
    w.step(1 / 60, { fireboy: N, watergirl: inp });
    const p = w.snapshotPlayer("watergirl");
    if (trace && f > 619 && f < 700 && f % 5 === 0) {
      const body = w.players.watergirl.body;
      let cl = body.GetContactList(), names = [];
      const wm = new (globalThis.box2d).b2WorldManifold();
      for (let c = cl; c; c = c.next) {
        const ct = c.contact;
        if (!ct || !ct.IsTouching?.()) continue;
        const fa = ct.GetFixtureA(), fb = ct.GetFixtureB();
        const other = fa.GetBody() === body ? fb.GetBody() : fa.GetBody();
        const obp = other.GetPosition();
        ct.GetWorldManifold(wm);
        const wpt = wm.points?.[0];
        names.push(`other@(${px(-obp.x * 32)},${px(-obp.y * 32)})ud=${String(fa.GetUserData() ?? fb.GetUserData() ?? other.GetUserData())}wpt=${wpt ? `(${px(-wpt.x * 32)},${px(-wpt.y * 32)})` : "?"}`);
      }
      console.log(`  f${f}: (${px(p.x)},${px(p.y)}) ${p.anim} 接触 ${names.length}: ${names.join(" || ")}`);
    }
    if (p.dead || p.dying) { done = `DEAD f${f} @(${px(p.x)},${px(p.y)})`; break; }
    if (phase === "DONE" && f > (b0F ?? 0) + 20) {
      done = `b0站位 f${b0F} @(${px(p.x)},${px(p.y)}) b0=${w.mechanisms.pushers[0].state} p0.y=${px(w.mechSnapshot().platforms[0].y)}`;
      break;
    }
  }
  return { marks, windOffF, hop2, hop3, done, phase, w, b0F };
}

for (const trigX of [480, 472]) for (const ulG of [16, 20, 24, 28, 32]) {
  const r = wgRun(28, 12, 16, false, trigX, ulG);
  const g3 = r.marks.find(m => m[1] === "G3" || m[1] === "G3b");
  console.log(`trig=${trigX} ul=${ulG}: windOff=${r.windOffF} G3=${g3 ? `f${g3[0]}(${g3[2]},${g3[3]})` : "-"} hop2=${r.hop2} hop3=${r.hop3} ended=${r.done || r.phase}`);
}
