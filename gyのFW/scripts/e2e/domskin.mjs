/**
 * DOM 皮肤逐像素对拍（r17 门禁件）。
 *
 * 为什么要有它：连接面板（石板大厅）是纯 DOM，它的 CSS 背景直接引用**整张游戏图集 PNG**
 * （CharAssets/MenuAssets/PopupAssets）用负 background-position 取帧。任何"把 CSS 改指别处"
 * 的动作，只要有一个像素坐标算错，用户看到的就是错位的石板/半截按钮——而 canvas 的
 * visual-diff 拍不到 DOM，journey 只看 textContent，全都测不出来。
 *
 * 口径：**只拍 DOM**。截屏前 `#game-root{display:none}` 摘掉画布（画布里角色待机动画的相位
 * 取决于帧计数，不是确定量），并 `animation/transition:none` 冻结 CSS 时间基（`.menu-logo`
 * 的 menu-floaty 4s 无限上下浮动实测让同版本两次截图差出 1%~3% 像素——首版据此判为不通过，
 * 冻结后 logo 回到 translateY(0)、按钮过渡回到终值，两侧同规则故可比）。
 * 再等**所有 CSS 背景图解码完成**：`background-image` 不参与 `img.complete`、也不被
 * `document.fonts.ready` 覆盖，首版没等它，把"715KB 的 CharAssets 尚未解码"读成"头像没画"，
 * 同版本两次截图差出整块头像——量具竞态，不是皮肤变了。
 * 于是画面 100% 由 HTML+CSS+图片决定 → 同版本两次截图像节逐字节相同。四个态覆盖全部 5 处图集引用：
 *   wide-idle   .panel 石板底 + 四角裁片 + .btn 静止帧(StoneButton0000) + .av 头像
 *   wide-hover  .btn:hover 的 StoneButton0001
 *   wide-error  #menu-error:not(:empty)::before 的 CrossIcon0000
 *   narrow-idle 窄屏回流皮（.panel width:min(560px,94vw) 的百分比缩放分支）
 *
 * 判据：基线 PNG 字节 SHA-256 相等为 PASS；不等时若有 ImageMagick 再跑 `compare -metric AE`
 * 把"像素差"与"编码差"分开报——像素差必须为 0 才算皮肤未变。
 *
 * 用法：
 *   node scripts/e2e/domskin.mjs --save          # 生成/刷新基线（写入 benchmark/results/domskin/）
 *   node scripts/e2e/domskin.mjs                 # 对拍现役实现与基线
 *   FW_DOMSKIN_PORT=3611 ...                     # 换端口
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { log, startServer } from "./lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "benchmark", "results", "domskin");
/** 差图只落在 TEMP（不入库），失败时打印路径供人工比对 */
const SCRATCH = join(ROOT, "TEMP", "domskin");
const SAVE = process.argv.includes("--save");
const PORT = Number(process.env.FW_DOMSKIN_PORT ?? 3611);
const LEVEL = process.env.FW_DOMSKIN_LEVEL ?? "forest_01";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 四态定义：state(id) → 页内动作 → 截图 */
const STATES = [
  { id: "wide-idle", width: 1280, height: 960 },
  { id: "wide-hover", width: 1280, height: 960, act: (p) => p.hover("#btn-create").then(() => sleep(500)) },
  { id: "wide-error", width: 1280, height: 960, act: (p) => p.evaluate(() => { document.getElementById("menu-error").textContent = "连接失败"; }).then(() => sleep(200)) },
  { id: "narrow-idle", width: 480, height: 800 },
];

async function shoot(page) {
  // 摘画布（角色待机相位不是确定量）+ 冻结 CSS 动画/过渡：
  // .menu-logo 有 menu-floaty 4s 无限上下浮动、#menu-error.busy::before 有 menu-spin，
  // 都是时间基——不冻结的话同版本两次截图就有 1%~3% 像素在动，对拍失去意义。
  // animation:none 让 logo 回到 translateY(0)、按钮过渡回到终值，两侧同规则故可比。
  await page.addStyleTag({
    content:
      "#game-root,#touch-controls{display:none!important}" +
      "*,*::before,*::after{animation:none!important;transition:none!important}",
  });
  await sleep(150);
  return await page.screenshot({ type: "png" });
}

