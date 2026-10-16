// auto-design 槽·E3：分段 beam 搜索微原型——用 02 号档设计的检查点评分函数搜 forest_01 前 3 段。
// 验证点：①评分函数能否数层内单调推向检查点（对照 microsearch 163→1103）②双角色交替扩展可行 ③段缝入场断言校验。
// 用法: cd gyのFW && node --import tsx note/research/2026-10-autoplay/tools/beam-seg.mjs [--beam 24] [--segs 3] [--maxdepth 10] [--budget 6000]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function findRoot(dir) {
  for (let d = dir; ; d = dirname(d)) {
    try { readFileSync(join(d, "package.json")); return d; } catch { /* 向上 */ }
  }
}
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));
const { makeWorld } = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "kernel.mjs")).href);

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const BEAM = Number(argOf("beam", "24"));
const NSEGS = Number(argOf("segs", "3"));
const MAXDEPTH = Number(argOf("maxdepth", "10"));
const BUDGET = Number(argOf("budget", "6000"));

const chain = JSON.parse(readFileSync(process.argv.includes("--chain") ? resolve(process.argv[process.argv.indexOf("--chain") + 1]) : fileURLToPath(new URL("./checkpoints-forest_01.json", import.meta.url)), "utf8"));
const LEVEL = chain.level;
const segs = chain.segments.slice(0, NSEGS);
const ROLE = { fb: "fireboy", wg: "watergirl" };

// ---------- 断言编译（取数路径与 verify-chain.mjs 一致）
function compileGroup(list) {
  return list.map((a) => {
    switch (a.kind) {
      case "px": case "py": {
        const k = a.kind === "px" ? "x" : "y";
        return { a, f: (S, M) => S[a.role][k] >= a.min && S[a.role][k] <= a.max };
      }
      case "grounded": return { a, f: (S) => S[a.role].grounded };
      case "alive": return { a, f: (S) => !S.fb.dying && !S.fb.dead && !S.wg.dying && !S.wg.dead };
      case "leverState": return { a, f: (S, M) => M.levers[a.id].state === a.value };
      case "platY": return { a, f: (S, M) => M.platforms[a.id].y >= a.min && M.platforms[a.id].y <= a.max };
      case "pusherState": return { a, f: (S, M) => M.pushers[a.id].state === a.value };
      default: throw new Error(`beam 未实现的断言 kind: ${a.kind}`);
    }
  });
}
const allS = (g, S, M) => g.every((c) => c.f(S, M));

