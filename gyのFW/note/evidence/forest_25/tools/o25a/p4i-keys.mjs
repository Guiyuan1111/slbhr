/** p4i：合成 KeyboardEvent 是否被 Phaser.Keyboard 处理（对照 CDP 键） */
import { openGame, enterLevel } from "./lib.mjs";
const { browser, page } = await openGame();
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });

const probe = async (label) => {
  const r = await page.evaluate(async (label) => {
    const g = window.Phaser.GAMES[0];
    const send = (code, down) => {
      for (const tgt of [window, document]) {
        const ev = new KeyboardEvent(down ? "keydown" : "keyup", { bubbles: true, cancelable: true });
        Object.defineProperty(ev, "keyCode", { get: () => code });
        Object.defineProperty(ev, "which", { get: () => code });
        tgt.dispatchEvent(ev);
      }
    };
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const p2 = g.level.pers2.body.data;
    p2.SetLinearVelocity({ x: 0, y: 0 });
    p2.SetAwake(true);
    await wait(300);
    const before = { x: -32 * p2.GetPosition().x, kd: g.input.keyboard.isDown(65, 0) };
    send(65, true); // 合成 A down
    await wait(600);
    const midSyn = { x: +(-32 * p2.GetPosition().x).toFixed(1), kd: g.input.keyboard.isDown(65, 0) };
    send(65, false);
    await wait(200);
    return { label, before: { x: +before.x.toFixed(1), kd: before.kd }, midSyn, note: "isDown(keycode,0)" };
  }, label);
  console.log(JSON.stringify(r));
};

await probe("synthetic-A");
// 对照：CDP 真键
await page.keyboard.down("KeyA");
await page.waitForTimeout(600);
const r2 = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const p2 = g.level.pers2.body.data;
  return { label: "cdp-A", x: +(-32 * p2.GetPosition().x).toFixed(1), kd: g.input.keyboard.isDown(65, 0) };
});
console.log(JSON.stringify(r2));
await page.keyboard.up("KeyA");
await browser.close();
