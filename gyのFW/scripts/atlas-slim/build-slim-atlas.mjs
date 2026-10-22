#!/usr/bin/env node
/**
 * r26 件1：进房三张图集（Mech/Temples-forest/Popup）的"零消费帧原地清零"生成器。
 *
 *   node --import tsx scripts/atlas-slim/build-slim-atlas.mjs            # 只打印账目（不落盘）
 *   node --import tsx scripts/atlas-slim/build-slim-atlas.mjs --write    # 写在库 Slim PNG
 *   node --import tsx scripts/atlas-slim/build-slim-atlas.mjs --check    # 重建并与之比字节（门禁）
 *
 * 口径：
 *  - 只改 PNG 像素，**坐标与官方 JSON 都不动**；keep 帧逐字节照抄，blank 帧矩形整块清零。
 *  - 不清零任何与 keep 帧矩形相交的像素（相交断言 0）；blank 之外的像素与官方全等（逐像素断言）。
 *  - 编码后立刻解码回验：尺寸不变、keep 逐字节不变、blank 全 0、blank 外 0 差异。
 *  - 为什么不是重排/按关拆张：图集帧的绝对坐标决定 Canvas 位图字的降采样相位（r24 教训），
 *    而精灵帧的重排也会改变 drawImage 源矩形相位。原地清零把"装载字节"降下来，同时让所有
 *    上屏像素与官方逐字节相同——这是本轮可接受的唯一形态。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { decodePng, encodePngRgba } from "../png-raw.mjs";
import { ATLAS_SPECS, REPO_ROOT, inspect } from "./needs.mjs";

const kb = (n) => +(n / 1024).toFixed(1);

function rectRows(img, f, fn) {
  for (let y = f.y; y < f.y + f.h; y++) fn(y, (y * img.w + f.x) * 4, f.w * 4);
}

function assertInBounds(img, f, label) {
  if (f.x < 0 || f.y < 0 || f.x + f.w > img.w || f.y + f.h > img.h) {
    throw new Error(`atlas-slim：${label} 帧矩形 (${f.x},${f.y},${f.w}x${f.h}) 越出 ${img.w}x${img.h}`);
  }
}

/** 构建（不落盘）：返回每张图集的元数据与编码后的 PNG Buffer */
export async function buildAll(root = REPO_ROOT) {
  const { atlases } = await inspect(root);
  const results = [];
  for (const [key, spec] of Object.entries(ATLAS_SPECS)) {
    const a = atlases[key];
    const officialBytes = readFileSync(join(root, spec.officialPng));
    const src = decodePng(officialBytes, key);
    const rects = new Map(a.meta.frames.map((f) => [f.filename, f.frame]));
    const keepRects = a.keep.map((n) => ({ name: n, ...rects.get(n) }));
    const blankRects = a.blank.map((n) => ({ name: n, ...rects.get(n) }));

    for (const f of [...keepRects, ...blankRects]) assertInBounds(src, f, `${key}/${f.name}`);
    let overlap = 0;
    for (const b of blankRects) {
      for (const k of keepRects) {
        if (b.x < k.x + k.w && k.x < b.x + b.w && b.y < k.y + k.h && k.y < b.y + b.h) overlap++;
      }
    }
    if (overlap) throw new Error(`atlas-slim/${key}：${overlap} 对 blank/keep 帧矩形相交，原地清零会伤活帧`);

    const data = Buffer.from(src.data);
    let blankPixels = 0;
    for (const f of blankRects) {
      rectRows(src, f, (y, off, len) => data.fill(0, off, off + len));
      blankPixels += f.w * f.h;
    }

    // blank 之外的像素必须与官方全等（keep 帧、帧间空隙、extrusion 都不许动）
    const mask = new Uint8Array(src.w * src.h);
    for (const f of blankRects) {
      for (let y = f.y; y < f.y + f.h; y++) mask.fill(1, y * src.w + f.x, y * src.w + f.x + f.w);
    }
    let diffOutside = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) continue;
      const o = i * 4;
      if (src.data[o] !== data[o] || src.data[o + 1] !== data[o + 1] || src.data[o + 2] !== data[o + 2] || src.data[o + 3] !== data[o + 3]) diffOutside++;
    }
    if (diffOutside) throw new Error(`atlas-slim/${key}：blank 之外有 ${diffOutside} 个像素被改动`);

    const png = encodePngRgba(src.w, src.h, data);

    // 编码往返回验：编码器若改了色/alpha 或行列序，这里当场红
    const rt = decodePng(png, `${key}-slim`);
    if (rt.w !== src.w || rt.h !== src.h) throw new Error(`atlas-slim/${key}：往返尺寸 ${rt.w}x${rt.h} != ${src.w}x${src.h}`);
    let rtBad = 0;
    for (const f of keepRects) {
      rectRows(src, f, (y, off, len) => {
        if (!src.data.subarray(off, off + len).equals(rt.data.subarray(off, off + len))) rtBad++;
      });
    }
    for (const f of blankRects) {
      rectRows(rt, f, (y, off, len) => {
        for (let i = off; i < off + len; i++) if (rt.data[i] !== 0) rtBad++;
      });
    }
    if (rtBad) throw new Error(`atlas-slim/${key}：往返回验失败（${rtBad} 行/字节不符）`);

    results.push({
      key,
      spec,
      w: src.w,
      h: src.h,
      declared: a.declared.length,
      keep: a.keep,
      blank: a.blank,
      blankPixels,
      officialBytes: officialBytes.length,
      png,
      saving: officialBytes.length - png.length,
      savingPct: +(((officialBytes.length - png.length) / officialBytes.length) * 100).toFixed(1),
    });
  }
  return results;
}

