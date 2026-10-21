/**
 * 选关树浮雕纹理 CPU 烘焙（oracle 三张 canvas 纹理的字节级复刻）。
 *
 * 依据（实证于 note/research/2026-10-fidelity/37-temple-tree-branches.md §滤镜还原 与
 * TEMP/filterport 校准对拍，oracle RT 逐字节比对：内部平色 78,60,14 / 216,181,27 精确命中）：
 *  - 内容（bundle:1916856 h()）：边 strokeStyle=temple.color、lineWidth=16·x，逐边
 *    moveTo(x·C,y·k)→lineTo→stroke；底座 MenuAssets {type}_Bkg_Mask0000，scale x·c，
 *    顶点 (x·C−w/2, y·k−h/2)。imageAll=h(!0) 全量、imageAllBig=h(!0,1.2) 底影（线宽不放大）、
 *    imageDone=h(!1)（边：两端 state 和>2；底座：state>0）。
 *  - BevelFilter（bundle:1779406，GLSL 逐 op fp32 语义）：uv 加原始 step（res=3）；
 *    t=200 3 次迭代 / t=180 fp32 累积 4 次迭代（实测怪癖）；outer=1: alpha=a1+a2、
 *    rgb=0.5−dir·a1/6+dir·a2/6；outer=0: alpha=own、rgb=0.5+dir·a1/6−dir·a2/6；
 *    alpha>0.5→1；输出=(rgb·alpha, alpha)。FilterTexture texel 宽 WTX=canvas 宽
 *    （texImage2D GLsizei；内容压缩系数 FX=WTX/C）；unorm 转换 round-half-up
 *    （0.5+1ulp→128、0.5−1ulp→127 双向实证）。
 *  - ColorMatrix（bundle:1782424）：对角 1.7×tint，alpha 原样。
 *  - OutlineFilter（bundle:1772592）：20 角 −π 步 0.3142；采样 uv−thickness·px·(cos,sin)；
 *    resultAlpha=max(maxA,ownA)；ownA<0.1 → rgb·resultAlpha；否则 (rgb,1)。
 *
 * 性能：TreeBakeJob 行分片（step(budgetMs)，≤50ms/帧 约束→分帧）；同参结果模块级缓存，
 * 二次进入零开销。
 */
const fr = Math.fround;

/** GLSL for 循环偏移序列（fp32 字符串字面量 + fp32 累积；t=180 → 4 次迭代为实测怪癖） */
export function loopOffsets(thickness: number): number[] {
  const maxStep = fr(parseFloat(String(1 / thickness)));
  const step = fr(parseFloat(String(1 / thickness / 3)));
  const out: number[] = [];
  for (let cur = 0; cur < maxStep; cur = fr(cur + step)) out.push(cur);
  return out;
}

