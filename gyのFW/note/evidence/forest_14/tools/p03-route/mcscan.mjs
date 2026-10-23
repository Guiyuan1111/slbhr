/** MC 口径致命扫描：每事件 +1/+2/+3 延迟，统计失败，输出 top */
import { readFileSync } from "node:fs";
import { ScanPool } from "../../../../../scripts/e2e/routetool/pool.mjs";
const path = process.argv[2] ?? "scripts/e2e/inputs/routes/forest_14.json";
const doc = JSON.parse(readFileSync(path, "utf8"));
const clone = (T) => ({ fb: T.fb.map((e) => ({ ...e })), wg: T.wg.map((e) => ({ ...e })) });
const pool = new ScanPool(6);
const base = await pool.run(doc.level, { totalFrames: doc.totalFrames, fb: doc.fb, wg: doc.wg });
console.log("baseline:", base.won ? "WIN" : "DEAD@" + base.deathF);
const jobs = [];
for (const side of ["fb", "wg"]) for (let i = 0; i < doc[side].length; i++) for (const d of [1, 2, 3]) {
  const T = clone(doc); T[side][i].f += d;
  jobs.push({ side, i, f: doc[side][i].f, d, dir: doc[side][i].dir, type: doc[side][i].type, route: { totalFrames: doc.totalFrames + 4, fb: T.fb, wg: T.wg } });
}
const rs = await Promise.all(jobs.map((j) => pool.run(doc.level, j.route)));
pool.close();
const fatal = rs.map((r, k) => ({ ...jobs[k], won: r.won })).filter((x) => !x.won);
console.log("MC(+1/2/3) fatal:", fatal.length, "/", jobs.length);
const bySeg = {};
for (const f of fatal) { const k = f.side + " f" + f.f + " " + f.dir + "/" + f.type; (bySeg[k] ??= []).push(f.d); }
const keys = Object.keys(bySeg).sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4)));
for (const k of keys) console.log(" ", k, "+d:", bySeg[k].join(","));
