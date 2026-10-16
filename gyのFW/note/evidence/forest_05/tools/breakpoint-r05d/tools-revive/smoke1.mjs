// botrevive 冒烟 1：botcore.mjs 复活验证（三段：格式同构 / 闭环原语有效性 / 驱动等价性）
// 运行：在 gyのFW 根执行  node --import tsx TEMP/botrevive/smoke1.mjs
import { readFileSync } from "node:fs";
import { makeWorld, runKernel } from "../../scripts/e2e/routetool/kernel.mjs";
import { NONE, S, S2, drive, toRouteDoc } from "../../scripts/e2e/routetool/botcore.mjs";

const out = (k, v) => console.log(`[${k}]`, typeof v === "string" ? v : JSON.stringify(v));
const snap = (w, role) => {
  const s = w.snapshotPlayer(role);
  return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, dead: s.dead || s.dying };
};

// ════════ A. 格式同构 ════════
out("A.0", "=== 格式同构 ===");
const baseDoc = JSON.parse(readFileSync(new URL("../../scripts/e2e/inputs/routes/forest_01.json", import.meta.url), "utf8"));
const kRun = runKernel("forest_01", baseDoc);
out("A.1 基线 runKernel(forest_01 绿路线)", kRun); // 期望 won:true winF≈2365

// 最小剧本：fb 站定，wg goTo(200,10)
const w1 = makeWorld("forest_01");
const cap1 = []; // 每帧原始位置（onFrame=该帧 step 前状态，即 f 步之后）
const r1 = drive(w1, { fb: [S.settle("fb落定")], wg: [S.settle("wg落定"), S.goTo(200, 10, "go200")] }, 600, {
  onFrame: (f) => cap1.push({ f, fb: snap(w1, "fireboy"), wg: snap(w1, "watergirl") }),
});
out("A.2 最小剧本 drive", r1.result);
const wg1 = snap(w1, "watergirl");
out("A.3 wg 终态", wg1);
const mini = toRouteDoc("forest_01", r1.events, 600, "botrevive smoke A 最小剧本");
out("A.4 toRouteDoc 字段集", Object.keys(mini).sort());
out("A.4 基线 routes 字段集", Object.keys(baseDoc).sort());
const evKeysMini = [...new Set([...mini.fb, ...mini.wg].map((e) => Object.keys(e).sort().join(",")))].sort();
const evKeysBase = [...new Set([...baseDoc.fb, ...baseDoc.wg].map((e) => Object.keys(e).sort().join(",")))].sort();
out("A.5 事件项字段集 doc/基线", [evKeysMini, evKeysBase]);
const iso = JSON.stringify(Object.keys(mini).sort()) === JSON.stringify(Object.keys(baseDoc).sort())
  && JSON.stringify(evKeysMini) === JSON.stringify(evKeysBase) && mini.tickHz === baseDoc.tickHz;
out("A.6 同构判定", iso ? "ISOMORPHIC" : "MISMATCH");
out("A.7 mini 事件表", { fb: mini.fb, wg: mini.wg });
// 反向验证：mini 事件表经 runKernel（开环回放）应与闭环 drive 终态一致（全精度）
const kMiniT = [];
const kMini = runKernel("forest_01", mini, { traceTo: kMiniT });
const kMiniLast = kMiniT[kMiniT.length - 1];
out("A.8 mini 事件表 runKernel", { ...kMini, lastTrace: kMiniLast });
out("A.9 等价: 闭环终态 vs 事件表回放终态 wg.x", [wg1.x, kMiniLast.wg[0], wg1.x === kMiniLast.wg[0]]);
out("A.9 等价: wg.y", [wg1.y, kMiniLast.wg[1], wg1.y === kMiniLast.wg[1]]);

