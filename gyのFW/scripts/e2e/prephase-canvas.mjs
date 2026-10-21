/**
 * 前场（pre-room）画布逐像素对拍（r18 门禁件）。
 *
 * 为什么要有它：下一轮要把中文位图字（assets/fonts/chinese/font.png 全量 2191×1024、
 * font.fnt 声明 260 字）拆成两阶段——Menu/加载/选关先取按字框预裁的子集，游戏内文本再取全量。
 * 子集是从官方 font.png 把声明字框逐字节保留、其余像素清零得到的。现役三道门禁都看不见这条路径：
 *   scripts/e2e/domskin.mjs    截屏前 `#game-root{display:none}`，只证 DOM 石板皮；
 *   benchmark/visual-diff.mjs  比的是**游戏内**画布对原版，且隐藏 #hud/#menu/#toast；
 *   scripts/e2e/journey.mjs    只读 DOM textContent。
 * 于是"画布里"渲染的中文（Menu 的「开始游戏」、选关数字、「设置」「制作人员」面板）一旦少一个字框
 * 或空白化过切，用户看到的就是字面上的一个洞——今天三套门禁全绿。本工具补的就是这块盲区。
 *
 * 口径：**只拍 #game-root 里的 canvas 元素**。视口 1280×960 恰为画布原生尺寸（FIT 1:1、
 * deviceScaleFactor 1、无浏览器重采样），截屏前断言 cw/ch/style.w/sh 四项（视口被改动时宁可
 * 报错也不悄悄引入重采样）；DOM 覆盖层整层隐藏——#menu 石板幕布带 backdrop-filter，
 * Playwright 元素截图取的是页面合成结果，不摘掉就会把幕布模糊合成进"画布像素"里。
 *
 * 确定性（本门禁的命门，两处随机源都得锁）：
 *  1) 世界时钟。MenuScene.update 每帧 `t += 0.003` 推 8 道光柱的旋转/下探/宽脉冲与 4 支蜡烛的
 *     双频 lissajous（scenes/MenuScene.ts:170-190），角色 head_idle 按累积 delta 推帧（30fps，
 *     BootScene.ts:159）；而主循环是 setTimeout 墙钟驱动（main.ts:682 forceSetTimeOut），
 *     delta 还要过 TimeStep.smoothDelta 的 10 帧滑动平均（node_modules/phaser/src/core/TimeStep.js:563）
 *     ——同一版本两次跑到"第 N 帧"的相位并不相同。benchmark/visual-diff.mjs 在原版侧靠物理步计数
 *     钩子取第 60 帧（:111 INSTALL_HOOK），我方侧却只是 started 后睡 1000ms（:211），所以 r17 只能
 *     "三跑取带顶抖动"。本门禁不接受带：把 Phaser 的自驱动彻底掐掉（raf.start / loop.wake /
 *     loop.step 三路封死，见 DRIVER），此后世界只按页内 __ppStep 喂的合成时钟前进，
 *     每步固定 1000/60ms 并显式推进 loop.time/now/delta/rawDelta/frame，再调 Game.step
 *     （其内含 preRender→render→postRender，src/core/Game.js:474）。相位=步数，逐拍可复现。
 *     注：装载仍是真实下载/解码（不跳过任何资源），Loader 是事件驱动、不依赖主循环，
 *     故"等素材到齐"用真实时间轮询、"推进画面"用合成步数，两者互不污染；
 *     截图时刻一律锚在"某场景活动后第 N 步"，因此装载快慢不改变像素。
 *  2) 创建期随机。MenuScene.create 用 Math.random 定光柱 alpha/tOffset/tSpeed 与蜡烛轨道参数
 *     （:63/:65/:66/:113-120，共 8×3+4×7=52 次取值），原版即随机，不改产品代码。故 addInitScript
 *     把 Math.random 换成固定种子 mulberry32（Phaser 的 Math.RND 缺省种子同样取自 Math.random，
 *     一并落定）。基线与对拍同种子 ⇒ 同相位。
 *     ⚠ 代价要说清：若日后改动让 Menu.create 之前多/少消耗一次 Math.random，本门禁会因随机流错位
 *     而误报（像素变了但不是字坏了）。届时 `--save` 重刷并在当轮报告写明原因，不得静默放容差。
 *  3) 玩家档案。进度都在 localStorage（progress.ts 三键），上下文全新即"首进玩家"（选关树只有
 *     initial 节点可玩）。temple-numbers 态要的是 48 枚 `String(lv.id)` 数字全显影，故预置一份
 *     满通关存档（写的是产品自己的存储键，不是新钩子）；其余四态沿用首进档案。
 *
 * 覆盖态（编舞全部走真实点击，与玩家同路径；每态独立浏览器上下文⇒进度默认全新、
 * 模板烘焙缓存不共享，态间零污染；档案预置只在 temple-numbers 一处，见下）：
 *   menu            Menu 场景：双角色 idle + 「开始游戏」72 号位图字 + 光柱/蜡烛
 *   temple          选关树：tree 三层烘焙贴图 + 节点/锁帧 + 「返回」「显示关卡数」
 *   temple-numbers  连点两次「显示关卡数」后的 48 枚 String(lv.id) 数字（0-9 全数码，拆字子集主靶心；
 *                   预置满通关档案才全显，temple 态则保留首进档案的锁链原貌）
 *   settings        「设置」面板：设置/音乐/音效/好的（叠于 Menu 之上，含黑幕 alpha）
 *   credits         「制作人员」面板：5 行名单 + 好的
 * 不覆盖（做不到确定量，宁缺）：
 *   Boot 加载画面——LoaderBar 的 crop 宽度 = `this.load.progress`（BootScene.ts:135），
 *     是墙钟装载完成度，同版本两次截图的进度条长度必然不同；
 *   FadeScene「Loading...」——create 里 500ms 淡入完成即置 switched（transition.ts:50-56），
 *     而文字要 800ms 后才显（:74），我方换屏路径上它恒不显影，拍了也只是拍黑幕；
 *   游戏内画面/HUD——visual-diff.mjs 已有对标原版的口径，此处不重复造轮子。
 *
 * 判据：基线 PNG 字节 SHA-256 相等为 PASS，不等即 FAIL 并打印像素 AE 与差图路径（TEMP/r18-canvas/）。
 * 不设容差、不做 fuzz——前场中文的任何像素变化都该被人看过再入账。
 * --save 另做"非空画布"体检（magick %k 唯一色数）：全黑/全白的截屏能自洽通过后续对拍，
 * 却是个假门禁，必须在生成基线时就拦住。
 *
 * 产物指纹（本门禁的第二条命）：像素是 **packages/client/dist 里那份已构建产物** 的行为，不是 HEAD 的行为。
 * 故本工具刻意不跑构建——并发开发期重建 dist 会把别人未完工的代码烧进基线（r18 生成时正是这种局面：
 * HEAD 已越过两段化提交 90fe319，而 dist 入口 chunk 里查不到 font-prephase 引用、dist 字体目录只有
 * font.png，说明读到的仍是全量代产物）。为此每次运行都登记入口 chunk 与字体 PNG 的 SHA-256 前缀，
 * 写进 manifest.bundle；对拍时若指纹变了，先打印"产物已更换"再报像素差异，
 * 免得把"换了一份 dist"误读成"环境噪声"。基线该由哪份产物复现，看 manifest 即可，不必猜。
 * --save 还会把"哪几份产物复现过同一批字节"累积成 manifest.bundlesVerified（首捕产物/上一批产物/本次产物，
 * 三者指纹去重），并逐态核对新旧 SHA——只在全等时才并列，作为无损证据。
 * 实测（r18）：首捕那份是全量代产物；随后 dist 被重建为两段化代（入口 chunk 出现 font-prephase 引用、
 * 字体目录多出 font-prephase.png），同一编舞重跑，五态 SHA 一字不变——拆字在前场画布上无损，
 * 这条结论就是这个门禁存在的意义，也是它第一次派上用场。
 *
 * 用法：
 *   node scripts/e2e/prephase-canvas.mjs --save    # 生成/刷新基线（benchmark/results/prephase-canvas/）
 *   node scripts/e2e/prephase-canvas.mjs --save --reason "换代理由"   # 像素与上一批不同时**必须**给理由
 *     （换代三步：留差图 → 写清机制 → 刷基线。理由直接写进 manifest.provenance，
 *      免得只有报告里有一句、基线这边看不出是谁在什么时候为什么换的值）
 *   node scripts/e2e/prephase-canvas.mjs         # 对拍现役实现与基线（连续两次都全等才算确定）
 *   FW_PREPHASE_PORT=3631 ...                    # 换端口（缺省 3631，避开 domskin 3611/其余工具默认口）
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { log, startServer } from "./lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "benchmark", "results", "prephase-canvas");
/** 差图只落 TEMP（不入库），失败时打印路径供人工比对 */
const SCRATCH = join(ROOT, "TEMP", "r18-canvas");
const SAVE = process.argv.includes("--save");
const rIdx = process.argv.indexOf("--reason");
const REASON = rIdx >= 0 ? process.argv[rIdx + 1] : null;
if (rIdx >= 0 && (!REASON || REASON.startsWith("--"))) throw new Error("--reason 需要一句文字（为什么这批像素与上一批不同）");
const PORT = Number(process.env.FW_PREPHASE_PORT ?? 3631);
/** 基线所属代=拆字之前的全量 font.png 一代；代不由 HEAD 判，由 dist 产物指纹判（见 bundleFp） */
const BASELINE_COMMIT = "851f0a2";
/** 字体两段化写进 client 代码的提交（产物指纹里查 font-prephase 引用就是冲它判代） */
const POST_SPLIT_COMMIT = "90fe319";
/**
 * 首捕产物（实测登记，不是猜的）：本批五态字节第一次由 packages/client/dist 的这份产物产出——
 * 入口 chunk 里没有 font-prephase 引用、字体目录只有 font.png，即"拆字前"的全量装载一代
 * （其 client 代码与 851f0a2 逐字节同：git diff 851f0a2 90fe319~1 -- packages/client 为空）。
 * 之后 dist 被重建为两段化产物，同一编舞重跑，五态 SHA 一字不变（见 manifest.bundlesVerified）。
 * 换 dist 不改这几个串；若哪天 --save 的产物指纹与它不同，manifest 会把两份都列出来，
 * 谁在哪个产物上复现过什么，一目了然。
 */
