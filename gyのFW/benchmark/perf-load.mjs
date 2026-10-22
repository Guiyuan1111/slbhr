/**
 * 客户端加载性能基准：构建产物冷启动测量（全新无缓存 context）。
 * - 里程碑：goto→DCL→__fw 就绪→Menu active→（建房）→Game active
 * - 资源：请求数 / 传输字节 / 解码字节（按 initiatorType 分组）
 * - 声明资源缓存命中：二次访问（同 context reload）传输字节对比
 * - r15 起逐 URL 拆账（冷启动归因用）：
 *   · items——每条资源的 传输KB/解码KB/类型 + 相对导航起点的起止毫秒；
 *   · 阶段归位不靠跨时钟对齐（页内 performance.now 与 Node 墙钟不可比），而是
 *     "Menu 时刻快照里存在即属 Menu 前"，两次快照做集合差；
 *   · responses——服务端响应头实况（content-encoding / cache-control / etag / 状态码），
 *     压缩与缓存策略争议以头部实测为准，不读代码推断。
 *   · revalidate——条件复验探测：对幂等同源 GET 各发"无标签整份"与"带 ETag 复验"两次
 *     no-store 请求，直接读出新鲜期过后的两种成本差（件B 的收益口径）；
 *     /matchmake/* 与文档请求有副作用（重复建房），不进探测清单。
 *
 * 用法：
 *   node --import tsx benchmark/perf-load.mjs [--no-build] [--level <id>] [--net <off|cable|4g|fast3g|slow3g>] --save <label>
 *   node --import tsx benchmark/perf-load.mjs --no-build --compare <label>
 *   · --level（r16 量具）：深链选关档位，缺省 forest_01。音频按关卡类型选族（r16 件A）
 *     只有换成 speed 关（如 forest_12）才测得出差异，对比时两侧必须同档位。
 *   · --net（r20 量具）：隧道节流档位 `off|cable|4g|fast3g|slow3g`，缺省 off＝**完全不建 CDP 会话、
 *     完全不节流**，故历轮数字口径不变。可用 `--rtt <ms>`/`--down <Mbps>` 覆写单参数做定点换算。
 *     节流由 CDP `Network.emulateNetworkConditions` 施加在页面上；**条件复验探测（revalidate）走 Node
 *     原生 http，不经节流**，所以那一栏跨档位仍可比（它测的是服务器能力，不是链路）。
 *     档位自带"节流真的生效"断言（见 throttleProof）：延迟档用**页内墙钟直测**一次 1KB 取回
 *     （r30 实测：CDP 的 latency 记在 fetchStart 之前，Resource Timing 的 TTFB 只有 1–2ms，
 *     逐请求 TTFB 中位数实际测的是带宽排队，字节更少的臂会假阴性），要求 ≥ 0.5×rtt；
 *     带宽档要求最大单笔的响应体耗时 ≥ 0.5×(字节/带宽)。静默失效的节流档比没有档更坏——
 *     它会把"弱网换算"写成"弱网实测"，故断言不过直接抛错退出。
 * 产物：benchmark/results/load-<label>.json
 */
import { spawn, execSync } from "node:child_process";
import http from "node:http";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const PORT = 3561;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "load-pw";
const argOf = (flag) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined);
const argSave = argOf("--save");
const argCompare = argOf("--compare");
/** 深链档位（r16）：speed 关（forest_03/06/12/14/16/26 等）与 general 关走的 BGM 族不同 */
const LEVEL = argOf("--level") ?? "forest_01";
const NO_BUILD = process.argv.includes("--no-build");

/** 隧道节流档位（r20）：down/up 为**字节/秒**（CDP 口径），latency 为毫秒，-1＝不限。
 *  fast3g/slow3g 取 Lighthouse 定义（1.6Mbps·150ms / 0.5Mbps·400ms），cable/4g 为中间档。
 *  waitScale：各等待超时按此放大——节流后 30s 的 `__fw` 等待在 slow3g 下必然误判成失败。 */
const NET_PROFILES = {
  off: { latency: 0, down: -1, up: -1, waitScale: 1, desc: "不节流（历轮口径）" },
  cable: { latency: 30, down: 1_250_000, up: 312_500, waitScale: 8, desc: "有线 10Mbps↓/2.5Mbps↑ · 30ms" },
  "4g": { latency: 80, down: 500_000, up: 125_000, waitScale: 24, desc: "4G 4Mbps↓/1Mbps↑ · 80ms" },
  fast3g: { latency: 150, down: 200_000, up: 93_750, waitScale: 60, desc: "Lighthouse Fast 3G 1.6Mbps↓/0.75Mbps↑ · 150ms" },
  slow3g: { latency: 400, down: 62_500, up: 62_500, waitScale: 200, desc: "Lighthouse Slow 3G 0.5Mbps↓↑ · 400ms" },
};
const NET_NAME = argOf("--net") ?? "off";
if (!Object.hasOwn(NET_PROFILES, NET_NAME)) {
  throw new Error(`--net 档位未知：${NET_NAME}（可用：${Object.keys(NET_PROFILES).join("/")}）`);
}
const NET = { ...NET_PROFILES[NET_NAME] };
if (argOf("--rtt") !== undefined) NET.latency = Number(argOf("--rtt"));
if (argOf("--down") !== undefined) NET.down = Math.round(Number(argOf("--down")) * 1_000_000 / 8);
if (argOf("--up") !== undefined) NET.up = Math.round(Number(argOf("--up")) * 1_000_000 / 8);
if (!Number.isFinite(NET.latency) || (NET.down > 0 && NET.down < 1000)) {
  throw new Error(`节流参数不可用：latency=${NET.latency}ms down=${NET.down}B/s（--down 单位 Mbps，别写成 0）`);
}
const THROTTLED = NET_NAME !== "off" || NET.latency > 0 || NET.down !== NET_PROFILES[NET_NAME].down;
const W = (ms) => Math.round(ms * NET.waitScale);
const log = (...a) => console.log("[load]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!NO_BUILD) {
  log("构建客户端…");
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
}

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "packages", "server", "src", "index.ts")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), FW_HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server 启动超时")), 60000);
    const ondata = (buf) => {
      const s = String(buf);
      if (s.includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error("端口被占用")); }
      else if (s.includes("http+ws")) { clearTimeout(timer); resolve(child); }
    };
    child.stdout.on("data", ondata);
    child.stderr.on("data", (b) => process.stderr.write(b));
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("server 提前退出: " + code)); });
  });
}

