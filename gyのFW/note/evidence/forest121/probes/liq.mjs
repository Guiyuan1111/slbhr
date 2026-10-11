import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const w = makeWorld("forest_12_1");
for (const l of w["built"].liquids ?? []) {
  console.log(`kind=${l.kind} liquidType=${l.liquidType} col0=${l.col0} col1=${l.col1} row=${l.row} startFrozen=${l.startFrozen}`);
}
// 门与出生点
const lv = w["built"].level ?? {};
console.log("spawn:", JSON.stringify(lv.spawn ?? lv.spawns ?? null));
for (const d of (w["built"].doors ?? [])) console.log("door:", d.role, "x=", d.x, "y=", d.y);
