// s33a-kernel-mirror5.mjs — 内核侧：5 关键点位统一协议（生位注入→settle→f80跳持25f→minFeet f80-160）
// 位点（中心坐标，feet=cy+35）：
//  A 832台地平地 (360,796.7)   —— r121 rise 基准点（107.8 口径）
//  B 竖井 col4 hyp (144,765)   —— r121 E2.3 点位（(128,800) hyp，站面 800）
//  C 西坡坡脚 (653.9,427.5)    —— oracle O3 实测 rest (653.9,462.5) 的站心（462.5-35）
//  D1 漏斗顶点 (543.9,380.8)   —— 钉点
//  D2 脊顶 (704.1,380.7)       —— 钉点（wg）
import { writeFileSync } from "node:fs";
import { makeWorld } from "../scripts/e2e/routetool/kernel.mjs";

const phys = (B2, x, y) => new B2.b2Vec2(-x / 32, -y / 32);

function scenario(tag, who, cx, cy) {
  const w = makeWorld("forest_12_1");
  const B2 = w.B;
  const ch = who === "fb" ? w.chars.fireboy : w.chars.watergirl;
  ch.body.SetPosition(phys(B2, cx, cy));
  ch.body.SetLinearVelocity(new B2.b2Vec2(0, 0));
  const trace = [];
  let up = false;
  for (let f = 0; f < 220; f++) {
    if (f === 80) up = true;
    if (f === 105) up = false;
    const inp = { up, left: false, right: false };
    w.step(1 / 60, { fireboy: who === "fb" ? inp : { up: false, left: false, right: false }, watergirl: who === "wg" ? inp : { up: false, left: false, right: false } });
    const p = ch.body.GetPosition();
    trace.push({ f, x: +(-p.x * 32).toFixed(2), y: +(-p.y * 32 * 1).toFixed(2) + 35.2 });
  }
  const rest = trace.filter((t) => t.f >= 70 && t.f < 80).pop();
  const flight = trace.filter((t) => t.f >= 80 && t.f <= 170);
  let min = null;
  for (const p of flight) if (!min || p.y < min.y) min = p;
  const after = flight.filter((p) => p.f >= 160).pop();
  return {
    tag, who,
    restFeet: { f: rest.f, x: rest.x, y: rest.y },
    minFeet: { f: min.f, x: min.x, y: min.y },
    rise: +(rest.y - min.y).toFixed(1),
    endFeet: { x: after.x, y: after.y },
    trace: trace.filter((t) => t.f >= 60 && t.f <= 180),
  };
}

const SPOTS = [
  ["A_terrace", "fb", 360, 796.7],
  ["B_stairwell_col4", "fb", 144, 765],
  ["C_westslope", "wg", 653.9, 427.5],
  ["D1_funnel_pin", "fb", 543.9, 380.8],
  ["D2_ridge_pin", "wg", 704.1, 380.7],
];
const out = {};
for (const [tag, who, x, y] of SPOTS) {
  out[tag] = scenario(tag, who, x, y);
  const o = out[tag];
  console.log(`${tag}: rest(${o.restFeet.x},${o.restFeet.y}) min(${o.minFeet.x},${o.minFeet.y}@f${o.minFeet.f}) rise=${o.rise} end(${o.endFeet.x},${o.endFeet.y})`);
}
writeFileSync("TEMP/s33a-kernel-out.json", JSON.stringify(out, null, 1));
