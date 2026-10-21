/**
 * r19 件0：字体图集**重排上限量具**（只测量、不落盘）。
 *
 * 背景：r18 两段化把"一张 8,974,336B 解码位图"换成**两张同尺寸**（2191×1024），
 * 因为子集只清零像素、不动 `.fnt` ⇒ 幅面必须与全量一致。本轮要回答的是：
 * **把字形帧紧凑重排能把幅面压到多少**——r7f 已量过"帧矩形占声明面积 94.79%"，
 * 所以先别假设收益，先测。
 *
 * 重排能不能"位级不变"取决于一个必须先证明的事实：Phaser 默认 LINEAR 滤波会在字形边缘
 * 采到**帧矩形外 1 texel**。若源图集里每帧矩形**自身的 4px 内边框**（AngelCode `padding="4,4,4,4"`
 * 声明的透明衬边）确实全透明，那么"帧外 1 texel"永远是邻帧的衬边＝透明，
 * 于是重排只要给每帧留出 ≥1 texel 的透明隔离带，采样读到的字节与今日同一集合（全零），画面可逐像素相同。
 * 本量具把这条假设**逐字节核验**，而不是引用规范文字默认成立。
 *
 * 用法：node scripts/font-subset/reflow-measure.mjs [--spacing N] [--json]
 *
 * 跨代口径（r19 件2 修）：本量具打印的"上一代子集"一律由 `composeSubset` 在内存复现，
 * 不读在库 `font-prephase.png`——在库那张自件1 起已是重排代（1006×378），
 * 按源帧坐标去裁它会直接越界。量具要能量任何一代，参照系就不能指向某一代的产物。
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePngRgba, cropRaw } from "../png-raw.mjs";
import { parseFnt, prephaseChars, loadSpec, pack, composeSubset } from "./prephase.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FONT_DIR = "packages/client/public/assets/fonts/chinese";
const asOfs = (p) => join(ROOT, p);

const argv = process.argv.slice(2);
const SPACING = Number(argv.includes("--spacing") ? argv[argv.indexOf("--spacing") + 1] : 2);
const AS_JSON = argv.includes("--json");

/**
 * 候选宽高**不得同时为 2 的幂**：Phaser 上传纹理时 `generateMipmap = IsSizePowerOfTwo(w,h)`
 * （node_modules/phaser/src/renderer/webgl/wrappers/WebGLTextureWrapper.js:344），
 * 今日 2191x1024 非 2 的幂 ⇒ 无 mipmap、纯 LINEAR 采样。若重排产物恰为 POT×POT，
 * 采样级别会从"LINEAR"变成"LINEAR_MIPMAP_LINEAR"，那是观感层面的变化，不在本量具的等价口径里。
 */
const isPot = (n) => n > 0 && Number.isInteger(Math.log2(n));
const PACK_OPTS = { forbidden: (w, h) => isPot(w) && isPot(h) };

/** 取 (x,y) 处 RGBA 四字节是否全零 */
const isZeroAt = (img, x, y) => {
  const o = (y * img.w + x) * 4;
  return img.data[o] === 0 && img.data[o + 1] === 0 && img.data[o + 2] === 0 && img.data[o + 3] === 0;
};

/** 帧矩形自身最外 band 圈是否全透明（返回违例像素数与首处坐标） */
function outerBandViolations(img, g, band) {
  let n = 0;
  let first = null;
  for (let row = 0; row < g.height; row++) {
    for (let col = 0; col < g.width; col++) {
      const onBand = col < band || col >= g.width - band || row < band || row >= g.height - band;
      if (!onBand) continue;
      const x = g.x + col;
      const y = g.y + row;
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      if (!isZeroAt(img, x, y)) {
        if (!first) first = { id: g.id, x, y };
        n++;
      }
    }
  }
  return { n, first };
}

