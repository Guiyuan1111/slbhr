// r34：TempleAssets 按"什么时候必须到位"拆两张，并把两张画布都收到最小。
//
// 现状（r26 清零后）：`TempleAssetsSlim.png` 1024×2048（解码 8.00MiB），60 帧里 56 帧是真帧——
// 其中 42 帧是两扇门的开门动画（FinishBoy/Girl 0001..0021），只有玩家踩门那一刻才上屏。
// 它随 `loadGameAtlases` 进落定门，选关大厅/Temple 也要为这 42 帧背 8MiB 解码与 229.5KB 传输。
//
// 拆法：
//   TempleAssetsCore    14 帧：背景/前景/时钟/两扇门静帧 0000/选关大厅背景/装饰 8 帧。
//                       随落定门装载（BootScene.loadGameAtlases + TempleScene 兜底）。
//   TempleAssetsFinish  42 帧：两扇门 0001..0021。create 之后由 GameScene.kickTempleFinish 取，
//                       离房回选关时随 Game 场景释放（main.ts leaveToMenu）。
//
// 画布：两张都按 GUT=2 的 shelf 排布重打包（帧像素逐字节照抄官方，只换容器坐标）。
// 与 r24 位图字相位教训不矛盾：那条说的是 Canvas2D 对字形 drawImage 的降采样核随**绝对源坐标**
// 变相位；这里没有缩放绘制的消费点——TileSprite 会把帧先 1:1 拷进自己的 CanvasTexture
// （TileSprite.updateCanvas），地面/门蒙版也是 1:1 drawImage，精灵都按原生尺寸画。官方 60 帧
// 全部 trimmed:false、spriteSourceSize 偏移 0（本脚本核对，变了就抛），故几何等价。
//
// Core 的 JSON 仍声明官方全部 60 个帧名：42 个 Finish 帧与 4 个零消费帧以 `mainAlias` 别名到
// 4×4 透明块。这样任何漏改的按名取帧只会画透明，不会落进 Phaser 的 `__BASE`（整张图集铺满屏）。
// GameScene 的门帧驱动在 Finish 图集未到位时回落 Core 的 0000 静帧，快照下一拍补帧。
//
// 口径唯一来源：`scripts/atlas-slim/needs.mjs` 的 inspect()（keep = 48 关需求并集）。
// 用法（needs.mjs 引入 shared 的 TS，需 tsx）：
//   node --import tsx scripts/split-temple-atlas.mjs           # 生成/覆盖四件产物
//   node --import tsx scripts/split-temple-atlas.mjs --check   # 重建到 TEMP 并与在库产物比字节
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cropRaw, decodePng, encodePngRgba } from "./png-raw.mjs";
import { ATLAS_SPECS, DEAD_RULES, REPO_ROOT, inspect } from "./atlas-slim/needs.mjs";

const SRC_PNG = join(REPO_ROOT, ATLAS_SPECS.temple.officialPng);
const SRC_JSON = join(REPO_ROOT, ATLAS_SPECS.temple.json);
const OUT_DIR = join(REPO_ROOT, "assets", "atlasses", "Temples", "forest");
const TEMP = join(REPO_ROOT, "TEMP", "split-temple-atlas");
const CHECK = process.argv.includes("--check");

/** 隔离带：帧矩形外 1px 环带全透明（与 r32/r33 同规格） */
const GUT = 2;
/** 排布行宽：与源图集同宽级，PNG 行间相关性利于滤波压缩 */
const MAX_W = 1024;
const CORE = "TempleAssetsCore";
const FINISH = "TempleAssetsFinish";

const atlas = JSON.parse(readFileSync(SRC_JSON, "utf8"));
const byName = new Map(atlas.frames.map((f) => [f.filename, f]));
const declared = atlas.frames.map((f) => f.filename);

// 与 r32/r33 同一几何等价前提：官方帧未 trim、偏移 0。任一不成立都必须改脚本。
const trimmed = atlas.frames.filter((f) => f.trimmed || f.spriteSourceSize?.x || f.spriteSourceSize?.y);
if (trimmed.length) {
  throw new Error(`官方图集有 ${trimmed.length} 个 trimmed/带偏移的帧（首个：${trimmed[0].filename}），几何等价前提失效`);
}

const { atlases } = await inspect(REPO_ROOT);
const keep = atlases.temple.keep;
// 门动画帧名由运行时按 `FinishBoy|Girl` + 4 位帧号拼出；根号段即拆张边界。
const finish = keep.filter((n) => /^Finish(Boy|Girl)\d{4}$/.test(n) && !n.endsWith("0000"));
const core = keep.filter((n) => !finish.includes(n));
const expectedFinish = ["FinishBoy", "FinishGirl"].flatMap((p) =>
  Array.from({ length: 21 }, (_, i) => `${p}${String(i + 1).padStart(4, "0")}`),
);
if (finish.length !== 42 || [...finish].sort().join() !== [...expectedFinish].sort().join()) {
  throw new Error(`Finish 帧账漂移：${finish.length} 帧（期望 42，FinishBoy/Girl 0001..0021）`);
}
if (core.length !== 14) throw new Error(`Core 帧账漂移：${core.length} 帧（期望 14）——先复核 needs.mjs 的 keep`);