async function resourceStats(page) {
  return page.evaluate(() => {
    const es = performance.getEntriesByType("resource");
    const byType = {};
    let totalTransfer = 0, totalDecoded = 0, count = 0;
    const items = [];
    const ttfbs = [];
    let largest = null;
    let windowStart = Infinity, windowEnd = 0;
    for (const e of es) {
      const t = e.initiatorType || "other";
      byType[t] = byType[t] || { n: 0, transferKB: 0, decodedKB: 0 };
      byType[t].n++;
      byType[t].transferKB += (e.transferSize || 0) / 1024;
      byType[t].decodedKB += (e.decodedBodySize || 0) / 1024;
      totalTransfer += e.transferSize || 0;
      totalDecoded += e.decodedBodySize || 0;
      count++;
      items.push({
        url: e.name.replace(/^https?:\/\/[^/]+/, ""),
        type: t,
        transferKB: +((e.transferSize || 0) / 1024).toFixed(1),
        decodedKB: +((e.decodedBodySize || 0) / 1024).toFixed(1),
        startMs: +e.startTime.toFixed(0),
        endMs: +e.responseEnd.toFixed(0),
      });
      // 节流生效证据只用**真过了网**的条目：transferSize=0 是缓存命中/blob/data，量不出链路
      if ((e.transferSize || 0) > 0 && e.responseStart > 0 && e.fetchStart > 0 && /^https?:/.test(e.name)) {
        ttfbs.push(e.responseStart - e.fetchStart);
        windowStart = Math.min(windowStart, e.fetchStart);
        windowEnd = Math.max(windowEnd, e.responseEnd);
        if (!largest || e.transferSize > largest.bytes) {
          largest = {
            url: e.name.replace(/^https?:\/\/[^/]+/, ""),
            bytes: e.transferSize,
            bodyMs: +(e.responseEnd - e.responseStart).toFixed(1),
          };
        }
      }
    }
    ttfbs.sort((a, b) => a - b);
    const med = (arr) => (arr.length ? (arr.length % 2 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2) : null);
    // 同一次导航里取过两次以上的 URL（r20）：预取/双载类改动的判据。
    // 第二次命中内存缓存时 transferSize=0，**总字节看不出双取**，只有条数露馅——
    // r19 快照 round2 的 /assets/audio/s/LevelMusic（17→18 条而 KB 不变）就是靠这条抓出来的。
    const urlN = {};
    const urlTransfers = {};
    for (const it of items) {
      urlN[it.url] = (urlN[it.url] || 0) + 1;
      (urlTransfers[it.url] ||= []).push(it.transferKB);
    }
    const dupUrls = Object.keys(urlN)
      .filter((u) => urlN[u] > 1)
      .map((u) => {
        // 关键区分：第二次只花几百字节头 = 条件复验（binary 资产 max-age=0 是 staticGz 有意策略，
        // 不是缺陷）；第二次仍是整份字节 = 真双载。只看条数会把前者误判成后者，反之只看总 KB
        // 会把后者漏掉（命中内存缓存时 transferSize=0）。
        const t = urlTransfers[u].slice().sort((a, b) => b - a);
        return {
          url: u,
          n: urlN[u],
          wireFetches: t.filter((x) => x > 0).length,
          transfersKB: urlTransfers[u],
          restKB: +t.slice(1).reduce((a, b) => a + b, 0).toFixed(1),
          doubleDownload: (t[1] || 0) > 1,
        };
      });
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      count,
      totalTransferKB: +(totalTransfer / 1024).toFixed(0),
      totalDecodedKB: +(totalDecoded / 1024).toFixed(0),
      byType,
      items,
      dupUrls,
      throttleProbe: {
        netRequests: ttfbs.length,
        ttfbMinMs: ttfbs.length ? +ttfbs[0].toFixed(1) : null,
        ttfbMedianMs: med(ttfbs) === null ? null : +med(ttfbs).toFixed(1),
        ttfbMaxMs: ttfbs.length ? +ttfbs[ttfbs.length - 1].toFixed(1) : null,
        largestBytesMs: largest ? largest.bodyMs : null,
        largestKB: largest ? +(largest.bytes / 1024).toFixed(1) : null,
        largestUrl: largest ? largest.url : null,
        windowMs: ttfbs.length ? +(windowEnd - windowStart).toFixed(0) : null,
        wireKBTotal: +(totalTransfer / 1024).toFixed(0),
        wireBytesTotal: totalTransfer,
      },
      domContentLoadedMs: nav ? +nav.domContentLoadedEventEnd.toFixed(0) : null,
    };
  });
}

/** r30：延迟档的直接证据。CDP 的 latency 在 fetchStart 之前生效——最小实验（150ms/200KB/s）
 *  每次 fetch 墙钟 +158ms，而 responseStart−fetchStart 只有 1–2ms。逐请求 TTFB 中位数于是只反映
 *  带宽排队：字节更少的臂排队更短，反而会在旧判据下"假阴性"（r30 臂 B 连试三次 38–42ms）。
 *  取 1KB 静态文件、cache-bust、连测两次取小值，避开缓存与渲染卡顿的单向污染。 */
