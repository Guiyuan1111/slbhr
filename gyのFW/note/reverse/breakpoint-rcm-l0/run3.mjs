import { webcrack } from "webcrack";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const src = readFileSync("/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js", "utf8");
const result = await webcrack(src, { jsx: false, unminify: true, unminifyVariableNames: true, mangle: false });
mkdirSync("out", { recursive: true });
writeFileSync("out/init.beautified.js", String(result.code));
if (result.bundle) {
  console.log("bundle keys:", Object.keys(result.bundle).join(","));
  for (const k of Object.keys(result.bundle)) {
    const v = result.bundle[k];
    console.log(" ", k, "=>", Array.isArray(v) ? `array[${v.length}]` : typeof v);
  }
}
console.log("written out/init.beautified.js");
