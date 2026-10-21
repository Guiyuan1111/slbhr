/**
 * 进房前字体子集的共用口径层（生成器 scripts/build-font-prephase.mjs 与静态测试
 * packages/client/src/__tests__/font-prephase.test.ts 共用，避免两处各写一份解析而漂移）。
 *
 * 为什么只动像素、不动 .fnt：Phaser 的 ParseXMLBitmapFont 按 fnt 为每个字形建一条 Texture frame，
 * 帧矩形与 xadvance 全部来自 fnt。清零帧外像素不会让任何已声明字形错位，未保留的字形只是画成透明
 * ——与今日"fnt 里没有的字必空白"同一种表现，不会抛错。
 *
 * 授权区（keepMask）= 保留字形的帧矩形 ∪ 其四周 ring 宽的环带（环带原样保留源字节，哪怕它属于邻帧矩形）。
 * 环带的必要性是滤波：本项目未配置 pixelArt/setFilter，纹理走 Phaser 默认 LINEAR，WebGL 下字形边缘
 * 会采到帧外 1 texel；ring 取 fnt 声明的 padding（4），把这一圈邻域字节原样留着，观感才与今日逐像素相同。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodePng } from "../png-raw.mjs";

/** @typedef {{id:number,x:number,y:number,width:number,height:number,xoffset:number,yoffset:number,xadvance:number}} GlyphRect */

/** 解析 bmfont 的 .fnt（本项目：单页、chnl=15、空格 id=32 重复声明两条且都 0×0）。 */
export function parseFnt(path) {
  const xml = readFileSync(path, "utf8");
  const info = /<info\b[^>]*>/.exec(xml);
  if (!info) throw new Error(`${path} 缺 <info>`);
  const common = /<common\b[^>]*>/.exec(xml);
  if (!common) throw new Error(`${path} 缺 <common>`);
  const attr = (tag, name) => {
    const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag[0]);
    if (!m) throw new Error(`${tag[0].slice(0, 40)} 缺属性 ${name}`);
    return m[1];
  };
  const glyphs = new Map();
  const dupes = [];
  for (const m of xml.matchAll(/<char\b[^>]*>/g)) {
    const a = (name) => Number(attr(m, name));
    const g = {
      id: a("id"),
      x: a("x"),
      y: a("y"),
      width: a("width"),
      height: a("height"),
      xoffset: a("xoffset"),
      yoffset: a("yoffset"),
      xadvance: a("xadvance"),
    };
    if (a("page") !== 0) throw new Error(`字形 ${g.id} 不在页 0`);
    // 同 id 重复时后一条生效：Phaser ParseXMLBitmapFont.js:109 就是 data.chars[charCode] = {...} 直写；
    // :128 的 `gw !== 0 && gh !== 0` 又让 0×0 字形不建 Texture frame。本字体有两条 id=32（都 0×0），
    // 故这条口径只影响空格的 xoffset/yoffset 度量，不影响任何像素。
    if (glyphs.has(g.id)) dupes.push({ id: g.id, prev: glyphs.get(g.id), next: g });
    glyphs.set(g.id, g);
  }
  return {
    size: Number(attr(info, "size")),
    padding: attr(info, "padding").split(",").map(Number),
    scaleW: Number(attr(common, "scaleW")),
    scaleH: Number(attr(common, "scaleH")),
    pages: Number(attr(common, "pages")),
    lineHeight: Number(attr(common, "lineHeight")),
    base: Number(attr(common, "base")),
    charLines: glyphs.size + dupes.length,
    dupes,
    glyphs,
  };
}

/**
 * 由 prephase-chars.json 推字形集。
 * 返回 kept（子集里既有文案又有字形的）、noGlyph（有文案但 fnt 没字形：今日即空白，行为不变）。
 */
export function prephaseChars(spec, fnt) {
  /** @type {Map<string, string[]>} */
  const chars = new Map();
  const add = (ch, where) => {
    const list = chars.get(ch) ?? [];
    if (!list.includes(where)) list.push(where);
    chars.set(ch, list);
  };
  for (const s of spec.sources) {
    for (const text of s.texts) for (const ch of text) add(ch, `${s.file}:${s.line}`);
  }
  for (const d of spec.dynamic) {
    for (const ch of d.chars) add(ch, `${d.file}:${d.line}(动态)`);
  }
  const kept = [];
  const noGlyph = [];
  for (const [ch, where] of chars) {
    const g = fnt.glyphs.get(ch.codePointAt(0));
    if (g) kept.push({ ch, code: g.id, glyph: g, where });
    else noGlyph.push({ ch, where });
  }
  kept.sort((a, b) => a.code - b.code);
  noGlyph.sort((a, b) => a.ch.codePointAt(0) - b.ch.codePointAt(0));
  return { chars, kept, noGlyph };
}

/**
 * 读取生成声明，并核对每条 texts 确实还写在那一行、动态点仍是 String(lv.id)。
 * 文案或行号一改就抛——声明与代码脱钩是这条链唯一真正致命的失效模式。
 */
