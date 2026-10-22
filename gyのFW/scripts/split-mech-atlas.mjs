// r30/r33：MechAssets 按关变体生成器（r33 起画布随帧集重打包）。
//   入口：node --import tsx scripts/split-mech-atlas.mjs [--check]
//   产物：assets/atlasses/mech/MechAssets-<变体id>.{png,json}（变体 id = mechVariantId(level)）
//
// r30 把 48 关折成 24 个帧子集，但仍沿用 2048² 画布原地清零——每张变体解码/上传固定 16MiB，
// 而最大变体的保留帧面积只有 1.06M px。r33 起每张变体按帧集重打包到最小画布：
//   - 像素仍从 Slim 的同帧矩形逐字节搬运，裁剪逐字节相等（回读复验）；
//   - 帧矩形由本生成器重算（1px 外框 + 1px 帧间距，保证 LINEAR 采样的邻域是透明）；
//   - 帧宽高、sourceSize、帧名与顺序不变，运行时只按帧名取帧，几何不受影响；
//   - 确定性货架式打包（按高/宽/名排序，候选宽度取面积最小），--check 逐字节比对在库产物。
// 帧集合口径在 packages/shared/src/mech-needs.ts（客户端按解析后的关卡当场算 id，无需清单文件）。
//
// 风区 34 帧（wind_base 0-3 / wind_effect 0-29，110.2KB）只给 15 个有风关卡；零机关关卡
// （forest_06 / forest_06_1）生成一张仅含 1×1 透明占位帧 mech_empty0000 的变体（解码 4B）。
//
// 无损证明：逐帧回读 PNG 并与 Slim 同帧矩形逐字节比较；帧矩形之外（含间距/外框）全 0。
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodePng, encodePngRgba } from "./png-raw.mjs";
import { ATLAS_SPECS, DEAD_RULES, REPO_ROOT, inspect } from "./atlas-slim/needs.mjs";
import { MECH_EMPTY_FRAME, mechAtlasFrames, mechVariantId } from "../packages/shared/src/mech-needs.ts";

const ROOT = REPO_ROOT;
const OUT_DIR = join(ROOT, "assets", "atlasses", "mech");
const CHECK = process.argv.includes("--check");
const spec = ATLAS_SPECS.mech;
const meta = JSON.parse(readFileSync(join(ROOT, spec.json), "utf8"));
const byName = new Map(meta.frames.map((f) => [f.filename, f]));
const slim = decodePng(readFileSync(join(ROOT, spec.slimPng)), "MechAssetsSlim");
const srcOfficial = decodePng(readFileSync(join(ROOT, spec.officialPng)), "MechAssets");

/** 帧间距与外框：LINEAR 采样最多越界半个纹素，1px 透明即可复刻官方图集 ≥4px 间距的邻域。 */
const GAP = 1;
const PAD = 1;

if (slim.w !== srcOfficial.w || slim.h !== srcOfficial.h) throw new Error("Slim 画布尺寸与官方不一致");
if (meta.frames.some((f) => f.rotated || f.trimmed || f.spriteSourceSize?.x || f.spriteSourceSize?.y)) {
  throw new Error("官方帧存在 rotated/trimmed/偏移——按帧矩形搬运的几何等价前提失效，先复核");
}

const { levels } = await inspect(ROOT);

/** 关卡 → { id, frames }；同 id 必须同集合（哈希碰撞会在这里红） */
const variants = new Map();
for (const l of levels) {
  const frames = mechAtlasFrames(l.parsed);
  const id = mechVariantId(l.parsed);
  if (variants.has(id)) {
    const prev = variants.get(id);
    if (prev.frames.join("\n") !== frames.join("\n")) {
      throw new Error(`变体 id 碰撞：${prev.levels.join(",")} 与 ${l.id} 的帧集不同但 id 同为 ${id}`);
    }
    prev.levels.push(String(l.id));
  } else {
    variants.set(id, { id, frames, levels: [String(l.id)] });
  }
}

// 完备性：48 关并集（去掉占位帧）必须等于 r26 的 keep 集；占位帧不得在官方图集里
const { keep } = await inspect(ROOT);
const union = new Set();
for (const v of variants.values()) for (const n of v.frames) if (n !== MECH_EMPTY_FRAME) union.add(n);
const keepMech = keep.mech;
const missingKeep = [...keepMech].filter((n) => !union.has(n));
const extra = [...union].filter((n) => !keepMech.has(n));
if (missingKeep.length || extra.length) {
  throw new Error(`并集与 r26 keep 不一致：缺 ${missingKeep.slice(0, 5).join(",")} / 多 ${extra.slice(0, 5).join(",")}`);
}
if (byName.has(MECH_EMPTY_FRAME)) throw new Error(`官方图集已存在 ${MECH_EMPTY_FRAME}——占位帧命名冲突`);
const missingOfficial = [...union].filter((n) => !byName.has(n));
if (missingOfficial.length) throw new Error(`需求帧不在官方图集：${missingOfficial.slice(0, 5).join(",")}`);