async function probeLatencyWall(page) {
  return page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 2; i++) {
      const t0 = performance.now();
      await fetch(`/assets/atlasses/CharAssetsEntry.json?latency_probe=${Date.now()}_${i}`, { cache: "no-store" });
      out.push(performance.now() - t0);
    }
    return +Math.min(...out).toFixed(1);
  });
}

/** 节流是不是真的落在链路上了？——静默失效的节流档会把"换算"冒充成"实测"，所以这里必须能失败。
 *  两条独立判据（各只依赖一个旋钮）：延迟档看页内墙钟探针，带宽档看最大单笔的响应体耗时。
 *  系数取 0.5 且只设下限：并发调度会让单笔体耗时大幅偏离名义值（本机 4g 实测 font.png 体 9531ms
 *  vs 名义 3278ms——多请求共享同一节流带宽），拿名义值当等式判会把好机器判成失效。 */
function assertThrottleActive(probe, wallMs, tag) {
  if (!THROTTLED) return { profile: NET_NAME, checked: false };
  const fails = [];
  if (NET.latency > 0) {
    const floor = 0.5 * NET.latency;
    if (wallMs === null) fails.push("无页内墙钟延迟探针");
    else if (wallMs < floor) fails.push(`墙钟延迟探针 ${wallMs}ms < 0.5×rtt(${floor}ms)`);
  }
  if (NET.down > 0) {
    if (probe.largestBytesMs === null || probe.largestKB === null) fails.push("无最大单笔可证带宽");
    else {
      const floor = 0.5 * ((probe.largestKB * 1024) / NET.down) * 1000;
      if (probe.largestBytesMs < floor) {
        fails.push(`${probe.largestUrl} 响应体 ${probe.largestBytesMs}ms < 0.5×名义 ${(floor).toFixed(0)}ms`);
      }
    }
  }
  if (fails.length) {
    throw new Error(`节流档位 ${NET_NAME} 静默失效（${tag}）：${fails.join("；")}。` +
      `名义参数 latency=${NET.latency}ms down=${NET.down}B/s——档位没生效的读数一律不可用作弱网主张。`);
  }
  return {
    profile: NET_NAME,
    checked: true,
    latencyMs: NET.latency,
    downBps: NET.down,
    upBps: NET.up,
    desc: NET.desc,
    latencyWallMs: wallMs,
    ttfbMedianMs: probe.ttfbMedianMs,
    largestUrl: probe.largestUrl,
    largestKB: probe.largestKB,
    largestBytesMs: probe.largestBytesMs,
    windowMs: probe.windowMs,
    // 聚合带宽自证：过网字节 ÷ 过网窗口。分母是**窗口**（首末过网请求跨度），不是档位标称值，
    // 所以它天然低于名义下行——窗口里有主线程解码、握手与队列空转。用作"档位像不像那条链路"
    // 的量级核对，不作判据（判据只有上面两条下限）。
    achievedMbps: probe.windowMs && NET.down > 0
      ? +(((probe.wireBytesTotal * 8) / (probe.windowMs / 1000)) / 1e6).toFixed(2)
      : null,
  };
}

async function waitSceneActive(page, key, timeout = 30000) {
  const t0 = Date.now();
  await page.waitForFunction((k) => {
    const g = globalThis.__fw;
    return g && g.scene.isActive(k);
  }, key, { timeout, polling: 40 });
  return Date.now() - t0;
}

/** 条件复验探测（r15 件B 收益直读）：对同一批 URL 各发两次请求——第一次不带标签
 *  （等价"新鲜期已过、整份重下"），第二次带首次拿到的 ETag（等价"新鲜期已过的校验复用"）。
 *  必须用 Node 原生 http 而不是页内 fetch：Blink 在 cache:no-store 下会**丢掉条件请求头**
 *  （no-store 语义即"不做校验复用"），页内测出来的"200 全量"是浏览器行为而非服务器能力，
 *  会把"服务器不支持 ETag"与"客户端没发标签"两种原因混为一谈。
 *  keepAlive 复用连接，贴近真实浏览器连接复用。 */
async function probeRevalidate(urls) {
  return new Promise((resolve, reject) => {
    const agent = new http.Agent({ keepAlive: true, maxSockets: 6 });
    const get = (path, headers) =>
      new Promise((res, rej) => {
        const req = http.request({ host: "127.0.0.1", port: PORT, path, agent, headers }, (r) => {
          let bytes = 0;
          r.on("data", (c) => { bytes += c.length; });
          r.on("end", () => res({ status: r.statusCode ?? 0, etag: r.headers.etag ?? null, bytes }));
        });
        req.on("error", rej);
        req.end();
      });
    (async () => {
      const rows = [];
      for (const u of urls) {
        const full = await get(u, { "accept-encoding": "gzip, br" });
        const cond = await get(u, { "accept-encoding": "gzip, br", ...(full.etag ? { "if-none-match": full.etag } : {}) });
        rows.push({
          url: u,
          etag: full.etag ? "yes" : "no",
          refetchKB: +(full.bytes / 1024).toFixed(2),
          revalKB: +(cond.bytes / 1024).toFixed(2),
          status: cond.status,
        });
      }
      agent.destroy();
      resolve(rows);
    })().catch((e) => { agent.destroy(); reject(e); });
  });
}