// ---------- 原语库（闭环比步骤机，语义对齐 botcore S；每候选全新实例，无跨候选状态）
const NONE = { up: false, left: false, right: false };
const PRIMS = {
  idle: (n) => ({ name: `idle${n}`, run: () => NONE, done: (c) => c.stepF >= n }),
  goTo: (x, tol = 12) => {
    let cur = 0, lastF = -9;
    return {
      name: `go${x}`,
      run: (c) => {
        const d = x - c.me.x, vx = c.me.vx;
        let want = d > 0 ? 1 : -1;
        if (Math.abs(d) <= tol) want = Math.abs(vx) > 50 ? -Math.sign(vx) : 0;
        else {
          const closing = vx > 0 === d > 0;
          if (closing && Math.abs(vx) > 40 && Math.abs(d) < Math.abs(vx) * 0.16 + 10) want = -Math.sign(vx);
        }
        if (want !== cur && c.stepF - lastF >= 3) { cur = want; lastF = c.stepF; }
        return cur === 0 ? NONE : { ...NONE, [cur > 0 ? "right" : "left"]: true };
      },
      done: (c) => Math.abs(c.me.x - x) <= tol && c.me.grounded && Math.abs(c.me.vx) < 40,
    };
  },
  jump: (dir, driftF) => {
    const D = dir > 0 ? "right" : dir < 0 ? "left" : null;
    let t = 0, jumped = false, air = false;
    return {
      name: `jmp${dir ?? "0"}/${driftF}`,
      run: (c) => {
        const i = { ...NONE, ...(D ? { [D]: true } : {}) };
        if (!jumped) {
          if (c.me.grounded) { i.up = true; jumped = true; t = 0; return i; }
          return NONE;
        }
        t++;
        if (t > driftF) return NONE;
        return i;
      },
      done: (c) => { if (!c.me.grounded) air = true; return jumped && air && c.me.grounded && c.me.vy >= -8; },
    };
  },
  jumpOnto: (dir, aboveY) => {
    const D = dir > 0 ? "right" : "left";
    let jumped = false;
    return {
      name: `jo${dir}${aboveY}`,
      run: (c) => {
        if (!jumped) {
          if (c.me.grounded && Math.abs(c.me.vx) < 60) return { ...NONE, up: true };
          if (!c.me.grounded) jumped = true;
          return NONE;
        }
        return c.me.y < aboveY ? { ...NONE, [D]: true } : NONE;
      },
      done: (c) => jumped && c.me.grounded && c.me.vy >= -8,
    };
  },
  // 助跑跳：压 dir 攒速，过 line 且接地即跳，空中保持 dir 至落地（botcore S.runJump 同款）
  runJump: (dir, line) => {
    const D = dir > 0 ? "right" : "left";
    let jumped = false, air = false;
    return {
      name: `rj${dir}${line}`,
      run: (c) => {
        const i = { ...NONE, [D]: true };
        if (!jumped && c.me.grounded && (dir > 0 ? c.me.x >= line : c.me.x <= line)) { i.up = true; jumped = true; }
        return i;
      },
      done: (c) => { if (!c.me.grounded) air = true; return jumped && air && c.me.grounded && c.me.vy >= -8; },
    };
  },
  // 二段跳（助跑版）：压 dir 攒速，过 line 接地即跳，空中悬点（离地≥12f 且 vy>−200）再 tap 一次，漂移至落地。
  // 依据：绿路线 fb f175 助跑 tap + f240 空中 tap 登 800 台（192px 高差单跳不可达）——原版空中跳机制，
  // botcore S 库未建模（r05d 人工编排未用到），实施槽应纳入 autosearch 词表。
  runJump2: (dir, line, driftF) => {
    const D = dir > 0 ? "right" : "left";
    let t = 0, jumped = false, air = false, doubled = false;
    return {
      name: `rj2${dir}${line}/${driftF}`,
      run: (c) => {
        const i = { ...NONE, [D]: true };
        if (!jumped) {
          if (c.me.grounded && (dir > 0 ? c.me.x >= line : c.me.x <= line)) { i.up = true; jumped = true; t = 0; }
          return i;
        }
        t++;
        if (!doubled && !c.me.grounded && t >= 12 && c.me.vy > -200) { i.up = true; doubled = true; return i; }
        if (t > driftF) return NONE;
        return i;
      },
      done: (c) => { if (!c.me.grounded) air = true; return jumped && air && doubled && c.me.grounded && c.me.vy >= -8; },
    };
  },
};
// 每段每角色的原语候选（工厂；参数离散化；实施槽由 checkpoints JSON 的 primArgs 驱动——实验内联）
const VOCAB = {
  S0a: {
    fb: [() => PRIMS.goTo(400), () => PRIMS.goTo(1050), () => PRIMS.runJump(1, 430), () => PRIMS.runJump2(1, 300, 900), () => PRIMS.runJump2(1, 420, 900), () => PRIMS.jump(1, 40)],
    wg: [() => PRIMS.goTo(500), () => PRIMS.goTo(1100), () => PRIMS.runJump(1, 1130), () => PRIMS.runJump(1, 430), () => PRIMS.jump(1, 40), () => PRIMS.jumpOnto(1, 780)],
  },
  S0b: {
    fb: [() => PRIMS.goTo(1100), () => PRIMS.goTo(250), () => PRIMS.runJump(-1, 1150), () => PRIMS.jump(-1, 50), () => PRIMS.jump(-1, 90), () => PRIMS.idle(30)],
    wg: [() => PRIMS.goTo(1150), () => PRIMS.goTo(175), () => PRIMS.runJump(-1, 1150), () => PRIMS.jump(-1, 50), () => PRIMS.jump(-1, 90), () => PRIMS.idle(30)],
  },
  S1: {
    fb: [() => PRIMS.goTo(220), () => PRIMS.goTo(48), () => PRIMS.goTo(300), () => PRIMS.jump(-1, 45), () => PRIMS.jump(-1, 15), () => PRIMS.jump(0, 20), () => PRIMS.idle(40)],
    wg: [() => PRIMS.goTo(175), () => PRIMS.goTo(300), () => PRIMS.goTo(60), () => PRIMS.jump(-1, 30), () => PRIMS.idle(40)],
  },
  S2: {
    fb: [() => PRIMS.jump(1, 30), () => PRIMS.jump(1, 900), () => PRIMS.jump(0, 20), () => PRIMS.goTo(180), () => PRIMS.goTo(48), () => PRIMS.idle(30)],
    wg: [() => PRIMS.goTo(130), () => PRIMS.goTo(48), () => PRIMS.jump(-1, 25), () => PRIMS.jump(0, 20), () => PRIMS.idle(30)],
  },
};