// ════════ B. 闭环原语有效性 ════════
out("B.0", "=== 闭环原语有效性 ===");
// B.1 goTo 定点走位精度（fb 主场底板，多目标×多容差；记录 done 触发帧与当时精度）
for (const [tx, tol] of [[300, 14], [500, 14], [300, 6], [500, 6], [640, 8]]) {
  const w = makeWorld("forest_01");
  let doneF = -1, doneX = NaN;
  const g = S.goTo(tx, tol, "go" + tx);
  const gWrap = { ...g, done: (c) => { const d = g.done(c); if (d && doneF < 0) { doneF = c.f; doneX = c.me.x; } return d; } };
  const r = drive(w, { fb: [S.settle("落定"), gWrap, S.sleep(30, "驻留")], wg: [S.settle()] }, 900, {});
  const fb = snap(w, "fireboy");
  out(`B.1 goTo(${tx},tol${tol})`, { result: r.result, doneF, doneX: +doneX.toFixed(2), doneErr: +(doneX - tx).toFixed(2), finalX: +fb.x.toFixed(2), finalErr: +(fb.x - tx).toFixed(2), fbEvents: r.events.fb.length });
}
// B.1b wg 主场（出生台）goTo：短目标
for (const [tx, tol] of [[130, 8], [110, 14]]) {
  const w = makeWorld("forest_01");
  let doneF = -1, doneX = NaN;
  const g = S.goTo(tx, tol, "go" + tx);
  const gWrap = { ...g, done: (c) => { const d = g.done(c); if (d && doneF < 0) { doneF = c.f; doneX = c.me.x; } return d; } };
  const r = drive(w, { fb: [S.settle()], wg: [S.settle("落定"), gWrap, S.sleep(30, "驻留")] }, 900, {});
  const wg = snap(w, "watergirl");
  out(`B.1b wg goTo(${tx},tol${tol})`, { result: r.result, doneF, doneX: +doneX.toFixed(2), doneErr: +(doneX - tx).toFixed(2), finalX: +wg.x.toFixed(2), finalErr: +(wg.x - tx).toFixed(2), wgEvents: r.events.wg.length });
}
// B.2 jump 起跳有效
{
  const w = makeWorld("forest_01");
  const cap = [];
  const r = drive(w, { fb: [S.settle("落定"), S.jump("原地跳"), S.sleep(50, "落地驻留")], wg: [S.settle()] }, 200, {
    onFrame: (f) => cap.push({ f, ...snap(w, "fireboy"), g: w.players.fireboy.feetContacts.length > 0 }),
  });
  const y0 = cap[0].y;
  const airFrames = cap.filter((p) => !p.g).length;
  const minY = Math.min(...cap.map((p) => p.y));
  out("B.2 jump", { result: r.result, fbEvents: r.events.fb, airFrames, riseY: +(y0 - minY).toFixed(2), minY: +minY.toFixed(2), y0: +y0.toFixed(2) });
}
// B.3 死亡/胜利短路
{
  const probe = (who, dir, total = 1000) => {
    const w = makeWorld("forest_01");
    const step = [S.settle("落定"), S.hold(dir, () => false, "送死" + dir)];
    const prog = who === "fb" ? { fb: step, wg: [S.settle()] } : { fb: [S.settle()], wg: step };
    const r = drive(w, prog, total, {});
    return { who, dir, ...r.result };
  };
  out("B.3 fb→right", probe("fb", "right"));
  out("B.3 fb→left", probe("fb", "left"));
  out("B.3 wg→right", probe("wg", "right"));
  out("B.3 wg→left", probe("wg", "left"));
}

