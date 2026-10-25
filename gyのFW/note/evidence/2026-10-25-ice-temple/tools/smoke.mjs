// ice 部入库冒烟：逐关 loadLevel + World 建 + 60 步；报告 unknown 机关谱
import { loadLevel, listLevelIds } from "../../../../packages/server/src/levels.ts";
import { World } from "../../../../packages/shared/src/kernel/world.ts";
const ids = listLevelIds().filter((i) => i.startsWith("ice")).sort();
console.log("ice 关卡数:", ids.length);
const unknowns = new Map();
let fail = 0;
for (const id of ids) {
  try {
    const b = loadLevel(id);
    const w = new World(b.level);
    for (let f = 0; f < 60; f++) w.step(1 / 60, { fireboy: { up: false, left: false, right: false }, watergirl: { up: false, left: false, right: false } });
    const u = b.level.unknown;
    if (u && u.length) unknowns.set(id, u);
  } catch (e) {
    fail++;
    console.log(id, "FAIL:", String(e).slice(0, 140));
  }
}
console.log("失败:", fail, "| 带 unknown 的关:", unknowns.size);
const kinds = {};
for (const list of unknowns.values()) for (const u of list) kinds[u.replace(/=.*/, "")] = (kinds[u.replace(/=.*/, "")] || 0) + 1;
console.log("unknown 谱:", kinds);
