// f05-pool-pusher.mjs — 两个终判实验（只读 oracle）：
//   case pool : 传送 wg 至水池东缘 (940,928)，向西步行穿水池 [704,928]——wg 是否死于水？
//   case pocket: 传送 wg 入袋 (1195,928)，在袋内 (1150-1245) 来回走+跳 900 帧——pusher(g2) 是否被触发 → p0(objects[1]) 下沉？
//   case pusher: 传送 wg 直接压上 pusher 板面 (1200,824)，观测 p0。
// 产出: TEMP/fw-of-1/f05-<case>.json
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8875/index.htm";
const OUTDIR = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-of-1";
const CASE = process.argv[2] || "pool";

const READY = `(() => { try { var g = Phaser.GAMES[0]; if (!g || !g.progress || !g.progress.get) return false; var ts = g.progress.get('temples'); return !!(ts && ts.length && ts[0].levels && ts[0].levels.length > 5); } catch (e) { return false; } })()`;
const READY_LEVEL = `(() => { try { var L = Phaser.GAMES[0].level; return !!(L && L.loadCompleted && L.pers1 && L.pers1.body && L.pers2 && L.groundBody); } catch { return false; } })()`;
const READY_PHYS = `(() => { try { return Phaser.GAMES[0].physics.box2d.paused === false; } catch { return false; } })()`;
const NAVIGATE = `(function () {
  var g = Phaser.GAMES[0];
  var temple = g.progress.get('temples').find(function (t) { return t.id === 'fairytales'; }) || g.progress.get('temples')[0];
  var levelData = temple.levels.find(function (l) { return l.filename.indexOf('fairies-01') >= 0; });
  g.currentTemple = temple;
  var Level = require('States/Level/Level');
  g.state.add('level', Level);
  g.state.start('level', true, false, JSON.parse(JSON.stringify(levelData)));
  return levelData.filename;
})()`;

const CASE_JSON = {
  pool: { tps: [{ who: "wg", x: 940, yFeet: 928 }], phase: [{ until: 780, vx: -8.5, f: 400 }, { until: 960, vx: 8.5, f: 400 }] },
  pocket: { tps: [{ who: "wg", x: 1195, yFeet: 928 }], phase: [
    { until: 1238, vx: -8.5, f: 200 },
    { until: 1196, vx: 8.5, f: 200 },
    { jump: 1, f: 1 },
    { f: 60 },
    { jump: 1, f: 1 },
    { f: 120 },
    { until: 1160, vx: 8.5, f: 200 },
    { jump: 1, f: 1 },
    { f: 60 },
    { until: 1230, vx: -8.5, f: 200 },
    { jump: 1, f: 1 },
    { f: 120 },
  ] },
  pusher: { tps: [{ who: "wg", x: 1200, yFeet: 794 }], phase: [{ f: 100 }, { walk2: 1, f: 120 }, { f: 200 }] },
}[CASE];