// ════════ C. 驱动等价性（同事件表：runKernel 开环 vs drive 闭环）════════
out("C.0", "=== 驱动等价性 ===");
const replayProg = (evs, total) => {
  // 与 kernel.expandFlat 同语义展开：同帧先 up 后 down，状态逐帧累计
  const st = { up: false, left: false, right: false };
  const byF = new Map();
  for (const e of [...evs].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1))) {
    byF.set(e.f, [...(byF.get(e.f) ?? []), [e.dir, e.type === "down"]]);
  }
  const stateAt = new Map();
  for (let f = 0; f < total; f++) {
    for (const [k, v] of byF.get(f) ?? []) st[k] = v;
    stateAt.set(f, { ...st });
  }
  return [{ name: "replay", run: (c) => stateAt.get(c.f) ?? NONE, done: () => false }];
};
{
  const total = baseDoc.totalFrames;
  const kT = [];
  const k = runKernel("forest_01", baseDoc, { traceTo: kT });
  const w = makeWorld("forest_01");
  const dT = []; // onFrame(f) = f 步后状态 → 与 kT[f-1] 对齐
  const d = drive(w, { fb: replayProg(baseDoc.fb, total), wg: replayProg(baseDoc.wg, total) }, total, {
    onFrame: (f) => dT.push({ fb: snap(w, "fireboy"), wg: snap(w, "watergirl") }),
  });
  out("C.1 结果对比 runKernel/drive", [
    { won: k.won, winF: k.winF },
    d.result,
  ]);
  const winF = k.winF;
  let n = 0, bad = 0, worst = "";
  for (let f = 0; f < winF; f++) { // kT[f] = f+1 步后状态 = dT[f+1]
    for (const role of ["fb", "wg"]) {
      const a = kT[f][role], b = dT[f + 1][role];
      n += 4;
      if (a[0] !== b.x || a[1] !== b.y) { bad++; if (!worst) worst = `f${f}${role} k=(${a[0]},${a[1]}) d=(${b.x},${b.y})`; }
    }
  }
  out("C.2 位级位置对比（kT[f] vs dT[f+1]）", { comparedRolesFrames: winF, scalars: n, mismatch: bad, first: worst });
  // 事件表对比：drive 记录的事件应等于基线表中 f<=winF 的部分
  const canon = (arr) => [...arr].sort((a, b) => a.f - b.f || a.dir.localeCompare(b.dir) || a.type.localeCompare(b.type)).map((e) => `${e.f}:${e.dir}:${e.type}`);
  const docFb = canon(baseDoc.fb.filter((e) => e.f <= winF)), docWg = canon(baseDoc.wg.filter((e) => e.f <= winF));
  const drvFb = canon(d.events.fb), drvWg = canon(d.events.wg);
  const eqArr = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  out("C.3 事件表 fb 一致", { docN: docFb.length, drvN: drvFb.length, equal: eqArr(docFb, drvFb) });
  out("C.3 事件表 wg 一致", { docN: docWg.length, drvN: drvWg.length, equal: eqArr(docWg, drvWg) });
  if (!eqArr(docFb, drvFb)) {
    const diff = docFb.filter((v) => !drvFb.includes(v)).concat(drvFb.filter((v) => !docFb.includes(v)));
    out("C.3 fb 差异样本", diff.slice(0, 12));
  }
  if (!eqArr(docWg, drvWg)) {
    const diff = docWg.filter((v) => !drvWg.includes(v)).concat(drvWg.filter((v) => !docWg.includes(v)));
    out("C.3 wg 差异样本", diff.slice(0, 12));
  }
  // 原序对比（drives 内部 push 序 vs 文档原序）
  const rawEq = (xs, ys) => xs.length === ys.length && xs.every((v, i) => v.f === ys[i].f && v.dir === ys[i].dir && v.type === ys[i].type);
  out("C.4 原序(不排序)事件表 fb/wg 一致", [rawEq(d.events.fb, baseDoc.fb.filter((e) => e.f <= winF)), rawEq(d.events.wg, baseDoc.wg.filter((e) => e.f <= winF))]);
  // C.5 差异归因：文档多出的 down 是否都是"该键已处于按下态"的冗余重按？
  const frameState = (evs, total) => {
    const st = { up: false, left: false, right: false };
    const byF = new Map();
    for (const e of [...evs].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1))) {
      byF.set(e.f, [...(byF.get(e.f) ?? []), [e.dir, e.type === "down"]]);
    }
    const out2 = [];
    for (let f = 0; f < total; f++) {
      for (const [k, v] of byF.get(f) ?? []) st[k] = v;
      out2.push({ ...st });
    }
    return out2;
  };
  {
    const sDoc = { fb: frameState(baseDoc.fb, total), wg: frameState(baseDoc.wg, total) };
    const sDrv = { fb: frameState(d.events.fb, total), wg: frameState(d.events.wg, total) };
    let bad = 0, n2 = 0;
    for (const role of ["fb", "wg"]) {
      for (let f = 0; f < winF; f++) {
        for (const k of ["up", "left", "right"]) {
          n2++;
          if (sDoc[role][f][k] !== sDrv[role][f][k]) bad++;
        }
      }
    }
    out("C.5 逐帧输入状态对比(0..winF-1)", { scalars: n2, mismatch: bad });
    // 冗余沿归因：对 drive 缺失的每个 doc down，检查其同键前一 doc 事件是 down 且中间无 up
    const redundant = [];
    for (const role of ["fb", "wg"]) {
      const docE = baseDoc[role], drvSet = new Set(canon(d.events[role]));
      const lastByKey = {};
      for (const e of [...docE].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1))) {
        const key = e.dir;
        const sig = `${e.f}:${e.dir}:${e.type}`;
        if (e.type === "down" && !drvSet.has(sig) && lastByKey[key] === "down") redundant.push(`${role} ${sig}（同键已按下，冗余重按）`);
        lastByKey[key] = e.type;
      }
    }
    out("C.5 冗余 down 沿归因", redundant);
  }
}
// ════════ B.4 S2 实例化冒烟（brakedHop/edgeDrop 在 forest_01 平地执行不异常）════════
out("B.4", "=== S2 实例化冒烟 ===");
{
  const w = makeWorld("forest_01");
  const r = drive(w, { fb: [S.settle(), S2.brakedHop("right", 700, 400, "平地刹车跳")], wg: [S.settle()] }, 300, {});
  out("B.4 brakedHop(right,700,400)", r.result);
  const w2 = makeWorld("forest_01");
  const r2 = drive(w2, { fb: [S.settle(), S2.edgeDrop("right", 5, "平地缘口坠(不出缘→超时属预期)")], wg: [S.settle()] }, 200, {});
  out("B.4 edgeDrop(right,5)", r2.result);
}
out("Z.9", "smoke1 done");
