// r19c t5：定标测量 —— (a) wg 满跳净升（feet 基线）；(b) 右井 P2 全宽陷阱复核
import { makeWorld } from "../../scripts/e2e/routetool/kernel.mjs";
// (a) 满跳净升：wg 出生台平跳
{
  const w = makeWorld("forest_19");
  let curF = 0;
  const st = (n, i = {}) => { for (let k = 0; k < n; k++) { w.step(1 / 60, { fireboy: {}, watergirl: i }); curF++; } };
  st(30);
  const f0 = w.snapshotPlayer("watergirl").y;
  st(1, { up: true });
  let apex = f0, apexF = curF;
  for (let k = 0; k < 90; k++) {
    st(1);
    const y = w.snapshotPlayer("watergirl").y;
    if (y < apex) { apex = y; apexF = curF; }
  }
  console.log(`(a) wg 站立 feet=${(f0 + 35).toFixed(1)} apex feet=${(apex + 35).toFixed(1)} 净升=${(f0 - apex).toFixed(1)}px @f+${apexF - 31}`);
}
// (b) 右井：fb 东行滑坡入井，P2@OFF 接住后无下行缝
{
  const w = makeWorld("forest_19");
  let curF = 0;
  const st = (n, i = {}) => { for (let k = 0; k < n; k++) { w.step(1 / 60, { fireboy: i, watergirl: {} }); curF++; } };
  st(10);
  for (let i = 0; i < 200; i++) { st(1, { right: true }); if (w.snapshotPlayer("fireboy").x >= 1062) break; }
  st(2); st(25, { right: true }); st(240);
  const s1 = w.snapshotPlayer("fireboy");
  console.log(`(b) fb 入井后 f=${curF} fb=(${s1.x.toFixed(1)},${s1.y.toFixed(1)})`);
  st(300);
  const s2 = w.snapshotPlayer("fireboy");
  const M = w.mechanisms;
  const p2 = M.platforms[2].body.GetPosition(), p3 = M.platforms[3].body.GetPosition();
  console.log(`(b) 静置后 f=${curF} fb=(${s2.x.toFixed(1)},${s2.y.toFixed(1)}) P2=(${(p2.x * -32).toFixed(0)},${(p2.y * -32).toFixed(0)}) P3=(${(p3.x * -32).toFixed(0)},${(p3.y * -32).toFixed(0)})`);
  // g5 ON（模拟 fb 压 B 不可达——直接看 P2 全宽：fb 在 P2 上向西走能否出井）
  st(1, { left: true }); st(50, { left: true });
  const s3 = w.snapshotPlayer("fireboy");
  console.log(`(b) P2 上西行50f fb=(${s3.x.toFixed(1)},${s3.y.toFixed(1)})${s3.dying ? " DYING" : ""}`);
}
