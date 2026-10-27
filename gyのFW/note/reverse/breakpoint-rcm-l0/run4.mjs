import { webcrack } from "webcrack";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const src = readFileSync("/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js", "utf8");
const result = await webcrack(src, { jsx: false, unminify: true, unminifyVariableNames: true, mangle: false });
mkdirSync("out/modules", { recursive: true });
writeFileSync("out/init.beautified.js", String(result.code));
const mods = result.bundle.modules;
const keys = Object.keys(mods);
console.log("modules:", keys.length, "ids sample:", keys.slice(0, 8).join(","));
let i = 0;
for (const k of keys) {
  const m = mods[k];
  const name = String(m.id ?? k).replace(/[^A-Za-z0-9._-]/g, "_");
  writeFileSync(`out/modules/${String(i).padStart(3, "0")}_${name}.js`, String(m.code));
  i++;
}
console.log("written", i, "module files");