export interface BakeLevel {
  oid: number; // temple.json _id（edge source/target 引用它，非稀疏 id——原版 i=_find by _id）
  x: number;
  y: number;
  maskKey: string; // MenuAssets 底座帧前缀（Diamond/DiamondSpeed/DiamondPuzzle/DiamondDark）
  filename: string;
}
export interface MaskFrame {
  img: CanvasImageSource;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface TreeBakeParams {
  levels: BakeLevel[];
  edges: Array<{ source: number; target: number }>; // _id 系
  color: string; // "#RRGGBB"
  scale: number; // x = min(k,C)<800 ? 0.5 : 0.6
  canvasW: number; // floor(C)
  canvasH: number; // floor(k)
  Cf: number; // 逻辑 C（float）
  Kf: number; // 逻辑 k（float）
  masks: Map<string, MaskFrame>; // type → _Bkg_Mask0000 帧
  stateOf: (filename: string) => number; // 0 锁定 / 1 可玩 / 2..4 星数+1
}

/** 三层规格（对应 oracle h(!0,1.2)/h(!0)/h(!1) 与滤镜链 [u,a]/[n,a,v]/[m,j]） */
const LAYERS = [
  { key: "big", all: true, baseScale: 1.2, thickness: 200, outer: 1, dir: 1, outline: false, gold: false },
  { key: "all", all: true, baseScale: 1.0, thickness: 200, outer: 0, dir: -1, outline: true, gold: false },
  { key: "done", all: false, baseScale: 1.0, thickness: 180, outer: 0, dir: 1, outline: false, gold: true },
] as const;
export type TreeLayerKey = (typeof LAYERS)[number]["key"];

/** 2D 画布绘制内容（oracle h() 逐句对应） */
export function drawLayerContent(p: TreeBakeParams, all: boolean, baseScale: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = p.canvasW;
  cv.height = p.canvasH;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  const byOid = new Map<number, BakeLevel>();
  for (const l of p.levels) byOid.set(l.oid, l);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 16 * p.scale;
  for (const e of p.edges) {
    const q = byOid.get(e.source);
    const r = byOid.get(e.target);
    if (!q || !r) continue;
    if (!all && p.stateOf(q.filename) + p.stateOf(r.filename) <= 2) continue;
    ctx.beginPath();
    ctx.moveTo(q.x * p.Cf, q.y * p.Kf);
    ctx.lineTo(r.x * p.Cf, r.y * p.Kf);
    ctx.stroke();
  }
  for (const l of p.levels) {
    if (!all && p.stateOf(l.filename) <= 0) continue;
    const m = p.masks.get(l.maskKey);
    if (!m) continue;
    const s = p.scale * baseScale;
    ctx.drawImage(m.img, m.x, m.y, m.w, m.h, l.x * p.Cf - (m.w * s) / 2, l.y * p.Kf - (m.h * s) / 2, m.w * s, m.h * s);
  }
  return cv;
}

/** 源 alpha 的 SAT（求和面积表），内容空盒 O(1) 判定 */
export function buildSAT(alpha: Uint8ClampedArray, w: number, h: number): Int32Array {
  const sat = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += alpha[y * w + x];
      sat[(y + 1) * (w + 1) + (x + 1)] = sat[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  return sat;
}
function satSum(sat: Int32Array, stride: number, x0: number, y0: number, x1: number, y1: number): number {
  const xa = Math.max(0, x0), ya = Math.max(0, y0);
  const xb = Math.min(stride - 1, x1), yb = Math.min(sat.length / stride - 1, y1);
  if (xb <= xa || yb <= ya) return 0;
  return sat[yb * stride + xb] - sat[ya * stride + xb] - sat[yb * stride + xa] + sat[ya * stride + xa];
}

/** GL LINEAR 双线性 2D（texel 坐标；GL(t)=A(t−0.5) 已并入实现） */
function sampleA2(alpha: Uint8ClampedArray, w: number, h: number, tx: number, ty: number): number {
  const px = tx - 0.5, py = ty - 0.5;
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const fx = px - x0, fy = py - y0;
  const xa = x0 < 0 ? 0 : x0 >= w ? w - 1 : x0;
  const xb = x0 + 1 < 0 ? 0 : x0 + 1 >= w ? w - 1 : x0 + 1;
  const ya = y0 < 0 ? 0 : y0 >= h ? h - 1 : y0;
  const yb = y0 + 1 < 0 ? 0 : y0 + 1 >= h ? h - 1 : y0 + 1;
  const r0 = ya * w, r1 = yb * w;
  const top = alpha[r0 + xa] * (1 - fx) + alpha[r0 + xb] * fx;
  const bot = alpha[r1 + xa] * (1 - fx) + alpha[r1 + xb] * fx;
  return (top * (1 - fy) + bot * fy) / 255;
}

/**
 * Bevel+ColorMatrix 合并单趟（fp32 逐 op 语义），行区间 [y0,y1)。
 * @param alpha 源 alpha（0..255） @param out 预乘 RGBA 输出缓冲
 */
export function bevelColorMatrix(
  alpha: Uint8ClampedArray,
  w: number,
  h: number,
  opts: {
    thickness: number;
    outer: number;
    dir: number;
    tint: [number, number, number];
    Cf: number;
    Kf: number;
    y0?: number;
    y1?: number;
    out?: Uint8ClampedArray;
    sat?: Int32Array;
  },
): Uint8ClampedArray {
  const { thickness, outer, dir, tint, Cf, Kf } = opts;
  const WTX = w, WTY = h; // FilterTexture texel 尺寸=上传画布尺寸（GLsizei）
  const FX = WTX / Cf, FY = WTY / Kf;
  const offs = loopOffsets(thickness);
  const out = opts.out ?? new Uint8ClampedArray(w * h * 4);
  const y0 = opts.y0 ?? 0, y1 = opts.y1 ?? h;
  const mr = fr(1.7 * (tint[0] / 255)), mg = fr(1.7 * (tint[1] / 255)), mb = fr(1.7 * (tint[2] / 255));
  const maxOff = offs.length > 1 ? offs[offs.length - 1] * Math.max(WTX, WTY) : 0;
  const R = Math.ceil(maxOff) + 2;
  const sat = opts.sat ?? buildSAT(alpha, w, h);
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (alpha[y * w + x] === 0 && satSum(sat, w + 1, x - R, y - R, x + R + 1, y + R + 1) === 0) continue;
      const t0x = (x + 0.5) * FX, t0y = (y + 0.5) * FY;
      let a1 = 0, a2 = 0;
      for (const o of offs) {
        const ox = o * WTX, oy = o * WTY;
        a1 = fr(a1 + sampleA2(alpha, w, h, t0x + ox, t0y + oy));
        a2 = fr(a2 + sampleA2(alpha, w, h, t0x - ox, t0y - oy));
      }
      a1 = fr(a1 / 3);
      a2 = fr(a2 / 3);
      let a: number, gray: number;
      if (outer === 1) {
        a = fr(a1 + a2);
        gray = fr(fr(0.5 - fr(fr(dir * a1) / 6)) + fr(fr(dir * a2) / 6));
      } else {
        a = fr(sampleA2(alpha, w, h, t0x, t0y)); // own 采样于内容位置（FX 压缩同源）
        gray = fr(fr(0.5 + fr(fr(dir * a1) / 6)) - fr(fr(dir * a2) / 6));
      }
      if (a > 0.5) a = 1;
      const g = Math.round(fr(gray * a) * 255);
      out[i] = Math.min(255, Math.round(fr(mr * fr(g / 255)) * 255));
      out[i + 1] = Math.min(255, Math.round(fr(mg * fr(g / 255)) * 255));
      out[i + 2] = Math.min(255, Math.round(fr(mb * fr(g / 255)) * 255));
      out[i + 3] = Math.round(a * 255);
    }
  }
  return out;
}

