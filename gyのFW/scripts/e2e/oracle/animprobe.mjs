#!/usr/bin/env node
/**
 * vtoracle·animprobe：动画保真度状态级对拍（12 号档 STEP3）。
 *
 * 方法（与 rotcheck 同构，文字模型禁像素判读，一切取证走状态序列）：
 *   oracle 侧 = 虚拟钟 60Hz 精确帧（lib.mjs 三段式起跑同构），包 StateManager.update
 *   尾采样 Phaser 2 精灵动画态：head/legs currentAnim.name + frameName、ice 可见性、
 *   death_smoke 子精灵帧、dying/dead、位速、game.time.now。
 *   客户端侧 = 真服（e2e/lib.mjs startServer/enterAs），Game 场景 postupdate 逐 rAF 采样
 *   PlayerView：head/legs anims key + frame.name、smoke、ps.anim 权威态、cx/cy、performance.now。
 *   帧身份统一用 atlas frameName（两侧同源），数字尾号=帧号、去尾号=家族名。
 *
 * 段位（同一输入脚本，帧号 ↔ ms(×1000/60) 对齐）：
 *   forest_01  settle[0,30) → idle[30,210) → walk[210,330) → jump[330,438)
 *              （fb 动 / wg 全程静置=idle 参照；jump=right 保持 + up@330-348）
 *   forest_02  settle[0,30) → death[30,…)：wg 按住 D 走进 row28 岩浆（journey deathretry 同路），
 *              early-exit 于 lose mark + 90 帧尾巴
 *
 * 用法：
 *   node scripts/e2e/oracle/animprobe.mjs --oracle [--out TEMP/animcheck]
 *   node scripts/e2e/oracle/animprobe.mjs --client [--port 3591] [--out TEMP/animcheck]
 *   node scripts/e2e/oracle/animprobe.mjs --report [--out TEMP/animcheck]
 *
 * 只读 import：oracle/lib.mjs（伺服/假钟/进关/注入）、e2e/lib.mjs（真服/入场）。
 * 本文件不修改任何既有模块；产物写 TEMP/animcheck/（gitignored，收尾清理）。
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { openOracle, enterLevel, expandInputs, releaseAll, ROLES, serveOracle, ORACLE_ROOT } from "./lib.mjs";
import { startServer, enterAs, waitForStarted } from "../lib.mjs";

const argVal = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
};
const hasFlag = (flag) => process.argv.includes(flag);
const OUT_DIR = resolve(argVal("--out", "TEMP/animcheck"));

/** 共享段位脚本（帧域；客户端换算 ×1000/60 ms）。
 * forest_01 段位设计避坑：右墙根（x≈897）紧邻液体池，贴墙跳的起跳相位 ±2 帧即分生死
 * （首版 walk+贴墙跳实拍：oracle 贴边生还 / 客户端输入抖动落池——输入层噪声非行为分歧）。
 * 故改为 慢走 60f + 松键滑停 + 原地跳，所有段位远离危险边界。 */
const SCEN = [
  {
    id: "forest_01",
    file: "tutorials/levels/forest_01.json",
    total: 390,
    fb: [
      { f: 210, dir: "right", type: "down" },
      { f: 270, dir: "right", type: "up" },
      { f: 300, dir: "up", type: "down" },
      { f: 318, dir: "up", type: "up" },
    ],
    wg: [],
    tags: [
      ["settle", 0, 30],
      ["idle", 30, 210],
      ["walk", 210, 270],
      ["coast", 270, 300],
      ["jump", 300, 390],
    ],
    loseExit: false,
  },
  {
    id: "forest_02",
    file: "forest/levels/forest_02.json",
    total: 420,
    fb: [],
    wg: [{ f: 30, dir: "right", type: "down" }],
    tags: [
      ["settle", 0, 30],
      ["death", 30, 420],
    ],
    loseExit: true, // lose mark 后再采 90 帧
  },
];

const templeId = (file) => {
  const temple = JSON.parse(readFileSync(join(ORACLE_ROOT, "data", "forest", "temple.json"), "utf8"));
  const id = temple.levels.find((l) => l.filename === file)?.id;
  if (!id) throw new Error(`temple.json 无 ${file} 条目`);
  return id;
};

// ────────────────────────────────────────────── oracle 侧

