#!/usr/bin/env node
/**
 * 结构化 Tiled 关卡 diff 脚本（B 组：forest_25_1↔forest_25, forest_27_1↔forest_27）
 *
 * 用法: node diff_levels.js <oldJson> <newJson> [--json <outJson>] [--md <outMd>]
 *
 * 规则（可复现）:
 * 1. 遍历全部 layer（按层名匹配；Ground 为 tilelayer 逐格比 data，其余 objectgroup 逐对象比）。
 * 2. gid 归一化：用各图自身 tilesets 的 firstgid 区间把 gid 解析为 (tileset, localId, tileType)，
 *    再对比归一化结果 —— 避免 firstgid 漂移（如 forest_27 LargeObjects=23 vs 27_1=24）造成假差异。
 * 3. 对象匹配（同层内）：
 *    Pass0: 两侧 id 均唯一且相等的对象直接配对（Tiled 复用 id 语义最明确）。
 *    Pass1: 归一化 key 相同者按距离贪心最近邻配对（距离上限 4096px）。
 *    Pass2: 剩余者按位置 <96px 跨 key 配对（记为“改”，gid/tileType 变化会列入字段差）。
 *    剩余未配对：增 / 删。
 * 4. 字段级深比：x/y/width/height/rotation/visible/name/type/point/polygon/polyline/
 *    properties(逐键)/propertytypes(逐键)。
 * 5. tilelayer 每个变更格计 1 条差异；展示时按同行同 old→new 连续格合并为 run（注明格数）。
 * 6. 地图级元数据（version/tiledversion/nextobjectid/tilesets/宽高）单独列出，不计入 gameplay 差异数。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const oldPath = args[0], newPath = args[1];
const jsonOut = (() => { const i = args.indexOf('--json'); return i >= 0 ? args[i + 1] : null; })();
const mdOut = (() => { const i = args.indexOf('--md'); return i >= 0 ? args[i + 1] : null; })();
if (!oldPath || !newPath) { console.error('usage: node diff_levels.js <old> <new> [--json out] [--md out]'); process.exit(2); }

const TILE_DIR = path.resolve(__dirname, '../../assets/tilemaps/tilesets');
const TILESET_FILES = ['Ground.json', 'Chars.json', 'LargeObjects.json', 'Objects.json'];

const oldMap = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
const newMap = JSON.parse(fs.readFileSync(newPath, 'utf8'));

// ---- gid 解析器：每张图按自己的 tilesets firstgid 建 (tileset, localId, type) ----
function buildResolver(map) {
  const ranges = map.tilesets
    .map(ts => {
      const defPath = ts.source ? path.resolve(TILE_DIR, path.basename(ts.source)) : null;
      let tiles = {}, tilecount = 0, props = {};
      if (defPath && fs.existsSync(defPath)) {
        const def = JSON.parse(fs.readFileSync(defPath, 'utf8'));
        tiles = def.tiles || {}; tilecount = def.tilecount || 0; props = def.tileproperties || {};
      }
      return { name: path.basename(ts.source || ts.name || '', '.json'), firstgid: ts.firstgid, tilecount, tiles, props };
    })
    .sort((a, b) => a.firstgid - b.firstgid);
  return function resolve(gid) {
    if (!gid || gid <= 0) return { tileset: null, localId: null, type: null, props: null };
    for (let i = ranges.length - 1; i >= 0; i--) {
      const r = ranges[i];
      if (gid >= r.firstgid && (r.tilecount === 0 || gid < r.firstgid + r.tilecount)) {
        const localId = gid - r.firstgid;
        const t = r.tiles[localId];
        return { tileset: r.name, localId, type: t ? t.type : null, props: r.props[localId] || null };
      }
    }
    return { tileset: 'UNKNOWN', localId: gid, type: null, props: null };
  };
}
const resOld = buildResolver(oldMap), resNew = buildResolver(newMap);
function label(res, gid) {
  if (gid === undefined || gid === null) return '(无gid)';
  if (gid === 0) return '(空)';
  const r = res(gid);
  if (r.tileset === null) return String(gid);
  let s = `${r.tileset}#${r.localId}${r.type !== null ? '(' + r.type + ')' : ''}`;
  if (r.props && r.props.char) s += `[char=${r.props.char}]`;
  return s;
}
function objTag(res, o) {
  let s = label(res, o.gid);
  if (o.type) s += `[type=${o.type}]`;
  if (o.polyline) s += ` polyline[${o.polyline.map(p => p.x + ',' + p.y).join(' ')}]`;
  else if (o.polygon) s += ` polygon[${o.polygon.map(p => p.x + ',' + p.y).join(' ')}]`;
  if (o.properties && Object.keys(o.properties).length) s += ' props=' + JSON.stringify(o.properties);
  if (o.rotation) s += ' rot=' + o.rotation;
  return s;
}

// ---- 地图级元数据 ----
const metaDiffs = [];
const metaKeys = ['width', 'height', 'tilewidth', 'tileheight', 'orientation', 'renderorder', 'infinite', 'version', 'tiledversion', 'nextobjectid', 'type'];
for (const k of metaKeys) {
  const ov = JSON.stringify(oldMap[k]), nv = JSON.stringify(newMap[k]);
  if (ov !== nv) metaDiffs.push({ field: k, old: ov, new: nv });
}
const oldTs = oldMap.tilesets.map(t => `${t.firstgid}:${path.basename(t.source || '')}`).join(', ');
const newTs = newMap.tilesets.map(t => `${t.firstgid}:${path.basename(t.source || '')}`).join(', ');
if (oldTs !== newTs) metaDiffs.push({ field: 'tilesets', old: oldTs, new: newTs });

// ---- 字段深比 ----
function normKey(res, obj) {
  if (obj.gid) { const r = res(obj.gid); return `${r.tileset}#${r.localId}`; }
  return 'nogid';
}
function pos(o) { return { x: o.x, y: o.y }; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function diffPrimitiveList(name, oldV, newV, out) {
  if (JSON.stringify(oldV) !== JSON.stringify(newV)) out.push({ field: name, old: oldV, new: newV });
}
function diffObjectFields(a, b, resA, resB) {
  const out = [];
  for (const k of ['x', 'y', 'width', 'height', 'rotation', 'visible', 'name', 'type']) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push({ field: k, old: a[k], new: b[k] });
  }
  if (a.gid !== undefined || b.gid !== undefined) {
    if (normKey(resA, a) !== normKey(resB, b)) {
      out.push({ field: 'gid(normalized)', old: `${a.gid}→${label(resA, a.gid)}`, new: `${b.gid}→${label(resB, b.gid)}` });
    }
  }
  diffPrimitiveList('point', a.point, b.point, out);
  diffPrimitiveList('polygon', a.polygon, b.polygon, out);
  diffPrimitiveList('polyline', a.polyline, b.polyline, out);
  const pa = a.properties || {}, pb = b.properties || {};
  for (const k of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
    if (JSON.stringify(pa[k]) !== JSON.stringify(pb[k])) {
      out.push({ field: `properties.${k}`, old: pa[k] === undefined ? '(无)' : JSON.stringify(pa[k]), new: pb[k] === undefined ? '(无)' : JSON.stringify(pb[k]) });
    }
  }
  const ta = a.propertytypes || {}, tb = b.propertytypes || {};
  for (const k of new Set([...Object.keys(ta), ...Object.keys(tb)])) {
    if (ta[k] !== tb[k]) out.push({ field: `propertytypes.${k}`, old: ta[k] === undefined ? '(无)' : ta[k], new: tb[k] === undefined ? '(无)' : tb[k] });
  }
  return out;
}

function matchObjects(oldArr, newArr, resA, resB) {
  const pairs = []; // {a, b, keySame}
  const usedA = new Set(), usedB = new Set();
  // Pass0: 精确同 id 且两侧 id 各自唯一 → 直接配对（Tiled 复用 id 时语义最明确）
  const idCountA = new Map(), idCountB = new Map();
  for (const o of oldArr) if (o.id !== undefined) idCountA.set(o.id, (idCountA.get(o.id) || 0) + 1);
  for (const o of newArr) if (o.id !== undefined) idCountB.set(o.id, (idCountB.get(o.id) || 0) + 1);
  const bById = new Map(newArr.map((o, j) => [o.id, j]));
  for (let i = 0; i < oldArr.length; i++) {
    const id = oldArr[i].id;
    if (id === undefined) continue;
    if ((idCountA.get(id) === 1) && (idCountB.get(id) === 1) && !usedB.has(bById.get(id))) {
      const j = bById.get(id);
      usedA.add(i); usedB.add(j);
      pairs.push({ a: oldArr[i], b: newArr[j], keySame: normKey(resA, oldArr[i]) === normKey(resB, newArr[j]) });
    }
  }
  const cand = [];
  for (let i = 0; i < oldArr.length; i++) for (let j = 0; j < newArr.length; j++) {
    const sameKey = normKey(resA, oldArr[i]) === normKey(resB, newArr[j]);
    const d = dist(oldArr[i], newArr[j]);
    if (sameKey && d <= 4096) cand.push({ i, j, d, sameKey: true });
  }
  cand.sort((p, q) => p.d - q.d || p.i - q.i || p.j - q.j);
  for (const c of cand) {
    if (!usedA.has(c.i) && !usedB.has(c.j)) { usedA.add(c.i); usedB.add(c.j); pairs.push({ a: oldArr[c.i], b: newArr[c.j], keySame: true }); }
  }
  const cand2 = [];
  for (let i = 0; i < oldArr.length; i++) for (let j = 0; j < newArr.length; j++) {
    if (usedA.has(i) || usedB.has(j)) continue;
    const d = dist(oldArr[i], newArr[j]);
    if (d < 96) cand2.push({ i, j, d, sameKey: false });
  }
  cand2.sort((p, q) => p.d - q.d || p.i - q.i || p.j - q.j);
  for (const c of cand2) {
    if (!usedA.has(c.i) && !usedB.has(c.j)) { usedA.add(c.i); usedB.add(c.j); pairs.push({ a: oldArr[c.i], b: newArr[c.j], keySame: false }); }
  }
  const added = newArr.filter((_, j) => !usedB.has(j));
  const deleted = oldArr.filter((_, i) => !usedA.has(i));
  return { pairs, added, deleted };
}

// ---- tilelayer: 逐格比 + 合并 run ----
function diffTileLayer(a, b) {
  const w = a.width, h = a.height;
  const changes = []; // {col,row,oldGid,newGid,oldLabel,newLabel}
  const n = Math.min(a.data.length, b.data.length);
  for (let i = 0; i < n; i++) {
    const ga = a.data[i], gb = b.data[i];
    if (ga === gb) continue;
    const ra = resOld(ga), rb = resNew(gb);
    if (ra.tileset === rb.tileset && ra.localId === rb.localId) continue; // firstgid 漂移归一化后相同
    changes.push({ idx: i, col: i % w, row: Math.floor(i / w), oldGid: ga, newGid: gb, oldLabel: label(resOld, ga), newLabel: label(resNew, gb) });
  }
  if (a.data.length !== b.data.length) changes.push({ field: 'data.length', old: a.data.length, new: b.data.length });
  // 合并同行连续、同 old→new 的 run
  changes.sort((p, q) => p.idx - q.idx);
  const runs = [];
  for (const c of changes) {
    if (typeof c.idx !== 'number') { runs.push(c); continue; }
    const last = runs[runs.length - 1];
    if (last && last.row === c.row && c.idx === last.endIdx + 1 && last.oldGid === c.oldGid && last.newGid === c.newGid) {
      last.endIdx = c.idx; last.col1 = c.col; last.count++;
    } else {
      runs.push({ startIdx: c.idx, endIdx: c.idx, col0: c.col, col1: c.col, row: c.row, oldGid: c.oldGid, newGid: c.newGid, oldLabel: c.oldLabel, newLabel: c.newLabel, count: 1 });
    }
  }
  return { changes, runs };
}

// ---- 逐层对比 ----
const layerReports = [];
let totalDiffs = 0; // tile 变更格数 + 增 + 删 + 改对象数
const oldLayers = new Map(oldMap.layers.map(l => [l.name, l]));
const newLayers = new Map(newMap.layers.map(l => [l.name, l]));
const layerNames = [...new Set([...oldMap.layers.map(l => l.name), ...newMap.layers.map(l => l.name)])];

for (const name of layerNames) {
  const la = oldLayers.get(name), lb = newLayers.get(name);
  const rep = { layer: name, kind: null, added: [], deleted: [], modified: [], cellRuns: [], cellChangeCount: 0, layerFieldDiffs: [], missing: null };
  if (!la || !lb) { rep.missing = la ? `仅在旧图存在(${la.type})` : `仅在新图存在(${lb.type})`; layerReports.push(rep); continue; }
  if (la.type !== lb.type) { rep.missing = `层类型变化 ${la.type}→${lb.type}`; layerReports.push(rep); continue; }
  rep.kind = la.type;
  for (const k of ['visible', 'opacity', 'width', 'height']) {
    if (JSON.stringify(la[k]) !== JSON.stringify(lb[k])) rep.layerFieldDiffs.push({ field: k, old: la[k], new: lb[k] });
  }
  if (la.type === 'tilelayer') {
    const { changes, runs } = diffTileLayer(la, lb);
    rep.cellRuns = runs; rep.cellChangeCount = changes.length;
    totalDiffs += changes.length;
  } else if (la.type === 'objectgroup') {
    const { pairs, added, deleted } = matchObjects(la.objects || [], lb.objects || [], resOld, resNew);
    for (const p of pairs) {
      const fields = diffObjectFields(p.a, p.b, resOld, resNew);
      if (fields.length) {
        const tagA = label(resOld, p.a.gid) + (p.a.type ? `[type=${p.a.type}]` : '');
        const tagB = label(resNew, p.b.gid) + (p.b.type ? `[type=${p.b.type}]` : '');
        rep.modified.push({ pos: pos(p.a), posNew: pos(p.b), id: p.a.id, idNew: p.b.id, tile: tagA, tileNew: tagB, keySame: p.keySame, fields });
        totalDiffs++;
      }
    }
    for (const o of added) { rep.added.push({ pos: pos(o), id: o.id, tile: label(resNew, o.gid), obj: o }); totalDiffs++; }
    for (const o of deleted) { rep.deleted.push({ pos: pos(o), id: o.id, tile: label(resOld, o.gid), obj: o }); totalDiffs++; }  }
  layerReports.push(rep);
}

const summary = {
  pair: `${path.basename(oldPath)} ↔ ${path.basename(newPath)}`,
  totalDiffs,
  breakdown: layerReports.map(r => ({
    layer: r.layer,
    cells: r.cellChangeCount,
    added: r.added.length,
    deleted: r.deleted.length,
    modified: r.modified.length,
  })),
  metaDiffs,
};
const report = { summary, layers: layerReports };

if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');

// ---- markdown 输出 ----
const px = (o) => `(${o.x},${o.y})`;
let md = '';
md += `### ${summary.pair}\n\n`;
md += `- **差异对象总数（增+删+改，Ground 按变更格计）: ${totalDiffs}**\n`;
md += `- 分层统计: ${summary.breakdown.map(b => `${b.layer}: 格差${b.cells}/增${b.added}/删${b.deleted}/改${b.modified}`).join('；')}\n`;
if (metaDiffs.length) {
  md += `- 地图级元数据差（不计入 gameplay 差异数）:\n`;
  for (const m of metaDiffs) md += `  - \`${m.field}\`: ${m.old} → ${m.new}\n`;
}
for (const r of layerReports) {
  md += `\n#### 层 ${r.layer}${r.kind ? ' (' + r.kind + ')' : ''}\n`;
  if (r.missing) { md += `- ⚠ ${r.missing}\n`; continue; }
  if (r.layerFieldDiffs.length) {
    md += `- 层级字段: ${r.layerFieldDiffs.map(f => `\`${f.field}\` ${JSON.stringify(f.old)}→${JSON.stringify(f.new)}`).join('; ')}\n`;
  }
  if (r.kind === 'tilelayer') {
    if (!r.cellRuns.length) md += `- data 逐格对比：零差异（${(oldLayers.get(r.layer).data || []).length} 格全部一致，含 firstgid 归一化）\n`;
    for (const run of r.cellRuns) {
      if (run.field) { md += `- data.${run.field}: ${run.old} → ${run.new}\n`; continue; }
      const cols = run.count === 1 ? `col=${run.col0}` : `col=${run.col0}..${run.col1}`;
      md += `- cell[${cols}, row=${run.row}] ×${run.count} 格: ${run.oldGid}(${run.oldLabel}) → ${run.newGid}(${run.newLabel})\n`;
    }
  } else {
    if (!r.added.length && !r.deleted.length && !r.modified.length) md += `- 对象逐个对比：零差异（${(newLayers.get(r.layer).objects || []).length} 个对象）\n`;
    for (const d of r.deleted) md += `- 删除 ${objTag(resOld, d.obj)} id=${d.id} @${px(d.pos)}\n`;
    for (const a of r.added) md += `- 新增 ${objTag(resNew, a.obj)} id=${a.id} @${px(a.pos)}\n`;
    for (const m of r.modified) {
      md += `- 修改 ${m.tile}${m.tileNew !== m.tile ? '→' + m.tileNew : ''} id(base)=${m.id} id(变体)=${m.idNew} @${px(m.pos)}${m.posNew && (m.posNew.x !== m.pos.x || m.posNew.y !== m.pos.y) ? '→@' + px(m.posNew) : ''}\n`;      for (const f of m.fields) md += `  - \`${f.field}\`: ${JSON.stringify(f.old)} → ${JSON.stringify(f.new)}\n`;
    }
  }
}
if (mdOut) fs.writeFileSync(mdOut, md, 'utf8');
console.log(md);