/**
 * OutlineFilter（20 角，半径 3·px），行区间 [y0,y1)。sat/alpha 由调用方预建（分片复用）。
 */
export function outlinePass(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  opts: { Cf: number; Kf: number; alpha: Uint8ClampedArray; sat: Int32Array; y0?: number; y1?: number },
): void {
  const { Cf, Kf, alpha, sat } = opts;
  const WTX = w, WTY = h;
  const FX = WTX / Cf, FY = WTY / Kf;
  const offX = 3 * (WTX / Cf), offY = 3 * (WTY / Kf);
  const angles: number[] = [];
  for (let a = fr(-Math.PI); a <= Math.PI; a = fr(a + 0.3142)) angles.push(a);
  const y0 = opts.y0 ?? 0, y1 = opts.y1 ?? h;
  const R = Math.ceil(offX) + 2;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ownA = alpha[y * w + x] / 255;
      if (ownA >= 0.1) {
        rgba[i + 3] = 255; // (own.rgb, 1)
        continue;
      }
      if (satSum(sat, w + 1, x - R, y - R, x + R + 1, y + R + 1) === 0) continue; // 全零已是
      const t0x = (x + 0.5) * FX, t0y = (y + 0.5) * FY;
      let maxA = 0;
      for (const ang of angles) {
        const v = sampleA2(alpha, w, h, t0x - offX * Math.cos(ang), t0y - offY * Math.sin(ang));
        if (v > maxA) maxA = v;
      }
      const resA = Math.max(maxA, ownA);
      rgba[i] = Math.round(fr(fr(rgba[i] / 255) * resA) * 255);
      rgba[i + 1] = Math.round(fr(fr(rgba[i + 1] / 255) * resA) * 255);
      rgba[i + 2] = Math.round(fr(fr(rgba[i + 2] / 255) * resA) * 255);
      rgba[i + 3] = Math.round(resA * 255);
    }
  }
}

/** 预乘 RGBA → 直色（上传时 pma 再预乘，与 oracle 链路等价，±1 双舍入） */
export function premultToStraight(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a === 0 || a === 255) {
      out[i] = rgba[i];
      out[i + 1] = rgba[i + 1];
      out[i + 2] = rgba[i + 2];
    } else {
      out[i] = Math.round((rgba[i] * 255) / a);
      out[i + 1] = Math.round((rgba[i + 1] * 255) / a);
      out[i + 2] = Math.round((rgba[i + 2] * 255) / a);
    }
    out[i + 3] = a;
  }
  return out;
}

export interface TreeBakeResult {
  canvases: Record<TreeLayerKey, HTMLCanvasElement>;
  ms: number;
}

/** 缓存/任务上限：单结果约 3 张整屏 canvas，任务分片另持整层 raw+SAT+out。
 *  保留最近两次即可覆盖「选关↔进度变化后回退」的复用面，避免无界占位。 */
