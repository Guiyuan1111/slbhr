// r30：MechAssets 按关变体生成器（原地清零口径，帧坐标不动）。
//   入口：node --import tsx scripts/split-mech-atlas.mjs [--check]
//   产物：assets/atlasses/mech/MechAssets-<变体id>.{png,json}（变体 id = mechVariantId(level)）
//
// 与 r26 的 Slim 同一原则：画布仍是 2048²、保留帧的矩形与像素逐字节照抄，只把本关不消费的
// 帧矩形清零；不重排、不换坐标，避免 drawImage 源矩形相位变化。帧集合口径在
// packages/shared/src/mech-needs.ts（客户端按解析后的关卡当场算 id，无需清单文件）。
//
// 风区 34 帧（wind_base 0-3 / wind_effect 0-29，110.2KB）只给 15 个有风关卡；零机关关卡
// （forest_06 / forest_06_1）生成一张仅含 1×1 透明占位帧 mech_empty0000 的变体。
//
// 无损证明：逐帧回读 PNG 并与 Slim 同帧矩形逐字节比较；非保留帧全 0；占位帧全 0。
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

if (slim.w !== srcOfficial.w || slim.h !== srcOfficial.h) throw new Error("Slim 画布尺寸与官方不一致");
if (meta.frames.some((f) => f.rotated || f.trimmed || f.spriteSourceSize?.x || f.spriteSourceSize?.y)) {
  throw new Error("官方帧存在 rotated/trimmed/偏移——原地清零的几何等价前提失效，先复核");
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

function build(v) {
  const need = new Set(v.frames);
  const data = Buffer.from(slim.data);
  for (const f of meta.frames) {
    if (need.has(f.filename)) continue;
    const { x, y, w, h } = f.frame;
    for (let yy = y; yy < y + h; yy++) data.fill(0, (yy * slim.w + x) * 4, (yy * slim.w + x + w) * 4);
  }
  const hasDummy = need.has(MECH_EMPTY_FRAME);
  if (hasDummy) {
    // 占位帧取画布 (0,0) 的 1×1；该处属 BackgroundCover0000（非 keep，已清零）
    const o = 0;
    if (data[o] || data[o + 1] || data[o + 2] || data[o + 3]) throw new Error(`占位帧位置 (0,0) 非透明（变体 ${v.id}）`);
  }
  const png = encodePngRgba(slim.w, slim.h, data);
  const frames = meta.frames.filter((f) => need.has(f.filename));
  if (hasDummy) frames.push(EMPTY_FRAME);
  const json = JSON.stringify({
    ...meta,
    meta: { ...meta.meta, image: `MechAssets-${v.id}.png`, size: { w: slim.w, h: slim.h } },
    frames,
  });

  const back = decodePng(png, `MechAssets-${v.id}.png`);
  if (back.w !== slim.w || back.h !== slim.h) throw new Error(`变体 ${v.id} 往返尺寸不符`);
  let bad = 0;
  for (const f of frames) {
    const rect = f.frame;
    for (let yy = rect.y; yy < rect.y + rect.h; yy++) {
      const off = (yy * slim.w + rect.x) * 4;
      if (!back.data.subarray(off, off + rect.w * 4).equals(slim.data.subarray(off, off + rect.w * 4))) bad++;
    }
  }
  if (bad) throw new Error(`变体 ${v.id} 无损证明失败：${bad} 行与 Slim 不同`);
  // 非保留帧必须全 0（编码前后都验）
  let dirty = 0;
  for (const f of meta.frames) {
    if (need.has(f.filename)) continue;
    const { x, y, w, h } = f.frame;
    for (let yy = y; yy < y + h; yy++) {
      const off = (yy * slim.w + x) * 4;
      for (let i = off; i < off + w * 4; i++) if (back.data[i] !== 0) dirty++;
    }
  }
  if (dirty) throw new Error(`变体 ${v.id} 有 ${dirty} 个非保留像素未清零`);
  return { png, json, frames: frames.length };
}

const out = [...variants.values()].sort((a, b) => a.id.localeCompare(b.id));
const built = out.map((v) => ({ ...v, ...build(v) }));
const kb = (n) => +(n / 1024).toFixed(1);
const pngTotal = built.reduce((s, b) => s + b.png.length, 0);
const jsonTotal = built.reduce((s, b) => s + Buffer.byteLength(b.json), 0);

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
  console.log(`✓ 复现性：${built.length} 个按关变体与生成器逐字节一致（48 关 → ${built.length} 子集；PNG 合计 ${kb(pngTotal)}KB + JSON ${kb(jsonTotal)}KB）`);
} else {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const b of built) {
    writeFileSync(join(OUT_DIR, `MechAssets-${b.id}.png`), b.png);
    writeFileSync(join(OUT_DIR, `MechAssets-${b.id}.json`), b.json);
    console.log(
      `MechAssets-${b.id}：${b.frames} 帧 PNG ${kb(b.png.length)}KB + JSON ${kb(Buffer.byteLength(b.json))}KB` +
        `  关卡 ${b.levels.length}（${b.levels.slice(0, 4).join(",")}${b.levels.length > 4 ? "…" : ""}）`,
    );
  }
  console.log(`✓ 已写入 ${built.length} 个变体到 assets/atlasses/mech/：48 关 → ${built.length} 子集，PNG 合计 ${kb(pngTotal)}KB + JSON ${kb(jsonTotal)}KB`);
}