/** 帧矩形外扩 ring 圈（裁剪到画布内）是否全透明——这才是"今日实际被采到的是什么" */
function outsideRingViolations(img, g, ring, owners) {
  let n = 0;
  let first = null;
  for (let y = g.y - ring; y < g.y + g.height + ring; y++) {
    for (let x = g.x - ring; x < g.x + g.width + ring; x++) {
      const inside = x >= g.x && x < g.x + g.width && y >= g.y && y < g.y + g.height;
      if (inside) continue;
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) {
        if (!first) first = { id: g.id, x, y, why: "画布外（今日依赖 CLAMP）" };
        n++;
        continue;
      }
      if (!isZeroAt(img, x, y)) {
        if (!first) first = { id: g.id, x, y, owner: owners.get(`${x},${y}`) ?? "无主" };
        n++;
      }
    }
  }
  return { n, first };
}

/** 帧矩形 → 墨迹包围盒（只扫本帧，全零像素不计） */
function inkBoxOf(img, g) {
  let x0 = g.x + g.width, y0 = g.y + g.height, x1 = -1, y1 = -1, ink = 0;
  for (let row = 0; row < g.height; row++) {
    for (let col = 0; col < g.width; col++) {
      if (!isZeroAt(img, g.x + col, g.y + row)) {
        ink++;
        if (col < x0) x0 = col;
        if (col > x1) x1 = col;
        if (row < y0) y0 = row;
        if (row > y1) y1 = row;
      }
    }
  }
  if (x1 < 0) return null;
  return { dx: x0, dy: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, ink };
}

/** 货架式打包与多档择优已升入口径层 scripts/font-subset/prephase.mjs（生成器共用，防量具/产物两套数字漂移） */

function assemble(img, fnt, layout, opts) {
  const out = Buffer.alloc(layout.w * layout.h * 4);
  const put = (x, y, srcBuf, sw, sh) => {
    for (let r = 0; r < sh; r++) {
      srcBuf.copy(out, ((y + r) * layout.w + x) * 4, r * sw * 4, r * sw * 4 + sw * 4);
    }
  };
  for (const [key, pos] of layout.place) {
    const g = opts.glyphs.get(Number(key));
    const crop = { x: g.x + (opts.trim?.get(Number(key))?.dx ?? 0), y: g.y + (opts.trim?.get(Number(key))?.dy ?? 0) };
    const w = opts.trim ? opts.trim.get(Number(key)).w : g.width;
    const h = opts.trim ? opts.trim.get(Number(key)).h : g.height;
    if (w <= 0 || h <= 0) continue;
    put(pos.x, pos.y, cropRaw(img, crop.x, crop.y, w, h), w, h);
  }
  if (opts.block) put(opts.block.x, opts.block.y, opts.block.buf, opts.block.w, opts.block.h);
  return out;
}

const kb = (n) => (n / 1024).toFixed(1);
const rows = [];

function report(label, img, f, glyphs, note) {
  const declared = [...glyphs.values()].filter((g) => g.width > 0 && g.height > 0);
  const frameArea = declared.reduce((s, g) => s + g.width * g.height, 0);
  const owners = new Map();
  for (const g of declared) {
    for (let y = g.y; y < g.y + g.height; y++) for (let x = g.x; x < g.x + g.width; x++) owners.set(`${x},${y}`, g.id);
  }
  const band = f.padding[0];
  let bandViol = 0, bandFirst = null, outViol = 0, outFirst = 0, outFirstDetail = null, clampEdges = 0;
  for (const g of declared) {
    const a = outerBandViolations(img, g, band);
    if (a.n) { bandViol++; if (!bandFirst) bandFirst = a.first; }
    const b = outsideRingViolations(img, g, 1, owners);
    if (b.n) { outViol++; if (!outFirst) { outFirst = g.id; outFirstDetail = b.first; } }
    if (g.x === 0 || g.y === 0 || g.x + g.width === img.w || g.y + g.height === img.h) clampEdges++;
  }
  const items = declared.map((g) => ({ key: String(g.id), w: g.width, h: g.height }));
  const p = pack(items, SPACING, PACK_OPTS);
  const pBytes = p.w * p.h * 4;
  rows.push({
    label, note,
    canvas: `${img.w}x${img.h}`,
    fileKB: kb(f.fileBytes),
    decodedMB: (img.w * img.h * 4 / 1048576).toFixed(2),
    glyphs: declared.length,
    frameAreaKB: kb(frameArea * 4),
    densityPct: ((frameArea / (img.w * img.h)) * 100).toFixed(2),
    padding: band,
    bandViolGlyphs: bandViol,
    bandFirst: bandFirst ? `id=${bandFirst.id}@(${bandFirst.x},${bandFirst.y})` : "无",
    outsideOneViolGlyphs: outViol,
    outsideFirst: outFirst ? `id=${outFirst} ${JSON.stringify(outFirstDetail)}` : "无",
    edgeTouching: clampEdges,
    reflow: `${p.w}x${p.h}`,
    reflowDecodedMB: (pBytes / 1048576).toFixed(2),
    reflowTexelGainPct: (((img.w * img.h - p.w * p.h) / (img.w * img.h)) * 100).toFixed(2),
  });
  return { p, declared, owners };
}