const FIRST_CAPTURE_BUNDLE = {
  chunk: "index-CJqW9TNF.js",
  chunkSha: "b8f19d5a06d02ca3",
  fonts: { "font.png": "24800f35d619d57a" },
  fontEra: `全量 font.png 一代（${BASELINE_COMMIT} 代 client 代码）`,
};
/** 合成时钟步长（ms）：与 fps.target=60 同值，保证与真实运行时的缺省节奏一致 */
const STEP_MS = 1000 / 60;
/** Math.random 替换为 mulberry32 的固定种子（改它=换相位=换基线） */
const RNG_SEED = 0x5eed1e;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 页内驱动器（addInitScript，早于业务模块执行）。
 * 三路封死 Phaser 自驱动：raf.start 不再被排程、loop.wake 变空操作（main.ts:261/450 的
 * setBusy/enterGame 会 wake）、loop.step 变空操作（兜住一切漏网的 tick）。
 * __fw 用 defineProperty 拦截赋值点（main.ts:692）——构造函数已启动主循环，但赋值发生在
 * 同一同步任务内，setter 触发时循环尚未跑过任何一步，故 Menu 之前不存在"墙钟步"污染。
 */
function driver({ seed, stepMs, progress }) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = rand;

  if (progress) {
    // 写产品自己的存储键（progress.ts:24-26），等价于老玩家回访，不新增任何运行时钩子
    localStorage.setItem("fw-temple-progress-v1", JSON.stringify(progress.best));
    localStorage.setItem("fw-played-v1", JSON.stringify(progress.played));
    localStorage.setItem("fw-gamecomplete-v1", "1");
  }

  const pp = {
    clock: 0,
    counts: {},
    steps: 0,
    game: null,
    armed: "",
  };
  globalThis.__pp = pp;

  const arm = (g) => {
    pp.game = g;
    g.loop.sleep();
    g.loop.raf.start = () => {};
    g.loop.wake = () => {};
    g.loop.step = () => {};
    pp.armed = `renderer=${g.renderer ? g.renderer.name : "未就绪"} paused=${g.isPaused}`;
  };
  let captured;
  Object.defineProperty(globalThis, "__fw", {
    configurable: true,
    enumerable: true,
    get: () => captured,
    set: (g) => {
      captured = g;
      arm(g);
    },
  });

  /** 走 n 步合成时钟（一步 = 一次 Game.step，含渲染）；同时给每个"本步处于活动"的场景计数 */
  pp.step = (n) => {
    const g = pp.game;
    if (!g) return false;
    for (let i = 0; i < n; i++) {
      pp.clock += stepMs;
      pp.steps++;
      const L = g.loop;
      L.now = pp.clock;
      L.time = pp.clock;
      L.delta = stepMs;
      L.rawDelta = stepMs;
      L.frame++;
      g.step(pp.clock, stepMs);
      for (const sc of g.scene.getScenes(true)) {
        const k = sc.scene.key;
        pp.counts[k] = (pp.counts[k] || 0) + 1;
      }
    }
    return true;
  };
  pp.count = (k) => pp.counts[k] || 0;
  pp.active = (k) => !!pp.game && pp.game.scene.isActive(k);
  pp.info = () => {
    const g = pp.game;
    const cv = document.querySelector("#game-root canvas");
    return {
      armed: pp.armed,
      steps: pp.steps,
      paused: !!g.isPaused,
      scenes: g.scene.getScenes(true).map((sc) => sc.scene.key),
      cw: cv.width,
      ch: cv.height,
      styleW: parseFloat(cv.style.width) || cv.width,
      styleH: parseFloat(cv.style.height) || cv.height,
    };
  };
  /** 纹理/字帧是否已到齐（不 pump 也能到齐：Loader 事件驱动）——面板要用的 popup 靠 Menu 暖装 */
  pp.texReady = (specs) =>
    specs.every(([tex, frame]) => {
      if (!pp.game.textures.exists(tex)) return false;
      const t = pp.game.textures.get(tex);
      return frame ? t.has(frame) : true;
    });
  /**
   * 取可点对象中心（场景系=画布系，视口 1:1）。
   * kind=text 找 BitmapText（.text 相等）、kind=frame 找 Image/Sprite（frame 名相等）、
   * kind=pos 直接用给定坐标（Menu 的「开始游戏」是无图 Zone，只能按源码坐标点：MenuScene.ts:93）。
   */
  pp.center = (sceneKey, kind, arg) => {
    const sc = pp.game.scene.getScene(sceneKey);
    if (!sc) throw new Error(`场景不存在 ${sceneKey}`);
    if (kind === "pos") {
      const [x, y] = arg.split(",").map(Number);
      return { x, y };
    }
    const list = sc.children ? sc.children.list : [];
    const hit = list.find((o) => (kind === "text" ? o.type === "BitmapText" && o.text === arg : o.frame && o.frame.name === arg));
    if (!hit) {
      const all = list.map((o) => `${o.type}:${o.frame ? o.frame.name : o.text ?? "-"}`).join(" | ");
      throw new Error(`${sceneKey} 里找不到 ${kind}=${arg}（显示列表：${all.slice(0, 400)}）`);
    }
    const b = hit.getBounds();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  /** buildBoard 的容器（弹簧滑入的板）：静止判定用 y 是否落到板位 */
  pp.board = (sceneKey) => {
    const sc = pp.game.scene.getScene(sceneKey);
    const list = sc && sc.children ? sc.children.list : [];
    const c = list.find((o) => o.type === "Container");
    return c ? { y: c.y, visible: c.visible } : null;
  };
  /** 选关数字可见枚数（TempleScene.numberTexts，默认创建即 setVisible(false)） */
  pp.numbers = (sceneKey) => {
    const sc = pp.game.scene.getScene(sceneKey);
    const arr = sc && sc.numberTexts ? sc.numberTexts : [];
    return { total: arr.length, shown: arr.filter((t) => t.visible).length };
  };
}

