import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px=(n)=>Math.round(n*10)/10;
const N={up:false,left:false,right:false},R={up:false,left:false,right:true};
const w=makeWorld("forest_25");
for(let f=0;f<200;f++){
  const inp=f<90?N:R;
  w.step(1/60,{fireboy:N,watergirl:inp});
  if(f%40===0){const q=w.snapshotPlayer("watergirl");console.log(`f${f} (${px(q.x)},${px(q.y)}) v(${px(q.vx)},${px(q.vy)})`);}
}
