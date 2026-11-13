// probe7-ice03.mjs — 经验落点地图（fw-route-ice03 槽，2026-11-01）。
// surf/raster 对复杂瓦片（斜坡/楔/盖）推导失真，改用角色空投：teleport 至 (x, yDrop) 静止下落，
// 记录 settled (grounded&&|vy|<8) 落点或死亡/超时。两件事：
//   M1: 底层墙区 x[688,1216] step16, yDrop=430（墙顶上方）——墙顶真实可站面。
//   M2: 关键通道假设验证（越墙跳弧落点）：从指定 (x,y,vx) 精确重放单跳。
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const kernel = await import(pathToFileURL(join(ROOT, "scripts/e2e/routetool/kernel.mjs")).href);
const { makeWorld } = kernel;
const NONE = { up: false, left: false, right: false };

const dropTest = (x, yDrop, holdF = 300, inp = NONE) => {
  const w = makeWorld("ice_03");
  const b = w.players.watergirl.body;
  b.SetPosition({ x: -x / 32, y: -yDrop / 32 });
  b.SetLinearVelocity({ x: 0, y: 0 });
  b.SetAwake(true);
  let res = "timeout", sx = 0, sy = 0;
  for (let f = 0; f < holdF; f++) {
    w.step(1 / 60, { fireboy: NONE, watergirl: inp });
    const s = w.snapshotPlayer("watergirl");
    if (s.dead || s.dying) { res = "dead"; sx = s.x; sy = s.y; break; }
    const grounded = w.players.watergirl.feetContacts.length > 0;
    if (f > 6 && grounded && Math.abs(s.vy) < 8) { res = "stand"; sx = s.x; sy = s.y; break; }
  }
  return { res, x: +sx.toFixed(1), y: +sy.toFixed(1) };
};

console.log("== M1 墙区空投（yDrop=430，x 688..1216 step16）");
const out = [];
for (let x = 688; x <= 1216; x += 16) out.push(`x${x}:${JSON.stringify(dropTest(x, 430))}`);
console.log(out.join(" "));

console.log("== M1b 墙区空投（yDrop=760，x 688..1216 step16）看中层");
const out2 = [];
for (let x = 688; x <= 1216; x += 16) out2.push(`x${x}:${JSON.stringify(dropTest(x, 760))}`);
console.log(out2.join(" "));
