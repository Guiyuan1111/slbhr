// f02-lever.mjs — oracle fairies-01 lever l0 触发方式逐项实测（只读 oracle；页内闭环控制+传送隔离）
// 用法: node f02-lever.mjs [case ...]   无参 = 全部用例
// 产出: TEMP/fw-of-1/f02-<case>.json
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8875/index.htm";
const OUTDIR = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-of-1";

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

// 控制器：帧定步长 + 程序队列（teleport/jump/walk/fdrag/waitf）+ 逐帧采样
const INSTALL = `(function () {
  var g = Phaser.GAMES[0];
  var plugin = g.physics.box2d;
  var h = window.__h = { t: 0, samples: [], events: [], installed: false, done: false,
    prog: null, idx: 0, st: null, minTopFb: 1e9, minTopWg: 1e9 };
  var timer = setInterval(function () {
    var pl = g.physics && g.physics.box2d;
    if (!pl || h.installed) return;
    clearInterval(timer);
    h.installed = true;
    h.cur = pl.update;
    Object.defineProperty(pl, 'update', {
      configurable: true,
      get: function () {
        return function () {
          this.game.time.elapsed = 1000 / 60; // 定步长 60Hz
          var r = h.cur.apply(this, arguments);
          try { step(); } catch (e) { h.err = String(e); }
          return r;
        };
      },
      set: function (v) { h.cur = v; },
    });
  }, 8);

  var levBody = null;
  function lever() {
    var L = g.level;
    if (!levBody && L && L.objects) {
      var o = L.objects.filter(function (x) { return x.options && x.options.type === 'lever'; })[0];
      if (o) levBody = o;
    }
    return levBody;
  }
  function pers(k) { var L = g.level; return k === 'wg' ? L.pers2 : L.pers1; }
  function V(x, y) { return new box2d.b2Vec2(x, y); }

  function beginStep(s) {
    h.st = { t0: h.t, jumped: false, wait: s.f || 0 };
    h.events.push({ f: h.t, op: s.op, x: s.x, yFeet: s.yFeet, vx: s.vx });
  }
  function tick(s) {
    var st = h.st;
    if (s.op === 'waitf') { if (h.t - st.t0 >= s.f) advance(); return; }
    if (s.op === 'teleport') {
      var P = pers(s.who || 'fb');
      P.body.data.SetPosition(V(-s.x / 32, -(s.yFeet - 35.5) / 32));
      P.body.data.SetLinearVelocity(V(0, 0));
      P.body.data.SetAwake(true);
      advance(); return;
    }
    if (s.op === 'jump') {
      var P = pers(s.who || 'fb');
      P.body.data.SetLinearVelocity(V(s.vx || 0, s.vy || 16.5));
      advance(); return;
    }
    if (s.op === 'walk') {
      var P = pers(s.who || 'fb');
      P.body.data.SetLinearVelocity(V(s.vx, P.body.data.GetLinearVelocity().y));
      var p = P.body.data.GetPosition();
      var x = -p.x * 32;
      if (s.until != null && (s.vx < 0 ? x >= s.until : x <= s.until)) { advance(); return; }
      if (h.t - st.t0 >= (s.or || 600)) { advance(); return; }
      return;
    }
    if (s.op === 'fdrag') {
      var L = g.level;
      var fy = L.fairies[s.fy || 0];
      fy.dragging = true;
      fy.dragTarget.x = -s.x / 32; fy.dragTarget.y = -s.y / 32;
      if (h.t - st.t0 >= (s.f || 300)) advance();
      return;
    }
    if (s.op === 'tpfairy') {
      var L2 = g.level;
      var fy2 = L2.fairies[s.fy || 0];
      var pp = new box2d.b2Vec2(-s.x / 32, -s.y / 32);
      fy2.body.data.SetPosition(pp);
      fy2.body.data.SetLinearVelocity(new box2d.b2Vec2(0, 0));
      fy2.anchor.SetPosition(pp);
      fy2.anchor.SetLinearVelocity(new box2d.b2Vec2(0, 0));
      fy2.elbow.SetPosition(new box2d.b2Vec2(pp.x, pp.y + 0.5));
      fy2.dragTarget.x = pp.x; fy2.dragTarget.y = pp.y;
      advance();
      return;
    }
    advance();
  }
  function advance() { h.idx++; h.st = null; }

  function step() {
    var g2 = g, L = g.level;
    if (!L || !L.loadCompleted || !L.pers1 || plugin.paused) return;
    h.t++;
    // 程序
    if (h.prog) {
      if (!h.st && h.idx < h.prog.length) beginStep(h.prog[h.idx]);
      if (h.st && h.idx < h.prog.length) tick(h.prog[h.idx]);
      if (h.idx >= h.prog.length && !h.done) { h.done = true; h.events.push({ f: h.t, op: 'PROG-DONE' }); }
    }
    // 采样
    function rec(P) {
      var p = P.body.data.GetPosition(), v = P.body.data.GetLinearVelocity();
      return { x: Math.round(-p.x * 32 * 100) / 100, y: Math.round(-p.y * 32 * 100) / 100, vx: Math.round(v.x * 32 * 10) / 10, vy: Math.round(-v.y * 32 * 10) / 10, dead: !!P.isDead };
    }
    var s = { f: h.t };
    if (h.t % 2 === 0 || h.t < 60) {
      s.fb = rec(L.pers1); s.wg = rec(L.pers2);
      h.minTopFb = Math.min(h.minTopFb, s.fb.y - 64);
    }
    var lv = lever();
    if (lv) {
      s.lev = { st: lv.state, deg: Math.round(lv.joint.GetJointAngleRadians() * 180 / Math.PI * 10) / 10 };
      var lp = lv.body.data.GetPosition();
      var fb = L.pers1.body.data.GetPosition();
      s.levDist = Math.round(Math.hypot(-lp.x * 32 - -fb.x * 32, -lp.y * 32 - -fb.y * 32) * 10) / 10;
    }
    (L.objects || []).forEach(function (o, i) {
      var t = o.options && o.options.type;
      if (t === 'platform') { var p = o.body.data.GetPosition(); s['p' + i] = Math.round(-p.y * 32 * 10) / 10; }
      if (t === 'fairycup') { s['cup' + i] = { st: o.state, n: o.currentFairies.length }; }
    });
    s.win = !!(L.door1 && L.door1.isUp && L.door2 && L.door2.isUp);
    h.samples.push(s);
  }
  return 'installed';
})()`;

