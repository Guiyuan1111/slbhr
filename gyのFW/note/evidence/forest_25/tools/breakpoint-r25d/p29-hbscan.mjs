import { wgRun } from "./p28-wg-v15.mjs";
for (const h of [15]) {
  const r = wgRun({ hbT: h, trace: false });
  console.log(`hbT=${h}: ${r.marks.filter(m=>["BT","WS","SW","PT"].includes(m[1])).map(m=>`${m[1]}(${m[2]},${m[3]})`).join(" ")} | ${r.done || r.phase}`);
}
