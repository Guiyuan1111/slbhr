// forest_17 全量解码 dump（flashbp17 槽）——模式同 note/evidence/forest_05/tools/geo-f05.mjs
// 用法: node TEMP/flashbp17/dump-f17.mjs  （仓库根 gyのFW 下执行）
import { makeWorld, locateLevel, makeProvider } from "../../../../scripts/e2e/routetool/kernel.mjs";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const { parseLevel } = await import(pathToFileURL(join(ROOT, "packages/shared/src/level2.ts")).href);

const { dir, doc } = locateLevel("forest_17");
const lvl = parseLevel("forest_17", doc, makeProvider(dir));

console.log("== [A] LevelData 结构化摘要 ==");
console.log(`size: ${lvl.cols}x${lvl.rows} tiles = ${lvl.widthPx}x${lvl.heightPx}px`);
console.log(`spawn: fb=${JSON.stringify(lvl.spawn.fireboy)} wg=${JSON.stringify(lvl.spawn.watergirl)}`);
console.log(`doors: fb=${JSON.stringify(lvl.doors.fireboy)} wg=${JSON.stringify(lvl.doors.wg ?? lvl.doors.watergirl)}`);
console.log(`diamonds(${lvl.diamonds.length}):`);
for (const d of lvl.diamonds) console.log(`  ${d.id} ${d.kind} @ (${d.x},${d.y})`);
console.log(`liquidRuns(${lvl.liquidRuns.length}): ${JSON.stringify(lvl.liquidRuns)}`);
console.log(`levers(${lvl.levers.length}):`);
for (const l of lvl.levers) console.log(`  ${l.id} g${l.group} onis=${l.onis} startPos=${l.startPos} @ (${l.x},${l.y})`);
console.log(`pushers(${lvl.pushers.length}) boxes(${lvl.boxes.length}) balls(${lvl.balls.length}) winds(${lvl.winds.length}) hangings(${lvl.hangings.length}) pulleys(${lvl.pulleys.length}) romans(${lvl.romans.length}) windows(${lvl.windows.length})`);
console.log(`platforms(${lvl.platforms.length}):`);
for (const p of lvl.platforms) {
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  const len = Math.hypot(p.dx, p.dy);
  const t1 = { x: cx + p.dx * 32, y: cy + p.dy * 32 };
  console.log(`  ${p.id} rect=(${p.x},${p.y} ${p.w}x${p.h}) center=(${cx},${cy}) dx=${p.dx} dy=${p.dy} g${p.group} rot=${p.rotation} | state1中心=(${t1.x},${t1.y}) 行程=${(len * 32).toFixed(0)}px`);
}
console.log(`unknown(${lvl.unknown.length}): ${JSON.stringify(lvl.unknown)}`);

// Ground gid ASCII 图（行=y 从 0；列=x 从 0；'.'空）
const gidMap = doc.layers.find((l) => l.name === "Ground").data;
console.log("\n== [B] Ground gid ASCII（1=实心 2=SLOPE_A'/' 3=SLOPE_B'\\' 4=WEDGE_C 5=WEDGE_D .=空; 列刻度: 0/5/10..35）==");
let hdr = "    ";
for (let c = 0; c < lvl.cols; c++) hdr += c % 5 === 0 ? String(Math.floor(c / 10) % 10) : " ";
console.log(hdr);
let hdr2 = "    ";
for (let c = 0; c < lvl.cols; c++) hdr2 += c % 5 === 0 ? String(c % 10) : " ";
console.log(hdr2);
for (let r = 0; r < lvl.rows; r++) {
  let line = "";
  for (let c = 0; c < lvl.cols; c++) {
    const g = gidMap[r * lvl.cols + c];
    line += g === 0 ? "." : g === 1 ? "#" : g === 2 ? "/" : g === 3 ? "\\" : g === 4 ? "c" : g === 5 ? "d" : "?";
  }
  console.log(`y${String(r * 32).padStart(3)} ${line}`);
}

console.log("\n== [C] 全刚体 fixture 顶点（屏幕px，模式同 geo-f05）==");
const w = makeWorld("forest_17");
const world = w.built.world;
let b = world.GetBodyList(), n = 0;
while (b) {
  const type = typeof b.GetType === "function" ? b.GetType() : "?";
  let fx = b.GetFixtureList();
  while (fx) {
    const sh = fx.GetShape();
    if (sh.m_vertices) {
      const pts = sh.m_vertices.slice(0, 8).map((q) => ({ x: +((b.GetPosition().x + q.x) * -32).toFixed(1), y: +((b.GetPosition().y + q.y) * -32).toFixed(1) }));
      const ud = typeof b.GetUserData() === "string" ? b.GetUserData() : JSON.stringify(b.GetUserData());
      const sensor = fx.IsSensor() ? " SENSOR" : "";
      console.log(`b${n} ud=${ud} dyn=${type === 2 ? 1 : 0}${sensor}: ` + pts.map((p) => `(${p.x},${p.y})`).join(" "));
    }
    fx = fx.GetNext();
  }
  b = b.GetNext();
  n++;
}

console.log("\n== [D] 机关 f0 态 + 240 帧静置探针 ==");
console.log(`levers: ` + w.mechanisms.levers.map((l, i) => `l${i}(g${l.group}) state=${l.state} ang=${l.angleDeg().toFixed(1)}deg`).join(" | "));
console.log(`platforms f0 中心: ` + w.mechanisms.platforms.map((p, i) => {
  const pos = p.body.GetPosition();
  return `p${i}(g${p.group}) screen=(${(pos.x * -32).toFixed(1)},${(pos.y * -32).toFixed(1)})`;
}).join(" | "));
console.log(`doors: fb=${JSON.stringify(w.built.doors.fireboy.pos)} wg=${JSON.stringify(w.built.doors.watergirl.pos)}`);
const noInput = () => ({ fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } });
for (let f = 0; f < 240; f++) w.step(1 / 60, noInput());
for (const role of ["fireboy", "watergirl"]) {
  const s = w.snapshotPlayer(role);
  console.log(`${role} @240f: x=${s.x?.toFixed?.(1)} y=${s.y?.toFixed?.(1)} dead=${s.dead} dying=${s.dying}`);
}
console.log(`levers @240f: ` + w.mechanisms.levers.map((l, i) => `l${i} state=${l.state} ang=${l.angleDeg().toFixed(1)}`).join(" | "));
console.log(`platforms @240f: ` + w.mechanisms.platforms.map((p, i) => {
  const pos = p.body.GetPosition();
  return `p${i} screen=(${(pos.x * -32).toFixed(1)},${(pos.y * -32).toFixed(1)})`;
}).join(" | "));