/** 一轮完整测量：冷 context 深链 → Menu → 建房 → Game；再 reload 测缓存命中 */
async function measureRound(browser, round) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await ctx.newPage();
  // FW_NET_NOOP=1 是阴性对照开关：**装作**开了档但不发 CDP 指令，用来逼自检报错——
  // 证明这两道判据不是永真的摆设。日常测量切勿带它（带了就是拿不节流的数当弱网数）。
  if (THROTTLED && !process.env.FW_NET_NOOP) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: NET.latency,
      downloadThroughput: NET.down,
      uploadThroughput: NET.up,
    });
  }
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  // 响应头实况（r15）：同一 URL 只记首见（reload 的缓存命中头不作为策略证据）
  const headers = new Map();
  page.on("response", (r) => {
    const u = r.url().replace(/^https?:\/\/[^/]+/, "");
    if (headers.has(u)) return;
    const h = r.headers();
    headers.set(u, {
      url: u,
      status: r.status(),
      enc: h["content-encoding"] ?? "-",
      cc: h["cache-control"] ?? "-",
      etag: h["etag"] ? "yes" : "no",
    });
  });
  const t0 = Date.now();
  await page.goto(`${BASE}/?level=${LEVEL}`, { waitUntil: "domcontentloaded" });
  const tDom = Date.now();
  await page.waitForFunction(() => !!globalThis.__fw, null, { timeout: W(30000) });
  const tFw = Date.now();
  await waitSceneActive(page, "Menu", W(30000));
  const tMenu = Date.now();
  const cold = {
    domContentLoadedMs: tDom - t0,
    phaserReadyMs: tFw - t0,
    menuActiveMs: tMenu - t0,
    resources: await resourceStats(page),
  };
  const menuUrls = new Set(cold.resources.items.map((i) => i.url));
  // 建房 → Game active
  await page.fill("#password", PASSWORD);
  // 点击时刻用**页内时钟**采样（r16）：与 Resource Timing 的 startTime/responseEnd 同钟，
  // 故可把 Menu 快照之后的请求再切成「点击前=Menu 驻留期暖装」与「点击后=进房路径」两段。
  // （r15 集合差只分 Menu/非 Menu 两段；这里不做 Node 墙钟↔页钟对齐，只在页钟内比较）
  const clickPerfMs = await page.evaluate(() => performance.now());
  const tClick = Date.now();
  await page.click("#btn-create");
  await page.waitForSelector("#menu", { state: "hidden", timeout: W(20000) });
  await page.waitForFunction(() => /房间码 [^（\s]{4,}/.test(document.querySelector("#hud-room")?.textContent ?? ""), null, { timeout: W(20000) });
  await waitSceneActive(page, "Game", W(30000));
  const tGame = Date.now();
  cold.gameActiveAfterClickMs = tGame - tClick;
  cold.clickPerfMs = Math.round(clickPerfMs);
  cold.resourcesAfterGame = await resourceStats(page);
  // 探针放在快照之后：它多取一次 1KB，只作链路证据，不计入任何计时/字节窗口。
  const latencyWallMs = THROTTLED && NET.latency > 0 ? await probeLatencyWall(page) : null;
  cold.throttle = assertThrottleActive(cold.resourcesAfterGame.throttleProbe, latencyWallMs, `round${round} 冷启动段`);
  cold.pageErrors = errs;
  // 阶段归位：Menu 快照里已存在 = Menu 前；进 Game 快照里新增的 = 点建房→Game 段。
  // （不拿页内 performance.now 与 Node 墙钟对齐——两钟不可比，集合差是唯一可靠判据）
  cold.resources.items.forEach((i) => { i.phase = "menu"; });
  cold.resources.menuKB = +cold.resources.items.reduce((s, i) => s + i.transferKB, 0).toFixed(0);
  cold.resources.gamePhaseKB = +cold.resourcesAfterGame.items
    .filter((i) => !menuUrls.has(i.url))
    .reduce((s, i) => s + i.transferKB, 0).toFixed(0);
  cold.resourcesAfterGame.items.forEach((i) => { i.phase = menuUrls.has(i.url) ? "menu" : "game"; });
  // 非 Menu 段再按页钟点击时刻细分：warm=点击前的 Menu 驻留期暖装，post=点击后进房路径。
  // r21 实测校准：音轨走 XHR，Resource Timing 对 XHR **只在请求完成时**才入表——所以"快照时仍在飞"
  // 的音轨不是 pending 条目，而是**整条缺席**（r21-ab-4g-b 里 LevelMusic 零条目、pendingCount=0）。
  // pending 列仍保留：img/script 等非 XHR 条目在飞时确实以 responseEnd=0 出现在表里。
  cold.resourcesAfterGame.items.forEach((i) => {
    if (i.phase === "menu") return;
    i.phase = i.endMs === 0 ? "pending" : i.endMs <= cold.clickPerfMs ? "warm" : "post";
  });
  const phaseKB = (p) => +cold.resourcesAfterGame.items.filter((i) => i.phase === p).reduce((s, i) => s + i.transferKB, 0).toFixed(0);
  cold.resources.warmPhaseKB = phaseKB("warm");
  cold.resources.postClickKB = phaseKB("post");
  cold.resources.pendingCount = cold.resourcesAfterGame.items.filter((i) => i.phase === "pending").length;
  cold.resources.pendingUrls = cold.resourcesAfterGame.items.filter((i) => i.phase === "pending").map((i) => i.url.split("/").pop());
  // 循环曲出闸判据（r21 件1 的通过条件）：本关类型的循环曲（LevelMusic / LevelMusic_speed，
  // 锚定结尾故不会误取 Finish/Over）要么在进房快照里根本没有（还在飞），要么完成时刻晚于进房时刻。
  // 进房页钟时刻 = clickPerfMs（页钟）+ gameActiveAfterClickMs（Node 跨度）：跨度只是时长不是绝对点，
  // 两钟同速前进，误差只有 Playwright 观测延迟（实测几十 ms 级），比大小可用，逐点比较不可用。
  const gameActivePerfMs = cold.clickPerfMs + cold.gameActiveAfterClickMs;
  const loop = cold.resourcesAfterGame.items.filter((i) => /\/s\/LevelMusic(_speed)?$/.test(i.url));
  cold.loopDeferred = loop.every((i) => i.endMs > gameActivePerfMs);
  cold.loopArrivalAfterEntryMs = loop.length ? Math.round(Math.max(...loop.map((i) => i.endMs)) - gameActivePerfMs) : null;
  cold.gameActivePerfMs = Math.round(gameActivePerfMs);
  // r23 件1 代价侧：这段窗口量具**量不出长度**，只能登记观测事实。冷启快照打在"可玩"那一刻，
  // 而 Play 张在门落定之后才入队，Resource Timing 只在响应完成后建条目 ⇒ 节流三档读到空数组。
  // 空数组既可能是"还在飞"也可能是"还没发起"，所以这里出三态字符串而不是布尔：
  // `[].every()` 恒真与 `length > 0 &&` 恒假都是单边断言（r23 §六），把"产物里没这张"或
  // "可玩时还没取完"读成设计意图。窗口长度改由 scripts/e2e/charsplay.mjs 用例二在自然路径上断言，
  // 用例一（扣住 Play 张响应）负责把窗口摊开做逐帧取证。
  const charsPlay = cold.resourcesAfterGame.items.filter((i) => /\/CharAssetsPlay\.png$/.test(i.url));
  cold.charsPlayInWindow =
    charsPlay.length === 0 ? "none" : charsPlay.every((i) => i.endMs <= gameActivePerfMs) ? "before-gate" : "after-gate";
  cold.charsPlayArrivalAfterGateMs = charsPlay.length
    ? Math.round(Math.max(...charsPlay.map((i) => i.endMs)) - gameActivePerfMs)
    : null;
  // r25 件1 出口侧：两支终局时刻曲（失败曲 LevelMusicOver + 本族终局曲 LevelMusicFinish[_speed]）
  // 离开落定门后同用三态口径登记。布尔在这里会单边失真：节流档下 XHR 在飞时条目整条缺席，
  // 空数组既可能是"还在飞"也可能是"Menu 被切走后由 Game 侧兜底才发起"。
  // `bgmTerminalPreGateKB` 才是本轮的字节判据：这三支在"可玩"之前实际过网的 KB——臂A（门内）≈面额，
  // 臂B（门后）应为 0（条目要么缺席、要么 endMs 晚于进房时刻）。
  const terminal = cold.resourcesAfterGame.items.filter((i) => /\/s\/(LevelMusicOver|LevelMusicFinish)(_speed)?$/.test(i.url));
  cold.bgmTerminalInWindow =
    terminal.length === 0 ? "none" : terminal.every((i) => i.endMs <= gameActivePerfMs) ? "before-gate" : "after-gate";
  cold.bgmTerminalArrivalAfterGateMs = terminal.length
    ? Math.round(Math.max(...terminal.map((i) => i.endMs)) - gameActivePerfMs)
    : null;
  cold.bgmTerminalPreGateKB = +terminal.filter((i) => i.endMs <= gameActivePerfMs).reduce((s, i) => s + i.transferKB, 0).toFixed(1);
  cold.headers = [...headers.values()];

  // reload（同 context，浏览器有缓存）→ Menu active 与传输字节
  const r0 = Date.now();
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitSceneActive(page, "Menu", W(30000));
  const warm = {
    menuActiveMs: Date.now() - r0,
    resources: await resourceStats(page),
  };
  // 条件复验探测（件B）：只探幂等的同源静态/数据 GET。blob: 无服务器语义；
  // /matchmake/* 与文档请求有副作用（再打一次=再建一间房），一律排除。
  const probeUrls = [...headers.values()]
    .map((h) => h.url)
    .filter((u) => !u.startsWith("blob:") && !u.startsWith("/matchmake") && !u.startsWith("/?"));
  cold.revalidate = await probeRevalidate(probeUrls);
  cold.revalidateSummary = {
    urls: cold.revalidate.length,
    refetchKB: +cold.revalidate.reduce((s, x) => s + x.refetchKB, 0).toFixed(1),
    revalKB: +cold.revalidate.reduce((s, x) => s + x.revalKB, 0).toFixed(1),
    notConditional: cold.revalidate.filter((x) => x.status !== 304).map((x) => x.url),
  };
  await ctx.close();
  return { round, cold, warm };
}

