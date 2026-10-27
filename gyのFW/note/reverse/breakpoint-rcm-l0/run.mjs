import { webcrack } from "webcrack";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const src = readFileSync("/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js", "utf8");
console.log("input bytes:", src.length);
const t0 = Date.now();
const result = await webcrack(src, { jsx: false, unminify: true, unminifyVariableNames: true, mangle: false });
console.log("webcrack done in", ((Date.now()-t0)/1000).toFixed(1), "s");
mkdirSync("out", { recursive: true });
writeFileSync("out/init.beautified.js", result.code);
console.log("code bytes:", result.code.length);
if (result.bundle) {
  console.log("bundle modules detected:", result.bundle.modules.length);
  for (const m of result.bundle.modules) {
    const f = `out/modules/${m.id}.js`;
    mkdirSync("out/modules", { recursive: true });
    writeFileSync(f, m.code);
  }
} else {
  console.log("no webpack bundle detected (single IIFE) — beautified only");
}
