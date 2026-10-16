/** p2-control-win：forest_05 管道有效性对照——teleport 双角至双门 → 跳醒 → 实录 WIN 链。
 * 手法照 o25a p3c-doorstate（forest_03 先例）。 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p2] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_05.json", 5, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  window.__rec = [];
  window.__o05aWin = null;
  const lv = g.level;
  const ow = lv.gameFinish.bind(lv);
  lv.gameFinish = function () { window.__o05aWin = Date.now(); window.__rec.push(["gameFinish", lv.ui?.clock?.getElapsedSeconds?.()]); return ow(); };
  const oa = lv.animateFinish.bind(lv);
  lv.animateFinish = function () { window.__rec.push(["animateFinish", lv.door1.isUp, lv.door2.isUp]); return oa(); };
  // 传送：pers1(fireboy)→door1，pers2(watergirl)→door2，core=(sprite.x, sprite.y−11)
  const p1 = lv.pers1.body.data, p2 = lv.pers2.body.data;
  p1.SetLinearVelocity({ x: 0, y: 0 });
  p2.SetLinearVelocity({ x: 0, y: 0 });
  const i1 = { x: lv.door1.sprite.x, y: lv.door1.sprite.y };
  const i2 = { x: lv.door2.sprite.x, y: lv.door2.sprite.y };
  window.__doorPos = { d1: i1, d2: i2 };
  p1.SetPosition({ x: -i1.x / 32, y: -(i1.y - 11) / 32 });
  p2.SetPosition({ x: -i2.x / 32, y: -(i2.y - 11) / 32 });
});
// 等物理开钟后原地跳一次（唤醒 body，重触发门 sensor 接触）
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
await page.waitForTimeout(200);
await page.keyboard.down("ArrowUp");
await page.keyboard.down("KeyW");
await page.waitForTimeout(80);
await page.keyboard.up("ArrowUp");
await page.keyboard.up("KeyW");
log("jump bumped");
let rec = [];
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => ({
    rec: window.__rec.splice(0),
    win: !!window.__o05aWin,
    st: window.Phaser.GAMES[0].state.current,
  }));
  rec = rec.concat(s.rec);
  if (s.st === "endGame" || s.win) { rec.push(["FINAL", s]); break; }
  if (i === 39) rec.push(["FINAL", s]);
}
const doorPos = await page.evaluate(() => window.__doorPos).catch(() => null);
const out = { doorPos, rec };
writeFileSync(join(HERE, "p2-control-win.json"), JSON.stringify(out, null, 1));
log(JSON.stringify(out).slice(0, 900));
await browser.close();
