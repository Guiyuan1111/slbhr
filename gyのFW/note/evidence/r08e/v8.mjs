// r08e v8: forest_08 双门最简线（v8 顶层地图重解码后）
// 地图事实（geom_full.txt + Ground gid 行）：
//   顶层顶面 y192 带：shelf[0,224] → 缺口[224,288](下方 sliver[256,320]@288、再下 slab[160,480]@384)
//     → 塔[288,320] → 斜[320,361.6]→平[352,448]@206.4 → 斜升[438.4,480] → 平[480,512]@192
//     → 斜降[512,553.6] → 平[544,576]@206.4 → 斜升[566.4,608] → 平[608,640]@192(柱顶)
//     → 斜降[640,681.6] → 缺口[681.6,758.4](下方东台[640,1024]@384) → 斜升[758.4,800] → 平[800,832]…
//   顶层水池 sensor：水 gid6 [320,480] 与 [640,800]（wg 免疫）；岩浆 gid7 [512,608]（wg 必须跳过）
//   fb 门 sensor [352,416]x[384,392]（slab 顶 384，带 [336.1,431.9]）
//   wg 门 sensor [704,768]x[384,392]（东台顶 384，带 [690.5,781.5]）
// fb 线：shelf 东行走落缺口[224,288]（松右垂直落，避开塔面 288 与 sliver 256）
//   → 落 slab(~238,348) → 东行入门带 → 停带内
// wg 线：右行全程 → 塔/水塘步行 → [480,512] 平台多 chance 上跳越岩浆[512,608] → 柱顶[608,640]
//   → 斜降[640,681.6] 走落缺口 → 空中右漂 → 落东台(~760,348) ∈ 门带 → 停
// 用法: node --import tsx TEMP/r08e/v8.mjs [总帧数] [denseF0 denseF1]
import { pathToFileURL } from "node:url";
const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const { makeWorld, expandFlat } = await import(pathToFileURL(ROOT + "/scripts/e2e/routetool/kernel.mjs").href);
const E = (f, dir, type) => ({ f, dir, type });

const K = {
  // ---- fb：右行→走落缘(f52)→落 sliver 260(f76)→【西折】左行走落 sliver 西缘(256)
  //   → 垂直落 slab ~215-225(f~100)（水池 [320,480] 以西，安全）→ 右行入门带 → coast 停
  fbR1: 2,      // right down 出发（平走 4.55px/f）
  fbR1u: 51,    // right up：f52 中心 237.6 走落（v8b 实证落 sliver 260）
  fbL1: 78,     // left down：sliver 上西折（落定后）
  fbL1u: 95,    // left up：17f 左行（v8d: 6f 仅走 4.9px，须延长）→ ~242 走落西缘 → 落 slab
  fbR2d: 103,   // right down：slab 东行（下落中按下无害）
  fbR2u: 144,   // right up：中心 ~360 → coast 停 ~390 ∈ 门带[336.1,431.9]
  // ---- wg：右行全程。tap1@105 sliver pin 静跳→47f 漂 150→落平 422.9(f152, 水池免疫)
  //   → tap2@154 全力跳→右持飞越岩浆+柱顶→c=170.5 越池面 x=684(f212)→浮于水池[640,800]
  //     (浮力平衡 c≈170.9)→滑东→爬斜[758.4,800]→平[800,832]→走落东缘(845.6,f~245)
  //   → 落东台 ~950(f~269)→左行入门带→f319 松左 coast 停 ~710 ∈ [690.5,781.5]
  wgR1: 2,      // right down 出发（保持到东台落地）
  wgJ1: 105,    // up down：sliver pin 静跳（v8a 实证即燃，47f 落 422.9）
  wgJ1r: 107,   // up up
  wgJ2: 154,    // up down：平[352,448] 全力跳（x~424）
  wgJ2r: 156,   // up up
  wgL2: 272,    // left down：东台落地后西行
  wgL2u: 319,   // left up：中心 ~740 → coast 停 ~710 ∈ 门带
};

const fb = [
  E(K.fbR1, "right", "down"),
  E(K.fbR1u, "right", "up"),
  E(K.fbL1, "left", "down"), E(K.fbL1u, "left", "up"),
  E(K.fbR2d, "right", "down"), E(K.fbR2u, "right", "up"),
];
const wg = [
  E(K.wgR1, "right", "down"),
  E(K.wgJ1, "up", "down"), E(K.wgJ1r, "up", "up"),
  E(K.wgJ2, "up", "down"), E(K.wgJ2r, "up", "up"),
  E(K.wgL2, "left", "down"), E(K.wgL2u, "left", "up"),
];

const TOTAL = Number(process.argv[2] ?? 320);
const D0 = Number(process.argv[3] ?? 0), D1 = Number(process.argv[4] ?? 320);
const w = makeWorld("forest_08");
const ins = expandFlat(fb, wg, TOTAL);
const trace = [];
let won = false, dead = null;
for (let f = 0; f < TOTAL; f++) {
  w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
  const F = w.snapshotPlayer("fireboy"), G = w.snapshotPlayer("watergirl");
  trace.push({ f, fb: [+F.x.toFixed(1), +F.y.toFixed(1)], wg: [+G.x.toFixed(1), +G.y.toFixed(1)], fd: F.doorFrame, wd: G.doorFrame, ph: w.phase });
  if (F.dead || F.dying || G.dead || G.dying) { dead = { f, F, G }; break; }
  if (w.phase === "won") { won = true; trace.winF = f; break; }
}
const show = (f) => (f >= D0 && f <= D1) || f % 40 === 0 || (won && trace.winF && f >= trace.winF - 3);
console.log("f     fb(x,y)              wg(x,y)              dF/dW ph");
for (const t of trace) {
  if (!show(t.f)) continue;
  console.log(`${String(t.f).padStart(4)}  (${String(t.fb[0]).padStart(6)},${String(t.fb[1]).padStart(6)})  (${String(t.wg[0]).padStart(6)},${String(t.wg[1]).padStart(6)})  ${t.fd}/${t.wd}  ${t.ph}`);
}
if (dead) {
  console.log(`\nDEAD at f${dead.f}: fb(${dead.F.x.toFixed(1)},${dead.F.y.toFixed(1)})${dead.F.dying ? "!" : ""} wg(${dead.G.x.toFixed(1)},${dead.G.y.toFixed(1)})${dead.G.dying ? "!" : ""}`);
} else {
  console.log(`\nphase=${w.phase} won=${won}${trace.winF ? " winF=" + trace.winF : ""}`);
}
