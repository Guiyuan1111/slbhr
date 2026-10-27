import {readFile,writeFile} from "node:fs/promises";
let src=await readFile("TEMP/r25d/p50-wg-v27.mjs","utf8");
src=src.replace('case "MESAJ":{jt++;','case "MESAJ":{jt++; const MODE=process.env.MODE||"R";');
const old='''          if(sub!=="jmp"){
            if(q.x>940){sub="jmp";jt2=0;}
            return R;}
          jt2++;
          if(jt2<3)return UR;
          if(q.y>850&&q.x>1150){mark(f,"EASTF",q);phase="WESTF";jt=0;sub="";return N;}
          if(jt2>500){phase="FAIL-MESAJ";return N;}
          return R;}''';
const rep='''          if(MODE==="N"){if(f%25===0)console.log(`  N f${f} (${px(q.x)},${px(q.y)}) v=(${px(q.vx)},${px(q.vy)})`);return N;}
          if(MODE==="RN"){
            if(f%25===0)console.log(`  ${jt<100?"R":"N"} f${f} (${px(q.x)},${px(q.y)}) v=(${px(q.vx)},${px(q.vy)})`);
            return jt<100?R:N;}
          if(MODE==="JUMP"){
            if(sub!=="jmp"){if(q.x>860){sub="jmp";jt2=0;}return R;}
            jt2++;
            if(jt2%5===0)console.log(`  J f${f} jt2=${jt2} (${px(q.x)},${px(q.y)}) v=(${px(q.vx)},${px(q.vy)})`);
            if(jt2<3)return UR;
            return R;}'''+old;
if(!src.includes(old)){console.error("anchor missing");process.exit(1);}
src=src.replace(old,rep);
await writeFile("TEMP/r25d/p51-probe.mjs",src);
console.log("probe written");
