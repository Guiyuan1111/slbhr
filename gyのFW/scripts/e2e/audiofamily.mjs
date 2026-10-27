#!/usr/bin/env node
/**
 * audiofamily：r16 移植装载面门禁（2026-10-27，自并行性能线同名件适配三庙）。
 *
 * 验证「BGM 按关卡类型选族」的**装载面**（不进房）：深链 ?level= 预判 + Menu 驻留暖装
 * 只拉本族 BGM；sfx 与失败曲恒取。三例：speed 深链（forest_12）/ dark 深链（light_30，
 * qoder 原版无此例——main 三庙才有 dark）/ 无深链缺省 general。
 *
 * 用法（需已构建 dist + 运行中的服务端）：
 *   node scripts/e2e/audiofamily.mjs [--base http://127.0.0.1:3700]
 * 判据：期望曲全部出现在 Resource Timing 的 /assets/audio/s/<name> 段，非本族曲与
 * 页面 pageerror 均为零；任一不满足退出码 1。
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE = baseIdx !== -1 ? args[baseIdx + 1] : (process.env.FW_PLAY_BASE ?? "http://127.0.0.1:3700");

/** 音频名精确匹配（无扩展名路由，取 /assets/audio/s/<name> 段整段相等，防 LevelMusic
 *  前缀误判；entry.name 是绝对 URL，用 includes 定位段） */
const SEG = "/assets/audio/s/";
const audioNames = (names) => names.filter((n) => n.includes(SEG)).map((n) => n.split(SEG)[1]);

const CASES = [
  {
    name: "speed 深链 forest_12 → 只装 speed 族",
    url: "/?level=forest_12",
    expect: ["LevelMusic_speed", "LevelMusicFinish_speed", "LevelMusicOver", "Wind", "Clock"],
    absent: ["LevelMusic", "LevelMusic_dark", "LevelMusicFinish"],
  },
  {
    name: "dark 深链 light_30 → 只装 dark 族（light 部新增，三庙适配例）",
    url: "/?level=light_30",
    expect: ["LevelMusic_dark", "LevelMusicFinish", "LevelMusicOver"],
    absent: ["LevelMusic", "LevelMusic_speed", "LevelMusicFinish_speed"],
  },
  {
    name: "无深链 → 缺省 general 族",
    url: "/",
    expect: ["LevelMusic", "LevelMusicFinish", "LevelMusicOver"],
    absent: ["LevelMusic_dark", "LevelMusic_speed", "LevelMusicFinish_speed"],
  },
];

const browser = await chromium.launch();
let failed = 0;
try {
  for (const c of CASES) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto(BASE + c.url, { waitUntil: "domcontentloaded" });
    const deadline = Date.now() + 20_000;
    let names = [];
    // 暖装 120ms 后入队，等期望曲全部落地（本地秒级；上限防挂死）
    while (Date.now() < deadline) {
      names = audioNames(await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name)));
      if (c.expect.every((n) => names.includes(n))) break;
      await page.waitForTimeout(300);
    }
    const missing = c.expect.filter((n) => !names.includes(n));
    const leaked = c.absent.filter((n) => names.includes(n));
    const ok = missing.length === 0 && leaked.length === 0 && pageErrors.length === 0;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}${ok ? "" : `  missing=[${missing}] leaked=[${leaked}] pageErrors=[${pageErrors}]`}`);
    if (!ok) failed++;
    await page.close();
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
