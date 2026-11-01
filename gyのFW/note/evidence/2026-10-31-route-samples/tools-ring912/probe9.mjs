// fw-route-crystal3 槽 · crystal_03 环 9 探针（01号档 §4 唯一无连续证据环，内核复现）
// 环 9 = 口袋(台顶 256, C4 终点 611,220.5)→东下行阶梯(col20/21 楔 256→288→320)→floor320(顶 320,x[864,1248])
// 几何推演：唯一通路 = (704,320) 楔端满速东跳落 floor320(~940)；走断则落 416 板→832 楔→
//   512 楔西尖(896,512)→448 板 x[960,1248] = 死路(上 floor320 需升 128>119 静跳上限)。
// A 部：从台顶东行，在 (704,320) 缘跑跳扫参（起跳点/方向保持），证 floor320 可登。
// B 部：不跳走断参照（预期落 416 板/448 板死路）——记录为负对照。
// C 部：A 部最优参续走东行贴箱(960,288)，证环 9→环 10 交接（fb 到 box 西面）。
// 用法: node --import tsx TEMP/fw-rc3-1/probe9.mjs [A|B|C]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
function findRoot(dir) {
  for (let d = dir; ; d = dirname(d)) {
    try { readFileSync(join(d, "package.json")); return d; } catch { /* 向上 */ }
  }
}
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
const { makeWorld } = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "kernel.mjs")).href);
const B = (await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "kernel", "b2.js")).href)).b2();

const part = process.argv[2] ?? "A";
const NONE = { up: false, left: false, right: false };
const IN = (o) => ({ fireboy: { ...NONE, ...o }, watergirl: { ...NONE, ...o } });
const place = (w, role, sx, syCenter) => {
  const body = w.players[role === "fb" ? "fireboy" : "watergirl"].body;
  body.SetPosition(new B.b2Vec2(-sx / 32, -syCenter / 32));
  body.SetLinearVelocity(new B.b2Vec2(0, 0));
  body.SetAwake(true);
};
const snap = (w, role) => {
  const s = w.snapshotPlayer(role === "fb" ? "fireboy" : "watergirl");
  return { x: +s.x.toFixed(2), y: +s.y.toFixed(2), vx: +(s.vx ?? 0).toFixed(2), vy: +(s.vy ?? 0).toFixed(2), atDoor: s.atDoor, dead: s.dead || s.dying, phase: w.phase };
};
const feetOf = (s) => +(s.y + 35.2).toFixed(1);
const grounded = (w, role) => w.players[role === "fb" ? "fireboy" : "watergirl"].feetContacts.length > 0;
const boxPos = (w) => {
  const p = w.mechanisms.props[0]?.body.GetPosition();
  return p ? { x: +(-p.x * 32).toFixed(2), y: +(-p.y * 32).toFixed(2) } : null;
};

// 环 9 主跑：fb 台顶 (611,220.5) 东行，jumpX 缘起跳（up 保持 holdUp 帧），随后持续东行至稳态
// 注意：currentRunForce 初始 undefined（character.ts:37），首帧按键=NaN 力不动——先 sleep(3) 初始化
function runRing9(jumpX, holdUp, maxF = 420, verbose = false) {
  const w = makeWorld("crystal_03");
  place(w, "fb", 611, 220.5);
  const log = [];
  let jumpF = -1, landed = null;
  for (let f = 0; f < maxF; f++) {
    const s = snap(w, "fb");
    let inp = f < 3 ? {} : { right: true };
    if (jumpF < 0 && s.x >= jumpX && s.vx > 7 && grounded(w, "fb")) {
      jumpF = f; inp = { right: true, up: true };
      log.push(`JUMP@f${f} pre=[${s.x},${s.y},feet${feetOf(s)},vx${s.vx}]`);
    } else if (jumpF >= 0 && f - jumpF < holdUp) {
      inp = { right: true, up: true };
    }
    w.step(1 / 60, IN(inp));
    const a = snap(w, "fb");
    if (verbose && (f % 10 === 0 || (jumpF >= 0 && f < jumpF + 40))) log.push(`f${f} [${a.x},${a.y},feet${feetOf(a)},vx${a.vx},vy${a.vy}] g=${grounded(w, "fb") ? 1 : 0}`);
    if (a.dead) { log.push(`DEAD@f${f} [${a.x},${a.y}]`); break; }
    if (jumpF >= 0 && f > jumpF + 20 && grounded(w, "fb") && Math.abs(a.vy) < 20) {
      // 稳态落地判定：连续 10 帧 grounded
      let stable = true;
      for (let k = 0; k < 10; k++) {
        w.step(1 / 60, IN({ right: f > jumpF + 60 }));
        const c = snap(w, "fb");
        if (!grounded(w, "fb") || c.dead) { stable = false; break; }
      }
      const c = snap(w, "fb");
      landed = `LAND@f${f} [${c.x},${c.y},feet${feetOf(c)},vx${c.vx}] stable=${stable}`;
      break;
    }
  }
  return { jumpF, landed, tail: log.slice(-14) };
}

