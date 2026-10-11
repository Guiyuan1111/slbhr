// 决定性测试1：fb 走廊→地板→西走翻 lever0；wg r15 待命 wind0 举升？
import { makeWorld } from "../../../scripts/e2e/routetool/kernel.mjs";
const IDLE = { up: false, left: false, right: false };
const P = c => { const p = c.body.GetPosition(); return [+(-p.x * 32).toFixed(1), +(-p.y * 32).toFixed(1)]; };
const w = makeWorld("forest_21");
const fb = w.chars.fireboy, wg = w.chars.watergirl;
const inp = (o) => ({ up: !!o.u, left: !!o.l, right: !!o.r });
// 脚本：fb 按此前证段：左跑62f→r11→右跑→R1168→r18檐→左45→袋→上6→R1024→滑行→走廊→东走出廊→r24坡→地板→西走(翻lever0)→停
const seq = [];
const add = (n, e) => { for (let i = 0; i < n; i++) seq.push(e); };
add(3, {});            // f0-2
add(62, { l: 1 });     // 左跑→r11 (1059,316.6)
add(12, {});           // 稳
add(52, { r: 1 });     // 右跑→R1168→r18檐 (1194,537.3)
add(120, {});          // 稳(滑停)
add(45, { l: 1 });     // 左45→袋 (1028,605)
add(6, { u: 1 });      // 上跳→R1024
add(250, {});          // 滑落走廊 (1050,701)
add(30, { r: 1 });     // 走廊东走+出走
add(200, {});          // 落r24坡→地板 (1200,861)
add(90, { l: 1 });     // 西走→翻lever0(960)→停在plat2东(~890)
add(2000, {});         // 长待机（观察wg风柱）
// wg 脚本：东走到 r15 后原地待命
const seqW = [];
const addW = (n, e) => { for (let i = 0; i < n; i++) seqW.push(e); };
addW(3, {});
addW(120, { r: 1 });
addW(3000, {});
let lever0 = -1, wind0 = -1;
const rows = [];
for (let f = 0; f < seq.length; f++) {
  const ev = w.step(1 / 60, { fireboy: inp(seq[f] ?? {}), watergirl: inp(seqW[f] ?? {}) });
  for (const e of ev) {
    if (e.type === "mech") {
      const s = JSON.stringify(e.event);
      if (s.includes("lever")) rows.push(`f${f} mech ${s}`);
    }
  }
  if (f % 100 === 0 || f === seq.length - 1) {
    const lv = w.mechs.levers.map(L => L.state).join(",");
    const wd = w.mechs.winds.map(W => W.state).join(",");
    rows.push(`f${f} fb(${P(fb)}) wg(${P(wg)}) lever[${lv}] wind[${wd}]`);
  }
}
console.log(rows.join("\n"));
console.log("diamonds:", w.diamonds.map(d => `${Math.round(d.x)},${Math.round(d.y)}:${d.collected ? 1 : 0}`).join(" "));
