// r25c 探针 7：质量测量 + 空中左右力实效测定
import { makeWorld } from "../../gyのFW/scripts/e2e/routetool/kernel.mjs";
const px = (n) => Math.round(n * 10) / 10;
const N = { up: false, left: false, right: false };
const L = { up: false, left: true, right: false };
const R = { up: false, left: false, right: true };
const UL = { up: true, left: true, right: false };
const UR = { up: true, left: false, right: true };

const w = makeWorld("forest_25");
const fbBody = w.mechanisms ? null : null;
// 质量从 chars 拿不到？直接 step 一次后从 world 内部取
w.step(1 / 60, { fireboy: N, watergirl: N });
// world.chars 是 private……用 snapshot + 间接：遍历 built 无门。改从 body 用户数据侧不可行——直接测物理量。

// 试验 A: 平台原地竖跳+全程按左 60f —— 测空中左移漂移
function trial(name, script, totalF) {
  const ww = makeWorld("forest_25");
  const t0 = [];
  for (let f = 0; f < totalF; f++) {
    const inp = f < 90 ? N : script(f - 90, ww);
    ww.step(1 / 60, { fireboy: inp, watergirl: N });
    const p = ww.snapshotPlayer("fireboy");
    t0.push({ f, x: px(p.x), y: px(p.y), vx: px(p.vx), vy: px(p.vy) });
  }
  console.log(`${name}:`, t0.filter((_, i) => i % 5 === 0).map((t) => `f${t.f}:(${t.x},${t.y})v(${t.vx},${t.vy})`).join(" "));
}

// 原地跳（N 起跳后无输入）
trial("A0 竖跳无输入", (f) => (f === 0 ? { up: true, left: false, right: false } : N), 160);
// 竖跳后全程按左
trial("A1 竖跳+按左", (f) => (f === 0 ? { up: true, left: false, right: false } : L), 160);
// 跳前先左行 10f 带速度，跳+左
trial("A2 左行10f+跳+左", (f) => (f < 10 ? L : f === 10 ? UR : L), 160);
// 跳前右行10f，跳+左（反向初速）
trial("A3 右行10f+跳+左", (f) => (f < 10 ? R : f === 10 ? UL : L), 160);
