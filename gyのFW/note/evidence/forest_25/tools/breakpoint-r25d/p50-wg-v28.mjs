// v28 wg 全链(绕开mesa风带:风机东端,带内v*=0.975全向阻尼不可穿越):DESC→hyp缓速出口→坠空腔→绿台/岸→EAST(hE越柱)→floor→WESTF(l1+hW)→BLK1/2/3阶梯→slab-top→SKYFALL→DOORW
// SW→…→T224→DESC(东行tip下坡回池→东hyp上mesa)→MESAJ(滞速x>940满跳UR直落l1东侧地板)
// →WESTF(L:l1翻转+hW越柱帆落岸)→WEDGE→HOP1→JUMP2→SLABTOP→SKYFALL(l1已开)→DOORW
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px=(n)=>Math.round(n*10)/10;
const N={up:false,left:false,right:false},L={up:false,left:true,right:false},R={up:false,left:false,right:true},U={up:true,left:false,right:false},UL={up:true,left:true,right:false},UR={up:true,left:false,right:true};

export function wgRun28(p={}){
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
        case "DESC":{jt++; // 224顶东行→tip下阶→池→东hyp坡(694,336)-(736,320)
          if(q.y>212&&q.y<230&&q.x>477&&q.x<512)mark(f,"D256",q);
          if(q.y>276&&q.y<294&&q.x>505&&q.x<560)mark(f,"D320",q);
          if(q.y>285&&q.x>570&&q.x<745)mark(f,"POOL2",q);
          if(sub==="mw"){ // mesa顶(带内风机东端,西行顺...逆风但距远力小)→西缘800 tip→坠736-864空腔
            if(q.x<800){sub="air2";jt2=0;}
            return L;}
          else if(sub==="air2"){ // 坠落(带外)→绿台
            if(q.y>830&&q.x>690&&q.x<870){mark(f,"GREEN",q);phase="EAST";jt=0;sub="";return N;}
            if(q.y>815&&q.y<852&&q.x>890&&q.x<1026){mark(f,"SHORE",q);phase="EAST";jt=0;sub="";return N;}
            if(jt2++>400){phase="FAIL-AIR2";return N;}
            return N;}
          if(q.y<232&&q.x>800){mark(f,"MESA2",q);phase="DESC";sub="mw";jt2=0;return L;}
          if(jt>900){phase="FAIL-DESC";return N;}
          return R;}
        case "EAST":{jt++; // 绿台/岸→R东行→岸tip→袋[1024,1056]@864→死柱(1056)西面钉1040.6→hE越柱→floor东侧
          if(sub==="hE"){jtH++;
            if(q.y>850&&q.x>1150){mark(f,"EASTF",q);sub="";phase="WESTF";jt=0;return N;}
            if(jtH>200){phase="FAIL-HOPE";return N;}
            return jtH<13?U:UR;}
          if(q.y>818&&q.y<848&&q.x>1024&&q.x<1052){sub="hE";jtH=0;return U;}
          if(jt>900){phase="FAIL-EAST";return N;}
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
        case "BLK1":{jt++; // floor钉346.6→短跳上[320,362]块(864,升44)
          if(q.y>818&&q.y<840&&q.x>328&&q.x<364&&Math.abs(q.vy)<20){mark(f,"B1",q);phase="BLK2";jt=0;return N;}
          if(jt>200){phase="FAIL-B1";return N;}
          return jt<=9?U:N;}
        case "BLK2":{jt++; // 块上→U20f+L10f跳塔顶[288,320]@768(升96,西移~40)
          if(q.y>722&&q.y<748&&q.x>284&&q.x<324&&Math.abs(q.vy)<20){mark(f,"B2",q);phase="BLK3";jt=0;return N;}
          if(jt>200){phase="FAIL-B2";return N;}
          return jt<=20?U:(jt<=30?L:N);}
        case "BLK3":{jt++; // 塔顶→U14f+L跳檐[256,288]@704(升64)→L走出西缘256→落slab 736
          if(q.y>660&&q.y<682&&q.x>252&&q.x<292&&Math.abs(q.vy)<20){mark(f,"B3",q);phase="SLABTOP";jt=0;return L;}
          if(q.y>692&&q.y<716&&q.x>192&&q.x<262){mark(f,"STOP",q);phase="SLABTOP";jt=0;return N;}
          if(jt>200){phase="FAIL-B3";return N;}
          return jt<=14?U:L;}
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
    if(trace&&phase==="DESC"&&sub==="slow"&&f%5===0)console.log(`    S f${f} (${px(q2.x)},${px(q2.y)}) v=(${px(q2.vx)},${px(q2.vy)}) inp=r${inp.right?1:0}`);
    if(trace&&f%25===0)console.log(`  f${f} ${phase} (${px(q2.x)},${px(q2.y)}) v=(${px(q2.vx)},${px(q2.vy)})`);
    if(q2.dead){done=`DEAD f${f} @(${px(q2.x)},${px(q2.y)})`;break;}
    if(String(phase).startsWith("FAIL")){done=`FAIL@${phase} f${f} @(${px(q2.x)},${px(q2.y)})`;break;}
    if(phase==="DONE")break;
  }
  const snap=w.mechSnapshot();
  return {marks,done,phase,levers:snap.levers.map(l=>l.state),doors:{wg:w.built.doors.watergirl.isUp,fb:w.built.doors.fireboy.isUp},world:w.phase};
}
export { };