export function loadSpec(root) {
  const spec = JSON.parse(readFileSync(join(root, "scripts/font-subset/prephase-chars.json"), "utf8"));
  for (const s of spec.sources) {
    const line = readFileSync(join(root, s.file), "utf8").split("\n")[s.line - 1];
    if (line === undefined) throw new Error(`${s.file}:${s.line} 不存在`);
    const missing = s.texts.filter((t) => !line.includes(t));
    if (missing.length) {
      throw new Error(`${s.file}:${s.line} 这一行已不含 ${JSON.stringify(missing)}——文案或行号漂移，请同步 prephase-chars.json`);
    }
  }
  for (const d of spec.dynamic) {
    const line = readFileSync(join(root, d.file), "utf8").split("\n")[d.line - 1];
    if (line === undefined) throw new Error(`${d.file}:${d.line} 不存在`);
    if (!/String\(lv\.id\)/.test(line)) throw new Error(`${d.file}:${d.line} 不再是 String(lv.id)，动态字形声明需重审`);
  }
  return spec;
}

/** 全帧归属图：像素 → 声明它的字形 id（-1=不属于任何帧）；顺带断言帧互不重叠。 */
function frameOwnerMap(fnt, w, h) {
  const owner = new Int32Array(w * h).fill(-1);
  let overlaps = 0;
  for (const g of fnt.glyphs.values()) {
    if (g.width === 0 || g.height === 0) continue;
    if (g.x < 0 || g.y < 0 || g.x + g.width > w || g.y + g.height > h) {
      throw new Error(`字形 ${g.id} 帧矩形 (${g.x},${g.y},${g.width},${g.height}) 越出 ${w}x${h}`);
    }
    for (let row = 0; row < g.height; row++) {
      const base = (g.y + row) * w + g.x;
      for (let col = 0; col < g.width; col++) {
        if (owner[base + col] !== -1) overlaps++;
        owner[base + col] = g.id;
      }
    }
  }
  return { owner, overlaps };
}

/**
 * 合成子集位图：授权区从源图逐行抄字节，其余 RGBA 清零。
 * 返回 out、keepMask、以及分账用的 frameOwner/统计。
 */
export function composeSubset(srcImg, fnt, kept, ring) {
  const { w, h, data } = srcImg;
  const { owner, overlaps } = frameOwnerMap(fnt, w, h);
  const out = Buffer.alloc(data.length);
  const keepMask = new Uint8Array(w * h);
  const boxes = [];
  for (const k of kept) {
    const g = k.glyph;
    if (g.width === 0 || g.height === 0) {
      boxes.push({ ch: k.ch, code: k.code, box: null, where: k.where });
      continue;
    }
    // 帧矩形：整块授权
    for (let row = 0; row < g.height; row++) {
      keepMask.fill(1, (g.y + row) * w + g.x, (g.y + row) * w + g.x + g.width);
    }
    // 环带：原样保留（含恰好落在邻帧矩形内的那几像素）。
    // 理由是滤波而非美观：本项目没有任何 setFilter/pixelArt 配置，纹理保持 Phaser 默认 LINEAR 滤波，
    // WebGL 下字形边缘会采到帧矩形外 1 texel——采到的必须是今日同一批字节，画面才谈得上逐像素相同。
    const yTop = Math.max(0, g.y - ring);
    const yBot = Math.min(h - 1, g.y + g.height - 1 + ring);
    const xLeft = Math.max(0, g.x - ring);
    const xRight = Math.min(w - 1, g.x + g.width - 1 + ring);
    let ringPx = 0;
    for (let y = yTop; y <= yBot; y++) {
      for (let x = xLeft; x <= xRight; x++) {
        if (x >= g.x && x < g.x + g.width && y >= g.y && y < g.y + g.height) continue;
        const i = y * w + x;
        if (!keepMask[i]) ringPx++;
        keepMask[i] = 1;
      }
    }
    boxes.push({ ch: k.ch, code: k.code, box: { x: g.x, y: g.y, width: g.width, height: g.height }, ringPx, where: k.where });
  }
  for (let i = 0; i < w * h; i++) {
    if (!keepMask[i]) continue;
    const o = i * 4;
    out[o] = data[o];
    out[o + 1] = data[o + 1];
    out[o + 2] = data[o + 2];
    out[o + 3] = data[o + 3];
  }
  const keptPixels = keepMask.reduce((a, b) => a + b, 0);
  return { out, keepMask, boxes, owner, overlaps, keptPixels };
}

