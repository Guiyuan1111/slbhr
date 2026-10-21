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
//   ⑤ 真路径（不停答）也收敛：房间可玩后若干秒内十一式齐、零缺帧警告、零花屏。
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { enterAs, log, runInputs, startServer, waitForStarted } from "./lib.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PORT = Number(process.argv[2] || 3611);
const LEVEL = process.argv[3] || "forest_01";
/** 停答上限：窗口实际由 `release()` 提前结束，这个数只是"探针抛错也不吊死"的保险丝 */
const STALL = Number(process.argv[4] || 60000);

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

const mkCtx = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  return { ctx, page };
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
  const code = await enterAs(A.page, PORT, "create", "", LEVEL);
  await enterAs(B.page, PORT, "join", code, LEVEL);
  await waitForStarted(A.page);
  await waitForStarted(B.page);

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
  await waitAnims(A.page, true, 25000);
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

  // ── 用例二：真路径（不停答）也必须收敛（⑤）──
  const C = await mkCtx();
  const D = await mkCtx();
  watch("C", C.page);
  watch("D", D.page);
  const code2 = await enterAs(C.page, PORT, "create", "", LEVEL);
  await enterAs(D.page, PORT, "join", code2, LEVEL);
  await waitForStarted(C.page);
  await waitForStarted(D.page);
  await waitAnims(C.page, false, 25000).catch(() => {});
  await C.page.waitForTimeout(800);
  const s4 = await snapshot(C.page);
  check("真路径（不停答）十一式收敛", s4.registeredCount === PLAY_KEYS.length, `registered=${s4.registeredCount} hasPlay=${s4.hasPlay}`);
  check("真路径零花屏、零缺帧警告", s4.badPainted.length === 0 && warns.length === 0, `bad=${JSON.stringify(s4.badPainted)} warns=${warns.join("; ")}`);
  check("真路径页面零错误", errs.length === 0, errs.join("; "));
  await C.ctx.close();
  await D.ctx.close();
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
log(fail ? `charsplay: ${fail} 项 FAIL（Missing animation 计数=${missingAnim.length}）` : `charsplay: ALL PASS（窗口期良性降级取证 ${missingAnim.length} 条）`);
process.exit(fail ? 1 : 0);
