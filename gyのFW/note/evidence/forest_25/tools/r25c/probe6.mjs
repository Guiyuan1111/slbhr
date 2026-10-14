// r25c forest_25 内核探针 6b：fb 链反馈探针 v2（风 OFF 预置）
// A 刹停(松<880) → B 尖步落缘 → C mesa东行(至~1000刹停) → D 尖步下东坡溜入井口 → E 凸台东行
// → F 竖井阶梯翻落(L带) → G 东下台西行 → H 台缘西跳上板 → I 泵摆 → J 西跳落底层 → K fb门
// 用法: node --import tsx TEMP/r25c/probe6.mjs (在 gyのFW 根)
import { makeWorld } from "../../gyのFW/scripts/e2e/routetool/kernel.mjs";

const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };

const w = makeWorld("forest_25");
for (let i = 0; i < 200; i++) {
  w.mechanisms.levers[0].body.ApplyTorque(30);
  w.step(1 / 60, { fireboy: N, watergirl: N });
}
console.log(`预置后: l0 state=${w.mechanisms.levers[0].state} wind=${w.mechanisms.winds[0].state}`);
const trace = [];
const marks = [];
let phase = "A";
let sub = 0;

for (let f = 0; f < 2200; f++) {
  const inp = f < 90 ? N : (() => {
    const p = w.snapshotPlayer("fireboy");
    const mark = (name) => { if (phase !== name) { marks.push([f, name, px(p.x), px(p.y)]); phase = name; sub = 0; } };
    switch (phase) {
      case "A": // 全速左行，x<860 松手刹车（刹距~21px → 停在缘前 ~839）
        if (p.x < 860) mark("B");
        return L;
      case "B": // 缘前站稳后尖步脉冲踱出边缘
        if (Math.abs(p.vx) < 3 && p.x > 826 && p.x < 855) {
          sub++;
          return sub % 12 < 3 ? L : N; // 3f 脉冲/9f 休息
        }
        if (p.y > 130) mark("C"); // 已离台下坠
        return N;
      case "C": // 落 mesa，站稳定格
        if (p.y > 205 && Math.abs(p.vy) < 5) mark("D");
        return N;
      case "D": // 东行至 x>1000 松手刹车（刹距~44 → 停 ~1000-1040）
        if (p.x > 1000) mark("E");
        return R;
      case "E": // 尖步脉冲下东斜坡（45°摩擦不保静止，靠脉冲推进）
        sub++;
        if (p.y > 300) mark("F"); // 已落进井口
        return sub % 10 < 4 ? R : N;
      case "F": // 井口→c33\滑→凸台 y384，站稳后东行
        if (p.y > 335 && p.y < 365 && Math.abs(p.vy) < 5) mark("G");
        return N;
      case "G": // 凸台东行过 wD 斜坡跌入竖井；越东缘(y>400)后 N 消速落东阶，再 L 沿阶梯西降
        if (p.y > 715 && p.y < 755 && Math.abs(p.vy) < 5) mark("I");
        return p.y < 420 ? R : (p.y < 460 ? N : L);
      case "I": // 台面西行，x<1030 收步刹停（刹距~21 → 停 ~1009，缘 x992 前）
        if (p.x < 1030) mark("J");
        return L;
      case "J": // 站定后跳左（up+left 保持 30f）飞吊板
        if (Math.abs(p.vx) < 3) {
          sub++;
          if (sub > 8 && sub < 40) return UL;
          if (p.y > 700 && p.x < 900) { mark("K"); }
          return sub >= 40 ? L : N;
        }
        return N;
      case "K": { // 板上泵摆：读吊板角度，西摆相位跳离
        const hb = w.mechanisms.hangings[0];
        if (p.y > 855 && Math.abs(p.vy) < 5) { mark("L"); break; }
        if (p.x < 660 && hb.angle < -0.3) { mark("M"); break; }
        return L;
      }
      case "M": // 板西端起跳（up+left 30f）后落底层
        sub++;
        if (sub === 1) return UL;
        if (p.y > 855 && Math.abs(p.vy) < 5) { mark("L"); break; }
        return sub < 30 ? UL : L;
      case "L": // 底层西行去 fb 门 (54-118)
        if (p.x < 118 && Math.abs(p.vx) < 5) { mark("DONE"); }
        return L;
      default: return N;
    }
  })();
  w.step(1 / 60, { fireboy: inp, watergirl: N });
  const p = w.snapshotPlayer("fireboy");
  trace.push({ f, x: px(p.x), y: px(p.y), vx: px(p.vx), vy: px(p.vy), anim: p.anim, ph: w.phase });
  if (p.dead || p.dying || w.phase !== "playing") break;
}

const last = trace[trace.length - 1];
console.log(`== fb 全链(风OFF) == frames=${trace.length} end=(${last.x},${last.y}) ph=${last.ph}`);
console.log("相位切换:\n  " + marks.map((m) => `f${m[0]}→${m[1]}(${m[2]},${m[3]})`).join("\n  "));
for (let i = 0; i < trace.length; i += 40) {
  const t = trace[i];
  console.log(`  f${t.f}: (${t.x},${t.y}) v=(${t.vx},${t.vy}) ${t.anim}`);
}