const MAX_RESULTS = 2;
const MAX_JOBS = 2;
const CH = 64; // 行分片

type JobTaskKind = "prepare" | "alphaSat" | "bevel" | "satOut" | "outline";
interface JobTask {
  key: TreeLayerKey;
  kind: JobTaskKind;
  y0: number;
  y1: number;
}

interface JobState {
  params: TreeBakeParams;
  /** prepare 暂存的源 RGBA（ImageData.data），该层最后一个 alphaSat 行分片到达即释放 */
  raw: Partial<Record<TreeLayerKey, Uint8ClampedArray>>;
  alphas: Record<TreeLayerKey, Uint8ClampedArray>;
  sats: Record<TreeLayerKey, Int32Array>;
  outs: Record<TreeLayerKey, Uint8ClampedArray>;
  outAlphas: Partial<Record<TreeLayerKey, Uint8ClampedArray>>;
  outSats: Partial<Record<TreeLayerKey, Int32Array>>;
  tasks: JobTask[];
  t0: number;
}
const jobs = new Map<string, JobState>();
const results = new Map<string, TreeBakeResult>();

function cacheKey(p: TreeBakeParams): string {
  const states = p.levels.map((l) => p.stateOf(l.filename)).join(",");
  return [p.canvasW, p.canvasH, p.Cf, p.Kf, p.color, p.scale, p.edges.length, states].join("|");
}

/** 结果 LRU 落缓存：超上限时先释放最旧结果的位图（width/height=0）再删引用 */
function rememberResult(key: string, r: TreeBakeResult): void {
  results.delete(key);
  while (results.size >= MAX_RESULTS) {
    const oldest = results.keys().next().value;
    if (oldest === undefined) break;
    const old = results.get(oldest);
    if (old) {
      for (const cv of Object.values(old.canvases)) {
        cv.width = 0;
        cv.height = 0;
      }
    }
    results.delete(oldest);
  }
  results.set(key, r);
}

/** 缓存命中读取；命中即刷新 LRU（delete+set 移到 Map 末尾） */
export function peekTreeBake(p: TreeBakeParams): TreeBakeResult | null {
  const key = cacheKey(p);
  const r = results.get(key);
  if (!r) return null;
  results.delete(key);
  results.set(key, r);
  return r;
}

/** 启动（或续接）分片烘焙任务；绘制/读像素/建 SAT 全部下沉到 prepare 分片，
 *  调用方（选关界面 create）不再承担同步像素开销。 */
export function startTreeBake(p: TreeBakeParams): string {
  const key = cacheKey(p);
  if (results.has(key) || jobs.has(key)) return key;
  while (jobs.size >= MAX_JOBS) {
    // 淘汰最早插入的未完成任务（直接丢引用）；仍持旧 key 的调用方 step 得到 null，
    // 维持平色兜底。当前 key 不在 jobs 中（上方已返回），不会被误删。
    const oldest = jobs.keys().next().value;
    if (oldest === undefined) break;
    jobs.delete(oldest);
  }
  // 初始每层一个 prepare；后续 alphaSat/bevel/outline 分片由 prepare 追加，保证依赖顺序
  const tasks: JobTask[] = LAYERS.map((layer): JobTask => ({ key: layer.key, kind: "prepare", y0: 0, y1: p.canvasH }));
  jobs.set(key, {
    params: p,
    raw: {},
    alphas: {} as Record<TreeLayerKey, Uint8ClampedArray>,
    sats: {} as Record<TreeLayerKey, Int32Array>,
    outs: {} as Record<TreeLayerKey, Uint8ClampedArray>,
    outAlphas: {},
    outSats: {},
    tasks,
    t0: performance.now(),
  });
  return key;
}

