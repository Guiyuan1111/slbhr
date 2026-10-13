// flashbp22: forest_22 静态几何/机关解码（纯文件分析，无运行时）
// 语义来源: packages/shared/src/level2.ts (GROUND_TYPE/tileObjRect/mergedProps)
//           packages/shared/src/kernel/build.ts (groundShapePts/solid run/liquid/wind)
//           packages/shared/src/kernel/mechanisms.ts (Pusher/MovingPlatform/Wind)
import { readFileSync } from "node:fs";

const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";
const json = JSON.parse(readFileSync(`${ROOT}/data/forest/levels/forest_22.json`, "utf8"));
const ts = (n) => JSON.parse(readFileSync(`${ROOT}/assets/tilemaps/tilesets/${n}.json`, "utf8"));
const groundTs = ts("Ground"), charsTs = ts("Chars"), largeTs = ts("LargeObjects"), objectsTs = ts("Objects");

const COLS = json.width, ROWS = json.height, T = json.tilewidth; // 39 x 29 x 32
const firstgid = (name) => json.tilesets.find((t) => t.source.endsWith(`/${name}.json`)).firstgid;

// ---- Ground 层 type 网格（level2.ts:338-366 同逻辑）----
const gFirst = firstgid("Ground");
const data = json.layers.find((l) => l.name === "Ground").data;
const typeAt = new Int16Array(COLS * ROWS).fill(-99);
for (let i = 0; i < COLS * ROWS; i++) {
  const gid = data[i] | 0;
  if (!gid) continue;
  let t = groundTs.tileproperties[String(gid - gFirst)]?.type;
  if (t === undefined) t = 0;
  t = Number(t);
  if (t === 11) t = 1; if (t === 12) t = 2; // SLOPE_REMAP
  typeAt[i] = t;
}
const at = (c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS ? -99 : typeAt[r * COLS + c]);

// ---- 固定件多边形（屏幕 px；build.ts:196-231 + groundShapePts 屏幕换算）----
// solid run: [runV, runV+runA*T] x [py, py+T]
// slope/wedge 顶点（cell 左上=原点）:
//   t1 "/": (R,T)(R,B)(L,B)  t2 "\": (L,T)(R,B)(L,B)
//   t3 右上楔: (L,T)(R,T)(R,B)  t4 左上楔: (L,T)(R,T)(L,B)
const fixtures = []; // {kind, pts:[[x,y]...], c0, r0}
const liquidRuns = [];
{
  let runKind, runStart;
  for (let r = 0; r <= ROWS; r++) {
    let kind;
    for (let c = 0; c <= COLS; c++) {
      if (c < COLS) {
        const t = at(c, r);
        kind = t === 5 ? "water" : t === 6 ? "lava" : t === 7 ? "green" : undefined;
      }
      if (c === COLS || kind !== runKind) {
        if (runKind !== undefined) liquidRuns.push({ kind, row: r, col0: runStart, col1: c - 1 });
        if (c < COLS) { runKind = kind; runStart = c; } else runKind = undefined;
      }
    }
  }
}
// 重建 liquidRuns（上面循环收尾逻辑易错，直接按 level2 原逻辑再扫一遍）
liquidRuns.length = 0;
for (let r = 0; r < ROWS; r++) {
  let runKind, runStart = 0;
  for (let c = 0; c <= COLS; c++) {
    let kind;
    if (c < COLS) { const t = at(c, r); kind = t === 5 ? "water" : t === 6 ? "lava" : t === 7 ? "green" : undefined; }
    if (kind !== runKind) {
      if (runKind !== undefined) liquidRuns.push({ kind: runKind, row: r, col0: runStart, col1: c - 1 });
      runKind = kind; runStart = c;
    }
  }
}
for (let r = 0; r < ROWS; r++) {
  let runA = 0, runV = 0;
  for (let c = 0; c <= COLS; c++) {
    const t = c < COLS ? at(c, r) : -99;
    if (t === 0) {
      if (runA === 0) { runV = c; runA = 1; } else runA++;
      const right = c + 1 < COLS ? at(c + 1, r) : -99;
      if (right === 0) continue;
      const x0 = runV * T, x1 = (runV + runA) * T, y0 = r * T, y1 = y0 + T;
      fixtures.push({ kind: "solid", pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], c0: runV, r0: r, A: runA });
      runA = 0;
    } else if (t >= 1 && t <= 4) {
      const L = c * T, R = L + T, Tp = r * T, B = Tp + T;
      const pts = t === 1 ? [[R, Tp], [R, B], [L, B]]
        : t === 2 ? [[L, Tp], [R, B], [L, B]]
        : t === 3 ? [[L, Tp], [R, Tp], [R, B]]
        : [[L, Tp], [R, Tp], [L, B]];
      fixtures.push({ kind: ["", "slopeA/", "slopeB\\", "wedgeC_ur", "wedgeD_ul"][t], pts, c0: c, r0: r });
    }
  }
}
// 液体固定件（build.ts buildLiquid）：中段下盒 + 左右端盖（顶外扩 0.3m=9.6px）
for (const run of liquidRuns) {
  const { col0, col1, row } = run;
  const A = col1 - col0 + 1;
  const x0 = col0 * T, x1 = (col1 + 1) * T, yT = row * T + 0.55 * T, yB = (row + 1) * T; // 中段盒: -0.45m 顶 = row*32+14.4? 屏幕换算见下注
  // 物理 y = -(row+0.45) → 屏幕 y = 32(row+0.45) = row*32+14.4; 底 = (row+1)*32
  const yMid0 = row * T + 0.45 * T, yMid1 = (row + 1) * T;
  fixtures.push({ kind: `liquidMid:${run.kind}`, pts: [[x0, yMid0], [x1, yMid0], [x1, yMid1], [x0, yMid1]], c0: col0, r0: row, A });
  const capL = [[x1, yT], [x0 - 0.3 * T, yT - 0.05 * T], [x0 - 0.3 * T, yB], [x1, yB]];
  const capR = [[x1 + 0.3 * T, yT - 0.05 * T], [x0, yT], [x0, yB], [x1 + 0.3 * T, yB]];
  fixtures.push({ kind: `liquidCapL:${run.kind}`, pts: capL, c0: col0, r0: row });
  fixtures.push({ kind: `liquidCapR:${run.kind}`, pts: capR, c0: col1, r0: row });
}