/** 每态编舞：pump 到指定场景步数 + 真实点击；截图前必须成立的条件由 run 内部断言 */
const MENU_AT = 240;
/** 面板弹簧入场后再走的合成步数（overlays.ts:82-95 逐帧积分，dt=loop.delta/1000 恒定⇒收敛拍数确定） */
const BOARD_POST = 420;

/** 选关节点全集（数字/锁链的唯一事实源=官方 temple.json） */
const TEMPLE_LEVELS = JSON.parse(readFileSync(join(ROOT, "data", "forest", "temple.json"), "utf8")).levels;
/** 满通关档案：48 关都有 best（星级按 id 轮转 1/2/3，让 Diamond0001-0003 三种节点帧都入镜）
 *  与 played 标记（无 NewSign 徽标干扰）——只为把 48 枚 String(lv.id) 数字全点亮 */
const ALL_CLEAR = {
  best: Object.fromEntries(TEMPLE_LEVELS.map((lv) => [lv.filename, { stars: (lv.id % 3) + 1, time: 60 + lv.id }])),
  played: TEMPLE_LEVELS.map((lv) => lv.filename),
};

const STATES = [
  {
    id: "menu",
    desc: "Menu 场景：双角色 head_idle 帧 + 8 光柱 + 4 蜡烛 + 「开始游戏」72 号位图字",
    async run(pp) {
      await pp.toMenu();
      await pp.pumpToCount("Menu", MENU_AT);
    },
  },
  {
    id: "temple",
    desc: "选关树（首进档案）：三层烘焙浮雕 + 可玩节点/锁链帧 + 「返回」「显示关卡数」",
    async run(pp) {
      await pp.toMenu();
      await pp.pumpToCount("Menu", MENU_AT);
      // 「开始游戏」= 无图 Zone (640,513) 300×100（MenuScene.ts:93-95）
      await pp.click("Menu", "pos", "640,513");
      await pp.toTemple();
    },
  },
  {
    id: "temple-numbers",
    desc: "选关树（满通关档案）+ 两次点按「显示关卡数」→ 48 枚 String(lv.id) 数字（0-9 全数码）",
    progress: ALL_CLEAR,
    async run(pp) {
      await pp.toMenu();
      await pp.pumpToCount("Menu", MENU_AT);
      await pp.click("Menu", "pos", "640,513");
      await pp.toTemple();
      // ★ 走真实两次点按：TempleScene 的数字创建即 setVisible(false)（:185-188），
      // 首次点「显示关卡数」把 showNumbers 翻成 false（仍不显），第二次才 true⇒显影。
      // 一次点按看不到数字，两次才是 shipped 路径上的"数字可见"态。
      for (let i = 0; i < 2; i++) {
        await pp.click("Temple", "text", "显示关卡数");
        await pp.pump(2);
      }
      await pp.pumpToCount("Temple", 400);
      const n = await pp.page.evaluate(() => globalThis.__pp.numbers("Temple"));
      if (n.total !== 48 || n.shown !== 48) throw new Error(`选关数字未全显：${JSON.stringify(n)}`);
    },
  },
  {
    id: "settings",
    desc: "「设置」面板（叠 Menu）：标题 设置 + 音乐/音效 开关行 + 好的（StoneButton）",
    async run(pp) {
      await pp.toMenu();
      await pp.waitTex([["popup", "PopupBackground0000"]]);
      await pp.pumpToCount("Menu", MENU_AT);
      await pp.click("Menu", "frame", "SettingsButton0002");
      await pp.pumpToCount("Menu", MENU_AT + 2 + BOARD_POST);
      await pp.assertBoard("SettingsScene");
    },
  },
  {
    id: "credits",
    desc: "「制作人员」面板（叠 Menu）：标题 + 5 行名单 + 好的",
    async run(pp) {
      await pp.toMenu();
      await pp.waitTex([["popup", "PopupBackground0000"]]);
      await pp.pumpToCount("Menu", MENU_AT);
      await pp.click("Menu", "text", "?");
      await pp.pumpToCount("Menu", MENU_AT + 2 + BOARD_POST);
      await pp.assertBoard("CreditsScene");
    },
  },
];