/** oracle 动画采样器：包 StateManager.update 尾采样（同 lib.attachSampler 布点）。 */
async function attachAnimSampler(page) {
  await page.evaluate(() => {
    const g = window.Phaser.GAMES[0];
    const rec = { samples: [], total: 0, marks: {} };
    window.__animRec = rec;
    const smokeOf = (p) => {
      for (const c of p.sprite.children) {
        if (c.animations && c.animations.currentAnim && c.animations.currentAnim.name === "play") {
          return { f: c.frameName, vis: c.visible, playing: c.animations.currentAnim.isPlaying };
        }
      }
      return null;
    };
    const grab = (p) => {
      if (!p || !p.body || !p.body.data) return null;
      const pos = p.body.data.GetPosition();
      const vel = p.body.data.GetLinearVelocity();
      const bp = p.bodyParts ?? {};
      const hA = bp.head?.animations?.currentAnim;
      const lA = bp.legs?.animations?.currentAnim;
      const sm = smokeOf(p);
      return {
        hA: hA?.name ?? null,
        hF: bp.head?.frameName ?? null,
        lA: lA?.name ?? null,
        lP: lA?.isPlaying ?? false,
        lF: bp.legs?.frameName ?? null,
        iceV: bp.ice?.visible ?? false,
        hv: bp.head?.visible ?? false,
        lv: bp.legs?.visible ?? false,
        sF: sm?.f ?? null,
        sV: sm?.vis ?? false,
        sP: sm?.playing ?? false,
        dying: p.dying === true,
        dead: p.isDead === true,
        x: -32 * pos.x,
        y: -32 * pos.y,
        vx: -32 * vel.x,
        vy: -32 * vel.y,
      };
    };
    const sm = g.state;
    const origUpdate = sm.update.bind(sm);
    sm.update = function (...args) {
      origUpdate(...args);
      try {
        const lv = g.level;
        if (!lv || !lv.pers2 || !lv.pers2.body) return;
        rec.samples.push({ n: g.time.now, fb: grab(lv.pers1), wg: grab(lv.pers2) });
      } catch (e) {
        rec.samples.push({ err: String(e).slice(0, 80) });
      }
    };
    const hookFin = () => {
      const lv = g.level;
      if (!lv || lv.__animHooked) return;
      lv.__animHooked = true;
      const ol = lv.gameOver.bind(lv);
      lv.gameOver = function () { rec.marks = { ...rec.marks, lose: rec.total + rec.samples.length }; return ol(); };
      const ow = lv.gameFinish.bind(lv);
      lv.gameFinish = function () { rec.marks = { ...rec.marks, win: rec.total + rec.samples.length }; return ow(); };
    };
    const origPre = sm.preUpdate.bind(sm);
    sm.preUpdate = function (...args) {
      hookFin();
      return origPre(...args);
    };
  });
  return {
    async drain() {
      return page.evaluate(() => {
        const r = window.__animRec.samples;
        window.__animRec.total += r.length;
        window.__animRec.samples = [];
        return r;
      });
    },
    async readMarks() {
      return page.evaluate(() => ({ ...(window.__animRec.marks ?? {}) }));
    },
  };
}

/** oracle 一段的确定性跑（lib.runScript 三段式起跑同构，采样器换动画版）。 */
async function oracleRun(serverBase, scen) {
  const { browser, page } = await openOracle(serverBase);
  const cur = { fb: { up: false, left: false, right: false }, wg: { up: false, left: false, right: false } };
  const ins = expandInputs(scen.fb, scen.wg, scen.total);
  const all = { samples: [], marks: {} };
  try {
    await enterLevel(page, templeId(scen.file), scen.file);
    await page.evaluate(() => {
      window.__vt.arm(1700000000000);
      window.__vtRelease();
    });
    await page.evaluate((n) => window.__vt.step(n), 30);
    await page.evaluate(() => window.__vt.arm(1700000000000));
    const sampler = await attachAnimSampler(page);
    const drainAll = async () => { all.samples.push(...(await sampler.drain())); };
    for (let f = 0; f < scen.total; f++) {
      for (const [role, arr] of [["fb", ins.fb], ["wg", ins.wg]]) {
        for (const dir of ["up", "left", "right"]) {
          if (arr[f][dir] !== cur[role][dir]) {
            cur[role][dir] = arr[f][dir];
            if (arr[f][dir]) await page.keyboard.down(ROLES[role][dir]);
            else await page.keyboard.up(ROLES[role][dir]);
          }
        }
      }
      const errs = await page.evaluate(() => window.__vt.step(1));
      if (errs.length) throw new Error(`帧 ${f} 页内异常: ${errs[0]}`);
      if ((f + 1) % 300 === 0 || f === scen.total - 1) await drainAll();
      if (f % 50 === 49) {
        all.marks = await sampler.readMarks();
        if (scen.loseExit && all.marks.lose !== undefined && f + 1 >= all.marks.lose + 90) break;
        if (!scen.loseExit && (all.marks.win !== undefined || all.marks.lose !== undefined)) break;
      }
    }
    await releaseAll(page, cur);
    all.marks = { ...all.marks, ...(await sampler.readMarks()) };
    await drainAll();
    return { samples: all.samples, marks: all.marks };
  } finally {
    await browser.close().catch(() => {});
  }
}

