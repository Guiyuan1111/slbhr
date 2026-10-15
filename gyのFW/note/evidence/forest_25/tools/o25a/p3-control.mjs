/**
 * p3-control v2：forest_03 路线重试版——死亡即 retry 重放时间线，最多 N 轮，验证 oracle WIN 机器。
 * 派发偏移 −10ms（route.mjs 门禁调优值：瞄准接受窗中心，抵消 CDP ~2ms+评估抖动）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTE = process.argv[2] ?? "forest_03";
const N = Number(process.argv[3] ?? 5);
const OFFSET = Number(process.argv[4] ?? -10);
const log = (m) => console.log(`[p3] ${m}`);

const doc = JSON.parse(readFileSync(join("/home/gy/桌面/dev/slbhr/gyのFW/scripts", "e2e", "inputs", "routes", `${ROUTE}.json`), "utf8"));
const MS = 1000 / doc.tickHz;
const KEYS = {
  fb: { up: "ArrowUp", left: "ArrowLeft", right: "ArrowRight" },
  wg: { up: "KeyW", left: "KeyA", right: "KeyD" },
};
const events = [];
for (const role of ["fb", "wg"]) {
  for (const ev of doc[role]) events.push({ t: Math.round(ev.f * MS), key: KEYS[role][ev.dir], type: ev.type, f: ev.f, role });
}
events.sort((a, b) => a.t - b.t || (a.type === "up" ? -1 : 1));

const { browser, page } = await openGame();
await enterLevel(page, `forest/levels/${ROUTE}.json`, Number(ROUTE.split("_")[1]), 0);
log("level entered");

const sleep = (ms) => page.waitForTimeout(ms);
const resetProbes = () =>
  page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    window.__o25aWin = null;
    window.__o25aLose = null;
    const lv = g.level;
    if (!lv.__hooked) {
      const ow = lv.gameFinish.bind(lv);
      lv.gameFinish = function () { window.__o25aWin = Date.now(); return ow(); };
      const ol = lv.gameOver.bind(lv);
      lv.gameOver = function () { window.__o25aLose = Date.now(); return ol(); };
      lv.__hooked = true;
    }
  });

const attempts = [];
let won = false;
for (let att = 1; att <= N && !won; att++) {
  if (att > 1) {
    // 死亡重试：gameOver 后 state=endGame → 重新 skipToLevel（gameOver 后 retry 链不稳，直接重建）
    await page.evaluate(() => { window.Phaser.GAMES[0].state.states.menu.skipToLevel(window.Phaser.GAMES[0].level?.levelData ?? { id: 3, filename: "forest/levels/forest_03.json", required: 0, _id: 3, type: "speed" }); });
    await page.waitForFunction(() => {
      const g = window.Phaser.GAMES[0];
      if (g.state.current !== "level" || !g.level?.pers1 || !g.level.levelStarted) return false;
      const r = g.level.pers2.body.data.GetPosition();
      return -32 * r.x > 1000 && !g.physics.box2d.paused;
    }, { timeout: 20000 });
  }
  await resetProbes();
  await sleep(300);
  const t0 = Date.now();
  log(`attempt ${att}: dispatch ${events.length} events`);
  for (const ev of events) {
    const due = t0 + ev.t + OFFSET;
    let now = Date.now();
    while (now < due - 45) { await sleep(Math.min(due - now - 40, 120)); now = Date.now(); }
    while (Date.now() < due) { /* spin */ }
    await page.keyboard[ev.type](ev.key);
    // 中途天亡即止（gameOver 已触发）
    if (await page.evaluate(() => !!window.__o25aLose)) { log(`attempt ${att}: died mid-dispatch @f${ev.f}`); break; }
  }
  // 等胜负（路线 f822 后再给 18s；计时器 25s 兜底）
  for (let i = 0; i < 36; i++) {
    await sleep(500);
    const fin = await page.evaluate(() => ({ w: !!window.__o25aWin, l: !!window.__o25aLose, st: window.Phaser.GAMES[0].state.current }));
    if (fin.w || fin.l || fin.st === "endGame") {
      const pos = await page.evaluate(() => {
        const g = window.Phaser.GAMES[0];
        const p2 = g.level?.pers2, p1 = g.level?.pers1;
        const rp = (p) => { if (!p?.body) return null; const r = p.body.data.GetPosition(); return [+(-32 * r.x).toFixed(0), +(-32 * r.y).toFixed(0)]; };
        return { wg: rp(p2), fb: rp(p1) };
      });
      attempts.push({ att, won: fin.w, died: fin.l, state: fin.st, ...pos });
      log(`attempt ${att}: ${fin.w ? "WIN" : "died"} state=${fin.st} wg=${pos.wg} fb=${pos.fb}`);
      won = fin.w;
      break;
    }
  }
}
const summary = { route: ROUTE, attempts: attempts.length, won, detail: attempts };
writeFileSync(join(HERE, "p3-control.json"), JSON.stringify(summary, null, 1));
log(`SUMMARY ${JSON.stringify(summary)}`);
await browser.close();
process.exit(won ? 0 : 2);
