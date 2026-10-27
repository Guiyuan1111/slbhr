// 测纯 U 跳/UL 跳峰值：SW→池底(298.9)站稳→起跳
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px=(n)=>Math.round(n*10)/10;
const N={up:false,left:false,right:false},L={up:false,left:true,right:false},R={up:false,left:false,right:false},U={up:true,left:false,right:false},UL={up:true,left:true,right:false};
function probe(kind,hold){
  const w=makeWorld("forest_25");
  let st=0,base=0,apex=1e9,t0=0;
  for(let f=0;f<1200;f++){
    const q=w.snapshotPlayer("watergirl");
    let inp=N;
    if(f<90) inp=N;
    else if(st===0){ inp=L; if(q.y>290&&q.x>570&&q.x<745) st=1; }
    else if(st===1){ inp=N; if(Math.abs(q.vy)<3&&q.y>285){ base=q.y; t0=f; st=2; } }
    else if(st===2){ inp=N; if(f-t0>20) st=3; }
    else if(st===3){ inp=kind; if(f-t0>20+hold) st=4; }
    else { if(q.y<apex)apex=q.y; if(f-t0>20+hold+160) break; }
    w.step(1/60,{fireboy:N,watergirl:inp});
  }
  console.log(`${kind===U?"U ":"UL"} hold=${hold}: base=${px(base)} apex=${px(apex)} rise=${px(base-apex)}`);
}
probe(U,24);probe(U,30);probe(U,40);probe(UL,24);probe(UL,40);
