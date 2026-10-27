// 空中控制隔离测试：起跳后按 R / 按 L，测漂移
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px=(n)=>Math.round(n*10)/10;
const N={up:false,left:false,right:false},U={up:true,left:false,right:false},UR={up:true,left:false,right:true},UL={up:true,left:true,right:false},R={up:false,left:false,right:true},L={up:false,left:true,right:false};
function probe(name,air){
  const w=makeWorld("forest_25");
  let t0=-1,x0=0;
  for(let f=0;f<300;f++){
    const q=w.snapshotPlayer("watergirl");
    let inp=N;
    if(f<90)inp=N;
    else if(t0<0){if(f>=110){inp=U;t0=f;x0=q.x;}}
    else if(f-t0<10)inp=air;          // 起跳后 10f 转空中输入
    else if(f-t0<25)inp=air===UR?R:(air===UL?L:N);
    else inp=N;
    w.step(1/60,{fireboy:N,watergirl:inp});
    if(t0>0&&f-t0===60){console.log(`${name}: x0=${px(x0)} x60=${px(q.x)} drift=${px(q.x-x0)} v=(${px(q.vx)},${px(q.vy)})`);break;}
  }
}
probe("U->R ",UR);probe("U->L ",UL);probe("U->N ",N);
