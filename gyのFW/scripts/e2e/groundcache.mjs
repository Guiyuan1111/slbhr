// r13 专项取证：地面缓存命中 + 纹理免重传的像素正确性。
// 覆盖门禁套件未直读的这条新路径：同关重建时 bound===canvas → 整段跳过
// textures.remove/addCanvas，地面必须与上一局逐位一致（若 Phaser CanvasPool
// 把缓存里的 canvas 抽干成 1×1，这里会立刻显形）。
import { chromium } from "playwright";
import { enterAs, log, startServer, waitForStarted } from "./lib.mjs";

const PORT = Number(process.argv[2] || 3597);
const server = await startServer(PORT, {});
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
let fail = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fail++;
  log(`${ok ? "✓" : "✗"} ${name}${detail ? " —— " + detail : ""}`);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  const pageB = await ctxB.newPage();
  const code = await enterAs(page, PORT, "create", "", "forest_01");
  await enterAs(pageB, PORT, "join", code, "forest_01"); // 双人房：单方入房停在 ready，永远等不到 started
  await waitForStarted(page);
  // 包装 textures.remove 以直读"是否免重传"；同时取地面指纹（源 canvas 尺寸 + 64×36 缩样）
  await page.evaluate(() => {
    const g = window.__fw;
    window.__rm = 0;
    const tm = g.textures;
    if (!tm.__wrapped) {
      const o = tm.remove.bind(tm);
      tm.remove = (k) => { if (k === "groundTex") window.__rm++; return o(k); };
      tm.__wrapped = true;
    }
  });
  const probe = () => page.evaluate(() => {
    const sc = window.__fw.scene.getScene("Game");
    const img = sc && sc.children.list.find((o) => o.texture && o.texture.key === "groundTex");
    if (!img) return { ok: false };
    const src = img.texture.source[0].image;
    const small = document.createElement("canvas");
    small.width = 64; small.height = 36;
    const c = small.getContext("2d");
    c.drawImage(src, 0, 0, src.width, src.height, 0, 0, 64, 36);
    const d = c.getImageData(0, 0, 64, 36).data;
    let sum = 0, opaque = 0;
    const parts = [];
    for (let i = 0; i < d.length; i += 4) {
      sum = (sum * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13 + d[i + 3] * 3) >>> 0;
      if (i % 400 === 0) parts.push(d[i], d[i + 1], d[i + 2], d[i + 3]);
      if (d[i + 3] > 128) opaque++;
    }
    return { ok: true, w: src.width, h: src.height, hash: sum, opaque, sig: parts.join(","), rm: window.__rm };
  });
  const before = await probe();
  check("地面纹理就绪且尺寸合理", before.ok && before.w > 800 && before.h > 500, `w=${before.w} h=${before.h}`);
  check("地面像素非空（不透明样本占比高）", before.opaque > 64 * 36 * 0.2, `opaque=${before.opaque}/${64 * 36}`);
  const rm0 = before.rm;
  // 同关重建：R 语义的 __fwRestart（黑幕包络 → net.restart → Game 场景重建 → 缓存命中）
  await page.evaluate(() => window.__fwRestart());
  await page.waitForFunction(`(() => { try { const s = window.__fwInit.net.room.state; return s.phase === "started"; } catch { return false; } })()`, null, { timeout: 20000 });
  await page.waitForTimeout(1500); // 让重建后的首帧渲染完成
  const after = await probe();
  check("重开后地面仍在（未变 1×1/未逐出）", after.ok && after.w === before.w && after.h === before.h, `w=${after.w} h=${after.h}`);
  check("重开后地面像素逐位一致", after.hash === before.hash && after.sig === before.sig, `hash ${before.hash}→${after.hash}`);
  check("重开走缓存命中：groundTex 零重传", after.rm === rm0, `remove 次数 ${rm0}→${after.rm}`);
  // 量具自证：手动 remove 一次，计数器必须 +1（否则上面的零计数毫无意义）
  await page.evaluate(() => window.__fw.textures.remove("groundTex"));
  const ctrl = await page.evaluate(() => window.__rm);
  check("计数器活着（手动 remove +1）", ctrl === after.rm + 1, `rm ${after.rm}→${ctrl}`);
  await ctx.close();
  await ctxB.close();
} finally {
  await browser.close();
  server.kill();
}
log(fail === 0 ? "groundcache: ALL PASS" : `groundcache: ${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
