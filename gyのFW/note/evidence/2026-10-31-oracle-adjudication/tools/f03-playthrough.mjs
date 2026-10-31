// f03-playthrough.mjs — oracle fairies-01 全关通关终判 v3（只读 oracle；页内闭环双角色+仙女拖拽）
// 用法: node f03-playthrough.mjs [preset]   preset 缺省 = full
// 产出: TEMP/fw-of-1/f03-<preset>.json + f03-<preset>.png
//
// 坐标/速度约定（oracle box2d world）：world +x = 屏幕西、world +y = 屏幕上；
// SetLinearVelocity 的 x 分量：正值=向屏幕西走，负值=向屏幕东走。char center = feet - 35.5，碰撞顶 ≈ feet-64。
//
// 路线 v3（关键修订：R21L 西缘 r21 c1-c4 开放——双角色直接「走下西缘」落 R17L 西平台(仅 p3 未升区 x32-160
//   可站)，再东漂满跳掠 r13 西坡顶落 R13L，西行穿杆区自然点燃 l0。杠杆/p3 全程只是路过，不构成门槛；
//   仙女唯一职责 = 压杯沉 p1 放行 R25L 西段。东线（越池→bump→R25R→R21R）经 Grid 逐格复核为死路：
//   水池 224px > 满跳 215px 航程，且 r19R(608-640) 对 64px 身位全面封顶——与 03 号档结论一致。）：
//   M0 仙女 (1200,880)→y852-856 走廊西行（p0 顶 866 与 r25 东顶棚 832 之间的带）→杯口 (52.8,888) 长持压杯
//   M1 双角色 R29(928) 东行 x664 → 西向满跳（挑檐净空带 [639,690]）→ 落 R25L(800)≈479
//   M2 双角色 R25L 西行 x118 → 东漂满跳 c5 坡尖(160,704) 圆角捕捉 → 落 R21L(672)≈300
//   M3 双角色 R21L 西行走下西缘 → 坠落 R17L 西平台(544)≈120 → 东漂满跳掠 r13 西坡 → 落 R13L(416)≈305
//   M4 双角色 R13L 西行穿杆区 [280,316] → l0 翻转西限位（p3 沉，与后续无关）→ 西跳上 R10L(320)
//   M5 R10L 东行 x110 → 东漂满跳 r7 西坡捕捉 → 落 R7(224)≈200
//   M6 R7 东行 x396（酸池床 [416,608] 前）→ 满速越酸跳 → 落 R4(128)≈592
//   M7 R4 东行 x878 → 走落东缘(896) 空中推至 x1000 → 落 r9(288)
//   M8 r9 东端 x1005 → 东漂满跳 r6R 西坡(1024,224)-(1056,192) 捕捉 → 落 R6R(192)≈1200
//   M9 fb 西行 1104 / wg 原地 1200 → 双门升起 = WIN（wg 队列整体滞后 320f）
//   M6 R10 东跳 x112 → 落 R7L(224)
//   M7 R7L 东行 x390 满速跳越酸池[416,608] → 落 R4E(128)
//   M8 R4E 东行 x828 跳过岩浆[864,896] → c27 楔 → 东缘走落 → r8 楔 → r9(288)
//   M9 r9 x938 满跳东上 r6R(192) → fb 入门 1104 / wg 入门 1200 → 双门 isUp = WIN
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const GAME_URL = "http://127.0.0.1:8875/index.htm";
const OUTDIR = "/home/gy/桌面/dev/slbhr/gyのFW/TEMP/fw-of-1";
const PRESET = process.argv[2] || "full";

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