// ---- TestPoint 剖面: 点是否在地面固定件内 ----
function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function solidAt(px, py) {
  for (const f of fixtures) if (f.kind.startsWith("solid") || f.kind.startsWith("slope") || f.kind.startsWith("wedge")) {
    if (inPoly(px, py, f.pts)) return f;
  }
  return null;
}
function columnProfile(px, yFrom, yTo, step = 4) {
  const hits = [];
  let cur = null;
  for (let y = yFrom; y <= yTo; y += step) {
    const f = solidAt(px, y);
    if (f && !cur) cur = { y0: y, f };
    else if (!f && cur) { hits.push({ y0: cur.y0, y1: y - step, kind: cur.f.kind, c: cur.f.c0, r: cur.f.r0 }); cur = null; }
  }
  if (cur) hits.push({ y0: cur.y0, y1: yTo, kind: cur.f.kind, c: cur.f.c0, r: cur.f.r0 });
  return hits;
}

// ---- ASCII 地图 ----
const CH = { 0: "#", 1: "/", 2: "\\", 3: "r", 4: "l", 5: "~", 6: "!", 7: "g", [-99]: "." };
console.log("== ASCII type map (row: y=col*32; # solid, / slopeA, \\ slopeB, r wedgeC右上, l wedgeD左上, ~ water, ! lava, g green, . empty) ==");
for (let r = 0; r < ROWS; r++) {
  let line = "";
  for (let c = 0; c < COLS; c++) line += CH[at(c, r)];
  console.log(String(r).padStart(2) + " y" + String(r * T).padStart(4) + " " + line);
}
console.log("cols: 0..38, x = col*32..col*32+32; 地图 1248x928");

