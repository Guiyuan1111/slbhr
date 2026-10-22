// r16 件A 专项取证：进房音频只装目标关卡类型的 BGM 族，且"没装的那一族"确实不出声、不炸。
// 覆盖门禁套件读不到的这条新契约：
//   ①目标族两支（开局曲+终局曲）入缓存，开局曲真在播（选曲没被缺键静默跳过）；
//   ②另一族两支**未**入缓存（省字节只在"根本没请求"时成立，缓存里有=白改）；
//   ③与类型无关件恒在（13 支 sfx 全量 + 失败曲）；
//   ④阳性对照用请求面：本族曲确有 Resource Timing 请求、另一族两支零请求
//     （缓存探针与请求账同源，两端正反都测到，不会因恒 false 假绿）。
// 档位取 forest_01（general）与 forest_12（speed）各一遍；页面错误必须为空。
// r25 口径变更：失败曲与本族终局曲退出落定门（改走门后二段批 + create 后兜底，同 r21 循环曲）。
// 于是这两支在"进房那一刻"合法地可以缺席——原先那条 `st.has.bgm_over` 恒在断言会随机变红。
// 不能因此把契约松掉：缺键的失效模式是**静音且不报错**（GameScene.sfx 首行 exists 卫静默跳过），
// 所以这里的判据换成"**不许永远不来**"：进房即读登记三态（在缓存／在飞，两者本地读不出区别，
// 见 perf-load 的 bgmTerminalInWindow），再在 CAP 内轮询等两支落地并**量出窗口长度**，超时即 FAIL。
// 门内的字节照旧恒在（13 支 sfx 逐键读，不再抽样）。
// 同一批里的循环曲（LevelMusic 1285.4KB）也走这套口径：4g 实测两支终局曲到齐（进房后 4.6s）时它**还在飞**，
// 历轮那条"进房即在播"的硬断言在节流档会把设计行为读成回归——故进房即读只登记，
// 判据改为"CAP 内入缓存"＋"到位后真在播"（后者验 kickBgmLoop 的补起，缺键静音若永不补齐才是真故障）。
//
// 用法：node scripts/e2e/audiofamily.mjs [port] [net]
//   net = off|cable|4g|fast3g|slow3g（缺省 off，口径历轮不变）。加档位不是为了复核契约，而是为了
//   **量出代价窗口的长度**：两支终局时刻曲出门后，"死亡/通关那一刻曲子还没到"这段窗只在弱网现身，
//   off 档读到的 arriveMs≈60ms 会把窗口当成不存在（同 r23 charsplay 的档位口径）。
import { chromium } from "playwright";
import { enterAs, log, startServer, waitForStarted } from "./lib.mjs";

const PORT = Number(process.argv[2] || 3598);
const NET_PROFILES = {
  off: { latency: 0, down: -1, up: -1, desc: "不节流（历轮口径）" },
  cable: { latency: 30, down: 1_250_000, up: 312_500, desc: "有线 10Mbps↓/2.5Mbps↑ · 30ms" },
  "4g": { latency: 80, down: 500_000, up: 125_000, desc: "4G 4Mbps↓/1Mbps↑ · 80ms" },
  fast3g: { latency: 150, down: 200_000, up: 93_750, desc: "Lighthouse Fast 3G 1.6Mbps↓/0.75Mbps↑ · 150ms" },
  slow3g: { latency: 400, down: 62_500, up: 62_500, desc: "Lighthouse Slow 3G 0.5Mbps↓↑ · 400ms" },
};
const NET_NAME = process.argv[3] || "off";
if (!Object.hasOwn(NET_PROFILES, NET_NAME)) {
  throw new Error(`net 档位未知：${NET_NAME}（可用：${Object.keys(NET_PROFILES).join("/")}）`);
}
const NET = NET_PROFILES[NET_NAME];
const THROTTLED = NET_NAME !== "off";
/** 到位等待上限：create 里三条 kick 共用同一个 LoaderPlugin 队列（chars-play 442.4KB 排最前，
 *  其后循环曲 1285.4KB、失败曲 159.6KB、本族终局曲 163.7KB ≈ 2051KB），按档位带宽换算整批。
 *  倍数 8（＝名义批时 33.6s 的 8 倍）而不是历轮的 2 倍，是 slow3g 实测逼出来的：
 *  名义口径下 2051KB ≈ 32.8s，但 1285.4KB 的循环曲实测 **120.0s** 才进缓存（两支终局曲 78.4s 到位），
 *  即有效吞吐只有名义的 ~1/3.7——本用例同时挂着房主与加入者两个节流上下文，而且落定后这一页
 *  还要付 font.png 1600.6KB、CharAssetsPlay 442.7KB 等一大票字节，队列根本不是按音频单算的。
 *  旧口径 2×名义＝87.2s 把"慢但正确"读成超时（slow3g forest_01 一条 FAIL），系数按下限 2× 实测取。 */