function print(rs) {
  let totalSaving = 0;
  let totalOfficial = 0;
  for (const r of rs) {
    totalSaving += r.saving;
    totalOfficial += r.officialBytes;
    console.log(
      `${r.key.padEnd(6)} ${`${r.w}x${r.h}`.padEnd(9)} 帧 ${String(r.declared).padStart(3)}（keep ${String(r.keep.length).padStart(3)} / blank ${String(r.blank.length).padStart(3)}）` +
        ` 官方 ${String(kb(r.officialBytes)).padStart(6)}KB → Slim ${String(kb(r.png.length)).padStart(6)}KB` +
        ` 省 ${String(kb(r.saving)).padStart(6)}KB（${r.savingPct}%） 清零 ${(r.blankPixels / 1048576).toFixed(2)}Mpx`,
    );
  }
  console.log(`合计 官方 ${kb(totalOfficial)}KB → Slim ${kb(totalOfficial - totalSaving)}KB，省 ${kb(totalSaving)}KB（${((totalSaving / totalOfficial) * 100).toFixed(1)}%）`);
}

async function main() {
  const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--check") ? "check" : "dry";
  const rs = await buildAll();
  print(rs);
  if (mode === "dry") {
    console.log("（dry：未落盘。--write 写在库产物；--check 重建后与在库比字节）");
    return;
  }
  if (mode === "check") {
    const bad = [];
    for (const r of rs) {
      let disk;
      try {
        disk = readFileSync(join(REPO_ROOT, r.spec.slimPng));
      } catch {
        bad.push(`${r.key}: ${r.spec.slimPng} 缺失`);
        continue;
      }
      if (!disk.equals(r.png)) bad.push(`${r.key}: ${r.spec.slimPng} 与重建字节不一致（磁盘 ${disk.length}B / 重建 ${r.png.length}B）`);
    }
    if (bad.length) {
      for (const b of bad) console.error(`✗ ${b}`);
      process.exit(1);
    }
    console.log(`✓ --check：${rs.length} 张 Slim PNG 与重建逐字节一致`);
    return;
  }
  for (const r of rs) writeFileSync(join(REPO_ROOT, r.spec.slimPng), r.png);
  console.log(`✓ 已写入 ${rs.map((r) => r.spec.slimPng).join("、")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
