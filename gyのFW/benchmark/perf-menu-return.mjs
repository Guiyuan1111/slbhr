/**
 * 开始界面独占四图的交还/重取代价量具（r43）。
 *
 * 面：perf-resident 只看驻留（房内/选关少了多少），看不到 r43 的代价侧——离房后重进 Menu
 * 要把 5.58MiB 解码的纹理重新装回。本量具在同一个页面里做 cycles 轮：
 *   Menu（四图在位）→ 直开 Temple（Menu SHUTDOWN 交还）→ 直开 Menu（preload 重取）
 * 每轮记录 ① 交还后四键是否真的不在、纹理总账；② 重取墙钟（scene.start → Menu RUNNING
 * 且四键纹理全部在位）；③ 重取期间四张图的 PerformanceResourceTiming（transferSize=0 即
 * 命中 immutable 磁盘缓存）。直开场景跳过 1s 黑幕包络，读数只含装载+解码+首帧，不含
 * 固定的转场时长。
 *
 * 口径注：场景内 `getScene("Menu").scene.start("Temple")` 与 Play 按钮的 ops 相同
 * （MenuScene 的 pointerup → fadeSwitch → scene.start("Temple")），只是不经黑幕；
 * 返回方向同理（TempleScene BackButton → fadeSwitch → scene.start("Menu")）。
 *
 * 用法：
 *   node --import tsx benchmark/perf-menu-return.mjs [--cycles 4] [--port 3569] --save <label>
 *   node --import tsx benchmark/perf-menu-return.mjs --compare <label> --no-build [--net off]
 * 产物：benchmark/results/menu-return-<label>.json
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { log, startServer } from "../scripts/e2e/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(ROOT, "benchmark", "results");
const argv = process.argv.slice(2);
const argOf = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const CYCLES = Number(argOf("cycles", "4"));
const PORT = Number(argOf("port", "3569"));
const argSave = argOf("save", undefined);
const argCompare = argOf("compare", undefined);
const NO_BUILD = argv.includes("--no-build");
const NET_PROFILES = {
  off: { latency: 0, down: -1, up: -1 },
  "4g": { latency: 80, down: 500_000, up: 125_000 },
  fast3g: { latency: 150, down: 200_000, up: 93_750 },
  slow3g: { latency: 400, down: 62_500, up: 62_500 },
};
const NET_NAME = argOf("net", "off");
if (!Object.hasOwn(NET_PROFILES, NET_NAME)) {
  throw new Error(`--net 档位未知：${NET_NAME}（可用：${Object.keys(NET_PROFILES).join("/")}）`);
}
const NET = NET_PROFILES[NET_NAME];
const KEYS = ["TempleHall", "Beam", "GameName", "KiziLogo"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!NO_BUILD) {
  log("构建客户端…");
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
}

/** 页内：纹理总账 + 四键状态（只读） */
function probe() {
  const g = globalThis.__fw;
  const texMB = {};
  let total = 0;
  for (const key of Object.keys(g.textures.list)) {
    const t = g.textures.list[key];
    let b = 0;
    for (const s of Object.values(t.source || {})) {
      const img = s && s.image;
      if (img && img.width) b += img.width * img.height * 4;
    }
    total += b;
    if (["TempleHall", "Beam", "GameName", "KiziLogo", "menu", "chars", "temple", "ground"].includes(key)) {
      texMB[key] = +(b / 1048576).toFixed(2);
    }
  }
  const four = {};
  let fourMB = 0;
  for (const k of ["TempleHall", "Beam", "GameName", "KiziLogo"]) {
    four[k] = g.textures.exists(k) ? 1 : 0;
    fourMB += texMB[k] ?? 0;
  }
  return {
    texMB: +(total / 1048576).toFixed(2),
    fourMB: +fourMB.toFixed(2),
    big: texMB,
    four,
    tree: globalThis.__fwTreeStats?.() ?? null,
  };
}

