// f28-map.mjs v2 — 列扫描（修复）
import fs from "fs";
const lines = fs.readFileSync("TEMP/r28/f28-all.txt","utf8").split("\n").filter(l=>l.includes("verts") && !l.includes("wind"));
console.error("poly lines:", lines.length);
const polys = lines.map(l=>{
  const verts=[...l.matchAll(/\(([-\d.]+),([-\d.]+)\)/g)].map(m=>[+m[1],+m[2]]);
  const xs=verts.map(v=>v[0]), ys=verts.map(v=>v[1]);
  return { x0:Math.min(...xs), x1:Math.max(...xs), y0:Math.min(...ys), y1:Math.max(...ys), verts };
});
function pip(p,v){let c=false;for(let i=0,j=v.length-1;i<v.length;j=i++){const xi=v[i][0],yi=v[i][1],xj=v[j][0],yj=v[j][1];if(((yi>p.y)!==(yj>p.y))&&(p.x<(xj-xi)*(p.y-yi)/(yj-yi)+xi))c=!c;}return c;}
const out=[];
for (let x=-32;x<=1280;x+=16){
  const ys=[];
  for (let y=0;y<=960;y+=8){
    let solid=false;
    for (const poly of polys){
      if(x<poly.x0-1||x>poly.x1+1||y<poly.y0-1||y>poly.y1+1) continue;
      if(pip({x,y},poly.verts)){solid=true;break;}
    }
    if(solid) ys.push(y);
  }
  const iv=[]; let s=null,p=null;
  for(const y of ys){ if(s===null){s=y;p=y;} else if(y===p+8){p=y;} else {iv.push([s,p]);s=y;p=y;} }
  if(s!==null)iv.push([s,p]);
  if(iv.length) out.push(`x=${x}: `+iv.map(a=>a[0]===a[1]?String(a[0]):`${a[0]}-${a[1]}`).join(","));
}
fs.writeFileSync("TEMP/r28/f28-cols.txt", out.join("\n"));
console.error("cols written:", out.length);
