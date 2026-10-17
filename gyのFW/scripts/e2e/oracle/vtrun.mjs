#!/usr/bin/env node
/**
 * vtoracle·vtrun：确定性虚拟钟 oracle 跑输入脚本，导出状态流；--runs N 时做 ×N 逐位一致性验收。
 *
 * 用法：
 *   node scripts/e2e/oracle/vtrun.mjs --route forest_01 --runs 3 --out ../../scripts/e2e/out/oracle-vt/
 *   node scripts/e2e/oracle/vtrun.mjs --hold-right 900 --runs 3   # 自造脚本：双角色按住右 900 帧
 *
 * 输入脚本：--route <名>（scripts/e2e/inputs/routes/<名>.json，与 kernel/门禁同格式
 * { level, tickHz, totalFrames, fb:[{f,dir,type}], wg:[...] }）或 --hold-right <帧数>。
 * 输出：<out>/vt-<tag>-run<k>.json + 终端 verdict（BITEXACT / FIRST-DIFF@帧）。
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveOracle, runScript, expandInputs } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const E2E = resolve(HERE, ".."); // scripts/e2e
const ROUTES_DIR = join(E2E, "inputs/routes");
const log = (m) => console.log(`[vtrun] ${m}`);

function argVal(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}
const hasFlag = (flag) => process.argv.includes(flag);

const runs = Number(argVal("--runs", "3"));
const outDir = resolve(E2E, hasFlag("--out") ? argVal("--out") : "out/oracle-vt");
mkdirSync(outDir, { recursive: true });

let doc;
let tag;
if (hasFlag("--hold-right")) {
  const n = Number(argVal("--hold-right", "600"));
  doc = { level: "forest_01", tickHz: 60, totalFrames: n, fb: [{ f: 0, dir: "right", type: "down" }], wg: [{ f: 0, dir: "right", type: "down" }] };
  tag = `holdright${n}`;
} else {
  const name = argVal("--route", "forest_01");
  const path = name.includes("/") ? resolve(name) : join(ROUTES_DIR, `${name}.json`);
  doc = JSON.parse(readFileSync(path, "utf8"));
  tag = name.split("/").at(-1).replace(/\.json$/, "");
}
const { totalFrames } = doc;
const ins = expandInputs(doc.fb ?? [], doc.wg ?? [], totalFrames);
const levelFile = doc.level ? `${doc.level.startsWith("forest_01") ? "tutorials/levels" : "forest/levels"}/${doc.level}.json` : "tutorials/levels/forest_01.json";
log(`脚本=${tag} level=${doc.level ?? "forest_01"} 帧数=${totalFrames} fb事件=${doc.fb?.length ?? 0} wg事件=${doc.wg?.length ?? 0} runs=${runs}`);

const server = await serveOracle();
log(`伺服 ${server.base}`);

/** 规范化序列化（位比较口径：JSON 字符串全等 = 浮点逐位一致） */
const canon = (samples) => samples.map((s) => JSON.stringify(s)).join("\n");

const results = [];
for (let k = 1; k <= runs; k++) {
  const chunks = [];
  const r = await runScript({
    serverBase: server.base,
    levelId: 1,
    levelFile,
    totalFrames,
    fbIns: ins.fb,
    wgIns: ins.wg,
    onFrame: (f, chunk) => {
      chunks.push(...chunk);
      if ((f + 1) % 1000 === 0) log(`run${k}: 帧 ${f + 1}/${totalFrames} 采样 ${chunks.length}`);
    },
  });
  const rec = { tag, run: k, totalFrames, frames: r.frames, ended: r.ended, marks: r.marks, wallMs: r.wallMs, samples: chunks };
  const file = join(outDir, `vt-${tag}-run${k}.json`);
  writeFileSync(file, JSON.stringify(rec));
  const last = chunks.at(-1);
  log(`run${k}: 帧数=${r.frames} ended=${r.ended} marks=${JSON.stringify(r.marks)} 末样本 wg=(${last?.wg?.[0]?.toFixed(1)},${last?.wg?.[1]?.toFixed(1)}) fb=(${last?.fb?.[0]?.toFixed(1)},${last?.fb?.[1]?.toFixed(1)}) wall=${r.wallMs}ms → ${file}`);
  results.push(rec);
}

// ── ×N 逐位一致性验收 ──────────────────────────────────────────
if (runs >= 2) {
  const c0 = canon(results[0].samples);
  let verdict = "BITEXACT";
  for (let k = 1; k < runs; k++) {
    const ck = canon(results[k].samples);
    if (ck === c0) continue;
    verdict = "DIVERGED";
    const a = c0.split("\n");
    const b = ck.split("\n");
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (a[i] !== b[i]) {
        log(`run1 vs run${k + 1}: 首个不一致样本序号=${i}`);
        log(`  run1: ${a[i].slice(0, 240)}`);
        log(`  run${k + 1}: ${b[i].slice(0, 240)}`);
        break;
      }
    }
    if (a.length !== b.length) log(`run1 vs run${k + 1}: 样本数 ${a.length} != ${b.length}`);
  }
  log(`VERDICT ×${runs}: ${verdict}`);
  writeFileSync(join(outDir, `vt-${tag}-verdict.json`), JSON.stringify({ tag, runs, verdict, frames: results[0].frames, marks: results[0].marks }, null, 1));
}

await server.close();
process.exit(0);