const declared = meta.frames.map((f) => f.filename);
const dead = declared.filter((n) => !keepMech.has(n));
const rule = DEAD_RULES.mech;
const badDead = dead.filter((n) => !rule.families.some((p) => n.startsWith(p)) && !rule.exact.includes(n));
if (badDead.length) throw new Error(`${badDead.length} 个零消费帧不在 DEAD 名单（${badDead.slice(0, 5).join(",")}）——先裁定`);

const EMPTY_FRAME = {
  filename: MECH_EMPTY_FRAME,
  frame: { x: 0, y: 0, w: 1, h: 1 },
  rotated: false,
  trimmed: false,
  spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 },
  sourceSize: { w: 1, h: 1 },
};

/** 货架式打包：行高由该行最高帧决定。排序与候选宽度都固定，产物可逐字节复现。 */
function shelf(items, capacity) {
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  let usedW = 0;
  const placed = [];
  for (const f of items) {
    const { w, h } = f.frame;
    if (x + w + PAD > capacity) {
      x = PAD;
      y += rowH + GAP;
      rowH = 0;
    }
    placed.push({ f, x, y });
    x += w + GAP;
    usedW = Math.max(usedW, x - GAP);
    rowH = Math.max(rowH, h);
  }
  return { w: usedW + PAD, h: y + rowH + PAD, placed };
}

function pack(frames) {
  const items = [...frames].sort(
    (a, b) => b.frame.h - a.frame.h || b.frame.w - a.frame.w || a.filename.localeCompare(b.filename),
  );
  const area = items.reduce((s, f) => s + f.frame.w * f.frame.h, 0);
  const maxW = Math.max(...items.map((f) => f.frame.w));
  const narrow = [Math.ceil(Math.sqrt(area)), Math.ceil(Math.sqrt(area) * 1.1), Math.ceil(Math.sqrt(area) * 1.25)];
  const candidates = [...new Set([...narrow, 256, 384, 512, 640, 768, 896, 1024, 1152, 1280, 1536, 1792, 2048])]
    .map((w) => w + 2 * PAD)
    .filter((w) => w >= maxW + 2 * PAD)
    .sort((a, b) => a - b);
  let best = null;
  for (const capacity of candidates) {
    const p = shelf(items, capacity);
    const better =
      !best ||
      p.w * p.h < best.w * best.h ||
      (p.w * p.h === best.w * best.h && (p.h < best.h || (p.h === best.h && p.w < best.w)));
    if (better) best = p;
  }
  return best;
}

function jsonOf(v, w, h, frames) {
  return JSON.stringify({
    ...meta,
    meta: { ...meta.meta, image: `MechAssets-${v.id}.png`, size: { w, h } },
    frames,
  });
}

/** 回读复验：逐帧裁剪与 Slim 同矩形逐字节相等；帧矩形之外（间距/外框）alpha 全 0。 */
function prove(v, png, w, h, frames, covered) {
  const back = decodePng(png, `MechAssets-${v.id}.png`);
  if (back.w !== w || back.h !== h) throw new Error(`变体 ${v.id} 往返尺寸不符：${back.w}x${back.h}`);
  for (const f of frames) {
    const src = byName.get(f.filename).frame;
    const { x, y, w: fw, h: fh } = f.frame;
    for (let yy = 0; yy < fh; yy++) {
      const a = ((y + yy) * back.w + x) * 4;
      const b = ((src.y + yy) * slim.w + src.x) * 4;
      if (!back.data.subarray(a, a + fw * 4).equals(slim.data.subarray(b, b + fw * 4))) {
        throw new Error(`变体 ${v.id}/${f.filename} 第 ${yy} 行与 Slim 不同`);
      }
    }
  }
  let stray = 0;
  for (let i = 0; i < covered.length; i++) {
    if (covered[i]) continue;
    if (back.data[i * 4 + 3] !== 0) stray++;
  }
  if (stray) throw new Error(`变体 ${v.id} 有 ${stray} 个帧外像素非透明`);
}

function buildEmpty(v) {
  const png = encodePngRgba(1, 1, Buffer.alloc(4));
  const frames = [EMPTY_FRAME];
  const json = jsonOf(v, 1, 1, frames);
  const back = decodePng(png, `MechAssets-${v.id}.png`);
  if (back.w !== 1 || back.h !== 1 || back.data[3] !== 0) throw new Error(`变体 ${v.id} 占位帧非 1×1 透明`);
  return { png, json, frames: 1, w: 1, h: 1 };
}

