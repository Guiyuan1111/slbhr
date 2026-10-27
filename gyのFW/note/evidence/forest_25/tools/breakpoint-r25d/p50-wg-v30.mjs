// v30: 西落链绕开风带(风带x[752,1200]y[166,250]实测mesa地面带内,风力≈跑力闭环轨道942↔970,v29死)
// SW→DROP→POOLW→POOLW2→STAIR→HOP→T224→W224(v22级联 proven)→SLABW(大板西行192缘)
// →LEDGE1(608台[160,192]@608→东落)→L704P([192,288]@704→东落288)→TTOPP(塔顶[256,320]@768→东落320)
// →SLOPE→EAST(斜坡上绿台878→854跳14px→岸864→hE越死柱(动态1056,800)→floor东)→WESTF(l1+hW越柱回)
// →TRAP→BLK1(斜坡行走)→BLK2(U20+L16跳塔顶)→BLK3(U+L跳704檐)→SLABTOP→SKYFALL(l1开天窗)→DOORW
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px=(n)=>Math.round(n*10)/10;
const N={up:false,left:false,right:false},L={up:false,left:true,right:false},R={up:false,left:false,right:true},U={up:true,left:false,right:false},UL={up:true,left:true,right:false},UR={up:true,left:false,right:true};

export function wgRun30(p={}){
  const {trace=false,pulL=4}=p;
  const w=makeWorld("forest_25");
  const marks=[];const mark=(f,name,q)=>{if(marks.length===0||marks[marks.length-1][1]!==name)marks.push([f,name,px(q.x),px(q.y)]);};
  let phase="SW",jt=0,done="",sub="",jt2=0,jtH=0;
  for(let f=0;f<4200;f++){
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
          if(jt>4&&q.y>180&&q.y<215&&Math.abs(q.vy)<12&&q.x>445&&q.x<512){mark(f,"T224",q);phase="W224";jt=0;return N;}
          if(jt>90){phase="FAIL-HOP";return N;}
          return jt<=24?U:(jt<=44?L:N);}
        case "W224":{jt++; // 224顶西行→西缘slot自由落→大板(v22 proven)
          if(q.y>240&&q.y<330&&q.x>340&&q.x<420){mark(f,"STEP",q);phase="W224R";jt=0;return N;}
          if(q.y>375&&q.y<445&&q.x>420&&q.x<525){mark(f,"SLAB",q);phase="SLABW";jt=0;return N;}
          if(jt>300){phase="FAIL-W224";return N;}
          return q.y>210?N:((f%6)<5?L:N);}
        case "W224R":{jt++; // 步阶区R东行下阶→大板
          if(q.y>375&&q.y<445&&q.x>420&&q.x<525){mark(f,"SLAB",q);phase="SLABW";jt=0;return N;}
          if(jt>300){phase="FAIL-W224R";return N;}
          return R;}
        case "SLABW":{jt++; // 大板[192,576]@448西行:UL12f跳+L38f漂移(解431钉+防原地垂直弹)
          if(q.y>450){
            if(q.y>528&&q.y<585&&q.x>20&&q.x<195){mark(f,"LEDGER",q);phase="LEDGE1";jt=0;return N;}
            if(jt>200){phase="FAIL-SLABFALL";return N;}
            return N;}
          return (f%50)<12?UL:L;}
        case "LEDGE1":{jt++; // 608台上R东行→128处32px墙U+R跳上576级→192缘坠704
          if(q.y>655&&q.y<682&&q.x>183&&q.x<235){mark(f,"L704",q);phase="L704P";jt=0;return N;}
          if(q.x>116&&q.x<130&&Math.abs(q.vx)<25&&q.y<560){return jt%14<9?UR:R;}
          if(jt>300){phase="FAIL-LEDGE1";return N;}
          return R;}
        case "L704P":{jt++; // 704檐[192,288]东行→288缘坠塔顶768
          if(q.y>716&&q.y<750&&q.x>283&&q.x<328&&Math.abs(q.vy)<25){mark(f,"TTOP",q);phase="TTOPP";jt=0;return N;}
          if(jt>200){phase="FAIL-L704";return N;}
          return R;}
        case "TTOPP":{jt++; // 塔顶[256,320]@768东行→320缘坠斜坡块(320,864)-(362,880)
          if(q.y>812&&q.y<846&&q.x>314&&q.x<372&&Math.abs(q.vy)<25){mark(f,"SLOPE",q);phase="EAST";jt=0;return N;}
          if(jt>200){phase="FAIL-TTOP";return N;}
          return R;}
        case "EAST":{jt++; // 斜坡→绿台878→854跳14px→岸[896,1024]@864→死柱西面hE越柱→floor东
          if(sub==="hE"){jtH++;
            if(q.y>850&&q.x>1150){mark(f,"EASTF",q);sub="";phase="WESTF";jt=0;return N;}
            if(jtH>200){phase="FAIL-HOPE";return N;}
            return jtH<13?U:UR;}
          if(q.y>818&&q.y<848&&q.x>1024&&q.x<1052){sub="hE";jtH=0;return U;}
          if(q.y>838&&q.y<856&&q.x>846&&q.x<858&&Math.abs(q.vx)<30){return U;} // 854台14px
          if(jt>900){phase="FAIL-EAST";return N;}
          return R;}
        case "WESTF":{jt++; // L西:l1(1120)翻转→柱东面(1088)U13f+UL越柱→帆落岸→绿台西→TRAP
          const lv=w.mechSnapshot().levers[1];
          if(lv.state===1&&!sub)mark(f,"L1",q);
          if(sub==="hW"){jtH++;
            if(q.y<845&&q.x<1030){sub="";return L;}
            if(jtH>200){phase="FAIL-HOPW";return N;}
            return jtH<13?U:UL;}
          if(q.y>850&&q.x>1080&&q.x<1110){sub="hW";jtH=0;return U;}
          if(q.x<370&&q.y<872){mark(f,"TRAP",q);phase="BLK1";jt=0;return N;}
          if(jt>800){phase="FAIL-WESTF";return N;}
          return L;}
        case "BLK1":{jt++; // 绿台西行走上斜坡(362,880)→(320,864):斜坡上抓取
          if(q.y>812&&q.y<846&&q.x>320&&q.x<366&&Math.abs(q.vy)<25){mark(f,"B1",q);phase="BLK2";jt=0;return N;}
          if(jt>200){phase="FAIL-B1";return N;}
          return L;}
        case "BLK2":{jt++; // 斜坡U20f+L16f跳塔顶[256,320]@768(升~100,西移~60)
          if(q.y>718&&q.y<752&&q.x>276&&q.x<336&&Math.abs(q.vy)<20){mark(f,"B2",q);phase="BLK3";jt=0;return N;}
          if(jt>200){phase="FAIL-B2";return N;}
          return jt<=20?U:(jt<=36?L:N);}
        case "BLK3":{jt++; // 塔顶U+L跳704檐[192,288]@704(升64)
          if(q.y>654&&q.y<684&&q.x>248&&q.x<294&&Math.abs(q.vy)<20){mark(f,"B3",q);phase="SLABTOP";jt=0;return L;}
          if(q.y>690&&q.y<716&&q.x>190&&q.x<264){mark(f,"STOP",q);phase="SLABTOP";jt=0;return N;}
          if(jt>200){phase="FAIL-B3";return N;}
          return jt<=14?U:L;}
        case "SLABTOP":
          if(q.x<210){phase="SKYFALL";jt=0;return L;}
          return L;
        case "SKYFALL":
          if(q.y>845&&q.x>60&&q.x<200){mark(f,"ANTE",q);phase="DOORW";jt=0;return N;}
          if(jt++>200){phase="FAIL-SKYFALL";return N;}
          return L;
        case "DOORW":{jt++; // wg门208:落点可能偏西→向门走
          if(q.x>202&&q.x<216&&Math.abs(q.vx)<8){mark(f,"DOOR",q);phase="SETTLE";jt=0;return N;}
          if(jt>300){phase="FAIL-DOORW";return N;}
          return q.x<202?R:L;}
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
    if(p.probe&&phase==="SLABW"&&f>645&&f<720&&f%10===0){
      const pl=w.players.watergirl;
      console.log(`f${f} SLABW (${px(q2.x)},${px(q2.y)}) v=(${px(q2.vx)},${px(q2.vy)}) inp=L${inp.left}U${inp.up}`);
      console.log("  feet:",pl.feetContacts.length,JSON.stringify((pl.feetContacts||[]).map(c=>({nx:+(c.normal?c.normal.x():-9),ny:+(c.normal?c.normal.y():-9)}))));
    }
    if(trace&&f%25===0)console.log(`  f${f} ${phase}/${sub} (${px(q2.x)},${px(q2.y)}) v=(${px(q2.vx)},${px(q2.vy)})`);
    if(q2.dead){done=`DEAD f${f} @(${px(q2.x)},${px(q2.y)})`;break;}
    if(String(phase).startsWith("FAIL")){done=`FAIL@${phase} f${f} @(${px(q2.x)},${px(q2.y)})`;break;}
    if(phase==="DONE")break;
  }
  const snap=w.mechSnapshot();
  return {marks,done,phase,levers:snap.levers.map(l=>l.state),doors:{wg:w.built.doors.watergirl.isUp,fb:w.built.doors.fireboy.isUp},world:w.phase};
}
export { };
