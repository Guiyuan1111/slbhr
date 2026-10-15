/**
 * F4 音频响度保真基准（2026-10-09 音频轮）。
 *
 * 原版口径（bundle 实测，init.eb02fbdab2aa1d24.js）：
 *   - boot 处 `game.sound.volume = 0.1`——Phaser 2 SoundManager 全局主音量，所有键一致 ×0.1；
 *   - 逐键默认 1.0（playInstance 不传音量），仅三处显式覆写：
 *       waterSteps = 0.5（@1868233）、portalLoop = 0.3（@1951660 附近）、wind = 0.2（@1968490 附近）。
 *
 * 我方口径：Phaser 3 `game.sound.volume` 同语义主音量 + 逐键相对音量，本基准对表：
 *   1) 静态解析客户端源码：master 常量 + sfx()/play() 逐键音量（缺省 = 1.0）；
 *   2) 运行时探针：起服开页读 `__fw.sound.volume`（无音圈环境 headless 只读不播）。
 *
 * 用法（Git Bash，先 `export PATH="$PWD/TEMP/node:$PATH"`）：
 *   node benchmark/audio-loudness.mjs              # 跑分打印
 *   node benchmark/audio-loudness.mjs --save f4    # 结果存 benchmark/results/audio-f4.json
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const saveTag = args.includes("--save") ? args[args.indexOf("--save") + 1] : null;

// ---------- 原版参考表（bundle 提取，勿凭记忆改） ----------
const REF = {
  master: 0.1,
  overrides: { sfx_water_steps: 0.5, sfx_wind: 0.2 }, // portalLoop 0.3 对应机关联机版未用，无键
};

// ---------- 静态解析我方源码 ----------
const SOURCES = [
  "packages/client/src/main.ts",
  "packages/client/src/scenes/GameScene.ts",
  "packages/client/src/scenes/TempleScene.ts",
  "packages/client/src/scenes/MenuScene.ts",
  "packages/client/src/scenes/menus.ts",
];
const table = {}; // key -> { volume, file }
let master = null;
for (const rel of SOURCES) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  const mm = src.match(/phaser\.sound\.volume\s*=\s*([0-9.]+)/);
  if (mm) master = Number(mm[1]);
  const re = /\.(?:sfx|play)\(\s*"([A-Za-z0-9_]+)"\s*(?:,\s*\{([^}]*)\})?/g;
  let m;
  while ((m = re.exec(src))) {
    const key = m[1];
    if (!key.startsWith("sfx_") && !key.startsWith("bgm_")) continue;
    const vm = m[2]?.match(/volume:\s*([0-9.]+)/);
    table[key] = { volume: vm ? Number(vm[1]) : 1.0, file: rel.split("/").pop() };
  }
}

// ---------- 对表 ----------
const rows = [];
for (const [key, info] of Object.entries(table)) {
  const ref = REF.overrides[key] ?? 1.0;
  rows.push({ key, ours: info.volume, ref, ok: Math.abs(info.volume - ref) < 1e-9, file: info.file });
}
const masterOk = master !== null && Math.abs(master - REF.master) < 1e-9;
// 动态键名（三元表达式）静态正则抓不到：跳跃音效单独查"任何调用点带 volume 即失配"
const jumpSrc = readFileSync(join(ROOT, "packages/client/src/scenes/GameScene.ts"), "utf8");
const jumpVol = /sfx_jump_(?:fb|wg)"\s*,\s*\{[^}]*volume/.test(jumpSrc);
rows.push({ key: "sfx_jump_fb|wg", ours: jumpVol ? "(有 volume 参)" : 1.0, ref: 1.0, ok: !jumpVol, file: "GameScene.ts(动态键)" });
const bad = rows.filter((r) => !r.ok);
const result = {
  meta: { generatedAt: new Date().toISOString(), note: "F4 响度对齐：原版 master 0.1 + waterSteps .5 / wind .2，其余 1.0" },
  master: { ours: master, ref: REF.master, ok: masterOk },
  keys: rows,
  pass: masterOk && bad.length === 0,
};
console.log(`master: ours=${master} ref=${REF.master} ${masterOk ? "OK" : "MISMATCH"}`);
for (const r of rows) console.log(`  ${r.ok ? "✓" : "✗"} ${r.key.padEnd(18)} ours=${r.ours} ref=${r.ref} (${r.file})`);
console.log(result.pass ? `PASS：${rows.length} 键全对齐` : `FAIL：${bad.length} 键失配 → ${bad.map((b) => b.key).join(", ")}`);

// ---------- 运行时 master 验证（只读，不入房不触发播放） ----------
if (args.includes("--runtime")) {
  const { chromium } = await import("playwright");
  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, ["--import", "tsx", "packages/server/src/index.ts"], {
    cwd: ROOT, env: { ...process.env, PORT: "2569" }, stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("server timeout")), 30000);
    const ondata = (s) => { if (String(s).includes("2569") || String(s).includes("http+ws")) { clearTimeout(t); res(); } };
    child.stdout.on("data", ondata);
    child.stderr.on("data", ondata);
  });
  try {
    const browser = await chromium.launch({ channel: process.env.FW_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined), headless: true, args: ["--mute-audio"] });
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:2569/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(`(() => { try { return !!window.__fw && !!window.__fw.sound; } catch { return false; } })()`, null, { timeout: 60000 });
    // WebAudio 挂起态下 gain.value 不反映 t=0 的 setValueAtTime 调度——先派发手势解锁再读
    await page.evaluate(`(() => { document.body.dispatchEvent(new Event("mousedown")); return true; })()`);
    await page.waitForFunction(`(() => { try { return window.__fw.sound.context.state === "running"; } catch { return false; } })()`, null, { timeout: 10000 }).catch(() => {});
    const rt = await page.evaluate(`(() => { try { return { volume: window.__fw.sound.volume, ctx: window.__fw.sound.context.state }; } catch (e) { return { err: String(e) }; } })()`);
    if (rt && typeof rt.volume === "number") rt.ok = Math.abs(rt.volume - REF.master) < 1e-3;
    console.log("runtime master:", JSON.stringify(rt));
    result.runtime = rt;
    await browser.close();
  } finally {
    child.kill();
  }
}

if (saveTag) {
  const out = join(ROOT, "benchmark", "results", `audio-${saveTag}.json`);
  writeFileSync(out, JSON.stringify(result, null, 1));
  console.log("已保存 →", out);
}
process.exit(result.pass ? 0 : 1);
