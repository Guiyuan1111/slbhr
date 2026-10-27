// v19 全链：SW→DROP→POOL→POOLW→STAIR→PIN→HOP→T224→W224(N落)→SLAB448→L0(风停)
// →SLABE→GDIVE→GREEN(878)→EAST(shore/floor)→L1(天窗开)→WESTF→WEDGE(832)→HOP1(800楔)
// →JUMP2(slab顶736)→SLABTOP→SKYFALL→ANTE→DOOR(208)  [FB 全程 N]
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const px=(n)=>Math.round(n*10)/10;
const N={up:false,left:false,right:false},L={up:false,left:true,right:false},R={up:false,left:false,right:true},U={up:true,left:false,right:false},UL={up:true,left:true,right:false},UR={up:true,left:false,right:true};

export function wgRun19(p={}){
  const {trace=false,pulL=4}=p;
  const w=makeWorld("forest_25");
  const marks=[];const mark=(f,name,q)=>marks.push([f,name,px(q.x),px(q.y)]);
  let phase="SW",jt=0,apex=1e9,done="";
  for(let f=0;f<3000;f++){
    const q=w.snapshotPlayer("watergirl");
    const inp=f<90?N:(()=>{
      switch(phase){
        case "SW":
          if(q.y>120){phase="DROP";jt=0;}
          return L;
        case "DROP":
          jt++;
          if(q.y>290&&q.x>570&&q.x<745){mark(f,"POOL",q);phase="POOLW";jt=0;return N;}
          if(jt>400){phase="FAIL-DROP";return N;}
          return L;
        case "POOLW":{jt++;
          if(q.y<285&&q.x<600&&q.x>500){mark(f,"LIP",q);phase="STAIR";jt=0;return N;}
          if(q.x<500&&q.y>285){phase="FAIL-POOL-OVER";return N;}
          if(jt>600){phase="FAIL-POOLW";return N;}
          return (f%pulL)<pulL-1?L:N;}
        case "STAIR":{jt++;
          if(q.x<558.5&&q.x>545&&q.y>252&&q.y<272&&Math.abs(q.vx)<0.6){mark(f,"PIN",q);phase="HOP";jt=0;return U;}
          if(jt>200){phase="FAIL-STAIR";return N;}
          return (f%pulL)<pulL-1?L:N;}
        case "HOP":{jt++;
          if(jt>4&&q.y>180&&q.y<215&&Math.abs(q.vy)<12&&q.x>445&&q.x<512){mark(f,"T224",q);phase="W224";jt=0;return N;}
          if(jt>90){phase="FAIL-HOP";return N;}
          return jt<=24?U:(jt<=44?L:N);}
        case "W224":{ // 脉冲爬上 224 顶→慢行掉落；落台阶区则转恢复
          jt++;
          if(q.y>375&&q.y<445&&Math.abs(q.vy)<12&&q.x>420&&q.x<490){mark(f,"SLAB",q);phase="SLAB";jt=0;return N;}
          if(q.y>240&&q.y<330&&Math.abs(q.vy)<12&&q.x>340&&q.x<420){mark(f,"STEP",q);phase="W224R";jt=0;return N;}
          if(jt>300){phase="FAIL-W224";return N;}
          return q.y>210?N:((f%6)<5?L:N);}
        case "W224R":{ // 台阶恢复：角接触必须跳——连跳东进直到落大板
          jt++;
          if(f%3===0)console.log(`  R f${f} jt${jt} (${px(q.x)},${px(q.y)}) v(${px(q.vx)},${px(q.vy)})`);
          if(q.y>375&&q.y<445&&q.x>420&&q.x<490){mark(f,"SLAB",q);phase="SLAB";jt=0;return N;}
          if(jt>300){phase="FAIL-W224R";return N;}
          {const c=jt%80;return c<24?UR:(c<60?R:N);}}
        case "SLAB":{jt++; // 东行过杆(496)到东缘（wg 不需要 l0：路线全在风带外）
          if(!marks.some(m=>m[1]==="L0PASS")&&q.x>480)mark(f,"L0PASS",q);
          if(q.x>540){phase="SLABE";jt=0;return N;}
          if(jt>400){phase="FAIL-L0";return N;}
          if(jt>40&&Math.abs(q.vx)<1&&q.x<455){return jt%40<24?UR:R;} // 卡死解围跳
          return R;}
        case "SLABE": // 东缘走落→绿台（站心 843）
          if(q.y>830&&q.x>540&&q.x<700&&Math.abs(q.vy)<12){mark(f,"GREEN",q);phase="EAST";jt=0;return N;}
          if(jt++>300){phase="FAIL-SLABE";return N;}
          return R;
        case "EAST":{jt++; // 绿台→岸→floor→推 l1(1152)
          const lv=w.mechSnapshot().levers[1];
          if(lv.state===1&&!marks.some(m=>m[1]==="L1"))mark(f,"L1",q);
          if(lv.state===1){phase="WESTF";jt=0;return N;}
          if(jt>700){phase="FAIL-L1";return N;}
          return R;}
        case "WESTF":{jt++; // 原路返回：floor→岸→绿台→墙 hyp
          if(q.x<370&&q.y<872){mark(f,"TRAP",q);phase="WEDGE";jt=0;return N;}
          if(jt>800){phase="FAIL-WESTF";return N;}
          return L;}
        case "WEDGE":{jt++; // 爬上墙 hyp 到 (288,832) 楔点
          if(q.x<305&&q.y>808&&q.y<832&&Math.abs(q.vx)<2){mark(f,"W1",q);phase="HOP1";jt=0;apex=1e9;return U;}
          if(jt>300){phase="FAIL-WEDGE";return N;}
          return L;}
        case "HOP1":{jt++; // 小跳上 (288,800) 楔
          if(q.y<apex)apex=q.y;
          if(jt>20&&q.y>778&&q.y<800&&q.x<310&&Math.abs(q.vy)<12){mark(f,"W2",q);phase="JUMP2";jt=0;apex=1e9;return U;}
          if(jt>120){phase="FAIL-HOP1";return N;}
          return jt<=14?U:L;}
        case "JUMP2":{jt++; // 全跳上 slab 顶 (736)：圆底 731.4 清 4.5px 缘
          if(q.y<apex)apex=q.y;
          if(jt>40&&q.y>695&&q.y<715&&q.x>198&&q.x<292){mark(f,"STOP",q);phase="SLABTOP";jt=0;return N;}
          if(jt>120){phase="FAIL-JUMP2";return N;}
          return jt<=24?U:(jt<=44?UL:L);}
        case "SLABTOP": // 西行到西缘 (192) 走落天窗
          if(q.x<210){phase="SKYFALL";jt=0;return L;}
          return L;
        case "SKYFALL":
          if(q.y>845&&q.x>60&&q.x<200){mark(f,"ANTE",q);phase="DOORW";jt=0;return N;}
          if(jt++>200){phase="FAIL-SKYFALL";return N;}
          return L;
        case "DOORW":{jt++;
          if(q.x>202&&q.x<216){mark(f,"DOOR",q);phase="SETTLE";jt=0;return N;}
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
    if(trace&&f%50===0){const q2=w.snapshotPlayer("watergirl");console.log(`  f${f} ${phase} (${px(q2.x)},${px(q2.y)}) v=(${px(q2.vx)},${px(q2.vy)})`);}
    if(q.dead){done=`DEAD f${f} @(${px(q.x)},${px(q.y)})`;break;}
    if(String(phase).startsWith("FAIL")){done=`FAIL@${phase} f${f} @(${px(q.x)},${px(q.y)}) apex=${px(apex)}`;break;}
    if(phase==="DONE")break;
  }
  const snap=w.mechSnapshot();
  return {marks,done,phase,levers:snap.levers,doors:{wg:w.built.doors.watergirl.isUp,fb:w.built.doors.fireboy.isUp},phaseNow:w.phase};
}

const r=wgRun19({});
console.log(r.marks.map(m=>`f${m[0]}→${m[1]}(${m[2]},${m[3]})`).join(" "));
console.log("ended=",r.done||r.phase,"| levers:",JSON.stringify(r.levers.map(l=>l.state)),"| doors:",JSON.stringify(r.doors),"| world:",r.phaseNow);
