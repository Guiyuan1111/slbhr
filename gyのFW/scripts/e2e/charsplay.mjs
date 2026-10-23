// r23 件1 专项取证：角色播放序列那张（CharAssetsPlay 442.4KB）离开落定门之后，
// **帧名解析必须等它落地**，而等待窗口里画面不许落到 `__BASE`。
//
// 静态网（char-atlas-split.test.ts）读不到的正是"时间"这一维：`anims.create → Animation.getFrames
// → textureManager.getFrame`（Animation.js:454）在注册那一刻就把 163 个帧名解析成具体 Frame，
// 早一步拿到 `firstFrame`/`__BASE`（Texture.js:248-253 只 console.warn），而 `buildSeq` 的 exists
// 幂等卫还禁止之后重建 ⇒ 错帧一路带着播、满屏花屏，冷启动与像素门禁之外的路径全静默。
// 本用例把 CharAssetsPlay.png 的**响应**扣住（`release()` 才放行，探针自己控时）来摊开这段窗口，逐条钉：
//   ① 停答生效（阴性对照）：窗口里 chars-play 未进纹理缓存、十一式一律未注册——
//      若这条为假，说明整张图仍在阻塞批里，后面所有断言都只是在替旧行为背书。
//   ② 窗口里该在的都还在：Entry 张七帧齐、钻石/烟雾/楼梯首帧照常解析、在场 chars 对象的
//      帧名与裁片尺寸逐一等于产物 json（配错=整张图集当一帧，这条直接把它抓出来）。
//   ③ 窗口里跑动是"良性降级"：按住方向键会让 AnimationState 找不到键而打 `Missing animation`
//      并原样留着当前帧 —— 观察到它才证明窗口真被走过，而 TEX_WARN 那四类必须零条。
//   ④ 放行后按帧补齐：十一式全部注册、163 帧全部来自 chars-play 且几何等于产物 json。
//   ⑤ 真路径（不停答）也收敛：房间可玩后十一式齐、零缺帧警告、零花屏，并**量出**"可玩 → Play 张落定"
//      这段窗口的真实长度（这条长度 perf-load 量不到，原因见用例二注）。
//   ⑥ r42 离房交还后重进重建：十一式全局键与 chars-play 纹理必须成对交还/重取，重进后逐帧解析到新纹理。
//
// 用法：node scripts/e2e/charsplay.mjs [port] [level] [停答保险丝ms] [net]
//   net = off|cable|4g|fast3g|slow3g（缺省 off）。窗口这段东西的**现场在弱网**：off 档实测 Play 张
//   比"可玩"还早约 4s 到位（本地 5ms 就取完），窗口长度是负数——只跑 off 会把"没有窗口"当成设计成立。
//   档位表与 perf-load 的 --net 逐值相同（同一套 CDP `Network.emulateNetworkConditions` 条件），
//   并自带"节流真的生效"的阴性对照，静默失效的节流档比没有档更坏（读数会被写成弱网实测）。
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { PASSWORD, enterAs, log, runInputs, startServer, waitForStarted } from "./lib.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PORT = Number(process.argv[2] || 3611);
const LEVEL = process.argv[3] || "forest_01";
/** 停答上限：窗口实际由 `release()` 提前结束，这个数只是"探针抛错也不吊死"的保险丝 */
const STALL = Number(process.argv[4] || 60000);
const NET_PROFILES = {
  off: { latency: 0, down: -1, up: -1, desc: "不节流（历轮口径）" },
  cable: { latency: 30, down: 1_250_000, up: 312_500, desc: "有线 10Mbps↓/2.5Mbps↑ · 30ms" },
  "4g": { latency: 80, down: 500_000, up: 125_000, desc: "4G 4Mbps↓/1Mbps↑ · 80ms" },
  fast3g: { latency: 150, down: 200_000, up: 93_750, desc: "Lighthouse Fast 3G 1.6Mbps↓/0.75Mbps↑ · 150ms" },
  slow3g: { latency: 400, down: 62_500, up: 62_500, desc: "Lighthouse Slow 3G 0.5Mbps↓↑ · 400ms" },
};
const NET_NAME = process.argv[5] || "off";
if (!Object.hasOwn(NET_PROFILES, NET_NAME)) {
  throw new Error(`net 档位未知：${NET_NAME}（可用：${Object.keys(NET_PROFILES).join("/")}）`);
}
const NET = NET_PROFILES[NET_NAME];
const THROTTLED = NET_NAME !== "off";
/** 播放图集到位的等待上限：名义体耗时 + 12s 余量（节流档不能拿 off 档的 25s 判到位，否则会把
 *  "慢但正确"读成超时）；442.4KB 在 slow3g 是 7.1s，在 fast3g 是 2.3s */
