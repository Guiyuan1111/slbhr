// F 部 Chars 层逐关清点：fairy/fb/wg/door/diamond 计数 + 仙女对象 props（group/lockToDeviceGroup/reLockToDeviceGroup）
// 用法: node fairy_count.cjs <oracle_output_F_root>
const fs = require('fs'), path = require('path');
const F = process.argv[2];
const dirs = [path.join(F,'data/fairytales/levels'), path.join(F,'data/tutorials/levels')];
for (const d of dirs) for (const f of fs.readdirSync(d).filter(x=>x.endsWith('.json')).sort()) {
  const file = path.join(d,f);
  const j = JSON.parse(fs.readFileSync(file,'utf8'));
  const dir = path.dirname(file);
  const tsets = j.tilesets.map(t=>({firstgid:t.firstgid, json:JSON.parse(fs.readFileSync(path.resolve(dir,t.source),'utf8'))}));
  const chars = j.layers.find(l=>l.name==='Chars');
  let nFairy=0, nFb=0, nWg=0, nDoor=0, nDia=0, fairyProps=[];
  for (const o of chars.objects) {
    if (!o.gid) continue;
    const ts = tsets.find(t=>o.gid>=t.firstgid && o.gid<t.firstgid+t.json.tilecount);
    if (!ts) continue;
    const tile = (ts.json.tiles||[]).find(x=>x.id===o.gid-ts.firstgid);
    if (!tile) continue;
    const p = Object.fromEntries(((o.properties)||[]).map(x=>[x.name,x.value]));
    const tp = Object.fromEntries(((tile.properties)||[]).map(x=>[x.name,x.value]));
    const charV = p.char || tp.char;
    if (tile.type==='char') {
      if (charV==='fairy') { nFairy++; fairyProps.push(p); }
      else if (charV==='fb') nFb++;
      else if (charV==='wg') nWg++;
    } else if (tile.type==='door') nDoor++;
    else if (tile.type==='diamond') nDia++;
  }
  console.log(path.basename(f,'.json'), 'fairy='+nFairy, 'fb='+nFb, 'wg='+nWg, 'door='+nDoor, 'diamond='+nDia, fairyProps.length? 'fairyProps='+JSON.stringify(fairyProps):'');
}