const server = await startServer();
const results = {
  meta: {
    label: argSave ?? argCompare ?? "(run)",
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    node: process.version,
    level: LEVEL,
    net: THROTTLED ? `${NET_NAME}(rtt=${NET.latency}ms down=${NET.down}B/s up=${NET.up}B/s)` : "off",
    netDesc: NET.desc,
  },
  rounds: [],
};
if (THROTTLED) log(`节流档位 ${NET_NAME}：${NET.desc}——waitScale ${NET.waitScale}×，条件复验探测走 Node http 不受节流`);
const browser = await chromium.launch({
  channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined),
  headless: true,
  args: ["--mute-audio", "--enable-precise-memory-info"],
});
try {
  for (let i = 1; i <= 2; i++) {
    results.rounds.push(await measureRound(browser, i));
    const r = results.rounds[results.rounds.length - 1];
    log(`round${i}: Menu=${r.cold.menuActiveMs}ms 传输=${r.cold.resources.totalTransferKB}KB/${r.cold.resources.count}req | reload Menu=${r.warm.menuActiveMs}ms 传输=${r.warm.resources.totalTransferKB}KB | Game(点击后)=${r.cold.gameActiveAfterClickMs}ms`);
    if (r.cold.pageErrors.length) log(`round${i} 页面错误:`, r.cold.pageErrors.join("; "));
  }
} finally {
  await browser.close().catch(() => {});
  try { server.kill(); } catch {}
  await sleep(400);
  try { server.kill("SIGKILL"); } catch {}
}