// ---- 固定件清单 ----
console.log("\n== solid runs (px rects) ==");
for (const f of fixtures) if (f.kind === "solid") {
  const [x0, y0] = f.pts[0], [x1, y1] = f.pts[2];
  console.log(`  x${x0}-${x1} y${y0}-${y1}  (row${f.r0} cols${f.c0}+${f.A})`);
}
console.log("\n== slope/wedge cells (px triangles) ==");
for (const f of fixtures) if (/slope|wedge/.test(f.kind)) {
  console.log(`  ${f.kind.padEnd(9)} cell(${f.c0},${f.r0}) px(${f.c0 * T},${f.r0 * T}) pts ${JSON.stringify(f.pts)}`);
}
console.log("\n== liquid runs ==");
console.log(liquidRuns.length ? JSON.stringify(liquidRuns) : "  (无 —— Ground 层无 gid6/7/8)");

// gid 使用统计
const counts = {};
for (const v of data) { const k = `gid${v}`; counts[k] = (counts[k] || 0) + 1; }
console.log("\nGround gid 统计:", JSON.stringify(counts));

// ---- Chars 层 ----
console.log("\n== Chars ==");
const cFirst = firstgid("Chars");
const chLayer = json.layers.find((l) => l.name === "Chars");
const doors = {}, spawns = {}, diamonds = [];
for (const o of chLayer.objects) {
  const local = o.gid - cFirst;
  const kind = charsTs.tiles[String(local)]?.type;
  const char = charsTs.tileproperties[String(local)]?.char;
  const top = o.y - o.height; // tileObjRect
  const cx = o.x + 32, cy = top + 32;
  if (kind === "char") { const role = char === "wg" ? "wg" : "fb"; spawns[role] = { x: o.x + 32, y: o.y }; console.log(`  spawn ${role}: tileObj gid${o.gid} @(${o.x},${o.y}底边) → 出生点 (${o.x + 32},${o.y}), 64x64 盒 y${top}-${o.y}`); }
  else if (kind === "door") { doors[char] = { x: o.x, y: top }; console.log(`  door ${char}: gid${o.gid} @(${o.x},${o.y}底边) → 顶边盒 x${o.x}-${o.x + 64} y${top}-${o.y}; 门底铰 pos=(${o.x + 32},${o.y}); sensor 1x0.125m 中心(${o.x + 32},${o.y + 4})`); }
  else if (kind === "diamond") { diamonds.push({ gid: o.gid, char, cx, cy }); console.log(`  diamond ${char.padEnd(6)} gid${o.gid} 中心 (${cx},${cy})`); }
}

