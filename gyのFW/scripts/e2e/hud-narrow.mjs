#!/usr/bin/env node
/**
 * hud-narrow：局内顶部信息栏（#hud-top）的窄屏布局门禁（2026-10-29）。
 *
 * ## 防的是什么
 *
 * #hud-top 是「居中定位 + 子项 white-space:nowrap + 无宽度上限」的组合。内容宽度
 * 一旦超过视口（手机竖屏下房间码 + 复制邀请链接 + 等待提示约 617px），它会向两侧
 * **等比溢出**：390px 竖屏实测 rect = left:-113 right:503——房间码的「房」字和
 * 整条等待提示都被裁掉，而页面**没有横向滚动条**（父层 fixed inset:0），所以
 * 肉眼只在手机上才看得到，桌面开发全程无感。
 *
 * 这类回退是静默的：改一行 padding、加一个 HUD 子项、或调大 room 码字号，都可能
 * 在 320~414px 档重新撑破。故用几何断言钉住，而不是靠人拿手机看。
 *
 * ## 判据（每档视口独立断言）
 *
 * ① #hud-top 的 rect 完全落在视口内（左右各留 ≥0.5px 容差）
 * ② 文档无横向溢出（scrollWidth ≤ innerWidth+2）
 * ③ 房间码文本可见（"房间码" 四字在 DOM 文本里，且 #hud-room 的 rect 在视口内）
 * ④ 邀请按钮（建房者才有）也必须在视口内——它是唯一需要点的 HUD 元素
 *
 * 视口档位覆盖极窄 320、主流手机竖屏 390/414、手机横屏 844、平板 810、桌面 1280。
 *
 * ## 用法
 *
 *   node scripts/e2e/hud-narrow.mjs                     # 默认 http://127.0.0.1:2567
 *   node scripts/e2e/hud-narrow.mjs --base http://110.42.36.114:2567
 *   node scripts/e2e/hud-narrow.mjs --no-browser        # 无 playwright 环境跳过（退出 0）
 *
 * 需要已构建 dist 且服务在跑（会真建房进 Game）。纯客户端行为，不改服务端状态。
 */
import { chromium, devices } from "playwright";

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = argOf("base", process.env.FW_BASE ?? "http://127.0.0.1:2567");
const PASSWORD = "hudchk";

/** 视口档位：极窄 / 主流手机竖屏 / 大屏手机 / 手机横屏 / 平板 / 桌面 */
const CASES = [
  { name: "320x568 极窄", opts: { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true } },
  { name: "390x664 iPhone12 竖", opts: { ...devices["iPhone 12"] } },
  { name: "414x896 大屏手机竖", opts: { viewport: { width: 414, height: 896 }, hasTouch: true, isMobile: true } },
  { name: "844x390 手机横", opts: { ...devices["iPhone 12"], viewport: { width: 844, height: 390 } } },
  { name: "810x1080 平板", opts: { ...devices["iPad (gen 7)"] } },
  { name: "1280x960 桌面", opts: { viewport: { width: 1280, height: 960 } } },
];

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
};

let chromiumMod = null;
try {
  ({ chromium: chromiumMod } = await import("playwright"));
} catch {
  console.log("SKIP  hud-narrow（本机无 playwright）");
  process.exit(0);
}

const browser = await chromiumMod.launch();
try {
  for (const c of CASES) {
    const ctx = await browser.newContext({ ...c.opts });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
    try {
      await page.goto(`${BASE}/?level=forest_01`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => !!globalThis.__fw && globalThis.__fw.scene.isActive("Menu"), null, { timeout: 60000 });
      await page.fill("#password", PASSWORD);
      await page.click("#btn-create");
      await page.waitForFunction(() => /房间码/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: 45000 });
      await page.waitForFunction(() => globalThis.__fw.scene.isActive("Game"), null, { timeout: 45000 });
      // HUD 进关展示 6s 后会自动淡出（away 类）；测量必须在展示期内，且 away 态
      // 用 visibility:hidden 不影响几何——但为读到真实布局，这里立刻量。
      const m = await page.evaluate(() => {
        const top = document.querySelector("#hud-top");
        const t = top.getBoundingClientRect();
        const room = document.querySelector("#hud-room");
        const rr = room?.getBoundingClientRect();
        const invite = document.querySelector("#btn-invite");
        const ir = invite?.getBoundingClientRect();
        return {
          vw: innerWidth,
          topLeft: t.left, topRight: t.right,
          roomText: room?.textContent ?? "",
          roomLeft: rr?.left ?? null, roomRight: rr?.right ?? null,
          invitePresent: !!invite,
          inviteLeft: ir?.left ?? null, inviteRight: ir?.right ?? null,
          docScrollW: document.documentElement.scrollWidth,
        };
      });

      const inView = (l, r, vw) => l >= -0.5 && r <= vw + 0.5;
      check(inView(m.topLeft, m.topRight, m.vw),
        `${c.name}：① HUD 不溢出视口`,
        `${m.topLeft.toFixed(0)}..${m.topRight.toFixed(0)} / ${m.vw}`);
      check(m.docScrollW <= m.vw + 2, `${c.name}：② 无横向滚动`, `scrollW=${m.docScrollW}`);
      check(/房间码/.test(m.roomText) && inView(m.roomLeft, m.roomRight, m.vw),
        `${c.name}：③ 房间码可见且在视口内`, `${m.roomLeft?.toFixed(0)}..${m.roomRight?.toFixed(0)}`);
      check(!m.invitePresent || inView(m.inviteLeft, m.inviteRight, m.vw),
        `${c.name}：④ 邀请按钮在视口内`, m.invitePresent ? `${m.inviteLeft?.toFixed(0)}..${m.inviteRight?.toFixed(0)}` : "（未渲染）");
      check(errs.length === 0, `${c.name}：⑤ 零 pageerror`, errs.length ? JSON.stringify(errs.slice(0, 2)) : "");
    } catch (err) {
      check(false, `${c.name}：流程`, String(err).slice(0, 160));
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

console.log(failures ? `\n=== hud-narrow FAILED（${failures} 项）===` : "\n=== hud-narrow ALL GREEN ===");
process.exit(failures ? 1 : 0);
