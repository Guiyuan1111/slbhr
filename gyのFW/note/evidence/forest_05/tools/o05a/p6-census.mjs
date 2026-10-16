/**
 * p6-census：实验 C（未建模机制普查）——会话级恢复版。
 * 已知毛刺（本档如实记录）：部分会话在开局后 5-12s 随机"自发性双门胜利"（state→endGame，
 * 双角吸入门位），此后该页面僵尸化（retry/skipToLevel 均不可恢复）。
 * 缓解（实证有效）：进关后 ~1s 内立即 level.retry()（p4/p4b/p5 三会话 320+ 试次零事发）；
 * 会话级兜底：致命失败→整浏览器重启（最多 2 次）。
 *  C0 tween 扫掠（机会性）；C1 驻东普查网格；C2 高速横穿；C4 x=700 满跳×5；C3 反向 tween。
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, enterLevel, attachSampler, WG, FB } from "./lib.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`[p6] ${m}`);
const sleep = (ms) => page.waitForTimeout(ms);
const FLOOR_CORE = 860.54;

const out = { C0: null, C1: [], C2: [], C3: null, C4: [], anomalies: [], sessions: 0 };

let browser, page, sampler, readWorld, tpWg, tpFbRaw, ensureLevel, fbFlipTo, fullSetup, analyze, setupCount;

async function newSession() {
  out.sessions++;
  log(`=== SESSION ${out.sessions} ===`);
  ({ browser, page } = await openGame());
  await enterLevel(page, "forest/levels/forest_05.json", 5, 0);
  await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
  await page.waitForTimeout(4000); // p4 家族实证时序：4s 静默 → attach → fullSetup 内 ~5s 单次 retry
  sampler = await attachSampler(page);
  // 自发胜利取证钩子：挂 Level 原型（retry 存活）
  await page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    window.__o05aWin = null;
    const proto = Object.getPrototypeOf(g.level);
    if (!proto.__o05aHooked) {
      const oa = proto.animateFinish;
      proto.animateFinish = function () {
        if (!window.__o05aWin) {
          const rec = { stack: String(new Error().stack || "").split("\n").slice(0, 10), doors: null, wg: null, fb: null, now: g.time.now };
          try { rec.doors = [this.door1.isUp, this.door2.isUp]; } catch {}
          try { const a = this.pers2.body.data.GetPosition(); rec.wg = [+(-32 * a.x).toFixed(1), +(-32 * a.y).toFixed(1)]; } catch {}
          try { const b = this.pers1.body.data.GetPosition(); rec.fb = [+(-32 * b.x).toFixed(1), +(-32 * b.y).toFixed(1)]; } catch {}
          window.__o05aWin = rec;
        }
        return oa.apply(this, arguments);
      };
      proto.__o05aHooked = true;
    }
  });

  readWorld = () =>
    page.evaluate(() => {
      const g = window.Phaser.GAMES[0];
      const lv = g.level;
      const px = (m) => -32 * m;
      const grab = (p) => {
        if (!p || !p.body || !p.body.data) return null;
        const d = p.body.data, pos = d.GetPosition(), v = d.GetLinearVelocity();
        if (!pos) return null;
        return { x: +px(pos.x).toFixed(2), y: +px(pos.y).toFixed(2), vx: +(px(v.x)).toFixed(2), vy: +(px(v.y)).toFixed(2), awake: d.IsAwake() };
      };
      const grp = g.MechManager?.deviceGroups?.[3];
      const lever = grp?.find((d) => d.options?.type === "lever");
      const p3 = grp?.find((d) => d.options?.type === "platform");
      const pp = p3?.body?.data?.GetPosition();
      return { st: g.state.current, wg: grab(lv?.pers2), fb: grab(lv?.pers1), lever: lever ? lever.state : null, p3x: pp ? +px(pp.x).toFixed(2) : null, paused: g.physics.box2d.paused };
    });

  tpWg = async (x, y0 = FLOOR_CORE) => {
    await page.evaluate(({ xx, yy }) => {
      const g = window.Phaser.GAMES[0];
      const d = g.level.pers2.body.data;
      d.SetAwake(true);
      d.SetLinearVelocity({ x: 0, y: 0 });
      d.SetPosition({ x: -xx / 32, y: -yy / 32 });
    }, { x, y: y0 });
    for (let i = 0; i < 30; i++) {
      await sleep(50);
      const s = await readWorld();
      if (!s.wg) return null;
      if (!s.wg.awake || (s.wg.vy === 0 && Math.abs(s.wg.y - y0) < 0.6 && Math.abs(s.wg.x - x) < 2.5)) return s.wg;
    }
    return (await readWorld()).wg;
  };

  tpFbRaw = async (x, y0) => {
    await page.evaluate(({ xx, yy }) => {
      const g = window.Phaser.GAMES[0];
      const d = g.level.pers1.body.data;
      d.SetAwake(true);
      d.SetLinearVelocity({ x: 0, y: 0 });
      d.SetPosition({ x: -xx / 32, y: -yy / 32 });
    }, { x, y: y0 });
    await sleep(400);
  };

  ensureLevel = async () => {
    await page.evaluate(() => { try { window.Phaser.GAMES[0].level.retry(); } catch {} });
    await page.waitForFunction(() => {
      const g = window.Phaser.GAMES[0];
      return g.state.current === "level" && !!g.level?.pers2 && g.level.levelStarted;
    }, { timeout: 30000 });
    await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
    await sleep(1500);
    return true;
  };

  // p4b 逐字版 fullSetup（实证免疫自发胜利毛刺）；仅加 doorSnap 探测
  setupCount = 0;
  fullSetup = async () => {
    setupCount++;
    log(`RECOVER/SETUP #${setupCount}`);
    const st = await page.evaluate(() => window.Phaser.GAMES[0].state.current);
    if (st === "level") await page.evaluate(() => { window.Phaser.GAMES[0].level.retry(); });
    else return false;
    await page.waitForFunction(() => {
      const g = window.Phaser.GAMES[0];
      return g.state.current === "level" && !!g.level?.pers1 && !!g.level?.pers2 && g.level.levelStarted;
    }, { timeout: 30000 });
    await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
    await sleep(2500);
    await page.evaluate(() => {
      const g = window.Phaser.GAMES[0];
      const d = g.level.pers1.body.data;
      d.SetAwake(true);
      d.SetLinearVelocity({ x: 0, y: 0 });
      d.SetPosition({ x: -470 / 32, y: -668.8 / 32 });
    });
    await sleep(500);
    await page.keyboard.down(FB.left);
    await page.waitForFunction(() => {
      const g = window.Phaser.GAMES[0];
      const lever = g.MechManager.deviceGroups[3].find((d) => d.options?.type === "lever");
      return lever.state === 1;
    }, { timeout: 8000 });
    await sleep(300);
    await page.keyboard.up(FB.left).catch(() => {});
    await page.waitForFunction(() => {
      const g = window.Phaser.GAMES[0];
      const p3 = g.MechManager.deviceGroups[3].find((d) => d.options?.type === "platform");
      const v = p3.body.data.GetLinearVelocity();
      return Math.abs(-32 * v.x) < 0.5 && -32 * p3.body.data.GetPosition().x > 690;
    }, { timeout: 8000 });
    await page.evaluate(() => {
      const g = window.Phaser.GAMES[0];
      const d = g.level.pers1.body.data;
      d.SetAwake(true);
      d.SetLinearVelocity({ x: 0, y: 0 });
      d.SetPosition({ x: -1010 / 32, y: -508.8 / 32 });
    });
    await sleep(600);
    const w2 = await readWorld();
    const doorSnap = w2.wg && Math.abs(w2.wg.x - 304) < 40 && Math.abs(w2.wg.y - 548) < 12;
    if (doorSnap) { log("SELF-WIN glitch detected (wg at door)"); return false; }
    if (w2.wg && w2.lever === 1 && Math.abs((w2.p3x ?? 0) - 700.26) <= 2) { log("setup ok"); return true; }
    return false;
  };

  analyze = (y0, tr, opt = {}) => {
    const ws = tr.filter((s) => s.wg);
    if (!ws.length) return { empty: true };
    let minY = 9999, jumped = false, takeoffX = null, takeoffVx = null, passThrough = false, minVy = 0;
    const xLo = opt.xLo ?? 632, xHi = opt.xHi ?? 768, yThr = opt.yThr ?? 827;
    for (const s of ws) {
      if (s.wg.vy < -100 && !jumped) { jumped = true; takeoffX = s.wg.x; takeoffVx = s.wg.vx; }
      if (s.wg.y < minY) minY = s.wg.y;
      if (s.wg.y < yThr && s.wg.x > xLo && s.wg.x < xHi) passThrough = true;
      if (s.wg.vy < minVy) minVy = s.wg.vy;
    }
    return { jumped, takeoffX, takeoffVx: +takeoffVx?.toFixed(1), minY: +minY.toFixed(2), rise: +(y0 - minY).toFixed(2), passThrough, minVy: +minVy.toFixed(1) };
  };
}

const closeSession = async () => { try { await browser?.close(); } catch {} };

// ================= 主流程（会话循环） =================
let sessionFails = 0;
let started = false;
while (sessionFails < 3) {
  try {
    if (!started || sessionFails > 0) { await closeSession(); await newSession(); }
    started = true;

    if (!(await fullSetup())) throw new Error("cannot establish latched-east baseline");
    await sampler.drain();

    // ---- C1 ----
    if (out.C1.length < 23) {
      log("C1: census grid");
      const grid = [
        ...[656, 660, 680, 700, 720, 740, 760, 770, 780, 800, 820, 840, 848].map((x) => ({ x, y0: FLOOR_CORE, tag: "floor" })),
        ...[780, 800, 820, 840].map((x) => ({ x, y0: FLOOR_CORE, tag: "under704" })),
        ...[910, 1000, 1100].map((x) => ({ x, y0: 864 - 35.2, tag: "terrace864" })),
        ...[910, 1000].map((x) => ({ x, y0: 544 - 35.2, tag: "ledge544" })),
      ];
      let consecutiveFails = 0;
      for (const g of grid) {
        const stand = await tpWg(g.x, g.y0);
        const w = await readWorld();
        if (!stand || Math.abs(stand.y - g.y0) > 1.5 || w.st !== "level") {
          out.anomalies.push({ grid: g, why: "stand-fail", world: w });
          log(`C1 ${g.tag}@${g.x}: STAND FAIL (st=${w.st} wg=${JSON.stringify(w.wg)})`);
          consecutiveFails = (consecutiveFails ?? 0) + 1;
          if (consecutiveFails >= 3) throw new Error("C1: 3 consecutive stand-fails → session zombie");
          continue;
        }
        consecutiveFails = 0;
        await sampler.drain();
        await page.keyboard.down(WG.up);
        await sleep(35);
        await page.keyboard.up(WG.up);
        await sleep(1600);
        const w2 = await readWorld();
        if (w2.st !== "level" || !w2.wg) {
          out.anomalies.push({ grid: g, why: "post-jump broken", world: w2 });
          throw new Error("C1: post-jump zombie → session relaunch");
        }
        const tr = await sampler.drain();
        const a = analyze(g.y0, tr);
        out.C1.push({ ...g, ...a });
        log(`C1 ${g.tag}@${g.x}: jumped=${a.jumped} rise=${a.rise} minY=${a.minY} pass=${a.passThrough}`);
      }
    }

    // ---- C2 ----
    if (!out.C2.length) {
      log("C2: high-speed crossings");
      const cross = async (startX, key, tag) => {
        const stand = await tpWg(startX);
        if (!stand) { out.anomalies.push({ C2: tag, why: "tp fail" }); throw new Error("C2 tp fail → relaunch"); }
        await sampler.drain();
        await page.keyboard.down(key);
        let t = 0;
        while (t < 600) {
          const s = await readWorld();
          if (!s.wg || s.st !== "level") break;
          if (Math.abs(s.wg.vx) > 240) break;
          await sleep(20); t += 20;
        }
        await page.keyboard.down(WG.up);
        await sleep(40);
        await page.keyboard.up(WG.up);
        await sleep(1300);
        await page.keyboard.up(key).catch(() => {});
        await sleep(400);
        const w = await readWorld();
        if (w.st !== "level" || !w.wg) { out.anomalies.push({ C2: tag, why: "broken", world: w }); throw new Error("C2 broken → relaunch"); }
        const tr = await sampler.drain();
        const a = analyze(FLOOR_CORE, tr);
        out.C2.push({ tag, startX, key: key === WG.left ? "A(west)" : "D(east)", ...a });
        log(`C2 ${tag}: rise=${a.rise} minY=${a.minY} pass=${a.passThrough} takeoffVx=${a.takeoffVx}`);
      };
      for (let i = 1; i <= 3; i++) await cross(795, WG.left, `westRun#${i}`);
      for (let i = 1; i <= 2; i++) await cross(648, WG.right, `eastRun#${i}`);
    }

    // ---- C4 ----
    if (!out.C4.length) {
      log("C4: clean jumps x=700");
      for (let i = 1; i <= 5; i++) {
        const stand = await tpWg(700);
        if (!stand) { out.anomalies.push({ C4: i, why: "tp fail" }); throw new Error("C4 tp fail → relaunch"); }
        await sampler.drain();
        await page.keyboard.down(WG.up);
        await sleep(35);
        await page.keyboard.up(WG.up);
        await sleep(1600);
        const w = await readWorld();
        if (w.st !== "level" || !w.wg) { out.anomalies.push({ C4: i, why: "broken", world: w }); throw new Error("C4 broken → relaunch"); }
        const tr = await sampler.drain();
        const a = analyze(FLOOR_CORE, tr);
        out.C4.push({ i, ...a });
        log(`C4 #${i}: rise=${a.rise} minY=${a.minY}`);
      }
    }

    // ---- C0（机会性）----
    if (!out.C0) {
      log("C0: tween sweep test");
      await page.evaluate(() => { try { window.Phaser.GAMES[0].level.retry(); } catch {} });
      await page.waitForFunction(() => {
        const g = window.Phaser.GAMES[0];
        return g.state.current === "level" && !!g.level?.pers2 && g.level.levelStarted;
      }, { timeout: 30000 });
      await page.waitForFunction(() => !window.Phaser.GAMES[0].physics.box2d.paused, { timeout: 20000 });
      await page.waitForTimeout(9000); // 劫持窗假设：retry 后 ≥9s 再 tp（p4 家族首 tp 实测 +9.5s 无恙）
      const stand = await tpWg(700);
      if (!stand || Math.abs(stand.y - FLOOR_CORE) > 1.5) {
        out.anomalies.push({ C0: "tp fail", world: await readWorld() });
        log("C0 skipped (tp fail)");
        if (!(await fullSetup())) throw new Error("post-C0 recovery fail");
      } else {
        await tpFbRaw(470, 668.8);
        await sleep(300);
        await sampler.drain();
        await page.keyboard.down(FB.left);
        await sleep(450);
        await page.keyboard.down(WG.up);
        await sleep(40);
        await page.keyboard.up(WG.up);
        await sleep(850);
        await page.keyboard.down(WG.up);
        await sleep(40);
        await page.keyboard.up(WG.up);
        await sleep(700);
        await page.keyboard.up(FB.left).catch(() => {});
        try {
          await page.waitForFunction(() => {
            const g = window.Phaser.GAMES[0];
            const p3 = g.MechManager.deviceGroups[3]?.find((d) => d.options?.type === "platform");
            if (!p3) return false;
            return Math.abs(-32 * p3.body.data.GetLinearVelocity().x) < 0.5;
          }, { timeout: 10000 });
        } catch { log("C0 tween wait timeout"); }
        await tpFbRaw(1010, 508.8);
        await sleep(600);
        const tr = await sampler.drain();
        const a = analyze(FLOOR_CORE, tr);
        const w = await readWorld();
        out.C0 = { ...a, finalWorld: { lever: w.lever, p3x: w.p3x, st: w.st } };
        log("C0: " + JSON.stringify(out.C0));
        if (w.lever !== 1 || w.st !== "level") { if (!(await fullSetup())) throw new Error("post-C0 recovery fail"); }
      }
      await sampler.drain();
    }

    // ---- C3 ----
    if (out.C3 === null) {
      log("C3: reverse tween over standing wg");
      // 复位杆2（P3 东→西）
      await ensureLevel(); // 重置后 P3 已回西——不需要复位！直接用新关卡
      const stand = await tpWg(700);
      if (!stand || Math.abs(stand.y - FLOOR_CORE) > 1.5) {
        out.anomalies.push({ C3: "tp fail" });
        log("C3 skipped");
        if (!(await fullSetup())) throw new Error("post-C3 recovery fail");
      } else {
        await tpFbRaw(415, 668.8); // 西704台上、杆2 东侧
        await page.keyboard.down(FB.right);
        await sleep(400);
        await page.keyboard.up(FB.right).catch(() => {});
        await sampler.drain();
        await sleep(2500);
        const tr = await sampler.drain();
        const ws = tr.filter((s) => s.wg);
        let minY = 9999, maxDrift = 0;
        const baseX = ws[0]?.wg.x;
        for (const s of ws) {
          if (s.wg.y < minY) minY = s.wg.y;
          if (baseX != null && Math.abs(s.wg.x - baseX) > maxDrift) maxDrift = Math.abs(s.wg.x - baseX);
        }
        const w = await readWorld();
        out.C3 = { minY: +minY.toFixed(2), riseFromFloor: +(FLOOR_CORE - minY).toFixed(2), maxDrift: +maxDrift.toFixed(1), finalWorld: { lever: w.lever, p3x: w.p3x, wg: w.wg, st: w.st } };
        log("C3: " + JSON.stringify(out.C3));
        if (w.st !== "level") { if (!(await fullSetup())) throw new Error("post-C3 recovery fail"); }
      }
    }

    writeFileSync(join(HERE, "p6-census.json"), JSON.stringify(out, null, 1));
    break; // 全部完成
  } catch (e) {
    sessionFails++;
    out.anomalies.push({ sessionFail: sessionFails, err: String(e).slice(0, 300) });
    log(`SESSION FAIL #${sessionFails}: ${String(e).slice(0, 200)}`);
  }
}
await closeSession();
writeFileSync(join(HERE, "p6-census.json"), JSON.stringify(out, null, 1));
log(`saved p6-census.json (sessions=${out.sessions} sessionFails=${sessionFails})`);
process.exit(0);
