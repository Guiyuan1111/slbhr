// dump-ice03.mjs — ice_03 内核侧静态 dump（fw-route-ice03 槽，2026-11-01）。
// 口径参照 note/evidence/2026-10-25-ice-temple/tools/oracle-ice02-p1-dump.mjs，但不走 oracle，
// 直跑内核（scripts/e2e/routetool/kernel.mjs makeWorld）。坐标=屏幕 px（y 向下）。
// 内容：
//   D1 tilemap 网格（Ground 层 gid→type remap 后语义字符画，32px/格，39×29）
//   D2 liquids（runs：kind/行/列段/冻结态）
//   D3 spawn/doors/diamonds
//   D4 机关快照：beamers（含光束折线 pts）/infiniteMirrors/sliders/timedPushers
//   D5 t 步进后光束复核（默认 t=60，验证初始光路落点）
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const { makeWorld } = await import(`${ROOT}/scripts/e2e/routetool/kernel.mjs`.replace("file://", "file://"));
const MOD = await import("node:path");
const kernelMod = await import(new URL(`file://${MOD.join(ROOT, "scripts/e2e/routetool/kernel.mjs")}`).href);
const { makeWorld: mk } = kernelMod;
const { GROUND_TYPE } = await import(new URL(`file://${MOD.join(ROOT, "packages/shared/src/level2.ts")}`).href);

const w = mk("ice_03");
const lvl = w.level;

// ---- D1 网格字符画（type 语义：0 solid . #？；1 '/'；2 '\'；3/4 wedge；5 water ~；6 lava !；7 green $；8/9 cap；10 桥=；11 SE /；12 SW \；55 冰水 I）
const remap = (t) => {
  if (t === GROUND_TYPE.SOLID || t === 10) return "#"; // 实心/直桥
  if (t === GROUND_TYPE.SLOPE_A || t === 11) return "/"; // 凸斜
  if (t === GROUND_TYPE.SLOPE_B || t === 12) return "\\"; // 凸斜镜像
  if (t === GROUND_TYPE.WEDGE_C) return "c";
  if (t === GROUND_TYPE.WEDGE_D) return "d";
  if (t === GROUND_TYPE.WATER) return "~";
  if (t === GROUND_TYPE.LAVA) return "!";
  if (t === GROUND_TYPE.GREEN) return "$";
  if (t === 55) return "I"; // 冰面水（startFrozen）
  if (t === -99) return " ";
  return "?";
};
const lines = [];
for (let r = 0; r < lvl.rows; r++) {
  let s = "";
  for (let c = 0; c < lvl.cols; c++) s += remap(lvl.groundType[r * lvl.cols + c]);
  lines.push(`${String(r).padStart(2)} ${s}`);
}
console.log("== D1 tilemap（行号=tile row，y=row*32+32 底；列 x=col*32..+32）");
console.log(lines.join("\n"));

// ground 原始 gid 分布（核对 remap）
const gidCount = {};
for (let i = 0; i < lvl.ground.length; i++) {
  const g = lvl.ground[i];
  if (g) gidCount[g] = (gidCount[g] ?? 0) + 1;
}
console.log("gid 分布:", JSON.stringify(gidCount));

// ---- D2 liquids
console.log("== D2 liquids");
for (const l of lvl.liquidRuns ?? []) console.log(" run", JSON.stringify(l));
const M = w.mechSnapshot();
console.log("liquidsFrozen:", JSON.stringify(M.liquidsFrozen));
console.log("built liquids:", JSON.stringify((w.liquids ?? []).map((l) => ({ x: l.pos?.x, y: l.pos?.y, frozen: l.frozen, type: l.liquidType }))));

// ---- D3 spawn/doors/diamonds
console.log("== D3 spawn:", JSON.stringify(lvl.spawn), "doors:", JSON.stringify(lvl.doors));
console.log("diamonds:", JSON.stringify((w.diamonds ?? []).map((d) => ({ kind: d.kind, x: d.x, y: d.y }))));

// ---- D4 机关
console.log("== D4 机关快照（t=0）");
console.log("beamers:", JSON.stringify(M.beamers));
console.log("infiniteMirrors:", JSON.stringify(M.infiniteMirrors));
console.log("sliders:", JSON.stringify(M.sliders));
console.log("timedPushers:", JSON.stringify(M.timedPushers));
console.log("platforms:", JSON.stringify(M.platforms));
console.log("pushers:", JSON.stringify(M.pushers));
console.log("levers:", JSON.stringify(M.levers));
console.log("props:", JSON.stringify(M.props));

// ---- D5 t 步进后光束/镜像角复核
const T = Number(process.argv[2] ?? 60);
for (let f = 0; f < T; f++) w.step(1 / 60, { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } });
const M2 = w.mechSnapshot();
console.log(`== D5 t=${T} 光束折线:`, JSON.stringify(M2.beamers));
console.log(`t=${T} mirrors:`, JSON.stringify(M2.infiniteMirrors), "sliders:", JSON.stringify(M2.sliders), "liquidsFrozen:", JSON.stringify(M2.liquidsFrozen));
console.log(`t=${T} fb:`, JSON.stringify(w.snapshotPlayer("fireboy")), "wg:", JSON.stringify(w.snapshotPlayer("watergirl")));