function build(v) {
  const need = new Set(v.frames);
  if (need.size === 1 && need.has(MECH_EMPTY_FRAME)) return buildEmpty(v);

  const frames = meta.frames.filter((f) => need.has(f.filename));
  if (frames.length !== need.size) throw new Error(`变体 ${v.id} 需求帧缺失`);
  const packed = pack(frames);
  const data = Buffer.alloc(packed.w * packed.h * 4);
  const covered = new Uint8Array(packed.w * packed.h);
  const placed = new Map();
  for (const { f, x, y } of packed.placed) {
    const { w, h } = f.frame;
    for (let yy = 0; yy < h; yy++) {
      const src = ((f.frame.y + yy) * slim.w + f.frame.x) * 4;
      const dst = ((y + yy) * packed.w + x) * 4;
      slim.data.copy(data, dst, src, src + w * 4);
      covered.fill(1, (y + yy) * packed.w + x, (y + yy) * packed.w + x + w);
    }
    placed.set(f.filename, { ...f, frame: { x, y, w, h } });
  }
  const outFrames = frames.map((f) => placed.get(f.filename));
  const png = encodePngRgba(packed.w, packed.h, data);
  prove(v, png, packed.w, packed.h, outFrames, covered);
  return { png, json: jsonOf(v, packed.w, packed.h, outFrames), frames: outFrames.length, w: packed.w, h: packed.h };
}

const out = [...variants.values()].sort((a, b) => a.id.localeCompare(b.id));
const built = out.map((v) => ({ ...v, ...build(v) }));
const kb = (n) => +(n / 1024).toFixed(1);
const mib = (n) => +(n * 4 / 1048576).toFixed(2);
const pngTotal = built.reduce((s, b) => s + b.png.length, 0);
const jsonTotal = built.reduce((s, b) => s + Buffer.byteLength(b.json), 0);
const decodeTotal = built.reduce((s, b) => s + b.w * b.h, 0);

if (CHECK) {
  if (!existsSync(OUT_DIR)) throw new Error(`在库变体目录缺失：${OUT_DIR}`);
  let bad = 0;
  for (const b of built) {
    const p = join(OUT_DIR, `MechAssets-${b.id}.png`);
    const j = join(OUT_DIR, `MechAssets-${b.id}.json`);
    if (!existsSync(p) || !existsSync(j)) {
      console.error(`✗ 缺失：MechAssets-${b.id}.{png,json}`);
      bad++;
      continue;
    }
    if (Buffer.compare(readFileSync(p), b.png) !== 0) { console.error(`✗ PNG 不一致：${b.id}`); bad++; }
    if (readFileSync(j, "utf8") !== b.json) { console.error(`✗ JSON 不一致：${b.id}`); bad++; }
  }
  const expected = new Set(built.flatMap((b) => [`MechAssets-${b.id}.png`, `MechAssets-${b.id}.json`]));
  const extras = readdirSync(OUT_DIR).filter((n) => /^MechAssets-[0-9a-f]{8}\.(png|json)$/.test(n) && !expected.has(n));
  if (extras.length) { console.error(`✗ 多余在库变体：${extras.join(",")}`); bad++; }
  if (bad) process.exit(1);
  console.log(`✓ 复现性：${built.length} 个按关变体与生成器逐字节一致（48 关 → ${built.length} 子集；PNG 合计 ${kb(pngTotal)}KB + JSON ${kb(jsonTotal)}KB，解码合计 ${mib(decodeTotal)}MiB）`);
} else {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const b of built) {
    writeFileSync(join(OUT_DIR, `MechAssets-${b.id}.png`), b.png);
    writeFileSync(join(OUT_DIR, `MechAssets-${b.id}.json`), b.json);
    console.log(
      `MechAssets-${b.id}：${b.frames} 帧 ${b.w}x${b.h}（解码 ${mib(b.w * b.h)}MiB）PNG ${kb(b.png.length)}KB + JSON ${kb(Buffer.byteLength(b.json))}KB` +
        `  关卡 ${b.levels.length}（${b.levels.slice(0, 4).join(",")}${b.levels.length > 4 ? "…" : ""}）`,
    );
  }
  console.log(`✓ 已写入 ${built.length} 个变体到 assets/atlasses/mech/：48 关 → ${built.length} 子集，PNG 合计 ${kb(pngTotal)}KB + JSON ${kb(jsonTotal)}KB，解码合计 ${mib(decodeTotal)}MiB（旧口径 ${built.length * 16}MiB）`);
}
