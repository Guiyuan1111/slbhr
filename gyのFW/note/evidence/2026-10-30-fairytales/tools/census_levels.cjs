// F 部（fairytales）关卡全量普查
// 用法: node census_levels.cjs <oracle_output_F_root>
// 产出: 每关尺寸+tileset 排布、Objects/Chars 层 gid→type 直方图（按各关自身 tileset 归属）、
//       无 gid 对象直方图、Ground type 直方图、fairycup/fairy 逐关定位。
// 关键点: gid→type 必须用【每关自己的 tilesets[].firstgid】解析（F 各关排布不同，见 01号档 §3）。
const fs = require('fs'), path = require('path');
const F = process.argv[2];
if (!F) { console.error('usage: node census_levels.cjs <output_F_root>'); process.exit(2); }
const dirs = [path.join(F, 'data/fairytales/levels'), path.join(F, 'data/tutorials/levels')];
const files = [];
for (const d of dirs) for (const f of fs.readdirSync(d).filter(x => x.endsWith('.json')).sort()) files.push(path.join(d, f));

const typeHist = {}, groundHist = {}, propVariants = {}, nogid = {};
const levelRows = [], fairycupLoc = [], fairyLoc = [];
for (const file of files) {
  const name = path.basename(file, '.json');
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dir = path.dirname(file);
  const tsets = d.tilesets.map(t => {
    const json = JSON.parse(fs.readFileSync(path.resolve(dir, t.source), 'utf8'));
    return { firstgid: t.firstgid, name: json.name, json, maxgid: t.firstgid + json.tilecount - 1 };
  });
  levelRows.push([name, d.width + 'x' + d.height, tsets.map(t => `${t.name}@${t.firstgid}`).join(',')]);
  const resolve = gid => {
    const ts = tsets.find(t => gid >= t.firstgid && gid <= t.maxgid);
    if (!ts) return { set: 'OUT-OF-RANGE', type: 'gid' + gid };
    const id = gid - ts.firstgid;
    if (ts.name === 'Ground') {
      const tp = ts.json.tileproperties || {};
      return { set: 'Ground', type: (tp[String(id)] || {}).type };
    }
    const tile = (ts.json.tiles || []).find(x => x.id === id);
    return { set: ts.name, type: tile && tile.type, props: tile && tile.properties };
  };
  for (const v of d.layers.find(l => l.name === 'Ground').data) {
    if (!v) continue;
    const r = resolve(v);
    groundHist[r.type] = (groundHist[r.type] || 0) + 1;
  }
  for (const lname of ['Objects', 'Chars']) {
    for (const o of d.layers.find(l => l.name === lname).objects) {
      if (o.gid) {
        const r = resolve(o.gid);
        typeHist[lname + ':' + r.type] = (typeHist[lname + ':' + r.type] || 0) + 1;
        if (r.type === 'fairycup') fairycupLoc.push(name);
        const props = Object.fromEntries(((o.properties) || []).map(p => [p.name, p.value]));
        if (r.type === 'char' && (r.props || []).some(p => p.name === 'char' && p.value === 'fairy')) fairyLoc.push([name, JSON.stringify(props)]);
        propVariants[lname + ':' + r.type + '|' + JSON.stringify(o.properties || [])] = (propVariants[lname + ':' + r.type + '|' + JSON.stringify(o.properties || [])] || 0) + 1;
      } else {
        nogid[lname + ':' + o.type] = (nogid[lname + ':' + o.type] || 0) + 1;
        propVariants[lname + ':' + o.type + '|' + JSON.stringify(o.properties || [])] = (propVariants[lname + ':' + o.type + '|' + JSON.stringify(o.properties || [])] || 0) + 1;
      }
    }
  }
}
console.log('== 每关尺寸 + tileset 排布:');
for (const r of levelRows) console.log('  ', r[0], r[1], r[2]);
console.log('\n== type 直方图(layer:type):', JSON.stringify(typeHist));
console.log('\n== 无 gid 对象:', JSON.stringify(nogid));
console.log('\n== fairycup 逐关定位:', JSON.stringify(fairycupLoc));
console.log('\n== fairy 对象(关, props):');
for (const [n, p] of fairyLoc) console.log('  ', n, p);
console.log('\n== Ground type 直方图:', JSON.stringify(groundHist));