/** 逐像素核：保留帧矩形字节全等、非授权区 RGBA 全 0，并做墨迹分账（含"环带侵入邻帧"的残留量）。 */
export function auditSubset(srcImg, subset, fnt, kept) {
  const { w, h, data } = srcImg;
  const out = subset.out;
  const keptIds = new Set(kept.map((k) => k.code));
  let framePixels = 0;
  for (const k of kept) {
    const g = k.glyph;
    if (g.width === 0 || g.height === 0) continue;
    for (let row = 0; row < g.height; row++) {
      const off = ((g.y + row) * w + g.x) * 4;
      // 五参数全给：Buffer.compare 的 sourceEnd 缺省是"到本缓冲末尾"，少写一位就变成拿不等长区间比
      if (data.compare(out, off, off + g.width * 4, off, off + g.width * 4) !== 0) {
        throw new Error(`字形 ${k.ch}(U+${g.id.toString(16)}) 在 y=${g.y + row} 这一行字节不等于源`);
      }
    }
    framePixels += g.width * g.height;
  }
  let droppedFramePixels = 0;
  let ringInkInOtherFrames = 0;
  for (const g of fnt.glyphs.values()) {
    if (g.width === 0 || g.height === 0) continue;
    if (keptIds.has(g.id)) continue;
    droppedFramePixels += g.width * g.height;
    for (let row = 0; row < g.height; row++) {
      for (let col = 0; col < g.width; col++) {
        const i = (g.y + row) * w + g.x + col;
        if (out[i * 4 + 3] > 0) ringInkInOtherFrames++;
      }
    }
  }
  let outsideNonZero = 0;
  let inkTotal = 0;
  let inkFrame = 0;
  let inkRingOnly = 0;
  for (let i = 0; i < w * h; i++) {
    if (!subset.keepMask[i]) {
      const o = i * 4;
      if (out[o] | out[o + 1] | out[o + 2] | out[o + 3]) outsideNonZero++;
    }
    if (out[i * 4 + 3] > 0) {
      inkTotal++;
      if (subset.owner[i] !== -1 && keptIds.has(subset.owner[i])) inkFrame++;
      else inkRingOnly++;
    }
  }
  return {
    pixels: w * h,
    framePixels,
    droppedFramePixels,
    ringInkInOtherFrames,
    outsideNonZero,
    inkTotal,
    inkFrame,
    inkRingOnly,
    keptPixels: subset.keptPixels,
  };
}

/** 解一张 PNG 并核对它确实是该 fnt 声明的图集。 */
export function loadFontAtlas(pngPath, fnt) {
  const img = decodePng(readFileSync(pngPath), pngPath);
  if (img.w !== fnt.scaleW || img.h !== fnt.scaleH) {
    throw new Error(`${pngPath} 尺寸 ${img.w}x${img.h} 与 fnt scaleW/scaleH ${fnt.scaleW}x${fnt.scaleH} 不符`);
  }
  if (fnt.pages !== 1) throw new Error(`fnt 声明 ${fnt.pages} 页，本子集生成器只支持单页`);
  return img;
}

/** 全图墨迹（alpha>0）计数，用作"清零掉的是什么"的分母。 */
export function inkOf(img) {
  let n = 0;
  for (let i = 0; i < img.w * img.h; i++) if (img.data[i * 4 + 3] > 0) n++;
  return n;
}

const DEFAULT_TARGET_WIDTHS = [512, 640, 768, 900, 1024, 1152, 1280, 1440, 1600, 1792, 2048, 2191];

/**
 * 货架打包（高降序）：按给定目标宽度铺行，返回 {w,h,place}。
 * 末端保留一个 spacing：画布右/下各留一条隔离带，帧外采到的邻域才必然落在自己的区域里。
 */
export function packRow(items, spacing, targetWidth) {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w || a.key.localeCompare(b.key));
  /** @type {Map<string, {x:number,y:number}>} */
  const place = new Map();
  let x = spacing, y = spacing, shelfH = 0, widest = 0;
  for (const it of sorted) {
    const w = it.w + spacing, h = it.h + spacing;
    if (x + w > targetWidth) {
      widest = Math.max(widest, x);
      y += shelfH; x = spacing; shelfH = 0;
    }
    place.set(it.key, { x, y });
    x += w;
    shelfH = Math.max(shelfH, h);
  }
  widest = Math.max(widest, x);
  return { w: widest, h: y + shelfH, place };
}

/**
 * 在多档目标宽度里取面积最紧凑的一档。
 * `forbidden(w,h)` 返回 true 的候选丢弃（重排件用它拒绝"宽高同为 2 的幂"——见 reflow-prephase.mjs 的 mipmap 口径）。
 */
export function pack(items, spacing, opts = {}) {
  const widths = opts.widths ?? DEFAULT_TARGET_WIDTHS;
  const maxW = Math.max(...items.map((i) => i.w));
  let best = null;
  for (const tw of widths) {
    if (tw < maxW + spacing * 3) continue;
    const cand = packRow(items, spacing, tw);
    if (opts.forbidden?.(cand.w, cand.h)) continue;
    if (!best || cand.w * cand.h < best.w * best.h) best = cand;
  }
  if (!best) {
    for (let tw = maxW + spacing * 2; ; tw += 64) {
      const cand = packRow(items, spacing, tw);
      if (!opts.forbidden?.(cand.w, cand.h)) { best = cand; break; }
    }
  }
  best.totalItemArea = items.reduce((s, i) => s + i.w * i.h, 0);
  return best;
}