// 聚合（两轮取均值）
const avg2 = (a, b) => +(((a + b) / 2).toFixed(1));
const isAudio = (i) => i.url.startsWith("/assets/audio/");
const kbOf = (items) => items.reduce((s, i) => s + i.transferKB, 0);
/** 音轨拆账：count=实际下载的音轨条数，kb=其传输字节（r16 件A 的收益口径） */
const audioStats = (cold) => {
  const all = cold.resourcesAfterGame.items.filter(isAudio);
  const kb = (f) => +kbOf(all.filter(f)).toFixed(1);
  return {
    count: all.length,
    totalKB: +kbOf(all).toFixed(1),
    menuKB: kb((i) => i.phase === "menu"),
    warmKB: kb((i) => i.phase === "warm"),
    postKB: kb((i) => i.phase === "post"),
    pending: all.filter((i) => i.phase === "pending").map((i) => `${i.url.split("/").pop()}@飞${(i.startMs / 1000).toFixed(1)}s`).join(","),
    tracks: all.map((i) => `${i.url.split("/").pop()}:${i.phase}:${i.transferKB}`).join(","),
  };
};
const [r1, r2] = results.rounds;
const a1 = audioStats(r1.cold), a2 = audioStats(r2.cold);
results.summary = {
  cold: {
    menuActiveMs: avg2(r1.cold.menuActiveMs, r2.cold.menuActiveMs),
    transferKB: avg2(r1.cold.resources.totalTransferKB, r2.cold.resources.totalTransferKB),
    requests: Math.round((r1.cold.resources.count + r2.cold.resources.count) / 2),
    gameActiveAfterClickMs: avg2(r1.cold.gameActiveAfterClickMs, r2.cold.gameActiveAfterClickMs),
    transferKBAfterGame: avg2(r1.cold.resourcesAfterGame.totalTransferKB, r2.cold.resourcesAfterGame.totalTransferKB),
    menuPhaseKB: avg2(r1.cold.resources.menuKB, r2.cold.resources.menuKB),
    gamePhaseKB: avg2(r1.cold.resources.gamePhaseKB, r2.cold.resources.gamePhaseKB),
    warmPhaseKB: avg2(r1.cold.resources.warmPhaseKB, r2.cold.resources.warmPhaseKB),
    postClickKB: avg2(r1.cold.resources.postClickKB, r2.cold.resources.postClickKB),
    pendingCount: Math.round((r1.cold.resources.pendingCount + r2.cold.resources.pendingCount) / 2),
    pendingUrlsRound1: r1.cold.resources.pendingUrls,
    loopDeferred: r1.cold.loopDeferred && r2.cold.loopDeferred,
    // 两轮都取到条目才有均值；任一轮"进房时还在飞"（无条目）就记 null，不做 0 补位（0 会被读成"同时到达"）
    loopArrivalAfterEntryMs:
      r1.cold.loopArrivalAfterEntryMs === null || r2.cold.loopArrivalAfterEntryMs === null
        ? null
        : avg2(r1.cold.loopArrivalAfterEntryMs, r2.cold.loopArrivalAfterEntryMs),
    // r23：三态照录，不是断言（none = 可玩那一刻还没有条目）；两轮都取到条目才做均值，否则记 null
    charsPlayInWindow: `${r1.cold.charsPlayInWindow}/${r2.cold.charsPlayInWindow}`,
    charsPlayArrivalAfterGateMs:
      r1.cold.charsPlayArrivalAfterGateMs === null || r2.cold.charsPlayArrivalAfterGateMs === null
        ? null
        : avg2(r1.cold.charsPlayArrivalAfterGateMs, r2.cold.charsPlayArrivalAfterGateMs),
    // r25：两支终局时刻曲同口径（三态照录 + 任一轮无条目记 null）；preGateKB 是本轮字节的通过条件
    bgmTerminalInWindow: `${r1.cold.bgmTerminalInWindow}/${r2.cold.bgmTerminalInWindow}`,
    bgmTerminalArrivalAfterGateMs:
      r1.cold.bgmTerminalArrivalAfterGateMs === null || r2.cold.bgmTerminalArrivalAfterGateMs === null
        ? null
        : avg2(r1.cold.bgmTerminalArrivalAfterGateMs, r2.cold.bgmTerminalArrivalAfterGateMs),
    bgmTerminalPreGateKB: avg2(r1.cold.bgmTerminalPreGateKB, r2.cold.bgmTerminalPreGateKB),
    audio: {
      count: Math.round((a1.count + a2.count) / 2),
      totalKB: avg2(a1.totalKB, a2.totalKB),
      menuKB: avg2(a1.menuKB, a2.menuKB),
      warmKB: avg2(a1.warmKB, a2.warmKB),
      postKB: avg2(a1.postKB, a2.postKB),
      pendingRound1: a1.pending,
      tracksRound1: a1.tracks,
    },
    revalProbe: {
      urls: r1.cold.revalidateSummary.urls,
      refetchKB: r1.cold.revalidateSummary.refetchKB,
      revalKB: r1.cold.revalidateSummary.revalKB,
      notConditional304: r1.cold.revalidateSummary.notConditional,
    },
    throttle: r1.cold.throttle,
    dupUrls: r1.cold.resourcesAfterGame.dupUrls,
    // 预取类改动的通过条件：这一列必须为空。复验（第二次只花头字节）不算双载。
    doubleDownloads: r1.cold.resourcesAfterGame.dupUrls.filter((d) => d.doubleDownload).map((d) => d.url),
  },
  warmReload: {
    menuActiveMs: avg2(r1.warm.menuActiveMs, r2.warm.menuActiveMs),
    transferKB: avg2(r1.warm.resources.totalTransferKB, r2.warm.resources.totalTransferKB),
  },
  pageErrors: r1.cold.pageErrors.concat(r2.cold.pageErrors),
};
// 逐 URL 归因表（round1，取进 Game 后的全量快照以覆盖两段）
const table = r1.cold.resourcesAfterGame.items
  .filter((i) => i.transferKB >= 1)
  .sort((a, b) => b.transferKB - a.transferKB);