/** 像素差 AE（ImageMagick 把度量写在 stderr，且非零差返回码 1，故两侧都要接） */
function pixelAE(a, b) {
  try {
    return (
      execFileSync("magick", ["compare", "-metric", "AE", a, b, "null:"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).stdout + ""
    ).trim() || "0";
  } catch (e) {
    const line = String(e.stderr ?? e.message).trim().split("\n").pop();
    return line || "magick 不可用";
  }
}

/** --save 体检：唯一色数（全黑/全白画布=量具坏了，不能当基线）；从 stdin 读，坏图不落库 */
function uniqueColors(png) {
  try {
    return Number(execFileSync("magick", ["identify", "-format", "%k", "png:-"], { encoding: "utf8", input: png }).trim());
  } catch {
    return -1;
  }
}

const sha16 = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);
/**
 * 现役 dist 产物指纹（不跑构建，只登记读到什么）：
 * 入口 chunk 里有没有 font-prephase 引用，是"这份产物属于哪一代字体装载"的实测判据
 * ——两段化的 client 代码落在 commit 90fe319（BootScene.ts:113 只装子集、全量走延迟通道），
 * 该提交之后构建的产物一定带这个串，之前的绝不带。字体目录里的 PNG 清单/指纹一并记下，
 * 这样事后看 manifest 就能确定基线到底是谁家的像素，而不是靠 HEAD 猜。
 */