const fullPngPath = asOfs(join(FONT_DIR, "font.png"));
const fntPath = asOfs(join(FONT_DIR, "font.fnt"));
const f = parseFnt(fntPath);
f.fileBytes = statSync(fullPngPath).size;
const fullImg = decodePng(readFileSync(fullPngPath), "font.png");

const spec = loadSpec(ROOT);
const pre = prephaseChars(spec, f);
const keptCodes = new Set(pre.kept.map((k) => k.glyph.id));

console.log(`== 源事实 ==`);
console.log(`font.png ${fullImg.w}x${fullImg.h} 文件 ${(f.fileBytes / 1024).toFixed(1)}KB 解码 ${(fullImg.w * fullImg.h * 4 / 1048576).toFixed(2)}MB`);
console.log(`padding=${f.padding.join(",")} spacing=${f.scaleW}x${f.scaleH} 声明字形 ${f.glyphs.size}（0×0 ${[...f.glyphs.values()].filter((g) => !g.width || !g.height).length} 条）`);
console.log(`进房前：文案字符 ${pre.chars.size}，有字形保留 ${pre.kept.length}，无字形 ${pre.noGlyph.length}`);
console.log();

const A = report("A 全量·原样重排", fullImg, f, f.glyphs, `spacing=${SPACING}`);

// B：裁到墨迹包围盒＋1px（需要改写 xoffset/yoffset ⇒ 度量面有变，单列）
const trim = new Map();
let inkArea = 0;
for (const g of A.declared) {
  const b = inkBoxOf(fullImg, g) ?? { dx: 0, dy: 0, w: g.width, h: g.height, ink: 0 };
  const dL = Math.max(0, b.dx - 1), dT = Math.max(0, b.dy - 1);
  const dR = Math.min(g.width, b.dx + b.w + 1), dB = Math.min(g.height, b.dy + b.h + 1);
  trim.set(g.id, { dx: dL, dy: dT, w: dR - dL, h: dB - dT, ox: dL, oy: dT });
  inkArea += (dR - dL) * (dB - dT);
}
const glyphsB = new Map([...f.glyphs].map(([c, g]) => [c, { ...g, width: trim.get(g.id)?.w ?? g.width, height: trim.get(g.id)?.h ?? g.height }]));
const pB = pack([...glyphsB.values()].filter((g) => g.width > 0 && g.height > 0).map((g) => ({ key: String(g.id), w: g.width, h: g.height })), SPACING, PACK_OPTS);
const metricsMoved = [...trim.values()].filter((t) => t.ox || t.oy).length;
console.log(`B 全量·裁边重排（墨迹＋1px）：候选 ${pB.w}x${pB.h}＝${(pB.w * pB.h * 4 / 1048576).toFixed(2)}MB，` +
  `texel 收益 ${(((fullImg.w * fullImg.h - pB.w * pB.h) / (fullImg.w * fullImg.h)) * 100).toFixed(2)}%，` +
  `需改写 xoffset/yoffset 的字形 ${metricsMoved}/${A.declared.length} 条`);