const INSTALL = `(function () {
  var g = Phaser.GAMES[0];
  var plugin = g.physics.box2d;
  var h = window.__h = { t: 0, samples: [], events: [], installed: false, done: false, err: null,
    win: null, q: { fb: { steps: [], idx: 0, st: null }, wg: { steps: [], idx: 0, st: null } }, fy: { steps: [], idx: 0, st: { t0: 0 } } };
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
          this.game.time.elapsed = 1000 / 60;
          var r = h.cur.apply(this, arguments);
          try {
            if (this.game.physics.box2d.paused) { // 死亡/过关后引擎暂停：冻结即终
              if (!h.done) { h.done = true; h.doneWhy = 'paused@' + h.t + ' ended=' + (!!g.level && !!g.level.ended); }
            } else step();
          } catch (e) { h.err = String(e) + (e.stack || '').slice(0, 250); h.done = true; }
          return r;
        };
      },
      set: function (v) { h.cur = v; },
    });
  }, 8);

  function V(x, y) { return new box2d.b2Vec2(x, y); }
  function pers(k) { return k === 'wg' ? g.level.pers2 : g.level.pers1; }
  function pos(c) { var p = pers(c).body.data.GetPosition(); return { x: -p.x * 32, y: -p.y * 32 }; }
  function feet(c) { return pos(c).y + 35.5; }
  function vels(c) { var v = pers(c).body.data.GetLinearVelocity(); return { x: v.x * 32, y: -v.y * 32 }; }
  function platY(i) { var o = g.level.objects[i]; return o && o.body ? -o.body.data.GetPosition().y * 32 : null; }

  function begin(k, s) {
    var Q = h.q[k];
    Q.st = { t0: h.t, jumped: false };
    h.events.push({ f: h.t, who: k, op: s.op, s: JSON.parse(JSON.stringify(s)) });
  }
  function done(k) { var Q = h.q[k]; Q.idx++; Q.st = null; }

  function tick(k) {
    var Q = h.q[k], s = Q.steps[Q.idx], st = Q.st;
    var P = pos(k), F = feet(k), VL = vels(k);
    switch (s.op) {
      case 'waitf':
        if (h.t - st.t0 >= s.f) done(k);
        return;
      case 'walk': {
        pers(k).body.data.SetLinearVelocity(V(s.vx, pers(k).body.data.GetLinearVelocity().y));
        var dx = P.x - s.until;
        if ((s.vx < 0 && dx >= 0) || (s.vx > 0 && dx <= 0) || h.t - st.t0 >= (s.or || 600)) done(k);
        return;
      }
      case 'walkJump': { // vx 方向行走至 jumpAt 起跳（一次），空中转 airVx
        var cross = (s.dir < 0) ? (P.x <= s.jumpAt) : (P.x >= s.jumpAt);
        if (!st.jumped && cross) {
          pers(k).body.data.SetLinearVelocity(V(s.airVx, s.vy || 16.5));
          if (s.airHold) Q.hold = { v: s.airVx, until: h.t + s.airHold }; // 空中转身后持续推杆
          st.jumped = true;
          h.events.push({ f: h.t, who: k, op: 'walkJump-FIRED', at: [Math.round(P.x), Math.round(F)] });
          return;
        }
        if (!st.jumped) {
          pers(k).body.data.SetLinearVelocity(V(s.vx, pers(k).body.data.GetLinearVelocity().y));
          var dd = P.x - s.until;
          if ((s.vx < 0 && dd >= 0) || (s.vx > 0 && dd <= 0) || h.t - st.t0 >= (s.or || 400)) done(k);
        } else {
          if (h.t - st.t0 >= (s.or || 400)) done(k);
        }
        return;
      }
      case 'jump':
        pers(k).body.data.SetLinearVelocity(V(s.vx || 0, s.vy || 16.5));
        // 空中按住方向键（oracle 实测：无逐帧速度重写时漂移指数衰减 ×~0.755/帧，纯惯性跳必短距）
        if (s.hold) Q.hold = { v: s.vx || 0, until: h.t + s.hold };
        done(k);
        return;
      case 'waitfeet': { // 等落到 [minY,maxY] 脚高带且速度趋零
        if (F <= s.maxY && F >= (s.minY || -1e9) && Math.abs(VL.y) < (s.vyTol != null ? s.vyTol : 60)) { done(k); return; }
        if (h.t - st.t0 >= (s.or || 400)) done(k);
        return;
      }
      case 'waitx': {
        if ((s.dir < 0 && P.x <= s.until) || (s.dir > 0 && P.x >= s.until)) { done(k); return; }
        if (h.t - st.t0 >= (s.or || 400)) done(k);
        return;
      }
      case 'waitLev': { // 等 lever l0 翻转（仙女压杆）
        var lv2 = g.level.objects.filter(function (o) { return o.options.type === 'lever'; })[0];
        if (lv2 && lv2.state === 1) { done(k); return; }
        if (h.t - st.t0 >= (s.or || 5000)) done(k);
        return;
      }
      case 'waitp3': { // 等 p3(objects[6]) 沉到位
        var py = platY(6);
        if (py != null && py >= (s.y || 618)) { done(k); return; }
        if (h.t - st.t0 >= (s.or || 900)) done(k);
        return;
      }
      case 'waitp1': { // 等 p1(objects[2]) 沉到位（仙女入杯后）
        var py1 = platY(2);
        if (py1 != null && py1 >= (s.y || 860)) { done(k); return; }
        if (h.t - st.t0 >= (s.or || 3000)) done(k);
        return;
      }
      case 'barrier': {
        var other = k === 'fb' ? 'wg' : 'fb';
        var OQ = h.q[other];
        if (OQ.idx >= OQ.steps.length || OQ.steps[OQ.idx].op === 'barrier') done(k);
        return;
      }
      default:
        done(k);
    }
  }

  function tickFairy() {
    var Q = h.fy, s = Q.steps[Q.idx], st = Q.st;
    if (!s) return;
    var fy = g.level.fairies[0];
    var p = fy.body.data.GetPosition();
    var fx = -p.x * 32, fyY = -p.y * 32;
    switch (s.op) {
      case 'waitf':
        if (h.t - st.t0 >= s.f) { Q.idx++; Q.st = { t0: h.t }; }
        return;
      case 'fdragTo':
        fy.dragging = true;
        fy.dragTarget.x = -s.x / 32; fy.dragTarget.y = -s.y / 32;
        if (Math.hypot(fx - s.x, fyY - s.y) < (s.tol || 16) || h.t - st.t0 >= (s.or || 400)) {
          h.events.push({ f: h.t, who: 'fy', op: 'arrived', at: [Math.round(fx), Math.round(fyY)] });
          Q.idx++; Q.st = { t0: h.t };
        }
        return;
      case 'fhold':
        fy.dragging = true;
        fy.dragTarget.x = -s.x / 32; fy.dragTarget.y = -s.y / 32;
        if (h.t - st.t0 >= s.f) { Q.idx++; Q.st = { t0: h.t }; }
        return;
      case 'fwaitP0': { // 等 p0(objects[1]) 沉到位（pusher 已压 → 口袋开启）
        var o0 = g.level.objects[1];
        var y0 = o0 && o0.body ? -o0.body.data.GetPosition().y * 32 : 880;
        if (y0 >= 965 || h.t - st.t0 >= (s.or || 5000)) {
          h.events.push({ f: h.t, who: 'fy', op: 'P0-AT', y: Math.round(y0) });
          Q.idx++; Q.st = { t0: h.t };
        }
        return;
      }
      case 'fwaitLev': { // 等 lever 翻转
        var lv = g.level.objects.filter(function (o) { return o.options.type === 'lever'; })[0];
        if (lv.state === 1) { h.events.push({ f: h.t, who: 'fy', op: 'LEV-FIRED' }); Q.idx++; Q.st = { t0: h.t }; return; }
        fy.dragging = true;
        fy.dragTarget.x = -s.x / 32; fy.dragTarget.y = -s.y / 32;
        if (h.t - st.t0 >= (s.or || 600)) { Q.idx++; Q.st = { t0: h.t }; }
        return;
      }
      default:
        Q.idx++; Q.st = { t0: h.t };
    }
  }

  function step() {
    var L = g.level;
    if (!L || !L.loadCompleted || !L.pers1 || plugin.paused) return;
    h.t++;
    ['fb', 'wg'].forEach(function (k) {
      var Q = h.q[k];
      if (Q.hold && h.t < Q.hold.until) { // 空中持续推杆（模拟按住方向键）
        var bb = pers(k).body.data;
        bb.SetLinearVelocity(V(Q.hold.v, bb.GetLinearVelocity().y));
      }
      if (Q.idx < Q.steps.length && !Q.st) begin(k, Q.steps[Q.idx]);
      if (Q.st && Q.idx < Q.steps.length) tick(k);
    });
    if (h.fy.idx < h.fy.steps.length) tickFairy();
    if (h.t % 2 === 0) {
      var s = { f: h.t };
      ['fb', 'wg'].forEach(function (k) {
        var P = pos(k), VL = vels(k);
        s[k] = { x: Math.round(P.x * 100) / 100, y: Math.round(P.y * 100) / 100, vy: Math.round(VL.y * 10) / 10, dead: !!pers(k).isDead };
      });
      s.fy = (function () { var p = L.fairies[0].body.data.GetPosition(); return [Math.round(-p.x * 32), Math.round(-p.y * 32)]; })();
      (L.objects || []).forEach(function (o, i) {
        var t = o.options && o.options.type;
        if (t === 'platform') { var p = o.body.data.GetPosition(); s['p' + i] = Math.round(-p.y * 32 * 10) / 10; }
        if (t === 'lever') s.lev = o.state + '/' + Math.round(o.joint.GetJointAngleRadians() * 180 / Math.PI);
        if (t === 'fairycup') s.cup = o.state + '/' + o.currentFairies.length;
      });
      s.d1 = !!(L.door1 && L.door1.isUp); s.d2 = !!(L.door2 && L.door2.isUp);
      s.ended = !!L.ended;
      if (s.d1 && s.d2 && !h.win) { h.win = { f: h.t }; h.done = true; h.doneWhy = 'WIN'; }
      h.samples.push(s);
    }
    if (h.t >= 7000 && !h.done) { h.done = true; h.doneWhy = 'frame-cap'; }
  }
  return 'installed';
})()`;

