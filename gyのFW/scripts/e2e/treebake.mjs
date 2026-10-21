/**
 * 选关树烘焙位级一致证件（r14 起，门禁件）：三层 canvas 像素指纹 vs 金样。
 *
 * 为什么需要：templeTreeBake 是 oracle Bevel/ColorMatrix/Outline 滤镜链的**字节级复刻**
 * （note/research/2026-10-fidelity/37-temple-tree-branches.md），而 r14 要把分帧任务改成
 * "逐层流水线 + 分带收尾"——任务顺序与 ImageData 建法都动了，视觉门禁（游戏帧差分）
 * 又不覆盖选关页。故把三层像素直接钉成金样：任何改动使一位不同即失败。
 *
 * 口径：对 tree-big/tree-all/tree-done 三张 canvas 逐像素求 FNV-1a 混合和 + 尺寸 +
 * 非透明计数；同时阳性对照（把某层亮度整体 +1 必须使指纹变化）。
 * 另断言二次进入（结果缓存命中路径）指纹与首入逐位一致、且零重烘（烘样=0）。
 *
 * 用法：
 *   node scripts/e2e/treebake.mjs            # 校验（对 fixtures/tree-layers.json）
 *   node scripts/e2e/treebake.mjs --save     # 重取金样（仅在有意改变烘焙语义时）
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { log, startServer } from "./lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GOLDEN = join(ROOT, "scripts", "e2e", "fixtures", "tree-layers.json");
const SAVE = process.argv.includes("--save");
const PORT = Number(process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 3571);
const BASE = `http://127.0.0.1:${PORT}`;
const KEYS = ["tree-big", "tree-all", "tree-done"];

/** 页内指纹：整幅逐像素 FNV-1a（size/alphaCount 便于失败时定位） */
function digestPage(keys) {
  const out = {};
  for (const k of keys) {
    const img = globalThis.__fw.textures.get(k).source[0].image;
    const ctx = img.getContext("2d", { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    let h = 2166136261 >>> 0;
    let opaque = 0;
    for (let i = 0; i < d.length; i += 4) {
      h = Math.imul(h ^ d[i], 16777619) >>> 0;
      h = Math.imul(h ^ d[i + 1], 16777619) >>> 0;
      h = Math.imul(h ^ d[i + 2], 16777619) >>> 0;
      h = Math.imul(h ^ d[i + 3], 16777619) >>> 0;
      if (d[i + 3] > 127) opaque++;
    }
    out[k] = { w: img.width, h: img.height, fnv: h >>> 0, opaque };
  }
  return out;
}

const server = await startServer(PORT, {});
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
let fail = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fail++;
  log(`${ok ? "✓" : "✗"} ${name}${detail ? " —— " + detail : ""}`);
};
try {
  // 全新 context：localStorage 为空 → 进度全零 → stateOf 确定（金样以此为条件，勿在已存档浏览器上取）
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { throw new Error("页面错误: " + e); });
  await page.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__fw?.scene?.isActive("Menu"), null, { timeout: 30000, polling: 20 });
  // 首入：冷烘
  await page.evaluate(() => { globalThis.__fw.scene.getScene("Menu").scene.start("Temple"); });
  await page.waitForFunction(
    () => globalThis.__fw?.textures?.exists("tree-all") && (globalThis.__fwTreeStats?.().jobs ?? 0) === 0,
    null, { timeout: 40000, polling: 60 },
  );
  await page.waitForTimeout(400);
  const first = await page.evaluate(digestPage, KEYS);
  check("三层尺寸为正", KEYS.every((k) => first[k].w > 600 && first[k].h > 400), JSON.stringify(KEYS.map((k) => [first[k].w, first[k].h])));
  check("三层均有实心像素", KEYS.every((k) => first[k].opaque > 1000), JSON.stringify(KEYS.map((k) => first[k].opaque)));

  // 重进（结果缓存命中路径）：指纹必须逐位一致，且零重烘
  const jobsBefore = await page.evaluate(() => globalThis.__fwTreeStats?.().jobs ?? -1);
  await page.evaluate(() => { globalThis.__fw.scene.getScene("Temple").scene.restart(); });
  await page.waitForFunction(() => globalThis.__fw?.scene?.isActive("Temple"), null, { timeout: 30000, polling: 20 });
  await page.waitForTimeout(600);
  const again = await page.evaluate(digestPage, KEYS);
  const jobsAfter = await page.evaluate(() => globalThis.__fwTreeStats?.().jobs ?? -1);
  check("重进走缓存：无在飞任务", jobsBefore === 0 && jobsAfter === 0, `jobs ${jobsBefore}→${jobsAfter}`);
  check("重进指纹与首入逐位一致", JSON.stringify(first) === JSON.stringify(again));

  // 阳性对照：改一个不透明像素必须使指纹变化（否则上面的"一致"毫无意义）。
  // 注意只能改 alpha>127 的像素——全透明像素的 RGB 在 Chromium 读回时被归零，改它测不出差异。
  await page.evaluate((keys) => {
    const img = globalThis.__fw.textures.get(keys[1]).source[0].image;
    const ctx = img.getContext("2d", { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, img.width, img.height);
    let idx = -1;
    for (let i = 3; i < d.data.length; i += 4) {
      if (d.data[i] > 127) { idx = i - 3; break; }
    }
    if (idx < 0) throw new Error("无不透明像素可用于阳性对照");
    d.data[idx] = d.data[idx] ^ 0xff;
    ctx.putImageData(d, 0, 0);
  }, KEYS);
  const afterTamper = await page.evaluate(digestPage, KEYS);
  check("阳性对照：改一像素即变指纹", afterTamper["tree-all"].fnv !== first["tree-all"].fnv,
    `${first["tree-all"].fnv} → ${afterTamper["tree-all"].fnv}`);

  if (SAVE) {
    writeFileSync(GOLDEN, JSON.stringify({
      meta: {
        git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
        date: new Date().toISOString(),
        viewport: "1280x960",
        note: "选关树三层 canvas 的整幅 FNV-1a 指纹（金样）。重取：node scripts/e2e/treebake.mjs --save",
      },
      layers: first,
    }, null, 2));
    log(`金样已写入 fixtures/tree-layers.json：${JSON.stringify(first)}`);
  } else {
    if (!existsSync(GOLDEN)) {
      log("缺金样（先 --save）");
      process.exit(1);
    }
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
    for (const k of KEYS) {
      const g = golden.layers[k];
      const c = first[k];
      check(`金样一致 ${k}`, g.fnv === c.fnv && g.w === c.w && g.h === c.h, `金 ${g.fnv}/${g.w}x${g.h} 实 ${c.fnv}/${c.w}x${c.h}`);
    }
  }
  await ctx.close();
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
log(fail === 0 ? (SAVE ? "treebake: 金样已取（校验未执行）" : "treebake: ALL PASS") : `treebake: ${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
