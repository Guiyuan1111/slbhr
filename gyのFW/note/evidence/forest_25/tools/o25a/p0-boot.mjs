/**
 * p0-boot：oracle 实机管道探针。boot→menu→skipToLevel(forest_25)→采样角色坐标 3 秒。
 * 产出：TEMP/o25a/p0-boot.json（环境事实 + 初始采样）。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, attachSampler, WG, FB } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const out = { steps: [] };
const log = (m) => console.log(`[p0] ${m}`);

const { browser, page } = await openGame();
log("boot+menu OK");
out.steps.push({ step: "boot", ok: true });

// 环境事实
out.env = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  return {
    states: Object.keys(g.state.states),
    current: g.state.current,
    renderType: g.renderType, // CANVAS=1? Phaser: AUTO=0? 记录原始值
    gameConfig: g.gameConfig,
    hasLevelState: !!g.state.states.level,
    fps: g.time.advancedTiming ? g.time.fps : null,
    mpx: g.physics?.box2d && typeof g.physics.box2d.mpx === "function" ? g.physics.box2d.mpx(-1) : "n/a-at-menu", // mpx(-1) 应=32 若 px=-32x
    ptm: g.physics?.box2d?.ptm ? g.physics.box2d.ptm(-32) : "n/a-at-menu",
  };
});
log(`env: ${JSON.stringify(out.env)}`);

// 进 forest_25（temple.json 条目 id:25, _id:29）
await enterLevel(page, "forest/levels/forest_25.json", 25, 0);
log("level 25 entered, levelStarted=true");
out.steps.push({ step: "enterLevel", ok: true });

out.level = await page.evaluate(() => {
  const g = window.Phaser.GAMES[0];
  const lv = g.level;
  const pos = (p) => {
    const r = p.body.data.GetPosition();
    return { m: [+r.x.toFixed(3), +r.y.toFixed(3)], px: [-32 * r.x, -32 * r.y].map((v) => +v.toFixed(1)) };
  };
  const spr = (p) => ({ x: +p.sprite.x.toFixed(1), y: +p.sprite.y.toFixed(1) });
  return {
    current: g.state.current,
    levelStarted: lv.levelStarted,
    paused: g.physics.box2d.paused,
    wgPos: pos(lv.pers2),
    wgSprite: spr(lv.pers2),
    fbPos: pos(lv.pers1),
    fbSprite: spr(lv.pers1),
    wgChar: lv.pers2.char,
    fbChar: lv.pers1.char,
    fps: g.time.fps,
    elapsed: g.time.elapsed,
  };
});
log(`level facts: ${JSON.stringify(out.level)}`);

// 采样 3 秒，无输入（静置）
const sampler = await attachSampler(page);
await page.waitForTimeout(3000);
out.samplesIdle = await sampler.drain();
log(`idle samples: ${out.samplesIdle.length}, last=${JSON.stringify(out.samplesIdle[out.samplesIdle.length - 1])}`);

// 按 D（wg 右）1.5 秒看移动方向
await page.keyboard.down(WG.right);
await page.waitForTimeout(1500);
await page.keyboard.up(WG.right);
out.samplesRun = await sampler.drain();
const last = out.samplesRun[out.samplesRun.length - 1];
log(`after D 1.5s: wg=${JSON.stringify(last?.wg)} samples=${out.samplesRun.length}`);
out.steps.push({ step: "probeD", ok: true, wgAfter: last?.wg });

// 截图留证
await page.screenshot({ path: join(HERE, "p0-boot.png") });

// WIN 探针验证不在此（本关按裁定不可解），只验证 state.current 仍为 level
out.stateAfter = await page.evaluate(() => window.Phaser.GAMES[0].state.current);

writeFileSync(join(HERE, "p0-boot.json"), JSON.stringify(out, null, 1));
log("written p0-boot.json");
await browser.close();