// ---------- 单候选评估：双角色队列并行 drive（botcore 同序：run→done），从 f0 全量重放
function evaluate(segC, seqFb, seqWg) {
  const w = makeWorld(LEVEL);
  const R = { fb: { prog: seqFb.map((c) => c()), i: 0 }, wg: { prog: seqWg.map((c) => c()), i: 0 } };
  const snap = (role) => {
    const s = w.snapshotPlayer(ROLE[role]);
    return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, grounded: w.players[ROLE[role]].feetContacts.length > 0, dying: s.dying, dead: s.dead };
  };
  const wpMetF = segC.wpG.map(() => -1);
  let deathF = -1, deadWho = null, metAt = -1, doneAt = -1, f = 0;
  for (; f < segC.horizonF; f++) {
    const inputs = {};
    for (const role of ["fb", "wg"]) {
      const r = R[role];
      const cur = r.prog[r.i];
      if (!cur) { inputs[role] = NONE; continue; }
      const ctx = { stepF: r.stepF ?? 0, me: snap(role), other: snap(role === "fb" ? "wg" : "fb"), w };
      if (cur._sf === undefined) { cur._sf = 0; } else { cur._sf++; }
      ctx.stepF = cur._sf;
      const inp = cur.run(ctx) ?? NONE;
      let d = false;
      try { d = cur.done(ctx); } catch { d = false; }
      inputs[role] = inp;
      if (d) { r.i++; }
    }
    w.step(1 / 60, { fireboy: inputs.fb, watergirl: inputs.wg });
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    if (a.dying || a.dead || b.dying || b.dead) {
      deathF = f;
      deadWho = a.dying || a.dead ? `fb@[${a.x.toFixed(0)},${a.y.toFixed(0)}]` : `wg@[${b.x.toFixed(0)},${b.y.toFixed(0)}]`;
      break;
    }
    const S = { fb: { ...a, grounded: w.players.fireboy.feetContacts.length > 0 }, wg: { ...b, grounded: w.players.watergirl.feetContacts.length > 0 } };
    const M = w.mechSnapshot();
    for (let wi = 0; wi < segC.wpG.length; wi++) if (wpMetF[wi] < 0 && allS(segC.wpG[wi], S, M)) wpMetF[wi] = f;
    if (allS(segC.targetG, S, M)) { metAt = f; break; }
    if (R.fb.i >= R.fb.prog.length && R.wg.i >= R.wg.prog.length) { doneAt = f; break; } // 双队列空（未达目标）
  }
  const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
  const S = { fb: { ...a, grounded: w.players.fireboy.feetContacts.length > 0, dying: a.dying, dead: a.dead }, wg: { ...b, grounded: w.players.watergirl.feetContacts.length > 0, dying: b.dying, dead: b.dead } };
  const M = w.mechSnapshot();
  for (let wi = 0; wi < segC.wpG.length; wi++) if (wpMetF[wi] < 0 && allS(segC.wpG[wi], S, M)) wpMetF[wi] = f;
  if (metAt < 0 && doneAt < 0 && deathF < 0) doneAt = f; // horizon 超时
  return { deathF, metAt, doneAt, endF: f, fb: S.fb, wg: S.wg, M, wpMetF };
}