const keepSet = new Set(keep);
const blank = declared.filter((n) => !keepSet.has(n));
const rule = DEAD_RULES.temple;
const badDead = blank.filter((n) => !rule.families.some((p) => n.startsWith(p)) && !rule.exact.includes(n));
if (badDead.length) {
  throw new Error(`${badDead.length} 个零消费帧不在 DEAD 名单（${badDead.join(",")}）——先裁定`);
}

const src = decodePng(readFileSync(SRC_PNG), "TempleAssets.png");
if (src.w !== atlas.meta.size.w || src.h !== atlas.meta.size.h) {
  throw new Error(`PNG ${src.w}×${src.h} 与 JSON meta ${atlas.meta.size.w}×${atlas.meta.size.h} 不一致`);
}

/** shelf 排布：高降序、同高按宽降序、再按帧名——同输入必同输出（--check 依赖这一点） */
function shelf(names) {
  const items = names
    .map((name) => ({ name, ...byName.get(name).frame }))
    .sort((a, b) => b.h - a.h || b.w - a.w || a.name.localeCompare(b.name));
  let x = GUT;
  let y = GUT;
  let shelfH = 0;
  let W = 0;
  const out = [];
  for (const it of items) {
    if (x + it.w + GUT > MAX_W && x > GUT) {
      x = GUT;
      y += shelfH + GUT;
      shelfH = 0;
    }
    out.push({ name: it.name, px: x, py: y });
    x += it.w + GUT;
    shelfH = Math.max(shelfH, it.h);
    W = Math.max(W, x);
  }
  return { W, H: y + shelfH + GUT, out };
}

/** 别名块：4×4 全透明；扫一个与所有真帧矩形（含 1px 环带）不相交的位置 */
function findAlias(W, H, rects) {
  for (let y = GUT + 1; y + 4 + GUT <= H; y++) {
    for (let x = GUT + 1; x + 4 + GUT <= W; x++) {
      let hit = false;
      for (const r of rects) {
        if (x - 1 < r.x + r.w && r.x < x + 5 && y - 1 < r.y + r.h && r.y < y + 5) {
          hit = true;
          break;
        }
      }
      if (!hit) return { x, y, w: 4, h: 4 };
    }
  }
  throw new Error(`${W}×${H} 画布找不到 4×4 透明别名区`);
}

function build(names, label, withAliases) {
  const { W, H, out } = shelf(names);
  const data = Buffer.alloc(W * H * 4); // 全透明底
  const placed = new Map();
  for (const it of out) {
    const f = byName.get(it.name);
    if (it.px + f.frame.w > W || it.py + f.frame.h > H) throw new Error(`${label}/${it.name} 越出 ${W}×${H}`);
    const crop = cropRaw(src, f.frame.x, f.frame.y, f.frame.w, f.frame.h);
    for (let r = 0; r < f.frame.h; r++) {
      crop.copy(data, ((it.py + r) * W + it.px) * 4, r * f.frame.w * 4, (r + 1) * f.frame.w * 4);
    }
    placed.set(it.name, { x: it.px, y: it.py, w: f.frame.w, h: f.frame.h });
  }
  const alias = withAliases ? findAlias(W, H, [...placed.values()]) : null;
  const frames = [];
  for (const n of declared) {
    const f = byName.get(n);
    if (placed.has(n)) {
      const p = placed.get(n);
      frames.push({
        filename: n,
        frame: { ...p },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: f.sourceSize.w, h: f.sourceSize.h },
        sourceSize: { w: f.sourceSize.w, h: f.sourceSize.h },
      });
      continue;
    }
    if (!withAliases) continue; // Finish 图集只声明自己的 42 帧
    frames.push({
      filename: n,
      frame: { ...alias },
      rotated: false,
      trimmed: false, // trimmed:false ⇒ Phaser 不读 spriteSourceSize；省掉它是线上字节
      sourceSize: { w: f.sourceSize.w, h: f.sourceSize.h },
      mainAlias: true,
    });
  }
  const png = encodePngRgba(W, H, data);
  return { label, W, H, png, frames, placed, alias };
}

const products = [
  build(core, CORE, true),
  build(finish, FINISH, false),
];

