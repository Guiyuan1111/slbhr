import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
const N={up:false,left:false,right:false},L={up:false,left:true,right:false},R={up:false,left:false,right:true},U={up:true,left:false,right:false},UL={up:true,left:true,right:false};
const w=makeWorld("forest_25");
for(let f=0;f<700;f++){
  const inp=f<90?N:(f<640?L:UL);
  w.step(1/60,{fireboy:N,watergirl:inp});
  if(f%20===0&&f>600){
    const p=w.players.watergirl;
    const q=w.snapshotPlayer("watergirl");
    const b=p.body;
    console.log(`f${f} pos=(${q.x.toFixed(1)},${q.y.toFixed(1)}) v=(${q.vx.toFixed(1)},${q.vy.toFixed(1)})`);
    console.log("  feet:",p.feetContacts.length, (p.feetContacts||[]).map(c=>({nx:+c.normal.x().toFixed(3),ny:+c.normal.y().toFixed(3)})));
    const c=b.GetContactList();let i=0;
    while(c&&i<6){const con=c.contact;
      const wf=con.m_fixtureA.m_body===b?"A":"B";
      const nrm=con.m_manifold?con.m_manifold.pointCount:0;
      console.log(`  contact${i}: points=${nrm} enabled=${con.IsEnabled()} touching=${con.IsTouching()}`);
      c.next===c;break;}
  }
}