// ---------- 评分：路标解锁·1000 + 目标 5000+剩余时间·0.5 − shaping(下一未达) − 时长·0.3 − 原语数
// v2：shaping 加 0.3 权重的 target 恒定项（无路标梯度的角色也有弱牵引，防 wg 原地/西行）
function scoreOf(segC, seqFb, seqWg, r) {
  if (r.deathF >= 0) return { score: -1e6, unlocked: 0, met: false, dead: r.deadWho };
  const unlocked = r.wpMetF.filter((x) => x >= 0).length;
  const met = r.metAt >= 0;
  let s = unlocked * 1000 + (met ? 5000 + (segC.horizonF - r.metAt) * 0.5 : 0);
  if (!met) {
    const next = segC.wpG.find((_, wi) => r.wpMetF[wi] < 0) ?? segC.targetG;
    for (const c of next) {
      if (c.a.kind === "px") s -= Math.abs((c.a.role === "fb" ? r.fb.x : r.wg.x) - (c.a.min + c.a.max) / 2);
      if (c.a.kind === "py") s -= 2 * Math.abs((c.a.role === "fb" ? r.fb.y : r.wg.y) - (c.a.min + c.a.max) / 2);
    }
    for (const c of segC.targetG) {
      if (c.a.kind === "px") s -= 0.3 * Math.abs((c.a.role === "fb" ? r.fb.x : r.wg.x) - (c.a.min + c.a.max) / 2);
      if (c.a.kind === "py") s -= 0.6 * Math.abs((c.a.role === "fb" ? r.fb.y : r.wg.y) - (c.a.min + c.a.max) / 2);
    }
    s -= (r.doneAt ?? segC.horizonF) * 0.3;
  }
  s -= (seqFb.length + seqWg.length);
  return { score: s, unlocked, met };
}

