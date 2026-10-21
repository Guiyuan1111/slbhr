#!/usr/bin/env node
/**
 * 画布逐像素取证（门禁判 FAIL 之后用来回答"变了的是什么、为什么变"）。
 *
 * 为什么要有它：prephase-canvas / domskin 这类门禁只给一个 AE 数字。"AE=1945"既不区分
 * "缺了一个字框"（必须回滚）和"抗锯齿边上 ±1/255 的浮点重舍入"（换代可接受），
 * 也不区分 α 被动过（会露出背景，是真缺陷）。这三种情况要分开处置，就得把
 * ① 每通道差异计数与最大差、② α 是否逐像素相同、③ 差异像素落在渐变上还是平坦区、
 * ④ 空间分布（包围盒 + 热点行）摆到一起看。本工具一次算全并落 JSON，供报告引用。
 *
 * 判读口径（本工具只把事实摊开，处置由人裁并写进当轮报告）：
 *  - 差异像素 100% 落在"3x3 邻域有渐变"的位置 ⇒ 边缘采样/舍入层面的变化；
 *  - 平坦区出现差异 ⇒ 有像素被搬走或被清掉，属实现缺陷，不得刷基线；
 *  - 任一像素 α 有差 ⇒ 透明层被改动，直接失败。但"α 相同"只有在两边都是 RGBA(type 6)
 *    时才有内容：浏览器截图基线是 RGB(type 2)，decodePng 补出来的 α 恒 255，
 *    这种配对里 α 一栏直接标 n/a，不得当透明度证据。
 *
 * 用法：
 *   node scripts/e2e/pixel-forensics.mjs --pair TEMP/x/menu-base.png,TEMP/x/menu-cur.png [--pair ...] [--json out.json]
 *   标签取 base 文件名去掉目录与 `-base` 之后的部分。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng } from "../png-raw.mjs";

const argv = process.argv.slice(2);
const pairs = [];
let jsonOut = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--json") {
    jsonOut = argv[++i];
    continue;
  }
  if (argv[i] !== "--pair") continue;
  const spec = argv[++i];
  if (!spec || !spec.includes(",")) throw new Error('--pair 需要 "base.png,cur.png" 两项');
  const [base, cur] = spec.split(",");
  pairs.push({ label: base.replace(/-?base\.png$/, "").replace(/.*\//, ""), base, cur });
}
if (pairs.length === 0) throw new Error("至少要一个 --pair");

/** 3x3 邻域通道极差：0＝完全平坦的内部/背景，>0＝处在渐变（笔画反锯齿边）上 */
function localRange(img, x, y, ch) {
  let mn = 255;
  let mx = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h) continue;
      const v = img.data[(yy * img.w + xx) * 4 + ch];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  return mx - mn;
}