// ---- 路线程序（vx 约定：+ = 屏幕西，- = 屏幕东） ----
const W = (k, vx, until, or) => ({ k, op: "walk", vx, until, or });
const WJ = (k, vx, until, jumpAt, airVx, or, airHold) => ({ k, op: "walkJump", vx, until, dir: vx > 0 ? -1 : 1, jumpAt, airVx, or, airHold: airHold || 0 });
const JP = (k, vx, vy, hold) => ({ k, op: "jump", vx, vy, hold: hold || 0 });
const WFT = (k, maxY, minY, or) => ({ k, op: "waitfeet", maxY, minY, or });
const WX = (k, dir, until, or) => ({ k, op: "waitx", dir, until, or });
const WP3 = (k, or) => ({ k, op: "waitp3", y: 618, or });
const WF = (k, f) => ({ k, op: "waitf", f });
const BAR = (k) => ({ k, op: "barrier" });
const FYS = (s) => s;

function charRoute(k) {
  return [
    WF(k, 100),                                // settle
    W(k, -8.5, 664, 400),                      // M1 东行（越池缘 x689.6 之前停）
    JP(k, 8.5, 16.5, 70),                      // 西向满跳（x664 起跳避开 c18' 挑檐三角；空中推杆 70f→落点≈479）
    WFT(k, 802, 700, 340),                     // 等 R25L 落位 (feet≈800, 落点≈479)
    { k, op: "waitp1", y: 860, or: 6000 },     // 等 wg 的口袋行触发 pusher → 仙女出笼入杯 → p1 沉 880（打开 R25L 西通道）
    W(k, 8.5, 48, 1200),                       // M2 西行至西墙贴墙位 x≈47.6（c5 捕捉窗实测 [46.4,47.6]；p1 已沉）
    JP(k, -8.5, 16.5, 42),                     // 东漂满跳：右缘越 c5 坡尖(160,704) 时 rise≥128 → 落 R21L≈x+347
    WFT(k, 690, 670, 400),                     // 等 R21L 落位 (feet≈672；窗口避开跳顶点 660.6 防误触)
    W(k, -8.5, 650, 900),                      // M3 东行走下实阶梯（◢672→704→step[640,672]@704→lip[704,736]@736 全实心）至一级台阶 x650
    JP(k, -8.5, 16.5, 22),                     // 台阶东跳：f15.7 前箱东缘≤736，其后箱底越 608 → 净空 r19 西面 → 落 r19@608 ≈x770
    WFT(k, 616, 600, 600),                     // 等 r19 落位 (feet≈608)
    W(k, 8.5, 748, 400),                       // 西调 r19 西端 x748（r15E[640,768] 檐下西出）
    JP(k, 8.5, 16.5, 22),                      // 西跳上 r16 顶 512（rise 后撞 r15E 底折返 → 落 r16 ≈x645）
    WFT(k, 520, 504, 500),                     // r16 落位 (feet≈512)
    W(k, 8.5, 500, 400),                       // 上◢(512,480)-(544,512) → ledgeA[448,544] 顶 480
    WFT(k, 494, 474, 300),                     // ledgeA (feet≈480)
    W(k, 8.5, 462, 300),                       // 上◢(480,448)-(512,480) → ledgeB[448,512] 顶 448
    WFT(k, 462, 442, 300),                     // ledgeB (feet≈448)
    W(k, 8.5, 400, 300),                       // 上◢(384,416)-(416,448) → R13L 顶 416
    WFT(k, 430, 410, 300),                     // R13L 落位 (feet≈416)
    W(k, 8.5, 294, 300),                       // M4 西行穿杆区 [280,316] → l0 翻转 → p3 沉
    JP(k, 8.5, 16.5, 33),                      // 西跳上 R10L（实速 4.25px/f：左缘永不进 160 面即落 → 落≈147）
    WFT(k, 334, 314, 400),                     // 等 R10L 落位 (feet≈320；避开顶点 276.6)
    W(k, 8.5, 78, 300),                        // M5 西行至 r7 捕捉窗 x≤78.7（可撞西墙落在 R10L 西段再跳）
    JP(k, -8.5, 16.5, 30),                     // 东漂满跳：右缘 f8.2 时 xR≤128 贴 r7 底越坡尖 → 落 R7≈295（酸池西侧）
    WFT(k, 238, 218, 400),                     // 等 R7 落位 (feet≈224；避开顶点 180.6)
    W(k, -8.5, 396, 700),                      // M6 东行至酸池西缘 (酸池床 [416,608])
    JP(k, -8.5, 16.5, 45),                     // 满速越酸跳（右缘 f15.7 越 R4 西面时 feet≈120<128 → 落 R4≈804）
    WFT(k, 142, 122, 400),                     // 等 R4 落位 (feet≈128；避开顶点 84.6)
    W(k, -8.5, 878, 700),                      // M7 东行至 R4 东缘前
    W(k, -8.5, 920, 400),                      // 走落东缘(896)，推至 x920 → 坠落漂移≈34px
    WFT(k, 292, 240, 400),                     // 落 r9 (feet≈288, 落点≈930)
    W(k, 8.5, 900, 300),                       // M8 西调至 r6R 捕捉窗 x[880,922]
    JP(k, -8.5, 16.5, 30),                     // 东漂满跳：f8.2 时 xR=1024 贴 r6R 底、f16.7 越 1056 全砖 → 落≈1181
    WFT(k, 206, 186, 400),                     // 等 R6R 落位 (feet≈192；避开顶点 148.6)
  ];
}
const wgPocketTrip = [ // wg 专属前置：穿水池 → bump → 捕捉跳上 R25E → 踩 pusher 凸台 → p0 沉（解锁仙女囚笼）→ 原路返回
  WF("wg", 140),
  W("wg", -8.5, 940, 700),                   // 东行涉水池 [704,928]（wg 水免疫，实测 f05-pool）
  W("wg", -8.5, 1000, 300),                  // 上 bump 西坡，至平顶西段 x1000（x≤1016.5 才能在 x 重叠前全身越过板带 [800,832]）
  JP("wg", -8.5, 16.5, 62),                  // 东漂满跳：顶破 r22 底(736, 头顶余量95.7) → 贴底滑出 x1088 → 落 R25E 步道顶(800)≈1090-1110
  W("wg", -8.5, 1180, 400),                  // 空中+落地持续东推越过凸台 [1161.6,1238.4] → 压 pusher → g2
  WF("wg", 150),                             // 凸台触发 → p0 沉 976（1.07px/f×96px≈90f；实测 f05-pusher，锁存）
  W("wg", 8.5, 1090, 400),                   // 西行走落 R25E 西缘(1088)
  WFT("wg", 905, 850, 400),                  // 落 bump (feet≈896)
  W("wg", 8.5, 416, 900),                    // 西下 bump 西坡 + 反向涉水池回出生段
];
function buildRoute() {
  const fb = [
    ...charRoute("fb"),
    W("fb", 8.5, 1104, 500),                   // 西行入 fb 门 (sensor≈1104)
    WF("fb", 600),
    BAR("fb"),
  ];
  const wg = [
    ...wgPocketTrip,
    ...charRoute("wg"),
    W("wg", -8.5, 1200, 500),                  // 东行入 wg 门 (sensor≈1200)
    WF("wg", 600),
    BAR("wg"),
  ];
  const fy = [
    FYS({ op: "waitf", f: 40 }),
    FYS({ op: "fdragTo", x: 1160, y: 905, tol: 12, or: 400 }), // 袋内下潜至盒底层（p0 未沉时抵住其东面等待）
    FYS({ op: "fwaitP0", or: 5000 }),                          // 门禁：等 p0 沉到位 (≥965) 才许出袋
    FYS({ op: "fdragTo", x: 1090, y: 905, tol: 12, or: 800 }), // p0 沉后西穿开启口 [1122,1150]×[832,928]
    FYS({ op: "fdragTo", x: 1030, y: 872, tol: 12, or: 400 }), // 升过 bump 顶(896)
    FYS({ op: "fdragTo", x: 700, y: 856, tol: 14, or: 460 }),
    FYS({ op: "fdragTo", x: 260, y: 856, tol: 14, or: 460 }),  // 西行回杯口高度（低层 [576,800] 内，R17L 底 576 封顶不可再升）
    FYS({ op: "fdragTo", x: 58, y: 858, tol: 12, or: 900 }),   // 至杯口西缘
    FYS({ op: "fdragTo", x: 52.8, y: 882, tol: 10, or: 240 }), // 降入杯口
    FYS({ op: "fhold", x: 52.8, y: 888, f: 999999, release: false }), // 长持压杯 → p1 保持下沉
  ];
  return { fb, wg, fy };
}

