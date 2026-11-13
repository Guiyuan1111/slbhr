// etutorial-summarize.mjs — 从 TEMP 各 case 输出提取关键数字 → tools/etutorial-evidence.json（可复现摘录）
// 用法: 先跑完 11 个 case（输出在 TEMP/fw-oe-1/etutorial-case-*.out.json），再 node etutorial-summarize.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TEMP = "/home/gy/桌面/dev/slbhr/TEMP/fw-oe-1";
const OUT = "/home/gy/桌面/dev/slbhr/gyのFW/note/evidence/2026-10-31-oracle-adjudication/tools/etutorial-evidence.json";
const r2 = (v) => Math.round(v * 100) / 100;

const files = readdirSync(TEMP).filter((f) => /^etutorial-case-.+\.out\.json$/.test(f));
const get = (s, f, name) => {
  for (const m of s[f].m) if (m[0] === name) return m.slice(1);
  return null;
};
const gs = (sample, name) => {
  for (const m of sample.m) if (m[0] === name) return m.slice(1);
  return null;
};
const findFrame = (s, pred) => { for (const x of s) if (pred(x)) return x.f; return null; };

const out = { generatedBy: "fw-oracle-etutorial", date: "2026-11-01", cases: {} };

for (const f of files) {
  const d = JSON.parse(readFileSync(join(TEMP, f), "utf8"));
  const s = d.samples;
  const name = d.name;
  const feet = (x, w) => r2(x[w][1] + 35.2);
  const rec = { frames: d.frames, events: d.events, lastG: s[s.length - 1].g };

  const minFeetFb = Math.min(...s.map((x) => feet(x, "fb")));
  const minFeetWg = Math.min(...s.map((x) => feet(x, "wg")));
  if (/maxrise|runjump|t14|boxclip|mesa-range/.test(name)) {
    rec.minFeetFb = r2(minFeetFb);
    rec.maxXfb = r2(Math.max(...s.map((x) => x.fb[0])));
    if (name === "et-runjump") {
      const flight = s.filter((x) => x.f >= 100 && feet(x, "fb") < 639);
      rec.runjumpRangeDx = flight.length ? r2(Math.abs(flight[flight.length - 1].fb[0] - flight[0].fb[0])) : null;
    }
    if (/t14/.test(name)) {
      let best = null;
      for (const x of s) { const ft = feet(x, "fb"); if (!best || ft < best.feet) best = { f: x.f, feet: r2(ft), x: r2(x.fb[0]) }; }
      rec.bestJump = best;
    }
  }
  if (name === "et-b0-press") {
    rec.p0 = { rest: get(s, 0, "p0")?.[1], end: get(s, s.length - 1, "p0")?.[1] };
    rec.b0StateEnd = get(s, s.length - 1, "b0s")?.[0];
    rec.p0FirstAt944 = findFrame(s, (x) => { const v = gs(x, "p0"); return v && v[1] > 943; });
  }
  if (name === "et-b1-press") {
    rec.p1 = { rest: get(s, 0, "p1")?.[1], end: get(s, s.length - 1, "p1")?.[1] };
    rec.b1StateEnd = get(s, s.length - 1, "b1s")?.[0];
    const idx = s.findIndex((x) => { const v = gs(x, "p1"); return v && v[1] < 849; });
    rec.p1FirstAt848 = idx === -1 ? null : idx;
  }
  if (name === "et-pulley") {
    const platesEnd = {};
    for (const m of s[s.length - 1].m) if (m[0].startsWith("plate")) platesEnd[m[0]] = [m[1], m[2]];
    const plates0 = {};
    for (const m of s[0].m) if (m[0].startsWith("plate")) plates0[m[0]] = [m[1], m[2]];
    rec.platesRest = plates0;
    rec.platesEnd = platesEnd;
    rec.x1End = get(s, s.length - 1, "x1");
    // 相位1：x1 自 (784,300) 下落是否触 A（A=plate at x≈784 静息 y=144）
    const aPlateKey = Object.keys(plates0).find((k) => Math.abs(plates0[k][0] - 784) < 3);
    rec.aPlateKey = aPlateKey;
    rec.x1MinYPhase1 = r2(Math.min(...s.slice(10, 150).map((x) => gs(x, "x1")[1])));
  }
  if (name === "et-doorpc") {
    rec.ended = rec.lastG.ended; rec.state = rec.lastG.st;
    rec.d1isUpFrame = findFrame(s, (x) => x.g.d1u);
    rec.d2isUpFrame = findFrame(s, (x) => x.g.d2u);
  }
  if (/lava/.test(name)) {
    rec.wgDeadFrame = findFrame(s, (x) => x.wg[4] === 1);
    rec.fbDeadFrame = findFrame(s, (x) => x.fb[4] === 1);
    rec.fbFeetAt20 = feet(s[20], "fb");
    rec.wgFeetAt20 = feet(s[20], "wg");
  }
  if (name === "et-mesa-range") {
    rec.everOnB0Layer = s.some((x) => 640 <= x.fb[0] && x.fb[0] <= 864 && feet(x, "fb") <= 832.5);
    rec.maxXBeforeGapFall = r2(Math.max(...s.filter((x) => x.f <= 130).map((x) => x.fb[0])));
  }
  out.cases[name] = rec;
}

// dump 静态数字（若存在）
const dumpPath = join(TEMP, "et-dump.json");
if (existsSync(dumpPath)) {
  const d = JSON.parse(readFileSync(dumpPath, "utf8"));
  out.dump = {
    level: d.levelFilename, gravity: d.gravity, totalDiamonds: d.totalDiamonds,
    pers1: { char: d.pers1.char, sprite: d.pers1.sprite, jumpVelocity: d.pers1.jumpVelocity, mass: d.pers1.mass, maxSpeed: d.pers1.maxSpeed },
    pers2: { char: d.pers2.char, sprite: d.pers2.sprite },
    door1: d.door1.pos, door2: d.door2.pos,
    groundFixtureCount: d.groundFixtureCount,
    objects: d.objects.map((o) => ({ i: o.i, type: o.otype, x: o.options.x, y: o.options.y, props: o.options.properties, dy: o.options.dy, density: o.options.density })),
    worldBodiesOfInterest: d.worldBodies
      .map((b, i) => ({ i, ud: b.ud, screen: b.screen }))
      .filter((b) => b.ud === "reactable" || [24, 25, 26, 27, 28].includes(b.i) || [10, 11, 12, 13, 14, 15, 16, 17].includes(b.i)),
  };
}
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log("written:", OUT);
console.log("cases:", Object.keys(out.cases).join(", "));