const ARRIVAL_CAP = 12000 + (THROTTLED ? 3 * Math.round((1000 * 453_000) / NET.down) : 0);
/** 档位等待倍率：lib.mjs 的 enterAs 缺省按 off/4g 口径（#menu 隐藏 15s / 房间码 20s），
 *  而 r23 §五 实测 Menu active 是 off 0.66s / 4g 4.3s / fast3g 9.9s / slow3g 30.4s，
 *  slow3g 不带倍率会把"慢"读成"卡死"。只放大等待，不放宽任何判据。 */
const WAIT_SCALE = { off: 1, cable: 2, "4g": 2, fast3g: 3, slow3g: 8 }[NET_NAME];
/** started 落定上限：到落定的过网总量实测约 5.2~6.2MB（r23 §八），按档位带宽换算再留 20s */
const WAIT_START = THROTTLED ? 20000 + Math.round((1000 * 6_200_000) / NET.down) : 20000;

/** 产物 json 的帧几何（Node 侧独立回算，页面只认这一份） */
const geomOf = (f) => {
  const a = JSON.parse(readFileSync(path.join(ROOT, "assets/atlasses", f), "utf8"));
  return Object.fromEntries(a.frames.map((x) => [x.filename, [x.frame.w, x.frame.h]]));
};
const GEOM = { chars: geomOf("CharAssetsMenu.json"), "chars-entry": geomOf("CharAssetsEntry.json"), "chars-play": geomOf("CharAssetsPlay.json") };
const ENTRY_FRAMES = Object.keys(GEOM["chars-entry"]);
const PLAY_KEYS = ["fire_legs_run", "water_legs_run", "fire_jump", "water_jump", "fire_fall", "water_fall", "fire_rising", "water_rising", "fire_stairs", "water_stairs", "smoke"];
const PLAY_FRAME_COUNT = ["fire", "water"].reduce((s, r) => s + [7, 10, 4, 4, 29].reduce((x, e) => x + e + 1, 0), 0) + 45; // 2×59+45=163
const ARG = JSON.stringify({ geom: GEOM, keys: PLAY_KEYS, entry: ENTRY_FRAMES });

const server = await startServer(PORT, {});
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
let fail = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fail++;
  log(`${ok ? "✓" : "✗"} ${name}${detail ? " —— " + detail : ""}`);
};

/** 纹理缺帧取证，口径与 regression.mjs 完全一致（本轮新增的 "Missing animation" 刻意不在此列：
 *  它是 ensureCharAnims 窗口里的**设计行为**，形状是"以 idle 的样子跑跳"，不是花屏） */
const TEX_WARN = /has no frame|Texture key not found|No texture found matching key|Invalid BitmapText/i;
const MISSING_ANIM = /Missing animation/i;