const INSTALL = `(function () {
  var g = Phaser.GAMES[0];
  var plugin = g.physics.box2d;
  var h = window.__h = { t: 0, samples: [], events: [], done: false, prog: ${JSON.stringify(CASE_JSON)}, idx: 0, st: null };
  var timer = setInterval(function () {
    var pl = g.physics && g.physics.box2d;
    if (!pl || h.installed) return;
    clearInterval(timer); h.installed = true; h.cur = pl.update;
    Object.defineProperty(pl, 'update', {
      configurable: true,
      get: function () { var me = this; return function () {
        me.game.time.elapsed = 1000 / 60;
        var r = h.cur.apply(this, arguments);
        try { step.call(this); } catch (e) { h.err = String(e); h.done = true; }
        return r; }; },
      set: function (v) { h.cur = v; },
    });
  }, 8);
  function V(x, y) { return new box2d.b2Vec2(x, y); }
  function wgBody() { return g.level.pers2.body.data; }
  function step() {
    var L = g.level;
    if (!L || !L.loadCompleted || !L.pers2 || plugin.paused) return;
    h.t++;
    var P = wgBody().GetPosition();
    var x = -P.x * 32;
    if (h.t === 30 && h.prog.tps) {
      h.prog.tps.forEach(function (tp) {
        var b = (tp.who === 'wg' ? L.pers2 : L.pers1).body.data;
        b.SetPosition(V(-tp.x / 32, -(tp.yFeet - 35.5) / 32));
        b.SetLinearVelocity(V(0, 0));
        h.events.push({ f: h.t, tp: tp });
      });
    }
    var s = h.prog.phase ? h.prog.phase[h.idx] : null;
    if (s && !h.st) { h.st = { t0: h.t }; h.events.push({ f: h.t, op: s }); }
    if (s && h.st) {
      if (s.vx != null) wgBody().SetLinearVelocity(V(s.vx, wgBody().GetLinearVelocity().y));
      if (s.walk2) wgBody().SetLinearVelocity(V(-3, wgBody().GetLinearVelocity().y));
      if (s.jump) wgBody().SetLinearVelocity(V(wgBody().GetLinearVelocity().x, 16.5));
      if (s.jumpV) wgBody().SetLinearVelocity(V(wgBody().GetLinearVelocity().x, s.jumpV));
      var done = false;
      if (s.until != null) done = (s.vx < 0) ? (x <= s.until) : (x >= s.until);
      if (h.t - h.st.t0 >= (s.f || 300)) done = true;
      if (done) { h.idx++; h.st = null; if (h.idx >= h.prog.phase.length) h.done = true; }
    }
    if (h.t % 2 === 0) {
      var p = wgBody().GetPosition(), v = wgBody().GetLinearVelocity();
      var rec = { f: h.t, wg: { x: Math.round(-p.x * 32 * 10) / 10, y: Math.round(-p.y * 32 * 10) / 10, vy: Math.round(-v.y * 32), dead: !!L.pers2.isDead } };
      try {
        (L.objects || []).forEach(function (o, i) {
          if (o.options && (o.options.type === 'platform') && o.body) {
            var pp = o.body.data.GetPosition();
            rec['p' + i] = Math.round(-pp.y * 32 * 10) / 10;
          }
          if (o.options && o.options.type === 'pusher') rec.pusher = { pressed: !!o.pressed, state: o.state == null ? null : String(o.state), isDown: o.isDown == null ? null : !!o.isDown };
          if (o.options && o.options.type === 'fairycup') rec.cup = o.state + '/' + o.currentFairies.length;
        });
      } catch (e) { rec.err = String(e); }
      rec.ended = !!L.ended;
      h.samples.push(rec);
    }
    if (h.t >= 1200) h.done = true;
  }
  return 'ok';
})()`;

async function main() {
  mkdirSync(OUTDIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(READY, null, { timeout: 90000, polling: 250 });
  await page.waitForFunction("Phaser.GAMES[0].state.current === 'menu'", null, { timeout: 60000, polling: 100 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 60000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 50 });
  await page.evaluate(INSTALL);
  await page.waitForFunction("window.__h && window.__h.done", null, { timeout: 200000, polling: 100 });
  const data = await page.evaluate("({ t: window.__h.t, err: window.__h.err, events: window.__h.events, samples: window.__h.samples })");
  await browser.close();
  writeFileSync(`${OUTDIR}/f05-${CASE}.json`, JSON.stringify(data));
  console.log("case:", CASE, "frames:", data.t, "err:", data.err);
  data.samples.filter((_, i) => i % 5 === 0).forEach((s) => console.log(JSON.stringify(s)));
  const dead = data.samples.find((s) => s.wg.dead);
  console.log(dead ? "WG DEAD at f" + dead.f + " pos=" + JSON.stringify(dead.wg) : "wg alive throughout");
  const p0 = data.samples.map((s) => s.p1);
  console.log("p0(objects[1]) y range:", Math.min(...p0), "-", Math.max(...p0));
  console.log("pusher states:", JSON.stringify(data.samples.map((s) => s.pusher).filter((v, i, a) => JSON.stringify(v) !== JSON.stringify(a[i - 1]))));
}
main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });
