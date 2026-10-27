import { wgRun22 } from "./p45-wg-v22.mjs";
// 临时在 HOPSLAB 逐帧打印：直接复用 wgRun22 的 trace? 不够细——这里手动跑一遍循环
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const N={up:false,left:false,right:false},L={up:false,left:true,right:false},R={up:false,left:false,right:true},U={up:true,left:false,right:false},UR={up:true,left:false,right:true};
const w=makeWorld("forest_25");
const px=(n)=>Math.round(n*10)/10;
let phase="SW",jt=0,sub="",jtH=0;
for(let f=0;f<3000;f++){
  const q=w.snapshotPlayer("watergirl");
  const inp=f<90?N:(()=>{
    switch(phase){
      case "SW": if(q.y>120){phase="DROP";jt=0;} return L;
      case "DROP": jt++;
        if(q.y>285&&q.x>570&&q.x<745&&Math.abs(q.vy)<30){phase="POOLW";jt=0;return N;}
        if(jt>400){phase="FAIL";return N;} return L;
      case "POOLW":{jt++;
        if(Math.abs(q.vy)<3&&q.y>285&&q.x>570&&q.x<745){phase="POOLW2";jt=0;return N;}
        if(jt>200){phase="FAIL";return N;} return N;}
      case "POOLW2":{jt++;
        if(q.y<285&&q.x<600&&q.x>500){phase="STAIR";jt=0;return N;}
        if(q.x<500&&q.y>285){phase="FAIL";return N;}
        if(jt>600){phase="FAIL";return N;} return (f%4)<3?L:N;}
      case "STAIR":{jt++;
        if(q.x<558.5&&q.x>545&&q.y>252&&q.y<272&&Math.abs(q.vx)<0.6){phase="HOP";jt=0;return U;}
        if(jt>200){phase="FAIL";return N;} return (f%4)<3?L:N;}
      case "HOP":{jt++;
        if(jt>4&&q.y>180&&q.y<215&&Math.abs(q.vy)<12&&q.x>445&&q.x<512){phase="W224";jt=0;return N;}
        if(jt>90){phase="FAIL";return N;} return jt<=24?U:(jt<=44?L:N);}
      case "W224":{jt++;
        if(q.y>240&&q.y<330&&q.x>340&&q.x<420){phase="W224R";jt=0;return N;}
        if(q.y>375&&q.y<445&&q.x>420&&q.x<525){phase="SLAB";jt=0;return N;}
        if(jt>300){phase="FAIL";return N;} return q.y>210?N:((f%6)<5?L:N);}
      case "W224R":{jt++;
        if(q.y>375&&q.y<445&&q.x>420&&q.x<525){phase="SLAB";jt=0;return N;}
        if(jt>300){phase="FAIL";return N;} return R;}
      case "SLAB":{jt++;
        const lv=w.mechSnapshot().levers[0];
        if(lv.state===0){
          if(sub!=="rdy"){sub="rdy";jt=0;console.log(`f${f} L0 @(${px(q.x)},${px(q.y)})`);}
          if(f%5===0)console.log(`  S f${f} (${px(q.x)},${px(q.y)}) vx=${px(q.vx)}`);
          if(jt<25) return N;
          if(q.x>436) return L;
          if(Math.abs(q.vx)>1.5) return N;
          console.log(`f${f} LAUNCH @(${px(q.x)},${px(q.y)}) vx=${px(q.vx)}`);
          phase="HOPSLAB";jt=0;sub="";return UR;}
        if(q.x>525){phase="FAIL";return N;}
        if(jt>400){phase="FAIL";return N;} return R;}
      case "HOPSLAB":{jt++;jtH++;
        if(f<770)console.log(`  f${f} (${px(q.x)},${px(q.y)}) vy=${px(q.vy)} vx=${px(q.vx)}`);
        if(q.y>285&&q.x>570&&q.x<745&&q.vy>0){console.log(`f${f} POOL2`);phase="POOLE2";jt=0;return N;}
        if(jt>200){phase="FAIL";return N;} return jt<70?UR:R;}
      case "POOLE2":{jt++;
        if(q.y<232&&q.x>800){console.log(`f${f} MESA2`);phase="MESAE";jt=0;return N;}
        if(jt>600){phase="FAIL";return N;} return R;}
      case "MESAE":{jt++;
        if(q.y>240&&q.y<264&&q.x>990&&q.x<1050){console.log(`f${f} T288E`);phase="M2E";jt=0;return N;}
        if(jt>400){phase="FAIL";return N;} return q.x>995?((f%8)<3?R:N):R;}
      case "M2E":{jt++;
        if(q.y>715&&q.y<748&&q.x>940&&q.x<1120){console.log(`f${f} BIGSLAB`);phase="BIGW";jt=0;return N;}
        if(jt>300){phase="FAIL";return N;} return (f%12)<2?L:N;}
      case "BIGW":{jt++;
        if(q.y>815&&q.y<848&&q.x>890&&q.x<1024){console.log(`f${f} SHORE`);phase="SHOREW";jt=0;return N;}
        if(jt>300){phase="FAIL";return N;} return q.x>1000?L:((f%12)<2?L:N);}
      case "SHOREW":{jt++;
        if(q.y>830&&q.x>690&&q.x<865){console.log(`f${f} GREEN`);phase="EAST";jt=0;return N;}
        if(jt>300){phase="FAIL";return N;} return L;}
      case "EAST":{jt++;
        if(sub==="hE"){jtH++;
          if(q.y>850&&q.x>1150){console.log(`f${f} EASTF`);sub="";phase="WESTF";jt=0;return N;}
          if(jtH>200){phase="FAIL";return N;} return jtH<13?U:UR;}
        if(q.y>850&&q.x>1024&&q.x<1052){sub="hE";jtH=0;return U;}
        if(jt>900){phase="FAIL";return N;} return R;}
      case "WESTF":{jt++;
        const lv=w.mechSnapshot().levers[1];
        if(lv.state===1&&!sub){console.log(`f${f} L1 @(${px(q.x)},${px(q.y)})`);}
        if(sub==="hW"){jtH++;
          if(q.y<845&&q.x<1030){sub="";return L;}
          if(jtH>200){phase="FAIL";return N;} return jtH<13?U:UL;}
        if(q.y>850&&q.x>1080&&q.x<1110){sub="hW";jtH=0;return U;}
        if(q.x<370&&q.y<872){console.log(`f${f} TRAP`);phase="WEDGE";jt=0;return N;}
        if(jt>800){phase="FAIL";return N;} return L;}
      default: return N;
    }})();
  w.step(1/60,{fireboy:N,watergirl:inp});
  const q2=w.snapshotPlayer("watergirl");
  if(q2.dead){console.log(`DEAD f${f}`);break;}
  if(phase==="FAIL"||phase==="DONE"){console.log(`END ${phase} f${f} @(${px(q2.x)},${px(q2.y)})`);break;}
}