// C：子集原样重排＋共享透明块（未保留字形继续有非零声明，指向同一块透明区）
const keptList = A.declared.filter((g) => keptCodes.has(g.id));
const nonKept = A.declared.filter((g) => !keptCodes.has(g.id));
const blockW = Math.max(...nonKept.map((g) => g.width)) + SPACING;
const blockH = Math.max(...nonKept.map((g) => g.height)) + SPACING;
const pC = pack(keptList.map((g) => ({ key: String(g.id), w: g.width, h: g.height })), SPACING, PACK_OPTS);
// "今日子集"参照一律由源在内存复现（composeSubset），**不读在库 font-prephase.png**：
// r19 件1 之后在库那张已是重排代（1006x378），按源帧坐标去裁它必然越界。量具要能跨代反复跑，
// 参照系就必须自己算出来，而不是指向某一代的产物（在库那一代只在下面作为事实打印）。
const baseSubset = composeSubset(fullImg, f, pre.kept, f.padding[0]);
const curSub = { w: fullImg.w, h: fullImg.h, data: baseSubset.out };
const curSubKB = kb(encodePngRgba(curSub.w, curSub.h, baseSubset.out, fullImg.ancillary).length);
const inLib = existsSync(asOfs(join(FONT_DIR, "font-prephase.png")))
  ? decodePng(readFileSync(asOfs(join(FONT_DIR, "font-prephase.png"))), "font-prephase.png")
  : null;
const W = Math.max(pC.w, blockW + SPACING);
const H = Math.max(pC.h, blockH + SPACING);
const blockBuf = Buffer.alloc(blockW * blockH * 4);
const glyphsC = new Map(keptList.map((g) => [g.id, g]));
const laid = assemble(curSub, f, { w: W, h: H, place: pC.place }, { glyphs: glyphsC });
const pngC = encodePngRgba(W, H, laid);
console.log(`C 子集·原样重排：保留 ${keptList.length} 帧 ＋ 透明块 ${blockW}x${blockH}（承载未保留声明 ${nonKept.length} 条）` +
  ` ⇒ 候选 ${W}x${H}＝${(W * H * 4 / 1048576).toFixed(2)}MB（上一代子集 ${(curSub.w * curSub.h * 4 / 1048576).toFixed(2)}MB / ${curSubKB}KB），` +
  `PNG 实测 ${(pngC.length / 1024).toFixed(1)}KB`);

// D：子集裁边（同 B 的度量改写代价）
const keptTrim = keptList.map((g) => ({ key: String(g.id), ...(trim.get(g.id) ?? { w: g.width, h: g.height }) }));
const pD = pack(keptTrim, SPACING, PACK_OPTS);
console.log(`D 子集·裁边重排：候选 ${pD.w}x${pD.h}＝${(pD.w * pD.h * 4 / 1048576).toFixed(2)}MB`);

console.log();
console.log(`== 环带重排（唯一站得住的布局：区域＝帧矩形 ∪ padding 环带，逐字节搬源）==`);
const ringN = f.padding[0];
console.log(`成因：${A.declared.length} 条字形全部同时命中 bandViol/outsideViol——帧墨迹顶到帧矩形边，` +
  `帧外 1 texel 读到的是**邻帧的墨**。所以换邻居必须把环带一起搬走（区域＝帧 ∪ ${ringN}px 环带），` +
  `否则"重排后采样字节相同"这句话不成立。`);