console.log("\n=== Menu 前 / 暖装（点击前）/ 进房（点击后）传输拆账 ===");
console.log(`Menu 前 ${results.summary.cold.menuPhaseKB}KB，暖装 ${results.summary.cold.warmPhaseKB}KB，点击→Game ${results.summary.cold.postClickKB}KB（round1 明细，≥1KB）`);
// 快照时仍在飞的请求：transferSize 尚未落定（=0），不会进入上面任何 KB 列——只看这一行，别把"没下完"读成"没花字节"
console.log(`快照时仍在飞 ${results.summary.cold.pendingCount} 条：${(results.summary.cold.pendingUrlsRound1 ?? []).join(",") || "无"}`);
// r21 件1 的通过条件：循环曲不进落定门。null=进房快照时还在飞（连条目都没入表），同样是"门外"。
const la = results.summary.cold.loopArrivalAfterEntryMs;
console.log(`循环曲落点：${results.summary.cold.loopDeferred ? "门外（不挡进房）✓" : "门内（仍挡进房）✗"}  到齐时刻=进房后 ${la === null ? "快照时仍在飞" : `${la}ms`}（负=进房前已就绪）`);
// r23：三态照录，不判好坏——none 只说明"可玩那一刻条目还没入表"，窗口长度由 scripts/e2e/charsplay.mjs 量
const cg = results.summary.cold.charsPlayArrivalAfterGateMs;
console.log(`播放图集（chars-play）：快照内条目=${results.summary.cold.charsPlayInWindow}  落点=进房后 ${cg === null ? "快照时条目未入表" : `${cg}ms`}（负=进房前已就绪）`);
// r25：两支终局时刻曲的"可玩前过网字节"就是本轮的出口判据（门内≈面额 323.3KB／门后=0）
const tg = results.summary.cold.bgmTerminalArrivalAfterGateMs;
console.log(`终局时刻曲（Over+Finish）：快照内条目=${results.summary.cold.bgmTerminalInWindow}  可玩前过网=${results.summary.cold.bgmTerminalPreGateKB}KB  落点=进房后 ${tg === null ? "快照时条目未入表" : `${tg}ms`}（负=进房前已就绪）`);
for (const i of table) {
  console.log(`  ${String(i.transferKB).padStart(7)}KB→${String(i.decodedKB).padStart(8)}KB  ${i.phase.padEnd(4)} ${i.type.padEnd(7)} @${String(i.startMs).padStart(5)}-${String(i.endMs).padStart(5)}ms  ${i.url}`);
}
// 音轨拆账（r16 件A）：本档位实际下载的音轨清单与两段归属
const audioRows = r1.cold.resourcesAfterGame.items.filter(isAudio).sort((a, b) => a.phase.localeCompare(b.phase) || b.transferKB - a.transferKB);
console.log(`\n=== 音轨装载拆账（round1，档位 ${LEVEL}，${audioRows.length} 条 / ${kbOf(audioRows).toFixed(1)}KB）===`);
for (const i of audioRows) console.log(`  ${String(i.transferKB).padStart(7)}KB  ${i.phase.padEnd(4)} ${i.url}`);
if (results.summary.cold.audio.pendingRound1) console.log(`  快照时仍在飞：${results.summary.cold.audio.pendingRound1}`);
// 同一次导航内重复取回的 URL（r20）：**条数不是判据，第二次过网字节才是**。
// 基线本身就有 6 条重复——它们是二进制资产的 max-age=0 条件复验（staticGz 有意策略，
// 第二次只花几百字节头），属正常。真双载（preload 模式与消费方不一致时整份重下）由
// doubleDownload=第二次仍 >1KB 抓出，预取类改动以"这一列为空"为硬性通过条件。
const dups = r1.cold.resourcesAfterGame.dupUrls;
console.log(`\n=== 同一导航内重复取回的 URL（round1）===`);
if (!dups.length) console.log("  无（每个 URL 只取一次）");
for (const d of dups) {
  console.log(`  ${d.doubleDownload ? "⚠ 双载" : "复验"} ${d.n} 次（过网 ${d.wireFetches} 次，第二次起共 ${d.restKB}KB） ${d.url}`);
}
const dbl = dups.filter((d) => d.doubleDownload);
if (dbl.length) console.log(`  ⚠ 真双载 ${dbl.length} 个：同一资源在一次导航内整份下了两次（预取模式与消费方不一致的典型征兆）。`);

