// s32-kernel-121-mirror.mjs — 内核侧镜像探针（与 s31 oracle 同出生点/同输入/同量测）
// O0 平口袋地站跳 (592,445)中心 | O1 竖井tip (160,720)中心→落(128,800)hyp | O2 漏斗顶点 (543.9,380.8) | O3 脊顶 (704.1,380.7)
// 跳输入：f80 down，f105 up（oracle 同款）；trace f60-160 逐帧输出。
import { writeFileSync } from "node:fs";
import { makeWorld } from "../scripts/e2e/routetool/kernel.mjs";

const phys = (B2, x, y) => new B2.b2Vec2(-x / 32, -y / 32); // 屏幕px(y-down) → 物理米(y-up 负空间)，与内核 phys 同式

async function scenario(name, gidTag, cx, cy) {
  const w = makeWorld("forest_12_1");
  const B2 = w.B;
  const ch = gidTag === "fb" ? w.chars.fireboy : w.chars.watergirl;
  // 直接设位（fixture 注入，内核唯一非路线途径）
  ch.body.SetPosition(phys(B2, cx, cy));
  ch.body.SetLinearVelocity(new B2.b2Vec2(0, 0));
  const trace = [];
  const IDLE = { up: false, left: false, right: false };
  let jumping = false;
  for (let f = 0; f < 200; f++) {
    const inp = { ...IDLE, up: jumping };
    if (f === 80) jumping = true;
    if (f === 105) jumping = false;
    w.step(1 / 60, { fireboy: gidTag === "fb" ? inp : IDLE, watergirl: gidTag === "wg" ? inp : IDLE });
    const p = ch.body.GetPosition();
    trace.push({ f, x: +(-p.x * 32).toFixed(1), y: +(-p.y * 32).toFixed(1) + 35 });
  }
  const rest = trace.filter((t) => t.f >= 30 && t.f < 80).pop();
  const flight = trace.filter((t) => t.f >= 80 && t.f <= 160);
  let apex = null;
  for (const p of flight) if (!apex || p.y < apex.y) apex = p;
  const res = {
    name,
    restFeet: rest ? { f: rest.f, x: rest.x, y: rest.y } : null,
    apexFeet: apex ? { f: apex.f, x: apex.x, y: apex.y } : null,
    rise: rest && apex ? +(rest.y - apex.y).toFixed(1) : null,
    driftAbs: rest ? +Math.max(...flight.map((p) => Math.abs(p.x - rest.x))).toFixed(1) : null,
  };
  writeFileSync(`TEMP/s32-${name}.json`, JSON.stringify(trace.filter((t) => t.f >= 60 && t.f <= 160), null, 0));
  return res;
}

const out = {};
out.O0 = await scenario("O0_pocket_flat", "fb", 592, 445);
out.O1 = await scenario("O1_stairwell_tip", "fb", 160, 720);
out.O2 = await scenario("O2_funnel_pin", "fb", 543.9, 380.8);
out.O3 = await scenario("O3_ridge_pin", "wg", 704.1, 380.7);
console.log(JSON.stringify(out, null, 1));
writeFileSync("TEMP/s32-kernel-out.json", JSON.stringify(out, null, 1));