// ────────────────────────────────────────────── 客户端侧

async function clientRun(port, scen) {
  // --disable-webgl：headless 下强制 Phaser Canvas 后端（oracle 侧 LAUNCH_ARGS 同款）——
  // SwiftShader 软件渲染 WebGL 会把 rAF 拖到 ~15fps，采样粒度退化为 4 帧/样本
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-webgl"] });
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  try {
    const code = await enterAs(a, port, "create", "", scen.id);
    await enterAs(b, port, "join", code, scen.id);
    await waitForStarted(a);
    await waitForStarted(b);

    // Game 场景 postupdate 逐 rAF 采样（页 A 渲染双角色视图）
    await a.evaluate(() => {
      const sc = window.__fw.scene.getScene("Game");
      const rec = { samples: [] };
      window.__animRec = rec;
      sc.events.on("postupdate", () => {
        try {
          const st = sc["d"]?.net?.room?.state;
          const views = sc["views"];
          const smp = { t: performance.now(), ph: String(st?.phase ?? "") };
          for (const role of ["fireboy", "watergirl"]) {
            const v = views.get(role);
            const ps = st?.players?.get?.(role);
            smp[role] = v
              ? {
                  anim: ps?.anim ?? null,
                  dying: ps?.dying === true,
                  dead: ps?.isDead === true,
                  hA: v.head.anims.currentAnim?.key ?? null,
                  hF: v.head.frame?.name ?? null,
                  lA: v.legs.anims.currentAnim?.key ?? null,
                  lP: v.legs.anims.isPlaying ?? false,
                  lF: v.legs.frame?.name ?? null,
                  iceV: false,
                  hv: v.head.visible,
                  lv: v.legs.visible,
                  sF: v.smoke.frame?.name ?? null,
                  sV: v.smoke.visible,
                  sP: v.smoke.anims.isPlaying ?? false,
                  x: v.cx,
                  y: v.cy,
                }
              : null;
          }
          rec.samples.push(smp);
        } catch (e) {
          rec.samples.push({ err: String(e).slice(0, 80) });
        }
      });
    });

    // 输入时间线（帧→ms）。键路按角色分页：A 页=fb 方向键 / B 页=wg WASD（F1 角色分键，
    // fb 页不认 WASD——首版全打 A 页导致 wg 输入被静默过滤，死亡段不触发）
    await a.evaluate(() => {
      window.__animT0 = performance.now(); // 输入调度原点（段位帧域锚点）
    });
    const KEY = { fb: { up: "ArrowUp", right: "ArrowRight", left: "ArrowLeft" }, wg: { up: "KeyW", right: "KeyD", left: "KeyA" } };
    const PAGE = { fb: a, wg: b };
    const totalMs = Math.round((scen.total * 1000) / 60);
    const deadline = Date.now() + totalMs + 5000;
    (async () => {
      const start = Date.now();
      // 全局有序时间表：到点才派发（此前 sleep≤100ms 即派发会把整表塌缩到首 0.4s）
      const evs = [];
      for (const [role, list] of [["fb", scen.fb], ["wg", scen.wg]]) {
        for (const e of list) evs.push({ t: Math.round((e.f * 1000) / 60), page: PAGE[role], key: KEY[role][e.dir], type: e.type });
      }
      evs.sort((x, y) => x.t - y.t);
      for (const ev of evs) {
        for (;;) {
          const wait = ev.t - (Date.now() - start);
          if (wait <= 0) break;
          await ev.page.waitForTimeout(Math.min(wait, 100));
        }
        if (ev.type === "down") await ev.page.keyboard.down(ev.key);
        else await ev.page.keyboard.up(ev.key);
      }
    })().catch(() => {});
    for (;;) {
      await a.waitForTimeout(120);
      const ph = await a.evaluate(() => String(window.__fwInit?.net?.room?.state?.phase ?? ""));
      if (scen.loseExit && ph === "gameover") {
        await a.waitForTimeout(1600); // ≈90 帧 @60 收死亡尾
        break;
      }
      if (!scen.loseExit && (ph === "won" || ph === "gameover")) break;
      if (Date.now() > deadline) break;
    }
    const samples = await a.evaluate(() => window.__animRec.samples);
    const t0 = await a.evaluate(() => window.__animT0 ?? 0);
    return { samples, marks: { tailPhase: samples.at(-1)?.ph ?? "" }, t0 };
  } finally {
    await ctxA.close().catch(() => {});
    await ctxB.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

// ────────────────────────────────────────────── 主流程

if (hasFlag("--oracle") || hasFlag("--client")) {
  const which = hasFlag("--oracle") ? "oracle" : "client";
  mkdirSync(OUT_DIR, { recursive: true });
  let server = null;
  const port = Number(argVal("--port", "3591"));
  if (which === "oracle") {
    server = await serveOracle();
    console.log(`[animprobe] oracle 伺服 ${server.base}`);
  } else {
    server = await startServer(port);
    console.log(`[animprobe] 真服 :${port}`);
  }
  try {
    for (const scen of SCEN) {
      console.log(`[animprobe] ${which} ${scen.id} 段位=${scen.tags.map((t) => t[0]).join("/")} total=${scen.total}f`);
      const r = which === "oracle" ? await oracleRun(server.base, scen) : await clientRun(port, scen);
      const file = join(OUT_DIR, `anim-${which}-${scen.id}.json`);
      writeFileSync(file, JSON.stringify({ kind: `anim-${which}`, scen: scen.id, tags: scen.tags, marks: r.marks, t0: r.t0 ?? null, samples: r.samples }));
      console.log(`[animprobe]   ${r.samples.length} 样本 marks=${JSON.stringify(r.marks)} → ${file}`);
    }
  } finally {
    if (which === "oracle") server.close();
    else server.kill();
  }
  process.exit(0);
}

// ────────────────────────────────────────────── 报告：序列/帧率/循环三口径比对

if (hasFlag("--report")) {
  const load = (side, id) => {
    const p = join(OUT_DIR, `anim-${side}-${id}.json`);
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
  };
  const idxOf = (name) => (name ? Number(String(name).slice(-4)) : -1);
  const famOf = (name) => (name ? String(name).replace(/\d{4}$/, "") : null);

  /** 段内提炼（按 head 帧名家族分组）：切换序列 / 主家族帧率斜率+循环周期 / 腿烟冰行为 */
  const analyze = (doc, side, scen) => {
    const isO = side === "oracle";
    // 帧域：oracle 样本序号=帧号（虚拟钟帧顶采样）；client 帧=(t-t0)·60/1000（输入调度原点 __animT0）
    const frameOf = (s) => (isO ? s.i : ((s.t - doc.t0) / 1000) * 60);
    const out = {};
    for (const [tag, f0, f1] of scen.tags) {
      const rows = doc.samples.map((s, i) => ({ ...s, i })).filter((s) => !s.err && frameOf(s) >= f0 - 3 && frameOf(s) < f1 + 3);
      if (rows.length === 0) continue;
      const res = {};
      for (const role of ["fireboy", "watergirl"]) {
        const oKey = role === "fireboy" ? "fb" : "wg"; // oracle 样本键 fb/wg ↔ 客户端 fireboy/watergirl
        const pairs = rows.map((s) => ({ s: s[isO ? oKey : role], f: frameOf(s) })).filter((p) => p.s);
        if (pairs.length === 0) continue;
        const arr = pairs.map((p) => p.s);
        // 切换序列：head 帧名家族变化点（帧域位）
        const trans = [];
        let lastFam = null;
        for (const p of pairs) {
          const fam = famOf(p.s.hF);
          if (fam !== lastFam) {
            trans.push(`${fam}@f${Math.round(p.f)}`);
            lastFam = fam;
          }
        }
        // 按家族分组（保持出现顺序），主家族=最长连续 run
        const runs = [];
        arr.forEach((s, i) => {
          const fam = famOf(s.hF);
          if (runs.length === 0 || runs.at(-1).fam !== fam) runs.push({ fam, from: i, idx: [] });
          runs.at(-1).idx.push([i, idxOf(s.hF)]);
        });
        const main = runs.reduce((a, b) => (b.idx.length > a.idx.length ? b : a), runs[0]);
        // 主家族帧率：环周期口径——回卷点样本距 P 与环长 L（回卷前尾号+1）→ fps = L/(P/60)
        const pts = main.idx.map(([i, f]) => [i, f]).filter(([, f]) => f >= 0);
        let fps = null;
        {
          const marks = []; // 每个回卷点：{at=样本位, L=环长}
          for (let k = 1; k < pts.length; k++) {
            if (pts[k][1] < pts[k - 1][1] - 4) marks.push({ at: pts[k][0], L: pts[k - 1][1] + 1 });
          }
          if (marks.length >= 1) {
            const periods = [];
            for (let m = 1; m < marks.length; m++) periods.push(marks[m].at - marks[m - 1].at);
            const L = marks[0].L;
            const P = periods.length ? periods.sort((a, b) => a - b)[periods.length >> 1] : marks[0].at - pts[0][0];
            fps = P > 0 ? +(L / (P / 60)).toFixed(1) : null;
          }
        }
        // 主家族循环周期：回卷点样本距（样本≈帧）
        const periods = [];
        let prevF = null, prevI = null;
        for (const [i, f] of pts) {
          if (prevF != null && f < prevF - 4) periods.push(i - prevI);
          prevF = f;
          prevI = i;
        }
        res[role] = {
          head: trans.join(" → "),
          mainFam: main?.fam,
          fps,
          loopPeriods: periods.slice(0, 8),
          legs: [...new Set(arr.map((s) => `${s.lP ? "P" : "S"}:${famOf(s.lF)}#${idxOf(s.lF)}`))].slice(0, 6),
          smoke: (() => {
            const on = arr.filter((s) => s.sF);
            if (on.length === 0) return null;
            const first = arr.findIndex((s) => s.sP);
            return `${famOf(on[0].sF)}#${idxOf(on[0].sF)}..${idxOf(on.at(-1).sF)} play[${first >= 0 ? first : "-"}..${arr.map((s) => s.sP).lastIndexOf(true)}]`;
          })(),
          dying: arr.filter((s) => s.dying).length,
          dead: arr.filter((s) => s.dead).length,
          dyingHidden: arr.filter((s) => s.dying && (!s.hv || !s.lv)).length,
          hidden: arr.filter((s) => !s.hv || !s.lv).length,
          ice: arr.filter((s) => s.iceV).length,
        };
      }
      out[tag] = res;
    }
    return out;
  };

  const report = {};
  for (const scen of SCEN) {
    const o = load("oracle", scen.id);
    const c = load("client", scen.id);
    report[scen.id] = {
      oracle: o ? analyze(o, "oracle", scen) : null,
      client: c ? analyze(c, "client", scen) : null,
      oracleMarks: o?.marks ?? null,
      clientTailPhase: c?.marks?.tailPhase ?? null,
      clientSamples: c?.samples?.length ?? 0,
    };
  }
  const file = join(OUT_DIR, "anim-report.json");
  writeFileSync(file, JSON.stringify(report, null, 1));
  for (const [id, r] of Object.entries(report)) {
    console.log(`\n===== ${id} ===== oracleMarks=${JSON.stringify(r.oracleMarks)} clientTail=${r.clientTailPhase} (${r.clientSamples} 样本)`);
    for (const side of ["oracle", "client"]) {
      console.log(`-- ${side} --`);
      const data = r[side];
      if (!data) {
        console.log("  (无数据)");
        continue;
      }
      for (const [tag, roles] of Object.entries(data)) {
        for (const [role, s] of Object.entries(roles)) {
          console.log(`  ${tag}/${role}: ${s.head}`);
          console.log(`    main=${s.mainFam} fps=${s.fps} loop=${JSON.stringify(s.loopPeriods)} legs=${JSON.stringify(s.legs)}`);
          if (s.smoke || s.dying || s.dead || s.hidden || s.ice)
            console.log(`    smoke=${s.smoke} dying=${s.dying} dead=${s.dead} hidden=${s.hidden} dyingHidden=${s.dyingHidden} ice=${s.ice}`);
        }
      }
    }
  }
  console.log(`\nreport → ${file}`);
  process.exit(0);
}

console.log("用法：animprobe.mjs --oracle | --client [--port 3591] | --report [--out TEMP/animcheck]");
process.exit(1);
