import { readFileSync } from "node:fs";
const file = "D:/01_Guiyuan1111/GitHub/slbhr/Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js";
const src = readFileSync(file, "latin1");
function all(needle){
  const out=[]; let i=-1;
  while((i=src.indexOf(needle,i+1))!==-1) out.push(i);
  return out;
}
for(const s of ["startLevel","checkEndGame","getElapsedSeconds","animateFinish","gameFinish","animateStairs","gameOver","Retry","ASDFA","CreateNavies","levelMusicFinish","tutorial","Tutorial","isUp","isOpen","prohibitJump","currentRunForce","absoluteMaxSpeed","floatForce","SetMotorSpeed","maxMotorForce","SetMaxMotorTorque","maxMotorTorque","reactable","startPos","onis","fullRotation","tileSprite","windWidth","windLength","boxWidth","initialState","setDensity","SetLinearVelocity","jumpVelocity"]){
  console.log(s, "=>", all(s).join(","));
}
