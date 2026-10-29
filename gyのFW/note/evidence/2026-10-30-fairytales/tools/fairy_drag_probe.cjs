// F 引擎无头实跑探针：boot→menu→tutorialPrompt(skip)→forest_01→fairies_000，仙女拖入 fairycup 实验
// 用法: node fairy_drag_probe.cjs <output_F_root> [port]
// 前置: (cd <output_F_root> && python3 -m http.server <port> --bind 127.0.0.1) 只读静态服
// 依赖: playwright（gyのFW/node_modules 已带 chromium）
const { chromium } = require('playwright');
const path = require('path');
const F = process.argv[2], PORT = process.argv[3] || '8790';
const shot = name => path.join(__dirname, 'shots', name);
require('fs').mkdirSync(path.join(__dirname, 'shots'), { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/index.htm`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  const boot = await page.evaluate(() => ({
    phaser: Phaser.VERSION,
    devices: Object.keys(Devices),
    state: Phaser.GAMES[0].state.current,
    states: Object.keys(Phaser.GAMES[0].state.states)
  }));
  console.log('BOOT:', JSON.stringify(boot));
  await page.screenshot({ path: shot('menu.png') });
  await page.mouse.click(630, 380); await page.waitForTimeout(2500);            // PLAY
  await page.mouse.click(440, 520); await page.waitForTimeout(2500);            // SKIP (tutorialPrompt→forest_01)
  await page.mouse.click(640, 334); await page.waitForTimeout(5000);            // 树图 fairies_000 节点 (x=.5,y=.4667)
  const pos = await page.evaluate(() => {
    const lv = Phaser.GAMES[0].level;
    const scr = s => ({ x: s.worldPosition.x, y: s.worldPosition.y });
    return {
      levelData: lv.levelData.filename,
      fairies: lv.fairies.map(f => ({ group: f.group, locked: !!f.locked, pos: scr(f.sprite) })),
      cups: lv.objects.filter(o => o.options.type === 'fairycup').map(c => ({
        group: c.options.properties.group, colorIdx: c.getColorIndex(), state: c.state,
        pos: scr(c.sprite), off: { x: c.mpx(c.cupOffset.x), y: c.mpx(c.cupOffset.y) }
      })),
      objectTypes: lv.objects.map(o => o.options.type),
      respawn: !!lv.respawnManager, totalDiamonds: lv.totalDiamonds
    };
  });
  console.log('LEVEL:', JSON.stringify(pos));
  const f = pos.fairies.find(x => x.group === 4) || pos.fairies[0];
  const cup = pos.cups.find(c => c.colorIdx === f.group) || pos.cups[0];
  const target = { x: cup.pos.x + cup.off.x, y: cup.pos.y + cup.off.y };
  await page.mouse.move(f.pos.x, f.pos.y);
  await page.mouse.down();
  for (let i = 1; i <= 25; i++) {
    await page.mouse.move(f.pos.x + (target.x - f.pos.x) * i / 25, f.pos.y + (target.y - f.pos.y) * i / 25);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(2000);
  await page.mouse.up();
  await page.waitForTimeout(2500);
  const res = await page.evaluate(() => {
    const lv = Phaser.GAMES[0].level;
    return {
      cups: lv.objects.filter(o => o.options.type === 'fairycup').map(c => ({ group: c.options.properties.group, state: c.state, occupied: c.currentFairies.length })),
      fairies: lv.fairies.map(x => ({ group: x.group, hasExternalTarget: !!x.externalTarget }))
    };
  });
  console.log('DRAG RESULT:', JSON.stringify(res, null, 1));
  console.log('PAGEERRORS:', JSON.stringify(errors));
  await page.screenshot({ path: shot('after_drag.png') });
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
