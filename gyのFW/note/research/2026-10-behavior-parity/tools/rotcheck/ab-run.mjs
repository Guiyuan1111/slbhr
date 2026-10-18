/**
 * rotcheck A/B 取证驱动：起 headless chromium，加载 ab-page.html，喂 final-b.json 的
 * oracle 实录 θ(t)（60Hz），逐 16.667ms 泵渲染帧，回收两算法的渲染角序列并算误差。
 * 误差基准 = 60Hz 真值线性插值（原版每帧直读 body.angle 的等效基准）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const d = JSON.parse(readFileSync("TEMP/rotcheck/final-b.json", "utf8"));
// oracle 侧 θ(t) 即最终物理真值（对拍已证位级同源）：行存 ang（每帧）
const dtMs = d.dtMs;
const ang = d.rows.map((r) => r.ang[0]);

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
await page.goto("file://" + process.cwd() + "/TEMP/rotcheck/ab-page.html");
const nSchema = await page.evaluate((payload) => window.__ab.load(payload), { dtMs, ang });
console.log(`[ab] schema 帧数=${nSchema} 总时长=${(dtMs.reduce((a, b) => a + b, 0) / 1000).toFixed(2)}s`);
await page.evaluate((n) => window.__ab.step(n), Math.ceil((dtMs.reduce((a, b) => a + b, 0) + 200) / (1000 / 60)));
const r = await page.evaluate(() => window.__ab.drain());
await browser.close();

// 误差统计（渲染角 vs 真值，度）
const abs = (x) => Math.abs(x);
const errs = (seq) => seq.map((a, i) => (a - r.truth[i]) * (180 / Math.PI));
const stat = (e) => {
  const s = [...e.map(abs)].sort((a, b) => a - b);
  const rms = Math.sqrt(e.reduce((acc, x) => acc + x * x, 0) / e.length);
  return { rmsDeg: +rms.toFixed(4), maxDeg: +s[s.length - 1].toFixed(4), medianDeg: +s[Math.floor(s.length / 2)].toFixed(4) };
};
const eOld = errs(r.old);
const eNew = errs(r.neu);
// 渲染角逐帧增量谱（阶梯 vs 平滑的直接证据）：|Δ| 的分布
const steps = (seq) => {
  const ds = [];
  for (let i = 1; i < seq.length; i++) ds.push(Math.abs((seq[i] - seq[i - 1]) * (180 / Math.PI)));
  const s = [...ds].sort((a, b) => a - b);
  const zeros = ds.filter((x) => x < 1e-9).length;
  return { zeroFrames: zeros, medianStepDeg: +s[Math.floor(s.length / 2)].toFixed(4), maxStepDeg: +s[s.length - 1].toFixed(4) };
};
const out = {
  frames: r.frame,
  old: { err: stat(eOld), steps: steps(r.old) },
  neu: { err: stat(eNew), steps: steps(r.neu) },
};
console.log(JSON.stringify(out, null, 1));
writeFileSync("TEMP/rotcheck/ab-result.json", JSON.stringify({ ...out, series: { truth: r.truth, old: r.old, neu: r.neu } }));
console.log("[ab] → TEMP/rotcheck/ab-result.json");
process.exit(0);