const DUMP_FIXTURES = `(function () {
  var g = Phaser.GAMES[0];
  var L = g.level;
  var out = { leverFixtures: [], charFixtures: [] };
  var lv = L.objects.filter(function (o) { return o.options.type === 'lever'; })[0];
  var b = lv.body.data;
  for (var f = b.GetFixtureList(); f; f = f.GetNext()) {
    var sh = f.GetShape();
    if (sh.GetType() === box2d.b2ShapeType.e_polygonShape) {
      var vs = [];
      for (var i = 0; i < sh.m_vertices.length; i++) {
        var w = b.GetWorldPoint(sh.m_vertices[i], new box2d.b2Vec2());
        vs.push([Math.round(-w.x * 32 * 100) / 100, Math.round(-w.y * 32 * 100) / 100]);
      }
      out.leverFixtures.push({ kind: 'poly', vs: vs, cat: f.GetFilterData().categoryBits, mask: f.GetFilterData().maskBits, density: f.GetDensity() });
    } else if (sh.GetType() === box2d.b2ShapeType.e_circleShape) {
      var w2 = b.GetWorldPoint(sh.m_p, new box2d.b2Vec2());
      var rr = sh.GetRadius ? sh.GetRadius() : sh.m_radius;
      out.leverFixtures.push({ kind: 'circle', c: [Math.round(-w2.x * 32 * 100) / 100, Math.round(-w2.y * 32 * 100) / 100], r: Math.round(rr * 32 * 100) / 100, cat: f.GetFilterData().categoryBits, mask: f.GetFilterData().maskBits, density: f.GetDensity() });
    }
  }
  out.leverMass = Math.round(b.GetMass() * 1e4) / 1e4;
  var P = L.pers1;
  var pb = P.body.data;
  for (var f2 = pb.GetFixtureList(); f2; f2 = f2.GetNext()) {
    var sh2 = f2.GetShape();
    if (sh2.GetType() === box2d.b2ShapeType.e_polygonShape) {
      var vs2 = [];
      for (var j = 0; j < sh2.m_vertices.length; j++) {
        var w3 = pb.GetWorldPoint(sh2.m_vertices[j], new box2d.b2Vec2());
        vs2.push([Math.round(-w3.x * 32 * 100) / 100, Math.round(-w3.y * 32 * 100) / 100]);
      }
      out.charFixtures.push({ kind: 'poly', vs: vs2, cat: f2.GetFilterData().categoryBits, mask: f2.GetFilterData().maskBits });
    }
  }
  return out;
})()`;

// 汇总一行结论
function summarize(name, data) {
  const s = data.samples;
  const levFiredAt = s.find((x) => x.lev && x.lev.st === 1);
  const p3 = s.map((x) => x.p6).filter((v) => v != null);
  const minTop = data.minTopFb == null ? null : Math.round(data.minTopFb * 10) / 10;
  const lastFb = [...s].reverse().find((x) => x.fb);
  const minLevDist = Math.min(...s.map((x) => x.levDist).filter((v) => v != null));
  console.log(`[${name}] frames=${s.length} levFired=${levFiredAt ? 'YES@f' + levFiredAt.f : 'no'} levDegLast=${s[s.length - 1].lev && s[s.length - 1].lev.deg} p3y[${Math.min(...p3)}..${Math.max(...p3)}] fbMinTop=${minTop} minLevDist=${Math.round(minLevDist * 10) / 10} fbDead=${lastFb && lastFb.fb.dead} fbEnd=${JSON.stringify(lastFb && lastFb.fb)}`);
}

