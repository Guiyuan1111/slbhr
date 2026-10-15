// r25d p0：新内核（907ba54 锚点体修复）h0 吊板基线复验
// 对比 r25c 旧结论：静止板 x541-835 顶 y740、板心 (688,744)、idle 稳定、载 fb 后东倾 0.109rad
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };

const w = makeWorld("forest_25");
const dump = (tag) => {
  const h = w.mechSnapshot().hangings[0];
  console.log(`${tag}: board心=(${px(h.x)},${px(h.y)}) ang=${h.angle.toFixed(4)}rad(${((h.angle * 180) / Math.PI).toFixed(2)}°)`);
  return h;
};
dump("f0");
for (let i = 0; i < 240; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
const h240 = dump("f240 idle");
for (let i = 0; i < 960; i++) w.step(1 / 60, { fireboy: N, watergirl: N });
const h1200 = dump("f1200 idle");
console.log(`漂移 240→1200: dx=${px(h1200.x - h240.x)} dy=${px(h1200.y - h240.y)} dang=${(h1200.angle - h240.angle).toFixed(5)}`);

// 板世界 AABB 估算（板半长 4.6m=147px? barWidth 9m=288px + 端帽 0.1m=3.2px → 半长 147.2px, 半厚 3.84px）
const halfL = (9 / 2 + 0.1) * 32, halfT = 0.12 * 32;
const c = Math.cos(h1200.angle), s = Math.sin(h1200.angle);
const ex = halfL * Math.abs(c) + halfT * Math.abs(s), ey = halfL * Math.abs(s) + halfT * Math.abs(c);
console.log(`板 AABB ≈ x[${px(h1200.x - ex)},${px(h1200.x + ex)}] y[${px(h1200.y - ey)},${px(h1200.y + ey)}] 顶面y≈${px(h1200.y - ey)}`);

// 角色落板静载测试：把 fb 直接放到板上（body 无法直接 teleport? 用长距快进替代——
// 这里只测静载不可行，改由 p1 探针全链上板后读。此处先输出 wind 态）
console.log("wind state:", w.mechanisms.winds?.[0]?.state, "l0 state:", w.mechanisms.levers[0].state);