// ---------- beam 主循环（深度平衡交替扩展 + 每角色深度上限）
const result = { beam: BEAM, segs: [] };
let seedNodes = null; // 上一段幸存者 [{seqFb, seqWg, endState:{S,M}}]
let evalsTotal = 0;
for (const segDef of segs) {
  const segC = {
    id: segDef.id, level: LEVEL, horizonF: segDef.horizonF,
    entryG: compileGroup(segDef.entry),
    wpG: (segDef.waypoints ?? []).map(compileGroup),
    targetG: compileGroup(segDef.target),
  };
  const vocab = VOCAB[segDef.id];
  const t0 = Date.now();
  // seam：用种子终态校验入场断言（S0 种子 = 空程序）
  let seeds = seedNodes ?? [{ seqFb: [], seqWg: [], end: { S: null, M: null } }];
  if (seedNodes) {
    const passed = [];
    for (const n of seeds) {
      const entryProbe = evaluateEntry(segC, n);
      if (entryProbe) passed.push(n);
    }
    console.log(`  ${segDef.id} seam: 种子 ${seeds.length} → 过入场断言 ${passed.length}`);
    if (!passed.length) {
      result.segs.push({ id: segDef.id, solved: false, seamFail: true, evals: 0, layers: [] });
      console.log(`${segDef.id} 种子全部不过入场断言——停`); break;
    }
    seeds = passed;
  }
  let beam = seeds.map((n) => ({ seqFb: n.seqFb, seqWg: n.seqWg }));
  const layers = [];
  let segEvals = 0, solved = null, bestEver = null;
  const seen = new Set(); // 程序签名去重
  for (let depth = 1; depth <= MAXDEPTH; depth++) {
    const cands = [];
    let deadKept = [];
    for (const node of beam) {
      const dFb = node.seqFb.length, dWg = node.seqWg.length;
      const role = dFb > dWg ? "wg" : dWg > dFb ? "fb" : (depth % 2 ? "fb" : "wg");
      if ((role === "fb" && dFb >= 7) || (role === "wg" && dWg >= 6)) continue;
      for (const primC of vocab[role]) {
        const inst = primC(); // 构造一次取稳定名（工厂无副作用；evaluate 内会再构造全新实例）
        const seqFb = role === "fb" ? [...node.seqFb, primC] : node.seqFb;
        const seqWg = role === "wg" ? [...node.seqWg, primC] : node.seqWg;
        const sig = `${seqFb.map((p) => p().name).join(",")}|${seqWg.map((p) => p().name).join(",")}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        void inst;
        const r = evaluate(segC, seqFb, seqWg);
        segEvals++; evalsTotal++;
        const sc = { seqFb, seqWg, end: { S: { fb: r.fb, wg: r.wg }, M: r.M }, ...scoreOf(segC, seqFb, seqWg, r), _r: r };
        if (r.deathF >= 0) { deadKept.push({ ...sc, dead: `${r.deadWho}@f${r.deathF}` }); continue; } // 死亡剪枝（全灭时软回退用）
        cands.push(sc);
      }
    }
    if (!cands.length) {
      // 软回退：整层皆死 → 保留死因最晚的 3 个死候选（分量 −1e5），搜索绕行
      if (!deadKept.length) { console.log(`  ${segDef.id} d${depth}: 无可扩展（前沿耗尽/深度上限）`); break; }
      deadKept.sort((x, y) => (y._r.deathF - x._r.deathF));
      beam = deadKept.slice(0, 3).map((c) => ({ ...c, score: -1e5 + (c._r.deathF) }));
      console.log(`  ${segDef.id} d${depth}: 全灭（死者 ${deadKept[0].dead} 等）→ 软回退保留 3 个晚死候选`);
      continue;
    }
    // 仅前沿（经典 beam）：父代不与子代同池——时长惩罚使子代恒劣于父代，同池会耗尽前沿假死
    cands.sort((x, y) => y.score - x.score);
    beam = cands.slice(0, BEAM);
    const b = beam[0];
    bestEver = b;
    layers.push({ depth, evals: segEvals, best: +b.score.toFixed(0), unlocked: b.unlocked, met: b.met, deathFree: true, fb: [+b.end.S.fb.x.toFixed(0), +b.end.S.fb.y.toFixed(0)], wg: [+b.end.S.wg.x.toFixed(0), +b.end.S.wg.y.toFixed(0)] });
    console.log(`  ${segDef.id} d${depth}: evals=${segEvals} best=${b.score.toFixed(0)} unlocked=${b.unlocked}/${segC.wpG.length} met=${b.met} fb=[${b.end.S.fb.x.toFixed(0)},${b.end.S.fb.y.toFixed(0)}] wg=[${b.end.S.wg.x.toFixed(0)},${b.end.S.wg.y.toFixed(0)}] path=[${b.seqFb.map((p) => p().name).join(",")} | ${b.seqWg.map((p) => p().name).join(",")}]`);
    if (b.met) { solved = b; break; }
    if (segEvals > BUDGET) { console.log(`  ${segDef.id} 预算耗尽`); break; }
  }
  result.segs.push({
    id: segDef.id, solved: !!solved, evals: segEvals, wallS: +((Date.now() - t0) / 1000).toFixed(1),
    layers, bestPath: (solved ?? bestEver) ? { fb: (solved ?? bestEver).seqFb.map((p) => p().name), wg: (solved ?? bestEver).seqWg.map((p) => p().name) } : null,
  });
  if (!solved) { console.log(`${segDef.id} 未解——后续段中止`); break; }
  seedNodes = beam.slice(0, 3).map((n) => ({ seqFb: n.seqFb, seqWg: n.seqWg, end: n.end }));
}
result.evalsTotal = evalsTotal;
writeFileSync(new URL("./beam-seg-result.json", import.meta.url), JSON.stringify(result, null, 1));
console.log(`\n总 evals=${evalsTotal}，结果已写 beam-seg-result.json`);

// 入场断言严格校验：重放种子程序到其冻结帧，取该帧状态判 entry（简化：直接重放并逐帧查 entry，
// 段入口即上一段 target 帧——上一段已在 target 帧断过 target ⊇ entry？不必然，故逐帧找 entry 首帧并要求 ≤ target 帧+2）
function evaluateEntry(segC, node) {
  const w = makeWorld(LEVEL);
  const R = { fb: { prog: node.seqFb.map((c) => c()), i: 0 }, wg: { prog: node.seqWg.map((c) => c()), i: 0 } };
  const snap = (role) => {
    const s = w.snapshotPlayer(ROLE[role]);
    return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, grounded: w.players[ROLE[role]].feetContacts.length > 0, dying: s.dying, dead: s.dead };
  };
  for (let f = 0; f < segC.horizonF + 100; f++) {
    const inputs = {};
    for (const role of ["fb", "wg"]) {
      const r = R[role];
      const cur = r.prog[r.i];
      if (!cur) { inputs[role] = NONE; continue; }
      if (cur._sf === undefined) cur._sf = 0; else cur._sf++;
      const ctx = { stepF: cur._sf, me: snap(role), other: snap(role === "fb" ? "wg" : "fb"), w };
      inputs[role] = cur.run(ctx) ?? NONE;
      let d = false;
      try { d = cur.done(ctx); } catch { d = false; }
      if (d) r.i++;
    }
    w.step(1 / 60, { fireboy: inputs.fb, watergirl: inputs.wg });
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    if (a.dying || a.dead || b.dying || b.dead) return false;
    const S = { fb: { ...a, grounded: w.players.fireboy.feetContacts.length > 0 }, wg: { ...b, grounded: w.players.watergirl.feetContacts.length > 0 } };
    if (allS(segC.entryG, S, w.mechSnapshot())) return true; // 入场态在种子程序演化中出现过即可（autosearch 将改为"段尾精确定格"）
  }
  return false;
}
