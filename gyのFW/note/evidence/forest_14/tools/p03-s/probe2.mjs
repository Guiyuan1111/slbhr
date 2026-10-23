/**
 * P-03 S 档探针 v2：起跳点扫描。
 * 结论 v1：楔面删除后（丙），从台缘以东（x≳290）干净起跳可落台；出生注入点 256 在
 * 平台正下方，起跳即撞台底——探针须按"路线自由选起跳点"扫描窗口。
 * 判定：落台（feet=台顶±2 且 x∈[14,250]）→ 走到门带 → 双门 isUp → phase=won。
 * 运行：node --import tsx TEMP/p03/probe2.mjs <level> <variant>
 */
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeProvider, locateLevel } from "../../scripts/e2e/routetool/kernel.mjs";
import { ROOT } from "../../scripts/e2e/lib.mjs";

const { parseLevel } = await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "level2.ts")).href);
const { World } = await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "kernel", "world.ts")).href);

const LEVEL = process.argv[2] ?? "forest_14";
const VARIANT = process.argv[3] ?? "V-cb32";
const PLAT_TOP = VARIANT === "V-cb32" ? 288 : 256; // cb32 平台下移一行

function applyVariant(doc, v) {
  const d = JSON.parse(JSON.stringify(doc));
  const W = d.width;
  const ground = d.layers.find((l) => l.type === "tilelayer" && l.name === "Ground").data;
  const set = (r, c, g) => (ground[r * W + c] = g);
  const WEDGES = [[6, 9, 2], [7, 8, 2], [7, 9, 5], [8, 8, 5]];
  for (const [r, c] of WEDGES) set(r, c, 0); // 丙：全案必删
  if (v === "V-cb32") {
    for (let c = 0; c <= 7; c++) { set(8, c, 0); set(9, c, 1); }
    for (const o of d.layers.find((l) => l.name === "Chars").objects) if (o.id === 23 || o.id === 24) o.y += 32;
  }
  if (v === "V-ca32") {
    for (let c = 6; c <= 9; c++) { set(12, c, 0); set(11, c, 1); }
  }
  return d;
}

function build() {
  const { dir, doc } = locateLevel(LEVEL);
  return new World(parseLevel(LEVEL, VARIANT === "V0" ? doc : applyVariant(doc, VARIANT), makeProvider(dir)));
}

/** 单角色一次西跳试验：launchX 起跳，返回落点诊断（不动对方） */
function jumpOnce(w, role, launchX, restFeet) {
  const c = w.players[role];
  const V = c.body.GetPosition().constructor;
  c.body.SetPosition(new V(-launchX / 32, -(restFeet - 35.5) / 32));
  const idle = { up: false, left: false, right: false };
  for (let f = 0; f < 90; f++) w.step(1 / 60, { fireboy: idle, watergirl: idle }); // settle
  const rest = w.snapshotPlayer(role);
  const jump = { up: true, left: true, right: false };
  let minY = 1e9;
  for (let f = 0; f < 240; f++) {
    w.step(1 / 60, { fireboy: f < 60 ? jump : idle, watergirl: f < 60 ? jump : idle });
    minY = Math.min(minY, w.snapshotPlayer(role).y);
    if (w.phase !== "playing") break;
  }
  const end = w.snapshotPlayer(role);
  const feet = end.y + 35.5;
  return {
    restX: +rest.x.toFixed(1),
    rise: +(rest.y - minY).toFixed(1),
    x: +end.x.toFixed(1),
    feet: +feet.toFixed(1),
    onPlat: Math.abs(feet - PLAT_TOP) <= 2.5 && end.x >= 14 && end.x <= 252,
    dead: !!end.dead,
  };
}

/** 全流程：双角色先后各自跳+走门，phase=won 即通关 */
function fullTrial(launchFb, launchWg) {
  const w = build();
  const a = jumpOnce(w, "fireboy", launchFb, VARIANT === "V-ca32" ? 352 : 384);
  if (!a.onPlat) return { launchFb, launchWg, fb: a, verdict: "FB_NO_LAND" };
  const b = jumpOnce(w, "watergirl", launchWg, VARIANT === "V-ca32" ? 352 : 384);
  if (!b.onPlat) return { launchFb, launchWg, fb: a, wg: b, verdict: "WG_NO_LAND" };
  const idle = { up: false, left: false, right: false };
  for (let f = 0; f < 420 && w.phase === "playing"; f++) {
    const adv = (role, tx) => {
      const s = w.snapshotPlayer(role);
      if (Math.abs(s.x - tx) < 4) return idle;
      return { up: false, left: s.x > tx, right: s.x < tx };
    };
    w.step(1 / 60, { fireboy: adv("fireboy", 96), watergirl: adv("watergirl", 192) });
  }
  return { launchFb, launchWg, fb: a, wg: b, phase: w.phase, won: w.phase === "won" };
}

console.log(`== ${LEVEL} ${VARIANT} (platTop=${PLAT_TOP}) ==`);
for (const x of [272, 282, 292, 302, 312]) {
  const r = fullTrial(x, x);
  console.log(JSON.stringify(r));
}