function bundleFp() {
  const assets = join(ROOT, "packages", "client", "dist", "assets");
  const chunks = readdirSync(assets).filter((f) => /^index-.+\.js$/.test(f)).sort();
  if (!chunks.length) throw new Error(`${assets} 里没有入口 chunk——dist 未构建（npm run build 由人决定，本工具不代劳）`);
  const entry = readFileSync(join(assets, chunks[0]));
  const fontDir = join(assets, "fonts", "chinese");
  const pngs = Object.fromEntries(
    readdirSync(fontDir)
      .filter((f) => f.endsWith(".png"))
      .sort()
      .map((f) => [f, sha16(readFileSync(join(fontDir, f)))]),
  );
  const subsetReferenced = entry.includes("font-prephase");
  return {
    chunk: chunks[0],
    chunkSha: sha16(entry),
    fonts: pngs,
    subsetReferenced,
    fontEra: subsetReferenced ? `两段化（子集先行，见 ${POST_SPLIT_COMMIT}）` : `全量 font.png 一代（${BASELINE_COMMIT} 代 client 代码）`,
  };
}

/** 产物指纹先取：dist 没构建就直接在这里退出，别先起服务器再炸（端口白占） */
const bundle = bundleFp();
const server = await startServer(PORT, {});
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--force-color-profile=srgb"] });
const results = [];
const errs = [];
log(`产物指纹：${bundle.chunk}=${bundle.chunkSha} 字体=${JSON.stringify(bundle.fonts)} ⇒ 代=${bundle.fontEra}`);
/** 上一批 manifest 先读进来：对拍要靠它区分"换了产物"，--save 要靠它核对新旧 SHA */
let prior = null;
if (existsSync(join(OUT, "manifest.json"))) {
  try {
    prior = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8"));
  } catch { /* manifest 坏了会在按态对拍时报缺失/差异，这里不抢话 */ }
}
if (SAVE && bundle.fontEra !== FIRST_CAPTURE_BUNDLE.fontEra) {
  log(`ℹ 现役产物已是 ${bundle.fontEra}（首捕产物是 ${FIRST_CAPTURE_BUNDLE.fontEra}）：`);
  log("  本批像素若与基线逐字节相同，说明两代产物在这五态上等价——这正是要验的事；若不同，--save 会把后值刷成基线，");
  log("  必须在该轮报告写明换代理由，不得静默放容差。只验无损的话应该跑对拍（不带 --save）。");
}
if (!SAVE && prior?.bundle && prior.bundle.chunkSha !== bundle.chunkSha) {
  log(`ℹ 产物已更换（基线 ${prior.bundle.chunk}=${prior.bundle.chunkSha} → 现役 ${bundle.chunk}=${bundle.chunkSha}）：像素差异来自这份新产物。`);
}

