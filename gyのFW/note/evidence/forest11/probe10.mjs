import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const DT = 1/60;
const ins0 = { up:false, left:false, right:false };
const D = { R:{up:false,left:false,right:true}, L:{up:false,left:true,right:false} };
function setup(x, feet) {
  const w = makeWorld("forest_11");
  for (let i=0;i<30;i++) w.step(DT,{fireboy:ins0,watergirl:ins0});
  const me = w.chars.fireboy;
  me.body.SetPosition({ x:-x/32, y:-(feet-35.2)/32 });
  me.body.SetLinearVelocity({ x:0, y:0 });
  return w;
}
{
  const w = setup(826, 672);
  for (const p of w.mechs.platforms) {
    console.log("platform keys:", Object.keys(p).join(","));
    console.log("  def:", JSON.stringify(p.def||p.def_||"").slice(0,300));
    const bp = p.body.GetPosition();
    console.log(`  body@ screen(${(-32*bp.x).toFixed(0)},${(-32*bp.y).toFixed(0)}) state=${p.state}`);
  }
  for (const l of w.mechs.levers) {
    console.log("lever keys:", Object.keys(l).join(","));
    console.log("  def:", JSON.stringify(l.def||"").slice(0,300));
    const bp = l.body.GetPosition();
    console.log(`  body@ screen(${(-32*bp.x).toFixed(0)},${(-32*bp.y).toFixed(0)}) state=${l.state}`);
  }
  console.log("manager.groups:", JSON.stringify(w.mechs.manager.groups).slice(0,200));
}
console.log("== p1 移动测量 ==");
{
  const w = setup(826, 672);
  const pls = w.mechs.platforms;
  const pick = pls.map((p,i)=>({i, y:-32*p.body.GetPosition().y, x:-32*p.body.GetPosition().x}));
  console.log("initial:", pick.map(p=>`#${p.i}(x${p.x.toFixed(0)},y${p.y.toFixed(0)})`).join(" "));
  const p1i = pick.findIndex(p => Math.abs(p.x-880)<60 && p.y>700);
  console.log("p1 index:", p1i);
  const py = () => -32*pls[p1i].body.GetPosition().y;
  const px = () => -32*pls[p1i].body.GetPosition().x;
  let log=[]; let risenF=-1;
  for (let i=0;i<300;i++) {
    const inp = i<22 ? {...D.L} : ins0;
    w.step(DT,{fireboy:inp,watergirl:ins0});
    if (py() <= 692 && risenF<0) { risenF=i; log.push(`RISEN f${i} p1=(${px().toFixed(0)},${py().toFixed(0)})`); }
    if ([18,20,22,25,30,35,40,50,60,80,100,299].includes(i)) log.push(`f${i} p1=(${px().toFixed(0)},${py().toFixed(0)})`);
  }
  console.log(log.join("\n"));
}