const rows = [];
for (const p of pairs) {
  const a = decodePng(readFileSync(p.base), p.base);
  const b = decodePng(readFileSync(p.cur), p.cur);
  if (a.w !== b.w || a.h !== b.h) throw new Error(`${p.label}：两图尺寸不同 ${a.w}x${a.h} vs ${b.w}x${b.h}`);
  // RGB(type 2) 截图被 decodePng 补成 α=255，两侧恒同 ⇒ α 这栏没有信息
  const noAlpha = a.color !== 6 || b.color !== 6;
  const perCh = [0, 0, 0, 0];
  const maxCh = [0, 0, 0, 0];
  let n = 0;
  let onEdge = 0;
  let alphaDiff = 0;
  let sumAbs = 0;
  let minX = Infinity;
  let maxX = -1;
  let minY = Infinity;
  let maxY = -1;
  const rowCount = new Map();
  for (let i = 0; i < a.w * a.h; i++) {
    const o = i * 4;
    let any = false;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(a.data[o + c] - b.data[o + c]);
      if (!d) continue;
      perCh[c]++;
      maxCh[c] = Math.max(maxCh[c], d);
      sumAbs += d;
      any = true;
      if (c === 3) alphaDiff++;
    }
    if (!any) continue;
    n++;
    const x = i % a.w;
    const y = (i / a.w) | 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    rowCount.set(y, (rowCount.get(y) ?? 0) + 1);
    let ch = 0;
    for (; ch < 3; ch++) if (a.data[o + ch] !== b.data[o + ch]) break;
    if (localRange(a, x, y, ch) > 0) onEdge++;
  }
  const hot = [...rowCount.entries()]
    .sort((p2, q2) => q2[1] - p2[1])
    .slice(0, 6)
    .map(([y, c]) => `y${y}:${c}`)
    .join(" ");
  rows.push({
    label: p.label,
    size: `${a.w}x${a.h}`,
    sourceColors: `base type ${a.color} / cur type ${b.color}`,
    alphaComparable: !noAlpha,
    diffPixels: n,
    diffPct: +((n / (a.w * a.h)) * 100).toFixed(4),
    perChannel: { R: perCh[0], G: perCh[1], B: perCh[2], A: noAlpha ? "n/a" : perCh[3] },
    maxPerChannel: noAlpha ? `${maxCh[0]}/${maxCh[1]}/${maxCh[2]}/n-a` : maxCh.join("/"),
    meanAbsDiff: n ? +(sumAbs / (n * (noAlpha ? 3 : 4))).toFixed(3) : 0,
    alphaDiffPixels: noAlpha ? "n/a" : alphaDiff,
    onGradient: onEdge,
    onGradientPct: n ? +((onEdge / n) * 100).toFixed(2) : 0,
    flatDiffPixels: n - onEdge,
    bbox: n ? `x[${minX},${maxX}] y[${minY},${maxY}]` : "无",
    hotRows: hot,
  });
}

for (const r of rows) {
  console.log(
    `${r.label.padEnd(15)} 差异 ${String(r.diffPixels).padStart(5)} 像素（${r.diffPct}%）` +
      ` 按通道 R${r.perChannel.R} G${r.perChannel.G} B${r.perChannel.B} A${r.perChannel.A}` +
      ` 最大差 ${r.maxPerChannel} 均值 ${r.meanAbsDiff}`,
  );
  console.log(
    `${" ".repeat(15)} 渐变上 ${r.onGradient}（${r.onGradientPct}%）/ 平坦区 ${r.flatDiffPixels}` +
      `  α 有差 ${r.alphaDiffPixels}（${r.sourceColors}）  包围盒 ${r.bbox}`,
  );
  if (r.hotRows) console.log(`${" ".repeat(15)} 热点行 ${r.hotRows}`);
}
const totN = rows.reduce((s, r) => s + r.diffPixels, 0);
const totEdge = rows.reduce((s, r) => s + r.onGradient, 0);
const totFlat = totN - totEdge;
const alphaKnown = rows.every((r) => r.alphaComparable);
const totAlpha = alphaKnown ? rows.reduce((s, r) => s + r.alphaDiffPixels, 0) : null;
console.log(
  `\n合计：差异 ${totN} 像素，渐变上 ${totEdge}（${totN ? ((totEdge / totN) * 100).toFixed(2) : "—"}%）、` +
    `平坦区 ${totFlat}、α 有差 ${totAlpha === null ? "n/a（源为 RGB 截图，无 α 可比）" : totAlpha}`,
);
console.log(
  (totAlpha ?? 0) > 0
    ? "判定：α 被改动 ⇒ 透明层出错，属缺陷，不得刷基线"
    : totFlat > 0
      ? `判定：平坦区仍有 ${totFlat} 个差异 ⇒ 有像素被搬走或被清掉，须逐个定位后再谈换代`
      : "判定：差异全部落在抗锯齿渐变上 ⇒ 采样/舍入层面的变化，可按换代流程入账" +
        (alphaKnown ? "（α 亦逐像素相同）" : "（透明度不在此证据内，需另取自带 α 的画布采样）"),
);

if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify(
      { generatedBy: "scripts/e2e/pixel-forensics.mjs", pairs, rows, totals: { diffPixels: totN, onGradient: totEdge, flat: totFlat, alphaDiff: totAlpha } },
      null,
      2,
    ),
  );
  console.log(`JSON → ${jsonOut}`);
}