/** 页内快照（字符串式传参，同 lib.mjs 的 stateGate 口径）：在场 chars* 对象的帧归属 + 纹理/动画持有 */
const SNAPSHOT = `(() => {
  const { geom, keys, entry } = ${ARG};
  const g = window.__fw;
  const scene = g.scene.getScene("Game");
  const painted = [];
  const walk = (list) => {
    for (const o of list || []) {
      if (o.type === "Container") { walk(o.list); continue; }
      const key = o.texture && o.texture.key;
      if (!key || key.indexOf("chars") !== 0) continue;
      // 比对用 frame.width/height（= 产物 json 的 frame.w/h，官方帧未 trim 两者恒等）；
      // 3.90 的 Frame 没有 cut 对象，用错了会把每个在场对象都误报成"对不上"
      painted.push({ key, name: o.frame && o.frame.name, w: o.frame ? o.frame.width : -1, h: o.frame ? o.frame.height : -1, visible: o.visible !== false });
    }
  };
  walk(scene.children.list);
  const bad = painted.filter((p) => { const e = geom[p.key] && geom[p.key][p.name]; return !e || e[0] !== p.w || e[1] !== p.h; });
  const missingEntry = g.textures.exists("chars-entry") ? entry.filter((n) => !g.textures.get("chars-entry").has(n)) : ["chars-entry 未入缓存"];
  const anims = keys.map((k) => g.anims.get(k)).filter(Boolean).map((a) => ({
    k: a.key, n: a.frames.length,
    tex: Array.from(new Set(a.frames.map((f) => f.textureKey))),
    // AnimationFrame：textureFrame=注册时给的帧名，frame=解析到的 Frame 对象；
    // 两者不同名（典型为 frame.name === "__BASE"）就是"整张图集被当一帧绑进动画"的确证
    bad: a.frames.filter((f) => !geom["chars-play"][f.textureFrame]).map((f) => String(f.textureFrame)),
    misResolved: a.frames.filter((f) => !f.frame || f.frame.name !== f.textureFrame).map((f) => f.textureFrame + "->" + (f.frame ? f.frame.name : "无")),
    geomBad: a.frames.filter((f) => { const e = geom["chars-play"][f.textureFrame]; return !e || !f.frame || e[0] !== f.frame.width || e[1] !== f.frame.height; }).map((f) => String(f.textureFrame)),
  }));
  return {
    myRole: scene.myRole,
    diamonds: (window.__fwInit.level && window.__fwInit.level.diamonds || []).length,
    hasPlay: g.textures.exists("chars-play"),
    hasEntry: g.textures.exists("chars-entry"),
    missingEntry,
    painted: painted.length,
    noCut: painted.filter((p) => p.w < 0).map((p) => p.key + "/" + p.name + "/" + (p.visible ? "可见" : "隐")),
    badPainted: bad.slice(0, 5),
    registeredCount: anims.length,
    registered: anims.map((a) => a.k + ":" + a.n),
    animFrames: anims.reduce((s, a) => s + a.n, 0),
    animForeign: Array.from(new Set(anims.flatMap((a) => a.tex))).filter((k) => k !== "chars-play"),
    animBadFrames: anims.flatMap((a) => a.bad).slice(0, 6),
    animMisResolved: anims.flatMap((a) => a.misResolved).slice(0, 6),
    animGeomBad: anims.flatMap((a) => a.geomBad).slice(0, 6),
    entryPainted: painted.filter((p) => p.key === "chars-entry" && p.visible).length,
  };
})()`;
const snapshot = (page) => page.evaluate(SNAPSHOT);
const waitAnims = (page, needTexture, ms) =>
  page.waitForFunction(
    `(() => { const { keys } = ${ARG}; const g = window.__fw; return ${needTexture ? 'g.textures.exists("chars-play") && ' : ""}keys.every((k) => g.anims.exists(k)); })()`,
    null,
    { timeout: ms },
  );

/** 等"角色确有上屏"：`waitForStarted` 读的是**服务器**相位（ready→started 由双人到座计时，
 *  不看客户端装载），而落定门是客户端 `GameScene.create` 跑完那一刻。off 档两者几乎同帧，
 *  节流档差出 8~78s（r23 §四/§五：4g 可玩 12.8s、slow3g 90.8s），不锚这一步就会把
 *  "create 还没跑"读成"窗口里画面对不上"（4g 首跑实测 painted=0）。
 *  判据用探针自己那套遍历，不引入第二个口径。 */
const waitPainted = (page, ms) => page.waitForFunction(`(() => {
  const g = window.__fw;
  if (!g || !g.scene.isActive("Game")) return false;
  const walk = (l) => {
    for (const o of l || []) {
      if (o.type === "Container") { if (walk(o.list)) return true; continue; }
      const k = o.texture && o.texture.key;
      if (k && k.indexOf("chars") === 0) return true;
    }
    return false;
  };
  return walk(g.scene.getScene("Game").children.list);
})()`, null, { timeout: ms, polling: 80 });

