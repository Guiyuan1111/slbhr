// f28-band.mjs — 精细行带扫描：给定 y 带，输出实体 x 区间（找洞口）
import fs from "fs";
const lines = fs.readFileSync("TEMP/r28/f28-all.txt","utf8").split("\n").filter(l=>l.includes("verts") && !l.includes("wind") && !l.includes("liquid") && !l.includes("ice") && !l.includes("diamond") && !l.includes("reflection") && !l.includes("door") && !l.includes("pers"));
const polys = lines.map(l=>{
  const verts=[...l.matchAll(/\(([-\d.]+),([-\d.]+)\)/g)].map(m=>[+m[1],+m[2]]);
  return { x0:Math.min(...verts.map(v=>v[0])), x1:Math.max(...verts.map(v=>v[0])), y0:Math.min(...verts.map(v=>v[1])), y1:Math.max(...verts.map(v=>v[1])), verts };
});
function pip(p,v){let c=false;const n=v.length;for(let i=0,j=n-1;i<n;j=i++){const xi=v[i][0],yi=v[i][1],xj=v[j][0],yj=v[j][1];if(((yi>p.y)!==(yj>p.y))&&(p.x<(xj-xi)*(p.y-yi)/(yj-yi)+xi))c=!c;}return c;}
// 扫描若干水平带：每个带取带中心线 y，输出 solid x 区间与洞口
const bands = [
  ["attic 顶板 256-280", 268],
  ["attic 上空 100-160 中心", 130],
  ["attic 上空 160-184", 172],
  ["attic 上空 216-232", 224],
  ["384 板", 396],
  ["416 板", 428],
  ["544 板", 556],
  ["512 板", 524],
  ["576 板", 590],
  ["608 板", 620],
  ["640 板", 656],
  ["704 板", 716],
  ["736 板", 748],
  ["底板 896", 908],
];
for (const [name, y] of bands) {
  const xs=[];
  for (let x=0;x<=1248;x+=2) {
    let s=false;
    for (const p of polys){ if(x<p.x0-1||x>p.x1+1||y<p.y0-1||y>p.y1+1) continue; if(pip({x,y},p.verts)){s=true;break;} }
    if(s) xs.push(x);
  }
  const iv=[]; let s=null,p=null;
  for(const x of xs){ if(s===null){s=x;p=x;} else if(x<=p+2){p=x;} else {iv.push([s,p]);s=x;p=x;} }
  if(s!==null)iv.push([s,p]);
  console.log(`${name} y=${y}: `+iv.map(a=>a[0]===a[1]?String(a[0]):`${a[0]}-${a[1]}`).join(" "));
}
