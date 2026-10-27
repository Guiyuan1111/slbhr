// v29: 真风带=传感器2.6m×14m@(1248,160)朝西→x[800,1248] y[118,202];mesa地面带外无风→全R冲刺过1056缺口→ledger384→东下行梯→terrace→big slab→shore→EAST(hE越柱l1)→WESTF(hW)→BLK1/2/3→slab-top→SKYFALL→DOOR
// SW→…→T224→DESC(东行tip下坡回池→东hyp上mesa)→MESAJ(滞速x>940满跳UR直落l1东侧地板)
// →WESTF(L:l1翻转+hW越柱帆落岸)→WEDGE→HOP1→JUMP2→SLABTOP→SKYFALL(l1已开)→DOORW
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px=(n)=>Math.round(n*10)/10;
const N={up:false,left:false,right:false},L={up:false,left:true,right:false},R={up:false,left:false,right:true},U={up:true,left:false,right:false},UL={up:true,left:true,right:false},UR={up:true,left:false,right:true};

export function wgRun29b(p={}){
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
          if(q.y<232&&q.x>800)mark(f,"MESA2",q);
          if(sub===""){ // mesa:滞速(跑力被坏n砍+风≈跑力刀刃)→风谷相位起跳冲缺口
            if(q.x>1050&&q.y>282){mark(f,"HOLE",q);sub="e";jt2=0;}
            if(q.x>900&&q.x<1050&&Math.abs(q.vx)<12&&q.y>218&&Math.abs(q.vy)<2){
              if(!sub){sub="stall";jt2=0;}
              jt2++;
              const ph=((f+ (process.env.PHOFF|0))%377+377)%377;
              if(ph<6) return UR;
              return R;
            }
            if(q.x<=900) sub="";
            if(jt>2400){phase="FAIL-DESC";return N;}
            return R;}
          else if(sub==="e"){ // 缺口→ledger384→东下行梯576/608/640→terrace(头顶墙钉1200)
            if(q.y>340&&q.y<378&&q.x>1050&&q.x<1160)mark(f,"LEDG",q);
            if(q.y>596&&q.y<614&&q.x>1180){mark(f,"TERR",q);sub="w";jt2=0;return L;}
            if(jt2++>600){phase="FAIL-STAIR";return N;}
            return R;}
          else if(sub==="w"){ // terrace西缘1184→坠big slab 736
            if(q.y>693&&q.y<718&&q.x>1150){mark(f,"BSLAB",q);sub="bs";jt2=0;return L;}
            if(jt2++>300){phase="FAIL-TERRW";return N;}
            return L;}
          else if(sub==="bs"){ // 736板西行1152→坠32→768板
            if(q.y>758&&q.y<792&&q.x<1160){sub="s768";jt2=0;return L;}
            if(jt2++>300){phase="FAIL-BSW";return N;}
            return L;}
          else if(sub==="s768"){ // 768板西行→960 tip→坠岸
            if(q.y>818&&q.y<852&&q.x>885&&q.x<1030){mark(f,"SHORE",q);phase="EAST";jt=0;sub="";return N;}
            if(jt2++>300){phase="FAIL-S768";return N;}
            return L;}
          if(jt>1500){phase="FAIL-DESC";return N;}
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