/** 区域打包＋真实像素装配＋真实 PNG 字节；环带越出源画布的像素落回透明（今日那是 CLAMP 边界，本字体实测 0 处） */
function ringLayout(list, srcImg, block) {
  const items = list.map((g) => ({ key: String(g.id), w: g.width + 2 * ringN, h: g.height + 2 * ringN }));
  if (block) items.push({ key: "block", w: block.w, h: block.h });
  const p = pack(items, SPACING, PACK_OPTS);
  const out = Buffer.alloc(p.w * p.h * 4);
  let copied = 0, clipped = 0;
  for (const g of list) {
    const pos = p.place.get(String(g.id));
    const rw = g.width + 2 * ringN, rh = g.height + 2 * ringN;
    const sx0 = g.x - ringN, sy0 = g.y - ringN;
    const x0 = Math.max(0, sx0), y0 = Math.max(0, sy0);
    const x1 = Math.min(srcImg.w, sx0 + rw), y1 = Math.min(srcImg.h, sy0 + rh);
    if (x0 !== sx0 || y0 !== sy0 || x1 !== sx0 + rw || y1 !== sy0 + rh) clipped++;
    const sw = x1 - x0, sh = y1 - y0;
    const buf = cropRaw(srcImg, x0, y0, sw, sh);
    const dx = pos.x + (x0 - sx0), dy = pos.y + (y0 - sy0);
    for (let r = 0; r < sh; r++) buf.copy(out, ((dy + r) * p.w + dx) * 4, r * sw * 4, r * sw * 4 + sw * 4);
    copied += sw * sh;
  }
  return { p, out, copied, clipped, blockPos: p.place.get("block") ?? null };
}

const AR = ringLayout(A.declared, fullImg);
const pngAR = encodePngRgba(AR.p.w, AR.p.h, AR.out);
console.log(`A' 全量环带重排：${AR.p.w}x${AR.p.h}＝${(AR.p.w * AR.p.h * 4 / 1048576).toFixed(2)}MB` +
  `（今日 ${(fullImg.w * fullImg.h * 4 / 1048576).toFixed(2)}MB，texel ${(((fullImg.w * fullImg.h - AR.p.w * AR.p.h) / (fullImg.w * fullImg.h)) * 100).toFixed(2)}%）、` +
  `PNG ${(pngAR.length / 1024).toFixed(1)}KB（今日 ${kb(f.fileBytes)}KB）、环带被切 ${AR.clipped} 处`);

// C' 子集环带重排：内容＝**上一代子集**的一次布局置换（r18 已把环带搬好，非授权区本就是零）
const blkW = Math.max(...nonKept.map((g) => g.width)) + 2 * SPACING;
const blkH = Math.max(...nonKept.map((g) => g.height)) + 2 * SPACING;
const CR = ringLayout(keptList, curSub, { w: blkW, h: blkH });
const pngCR = encodePngRgba(CR.p.w, CR.p.h, CR.out);
console.log(`C' 子集环带重排＋透明块 ${blkW}x${blkH}（承载 ${nonKept.length} 条未保留声明）：` +
  `${CR.p.w}x${CR.p.h}＝${(CR.p.w * CR.p.h * 4 / 1048576).toFixed(2)}MB（上一代子集 ${(curSub.w * curSub.h * 4 / 1048576).toFixed(2)}MB，内存复现）、` +
  `PNG ${(pngCR.length / 1024).toFixed(1)}KB（上一代 ${curSubKB}KB）、搬运 ${CR.copied} texel、环带被切 ${CR.clipped} 处`);
console.log(`在库 font-prephase.png：${inLib ? `${inLib.w}x${inLib.h}＝` +
  `${inLib.w === curSub.w && inLib.h === curSub.h ? "上一代（原坐标＋清零）" : "重排代（本量具这条 C' 布局已落地）"}，仅作事实打印，不参与参照` : "缺失（未构建）"}`);
console.log(`D' 说明：裁到墨迹包围盒（B/D 路线）要改 xoffset/yoffset，而"裁掉的像素"里正含被邻帧采到的墨——` +
  `环带假设既不成立，裁边也就没有余量，该路线不进实施。`);

console.log();
if (AS_JSON) {
  console.log(JSON.stringify(rows, null, 1));
} else {
  for (const r of rows) {
    console.log(`-- ${r.label} ${r.note}`);
    for (const [k, v] of Object.entries(r)) if (k !== "label" && k !== "note") console.log(`   ${k.padEnd(20)} ${v}`);
  }
}
console.log();
console.log(`判定口径：bandViol/outsideViol 非零不是"缺陷"而是**事实**——它说明帧墨顶到帧边、帧外 1 texel 是邻帧的墨，` +
  `因此重排必须连环带一起搬（A'/C'）。edgeTouching 是今日贴画布边的帧数，重排后由隔离带消除，属改善不是风险。`);
