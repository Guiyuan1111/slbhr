// f28-win.mjs — f28-all.txt 多边形窗口查询
import fs from "fs";
const lines = fs.readFileSync("TEMP/r28/f28-all.txt","utf8").split("\n").filter(l=>l.includes("verts"));
const polys = lines.map(l=>{
  const verts=[...l.matchAll(/\(([-\d.]+),([-\d.]+)\)/g)].map(m=>[+m[1],+m[2]]);
  const xs=verts.map(v=>v[0]), ys=verts.map(v=>v[1]);
  return { tag:l.slice(0,l.indexOf("verts")).trim(), x0:Math.min(...xs), x1:Math.max(...xs), y0:Math.min(...ys), y1:Math.max(...ys), verts };
});
function q(name, x0,x1,y0,y1){
  console.log(`-- ${name} x[${x0},${x1}] y[${y0},${y1}]`);
  for (const p of polys) if (p.x1>=x0 && p.x0<=x1 && p.y1>=y0 && p.y0<=y1) console.log(`[${p.tag}]`, p.verts.map(v=>`(${v[0]},${v[1]})`).join(" "));
}
const args = process.argv.slice(2);
if (args.length) q(args[0], +args[1], +args[2], +args[3], +args[4]);
else {
  q("water池 192-416@704", 160, 430, 690, 940);
  q("lava r19 池 590-900", 590, 900, 580, 760);
  q("p1 凹槽 1020-1140", 1020, 1140, 690, 940);
  q("风廊 f1 80-360", 60, 360, 780, 930);
}
