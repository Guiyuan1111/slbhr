import { webcrack } from "webcrack";
import { readFileSync } from "node:fs";
const src = readFileSync("/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js", "utf8");
const result = await webcrack(src, { jsx: false, unminify: true, unminifyVariableNames: true, mangle: false });
console.log("typeof code:", typeof result.code, "len:", result.code?.length);
console.log("bundle:", !!result.bundle, "modules:", result.bundle?.modules?.length);
if (result.bundle?.modules?.length) {
  const m = result.bundle.modules[0];
  console.log("module[0]:", typeof m.id, typeof m.code?.length);
}
