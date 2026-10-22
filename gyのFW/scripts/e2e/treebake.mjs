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
 * 另断言二次进入（结果缓存命中路径）指纹与首入逐位一致、零重烘（烘样=0）、
 * 且零重传（同一张 canvas 仍在原键上，r14 件D）。
 *
 * r35：Menu 图集从 1024² 重打包成 753×577（mask 帧矩形与 1px 邻域逐字节不变，`shrink-menu-main --check`
 * 与静态网双证）。但 Chromium 的 drawImage 缩小采样并不只取决于 src 矩形：同帧同邻域放到另一张
 * 图（尺寸/绝对坐标/远处内容任一不同）后，0.6/0.72 缩放的首段 mask 绘制会差 554 个像素
 * （baseScale 1.2；Δ≤85，全部落在 mask 矩形内，矩形外 0），再经 Bevel 阈值放大为三层 canvas 上
 * 1409 个像素（Δ≤128）。逐条对照实验（POT 补白、平移、改画布尺寸、远处加色块）确认这是
 * Chromium 图像缩放缓存的采样相位/派生素材与整图相关，不是 mask 内容变化；任何重打包都无法
 * 位级复现旧图。故 r35 按“有意换金样”重钉，理由进 fixture。
 *
 * 用法：
 *   node scripts/e2e/treebake.mjs            # 校验（对 fixtures/tree-layers.json）
 *   node scripts/e2e/treebake.mjs --save --reason "换样理由"   # 重钉金样（必须留理由）
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
const rIdx = process.argv.indexOf("--reason");
const REASON = rIdx >= 0 ? process.argv[rIdx + 1] : "";
if (SAVE && (!REASON || REASON.startsWith("--"))) {
  throw new Error("--save 必须带 --reason \"为什么这批指纹与上批不同\"（换金样协议）");
}
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

  // r14 件D（重进免重传）：命中缓存的重进必须跳过 remove+addCanvas——同一张烘焙
  // canvas 仍绑在原键上。canvas 上打标记 + 计数 remove，两条一起断：
  // 标记还在 ⇒ 绑的就是首入那张（不是新建的第二张），remove=0 ⇒ 没有全幅 texImage2D 重传。
  const skip = await page.evaluate(async (keys) => {
    for (const k of keys) globalThis.__fw.textures.get(k).source[0].image.__r14tag = 1;
    globalThis.__rm = 0;
    const tm = globalThis.__fw.textures;
    const orig = tm.remove.bind(tm);
    tm.remove = (key) => {
      const name = typeof key === "string" ? key : key?.key;
      if (keys.includes(name)) globalThis.__rm++;
      return orig(key);
    };
    globalThis.__fw.scene.getScene("Temple").scene.restart();
    await new Promise((res) => setTimeout(res, 800));
    return {
      tagged: keys.every((k) => globalThis.__fw.textures.get(k).source[0].image.__r14tag === 1),
      removes: globalThis.__rm,
    };
  }, KEYS);
  check("重进免重传：同 canvas 仍在原键且零 remove", skip.tagged && skip.removes === 0,
    `同对象 ${skip.tagged} 重传 remove=${skip.removes}`);

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
        reason: REASON,
        note: "选关树三层 canvas 的整幅 FNV-1a 指纹（金样）。重取：node scripts/e2e/treebake.mjs --save --reason \"...\"",
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
