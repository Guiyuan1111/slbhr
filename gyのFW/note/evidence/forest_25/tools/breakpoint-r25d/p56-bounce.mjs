// p56: mesa 弹跳链实验——spawn→西落mesa(802)→全程R+周期跳→测东进极限
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const N={up:false,left:false,right:false},R={up:false,left:false,right:true},UR={up:true,left:false,right:true};
const w=makeWorld("forest_25");
let lastX=0,lastLand=0,lands=[];
for(let f=0;f<1500;f++){
  const q=w.snapshotPlayer("watergirl");
  let inp;
  if(f<90) inp=N;
  else if(q.y<130) inp={up:false,left:true,right:false}; // 平台西行
  else if(q.y<205) inp={up:false,left:true,right:false}; // 平台缘下落漂西
  else inp=(f%40)<1?UR:R; // 弹跳链
  if(q.y>200&&q.y<232&&Math.abs(q.vy)<15&&inp.right&&f>200){
    if(f-lastLand>25){lands.push([f,Math.round(q.x*10)/10,Math.round(q.vx)]);lastLand=f;}
  }
  lastX=q.x;
  w.step(1/60,{fireboy:N,watergirl:inp});
  if(q.dead){console.log("DEAD f"+f);break;}
}
console.log("landings (f,x,vx):");
for(const l of lands) console.log(" ",l[0],l[1],"vx="+l[2]);
const q=w.snapshotPlayer("watergirl");
console.log("final:",Math.round(q.x*10)/10,Math.round(q.y*10)/10,"vx=",Math.round(q.vx));
