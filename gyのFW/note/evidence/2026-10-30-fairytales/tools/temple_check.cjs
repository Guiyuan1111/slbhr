// F 部 temple.json 结构核查 + 磁盘一致性
// 用法: node temple_check.cjs <oracle_output_F_root>
const fs = require('fs'), path = require('path');
const F = process.argv[2];
if (!F) { console.error('usage: node temple_check.cjs <output_F_root>'); process.exit(2); }
const t = JSON.parse(fs.readFileSync(path.join(F, 'data/fairytales/temple.json'), 'utf8'));
console.log('top keys:', Object.keys(t).join(','));
console.log('index=%s id=%s label=%s color=%s type=%s minRequired=%s softLocked=%s locked=%s hasNew=%s levels=%d edges=%d',
  t.index, t.id, t.label, t.color, t.type, t.minRequired, t.softLocked, t.locked, t.hasNew, t.levels.length, t.edges.length);
const keys = {};
for (const l of t.levels) for (const k of Object.keys(l)) keys[k] = (keys[k] || 0) + 1;
console.log('per-level key union:', JSON.stringify(keys));
for (const k of ['type', 'wing', 'required', 'state', 'rating', 'unlock_key', 'requirePerfects', 'initial', 'opened', 'locked']) {
  const vals = {};
  for (const l of t.levels) { const v = String(l[k]); vals[v] = (vals[v] || 0) + 1; }
  console.log('  ' + k + ':', JSON.stringify(vals));
}
const seen = new Set(), miss = [];
for (const l of t.levels) {
  if (!fs.existsSync(path.join(F, 'data', l.filename))) miss.push(l.filename);
  seen.add(l.filename.replace(/^(tutorials|fairytales)\/levels\//, '').replace(/\.json$/, ''));
}
console.log('temple 引用缺失于磁盘:', JSON.stringify(miss));
for (const dd of ['/data/fairytales/levels', '/data/tutorials/levels'])
  for (const f of fs.readdirSync(path.join(F, dd)))
    if (!seen.has(f.replace('.json', ''))) console.log('磁盘有但 temple 未引用:', dd + '/' + f);
console.log('levels 逐条(_id/id/filename/type/wing/time):');
for (const l of t.levels) console.log('  _id=%s id=%s %s type=%s wing=%s time=%s/%s', l._id, l.id, l.filename.split('/').pop(), l.type, l.wing, l.time, l.mobileTime);
