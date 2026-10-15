/** p3c-doorstate：门机器状态细查——isUp/ended/animateFinish 链路断点定位。 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p3c] ${m}`);

const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_03.json", 3, 0);
await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  window.__rec = [];
  window.__o25aWin = null;
  const lv = g.level;
  const ow = lv.gameFinish.bind(lv);
  lv.gameFinish = function () { window.__o25aWin = Date.now(); window.__rec.push(["gameFinish", lv.ui?.clock?.getElapsedSeconds?.()]); return ow(); };
  const oa = lv.animateFinish.bind(lv);
  lv.animateFinish = function () { window.__rec.push(["animateFinish", lv.door1.isUp, lv.door2.isUp]); return oa(); };
  const oc = lv.checkEndGame.bind(lv);
  let lastLog = 0;
  lv.checkEndGame = function () {
    if (Date.now() - lastLog > 400 && (lv.door1.isOpen || lv.door2.isOpen || lv.ended)) {
      lastLog = Date.now();
      window.__rec.push(["chk", +lv.door1.isUp, +lv.door2.isOpen, +lv.door1.frame21 ?? null, lv.door1.isUp, lv.door2.isUp, lv.ended]);
    }
    return oc();
  };
  // 传送
  const p1 = lv.pers1.body.data, p2 = lv.pers2.body.data;
  p1.SetLinearVelocity({ x: 0, y: 0 });
  p2.SetLinearVelocity({ x: 0, y: 0 });
  const i1 = { x: lv.door1.sprite.x, y: lv.door1.sprite.y };
  const i2 = { x: lv.door2.sprite.x, y: lv.door2.sprite.y };
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
    win: !!window.__o25aWin,
    st: window.Phaser.GAMES[0].state.current,
    d1: (() => { const d = window.Phaser.GAMES[0].level?.door1; return d ? { open: !!d.isOpen, up: !!d.isUp, frac: + (d.currentFrac ?? -1).toFixed(1) } : null; })(),
    d2: (() => { const d = window.Phaser.GAMES[0].level?.door2; return d ? { open: !!d.isOpen, up: !!d.isUp, frac: + (d.currentFrac ?? -1).toFixed(1) } : null; })(),
  }));
  rec = rec.concat(s.rec);
  if (s.st === "endGame" || s.win) { rec.push(["FINAL", s]); break; }
  if (i === 39) rec.push(["FINAL", s]);
}
const out = { rec };
writeFileSync(join(HERE, "p3c-doorstate.json"), JSON.stringify(out, null, 1));
log(JSON.stringify(out).slice(0, 1500));
await browser.close();
