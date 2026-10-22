/**
 * 房内图集的独立核验（件1 门禁之外的另一双眼睛）。
 * 期望值全部由「官方 font.png/font.fnt 的字节与坐标」＋「font-room.fnt 声明的新坐标」回算，
 * 不调用 build-font-room.mjs 的任何装配/审计代码——生成器自己的断言若有口径错误，这里仍能独立发现。
 * 需求集合取自共用口径层 scripts/font-subset/room.mjs（与生成器同一份，避免第三套口径）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodePng } from "../png-raw.mjs";
import { parseFnt } from "./prephase.mjs";
import { roomCharsFromOfficial } from "./room.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const DIR = "assets/fonts/chinese";
const src = decodePng(readFileSync(join(ROOT, `${DIR}/font.png`)), "font.png");
const out = decodePng(readFileSync(join(ROOT, `${DIR}/font-room.png`)), "font-room.png");
const srcFnt = parseFnt(join(ROOT, `${DIR}/font.fnt`));
const outFnt = parseFnt(join(ROOT, `${DIR}/font-room.fnt`));

const errs = [];
const note = (m) => errs.push(m);

/** 1. 画布 = fnt 声明 */
const commonAttrs = (t) => Object.fromEntries([.../<common\b[^>]*>/.exec(t)[0].matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const srcTxt = readFileSync(join(ROOT, `${DIR}/font.fnt`), "utf8");
const outTxt = readFileSync(join(ROOT, `${DIR}/font-room.fnt`), "utf8");
const sc = commonAttrs(srcTxt);
const oc = commonAttrs(outTxt);
if (Number(oc.scaleW) !== out.w || Number(oc.scaleH) !== out.h) note(`fnt 声明 ${oc.scaleW}x${oc.scaleH} 与 PNG ${out.w}x${out.h} 不符`);
for (const k of Object.keys(sc)) if (k !== "scaleW" && k !== "scaleH" && sc[k] !== oc[k]) note(`<common> ${k} 变了：${sc[k]} → ${oc[k]}`);
const infoOf = (t) => /<info\b[^>]*>/.exec(t)[0];
if (infoOf(srcTxt) !== infoOf(outTxt)) note(`<info> 不逐字相等\n  ${infoOf(srcTxt)}\n  ${infoOf(outTxt)}`);

/** 2. 度量面：260 条声明逐条只允许 x/y 变 */
if (srcFnt.glyphs.size !== outFnt.glyphs.size) note(`声明数 ${srcFnt.glyphs.size} → ${outFnt.glyphs.size}`);
const moved = [];
for (const [id, g] of srcFnt.glyphs) {
  const n = outFnt.glyphs.get(id);
  if (!n) {
    note(`id=${id} 声明消失`);
    continue;
  }
  for (const k of ["width", "height", "xoffset", "yoffset", "xadvance"]) {
    if (g[k] !== n[k]) note(`id=${id} ${k} 变了：${g[k]} → ${n[k]}`);
  }
  if (g.x !== n.x || g.y !== n.y) moved.push(id);
}

/** 3. 像素面：需求内的字逐字节照抄（含 ring 环带），需求外一律 0 */
const { chars: need } = await roomCharsFromOfficial(ROOT);
const needIds = new Set([...need].map((c) => c.codePointAt(0)));
const RING = Number(/padding="(\d+)/.exec(srcTxt)[1]);
const px = (img, x, y) => img.data.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4);
const rect = (img, x, y, w, h) => {
  const rows = [];
  for (let r = 0; r < h; r++) rows.push(img.data.subarray((y + r) * img.w * 4 + x * 4, (y + r) * img.w * 4 + (x + w) * 4));
  return Buffer.concat(rows);
};
const region = (f, g) => ({
  x: Math.max(0, g.x - RING),
  y: Math.max(0, g.y - RING),
  w: g.width + 2 * RING,
  h: g.height + 2 * RING,
});

let kept = 0;
let zeroed = 0;
for (const [id, g] of srcFnt.glyphs) {
  if (!g.width || !g.height) continue;
  const n = outFnt.glyphs.get(id);
  if (!n) continue;
  const srcBytes = rect(src, g.x, g.y, g.width, g.height);
  const outBytes = rect(out, n.x, n.y, g.width, g.height);
  if (needIds.has(id)) {
    kept++;
    if (!srcBytes.equals(outBytes)) note(`id=${id}(${String.fromCodePoint(id)}) 帧字节不符`);
    const sr = region(src, g);
    const nr = region(out, n);
    if (!rect(src, sr.x, sr.y, sr.w, sr.h).equals(rect(out, nr.x, nr.y, nr.w, nr.h))) {
      note(`id=${id}(${String.fromCodePoint(id)}) ring=${RING} 环带不符`);
    }
  } else {
    zeroed++;
    if (outBytes.some((v) => v !== 0)) note(`id=${id}(${String.fromCodePoint(id)}) 未列入需求却带像素：${[...outBytes].filter((v) => v).length} 非零字节`);
  }
}

/** 4. 授权区之外必须全 0：以「保留字的帧∪环带」为唯一许可 */
const mask = new Uint8Array(out.w * out.h);
for (const [id, n] of outFnt.glyphs) {
  if (!needIds.has(id) || !n.width || !n.height) continue;
  const r = region(out, n);
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (x >= out.w || y >= out.h) {
        note(`id=${String.fromCodePoint(id)} 区域越界 (${x},${y})`);
        continue;
      }
      mask[y * out.w + x]++;
    }
  }
}
let outside = 0;
let double = 0;
for (let i = 0; i < mask.length; i++) {
  if (mask[i] > 1) double++;
  if (mask[i] === 0 && out.data[i * 4 + 3] !== 0) outside++;
}
if (outside) note(`授权区之外有 ${outside} 个不透明像素`);

/** 5. 辅助块：cHRM/gAMA 丢了就意味着"像素没变"这句话不再成立 */
const anc = (img) => img.ancillary.map((a) => a.type).sort().join(",");
const ancSame = anc(src) === anc(out);

console.log(`font-room.png ${out.w}x${out.h}  声明 ${outFnt.glyphs.size} 条  移动坐标 ${moved.length} 条`);
console.log(`逐字节照抄 ${kept} 字（需求内）／清零 ${zeroed} 字（需求外）  环带 ring=${RING}`);
console.log(`重叠授权像素 ${double}  区外不透明像素 ${outside}`);
console.log(`PNG 解码驻留 ${(out.w * out.h * 4 / 1048576).toFixed(2)}MiB（官方 ${(src.w * src.h * 4) / 1048576}MiB）`);
console.log(`辅助块 官方=[${anc(src)}] 房内=[${anc(out)}] 一致=${ancSame}`);
console.log(`块序列 官方=${src.chunks} 房内=${out.chunks}`);
if (!ancSame) note(`辅助块不一致：[${anc(src)}] vs [${anc(out)}]`);
if (errs.length) {
  console.log(`\n✗ ${errs.length} 处不符：\n - ${errs.slice(0, 30).join("\n - ")}`);
  process.exit(1);
}
console.log("\n✓ 全部独立回算相符");
