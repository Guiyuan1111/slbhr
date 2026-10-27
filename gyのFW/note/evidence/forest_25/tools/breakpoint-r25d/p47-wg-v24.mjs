// v24 wg 全链（v22 的 HOPSLAB 弹道已证几何不可能：hypB 下缘 y≤x−213.8 需爬升129.5>峰值125）
// 改走西阶梯回环：SLAB→l0翻转→西爬416/384/352/320/288/256→UR东跳224顶→东行tip下224/256/320级
// →trap坡下→池→POOLE(无风)上mesa→MESAE东行→T288E→M2E西→BIGSLAB→BIGW→SHORE→SHOREW→GREEN
// →EAST(越柱hE)→WESTF(l1+hW越柱)→WEDGE→HOP1→JUMP2→SLABTOP→SKYFALL→DOORW
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px=(n)=>Math.round(n*10)/10;
const N={up:false,left:false,right:false},L={up:false,left:true,right:false},R={up:false,left:false,right:true},U={up:true,left:false,right:false},UL={up:true,left:true,right:false},UR={up:true,left:false,right:true};

export function wgRun24(p={}){
  const {trace=false,pulL=4}=p;
  const w=makeWorld("forest_25");
  const marks=[];const mark=(f,name,q)=>{if(marks.length===0||marks[marks.length-1][1]!==name)marks.push([f,name,px(q.x),px(q.y)]);};
  let phase="SW",jt=0,done="",sub="",jtH=0,jtL=0;
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
          if(jt>4&&q.y>180&&q.y<215&&Math.abs(q.vy)<12&&q.x>445&&q.x<512){mark(f,"T224",q);phase="W224";jt=0;return N;}
          if(jt>90){phase="FAIL-HOP";return N;}
          return jt<=24?U:(jt<=44?L:N);}
        case "W224":{jt++; // 224顶西行→西缘slot自由落→大板
          if(q.y>240&&q.y<330&&q.x>340&&q.x<420){mark(f,"STEP",q);phase="W224R";jt=0;return N;}
          if(q.y>375&&q.y<445&&q.x>420&&q.x<525){mark(f,"SLAB",q);phase="SLAB";jt=0;return N;}
          if(jt>300){phase="FAIL-W224";return N;}
          return q.y>210?N:((f%6)<5?L:N);}
        case "W224R":{jt++; // 步阶区R东行下阶→大板
          if(q.y>375&&q.y<445&&q.x>420&&q.x<525){mark(f,"SLAB",q);phase="SLAB";jt=0;return N;}
          if(jt>300){phase="FAIL-W224R";return N;}
          return R;}
        case "SLAB":{jt++; // 东行推l0(杆496)→state0后等25f(杆扫过禁up)→西行钉431.4
          const lv=w.mechSnapshot().levers[0];
          if(lv.state===0){mark(f,"L0",q);
            if(sub!=="rdy"){sub="rdy";jt=0;}
            if(jt<25) return N;
            if(q.x<433&&Math.abs(q.vx)<0.5){mark(f,"A1PIN",q);phase="ASC";jt=0;sub="";return UL;}
            return L;}
          if(q.x>525){phase="FAIL-SLAB-OVER";return N;}
          if(jt>400){phase="FAIL-SLAB";return N;}
          return R;}
        case "ASC":{jt++; // 行走中起跳爬阶(避stale contact)：各面墙x=416/384/352/320,触发=墙+20,L12f漂移→N刹
          if(q.y>212&&q.y<230&&q.x>190&&q.x<322){mark(f,"A7",q);phase="A7";jt=0;sub="";return N;}
          if(sub==="h"){jtH++;
            if(jtH>40&&Math.abs(q.vy)<5&&Math.abs(q.vx)<0.5){sub="";jtL=0;return L;}
            if(jtH>120){phase="FAIL-ASC-HOP";return N;}
            return jtH<12?UL:N;}
          const tw=q.y>405?436:q.y>342?404:q.y>310?372:q.y>278?372:0;
          if(q.x<tw&&Math.abs(q.vx)>2){sub="h";jtH=0;return UL;}
          if(Math.abs(q.vx)<0.5&&jt>10&&sub!=="rdy"){sub="back";jtH=0;}
          if(sub==="back"){jtH++; if(jtH>10){sub="";jtL=0;} return R;}
          if(jt>500){phase="FAIL-ASC";return N;}
          return L;}
        case "A7":{jt++; // 256顶东行→x>310 UR东跳(清256块角(320,256)高距富余)→落224顶[448,480]
          if(sub==="h"){jtH++;
            if(q.y>180&&q.y<198&&q.x>445&&q.x<479){mark(f,"T224B",q);phase="DESC";jt=0;sub="";return N;}
            if(jtH>150){phase="FAIL-A7";return N;}
            return jtH<30?UR:R;}
          if(q.x>310){sub="h";jtH=0;return UR;}
          if(jt>300){phase="FAIL-A7PIN";return N;}
          return R;}
        case "DESC":{jt++; // 224顶东行→tip480落256顶[480,512]→tip512落320级[512,576]→trap坡下→池
          if(q.y>212&&q.y<230&&q.x>477&&q.x<512){mark(f,"D256",q);jt=0;return N;}
          if(q.y>276&&q.y<294&&q.x>505&&q.x<560){mark(f,"D320",q);phase="DESCE";jt=0;return N;}
          if(jt>300){phase="FAIL-DESC";return N;}
          return R;}
        case "DESCE":{jt++; // 320级东行→trap坡(576,320)→(618,336)下→池底
          if(q.y>285&&q.x>570&&q.x<745){mark(f,"POOL2",q);phase="POOLE2";jt=0;return N;}
          if(jt>300){phase="FAIL-DESCE";return N;}
          return R;}
        case "POOLE2":{jt++; // 东hyp上mesa(无风,v20已证)
          if(q.y<232&&q.x>800){mark(f,"MESA2",q);phase="MESAE";jt=0;return N;}
          if(jt>600){phase="FAIL-POOLE2";return N;}
          return R;}
        case "MESAE":{jt++; // mesa顶东行(风停)→东缘1024 tip-over→288台
          if(q.y>240&&q.y<264&&q.x>990&&q.x<1050){mark(f,"T288E",q);phase="M2E";jt=0;return N;}
          if(jt>400){phase="FAIL-MESAE";return N;}
          return q.x>995?((f%8)<3?R:N):R;}
        case "M2E":{jt++; // 288台(992-1056)西行→西缘992 tip→大板西tri(960-992,768)
          if(q.y>715&&q.y<748&&q.x>940&&q.x<1120){mark(f,"BIGSLAB",q);phase="BIGW";jt=0;return N;}
          if(jt>300){phase="FAIL-M2E";return N;}
          return (f%12)<2?L:N;}
        case "BIGW":{jt++; // 大板西行→西缘960 tip→岸顶(896-1024,864)
          if(q.y>815&&q.y<848&&q.x>890&&q.x<1024){mark(f,"SHORE",q);phase="SHOREW";jt=0;return N;}
          if(jt>300){phase="FAIL-BIGW";return N;}
          return q.x>1000?L:((f%12)<2?L:N);}
        case "SHOREW":{jt++; // 岸顶西行→854 hyp下→绿台
          if(q.y>830&&q.x>690&&q.x<865){mark(f,"GREEN",q);phase="EAST";jt=0;return N;}
          if(jt>300){phase="FAIL-SHOREW";return N;}
          return L;}
        case "EAST":{jt++; // 绿台→岸→(1024落袋撞死柱1056西面)→U13f+UR越柱→floor东侧
          if(sub==="hE"){jtH++;
            if(q.y>850&&q.x>1150){mark(f,"EASTF",q);sub="";phase="WESTF";jt=0;return N;}
            if(jtH>200){phase="FAIL-HOPE";return N;}
            return jtH<13?U:UR;}
          if(q.y>850&&q.x>1024&&q.x<1052){sub="hE";jtH=0;return U;}
          if(jt>900){phase="FAIL-L1";return N;}
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
