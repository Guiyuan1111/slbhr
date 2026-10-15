import { loadLevelDoc, makeProvider, locateLevel } from "../../scripts/e2e/routetool/kernel.mjs";
import { parseLevel, GROUND_TYPE } from "../../packages/shared/src/level2.ts";
const { dir } = locateLevel("forest_15");
const lv = parseLevel("forest_15", loadLevelDoc("forest_15"), makeProvider(dir));
const CHAR = { [GROUND_TYPE.SOLID]: "#", [GROUND_TYPE.SLOPE_A]: "/", [GROUND_TYPE.SLOPE_B]: "\\", [GROUND_TYPE.WEDGE_C]: "C", [GROUND_TYPE.WEDGE_D]: "D", [GROUND_TYPE.WATER]: "w", [GROUND_TYPE.LAVA]: "L", [GROUND_TYPE.GREEN]: "G" };
let scale = "   ";
for (let c = 0; c < lv.cols; c++) scale += c % 10 === 0 ? "|" : (c % 5 === 0 ? "+" : ".");
console.log(scale, " x=col*32");
for (let r = 0; r < lv.rows; r++) {
  let line = "";
  for (let c = 0; c < lv.cols; c++) line += CHAR[lv.groundType[r * lv.cols + c]] ?? ".";
  console.log(String(r).padStart(2), line, `len=${lv.cols}`);
}