if (part === "A") {
  // 扫参：起跳点（楔面 x）× 空中保持
  for (const jumpX of [696, 700, 703, 706]) {
    for (const holdUp of [8, 12]) {
      const r = runRing9(jumpX, holdUp);
      console.log(`jumpX=${jumpX} holdUp=${holdUp}: ${r.landed ?? "NO-LAND(fell)"}`);
    }
  }
  console.log("--- 最优组 verbose（jumpX=703 holdUp=12）---");
  const r = runRing9(703, 12, 420, true);
  console.log(r.tail.join("\n"));
  process.exit(0);
}

if (part === "B") {
  // 负对照：不在缘起跳，一路东行走断——记录轨迹与终点
  const w = makeWorld("crystal_03");
  place(w, "fb", 611, 220.5);
  const log = [];
  for (let f = 0; f < 520; f++) {
    w.step(1 / 60, IN(f < 3 ? {} : { right: true }));
    const a = snap(w, "fb");
    if (f % 10 === 0) log.push(`f${f} [${a.x},${a.y},feet${feetOf(a)},vx${a.vx},vy${a.vy}] g=${grounded(w, "fb") ? 1 : 0}`);
    if (a.dead) { log.push(`DEAD@f${f}`); break; }
  }
  console.log("B walk-off (no jump):");
  console.log(log.join("\n"));
  process.exit(0);
}

if (part === "C") {
  // 环 9→10 交接：jumpX=703 跳上 floor320 后继续东行贴箱，证可推箱位形
  const w = makeWorld("crystal_03");
  place(w, "fb", 611, 220.5);
  const log = [];
  let jumpF = -1, contactF = -1;
  for (let f = 0; f < 700; f++) {
    const s = snap(w, "fb");
    let inp = f < 3 ? {} : { right: true };
    if (jumpF < 0 && s.x >= 703 && s.vx > 7 && grounded(w, "fb")) { jumpF = f; inp = { right: true, up: true }; }
    else if (jumpF >= 0 && f - jumpF < 12) inp = { right: true, up: true };
    w.step(1 / 60, IN(inp));
    const a = snap(w, "fb");
    const bx = boxPos(w);
    if (f % 20 === 0 || (jumpF >= 0 && f < jumpF + 45)) log.push(`f${f} fb=[${a.x},${a.y},feet${feetOf(a)},vx${a.vx}] box=[${bx.x},${bx.y}] g=${grounded(w, "fb") ? 1 : 0}`);
    if (a.dead) { log.push(`DEAD@f${f}`); break; }
    if (bx.x > 965 && contactF < 0) { contactF = f; log.push(`BOX-PUSHED@f${f} box=[${bx.x},${bx.y}] fb=[${a.x},${a.y}]`); }
  }
  console.log("C ring9→box contact:", `jumpF=${jumpF} contactF=${contactF}`);
  console.log(log.join("\n"));
  process.exit(0);
}
console.log("unknown part", part);