const ARRIVE_CAP = 20000 + (THROTTLED ? 8 * Math.round((1000 * 2_100_000) / NET.down) : 0);
/** 档位等待倍率与 started 上限：口径与 charsplay.mjs 逐字同式（只放大等待，不放宽判据） */
const WAIT_SCALE = { off: 1, cable: 2, "4g": 2, fast3g: 3, slow3g: 8 }[NET_NAME];
const WAIT_START = THROTTLED ? 20000 + Math.round((1000 * 6_200_000) / NET.down) : 20000;
const server = await startServer(PORT, {});
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
let fail = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fail++;
  log(`${ok ? "✓" : "✗"} ${name}${detail ? " —— " + detail : ""}`);
};

/** 节流真的生效（阴性对照，口径同 perf-load/charsplay：系数 0.5 且只设下限） */
const throttleProof = (page) =>
  page.evaluate(`(() => {
    const es = performance.getEntriesByType("resource").filter((e) => e.responseEnd > 0);
    const ttfb = es.map((e) => e.responseStart - e.fetchStart).filter((v) => v > 0).sort((a, b) => a - b);
    const big = es.slice().sort((a, b) => b.transferSize - a.transferSize)[0] || null;
    return {
      netRequests: es.length,
      ttfbMedianMs: ttfb.length ? Math.round(ttfb[ttfb.length >> 1]) : null,
      bigUrl: big ? big.name.split("/").pop() : null,
      bigTransferB: big ? big.transferSize : 0,
      bigBodyMs: big ? Math.round(big.responseEnd - Math.max(big.responseStart, big.fetchStart)) : null,
    };
  })()`);

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

/** 到位观察器：一次页内轮询同时记录循环曲／失败曲／本族终局曲**各自**首次进缓存的页钟时刻。
 *  为什么不串三次 `waitForFunction`：慢档第一次超时之后，后面两次读到的"自锚点毫秒"会把上一次
 *  的空等整段算进窗口——本轮 slow3g 就这么读出过 119741ms 这种不可能的数（真实锚点是 started）。 */
const startRecord = (page, keys) =>
  page.evaluate(({ keys }) => {
    const g = window.__fw;
    const rec = { t0: performance.now(), seen: {}, timer: null };
    window.__afRec = rec;
    const tick = () => {
      const now = Math.round(performance.now() - rec.t0);
      for (const k of keys) if (rec.seen[k] === undefined && g.cache.audio.exists(k)) rec.seen[k] = now;
      if (keys.every((k) => rec.seen[k] !== undefined)) clearInterval(rec.timer);
    };
    rec.timer = setInterval(tick, 50);
    tick();
  }, { keys });

/** 读回三支的入缓存时刻（相对锚点＝started 的页钟）＋网络侧 responseEnd；未到的键为 null */
const readRecord = (page, keys, names) =>
  page.evaluate(({ keys, names }) => {
    const rec = window.__afRec;
    if (!rec) return { seen: {}, ended: {} };
    clearInterval(rec.timer);
    const ended = {};
    for (const e of performance.getEntriesByType("resource")) {
      const n = e.name.split("/").pop();
      if (names.includes(n) && e.responseEnd > 0) ended[n] = Math.round(e.responseEnd - rec.t0);
    }
    const seen = {};
    for (const k of keys) seen[k] = null;
    for (const [k, v] of Object.entries(rec.seen)) seen[k] = v;
    return { seen, ended };
  }, { keys, names });

/** 到位之后**真在播**（补起处理器 kickBgmLoop 的判据）：给两拍让 loader complete 走到补起 */
async function waitPlayingKey(page, key) {
  try {
    await page.waitForFunction(({ key: k }) => { const s = window.__fw.sound.get(k); return !!s && s.isPlaying; }, { key }, { timeout: 5000 * WAIT_SCALE, polling: 100 });
    return true;
  } catch {
    return false;
  }
}

/** 节流档挂在页面上、导航之前，故整趟装载都按档位付带宽与 RTT（施加路径同 perf-load/charsplay） */
const mkPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await ctx.newPage();
  if (THROTTLED) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: NET.latency,
      downloadThroughput: NET.down,
      uploadThroughput: NET.up,
    });
  }
  return { ctx, page };
};