/** 像素差 AE（ImageMagick 把度量写在 stderr，且非零差会返回码 1，故两侧都要接） */
function pixelAE(a, b) {
  try {
    return (execFileSync("magick", ["compare", "-metric", "AE", a, b, "null:"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).stdout + "").trim() || "0";
  } catch (e) {
    const line = String(e.stderr ?? e.message).trim().split("\n").pop();
    return line || "magick 不可用";
  }
}

const server = await startServer(PORT, {});
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--force-color-profile=srgb"] });
const results = [];
const errs = [];
try {
  for (const st of STATES) {
    const ctx = await browser.newContext({ viewport: { width: st.width, height: st.height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(`${st.id}:${String(e)}`));
    // 走真实入口（enterAs create 建一间房再回面板？不必）：直接开档到 Menu 即可，
    // 面板态由 DOM 决定，与是否建房无关；但 #menu-level 有内容时会多一颗徽标行，
    // 为对稳定基线统一用未建房态（面板初始 HTML）。
    await page.goto(`http://127.0.0.1:${PORT}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => globalThis.__fw?.scene?.isActive("Menu"), null, { timeout: 30000, polling: 20 });
    await page.waitForSelector("#menu .panel", { state: "visible" });
    // 字体/图片落地再拍，否则首帧可能拍到未解码的背景
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      const img = document.querySelector(".menu-logo");
      return !img || (img.complete && img.naturalWidth > 0);
    }, null, { timeout: 10000 }).catch(() => {});
    // CSS 背景图不参与 `img.complete`，也不被 fonts.ready 覆盖：面板/按钮/头像/十字全是
    // background-image。首版没等它们，实测把"715KB 的 CharAssets 尚未解码"读成"头像没画"，
    // 于是同版本两次截图差出 1.9% 像素（头像整块）——量具竞态，不是皮肤变了。
    await page.evaluate(async () => {
      const urls = new Set();
      const grab = (el, pseudo) => {
        const v = getComputedStyle(el, pseudo).backgroundImage;
        for (const m of String(v).matchAll(/url\("([^"]+)"\)|url\(([^)]+)\)/g)) urls.add(m[1] ?? m[2]);
      };
      for (const el of document.querySelectorAll("#menu *")) {
        grab(el, null);
        grab(el, "::before");
        grab(el, "::after");
      }
      await Promise.all(
        [...urls]
          .filter((u) => !u.startsWith("data:"))
          .map(async (u) => {
            const im = new Image();
            im.src = u;
            try {
              await im.decode();
            } catch { /* 解码失败交由像素对拍暴露 */ }
          }),
      );
    });
    if (st.act) await st.act(page);
    const png = await shoot(page);
    const sha = createHash("sha256").update(png).digest("hex");
    const file = join(OUT, `${st.id}.png`);
    results.push({ id: st.id, sha, bytes: png.length, file });
    if (SAVE) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(file, png);
      log(`${st.id.padEnd(12)} ${png.length}B ${sha.slice(0, 16)}（基线已写）`);
    } else {
      if (!existsSync(file)) throw new Error(`基线缺失：${file}（先跑 --save）`);
      const base = readFileSync(file);
      const bsha = createHash("sha256").update(base).digest("hex");
      if (bsha === sha) {
        log(`${st.id.padEnd(12)} PASS 像素与基线逐字节一致（${png.length}B）`);
      } else {
        let ae;
        mkdirSync(SCRATCH, { recursive: true });
        const tmp = join(SCRATCH, `${st.id}.png`);
        writeFileSync(tmp, png);
        ae = pixelAE(file, tmp);
        results[results.length - 1].fail = true;
        log(`${st.id.padEnd(12)} FAIL 基线 ${bsha.slice(0, 16)} → 现役 ${sha.slice(0, 16)}，像素 AE=${ae}（差图 ${tmp.replace(ROOT + "/", "")}）`);
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

if (errs.length) {
  log("页面错误（失败）：", errs.join("; "));
  process.exit(1);
}
if (SAVE) {
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ note: "DOM 皮肤逐像素基线（r17）；截屏前隐藏 #game-root 画布，四态见脚本头注释", states: results.map((r) => ({ id: r.id, sha256: r.sha, bytes: r.bytes })) }, null, 2));
  log(`domskin: 基线 ${results.length} 态已生成 → results/domskin/`);
  process.exit(0);
}
const failed = results.filter((r) => r.fail).length;
log(failed ? `domskin: ${results.length - failed}/${results.length} PASS（${failed} 态皮肤变了）` : "domskin: ALL PASS");
process.exit(failed ? 1 : 0);
