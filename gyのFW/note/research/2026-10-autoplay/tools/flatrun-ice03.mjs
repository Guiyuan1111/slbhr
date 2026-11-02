// flatrun-ice03.mjs — 塔坡/链坡的平段详情（跳跃落点勘探）。按 x 打印塔区+链区每个表面 y。
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const l2 = await import(pathToFileURL(join(ROOT, "packages/shared/src/level2.ts")).href);
const GROUND_TYPE = l2.GROUND_TYPE;
const w = kernel.makeWorld("ice_03");
const lvl = w.level;
const W = 1248, H = 928;
const solid = new Uint8Array(W * H);
const fill = (pts) => {
  const ymin = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1]))));
  const ymax = Math.min(H, Math.ceil(Math.max(...pts.map((p) => p[1]))));
  for (let y = ymin; y < ymax; y++) {
    const xc = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xc.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xc.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xc.length; k += 2) {
      const x0 = Math.max(0, Math.round(xc[k])), x1 = Math.min(W, Math.round(xc[k + 1]));
      for (let x = x0; x < x1; x++) solid[y * W + x] = 1;
    }
  }
};
for (let r = 0; r < lvl.rows; r++) for (let c = 0; c < lvl.cols; c++) {
  const t = lvl.groundType[r * lvl.cols + c];
  const X = c * 32, Y = r * 32;
  const tri = (loc) => fill(loc.map(([px, py]) => [X - px * 32, Y - py * 32]));
  if (t === GROUND_TYPE.SOLID || t === 10) fill([[X, Y], [X + 32, Y], [X + 32, Y + 32], [X, Y + 32]]);
  else if (t === GROUND_TYPE.SLOPE_A || t === 11) tri([[-1, 0], [-1, -1], [0, -1]]);
  else if (t === GROUND_TYPE.SLOPE_B || t === 12) tri([[0, 0], [-1, -1], [0, -1]]);
  else if (t === GROUND_TYPE.WEDGE_C) tri([[0, 0], [-1, 0], [-1, -1]]);
  else if (t === GROUND_TYPE.WEDGE_D) tri([[0, 0], [-1, 0], [0, -1]]);
}
for (const run of lvl.liquidRuns ?? []) {
  const C0 = run.col0 * 32, Rr = run.row * 32, C1 = (run.col1 + 1) * 32;
  fill([[C0, Rr], [C0 + 1.3 * 32, Rr + 16], [C0 + 1.3 * 32, Rr + 32], [C0, Rr + 32]]);
  fill([[C1 - 9.6, Rr + 16], [C1 - 32, Rr + 32], [C1 - 32, Rr + 16], [C1 - 9.6, Rr + 32]]);
}
const zone = (name, x0, x1) => {
  console.log(`== ${name} x[${x0},${x1}] 每个 x 的顶面 y（连续同 y = 平段）==`);
  const tops = [];
  for (let x = x0; x <= x1; x++) {
    let top = -1;
    for (let y = 1; y < H; y++) if (solid[y * W + x] && !solid[(y - 1) * W + x]) { top = y; break; }
    tops.push(top);
  }
  const runs = [];
  for (let i = 0; i < tops.length; i++) {
    if (runs.length && runs.at(-1).y === tops[i] && runs.at(-1).x1 === x0 + i - 1) runs.at(-1).x1 = x0 + i;
    else runs.push({ x0: x0 + i, x1: x0 + i, y: tops[i] });
  }
  console.log(runs.filter((r) => r.x1 - r.x0 >= 3).map((r) => `${r.y === -1 ? "  -" : String(r.y).padStart(3)}:[${r.x0}-${r.x1}]`).join(" "));
};
zone("塔攀", 630, 968);
zone("链+挂台", 150, 400);
zone("顶楼梯+A西岸", 150, 340);
