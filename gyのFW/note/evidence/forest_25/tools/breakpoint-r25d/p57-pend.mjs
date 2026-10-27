// p57: 摆杆机制探针——bob 位置/周期/方向/可站性
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px=(n)=>Math.round(n*10)/10;
const w=makeWorld("forest_25");
console.log("mech keys:",Object.keys(w.mechs||{}));
if(w.mechs.pendulums)console.log("pendulums n:",w.mechs.pendulums.length);
if(w.mechs.hangings)console.log("hangings n:",w.mechs.hangings.length);
const snap=w.mechSnapshot();
console.log("snapshot keys:",Object.keys(snap));
const N={up:false,left:false,right:false};
for(let f=0;f<720;f++){
  w.step(1/60,{fireboy:N,watergirl:N});
  if(f%60===0){
    const h=(w.mechs.pendulums&&w.mechs.pendulums[0])||(w.mechs.hangings&&w.mechs.hangings[0]);
    if(h){
      const b=h.body||h.bob||h;
      const p=b.GetPosition();
      const ang=h.body?h.body.GetAngle():-9;
      console.log(`f${f} pos=(${px(-p.x*32)},${px(-p.y*32)}) angle=${px(ang*180/Math.PI)} state=${h.state}`);
    } else console.log(`f${f} no pendulum obj`, JSON.stringify(Object.keys(w.mechs||{})));
  }
}