// 编码往返回验：真帧逐字节等于官方裁片；Core 别名块环带全透明；真帧四周 1px 环带透明。
for (const p of products) {
  const back = decodePng(p.png, `${p.label}.png`);
  if (back.w !== p.W || back.h !== p.H) throw new Error(`${p.label} 往返尺寸 ${back.w}×${back.h} != ${p.W}×${p.H}`);
  for (const [name, f] of p.placed) {
    const o = byName.get(name).frame;
    if (!cropRaw(back, f.x, f.y, f.w, f.h).equals(cropRaw(src, o.x, o.y, o.w, o.h))) {
      throw new Error(`${p.label} 回读不一致：${name}`);
    }
    for (let c = f.x - 1; c <= f.x + f.w; c++) {
      for (const r of [f.y - 1, f.y + f.h]) {
        if (back.data[(r * back.w + c) * 4 + 3] !== 0) throw new Error(`${p.label}/${name} 上下环带 ${c},${r} 不透明`);
      }
    }
    for (let r = f.y - 1; r <= f.y + f.h; r++) {
      for (const c of [f.x - 1, f.x + f.w]) {
        if (back.data[(r * back.w + c) * 4 + 3] !== 0) throw new Error(`${p.label}/${name} 左右环带 ${c},${r} 不透明`);
      }
    }
  }
  if (p.alias) {
    for (let r = p.alias.y - 1; r <= p.alias.y + p.alias.h; r++) {
      for (let c = p.alias.x - 1; c <= p.alias.x + p.alias.w; c++) {
        if (back.data[(r * back.w + c) * 4 + 3] !== 0) throw new Error(`${p.label} 别名块环带 ${c},${r} 不透明`);
      }
    }
  }
  p.json = `${
    JSON.stringify({
      frames: p.frames,
      meta: { app: "split-temple-atlas", version: "1.0", image: `${p.label}.png`, format: "RGBA8888", size: { w: p.W, h: p.H }, scale: "1" },
    })
  }\n`;
}

const aliasCount = products[0].frames.filter((f) => f.mainAlias).length;
if (products[0].frames.length !== declared.length || aliasCount !== 46) {
  throw new Error(`Core JSON 帧账漂移：${products[0].frames.length} 帧 / 别名 ${aliasCount}（期望 60 / 46）`);
}
if (products[1].frames.length !== 42) throw new Error(`Finish JSON 帧账漂移：${products[1].frames.length} 帧（期望 42）`);

const bytes = (p) => readFileSync(p).length;
const officialJson = bytes(SRC_JSON);
const slimPng = bytes(join(REPO_ROOT, ATLAS_SPECS.temple.slimPng));
for (const p of products) {
  console.log(
    `${p.label}: ${p.frames.filter((f) => !f.mainAlias).length} 真帧` +
      `${p.alias ? `＋${p.frames.filter((f) => f.mainAlias).length} 别名` : ""} ${p.W}×${p.H}` +
      `（解码 ${((p.W * p.H * 4) / 1048576).toFixed(2)}MiB）PNG ${p.png.length}B JSON ${Buffer.byteLength(p.json)}B`,
  );
}
console.log(
  `官方 ${src.w}×${src.h}（解码 ${((src.w * src.h * 4) / 1048576).toFixed(2)}MiB）PNG ${bytes(SRC_PNG)}B JSON ${officialJson}B` +
    `｜Slim PNG ${slimPng}B｜两件合计 PNG ${products.reduce((s, p) => s + p.png.length, 0)}B` +
    `（较 Slim ${products.reduce((s, p) => s + p.png.length, 0) - slimPng}B）`,
);

if (CHECK) {
  rmSync(TEMP, { recursive: true, force: true });
  mkdirSync(TEMP, { recursive: true });
  for (const p of products) {
    const diskPng = join(OUT_DIR, `${p.label}.png`);
    const diskJson = join(OUT_DIR, `${p.label}.json`);
    if (!existsSync(diskPng) || !existsSync(diskJson)) throw new Error(`在库产物缺失：先不带 --check 跑一次（${p.label}）`);
    const sameP = Buffer.compare(readFileSync(diskPng), p.png) === 0;
    const sameJ = Buffer.compare(readFileSync(diskJson), Buffer.from(p.json)) === 0;
    writeFileSync(join(TEMP, `${p.label}.png`), p.png);
    writeFileSync(join(TEMP, `${p.label}.json`), p.json);
    if (!sameP || !sameJ) throw new Error(`复现性失败：${p.label} png 一致=${sameP} json 一致=${sameJ}`);
  }
  rmSync(TEMP, { recursive: true, force: true });
  console.log(`✓ 复现性：四件产物与生成器逐字节一致`);
} else {
  for (const p of products) {
    writeFileSync(join(OUT_DIR, `${p.label}.png`), p.png);
    writeFileSync(join(OUT_DIR, `${p.label}.json`), p.json);
  }
  console.log(`✓ 已写入 ${OUT_DIR}/TempleAssets{Core,Finish}.{png,json}`);
}