/** 每态一套页内会话工具（同一条编舞语言，免得状态表里塞满 evaluate 字符串） */
async function openSession(st) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(`${st.id}:${String(e)}`));
  await page.addInitScript(driver, { seed: RNG_SEED, stepMs: STEP_MS, progress: st.progress ?? null });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  // 画布一出现就说明 Game.boot 已走完（渲染器/场景队列就绪），此后 __pp.step 才有世界可推
  await page.waitForFunction(() => !!globalThis.__pp && !!globalThis.__pp.game && !!document.querySelector("#game-root canvas"), null, {
    timeout: 30000,
    polling: 20,
  });
  // DOM 覆盖层整层摘掉：元素截图=页面合成结果，#menu 的 backdrop-filter 会混进画布像素
  await page.addStyleTag({ content: "#menu,#hud,#toast,#net-lost,#touch-controls{display:none!important}" });
  const info = await page.evaluate(() => globalThis.__pp.info());
  if (info.paused) throw new Error("Phaser game.isPaused=true（页面被判为不可见），合成时钟推不动世界");
  if (info.cw !== 1280 || info.ch !== 960 || Math.round(info.styleW) !== 1280 || Math.round(info.styleH) !== 960) {
    throw new Error(`画布非 1:1（${JSON.stringify(info)}）——视口改动会引入浏览器重采样，基线口径失效`);
  }

  const box = await page.locator("#game-root canvas").boundingBox();
  const pp = {
    page,
    ctx,
    /** 走 n 步合成时钟 */
    pump: (n) => page.evaluate((k) => globalThis.__pp.step(k), n),
    count: (k) => page.evaluate((key) => globalThis.__pp.count(key), k),
    active: (k) => page.evaluate((key) => globalThis.__pp.active(key), k),
    /** 把某场景的活动步数精确推到 target（步长上限=余量⇒永不越界） */
    async pumpToCount(key, target) {
      for (let guard = 0; guard < 200; guard++) {
        const c = await pp.count(key);
        if (c >= target) return c;
        await pp.pump(Math.min(target - c, 40));
      }
      throw new Error(`${key} 步数推不到 ${target}（停在 ${await pp.count(key)}）`);
    },
    /** 真实点击：场景系坐标按 canvas 盒子映射到页面坐标 */
    async click(sceneKey, kind, arg) {
      const c = await page.evaluate(([k, kd, a]) => globalThis.__pp.center(k, kd, a), [sceneKey, kind, arg]);
      const sx = box.width / 1280;
      const sy = box.height / 960;
      await page.mouse.click(box.x + c.x * sx, box.y + c.y * sy);
      await pp.pump(2); // 排队的 pointerdown/up 由 InputPlugin 在步进时派发（=玩家点一次至少走一拍）
    },
    /** 等纹理到齐：只等真实时间，不推进画面（Loader 事件驱动，与合成步数互不干扰） */
    async waitTex(specs, ms = 25000) {
      const t0 = Date.now();
      for (;;) {
        if (await page.evaluate((sp) => globalThis.__pp.texReady(sp), specs)) return;
        if (Date.now() - t0 > ms) throw new Error(`纹理未就绪：${JSON.stringify(specs)}`);
        await sleep(50);
      }
    },
    /** Menu 起来：Boot 真实装载完（墙钟）→ 步进到 Menu 活动 → 步数从此刻才计量 */
    async toMenu(maxSteps = 4000) {
      for (let used = 0; used < maxSteps; ) {
        await pp.pump(20);
        used += 20;
        if (await pp.active("Menu")) return used;
        await sleep(20);
      }
      throw new Error("步进到不了 Menu 场景");
    },
    /** 选关树：黑幕散尽 + 烘焙三层已上墙（Temple 无逐帧动画，故静止态与烘焙耗时的墙钟切片无关） */
    async toTemple(maxSteps = 6000) {
      for (let used = 0; used < maxSteps; used += 20) {
        await pp.pump(20);
        const st = await pp.page.evaluate(() => {
          const g = globalThis.__pp.game;
          const sc = g.scene.isActive("Temple") ? g.scene.getScene("Temple") : null;
          return {
            temple: !!sc,
            xf: g.scene.isActive("XFade"),
            menu: g.scene.isActive("Menu"),
            fallbacks: sc ? sc.flatFallbacks.length : -1,
            tree: g.textures.exists("tree-all"),
          };
        });
        if (st.temple && !st.xf && !st.menu && st.fallbacks === 0 && st.tree) {
          await pp.pumpToCount("Temple", 240);
          return;
        }
        await sleep(20);
      }
      throw new Error("选关树未在限定步数内静止（黑幕未散或烘焙未上墙）");
    },
    /** 面板弹簧必须已落位（否则拍到半截滑入=另一套像素，且会把"未收敛"当成基线） */
    async assertBoard(sceneKey) {
      const b = await page.evaluate((k) => globalThis.__pp.board(k), sceneKey);
      if (!b || !b.visible || Math.abs(b.y - 159) > 1) {
        throw new Error(`${sceneKey} 面板弹簧未落位（板顶左 y=${b && b.y.toFixed(3)}，目标 159）——步进数不够或入场被打断`);
      }
      if (!(await pp.active(sceneKey))) throw new Error(`${sceneKey} 未活动（点击没命中？）`);
    },
  };
  return pp;
}

