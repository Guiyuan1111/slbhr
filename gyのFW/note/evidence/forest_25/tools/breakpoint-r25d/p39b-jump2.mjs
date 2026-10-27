// 干燥面跳峰值：出生板 (1152,96) 直接起跳（板顶160,中心站位96）
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px=(n)=>Math.round(n*10)/10;
const N={up:false,left:false,right:false},U={up:true,left:false,right:false},UL={up:true,left:true,right:false};
function probe(kind,hold){
  const w=makeWorld("forest_25");
  let base=0,apex=1e9,t0=-1;
  for(let f=0;f<400;f++){
    const q=w.snapshotPlayer("watergirl");
    let inp=N;
    if(f<90) inp=N;
    else if(t0<0){ inp=N; if(f>=110){ base=q.y; t0=f; } }
    else if(f-t0<hold) inp=kind;
    else { if(q.y<apex)apex=q.y; if(f-t0>hold+160) break; }
    w.step(1/60,{fireboy:N,watergirl:inp});
  }
  console.log(`${kind===U?"U ":"UL"} hold=${hold}: base=${px(base)} apex=${px(apex)} rise=${px(base-apex)}`);
}
probe(U,10);probe(U,16);probe(U,24);probe(U,40);probe(UL,16);probe(UL,24);
