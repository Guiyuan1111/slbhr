// geo2: P3 口袋 + P2 口袋/槽 精确 fixture AABB
import { makeWorld } from "/home/gy/桌面/dev/slbhr/gyのFW/scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("crystal_03");
const box = (x, y, w2, h) => ({ x: +(x * 32).toFixed(1), y: +(y * 32).toFixed(1), w: +(w2 * 32).toFixed(1), h: +(h * 32).toFixed(1) });
const regions = [
  ["P3-pocket", 0, 4.4, 4.4, 24],   // x[0,140] y[560,768]
  ["P2-pocket", 36.5, 1.25, 4, 6],   // x[1168,1264] y[40,200]
  ["P2-slot", 37.6, 1.6, 0.5, 5],    // x[1200,1216] y[64,224]
];
for (const [tag, rx, ry, rw, rh] of regions) {
  console.log(`== ${tag} x[${rx*32},${(rx+rw)*32}] y[${ry*32},${(ry+rh)*32}] ==`);
  for (const [bi, body] of w.players.fireboy.body.GetWorld().getBodyList().entries()) {
    for (const fx of body.getFixtureList()) {
      const aabb = fx.getAABB();
      const x0 = aabb.lowerBound.x * 32, y0 = aabb.lowerBound.y * 32, x1 = aabb.upperBound.x * 32, y1 = aabb.upperBound.y * 32;
      const cx0 = rx * 32, cy0 = ry * 32, cx1 = (rx + rw) * 32, cy1 = (ry + rh) * 32;
      if (x1 <= cx0 || x0 >= cx1 || y1 <= cy0 || y0 >= cy1) continue;
      const fd = fx.getUserData?.() ?? {};
      console.log(`  body${bi} [${x0.toFixed(1)},${y0.toFixed(1)} ~ ${x1.toFixed(1)},${y1.toFixed(1)}] top=${y0.toFixed(1)} cat=${fd.categoryBits ?? "?"} type=${fd.type ?? "?"} id=${fd.id ?? "?"}`);
    }
  }
}