try {
  for (const st of STATES) {
    const pp = await openSession(st);
    try {
      await st.run(pp);
      const png = await pp.page.locator("#game-root canvas").first().screenshot({ type: "png" });
      const sha = createHash("sha256").update(png).digest("hex");
      const file = join(OUT, `${st.id}.png`);
      const row = { id: st.id, sha, bytes: png.length, file, desc: st.desc, profile: st.progress ? "满通关档案" : "首进档案" };
      results.push(row);
      if (SAVE) {
        const colors = uniqueColors(png);
        if (colors >= 0 && colors < 256) throw new Error(`${st.id} 截图唯一色数仅 ${colors}（画布疑似全黑/全白）——量具坏了，基线不写`);
        row.colors = colors;
        mkdirSync(OUT, { recursive: true });
        writeFileSync(file, png);
        log(`${st.id.padEnd(16)} ${png.length}B ${sha.slice(0, 16)} 唯一色=${colors}（基线已写）`);
      } else if (!existsSync(file)) {
        throw new Error(`基线缺失：${file}（先跑 --save）`);
      } else {
        const base = readFileSync(file);
        const bsha = createHash("sha256").update(base).digest("hex");
        if (bsha === sha) {
          log(`${st.id.padEnd(16)} PASS 画布像素与基线逐字节一致（${png.length}B）`);
        } else {
          mkdirSync(SCRATCH, { recursive: true });
          const tmp = join(SCRATCH, `${st.id}.png`);
          writeFileSync(tmp, png);
          row.fail = true;
          log(
            `${st.id.padEnd(16)} FAIL 基线 ${bsha.slice(0, 16)} → 现役 ${sha.slice(0, 16)}，像素 AE=${pixelAE(file, tmp)}（现役画布 ${tmp.replace(ROOT + "/", "")}）`,
          );
        }
      }
    } finally {
      await pp.ctx.close();
    }
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

if (errs.length) {
  log("页面错误（失败）：", errs.join("; "));
  process.exit(1);
}

if (SAVE) {
  let head = "(git 不可用)";
  try {
    head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch { /* 保持占位：基线仍可用，只是少一条溯源 */ }
  const fonts = Object.keys(bundle.fonts).join("/");
  const eraWhy = bundle.subsetReferenced
    ? `入口 chunk ${bundle.chunk}=${bundle.chunkSha} 内**查到** "font-prephase" 引用，dist 字体目录=${fonts} ⇒ 本批 PNG 是两段化之后的像素`
    : `入口 chunk ${bundle.chunk}=${bundle.chunkSha} 内**查不到** "font-prephase" 引用，dist 字体目录=${fonts} ⇒ 本批 PNG 是拆字之前的像素（Boot 一次性装载 font.png 全量 2191×1024、font.fnt 声明 260 字）`;
  /** 新旧 SHA 逐态核对：只有全等，才允许把两份产物并列进"已复现清单"当无损证据 */
  const priorSha = new Map((prior?.states ?? []).map((s) => [s.id, s.sha256]));
  const sameAsPrior = !!prior && results.length === priorSha.size && results.every((r) => priorSha.get(r.id) === r.sha);
  const crossNote = !prior
    ? "本批为首捕，无旧批可比"
    : sameAsPrior
      ? "与前批 SHA 逐态相同 ⇒ 这份产物在五态上复现了拆字前那批像素，正是本门禁要证的无损"
      : `与前批 SHA 有差异，本批已换值。换代理由（--reason）：${REASON}`;
  if (!sameAsPrior && prior && !REASON) {
    throw new Error(
      "像素与上一批基线不同却没有 --reason：换代必须留理由。" +
      "先跑不带 --save 的对拍取差图与 AE，人工核清机制，再 --save --reason \"机制一句话\"。",
    );
  }
  const verifiedBy = [];
  const pushBundle = (b, role) => {
    if (b && !verifiedBy.some((v) => v.chunkSha === b.chunkSha)) verifiedBy.push({ ...b, role });
  };
  pushBundle(FIRST_CAPTURE_BUNDLE, `首捕：本批字节第一次产出的产物（${FIRST_CAPTURE_BUNDLE.fontEra}）`);
  pushBundle(prior?.bundle, `上一批 manifest 登记的产物（与本批 SHA ${sameAsPrior ? "逐态相同" : "有差异"}）`);
  pushBundle(bundle, `本次 --save 所用产物（${bundle.fontEra}，HEAD=${head}）`);
  const provenance =
    `基线锚代=${FIRST_CAPTURE_BUNDLE.fontEra}：首捕产物 ${FIRST_CAPTURE_BUNDLE.chunk}=${FIRST_CAPTURE_BUNDLE.chunkSha} 查不到 "font-prephase" 引用、` +
    `字体目录只有 ${Object.keys(FIRST_CAPTURE_BUNDLE.fonts).join("/")}，装载路径=Boot 一次性取 assets/fonts/chinese/font.png 全量 2191×1024` +
    `（font.fnt 声明 260 字），即 commit ${BASELINE_COMMIT} 的口径。判代不靠 HEAD 而靠产物指纹：` +
    `两段化的 client 代码落在 commit ${POST_SPLIT_COMMIT}（BootScene 只装子集、全量走延迟通道），` +
    `要重新构建进 dist 才改变本门禁读到的像素，而 client 代码在 ${BASELINE_COMMIT}→${POST_SPLIT_COMMIT}~1 之间 diff 为空，` +
    `故首捕那批 dist 的 client 面就是 ${BASELINE_COMMIT} 代。` +
    `本次生成（HEAD=${head}）所用产物：${eraWhy}；跨产物复现=${crossNote}。` +
    `用途：改动前场字体/装载序的一方必须让对拍逐字节复现本批 PNG——` +
    `任何差异都是子集缺字框或空白化过切，不是画质折衷。页内口径：Math.random=mulberry32(seed ${RNG_SEED})，` +
    `Phaser 主循环自驱动封死、改由 ${STEP_MS.toFixed(6)}ms 合成步时钟驱动 Game.step，` +
    `视口 1280×960 deviceScaleFactor 1，DOM 覆盖层隐藏，只截 #game-root canvas。`;
  writeFileSync(
    join(OUT, "manifest.json"),
    JSON.stringify(
      {
        note:
          "前场画布逐像素基线（r18 门禁件）：只拍 #game-root canvas，DOM 覆盖层整层隐藏；" +
          "五态编舞与不覆盖态（Boot 进度条/FadeScene Loading/游戏内）见 scripts/e2e/prephase-canvas.mjs 头注",
        provenance,
        bundle,
        bundlesVerified: verifiedBy,
        states: results.map((r) => ({ id: r.id, sha256: r.sha, bytes: r.bytes, uniqueColors: r.colors, profile: r.profile, desc: r.desc })),
      },
      null,
      2,
    ),
  );
  log(`prephase-canvas: 基线 ${results.length} 态已生成 → benchmark/results/prephase-canvas/`);
  process.exit(0);
}

const failed = results.filter((r) => r.fail).length;
log(failed ? `prephase-canvas: ${results.length - failed}/${results.length} PASS（${failed} 态画布像素变了）` : "prephase-canvas: ALL PASS");
process.exit(failed ? 1 : 0);