try {
  for (const [level, fam] of [["forest_01", "general"], ["forest_12", "speed"]]) {
    const { ctx, page } = await mkPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    const on = fam === "speed" ? "bgm_level_speed" : "bgm_level";
    const fin = fam === "speed" ? "bgm_finish_speed" : "bgm_finish";
    const offOn = fam === "speed" ? "bgm_level" : "bgm_level_speed";
    const offFin = fam === "speed" ? "bgm_finish" : "bgm_finish_speed";
    const code = await enterAs(page, PORT, "create", "", level, WAIT_SCALE);
    const { ctx: ctxB, page: pageB } = await mkPage();
    await enterAs(pageB, PORT, "join", code, level, WAIT_SCALE); // 单人房停 ready，等不到 started
    await waitForStarted(page, WAIT_START);
    const keys3 = [on, "bgm_over", fin];
    const names3 = [fam === "speed" ? "LevelMusic_speed" : "LevelMusic", "LevelMusicOver", fam === "speed" ? "LevelMusicFinish_speed" : "LevelMusicFinish"];
    await startRecord(page, keys3); // 锚点＝started 这一刻的页钟；三支各记各的到位时刻
    await page.waitForTimeout(400); // BGM 起播在 create，给一拍让 WebAudio 实例就位
    const st = await probe(page);
    // 开局曲在进房这一刻：off 档沿用历轮口径（进房即在播）；节流档它是门后批里最大的一支
    // （LevelMusic 1285.4KB，r25 又往同一条批里加了 323.9KB），进房时仍在飞是设计行为（r21 立），
    // 所以那一带只登记，判据换成下面两条有界断言（入缓存 + 到位后真在播）。
    if (THROTTLED) {
      log(`  [${level}] 进房即读 开局曲 ${on}=${st.has[on]} playing=${st.playing.includes(on)}（档 ${NET_NAME}）`);
    } else {
      check(`${level} 开局曲在播（族=${fam}）`, st.playing.includes(on), `playing=${st.playing.join(",") || "无"} mute=${st.soundMute}`);
    }
    if (THROTTLED) {
      const p = await throttleProof(page);
      const fails = [];
      if (NET.latency > 0 && (p.ttfbMedianMs === null || p.ttfbMedianMs < 0.5 * NET.latency)) fails.push(`TTFB 中位数 ${p.ttfbMedianMs}ms < 0.5×rtt(${Math.round(0.5 * NET.latency)}ms)`);
      if (NET.down > 0 && p.bigBodyMs !== null && p.bigBodyMs < 0.5 * ((1000 * p.bigTransferB) / NET.down)) fails.push(`${p.bigUrl} 体耗时 ${p.bigBodyMs}ms < 0.5×名义`);
      check(`${level} 节流生效（档位 ${NET_NAME}：${NET.desc}）`, fails.length === 0, `ttfb中位=${p.ttfbMedianMs}ms 最大单笔=${p.bigUrl}/${p.bigTransferB}B 体=${p.bigBodyMs}ms${fails.length ? " ⇒ " + fails.join("；") : ""}`);
    }
    // 门内批的正面证据：与关卡类型无关的 13 支 sfx 逐键都在（r25 起它们是落定门里唯一的音频批，
    // 少一支就是"跳跃/推箱/水声进房第一秒没声"，而这条只能靠逐键读，抽样会把缺的那支抽过去）
    check(`${level} 门内 sfx 十三支进房即在缓存`, SFX_KEYS.every((k) => st.has[k]), `缺=${SFX_KEYS.filter((k) => !st.has[k]).join(",") || "无"}`);
    // r25 代价侧的**登记**（不是断言）：进房这两支要么已在缓存（驻留路径门后批跑完了），要么还没到
    // （快速进房：请求在飞时 XHR 条目整条缺席，缓存也空，两者读不出区别——见 perf-load 的三态口径）。
    log(`  [${level}] 进房即读 bgm_over=${st.has.bgm_over} ${fin}=${st.has[fin]} 请求面=${st.audioReqs.length} 条`);
    // 一次性等三支到齐，各自到位时刻由页内观察器记录（锚点＝started 的页钟）。
    // 窗口长度＝进房到两支终局曲齐：这段里死亡/通关发生 ⇒ 失败曲不补（时刻绑定）、终局曲由 catchUpFinish 补。
    // perf-load 量不到这个长度（请求在飞时 XHR 条目整条缺席），只能靠这里。
    const allIn = await page
      .waitForFunction(({ keys: ks }) => ks.every((k) => window.__afRec.seen[k] !== undefined), { keys: keys3 }, { timeout: ARRIVE_CAP, polling: 200 })
      .then(() => true)
      .catch(() => false);
    const rec = await readRecord(page, keys3, names3);
    const fmt = (k) => (rec.seen[k] === null ? "未到" : `${rec.seen[k]}ms`);
    const termMs = rec.seen.bgm_over !== null && rec.seen[fin] !== null ? Math.max(rec.seen.bgm_over, rec.seen[fin]) : null;
    check(
      `${level} 门后三支在 CAP 内全部入缓存（不许永远不来）`,
      allIn,
      `CAP=${ARRIVE_CAP}ms 循环=${fmt(on)} 失败=${fmt("bgm_over")} 终局=${fmt(fin)} 网络侧=${JSON.stringify(rec.ended)}`,
    );
    log(`  [${level}] 到位窗口（进房后）：循环曲 ${fmt(on)} · 失败曲 ${fmt("bgm_over")} · 终局曲 ${fmt(fin)} ⇒ 终局时刻曲到齐窗口 ${termMs === null ? `CAP(${ARRIVE_CAP}ms) 内未到` : `${termMs}ms`}（档 ${NET_NAME}）`);
    const played = await waitPlayingKey(page, on);
    const st2 = await probe(page);
    check(`${level} 循环曲到位后在播（补起生效，不是永远无声）`, played, `playing=${st2.playing.join(",") || "无"} mute=${st2.soundMute}`);
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
