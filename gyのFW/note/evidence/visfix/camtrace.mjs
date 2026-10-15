// 相机轨迹采样：won 全程每 500ms 记 camX/camY/zoom/frozen + 角色快照
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { ROOT, enterAs, waitForStarted, readRole, roomState, startServer } from "../../scripts/e2e/lib.mjs";
const PORT = 3593, LEVEL = "forest_01";
const routeDoc = JSON.parse(readFileSync(join(ROOT, "scripts/e2e/inputs/routes/forest_01.json"), "utf8"));
const MS_PER_F = 1000 / routeDoc.tickHz, TOTAL_MS = routeDoc.totalFrames * MS_PER_F;
const KEYS = { fb: { up: "ArrowUp", left: "ArrowLeft", right: "ArrowRight" }, wg: { up: "KeyW", left: "KeyA", right: "KeyD" } };
const child = startServer(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let up = false;
for (let i = 0; i < 60 && !up; i++) { await sleep(500); try { const r = await fetch(`http://127.0.0.1:${PORT}/`); up = r.ok; } catch {} }
if (!up) throw new Error("server not up");
const browserA = await chromium.launch({ channel: "msedge", headless: true, args: ["--mute-audio", "--js-flags=--max-semi-space-size=64"] });
const browserB = await chromium.launch({ channel: "msedge", headless: true, args: ["--mute-audio", "--js-flags=--max-semi-space-size=64"] });
const a = await browserA.newPage(), b = await browserB.newPage();
await a.setViewportSize({ width: 1400, height: 1000 }); await b.setViewportSize({ width: 1400, height: 1000 });
const code = await enterAs(a, PORT, "create", "", LEVEL);
await a.evaluate(() => { window.__fwPhaseT = {}; const watch = () => { try { const ph = String(window.__fwInit.net.room.state.phase); if (ph && !(ph in window.__fwPhaseT)) window.__fwPhaseT[ph] = Date.now(); if (window.__fwPhaseT.started) return; } catch {} requestAnimationFrame(watch); }; requestAnimationFrame(watch); });
const joinedB = Date.now();
await enterAs(b, PORT, "join", code, LEVEL);
for (let i = 0; i < 5; i++) { await a.keyboard.down("Shift"); await a.keyboard.up("Shift"); await b.keyboard.down("Shift"); await b.keyboard.up("Shift"); }
await waitForStarted(a); await waitForStarted(b);
const phaseT = await a.evaluate(() => window.__fwPhaseT);
const t0 = typeof phaseT?.started === "number" ? phaseT.started : joinedB + 2000;
const EPOCH = performance.now() - Date.now();
async function sleepPrecise(page, until) { for (;;) { const el = performance.now() - EPOCH - t0; const w = until - el; if (w <= 0) return; if (w > 45) await page.waitForTimeout(Math.min(w - 40, 120)); else { const s = performance.now(); while (performance.now() - s < w) {} return; } } }
const tl = [];
for (const [role, tag] of [["fb", "a"], ["wg", "b"]]) for (const ev of routeDoc[role]) tl.push({ t: Math.round(ev.f * MS_PER_F) - 10, page: tag, key: KEYS[role][ev.dir], type: ev.type });
tl.sort((x, y) => x.t - y.t || (x.type === "up" ? -1 : 1));
const dispatch = (async () => { for (const ev of tl) { await sleepPrecise(a, ev.t - 130); await sleepPrecise(a, ev.t); const pg = ev.page === "a" ? a : b; await pg.keyboard[ev.type](ev.key); } })();
const log = [];
const deadline = Date.now() + TOTAL_MS + 15000;
let won = false;
while (Date.now() < deadline) {
  await a.waitForTimeout(400);
  const snap = await a.evaluate(() => {
    try {
      const s = window.__fwInit.net.room.state;
      const g = window.__fw, gs = g && g.scene && g.scene.getScene("Game");
      const cam = gs ? gs.cameras.main : null;
      const fb = s.players.get("fireboy"), wg = s.players.get("watergirl");
      return { ph: String(s.phase), t: s.timerMs, cam: cam ? { z: +cam.zoom.toFixed(3), sx: +cam.scrollX.toFixed(0), sy: +cam.scrollY.toFixed(0) } : null, fb: fb ? [fb.x, fb.y] : null, wg: wg ? [wg.x, wg.y] : null };
    } catch (e) { return { err: String(e) }; }
  });
  log.push({ at: Date.now() - t0, ...snap });
  if (snap.ph === "won" || snap.ph === "gameover") { won = snap.ph === "won"; break; }
}
await dispatch;
await sleep(6500);
const fin = await a.evaluate(() => { try { const g = window.__fw, gs = g.scene.getScene("Game"); const cam = gs.cameras.main; const s = window.__fwInit.net.room.state; const fb = s.players.get("fireboy"), wg = s.players.get("watergirl"); return { ph: String(s.phase), cam: { z: cam.zoom, sx: cam.scrollX, sy: cam.scrollY }, frozen: gs.camFrozen === undefined ? "?" : gs.camFrozen, fb: [fb?.x, fb?.y], wg: [wg?.x, wg?.y] }; } catch (e) { return { err: String(e) }; } });
log.push({ at: Date.now() - t0, final: fin });
writeFileSync("TEMP/visfix/camtrace.json", JSON.stringify(log, null, 1));
console.log("won:", won, " final:", JSON.stringify(fin));
for (const e of log.filter((x) => x.cam || x.final).slice(0, 40)) console.log(JSON.stringify(e));
await browserA.close(); await browserB.close();
process.exit(0);