/** 步进分片任务；全部完成时落缓存并返回结果 */
export function stepTreeBake(key: string, budgetMs = 10): TreeBakeResult | null {
  const job = jobs.get(key);
  if (!job) return results.get(key) ?? null;
  const p = job.params;
  const deadline = performance.now() + budgetMs;
  let i = 0;
  while (i < job.tasks.length && performance.now() < deadline) {
    const t = job.tasks[i++];
    if (t.kind === "prepare") {
      // 一层一次同步绘制/读像素；读完立刻把源画布缩到 0 释放位图，RGBA 留给 alphaSat 分片
      const layer = LAYERS.find((l) => l.key === t.key)!;
      const src = drawLayerContent(p, layer.all, layer.baseScale);
      const idata = src.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, p.canvasW, p.canvasH);
      job.raw[t.key] = idata.data;
      job.alphas[t.key] = new Uint8ClampedArray(p.canvasW * p.canvasH);
      job.sats[t.key] = new Int32Array((p.canvasW + 1) * (p.canvasH + 1));
      job.outs[t.key] = new Uint8ClampedArray(p.canvasW * p.canvasH * 4);
      src.width = 0;
      src.height = 0;
      // 顺序：本层 alphaSat 全部 → 本层 bevel 全部 →（outline 层）satOut → outline 全部
      for (let y = 0; y < p.canvasH; y += CH) job.tasks.push({ key: t.key, kind: "alphaSat", y0: y, y1: Math.min(y + CH, p.canvasH) });
      for (let y = 0; y < p.canvasH; y += CH) job.tasks.push({ key: t.key, kind: "bevel", y0: y, y1: Math.min(y + CH, p.canvasH) });
      if (layer.outline) {
        job.tasks.push({ key: t.key, kind: "satOut", y0: 0, y1: p.canvasH });
        for (let y = 0; y < p.canvasH; y += CH) job.tasks.push({ key: t.key, kind: "outline", y0: y, y1: Math.min(y + CH, p.canvasH) });
      }
    } else if (t.kind === "alphaSat") {
      // 逐行复刻 buildSAT 递推（第 y+1 行依赖第 y 行），同时提取 alpha；分片按行连续
      const w = p.canvasW;
      const stride = w + 1;
      const raw = job.raw[t.key]!;
      const a = job.alphas[t.key];
      const sat = job.sats[t.key];
      for (let y = t.y0; y < t.y1; y++) {
        let rowSum = 0;
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const v = raw[(row + x) * 4 + 3];
          a[row + x] = v;
          rowSum += v;
          sat[(y + 1) * stride + (x + 1)] = sat[y * stride + (x + 1)] + rowSum;
        }
      }
      if (t.y1 >= p.canvasH) delete job.raw[t.key];
    } else if (t.kind === "bevel") {
      const layer = LAYERS.find((l) => l.key === t.key)!;
      const tint: [number, number, number] = layer.gold
        ? [0xff, 0xd6, 0x20]
        : [parseInt(p.color.slice(1, 3), 16), parseInt(p.color.slice(3, 5), 16), parseInt(p.color.slice(5, 7), 16)];
      bevelColorMatrix(job.alphas[t.key], p.canvasW, p.canvasH, {
        thickness: layer.thickness,
        outer: layer.outer,
        dir: layer.dir,
        tint,
        Cf: p.Cf,
        Kf: p.Kf,
        y0: t.y0,
        y1: t.y1,
        out: job.outs[t.key],
        sat: job.sats[t.key],
      });
    } else if (t.kind === "satOut") {
      const n = p.canvasW * p.canvasH;
      const oa = new Uint8ClampedArray(n);
      const o = job.outs[t.key];
      for (let j = 0; j < n; j++) oa[j] = o[j * 4 + 3];
      job.outAlphas[t.key] = oa;
      job.outSats[t.key] = buildSAT(oa, p.canvasW, p.canvasH);
    } else {
      outlinePass(job.outs[t.key], p.canvasW, p.canvasH, {
        Cf: p.Cf,
        Kf: p.Kf,
        alpha: job.outAlphas[t.key]!,
        sat: job.outSats[t.key]!,
        y0: t.y0,
        y1: t.y1,
      });
    }
  }
  job.tasks.splice(0, i);
  if (job.tasks.length > 0) return null;
  jobs.delete(key);
  const canvases = {} as Record<TreeLayerKey, HTMLCanvasElement>;
  for (const layer of LAYERS) {
    const cv = document.createElement("canvas");
    cv.width = p.canvasW;
    cv.height = p.canvasH;
    const octx = cv.getContext("2d")!;
    const idata = octx.createImageData(p.canvasW, p.canvasH);
    idata.data.set(premultToStraight(job.outs[layer.key]));
    octx.putImageData(idata, 0, 0);
    canvases[layer.key] = cv;
  }
  const r: TreeBakeResult = { canvases, ms: performance.now() - job.t0 };
  rememberResult(key, r);
  return r;
}

/** 同步全量烘焙（测试/兜底用；产品路径走 startTreeBake+stepTreeBake） */
export function bakeTreeLayersSync(p: TreeBakeParams): TreeBakeResult {
  const key = startTreeBake(p);
  for (;;) {
    const r = stepTreeBake(key, 1e9);
    if (r) return r;
  }
}
