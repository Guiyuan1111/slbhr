// v27 wg 全链：不下大板不翻l0(风开着满跳可胜)
// SW→…→T224→DESC(东行tip下坡回池→东hyp上mesa)→MESAJ(滞速x>940满跳UR直落l1东侧地板)
// →WESTF(L:l1翻转+hW越柱帆落岸)→WEDGE→HOP1→JUMP2→SLABTOP→SKYFALL(l1已开)→DOORW
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px=(n)=>Math.round(n*10)/10;
const N={up:false,left:false,right:false},L={up:false,left:true,right:false},R={up:false,left:false,right:true},U={up:true,left:false,right:false},UL={up:true,left:true,right:false},UR={up:true,left:false,right:true};

export function wgRun27(p={}){
  const {trace=false,pulL=4}=p;
  const w=makeWorld("forest_25");
  const marks=[];const mark=(f,name,q)=>{if(marks.length===0||marks[marks.length-1][1]!==name)marks.push([f,name,px(q.x),px(q.y)]);};
  let phase="SW",jt=0,done="",sub="",jt2=0,jtH=0;
  for(let f=0;f<3600;f++){
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
        case "POOLW":{jt++;
          if(Math.abs(q.vy)<3&&q.y>285&&q.x>570&&q.x<745){mark(f,"POOLBOT",q);phase="POOLW2";jt=0;return N;}
          if(jt>200){phase="FAIL-POOLW";return N;}
          return N;}
        case "POOLW2":{jt++;
          if(q.y<285&&q.x<600&&q.x>500){mark(f,"LIP",q);phase="STAIR";jt=0;return N;}
          if(q.x<500&&q.y>285){phase="FAIL-POOLOVER";return N;}
          if(jt>600){phase="FAIL-POOLW2";return N;}
          return (f%pulL)<pulL-1?L:N;}
        case "STAIR":{jt++;
          if(q.x<558.5&&q.x>545&&q.y>252&&q.y<272&&Math.abs(q.vx)<0.6){mark(f,"PIN",q);phase="HOP";jt=0;return U;}
          if(jt>200){phase="FAIL-STAIR";return N;}
          return (f%pulL)<pulL-1?L:N;}
        case "HOP":{jt++;
          if(jt>4&&q.y>180&&q.y<215&&Math.abs(q.vy)<12&&q.x>445&&q.x<512){mark(f,"T224",q);phase="DESC";jt=0;return N;}
          if(jt>90){phase="FAIL-HOP";return N;}
          return jt<=24?U:(jt<=44?L:N);}
        case "DESC":{jt++; // 224顶东行→tip480落256顶[480,512]→tip512落320级[512,576]→trap坡下→池→东hyp上mesa
          if(q.y>212&&q.y<230&&q.x>477&&q.x<512)mark(f,"D256",q);
          if(q.y>276&&q.y<294&&q.x>505&&q.x<560)mark(f,"D320",q);
          if(q.y>285&&q.x>570&&q.x<745)mark(f,"POOL2",q);
          if(q.y<232&&q.x>800){mark(f,"MESA2",q);phase="MESAJ";jt=0;return N;}
          if(jt>900){phase="FAIL-DESC";return N;}
          return R;}
        case "MESAJ":{jt++; // 风带机制:每帧v*=0.975全向阻尼+西向力→跳跃仅升37px但空中vx保持、每跳净进~32px
          if(sub===""){ // R东行,滞速(|vx|<8且贴地)即链式UR跳
            if(Math.abs(q.vx)<8&&Math.abs(q.vy)<2&&q.y>218&&q.x>930&&q.x<1023){sub="j";jt2=0;}
            if(q.x>1020&&q.y>232){sub="tip";jt2=0;} }
          if(sub==="j"){jt2++;
            if(jt2<3)return UR;
            sub="";return R;}
          if(sub==="tip"){ // 越缘坠落→288台(992-1056)@252.6(带外)
            if(q.y>245&&q.y<280&&q.x>990&&q.x<1062){mark(f,"T288",q);sub="t288";return N;}
            if(jt2++>200){phase="FAIL-TIP";return N;}
            return R;}
          if(sub==="t288"){ // 288台东行(身体中心252.6>250带外,仅传感擦边阻尼)→东缘1056→落大板768
            if(q.y>710&&q.y<750&&q.x>985&&q.x<1260){mark(f,"BIGSLAB",q);sub="big";return N;}
            if(jt2++>400){phase="FAIL-T288";return N;}
            return (f%8)<6?R:N;}
          if(sub==="big"){ // 大板东行→东缘1248→落floor
            if(q.y>850&&q.x>1150){mark(f,"EASTF",q);phase="WESTF";jt=0;sub="";return N;}
            if(jt2++>400){phase="FAIL-BIG";return N;}
            return (f%8)<6?R:N;}
          if(jt>1200){phase="FAIL-MESAJ";return N;}
          return R;}
        case "WESTF":{jt++; // L西:l1(1120)翻转→柱东面(1088)U13f+UL越柱→帆落岸
          const lv=w.mechSnapshot().levers[1];
          if(lv.state===1&&!sub)mark(f,"L1",q);
          if(sub==="hW"){jtH++;
            if(q.y<845&&q.x<1030){sub="";return L;}
            if(jtH>200){phase="FAIL-HOPW";return N;}
            return jtH<13?U:UL;}
          if(q.y>850&&q.x>1080&&q.x<1110){sub="hW";jtH=0;return U;}
          if(q.x<370&&q.y<872){mark(f,"TRAP",q);phase="WEDGE";jt=0;return N;}
          if(jt>800){phase="FAIL-WESTF";return N;}
          return L;}
        case "WEDGE":{jt++;
          if(q.x<306&&q.y>806&&q.y<832&&Math.abs(q.vx)<2){mark(f,"W1",q);phase="HOP1";jt=0;return U;}
          if(jt>300){phase="FAIL-WEDGE";return N;}
          return L;}
        case "HOP1":{jt++;
          if(jt>20&&q.y>778&&q.y<802&&q.x<312&&Math.abs(q.vy)<40){mark(f,"W2",q);phase="JUMP2";jt=0;return U;}
          if(jt>150){phase="FAIL-HOP1";return N;}
          return jt<=14?U:L;}
        case "JUMP2":{jt++;
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
    if(trace&&q2.x<420&&q2.y<300&&f>820){const ii=(f<90)?N:inp;console.log(`    f${f} ${phase}/${sub} (${px(q2.x)},${px(q2.y)}) v=(${px(q2.vx)},${px(q2.vy)}) jtH=${jtH} inp=u${ii.up?1:0}l${ii.left?1:0}r${ii.right?1:0}`);}
    if(trace&&f%25===0)console.log(`  f${f} ${phase} (${px(q2.x)},${px(q2.y)}) v=(${px(q2.vx)},${px(q2.vy)})`);
    if(q2.dead){done=`DEAD f${f} @(${px(q2.x)},${px(q2.y)})`;break;}
    if(String(phase).startsWith("FAIL")){done=`FAIL@${phase} f${f} @(${px(q2.x)},${px(q2.y)})`;break;}
    if(phase==="DONE")break;
  }
  const snap=w.mechSnapshot();
  return {marks,done,phase,levers:snap.levers.map(l=>l.state),doors:{wg:w.built.doors.watergirl.isUp,fb:w.built.doors.fireboy.isUp},world:w.phase};
}
export { };
