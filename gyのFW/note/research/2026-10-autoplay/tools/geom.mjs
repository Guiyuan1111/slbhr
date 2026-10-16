// auto-design 槽·几何速查：打印内核解析后的 forest_01 关键实体坐标。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
function findRoot(dir) {
  let d = dir;
  for (let i = 0; i < 8; i++) {
    try { readFileSync(join(d, "package.json")); return d; } catch { /* 向上 */ }
    d = dirname(d);
  }
  throw new Error("repo root not found");
}
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
const { makeWorld } = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "kernel.mjs")).href);

const w = makeWorld("forest_01");
const j = (o) => JSON.stringify(o);
console.log("spawn:", j(w.level.spawn));
const doorInfo = (d) => ({ x: Math.round(d.pos.x), y: Math.round(d.pos.y), isOpen: d.isOpen, isUp: d.isUp, frac: d.frac });
console.log("doors:", j({ fb: doorInfo(w.doors.fireboy), wg: doorInfo(w.doors.watergirl) }));
console.log("liquids:", j(w.liquids?.map?.((l) => ({ x: Math.round(l.pos?.x ?? -1), y: Math.round(l.pos?.y ?? -1), type: l.liquidType ?? l.type })) ?? w.liquids));
console.log("diamonds:", j(w.diamonds?.map?.((d) => ({ kind: d.kind, x: Math.round(d.body?.GetPosition().x * 32 ?? -1), y: Math.round(d.body?.GetPosition().y * 32 ?? -1), taken: d.taken })) ?? []));
const m = w.mechSnapshot();
console.log("levers:", j(m.levers));
console.log("platforms:", j(m.platforms));
console.log("pushers:", j(m.pushers));
console.log("props:", j(m.props));
console.log("winds:", j(m.winds), "hangings:", m.hangings.length, "pulleys:", m.pulleys.length, "romans:", m.romans.length);
// 地面 poly 概览（level.polys/rects 之类结构看 level2 输出）
console.log("level keys:", Object.keys(w.level));
for (const k of Object.keys(w.level)) {
  const v = w.level[k];
  if (Array.isArray(v)) console.log(`  ${k}: ${v.length} 项, 首项=${j(v[0]).slice(0, 200)}`);
}