const mkCtx = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  // 与 perf-load 同一条施加路径：CDP 条件挂在页面上、导航之前，故整趟装载都按档位付带宽与 RTT
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
/** 节流真的生效（阴性对照，口径同 perf-load 的 assertThrottleActive：系数取 0.5 且只设下限——
 *  并发调度会让单笔体耗时大幅偏离名义值，拿名义值当等式判会把好机器判成失效） */
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
const assertThrottle = async (page, tag) => {
  if (!THROTTLED) return;
  const p = await throttleProof(page);
  const fails = [];
  if (NET.latency > 0) {
    const floor = 0.5 * NET.latency;
    if (p.ttfbMedianMs === null) fails.push(`无过网请求可证 TTFB（netRequests=${p.netRequests}）`);
    else if (p.ttfbMedianMs < floor) fails.push(`TTFB 中位数 ${p.ttfbMedianMs}ms < 0.5×rtt(${floor}ms)`);
  }
  if (NET.down > 0 && p.bigBodyMs !== null) {
    const floor = 0.5 * (1000 * p.bigTransferB) / NET.down;
    if (p.bigBodyMs < floor) fails.push(`${p.bigUrl} 体耗时 ${p.bigBodyMs}ms < 0.5×名义(${Math.round(floor)}ms)`);
  }
  check(`${tag} 节流生效（档位 ${NET_NAME}：${NET.desc}）`, fails.length === 0,
    `ttfb中位=${p.ttfbMedianMs}ms 最大单笔=${p.bigUrl}/${p.bigTransferB}B 体=${p.bigBodyMs}ms${fails.length ? " ⇒ " + fails.join("；") : ""}`);
};
const warns = [];
const missingAnim = [];
const errs = [];
const watch = (tag, page) => {
  page.on("pageerror", (e) => errs.push(`${tag} pageerror: ${e}`));
  page.on("console", (m) => {
    const t = m.text();
    if ((m.type() === "warning" || m.type() === "error") && TEX_WARN.test(t)) warns.push(`${tag} console.${m.type()}: ${t}`);
    if (MISSING_ANIM.test(t)) missingAnim.push(`${tag}: ${t}`);
  });
};