const server = await startServer(PORT, {});
const browser = await chromium.launch({
  headless: true,
  args: ["--mute-audio", "--enable-precise-memory-info", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
});
const errs = [];
const cycles = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  if (NET_NAME !== "off") {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: NET.latency,
      downloadThroughput: NET.down,
      uploadThroughput: NET.up,
    });
    log(`节流：${NET_NAME}（${NET.latency}ms · ${NET.down}B/s↓）`);
  }
  await page.goto(`http://127.0.0.1:${PORT}/?level=forest_01`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__fw?.scene?.isActive("Menu"), null, { timeout: 30000, polling: 20 });
  await page.waitForFunction(() => globalThis.__fw?.textures?.exists("ground"), null, { timeout: 30000, polling: 50 });
  await sleep(600);

  for (let i = 0; i < CYCLES; i++) {
    const before = await page.evaluate(probe);
    // 交还：等价 Play（fadeSwitch 的 ops 就是 scene.start("Temple")），跳过 500ms 黑幕
    await page.evaluate(() => globalThis.__fw.scene.getScene("Menu").scene.start("Temple"));
    await page.waitForFunction(() => globalThis.__fw.scene.isActive("Temple"), null, { timeout: 20000, polling: 20 });
    // 选关树烘焙会与重取抢解码线程：等它落定（首轮冷烘，后续命中）
    await page
      .waitForFunction(
        () => globalThis.__fw.textures.exists("tree-all") && (globalThis.__fwTreeStats?.()?.jobs ?? 0) === 0,
        null,
        { timeout: 30000, polling: 60 },
      )
      .catch(() => {});
    await sleep(300);
    const releasedState = await page.evaluate(probe);

    // 重取：等价 BackButton（fadeSwitch 的 ops 就是 scene.start("Menu")），跳过 500ms 黑幕
    await page.evaluate(() => {
      performance.clearResourceTimings();
      globalThis.__mrT0 = performance.now();
      globalThis.__fw.scene.getScene("Temple").scene.start("Menu");
    });
    let reloadMs = null;
    try {
      await page.waitForFunction(
        () =>
          globalThis.__fw.scene.isActive("Menu") &&
          ["TempleHall", "Beam", "GameName", "KiziLogo"].every((k) => globalThis.__fw.textures.exists(k)),
        null,
        { timeout: 30000, polling: 10 },
      );
      reloadMs = await page.evaluate(() => +(performance.now() - globalThis.__mrT0).toFixed(1));
    } catch {
      /* 超时按 null 记 */
    }
    const res = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .filter((e) => e.name.includes("/assets/images/"))
        .map((e) => ({
          name: e.name.replace(/^https?:\/\/[^/]+/, ""),
          ms: +e.duration.toFixed(1),
          transfer: e.transferSize ?? -1,
          encoded: e.encodedBodySize ?? -1,
          decoded: e.decodedBodySize ?? -1,
        })),
    );
    await sleep(250);
    const after = await page.evaluate(probe);
    const c = {
      cycle: i + 1,
      menuTexMB: before.texMB,
      menuFourMB: before.fourMB,
      releasedTexMB: releasedState.texMB,
      releasedFourMB: releasedState.fourMB,
      reloadedTexMB: after.texMB,
      reloadedFourMB: after.fourMB,
      released: releasedState.four,
      reloaded: after.four,
      reloadMs,
      resources: res,
      imagesTransfer: res.reduce((s, r) => s + Math.max(0, r.transfer), 0),
    };
    cycles.push(c);
    log(
      `轮${i + 1}  驻留 ${before.texMB} → ${releasedState.texMB} → ${after.texMB}MB` +
        `（四图 ${before.fourMB} → ${releasedState.fourMB} → ${after.fourMB}MB）` +
        `  重取 ${reloadMs}ms  请求 ${res.length} 笔/传输 ${c.imagesTransfer}B`,
    );
  }

  await page.screenshot({ path: join(RESULTS, `menu-return-${argSave ?? "run"}.png`) });
  await ctx.close();
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

if (errs.length) {
  log("页面错误（失败）：", errs.join("; "));
  process.exit(1);
}

const ms = cycles.map((c) => c.reloadMs).filter((v) => typeof v === "number");
const summary = {
  cycles: cycles.length,
  releasedAll: cycles.every((c) => Object.values(c.released).every((v) => v === 0)),
  reloadMsMedian: ms.length ? +[...ms].sort((a, b) => a - b)[Math.floor(ms.length / 2)].toFixed(1) : null,
  reloadMsMax: ms.length ? Math.max(...ms) : null,
  imagesTransferMedian: cycles.length
    ? +[...cycles.map((c) => c.imagesTransfer)].sort((a, b) => a - b)[Math.floor(cycles.length / 2)].toFixed(0)
    : null,
};
const snapshot = {
  meta: {
    label: argSave ?? null,
    git: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    date: new Date().toISOString(),
    node: process.version,
    net: NET_NAME,
    note:
      "reloadMs=scene.start('Menu')→Menu RUNNING 且四键纹理在位的墙钟（不含 500ms 黑幕包络）；" +
      "released/reloaded=four texture exists flags; imagesTransfer=sum(transferSize) over the four images in that window (0=immutable disk cache hit);" +
      "texMB=textures.list 逐源 w·h·4 总账（含透明边距）",
  },
  summary,
  cycles,
};
if (argSave) {
  writeFileSync(join(RESULTS, `menu-return-${argSave}.json`), JSON.stringify(snapshot, null, 2));
  log(`快照：results/menu-return-${argSave}.json`);
}
if (argCompare) {
  const p = join(RESULTS, `menu-return-${argCompare}.json`);
  if (!existsSync(p)) {
    log(`对比快照不存在: ${p}`);
    process.exit(1);
  }
  const prev = JSON.parse(readFileSync(p, "utf8"));
  console.log("\n[menu-return] 前后对比（负值/更小=更省）");
  for (const k of ["cycles", "releasedAll", "reloadMsMedian", "reloadMsMax", "imagesTransferMedian"]) {
    console.log(`  ${k.padEnd(22)} ${String(prev.summary[k]).padStart(8)} → ${String(summary[k]).padStart(8)}`);
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  for (const key of ["menuTexMB", "menuFourMB", "releasedTexMB", "releasedFourMB", "reloadedTexMB", "reloadedFourMB"]) {
    console.log(
      `  ${key.padEnd(22)} ${String(+mean(prev.cycles.map((c) => c[key])).toFixed(2)).padStart(8)} → ${String(+mean(cycles.map((c) => c[key])).toFixed(2)).padStart(8)}`,
    );
  }
}