async function runCase(browser, name, prog) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => { const t = String(e); if (!t.includes("4399")) console.log(`[${name}] pageerror:`, t.slice(0, 400)); });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(READY, null, { timeout: 90000, polling: 250 });
  await page.waitForFunction("Phaser.GAMES[0].state.current === 'menu'", null, { timeout: 60000, polling: 100 }).catch(() => console.log(`[${name}] state never reached menu (current=?)`));
  await page.waitForTimeout(1500); // 等 menu 收尾，避免 state 竞态
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 60000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 50 });
  const fx = await page.evaluate(DUMP_FIXTURES);
  await page.evaluate(INSTALL);
  await page.evaluate(`(function(){ window.__h.prog = ${JSON.stringify(prog)}; })()`);
  await page.waitForFunction("window.__h && window.__h.done", null, { timeout: 180000, polling: 100 });
  await page.waitForTimeout(400);
  const data = await page.evaluate("({ samples: window.__h.samples, events: window.__h.events, minTopFb: window.__h.minTopFb, err: window.__h.err })");
  data.fixtures = fx;
  writeFileSync(`${OUTDIR}/f02-${name}.json`, JSON.stringify(data));
  summarize(name, data);
  await page.close();
  return data;
}

const TP = (x, yFeet) => ({ op: "teleport", x, yFeet });
const WAIT = (f) => ({ op: "waitf", f });
const JMP = (vx, vy) => ({ op: "jump", vx: vx || 0, vy: vy || 16.5 });
const WALK = (vx, until, or) => ({ op: "walk", vx, until, or });

async function main() {
  mkdirSync(OUTDIR, { recursive: true });
  const only = process.argv.slice(2);
  const want = (n) => only.length === 0 || only.some((a) => n.startsWith(a));
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });

  const cases = [];
  // A 组：R21L(672) 下方跳顶撞（文档化「不可达」）
  for (const x of [284, 290, 296, 302]) {
    cases.push({
      name: `A-r21jump-x${x}`,
      prog: [TP(x, 672), WAIT(40), JMP(0), WAIT(1), { op: "waitf", f: 200 }],
    });
  }
  // A2 组：R21L 跳+东漂/西漂
  cases.push({ name: "A2-r21jump-driftE", prog: [TP(288, 672), WAIT(40), JMP(2.5), WAIT(1), { op: "waitf", f: 200 }] });
  cases.push({ name: "A2-r21jump-driftW", prog: [TP(300, 672), WAIT(40), JMP(-2.5), WAIT(1), { op: "waitf", f: 200 }] });
  // B 组：R17L 东坡尖 (256-288, 544-576) 直跳——杆西面被升穿
  for (const x of [270, 278, 284, 290]) {
    cases.push({ name: `B-slopejump-x${x}`, prog: [TP(x, 560), WAIT(40), JMP(0), WAIT(1), { op: "waitf", f: 260 }] });
  }
  cases.push({ name: "B-slopejump-x284-driftE", prog: [TP(284, 560), WAIT(40), JMP(2.0), WAIT(1), { op: "waitf", f: 260 }] });
  // C 组：R13L(416) 步行推杆（西行/东行）
  cases.push({ name: "C-r13walkW", prog: [TP(360, 416), WAIT(30), WALK(8.5, 200, 400), { op: "waitf", f: 260 }] });
  cases.push({ name: "C-r13walkE", prog: [TP(240, 416), WAIT(30), WALK(-8.5, 330, 400), { op: "waitf", f: 260 }] });
  // D 组：仙女推杆（传送仙女至杆东近旁再向西推，隔离路径因素）
  cases.push({ name: "D-fairy-tp-push", prog: [WAIT(20), { op: "tpfairy", x: 340, y: 400 }, WAIT(20), { op: "fdrag", x: 268, y: 402, f: 300 }, { op: "fdrag", x: 268, y: 402, f: 300 }, { op: "fdrag", x: 276, y: 412, f: 300 }, { op: "waitf", f: 120 }] });

  for (const c of cases) {
    if (!want(c.name)) continue;
    try {
      await runCase(browser, c.name, c.prog);
    } catch (e) {
      console.error(`[${c.name}] FAILED:`, String(e).slice(0, 300));
    }
  }
  await browser.close();
}
main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });
