// probe2-ice03.mjs v3 — 关键环节实测（fw-route-ice03 槽）。
// 已确认规律：45° 斜坡需入口速度（≳150-200px/s），站立/低速进入=卡死滑回（PC v2 卡 1071.7、PD v2 卡 627.2）。
// PB3: wg 东助跑跳上挂台(顶800)→链爬→西岸跳；PC3: 折返助跑西行+推 puck 全序；PD3: 塔顶平台起步爬峰；
// PE3: 峰顶折返西跳→A东坡着陆。规约：首输入 ≥f3；b2 坐标单负号。
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const { makeWorld } = kernel;
const NONE = { up: false, left: false, right: false };
const R = (v) => +v.toFixed(1);
const px = (w, r) => { const s = w.snapshotPlayer(r); return [R(s.x), R(s.y), Math.round(s.vx), Math.round(s.vy)]; };
const groundedOf = (w, r) => w.players[r].feetContacts.length > 0;
const teleport = (w, r, x, y) => {
  const b = w.players[r].body;
  b.SetPosition({ x: -x / 32, y: -y / 32 });
  b.SetLinearVelocity({ x: 0, y: 0 });
  b.SetAwake(true);
};

console.log("== PB3 东助跑跳挂台（起点扫描：x0 东跑至 145-158 跳）→链爬→西岸");
for (const [x0, jL, jR, holdF] of [[40, 122, 134, 8], [56, 126, 138, 10], [40, 132, 144, 12]]) {
  const w = makeWorld("ice_03");
  teleport(w, "watergirl", x0, 860);
  const log = [];
  let phase = 0, jumpF = -1, blobF = -1, chainTopF = -1, bankF = -1;
  for (let f = 0; f < 700; f++) {
    let inp = NONE;
    const [x, y] = px(w, "watergirl");
    if (phase === 0) { // 东跑到跳线→跳+右
      if (f < 3) inp = NONE;
      else if (jumpF < 0) { inp = { ...NONE, right: true }; if (x >= (jL + jR) / 2) { inp = { ...NONE, right: true, up: true }; jumpF = f; log.push(`f${f} 跳 [${x},${y}] vx=${px(w, "watergirl")[2]}`); } }
      else if (f < jumpF + holdF) inp = { ...NONE, right: true };
      else inp = NONE;
      const g = groundedOf(w, "watergirl");
      if (jumpF > 0 && f > jumpF + 5 && g) {
        const feet = y + 35.2;
        if (feet <= 806 && feet >= 792 && x >= 168 && x <= 230) { phase = 1; blobF = f; log.push(`f${f} 落台 [${x},${y}] vx=${px(w, "watergirl")[2]}`); }
        else if (feet > 880) { phase = -1; log.push(`f${f} 落回地面 [${x},${y}] 失败`); break; }
      }
    } else if (phase === 1) { // 按右爬链
      inp = { ...NONE, right: true };
      if (x >= 344 && y <= 660) { phase = 2; chainTopF = f; log.push(`f${f} 链顶 [${x},${y}]`); }
      else if (y > 880) { log.push(`f${f} 掉落 [${x},${y}]`); break; }
    } else if (phase === 2) {
      inp = f < chainTopF + 26 ? { ...NONE, left: true, up: true } : { ...NONE, left: true };
      if (groundedOf(w, "watergirl") && y <= 585 && x >= 314 && x <= 358 && f > chainTopF + 8) { phase = 3; bankF = f; log.push(`f${f} 西岸 [${x},${y}]`); inp = NONE; }
    }
    w.step(1 / 60, { fireboy: NONE, watergirl: inp });
  }
  console.log(`x0=${x0} 台f=${blobF} 链顶f=${chainTopF} 岸f=${bankF} 终=${JSON.stringify(px(w, "watergirl").slice(0, 2))} | ${log.join(" | ")}`);
}

console.log("== PC3 折返助跑西行 + 推 puck 全序（右跑到 1195→左推越两级台→推 puck 西底→东推冻结 A）");
{
  const w = makeWorld("ice_03");
  const log = [];
  let phase = 0, fzT = { A: -1, B: -1, C: -1 };
  for (let f = 0; f < 1400; f++) {
    let inp = NONE;
    const M = w.mechSnapshot();
    const sx = M.sliders[0].x;
    const wg = px(w, "watergirl");
    if (M.liquidsFrozen[2] && fzT.C < 0) fzT.C = f;
    if (M.liquidsFrozen[1] && fzT.B < 0) fzT.B = f;
    if (M.liquidsFrozen[0] && fzT.A < 0) fzT.A = f;
    if (f >= 3) {
      if (phase === 0) { inp = { ...NONE, right: true }; if (wg[0] >= 1195) { phase = 1; log.push(`f${f} 折返 [${wg[0]},${wg[1]}] vx=${wg[2]}`); } }
      else if (phase === 1) { inp = { ...NONE, left: true }; if (sx <= 306) { phase = 2; log.push(`f${f} 西底 sx=${R(sx)} wg=${wg[0]}`); } }
      else if (phase === 2) { inp = { ...NONE, right: true }; if (M.liquidsFrozen[0]) { phase = 3; log.push(`f${f} A冻 sx=${R(sx)} wg=${wg[0]}`); } }
    }
    if (f % 100 === 0) log.push(`f${f} sx=${R(sx)} wg=${wg[0]},${wg[1]}`);
    w.step(1 / 60, { fireboy: NONE, watergirl: inp });
  }
  const M = w.mechSnapshot();
  console.log(`冻结 C@${fzT.C} B@${fzT.B} A@${fzT.A} 终 sx=${R(M.sliders[0].x)} wg=${JSON.stringify(px(w, "watergirl").slice(0, 2))} frozen=${JSON.stringify(M.liquidsFrozen)} | ${log.slice(-9).join(" | ")}`);
}

console.log("== PD3 塔顶平台(750,470)起步爬峰");
{
  const w = makeWorld("ice_03");
  teleport(w, "watergirl", 750, 470);
  const marks = [];
  let peakF = -1;
  for (let f = 0; f < 1000; f++) {
    w.step(1 / 60, { fireboy: NONE, watergirl: f < 3 ? NONE : { ...NONE, right: true } });
    const [x, y] = px(w, "watergirl");
    if (x >= 944 && groundedOf(w, "watergirl") && peakF < 0) { peakF = f; marks.push(`f${f} 达峰 [${x},${y}]`); }
    if (f % 100 === 0) marks.push(`f${f} [${x},${y}]`);
  }
  console.log(`峰f=${peakF} 终=${JSON.stringify(px(w, "watergirl").slice(0, 2))} | ${marks.join(" | ")}`);
}

console.log("== PE3 峰顶折返西跳（达峰→左→x≤928 跳→落 A 东坡?）");
for (const trigX of [928, 916]) {
  const w = makeWorld("ice_03");
  teleport(w, "watergirl", 750, 470);
  const marks = [];
  let phase = 0, jumpF = -1, landF = -1, landX = -1, landY = -1;
  for (let f = 0; f < 1500; f++) {
    let inp = NONE;
    const [x, y] = px(w, "watergirl");
    if (f < 3) inp = NONE;
    else if (phase === 0) { inp = { ...NONE, right: true }; if (x >= 950 && groundedOf(w, "watergirl")) { phase = 1; marks.push(`f${f} 峰 [${x},${y}]`); } }
    else if (phase === 1) { inp = { ...NONE, left: true }; if (x <= trigX && groundedOf(w, "watergirl")) { inp = { ...NONE, left: true, up: true }; phase = 2; jumpF = f; marks.push(`f${f} 跳 [${x},${y}] vx=${px(w, "watergirl")[2]}`); } }
    else if (phase === 2) { inp = { ...NONE, left: true }; if (groundedOf(w, "watergirl") && f > jumpF + 8) { phase = 3; landF = f; landX = x; landY = y; marks.push(`f${f} 落 [${x},${y}]`); } }
    w.step(1 / 60, { fireboy: NONE, watergirl: inp });
    if (f % 150 === 0) marks.push(`f${f} [${R(x)},${R(y)}]`);
  }
  console.log(`trig=${trigX} 跳f=${jumpF} 落f=${landF}@[${R(landX)},${R(landY)}] 终=${JSON.stringify(px(w, "watergirl").slice(0, 2))} | ${marks.join(" | ")}`);
}
