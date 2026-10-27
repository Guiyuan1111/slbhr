// W224 段逐帧追踪：复用 v19 到 T224 后打印每 5 帧位置
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px=(n)=>Math.round(n*10)/10;
const N={up:false,left:false,right:false},L={up:false,left:true,right:false},R={up:false,left:false,right:false},U={up:true,left:false,right:false};
const w=makeWorld("forest_25");
let phase="SW",jt=0,pulL=4;
const trace=[];
for(let f=0;f<3000;f++){
  const q=w.snapshotPlayer("watergirl");
  const inp=f<90?N:(()=>{
    switch(phase){
      case "SW": if(q.y>120){phase="DROP";jt=0;} return L;
      case "DROP": jt++;
        if(q.y>290&&q.x>570&&q.x<745){phase="POOLW";jt=0;return N;}
        if(jt>400){phase="FAIL";return N;} return L;
      case "POOLW":{jt++;
        if(q.y<285&&q.x<600&&q.x>500){phase="STAIR";jt=0;return N;}
        if(jt>600){phase="FAIL";return N;}
        return (f%pulL)<pulL-1?L:N;}
      case "STAIR":{jt++;
        if(q.x<558.5&&q.x>545&&q.y>252&&q.y<272&&Math.abs(q.vx)<0.6){phase="HOP";jt=0;return U;}
        if(jt>200){phase="FAIL";return N;}
        return (f%pulL)<pulL-1?L:N;}
      case "HOP":{jt++;
        if(jt>4&&q.y>180&&q.y<215&&Math.abs(q.vy)<12&&q.x>445&&q.x<512){phase="W224";jt=0;return N;}
        if(jt>90){phase="FAIL";return N;}
        return jt<=24?U:(jt<=44?L:N);}
      case "W224":{jt++;
        if(q.y>420&&q.y<445&&Math.abs(q.vy)<12&&q.x>425&&q.x<485){phase="SLAB";return N;}
        if(jt>300){phase="FAIL";return N;}
        return q.y>230&&q.x>430?N:L;}
      default:return N;}})();
  if(phase==="W224"||phase==="W224R") trace.push(`f${f} jt${jt} (${px(q.x)},${px(q.y)}) v(${px(q.vx)},${px(q.vy)}) ${inp===L?"L":inp===N?"N":"?"}`);
  w.step(1/60,{fireboy:N,watergirl:inp});
  if(phase==="SLAB"){console.log("REACHED SLAB f"+f);break;}
  if(phase==="FAIL"){console.log("FAIL f"+f);break;}
}
console.log(trace.filter((_,i)=>i%2===0).join("\n"));