const bigByUrl = new Map(r1.cold.resourcesAfterGame.items.map((i) => [i.url, i.decodedKB]));
const uncom = r1.cold.headers.filter((h) => h.enc === "-" && (bigByUrl.get(h.url) ?? 0) >= 64);
console.log(`\n=== 未压缩且 ≥64KB 的响应（round1）===`);
for (const h of uncom) console.log(`  ${h.status} ${h.cc}  etag=${h.etag}  ${h.url}`);
const rv = results.summary.cold.revalProbe;
console.log(`\n=== 条件复验探测（round1，${rv.urls} 个幂等 URL）===`);
console.log(`  整份重下 ${rv.refetchKB}KB → 带 ETag 复验 ${rv.revalKB}KB（省 ${(rv.refetchKB - rv.revalKB).toFixed(1)}KB）`);
const bad = rv.notConditional304;
if (bad.length) console.log(`  ⚠ 未命中 304（${bad.length} 个，无 ETag 或服务器不支持条件请求）：${bad.join(", ")}`);
console.log(`\n=== 汇总（两轮均值）===`);
console.log(JSON.stringify(results.summary, null, 2));

if (argSave) {
  writeFileSync(join(RESULTS, `load-${argSave}.json`), JSON.stringify(results, null, 2));
  console.log(`已存档 load-${argSave}.json`);
}
if (argCompare) {
  const fp = join(RESULTS, `load-${argCompare}.json`);
  if (!existsSync(fp)) throw new Error(`快照不存在: ${fp}`);
  const base = JSON.parse(readFileSync(fp, "utf8"));
  const b = base.summary;
  const c = results.summary;
  console.log(`\n===== 对比：${argCompare}（${base.meta.git}）→ 当前（${results.meta.git}）=====`);
  console.log(`冷启动 Menu active : ${b.cold.menuActiveMs}ms → ${c.cold.menuActiveMs}ms`);
  console.log(`冷启动传输（Menu） : ${b.cold.transferKB}KB → ${c.cold.transferKB}KB`);
  console.log(`冷启动请求数       : ${b.cold.requests} → ${c.cold.requests}`);
  console.log(`点击建房→Game     : ${b.cold.gameActiveAfterClickMs}ms → ${c.cold.gameActiveAfterClickMs}ms`);
  console.log(`进 Game 累计传输   : ${b.cold.transferKBAfterGame}KB → ${c.cold.transferKBAfterGame}KB`);
  // r15 起新字段：旧快照无对应值，打 "-" 兼容（口径同 perf-client r7r）
  const p = (k) => `${b.cold[k] ?? "-"} → ${c.cold[k] ?? "-"}`;
  console.log(`其中 Menu 前传输    : ${p("menuPhaseKB")}`);
  console.log(`其中暖装(点击前)    : ${p("warmPhaseKB")}`);
  console.log(`其中点击→Game 传输: ${p("postClickKB")}`);
  console.log(`快照时仍在飞(条)  : ${p("pendingCount")}`);
  console.log(`循环曲是否出闸    : ${b.cold.loopDeferred === undefined ? "-" : `${b.cold.loopDeferred ? "门外" : "门内"}`} → ${c.cold.loopDeferred === undefined ? "-" : c.cold.loopDeferred ? "门外" : "门内"}`);
  console.log(`其中非 Menu 合计    : ${p("gamePhaseKB")}`);
  const bRv = b.cold.revalProbe;
  console.log(`条件复验探测      : ${bRv ? `${bRv.refetchKB}KB→${bRv.revalKB}KB` : "-"} → ${c.cold.revalProbe ? `${c.cold.revalProbe.refetchKB}KB→${c.cold.revalProbe.revalKB}KB` : "-"}`);
  const fmtA = (a) => (a ? `${a.count}条/${a.totalKB}KB（暖装 ${a.warmKB ?? "-"}KB·进房 ${a.postKB ?? "-"}KB）` : "-");
  console.log(`音轨装载          : ${fmtA(b.cold.audio)} → ${fmtA(c.cold.audio)}`);
  // 条数不是判据（基线本就有 6 条 max-age=0 复验）；真双载看 doubleDownloads。
  const fmtDup = (cold) => (cold.dupUrls === undefined ? "-" : cold.dupUrls.length === 0 ? "无" : `${cold.dupUrls.length} 个重复（其中真双载 ${(cold.doubleDownloads ?? []).length} 个）`);
  console.log(`重复取回 URL      : ${fmtDup(b.cold)} → ${fmtDup(c.cold)}`);
  const newDbl = (c.cold.doubleDownloads ?? []).filter((u) => !(b.cold.doubleDownloads ?? []).includes(u));
  if (newDbl.length) console.log(`⚠ 新增真双载：${newDbl.join(", ")}——同一资源一次导航内整份下两次，预取模式与消费方不一致的征兆`);
  if (base.meta.level && results.meta.level && base.meta.level !== results.meta.level) {
    console.log(`⚠ 档位不同：基线 ${base.meta.level} vs 当前 ${results.meta.level}（字节类指标不可直接比）`);
  }
  const bNet = base.meta.net ?? "off", cNet = results.meta.net ?? "off";
  if (bNet !== cNet) {
    console.log(`⚠ 节流档不同：基线 ${bNet} vs 当前 ${cNet}——ms 类跨档不可比，只有字节账可比`);
  }
  const cTh = c.throttle;
  if (cTh && cTh.checked) {
    console.log(`节流生效自检     : ${cTh.profile} 已过——墙钟延迟探针 ${cTh.latencyWallMs}ms（RT TTFB 中位 ${cTh.ttfbMedianMs}ms 仅作排队附注），` +
      `最大单笔 ${cTh.largestKB}KB→${cTh.largestUrl} 体耗时 ${cTh.largestBytesMs}ms，过网窗 ${cTh.windowMs}ms`);
  }
  console.log(`reload Menu active : ${b.warmReload.menuActiveMs}ms → ${c.warmReload.menuActiveMs}ms`);
  console.log(`reload 传输        : ${b.warmReload.transferKB}KB → ${c.warmReload.transferKB}KB`);
  if (c.pageErrors.length) { console.log(`⚠ 页面错误：${c.pageErrors.join("; ")}`); process.exitCode = 1; }
}