try {
  // ── 用例一：停住 CharAssetsPlay.png 的响应，把窗口期摊开给探针看 ──
  const A = await mkCtx();
  const B = await mkCtx();
  watch("A", A.page);
  watch("B", B.page);
  // 扣住 Play 张的响应：窗口由 release() 结束，不是靠固定 sleep 赌时序
  let release = () => {};
  const held = new Promise((r) => { release = r; });
  await A.ctx.route("**/assets/atlasses/CharAssetsPlay.png", async (route) => {
    await Promise.race([held, new Promise((r) => setTimeout(r, STALL))]);
    await route.continue();
  });
  const code = await enterAs(A.page, PORT, "create", "", LEVEL, WAIT_SCALE);
  await enterAs(B.page, PORT, "join", code, LEVEL, WAIT_SCALE);
  await waitForStarted(A.page, WAIT_START);
  await waitForStarted(B.page, WAIT_START);
  await waitPainted(A.page, WAIT_START);

  const s1 = await snapshot(A.page);
  check("停答生效：窗口里 chars-play 未入缓存（阴性对照）", s1.hasPlay === false, `hasPlay=${s1.hasPlay} role=${s1.myRole} diamonds=${s1.diamonds}`);
  check("窗口里十一式一律未注册", s1.registeredCount === 0, `registered=${s1.registeredCount} ${s1.registered.join(" ")}`);
  check("窗口里 Entry 张已入缓存且七帧齐", s1.hasEntry === true && s1.missingEntry.length === 0, `missing=${s1.missingEntry.join(",")}`);
  check(`窗口里本关确有钻石（${LEVEL} 的 diamond 数 > 0）`, s1.diamonds > 0, `diamonds=${s1.diamonds}（换关卡再跑）`);
  check("窗口里钻石确有上屏（chars-entry 可见对象 > 0）", s1.entryPainted > 0, `entryPainted=${s1.entryPainted}`);
  check("窗口里在场 chars 对象的帧全部对得上产物 json（零 __BASE / 零跨张配错）", s1.badPainted.length === 0, `bad=${JSON.stringify(s1.badPainted)} painted=${s1.painted} noCut=${JSON.stringify(s1.noCut)}`);

  // 窗口里跑动：让 AnimationState 真的去要那两个还没注册的键（myRole 取 fireboy/watergirl，
  // 方向键只作用于 fb、WASD 只作用于 wg）
  const key = /water/.test(s1.myRole) ? "d" : "ArrowRight";
  await runInputs(A.page, [{ t: 0, key, type: "down" }, { t: 900, key, type: "up" }], 1000);
  const s2 = await snapshot(A.page);
  check("窗口里跑动走过 Missing animation 降级（证明窗口真被消费）", missingAnim.length > 0, `Missing animation 计数=${missingAnim.length}`);
  check("窗口里跑动后仍零花屏、零缺帧警告", s2.badPainted.length === 0 && warns.length === 0, `bad=${JSON.stringify(s2.badPainted)} warns=${warns.join("; ")}`);

  // 放行后：注册必须补齐，且逐帧几何等于产物
  release();
  await waitAnims(A.page, true, ARRIVAL_CAP);
  const s3 = await snapshot(A.page);
  check("放行后十一式全部注册", s3.registeredCount === PLAY_KEYS.length, `registered=${s3.registeredCount}/${PLAY_KEYS.length} ${s3.registered.join(" ")}`);
  check(`放行后动画帧数恰为 ${PLAY_FRAME_COUNT} 且全部来自 chars-play`, s3.animFrames === PLAY_FRAME_COUNT && s3.animForeign.length === 0, `frames=${s3.animFrames} foreign=${s3.animForeign.join(",")}`);
  check("放行后逐帧名都能在 chars-play 产物里找到（配错帧=花屏的运行时对照）", s3.animBadFrames.length === 0 && s3.animGeomBad.length === 0, `bad=${s3.animBadFrames.join(",")} geomBad=${s3.animGeomBad.join(",")}`);
  check("放行后每一帧解析到的 Frame 名 == 注册时给的帧名（__BASE 一律不许出现）", s3.animMisResolved.length === 0, `mis=${s3.animMisResolved.join(" ")}`);
  check("放行后在场 chars 对象仍全部对得上", s3.badPainted.length === 0, `bad=${JSON.stringify(s3.badPainted)}`);
  const net = await A.page.evaluate(() => Object.fromEntries(performance.getEntriesByType("resource").map((e) => [e.name.split("/").pop(), Math.round(e.responseEnd)])));
  check("chars-play 与 chars-entry 都确有网络请求", !!net["CharAssetsPlay.png"] && !!net["CharAssetsEntry.png"], JSON.stringify(Object.keys(net).filter((k) => k.startsWith("CharAssets"))));
  check("对照：Entry 张先于 Play 张落定", (net["CharAssetsEntry.png"] ?? 1e12) <= (net["CharAssetsPlay.png"] ?? 0), `entry=${net["CharAssetsEntry.png"]} play=${net["CharAssetsPlay.png"]}`);
  check("全程 TEX_WARN 零条（缺帧警告在本设计里不该出现）", warns.length === 0, warns.join("; "));
  check("全程页面零错误", errs.length === 0, errs.join("; "));
  await A.ctx.close();
  await B.ctx.close();

  // ── 用例二：真路径（不停答）也必须收敛（⑤），并量出这段"已可玩、播放序列未到位"的窗口长度 ──
  // 为什么窗口长度只能在这里量：perf-load 的冷启快照打在"可玩"那一刻，而 Play 张要到落定登记之后
  // 才入队，于是臂B 的 CharAssetsPlay.png 在快照里**整条条目都不存在**（不是 pending、也不是"晚于进房"），
  // r21 那条 loopDeferred 判据搬到这张图上会退化成单边断言（实测见 r23 报告 §代价侧）。
  const C = await mkCtx();
  const D = await mkCtx();
  watch("C", C.page);
  watch("D", D.page);
  const code2 = await enterAs(C.page, PORT, "create", "", LEVEL, WAIT_SCALE);
  await enterAs(D.page, PORT, "join", code2, LEVEL, WAIT_SCALE);
  await waitForStarted(C.page, WAIT_START);
  await waitForStarted(D.page, WAIT_START);
  await waitPainted(C.page, WAIT_START);
  // 页钟锚点：落定门（角色上屏）之后立刻取 performance.now()，带 Playwright 观测延迟（几十 ms 级），
  // 只用于同钟相减，不当绝对时刻用（同 perf-load 的口径）。
  const t0 = await C.page.evaluate(() => performance.now());
  await waitAnims(C.page, false, ARRIVAL_CAP).catch(() => {});
  const win = await C.page.evaluate(() => {
    const e = performance.getEntriesByType("resource").find((x) => x.name.endsWith("/CharAssetsPlay.png"));
    const j = performance.getEntriesByType("resource").find((x) => x.name.endsWith("/CharAssetsPlay.json"));
    return { respEnd: e ? Math.round(e.responseEnd) : null, jsonEnd: j ? Math.round(j.responseEnd) : null, now: Math.round(performance.now()) };
  });
  const winMs = win.respEnd === null ? null : win.respEnd - Math.round(t0);
  log(`自然路径窗口[${NET_NAME}]：可玩页钟=${Math.round(t0)} → Play.png 落定=${win.respEnd}（${winMs === null ? "未观测" : (winMs >= 0 ? "+" : "") + winMs + "ms"}）` +
    ` .json=${win.jsonEnd} 十一式注册观测上界=+${win.now - Math.round(t0)}ms`);
  await assertThrottle(C.page, `用例二[${NET_NAME}]`);
  await C.page.waitForTimeout(800);
  const s4 = await snapshot(C.page);
  check("真路径（不停答）十一式收敛", s4.registeredCount === PLAY_KEYS.length, `registered=${s4.registeredCount} hasPlay=${s4.hasPlay}`);
  check(`真路径 Play.png 确有请求（延迟通道真的发起了这一趟，档位 ${NET_NAME}）`, win.respEnd !== null, `respEnd=${win.respEnd}`);
  check("真路径零花屏、零缺帧警告", s4.badPainted.length === 0 && warns.length === 0, `bad=${JSON.stringify(s4.badPainted)} warns=${warns.join("; ")}`);
  check("真路径页面零错误", errs.length === 0, errs.join("; "));
  await C.ctx.close();
  await D.ctx.close();

  // ── 用例三：离房交还 chars-play → 重进重建（r42）──
  // 钉三条用例一/二够不到的失效模式：
  //   ① 摘键顺序：Animation 在 create 时就把帧名解析成具体 Frame，纹理一卸 Frame.data 即为 null；
  //      buildSeq 的 exists 幂等卫又拒绝重建 ⇒ r39 那类 stale Frame 会一路带着播。故交还必须
  //      **先摘十一式全局键、再卸纹理**，大厅里不许留死键。
  //   ② 重建时机：重进由 GameScene.create 的 kickCharsPlay 重新声明纹理，ensureCharAnims 在
  //      filecomplete 后才 buildCharAnims；早一步注册=整张图集当一帧（__BASE），晚一步=按键无键。
  //   ③ 大厅零消费：chars-play/房内字体/结算变体离房即交还，而 bgm_menu 这类大厅资源不受牵连。
  // 双人房：重进走真实 join（沿用原房间码），让 GameScene.create 与 started 相位都真实发生
  const E = await mkCtx();
  const F = await mkCtx();
  watch("E", E.page);
  watch("F", F.page);
  const code3 = await enterAs(E.page, PORT, "create", "", LEVEL, WAIT_SCALE);
  await enterAs(F.page, PORT, "join", code3, LEVEL, WAIT_SCALE);
  await waitForStarted(E.page, WAIT_START);
  await waitForStarted(F.page, WAIT_START);
  await waitPainted(E.page, WAIT_START);
  await waitAnims(E.page, true, ARRIVAL_CAP);
  const s5 = await snapshot(E.page);
  check("用例三基线：重进前 chars-play 在缓存", s5.hasPlay === true, `hasPlay=${s5.hasPlay} role=${s5.myRole}`);
  check("用例三基线：重进前十一式齐（阳性对照）", s5.registeredCount === PLAY_KEYS.length, `registered=${s5.registeredCount}/${PLAY_KEYS.length}`);

  // 用例三窗口起点：只取此前累计条数，后面按 slice 判"本轮新增"
  const preErrs = errs.length;
  const preWarns = warns.length;
  const preMissing = missingAnim.length;

  // 离房前必须等入场黑幕退场：fadeSwitch 在 XFade active 期把整个离房触发丢弃
  // （r42 首跑超时的根因，TEMP 探针实测 Game 未停、XFade 400ms 后自停）。等场景不再活动即可。
  await E.page.waitForFunction(() => !globalThis.__fw?.scene?.isActive("XFade"), null, { timeout: 20000, polling: 40 });
  await E.page.evaluate(() => globalThis.__fwLeaveToMenu?.());
  await E.page.waitForFunction(
    () => globalThis.__fw?.scene?.isActive("Temple") && !globalThis.__fw?.textures.exists("chars-play"),
    null,
    { timeout: 20000, polling: 40 },
  );
  const hall = await E.page.evaluate((keys) => {
    const g = globalThis.__fw;
    return {
      hasPlay: g.textures.exists("chars-play"),
      anims: keys.map((k) => g.anims.exists(k)),
      font: g.textures.exists("font-full") || g.textures.exists("font-room"),
      finish: ["popup-finish-general", "popup-finish-speed", "popup-finish-puzzle"].some((k) => g.textures.exists(k)),
      bgmMenu: g.cache.audio.exists("bgm_menu"),
    };
  }, PLAY_KEYS);
  check("用例三离房：chars-play 已交还", hall.hasPlay === false, `hasPlay=${hall.hasPlay}`);
  check("用例三离房：十一式全局键全部已摘（不留 stale Frame 键）", hall.anims.every((v) => v === false), `anims=${JSON.stringify(hall.anims)}`);
  check("用例三离房：房内字体与结算变体也已交还（r41 回归）", hall.font === false && hall.finish === false, `font=${hall.font} finish=${hall.finish}`);
  check("用例三离房：大厅菜单曲仍在缓存", hall.bgmMenu === true, `bgmMenu=${hall.bgmMenu}`);

  await E.page.evaluate((lv) => globalThis.__fw.registry.get("onLevelPicked")(lv), LEVEL);
  await E.page.waitForSelector("#menu", { state: "visible", timeout: 15000 });
  await E.page.fill("#password", PASSWORD);
  await E.page.fill("#roomcode", code3);
  await E.page.click("#btn-join");
  await E.page.waitForSelector("#menu", { state: "hidden", timeout: 15000 * WAIT_SCALE });
  await waitForStarted(E.page, WAIT_START);
  await E.page.waitForFunction(() => globalThis.__fw?.scene?.isActive("Game"), null, { timeout: 60000, polling: 40 });
  await E.page.waitForFunction(() => !globalThis.__fw?.scene?.isActive("XFade"), null, { timeout: 20000, polling: 40 });
  await waitAnims(E.page, true, ARRIVAL_CAP);
  const s6 = await snapshot(E.page);
  check("用例三重进：chars-play 重新声明且十一式全部注册", s6.hasPlay === true && s6.registeredCount === PLAY_KEYS.length, `hasPlay=${s6.hasPlay} registered=${s6.registeredCount}/${PLAY_KEYS.length}`);
  check(`用例三重进：动画帧数恰为 ${PLAY_FRAME_COUNT} 且全部来自 chars-play`, s6.animFrames === PLAY_FRAME_COUNT && s6.animForeign.length === 0, `frames=${s6.animFrames} foreign=${s6.animForeign.join(",")}`);
  check("用例三重进：逐帧解析到新纹理（无 stale Frame / 无 __BASE）", s6.animBadFrames.length === 0 && s6.animGeomBad.length === 0 && s6.animMisResolved.length === 0, `bad=${s6.animBadFrames.join(",")} geomBad=${s6.animGeomBad.join(",")} mis=${s6.animMisResolved.join(" ")}`);
  check("用例三重进：在场 chars 对象全部对得上产物 json", s6.badPainted.length === 0, `bad=${JSON.stringify(s6.badPainted)}`);

  const key3 = /water/.test(s6.myRole) ? "d" : "ArrowRight";
  await runInputs(E.page, [{ t: 0, key: key3, type: "down" }, { t: 900, key: key3, type: "up" }], 1000);
  check("用例三窗口：重建后跑动零新增 Missing animation（重建时机已钉住）", missingAnim.slice(preMissing).length === 0, missingAnim.slice(preMissing).join("; "));
  check("用例三窗口：零新增 TEX_WARN", warns.slice(preWarns).length === 0, warns.slice(preWarns).join("; "));
  check("用例三窗口：零新增页面错误", errs.slice(preErrs).length === 0, errs.slice(preErrs).join("; "));
  await E.ctx.close();
  await F.ctx.close();
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
log(fail ? `charsplay[${NET_NAME}]: ${fail} 项 FAIL（Missing animation 计数=${missingAnim.length}）`
  : `charsplay[${NET_NAME}]: ALL PASS（窗口期良性降级取证 ${missingAnim.length} 条）`);
process.exit(fail ? 1 : 0);