// ---- Objects 层 ----
console.log("\n== Objects 层（wind gid26=LargeObjects#2 wind 默认 length10 group0; pusher gid27=Objects#0 pusher 默认 group0）==");
const oLayer = json.layers.find((l) => l.name === "Objects");
function windBodyPos(rect, rotation) { // level2.ts:149-155, 旋转 -90 → body=(rect.x-48, rect.y+rect.h-32)
  const rotDeg = rotation + 90;
  const eAng = (-rotDeg * Math.PI) / 180;
  const ex = -48 * Math.cos(eAng) - 32 * Math.sin(eAng);
  const ey = -48 * Math.sin(eAng) + 32 * Math.cos(eAng);
  return { x: rect.x + ex, y: rect.y + rect.h - ey };
}
const groups = {};
for (const o of oLayer.objects) {
  if (o.type === "platform") {
    const wM = o.width / 32, hM = o.height / 32;
    const swap = wM < hM;
    const cx = o.x + (swap ? o.width / 2 : o.width / 2), cy = o.y + (swap ? o.height / 2 : o.height / 2);
    const len = Math.hypot(o.properties?.dx ?? 4, o.properties?.dy ?? 0);
    const travel = { x: (o.properties?.dx ?? 4) * 32, y: (o.properties?.dy ?? 0) * 32 };
    console.log(`  platform id${o.id} rect(${o.x},${o.y},${o.width}x${o.height}) 中心(${cx},${cy}) 碰撞盒 ${swap ? o.height + "x" + Math.round((1 - 0.12) * o.width * 0.5) * 2 / 1 : ""}...`);
    console.log(`     dx=${o.properties?.dx ?? 4} dy=${o.properties?.dy ?? 0} group=${o.properties?.group ?? 0} 行程 state1→ 原位+(${travel.x},${travel.y})px, [−${len}m,0] 速度2m/s 力220`);
    (groups[o.properties?.group ?? 0] ??= []).push(`platform id${o.id}`);
  } else if (o.gid !== undefined) {
    const base = o.gid >= firstgid("Objects") && o.gid - firstgid("Objects") < 16 ? "Objects" : "LargeObjects";
    if (base === "LargeObjects") {
      const local = o.gid - firstgid("LargeObjects");
      const typeName = largeTs.tiles[String(local)]?.type;
      const props = { ...(largeTs.tileproperties[String(local)] ?? {}), ...(o.properties ?? {}) };
      if (typeName === "wind") {
        const rect = { x: o.x, y: o.y - o.height, w: o.width, h: o.height };
        const bp = windBodyPos(rect, o.rotation);
        const lengthM = props.length ?? 10;
        // 机身梯形: 底3.7m@y0 顶2.5m@+0.6m; 传感器 2.6m宽 x 0.5..0.5+length 高, 均在 body 局部(+y=屏幕上, angle=0)
        const colHalf = 1.3 * 32, y0 = bp.y - 0.5 * 32, y1 = bp.y - (0.5 + lengthM) * 32;
        console.log(`  wind id${o.gid === 26 && o.id === 26 ? "" : ""}id${o.id} gid26 rotation${o.rotation} len=${lengthM}${props.windWidth ? " windWidth=" + props.windWidth + "(解析器/内核未消费!)" : ""} group=${props.group} initialState=${props.initialState}`);
        console.log(`     rect顶边(${rect.x},${rect.y},${rect.w}x${rect.h}) 机身锚点(${bp.x},${bp.y}) 机身梯形底±1.85m@${bp.y} 顶±1.25m@${bp.y - 19.2}`);
        console.log(`     风柱传感器 x ${bp.x - colHalf}..${bp.x + colHalf}, y ${y1}..${y0} (向上 ${0.5 + lengthM}m)`);
        (groups[props.group] ??= []).push(`wind id${o.id}(初始${props.initialState})`);
      }
    } else {
      const local = o.gid - firstgid("Objects");
      const typeName = objectsTs.tiles[String(local)]?.type;
      const props = { ...(objectsTs.tileproperties[String(local)] ?? {}), ...(o.properties ?? {}) };
      if (typeName === "pusher") {
        const cx = o.x + 32, cy = o.y - 32;
        console.log(`  pusher id${o.gid === 27 && o.id === 27 ? "" : ""}id${o.id} gid27 group=${props.group} 中心(${cx},${cy}) 梯形底±1m@${cy} 顶±0.5m@${cy - 19.2} 行程0.7m 阈值0.2m`);
        (groups[props.group] ??= []).push(`pusher id${o.id}`);
      }
    }
  }
}
console.log("\n== 组耦合 (MechManager: 信号源=lever/pusher; 组内 OR → 非信号端 platform/wind) ==");
for (const [g, members] of Object.entries(groups)) {
  const hasSource = members.some((m) => m.startsWith("pusher") || m.startsWith("lever"));
  console.log(`  group ${g}: ${members.join(", ")}${hasSource ? " [有信号源]" : " [无信号源 → 成员保持初始态/原位]"}`);
}

// ---- 剖面法: 出生点/门/推杆 支撑 ----
console.log("\n== 关键点支撑剖面 (solidAt 竖直剖面, px) ==");
function support(x, y) { // 找 (x,y) 下方第一个地面顶
  for (let yy = Math.round(y); yy <= ROWS * T; yy += 2) {
    const f = solidAt(x, yy);
    if (f) return { top: yy, kind: f.kind, cell: `(${f.c0},${f.r0})` };
  }
  return null;
}
for (const [role, s] of Object.entries(spawns)) console.log(`  spawn ${role} (${s.x},${s.y}) → 脚下: ${JSON.stringify(support(s.x, s.y + 2))}`);
for (const [ch, d] of Object.entries(doors)) console.log(`  door ${ch} 铰(${d.x + 32},${d.y + 64}) → 铰点下方: ${JSON.stringify(support(d.x + 32, d.y + 64))}  左缘下方: ${JSON.stringify(support(d.x + 4, d.y + 64))}`);
for (const o of oLayer.objects) {
  if (o.gid === 27) {
    const cx = o.x + 32, cy = o.y - 32;
    console.log(`  pusher id${o.id} 中心(${cx},${cy}) → 踏板下方: ${JSON.stringify(support(cx, cy + 2))}`);
  }
}
