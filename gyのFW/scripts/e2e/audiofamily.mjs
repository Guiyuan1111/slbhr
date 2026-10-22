// r16 件A 专项取证：进房音频只装目标关卡类型的 BGM 族，且"没装的那一族"确实不出声、不炸。
// 覆盖门禁套件读不到的这条新契约：
//   ①目标族两支（开局曲+终局曲）入缓存，开局曲真在播（选曲没被缺键静默跳过）；
//   ②另一族两支**未**入缓存（省字节只在"根本没请求"时成立，缓存里有=白改）；
//   ③与类型无关件恒在（13 支 sfx 全量 + 失败曲）；
//   ④阳性对照用请求面：本族曲确有 Resource Timing 请求、另一族两支零请求
//     （缓存探针与请求账同源，两端正反都测到，不会因恒 false 假绿）。
// 档位取 forest_01（general）与 forest_12（speed）各一遍；页面错误必须为空。
//
// r25 口径变更：失败曲与本族终局曲退出落定门（改走门后二段批 + create 后兜底，同 r21 循环曲）。
// 于是这两支在"进房那一刻"合法地可以缺席——原先那条 `st.has.bgm_over` 恒在断言会随机变红。
// 不能因此把契约松掉：缺键的失效模式是**静音且不报错**（GameScene.sfx 首行 exists 卫静默跳过），
// 所以这里的判据换成"**不许永远不来**"：进房即读给 inGate 三态（在缓存／在飞／零请求），
// 再在 CAP 内轮询等两支落地，超时即 FAIL。门内的字节照旧恒在（13 支 sfx 逐键读，不再抽样）。
import { chromium } from "playwright";
import { enterAs, log, startServer, waitForStarted } from "./lib.mjs";

const PORT = Number(process.argv[2] || 3598);
const server = await startServer(PORT, {});
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
// 两支终局时刻曲在弱网下的到达上限面额 323.3KB；本地直连远快于此，CAP 只用来把"永远不来"钉成失败
const ARRIVE_CAP_MS = 20000;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fail++;
  log(`${ok ? "✓" : "✗"} ${name}${detail ? " —— " + detail : ""}`);
};

/** 页内只读探针：缓存持有 + 在播键（WebAudio 主音量非 0 且未静音时 isPlaying 才为真） */
const KEYS = [
  "bgm_level", "bgm_level_speed", "bgm_finish", "bgm_finish_speed", "bgm_over", "bgm_menu",
  "sfx_jump_fb", "sfx_jump_wg", "sfx_diamond", "sfx_death", "sfx_door", "sfx_lever", "sfx_pusher",
  "sfx_platform", "sfx_water_steps", "sfx_end_pass", "sfx_end_fail", "sfx_end_diamond", "sfx_wind",
];
const SFX_KEYS = KEYS.filter((k) => k.startsWith("sfx_"));

const probe = (page) =>
  page.evaluate(
    ({ keys }) => {
      const g = window.__fw;
      const has = {};
      for (const k of keys) has[k] = g.cache.audio.exists(k);
      const playing = [];
      for (const k of keys) {
        const s = g.sound.get(k);
        if (s && s.isPlaying) playing.push(k);
      }
      const scene = g.scene.getScene("Game");
      return {
        has,
        playing,
        templeType: scene ? scene.templeType : null,
        soundMute: g.sound.mute,
        audioReqs: performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/assets/audio/")).map((n) => n.split("/").pop()),
      };
    },
    { keys: KEYS },
  );

/** 两支终局时刻曲（失败曲 + 本族终局曲）在 CAP 内全部入缓存；返回耗时，超时返回 null */
async function waitTerminal(page, keys) {
  const t0 = Date.now();
  try {
    await page.waitForFunction(
      ({ keys: ks }) => ks.every((k) => window.__fw.cache.audio.exists(k)),
      { keys },
      { timeout: ARRIVE_CAP_MS, polling: 100 },
    );
  } catch {
    return null;
  }
  return Date.now() - t0;
}

try {
  for (const [level, fam] of [["forest_01", "general"], ["forest_12", "speed"]]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    const on = fam === "speed" ? "bgm_level_speed" : "bgm_level";
    const fin = fam === "speed" ? "bgm_finish_speed" : "bgm_finish";
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
    // 门内批的正面证据：与关卡类型无关的 13 支 sfx 逐键都在（r25 起它们是落定门里唯一的音频批，
    // 少一支就是"跳跃/推箱/水声进房第一秒没声"，而这条只能靠逐键读，抽样会把缺的那支抽过去）
    check(`${level} 门内 sfx 十三支进房即在缓存`, SFX_KEYS.every((k) => st.has[k]), `缺=${SFX_KEYS.filter((k) => !st.has[k]).join(",") || "无"}`);
    // r25 代价侧的**登记**（不是断言）：进房这两支要么已在缓存（驻留路径门后批跑完了），要么还没到
    // （快速进房：请求在飞时 XHR 条目整条缺席，缓存也空，两者读不出区别——见 perf-load 的三态口径）。
    log(`  [${level}] 进房即读 bgm_over=${st.has.bgm_over} ${fin}=${st.has[fin]} 请求面=${st.audioReqs.length} 条`);
    const arriveMs = await waitTerminal(page, ["bgm_over", fin]);
    check(`${level} 终局时刻曲在 CAP 内到达（不许永远不来）`, arriveMs !== null, `arriveMs=${arriveMs}`);
    const st2 = await probe(page);
    check(`${level} 本族两支到达后入缓存`, st2.has[on] && st2.has[fin], `${on}=${st2.has[on]} ${fin}=${st2.has[fin]}`);
    check(`${level} 另一族两支未入缓存（省字节成立）`, !st2.has[offOn] && !st2.has[offFin], `${offOn}=${st2.has[offOn]} ${offFin}=${st2.has[offFin]}`);
    // r22 件1：菜单曲移出 Boot 阻塞批后不再"恒在"——本用例走的是快速建房路径，Menu 在
    // 菜单曲落定前就被切走，请求随场景 shutdown 作废，房内 bgm_menu 缺席是设计行为
    // （GameScene 对它只做 fadeOut/stopByKey，缺键幂等安全）。
    check(`${level} 与类型无关件恒在（sfx 抽样 + 失败曲）`, st2.has.bgm_over && st2.has.sfx_jump_fb && st2.has.sfx_wind);
    check(`${level} 页面零错误（缺键不炸更新循环）`, errs.length === 0, errs.join("; "));
    // 阳性对照走网络面：同一探针在"已知取过"的 URL 上判真、在"不该取"的 URL 上判假，
    // 两端都由 Resource Timing 的真实请求名驱动（注入 cache.audio 的写法在 3.90 无 set 入口）。
    const req = st2.audioReqs;
    const want = fam === "speed" ? "LevelMusic_speed" : "LevelMusic";
    const unwanted = fam === "speed" ? ["LevelMusic", "LevelMusicFinish"] : ["LevelMusic_speed", "LevelMusicFinish_speed"];
    check(`${level} 请求面阳性对照（${want} 有请求）`, req.includes(want));
    check(`${level} 请求面终局时刻曲有请求（${fam === "speed" ? "LevelMusicFinish_speed" : "LevelMusicFinish"}/LevelMusicOver）`,
      req.includes(fam === "speed" ? "LevelMusicFinish_speed" : "LevelMusicFinish") && req.includes("LevelMusicOver"));
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