async function main() {
  mkdirSync(OUTDIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => { const s = String(e); if (!s.includes("4399")) console.log("[pageerror]", s.slice(0, 250)); });
  await page.goto(GAME_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(READY, null, { timeout: 90000, polling: 250 });
  await page.waitForFunction("Phaser.GAMES[0].state.current === 'menu'", null, { timeout: 60000, polling: 100 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.evaluate(NAVIGATE);
  await page.waitForFunction(READY_LEVEL, null, { timeout: 60000, polling: 100 });
  await page.waitForFunction(READY_PHYS, null, { timeout: 30000, polling: 50 });
  console.log("level ready; installing controller...");
  await page.evaluate(INSTALL);
  const { fb, wg, fy } = buildRoute();
  await page.evaluate(`(function(){
    window.__h.q.fb.steps = ${JSON.stringify(fb)};
    window.__h.q.wg.steps = ${JSON.stringify(wg)};
    window.__h.fy.steps = ${JSON.stringify(fy)};
  })()`);
  console.log("routes installed; running...");
  try {
    await page.waitForFunction("window.__h && window.__h.done", null, { timeout: 560000, polling: 150 });
  } catch (e) {
    console.log("[warn] waitForFunction timeout; dumping current state anyway");
  }
  await page.screenshot({ path: `${OUTDIR}/f03-${PRESET}.png` });
  const data = await page.evaluate("({ t: window.__h.t, done: window.__h.done, doneWhy: window.__h.doneWhy, err: window.__h.err, win: window.__h.win, events: window.__h.events, samples: window.__h.samples })");
  await browser.close();
  writeFileSync(`${OUTDIR}/f03-${PRESET}.json`, JSON.stringify(data));
  console.log(`frames=${data.t} doneWhy=${data.doneWhy} err=${data.err ? "YES" : "no"} win=${JSON.stringify(data.win)}`);
  const last = data.samples[data.samples.length - 1];
  console.log("last:", JSON.stringify(last));
  data.events.slice(-16).forEach((e) => console.log("ev", e.f, e.who, e.op, e.at ? JSON.stringify(e.at) : ""));
  const dead = data.samples.filter((s) => s.fb.dead || s.wg.dead);
  if (dead.length) console.log("DEATH at f" + dead[0].f, JSON.stringify(dead[0]));
  console.log("written:", `${OUTDIR}/f03-${PRESET}.json`);
}
main().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });
