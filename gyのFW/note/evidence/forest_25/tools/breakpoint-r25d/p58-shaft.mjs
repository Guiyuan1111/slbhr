// p58: 竖井弹道扫描——gid21突块(928-992@112)东跳穿风带顶入井(1056-1088)
// 扫描:突块上起步位置 x0 与助跑帧数 k → 落点
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const N={up:false,left:false,right:false},R={up:false,left:false,right:true},UR={up:true,left:false,right:true},L={up:false,left:true,right:false};
const px=(n)=>Math.round(n*10)/10;

function shot(x0run,k){ // x0run: 向西回到的起点; k: R助跑帧数后跳
  const w=makeWorld("forest_25");
  const N90={up:false,left:false,right:false};
  let phase="E";let jt=0;let res="";
  for(let f=0;f<700;f++){
    const q=w.snapshotPlayer("watergirl");
    let inp=N90;
    if(f<90){inp=N90;}
    else if(phase==="E"){ // 西行上突块
      inp=L;
      if(q.x<=x0run){phase="RUN";jt=0;}
    } else if(phase==="RUN"){ // R助跑k帧→UR跳→此后一直R
      jt++;
      inp=jt<=k?R:(jt<=k+1?UR:R);
      if(q.y>250&&q.x>1040&&q.x<1100&&Math.abs(q.vy)<40){res=`SHAFT(${px(q.x)},${px(q.y)})`;break;}
      if(q.y>200&&q.y<240&&q.x>800&&q.x<1060&&Math.abs(q.vy)<20&&f>200){res=`MESA(${px(q.x)})`;break;}
      if(q.y>300&&q.x>1000&&q.x<1100){res=`DEEP(${px(q.x)},${px(q.y)})`;break;}
      if(f>600){res="TIMEOUT";break;}
    }
    w.step(1/60,{fireboy:N90,watergirl:inp});
    if(w.snapshotPlayer("watergirl").dead){res="DEAD";break;}
  }
  return res;
}
for(const x0 of [935,945,955,965,975,985]){
  const row=[];
  for(const k of [2,3,4,5,6,8,10,12]){
    row.push(`k${k}:${shot(x0,k)}`);
  }
  console.log(`x0=${x0}  `+row.join(" "));
}
