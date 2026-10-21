// r16 件A 专项取证：进房音频只装目标关卡类型的 BGM 族，且"没装的那一族"确实不出声、不炸。
// 覆盖门禁套件读不到的这条新契约：
//   ①目标族两支（开局曲+终局曲）入缓存，开局曲真在播（选曲没被缺键静默跳过）；
//   ②另一族两支**未**入缓存（省字节只在"根本没请求"时成立，缓存里有=白改）；
//   ③与类型无关件恒在（13 支 sfx 抽样 + 失败曲 + menu 曲）；
//   ④阳性对照用请求面：本族曲确有 Resource Timing 请求、另一族两支零请求
//     （缓存探针与请求账同源，两端正反都测到，不会因恒 false 假绿）。
// 档位取 forest_01（general）与 forest_12（speed）各一遍；页面错误必须为空。
import { chromium } from "playwright";
import { enterAs, log, startServer, waitForStarted } from "./lib.mjs";

const PORT = Number(process.argv[2] || 3598);
const server = await startServer(PORT, {});
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
let fail = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fail++;
  log(`${ok ? "✓" : "✗"} ${name}${detail ? " —— " + detail : ""}`);
};

/** 页内只读探针：缓存持有 + 在播键（WebAudio 主音量非 0 且未静音时 isPlaying 才为真） */
const probe = (page) =>
  page.evaluate(() => {
    const g = window.__fw;
    const keys = ["bgm_level", "bgm_level_speed", "bgm_finish", "bgm_finish_speed", "bgm_over", "bgm_menu", "sfx_jump_fb", "sfx_wind"];
    const has = {};
    for (const k of keys) has[k] = g.cache.audio.exists(k);
    const playing = [];
    for (const k of keys) {
      const s = g.sound.get(k);
      if (s && s.isPlaying) playing.push(k);
    }
    const scene = g.scene.getScene("Game");
    return { has, playing, templeType: scene ? scene.templeType : null, soundMute: g.sound.mute };
  });

try {
  for (const [level, fam] of [["forest_01", "general"], ["forest_12", "speed"]]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    const on = fam === "speed" ? "bgm_level_speed" : "bgm_level";
    const offOn = fam === "speed" ? "bgm_level" : "bgm_level_speed";
    const offFin = fam === "speed" ? "bgm_finish" : "bgm_finish_speed";
    const code = await enterAs(page, PORT, "create", "", level);
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 960 } });
    const pageB = await ctxB.newPage();
    await enterAs(pageB, PORT, "join", code, level); // 单人房停 ready，等不到 started
    await waitForStarted(page);
    await page.waitForTimeout(400); // BGM 起播在 create，给一拍让 WebAudio 实例就位
    const st = await probe(page);
    check(`${level} 开局曲在播（族=${fam}）`, st.playing.includes(on), `playing=${st.playing.join(",") || "无"} mute=${st.soundMute}`);
    check(`${level} 本族两支均入缓存`, st.has[on] && st.has["bgm_" + (fam === "speed" ? "finish_speed" : "finish")]);
    check(`${level} 另一族两支未入缓存（省字节成立）`, !st.has[offOn] && !st.has[offFin], `${offOn}=${st.has[offOn]} ${offFin}=${st.has[offFin]}`);
    // r22 件1：菜单曲移出 Boot 阻塞批后不再"恒在"——本用例走的是快速建房路径，Menu 在
    // 菜单曲落定前就被切走，请求随场景 shutdown 作废，房内 bgm_menu 缺席是设计行为
    // （GameScene 对它只做 fadeOut/stopByKey，缺键幂等安全）。原先这条断言只是在替
    // "Boot 批里有它"背书，契约本身（族两支/另一族零请求）不受影响。
    check(`${level} 与类型无关件恒在`, st.has.bgm_over && st.has.sfx_jump_fb && st.has.sfx_wind);
    check(`${level} 页面零错误（缺键不炸更新循环）`, errs.length === 0, errs.join("; "));
    // 阳性对照走网络面：同一探针函数在"已知取过"的 URL 上判真、在"不该取"的 URL 上判假，
    // 两端都由 Resource Timing 的真实请求名驱动（注入 cache.audio 的写法在 3.90 无 set 入口）。
    const req = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/assets/audio/")).map((n) => n.split("/").pop()));
    const want = fam === "speed" ? "LevelMusic_speed" : "LevelMusic";
    const unwanted = fam === "speed" ? ["LevelMusic", "LevelMusicFinish"] : ["LevelMusic_speed", "LevelMusicFinish_speed"];
    check(`${level} 请求面阳性对照（${want} 有请求）`, req.includes(want));
    check(`${level} 请求面另一族零请求`, unwanted.every((f) => !req.includes(f)), `audio 请求=${req.length} 条`);
    await ctx.close();
    await ctxB.close();
  }
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
log(fail ? `audiofamily: ${fail} 项 FAIL` : "audiofamily: ALL PASS");
process.exit(fail ? 1 : 0);
