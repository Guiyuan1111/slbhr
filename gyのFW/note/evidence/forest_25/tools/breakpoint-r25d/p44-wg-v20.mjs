// v20 极简全链：SW→DROP→POOL→POOLE(东hyp上mesa)→MESAW(西缘N落620px)→GREEN(878)
// →EAST(岸/floor→推l1开天窗)→WESTF(原路返)→WEDGE(288,832)→HOP1(800楔)→JUMP2(slab顶736)
// →SLABTOP→SKYFALL→ANTE→DOOR(208)   [FB=N；wg 全程不碰风带/l0]
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px=(n)=>Math.round(n*10)/10;
const N={up:false,left:false,right:false},L={up:false,left:true,right:false},R={up:false,left:false,right:true},U={up:true,left:false,right:false},UL={up:true,left:true,right:false},UR={up:true,left:false,right:true};

export function wgRun20(p={}){
  const {trace=false}=p;
  const w=makeWorld("forest_25");
  const marks=[];const mark=(f,name,q)=>marks.push([f,name,px(q.x),px(q.y)]);
  let phase="SW",jt=0,done="";
  for(let f=0;f<3000;f++){
    const q=w.snapshotPlayer("watergirl");
    const inp=f<90?N:(()=>{
      switch(phase){
        case "SW":
          if(q.y>120){phase="DROP";jt=0;}
          return L;
        case "DROP":
          jt++;
          if(q.y>285&&q.x>570&&q.x<745&&Math.abs(q.vy)<30){mark(f,"POOL",q);phase="POOLW";jt=0;return N;}
          if(jt>400){phase="FAIL-DROP";return N;}
          return L;
        case "POOLW":{jt++; // 池底站稳
          if(Math.abs(q.vy)<3&&q.y>285&&q.x>570&&q.x<745){mark(f,"POOLBOT",q);phase="POOLE";jt=0;return N;}
          if(jt>200){phase="FAIL-POOLW";return N;}
          return N;}
        case "POOLE":{jt++; // 东 hyp 上行：trap→320顶→288顶→mesa(256)
          if(q.y<232&&q.x>800){mark(f,"MESA",q);phase="MESAW";jt=0;return N;}
          if(jt>600){phase="FAIL-POOLE";return N;}
          return R;}
        case "MESAW":{jt++; // mesa(256)西缘 tip-over→288顶
          if(q.y>238&&q.y<264&&q.x>750&&q.x<800){mark(f,"T288",q);phase="M2";jt=0;return N;}
          if(q.y>830&&q.x>690&&q.x<865){mark(f,"GREEN",q);phase="EAST";jt=0;return N;}
          if(jt>300){phase="FAIL-MESAW";return N;}
          return (f%12)<2?L:N;}
        case "M2":{jt++; // 288顶(768-800)西缘 tip-over→320顶
          if(q.y>274&&q.y<298&&q.x>738&&q.x<775){mark(f,"T320",q);phase="M3";jt=0;return N;}
          if(q.y>830&&q.x>690&&q.x<865){mark(f,"GREEN",q);phase="EAST";jt=0;return N;}
          if(jt>250){phase="FAIL-M2";return N;}
          return (f%12)<2?L:N;}
        case "M3":{jt++; // 320顶(736-768)西缘极慢 tip：擦 352 角滑进绿台空腔
          if(q.y>830&&q.x>690&&q.x<865){mark(f,"GREEN",q);phase="EAST";jt=0;return N;}
          if(jt>250){phase="FAIL-M3";return N;}
          return (f%30)<1?L:N;}
        case "SLAB":{jt++; // 大板东行→东缘走落→绿台
          if(q.x>540){phase="SLABE";jt=0;return N;}
          if(jt>400){phase="FAIL-SLAB";return N;}
          return R;}
        case "SLABE":
          if(q.y>830&&q.x>540&&q.x<700&&Math.abs(q.vy)<12){mark(f,"GREEN",q);phase="EAST";jt=0;return N;}
          if(jt++>300){phase="FAIL-SLABE";return N;}
          return R;
        case "EAST":{jt++; // 绿台→岸→floor→推 l1(1152)
          const lv=w.mechSnapshot().levers[1];
          if(lv.state===1){mark(f,"L1",q);phase="WESTF";jt=0;return N;}
          if(jt>700){phase="FAIL-L1";return N;}
          return R;}
        case "WESTF":{jt++; // 原路返回
          if(q.x<370&&q.y<872){mark(f,"TRAP",q);phase="WEDGE";jt=0;return N;}
          if(jt>800){phase="FAIL-WESTF";return N;}
          return L;}
        case "WEDGE":{jt++; // 爬墙 hyp 到 (288,832) 楔
          if(q.x<306&&q.y>806&&q.y<832&&Math.abs(q.vx)<2){mark(f,"W1",q);phase="HOP1";jt=0;return U;}
          if(jt>300){phase="FAIL-WEDGE";return N;}
          return L;}
        case "HOP1":{jt++; // 小跳上 (288,800) 楔
          if(jt>20&&q.y>778&&q.y<802&&q.x<312&&Math.abs(q.vy)<40){mark(f,"W2",q);phase="JUMP2";jt=0;return U;}
          if(jt>150){phase="FAIL-HOP1";return N;}
          return jt<=14?U:L;}
        case "JUMP2":{jt++; // 全跳上 slab 顶 (736)：圆底 731 清缘 4.5px
          if(jt>40&&q.y>693&&q.y<715&&q.x>198&&q.x<292){mark(f,"STOP",q);phase="SLABTOP";jt=0;return N;}
          if(jt>150){phase="FAIL-JUMP2";return N;}
          return jt<=24?U:(jt<=44?UL:L);}
        case "SLABTOP":
          if(q.x<210){phase="SKYFALL";jt=0;return L;}
          return L;
        case "SKYFALL":
          if(q.y>845&&q.x>60&&q.x<200){mark(f,"ANTE",q);phase="DOORW";jt=0;return N;}
          if(jt++>200){phase="FAIL-SKYFALL";return N;}
          return L;
        case "DOORW":{jt++;
          if(q.x>202&&q.x<216&&Math.abs(q.vx)<8){mark(f,"DOOR",q);phase="SETTLE";jt=0;return N;}
          if(jt>300){phase="FAIL-DOORW";return N;}
          return L;}
        case "SETTLE":{jt++;
          if(Math.abs(q.vx)<6&&jt>10){
            const dr=w.built.doors.watergirl;
            mark(f,"DONE",q);
            done=`door frac=${dr.frac} isUp=${dr.isUp} wg=(${px(q.x)},${px(q.y)}) f=${f}`;
            phase="DONE";}
          return N;}
        default:return N;
      }})();
    w.step(1/60,{fireboy:N,watergirl:inp});
    const q2=w.snapshotPlayer("watergirl");
    if(trace&&f%25===0)console.log(`  f${f} ${phase} (${px(q2.x)},${px(q2.y)}) v=(${px(q2.vx)},${px(q2.vy)})`);
    if(q2.dead){done=`DEAD f${f} @(${px(q2.x)},${px(q2.y)})`;break;}
    if(String(phase).startsWith("FAIL")){done=`FAIL@${phase} f${f} @(${px(q2.x)},${px(q2.y)})`;break;}
    if(phase==="DONE")break;
  }
  const snap=w.mechSnapshot();
  return {marks,done,phase,levers:snap.levers,doors:{wg:w.built.doors.watergirl.isUp,fb:w.built.doors.fireboy.isUp},world:w.phase};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const r=wgRun20({});
  console.log(r.marks.map(m=>`f${m[0]}→${m[1]}(${m[2]},${m[3]})`).join(" "));
  console.log("ended=",r.done||r.phase,"| levers:",JSON.stringify(r.levers.map(l=>l.state)),"| doors:",JSON.stringify(r.doors),"| world:",r.world);
}
