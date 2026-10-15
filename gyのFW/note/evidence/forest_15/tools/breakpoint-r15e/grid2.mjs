import { loadLevelDoc, makeProvider, locateLevel } from "../../scripts/e2e/routetool/kernel.mjs";
import { parseLevel, GROUND_TYPE } from "../../packages/shared/src/level2.ts";
const { dir } = locateLevel("forest_15");
const lv = parseLevel("forest_15", loadLevelDoc("forest_15"), makeProvider(dir));
const CHAR = { [GROUND_TYPE.SOLID]: "#", [GROUND_TYPE.SLOPE_A]: "/", [GROUND_TYPE.SLOPE_B]: "\\", [GROUND_TYPE.WEDGE_C]: "C", [GROUND_TYPE.WEDGE_D]: "D", [GROUND_TYPE.WATER]: "w", [GROUND_TYPE.LAVA]: "L", [GROUND_TYPE.GREEN]: "G" };
console.log("cols x32px: col0=0 .. col38=1216");
for (let r = 16; r <= 27; r++) {
  let line = "";
  for (let c = 0; c < lv.cols; c++) line += CHAR[lv.groundType[r * lv.cols + c]] ?? ".";
  console.log(String(r).padStart(2), line);
}
console.log("liquids:", JSON.stringify((lv.liquids || []).map((l) => ({ x: l.x, y: l.y, w: l.w, h: l.h, t: l.type }))));
