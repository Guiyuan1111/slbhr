/**
 * 客户端入口：DOM 菜单（创建/加入房间）→ 连接 → 经 /api/level 拉关卡 → 启动 Phaser。
 * HUD 用 DOM（状态提示），画布内另有计时/钻石计数（GameScene ui 层）。
 *
 * 0.3.0：URL ?level= 选关（E14，缺省 forest_01）；关卡统一走 GET /api/level/:id
 * （两端以服务端 LEVEL_DIRS 为唯一事实，客户端不再自行拼关卡目录）；
 * phase 文案对新词汇 lobby|ready|started|paused|won|gameover；R 键请求重开。
 */
import Phaser from "phaser";
import { type Role } from "@fw/shared";
import { parseLevel, type LevelData } from "@fw/shared/level2";
import { Net, type NetCallbacks } from "./net";
import { copyText } from "./clipboard";
import { KeyboardInput } from "./input";
import { TouchControls } from "./touch";
import { BootScene, bgWarmSettled } from "./scenes/BootScene";
import { MenuScene } from "./scenes/MenuScene";
import { TempleScene } from "./scenes/TempleScene";
import { GameScene } from "./scenes/GameScene";
import { PauseMenu, EndMenu, GameOverMenu } from "./scenes/overlays";
import { SettingsScene, CreditsScene, CompleteScene } from "./scenes/menus";
import { FadeScene, fadeSwitch } from "./scenes/transition";
import { loadTempleLevels } from "./templeData";
import { markPlayed, processWinResult, saveBest, starsOf } from "./progress";
import { getSettings } from "./settings";

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`缺少元素 ${sel}`);
  return el as T;
};

const DEFAULT_LEVEL_ID = "forest_01";
const urlParams = new URLSearchParams(location.search);
/** URL ?level= 选关（冻结需求 #12；合法性由服务端校验，非法 id 返回 4404 文案） */
const urlLevel = urlParams.get("level") ?? "";
/** 邀请深链 ?room=<房间码>（旧链接兼容 ?pw=）：打开后自动回填房间码；带 pw 才自动加入 */
const inviteRoom = urlParams.get("room") ?? "";
const invitePw = urlParams.get("pw") ?? "";
/** 关卡四周的岩壁边距（原版 groundTexture 1312×992 = 关卡 +32 边距） */

let phaser: Phaser.Game | null = null;
/** 选关界面所选关卡（filename 去扩展名）；?level= 深链直通 */
let selectedLevel = urlLevel;
let net: Net | null = null;
let keyboard: KeyboardInput | null = null;
/** 本机角色（onRole 到达即记，键盘分键 F1 用） */
let myRole: Role | null = null;
/** 触屏虚拟按键（M2；粗指针设备或 ?touch=1 时生效，与键盘同源合并） */
let touch: TouchControls | null = null;
let gameStarted = false;
let pausedByUser = false;
let currentLevel: LevelData | null = null;
/** temple.json 中当前关卡的条目（filename/time/type），结算星级与存档键用 */
let currentTempleEntry: { filename: string; time: number; type: string } | null = null;
/** temple.json 关卡序（结算「继续」推算下一关用；enterGame 拉取时填充） */
let templeLevels: Array<{ id: number; filename: string }> = [];
/** temple.json 原始条目（含 time/type；活房间换关时重算 currentTempleEntry 用） */
let templeRaw: Array<{ id?: number; filename?: string; time?: number; type?: string }> = [];
/** 已选关卡的星级/通过判定（EndMenu 与 saveBest 共用） */
let lastResult: { stars: number; passed: boolean } | null = null;
/** 本轮结算面板是否已开（L-02：重连/回座补结算与 onPhase("won") 共用入口，防重复开板；
 *  phase=ready 新一轮或离房时复位） */
let endMenuShown = false;

/**
 * 拉关卡原始 JSON（/api/level/:id → {id, json}）并预取外部图块集。
 *
 * 图块集 URL 归一：source 是相对关卡文件的路径（如 ../../../assets/tilemaps/tilesets/
 * Ground.json）。服务端 LEVEL_DIRS 均为 data/<theme>/levels 两层深，上跳正好落到项目根，
 * 去掉前导 ".." 即得根相对 URL（/assets 由静态托管）——与 /api 返回的原始 JSON 相互独立。
 */
async function fetchLevel(id: string): Promise<LevelData> {
  const res = await fetch(`/api/level/${encodeURIComponent(id)}`);
  if (!res.ok) {
    let msg = `关卡下载失败 (${res.status})`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* 保留默认文案 */
    }
    throw new Error(msg);
  }
  const { json } = (await res.json()) as { id: string; json: unknown };
  // parseLevel 是同步取用，必须先预取全部图块集再以同步 getter 提供（直接传
  // Promise 会让 tileTypeOf 全部失败，地面/液体类型全部退化为 0）。
  const sources = new Set<string>();
  for (const t of (json as { tilesets?: Array<{ source?: string }> }).tilesets ?? []) {
    if (t?.source) sources.add(String(t.source));
  }
  const resolved = new Map<string, object>();
  await Promise.all(
    [...sources].map(async (s) => {
      resolved.set(s, await fetch(tilesetUrl(s)).then((r) => r.json()));
    }),
  );
  return parseLevel(id, json, (source) => {
    const ts = resolved.get(source);
    if (!ts) throw new Error(`图块集未预取: ${source}`);
    return ts;
  });
}

/** 关卡数据客户端缓存（r8 perf 件4）：LevelData 只读（场景构建遍历读，不改写），
 *  同关重进（离房再建/邀请深链重复进出）零重复拉取；失败逐出保证可重试。 */
const levelCache = new Map<string, Promise<LevelData>>();

/** fetchLevel 带缓存（异常不缓存） */
function fetchLevelCached(id: string): Promise<LevelData> {
  let p = levelCache.get(id);
  if (!p) {
    p = fetchLevel(id);
    p.catch(() => levelCache.delete(id));
    levelCache.set(id, p);
  }
  return p;
}

/** 图块集 source → 根相对 URL（去掉前导 ".."，见 fetchLevel 注释） */
function tilesetUrl(source: string): string {
  const parts = source.split("/");
  while (parts.length > 0 && parts[0] === "..") parts.shift();
  return "/" + parts.join("/");
}

/** temple.json 条目查找（EndMenu 限时/星级/存档键口径；未命中返回 null 走 general 缺省） */
function findTempleEntry(levelId: string): { filename: string; time: number; type: string } | null {
  const e = templeRaw.find((lv) => String(lv.filename ?? "").endsWith(`/${levelId}.json`));
  return e ? { filename: String(e.filename), time: Number(e.time) || 0, type: String(e.type ?? "general") } : null;
}

/** 重开整关（黑幕包络；13 号档遗留销账，0.3.39）。oracle 对应语义=Level.retry 走 fade
 *  （bundle:1909660 已复核：levelMusic.stop → state.add("level") → state.fade("level",!0,!1,levelData)
 *  → killAll）。GameOver/Pause「再试一次」与 R 键共用（0.3.37 起 __fwRestart 即此信封；
 *  R 键属我方 E1 速度跑扩展——oracle 键盘仅绑 P bundle:1896097 区，无 R——今键盘路径
 *  对齐鼠标路径同信封）。转场进行中重复触发被 fading 门整体丢弃（oracle if(!this.fading) 同）；
 *  服务端 phase 把关不变（R 无本地前置门槛，原语义）。 */
function restartWithFade(): void {
  if (!net || !phaser) return;
  const game = phaser; // 守卫后取 const：模块级 let 的窄化不跨回调存活（TS18047）
  fadeSwitch(game, () => {
    const sm = game.scene;
    sm.stop("GameOverMenu");
    sm.stop("PauseMenu");
    net?.restart();
  });
}

/** 活房间换关（服务端 advance 的 levelId 差分回声，双端同触发）：拉新关数据重建 Game
 *  场景；席位/键盘/触屏链路不动（仍绑在同一房间）。 */
async function reloadLevel(levelId: string): Promise<void> {
  if (!net || !gameStarted) return;
  try {
    currentLevel = await fetchLevelCached(levelId);
  } catch (e) {
    console.error("[fw] 换关失败:", e);
    return;
  }
  currentTempleEntry = findTempleEntry(levelId);
  // NewSign played 标记（13 号档 #13，0.3.39）：oracle setPlayed 于 startLevel 进关即置
  // （bundle:1935016）；换关亦属进关（advance 回声同达）。
  if (currentTempleEntry) markPlayed(currentTempleEntry.filename);
  (globalThis as unknown as Record<string, unknown>).__fwInit = { net, level: currentLevel, keyboard, templeEntry: currentTempleEntry };
  // 换关黑幕（oracle LevelMenu.startLevel fade("level") :1935281；EndMenu Continue→advance 回声双侧同达）
  const sm = phaser!.scene;
  fadeSwitch(phaser!, () => {
    sm.stop("EndMenu");
    sm.stop("GameOverMenu");
    sm.stop("PauseMenu");
    sm.stop("Game");
    sm.start("Game");
  });
}

function show(err?: string): void {
  const el = $("#menu-error");
  el.classList.remove("busy");
  el.textContent = err ?? "";
}

/**
 * 断线横幅（issue #5 H-04）：独立于 #hud-status 的常驻元素——updateHud 每 250ms 会用
 * 相位文本无条件覆写 #hud-status（started 相位是空串），断线提示曾在 ≤250ms 内被冲掉。
 * 横幅只在 setNetLost 显式清空前保持，任何轮询都不碰它。
 */
function setNetLost(msg: string | null): void {
  const el = $("#net-lost");
  el.textContent = msg ?? "";
  el.classList.toggle("hidden", !msg);
}

/** 连接忙态（P3 防双击）：#menu-error 挂 spinner、双按钮禁用；任何出路（入房/报错/回面板）必须解除 */
function setBusy(busy: boolean): void {
  $("#menu-error").classList.toggle("busy", busy);
  $<HTMLButtonElement>("#btn-create").disabled = busy;
  $<HTMLButtonElement>("#btn-join").disabled = busy;
  // r8 件1：连接忙期冻结合成放大器。石板大厅幕布 backdrop-filter 盖在 60fps 动画的
  // Phaser 画布上，无 GPU 合成环境逐帧重算模糊会拥塞主线程、拖慢连接窗内的 fetch
  // 派发（实测 +364ms/55%，CSS A/B：blur ~256ms+floaty ~100ms，见 r8 报告）。
  // sleep 停 update+render（画布静止），DOM spinner 不受影响；唤醒双路兜底
  // （enterGame 顶部 + setBusy(false)），wake 幂等。
  document.body.classList.toggle("fw-busy", busy);
  if (busy && !gameStarted) phaser?.loop.sleep();
  else if (!busy) phaser?.loop.wake();
}

function updateHud(): void {
  if (!net) return;
  const st = net.room.state;
  const phase = String(st?.phase ?? "");
  // 原版观感：计时与钻石计数都在画布内（GameScene ui 层），DOM 只留联机栏与状态
  const text: Record<string, string> = {
    lobby: "等待另一位玩家加入…",
    ready: "双人就绪，即将开始…",
    started: "",
    paused: "对方断线，等待重连…",
    won: "通关！",
    gameover: "有人化烟了！点「再试一次」重开（或按 R）",
  };
  $("#hud-status").textContent = text[phase] ?? "";
  $("#hud-status").classList.toggle("warn", phase === "paused" || phase === "gameover");
  // 原版 endGame 状态无任何顶部 HUD 文本条（bundle States/End 只建 EndMenu/GameOverMenu，
  // 见 note/research 09 §结算弹窗；DOM 条浮在画布之上不受结算黑罩压暗，终局会盖住结算板顶部）——
  // won/gameover 隐藏联机栏，回到 ready/started（重开/换关）自动恢复
  $("#hud-top").classList.toggle("hidden", phase === "won" || phase === "gameover");
  keyboard?.setPaused(phase !== "started");
  // 触屏按钮：ready 起显示（预备手指），非进行阶段隐藏；输入仍走 keyboard 的暂停闸门
  touch?.setActive(phase === "ready" || phase === "started");
}

/**
 * 结算面板入口（正常 onPhase("won") 与重连/回座补结算共用，L-02）。
 * 前置：关卡数据与场景/字体资源已就绪（enterGame 完成后）——刷新回座时权威 won
 * 可能早于 enterGame 抵达，提前 start 会因字体未装载在 create 抛错（EndMenu 起不来）。
 * 幂等：EndMenu 已活动或本轮已开板则直接返回；关键副作用（星级/最佳）只在开板时算一次。
 */
function openEndMenu(): void {
  if (!net || !currentLevel || !gameStarted || !phaser) return;
  if (endMenuShown || phaser.scene.isActive("EndMenu")) return;
  endMenuShown = true;
  const f = net.lastFinish;
  const diaTotal = currentLevel.diamonds.filter((d) => d.kind !== "silver").length;
  const diaGot = (f?.fbDiamonds ?? 0) + (f?.wgDiamonds ?? 0);
  const timeSec = Math.round((f?.timeMs ?? 0) / 1000);
  const limit = currentTempleEntry?.time ?? 0;
  const type = currentTempleEntry?.type ?? "general";
  // 原版 ProgressModel.update 星级口径：puzzle=银钻>0?3:0（不收=未通过）；general=1+钻石+限时
  let stars: number;
  let passed: boolean;
  if (type === "puzzle") {
    passed = (f?.silver ?? 0) > 0;
    stars = passed ? 3 : 0;
  } else {
    const diaFull = diaTotal > 0 && diaGot >= diaTotal;
    const timeOk = limit > 0 && timeSec <= limit;
    stars = 1 + (diaFull ? 1 : 0) + (timeOk ? 1 : 0);
    passed = true;
  }
  lastResult = { stars, passed };
  if (passed && currentTempleEntry) {
    // 全通庆典置位（P-02 #34，0.3.40）：oracle EndMenu.create → progress.update
    // （:1881953 success 分支），仅 best 刷新才 merge+process（:2152850 区）；
    // process 置位段 :2149483-:2149538：b=全 48 关 3 星 && gameComplete 未置
    // → firstComplete（瞬态），gameComplete=b 持久化。消费在 Menu/Temple 入口
    // （takeFirstComplete），时点对齐 oracle「通关置位、回菜单才播」。
    if (saveBest(currentTempleEntry.filename, stars, timeSec)) {
      processWinResult(templeLevels.length > 0 && templeLevels.every((lv) => starsOf(lv.filename) === 3));
    }
  }
  phaser.scene.start("EndMenu", {
    diamonds: diaGot,
    diamondsTotal: diaTotal,
    silver: f?.silver ?? 0,
    timeSec,
    timeLimitSec: limit,
    type,
    stars,
  });
}

/**
 * L-02：重连/刷新回座成功后补结算。客户端的 onPhase 是状态差分——重连端 prevPhase
 * 若已是 "won"（或刷新回座时 onPhase 在资源就绪前被前置门拦下）不会再开板；这里按
 * 权威 state.phase 主动检查，lastFinish 已由服务端补发回填后才触发，等价于正常
 * onPhase("won") 的结算 UI。
 */
function resumeWonIfNeeded(): void {
  if (!net || !gameStarted || !currentLevel) return;
  if (String(net.room?.state?.phase ?? "") !== "won") return;
  if (!net.lastFinish) return;
  openEndMenu();
}

async function enterGame(): Promise<void> {
  if (!net) throw new Error("未连接房间");
  // join 方以房间的真实关卡为准（修 E14 双端路径分裂的最后一环）；拿不到回退 URL/默认
  const levelId = (await net.waitForLevelId()) || selectedLevel || urlLevel || DEFAULT_LEVEL_ID;
  const level = await fetchLevelCached(levelId);
  show();

  // 返场重进时旧实例的监听与 15Hz 重发定时器会残留——先销毁（曾随房间叠加）。
  // 触屏先释放：此时旧键盘仍在，虚拟键松开能经旧键盘发出全松快照
  touch?.dispose();
  touch = null;
  keyboard?.destroy();
  keyboard = new KeyboardInput(window, (input) => net?.sendInput(input));
  // 返场重进时角色已知（onRole 先于键盘构造到达）；首进由 onRole 回调补设
  if (myRole) keyboard.setRole(myRole);
  touch = new TouchControls((code, pressed) => keyboard?.setVirtual(code, pressed));

  // 场景数据走全局句柄：Phaser 已随页面启动（Menu/Temple 选关流），此处仅切入 Game
  currentLevel = level;
  // temple.json 条目（time/type/filename）：EndMenu 限时、星级口径、进度存档键都出自这里
  currentTempleEntry = null;
  // r8 件3：temple.json 单例（bindUi 已预取，此处 await 恒命中已完成态）
  templeRaw = await loadTempleLevels();
  templeLevels = templeRaw.map((lv) => ({ id: Number(lv.id ?? 0), filename: String(lv.filename ?? "") }));
  currentTempleEntry = findTempleEntry(levelId);
  // NewSign played 标记（13 号档 #13，0.3.39）：oracle setPlayed 于 startLevel 进关即置
  // （bundle:1935016）。时点注记：oracle 单机=点击节点直进；我方联机=此处真进关
  // （弹面板间隔不计），语义取「进过这关」。
  if (currentTempleEntry) markPlayed(currentTempleEntry.filename);
  (globalThis as unknown as Record<string, unknown>).__fwInit = { net, level, keyboard, templeEntry: currentTempleEntry };
  (globalThis as unknown as Record<string, unknown>).__fwRestart = () => net?.restart();
  (globalThis as unknown as Record<string, unknown>).__fwPauseKeyboard = (b: boolean) => keyboard?.setPaused(b);
  // F3：P 键/暂停菜单「继续」统一入口——只发请求，画面以服务端 pause-changed 回声为准
  (globalThis as unknown as Record<string, unknown>).__fwTogglePause = () => togglePause();
  (globalThis as unknown as Record<string, unknown>).__fwSfx = (name: string) => {
    if (!getSettings().fx) return;
    const gs = phaser?.scene.getScene("Game") as unknown as { sfx?: (k: string) => void } | null;
    gs?.sfx?.(name);
  };
  /** 离房回选关树（EndMenu「继续」/各菜单「返回菜单」共用）。整包入黑幕 ops
   *  （oracle EndMenu :1878226 fade("levelMenu")）——转场进行中重复触发整体丢弃。 */
  const leaveToMenu = (): void => {
    fadeSwitch(phaser!, () => {
      net?.leave();
      net = null;
      gameStarted = false;
      pausedByUser = false;
      // 保留 setPaused(true) 的全松语义（清按下集合），再释放触屏 DOM、销毁键盘监听
      keyboard?.setPaused(true);
      touch?.dispose();
      touch = null;
      keyboard?.destroy();
      keyboard = null;
      endMenuShown = false;
      setNetLost(null);
      const sm = phaser!.scene;
      sm.stop("Game");
      sm.stop("EndMenu");
      sm.stop("GameOverMenu");
      sm.stop("PauseMenu");
      sm.start("Temple");
      const hud = document.querySelector("#hud");
      if (hud) hud.classList.add("hidden");
      updateHud();
    });
  };
  (globalThis as unknown as Record<string, unknown>).__fwLeaveToMenu = leaveToMenu;
  // 重开（GameOver「再试一次」/暂停菜单「再试一次」/R 键；oracle retry fade("level") :1909660）：
  // 黑幕包络下停面板+发 restart，服务端重置回声链不变。0.3.39 R 键同走此信封（restartWithFade），
  // 键盘/鼠标路径归一。
  (globalThis as unknown as Record<string, unknown>).__fwRestart = restartWithFade;
  // 结算「继续」：原版 Continue 直进下一关（bundle EndMenu 44360 区段）。联机形态
  // = 活房间内 advance 换关（席位保留、双端同跳，2026-10-12 实玩反馈：不再回大厅
  // 重建房间）；无后继或已离房 → 回选关树（原版最后一关无 Continue 后继）。
  (globalThis as unknown as Record<string, unknown>).__fwNextLevel = () => {
    const idx = templeLevels.findIndex((lv) => lv.filename === currentTempleEntry?.filename);
    const next = idx >= 0 ? templeLevels[idx + 1] : undefined;
    const nextId = next?.filename?.split("/").pop()?.replace(".json", "");
    if (net && gameStarted && nextId) {
      net.advance(nextId);
      return;
    }
    leaveToMenu();
  };

  // HUD 轮询由 bindUi 注册一次（性能审计 #3：曾按入房次数叠加永不清理）

  gameStarted = true;
  $("#menu").classList.add("hidden");
  $("#hud").classList.remove("hidden");
  // r5 装载序：等 MenuScene 后台暖装落定（已完成零等待；仍在飞时等它而非让
  // GameScene 重复拉同一批文件）。未启动暖装的路径（邀请深链直进等）立即返回。
  // r8 件1：唤醒放此处（而非连接窗内任意早的位置）——waitForLevelId/fetchLevel 均
  // 网络任务驱动不依赖帧循环，睡眠可覆盖整个 fetch 段；而 bgWarmSettled 的 Loader
  // 队列处理与场景切换都挂在帧循环上，必须先醒。wake() 在合成侧的"补账"（积压
  // 的一帧重合成）随场景切换一并发生，不再插进 fetch 段（实测早醒会拖慢 fetch）。
  phaser?.loop.wake();
  await bgWarmSettled();
  // 切入游戏场景（Game 若已在跑则重启以载入关卡数据）；黑幕包络
  // （oracle LevelMenu.startLevel fade("level") :1935281——选关进关同族）
  const sceneMgr = phaser!.scene;
  fadeSwitch(phaser!, () => {
    sceneMgr.stop("Menu");
    sceneMgr.stop("Temple");
    sceneMgr.stop("Game");
    sceneMgr.start("Game");
  });
  // L-02：刷新/回座进 won 房——早到的 onPhase("won") 因关卡/字体未就绪被前置门拦下，
  // 此处 enterGame 已完成（currentLevel/currentTempleEntry/资源就绪），按权威相位补开结算。
  resumeWonIfNeeded();
}

/** 联机栏房间码（start() 与刷新恢复共用）。房间码琥珀高亮（textContent 串不变——perf/e2e 按 /房间码 ([^（\s]+)/ 提取） */
function fillHudRoom(codeShown: string): void {
  $("#hud-room").replaceChildren(
    "房间码 ",
    Object.assign(document.createElement("b"), { textContent: codeShown }),
    "（密码已校验）",
  );
}

/**
 * 刷新后回座尝试（issue #5 H-04）：sessionStorage 有重连令牌时尝试原席恢复，
 * 成功直进游戏（角色从快照还原——服务端 allowReconnection 不重发 role）；令牌失效
 * 则把联机面板带出来并给明确提示（面板默认藏在画布选关流后面，不主动弹出的话
 * #menu-error 里的提示没人看得见）。
 */
async function tryResume(): Promise<void> {
  const { net: resumed, hadToken } = await Net.tryResume(netHandlers());
  if (!resumed) {
    if (hadToken) {
      if (!selectedLevel) selectedLevel = DEFAULT_LEVEL_ID;
      $("#menu-level").textContent = `已选关卡：${selectedLevel}`;
      $("#menu").classList.remove("hidden");
      show("上次连接已失效，请重新创建或加入房间");
    }
    return;
  }
  net = resumed;
  myRole = resumed.myRole;
  if (myRole) $("#hud-role").textContent = myRole === "fireboy" ? "你扮演：火人" : "你扮演：水女孩";
  fillHudRoom(resumed.room.roomId);
  await enterGame();
}

/** Net 事件回调（start() 与刷新恢复 tryResume 共用；全部只依赖模块级状态） */
function netHandlers(): NetCallbacks {
  return {
    onRole: (role: Role) => {
      $("#hud-role").textContent = role === "fireboy" ? "你扮演：火人" : "你扮演：水女孩";
      myRole = role;
      keyboard?.setRole(role); // 键盘分键（F1）：fb=方向键，wg=W/A/D
      // 场景可能已启动（角色消息晚到），同步给渲染层
      const scene = phaser?.scene.getScene("Game") as import("./scenes/GameScene").GameScene | null;
      scene?.setMyRole(role);
    },
    onDeath: ({ role }) => {
      const name = role === "fireboy" ? "火人" : "水女孩";
      $("#toast").textContent = `${name}化烟了！点「再试一次」重开`;
      setTimeout(() => ($("#toast").textContent = ""), 2000);
    },
    onPauseChanged: ({ paused }) => {
      // F3：服务端权威回声（本端发起也走广播回来）。phase 仍是 started（服务端
      // 玩家暂停不占用 phase=paused——那是断线等待专用词），HUD/键盘暂停闸门不动：
      // 原版暂停期按住的键在恢复瞬间生效（服务端冻结期输入照常入队，恢复即归帧）
      pausedByUser = paused;
      if (paused) phaser?.scene.start("PauseMenu");
      else {
        // 解除暂停走面板弹簧滑出（oracle PauseMenu 继续钮 hide()——:1851068）；
        // 面板未活动（实例未 create，无该方法）则直接停，幂等
        const pm = phaser?.scene.getScene("PauseMenu") as unknown as { requestClose?: () => void } | null;
        if (pm?.requestClose) pm.requestClose();
        else phaser?.scene.stop("PauseMenu");
      }
    },
    onPhase: (phase) => {
      updateHud();
      if (phase === "won") {
        keyboard?.setPaused(true);
        // 正常通路：进入 won 即结算（刷新回座的早到 won 由 enterGame 尾部补开，见 resumeWonIfNeeded）
        openEndMenu();
      } else if (phase === "ready") {
        // 重开（自动/对方 R）时关闭残留结算/失败面板，否则盖住新一轮；结算幂等门复位
        endMenuShown = false;
        phaser?.scene.stop("EndMenu");
        phaser?.scene.stop("GameOverMenu");
      } else if (phase === "gameover") {
        if (!pausedByUser) phaser?.scene.start("GameOverMenu");
      }
    },
    onLevelId: (levelId) => {
      void reloadLevel(levelId);
    },
    // 断线面走独立横幅（issue #5 H-04）：#hud-status 由 updateHud 250ms 轮询覆写，
    // 断线提示写在上面会在半秒内被冲掉；横幅只在显式清空时消失
    onReconnecting: (attempt, max) => {
      setNetLost(`连接已断开，正在重连（${attempt}/${max}）…`);
    },
    onDisconnect: (recovered) => {
      if (recovered) {
        setNetLost(null);
        // L-02：页内重连成功——若断线期间相位已恢复 won 而差分不再触发 onPhase，
        // 按权威快照补开结算（lastFinish 在断线前/补发后均已就位；幂等）
        resumeWonIfNeeded();
        return;
      }
      setNetLost("连接已断开，请刷新页面重新加入");
      show("连接已断开，请刷新页面重新加入");
    },
  };
}

async function start(mode: "create" | "join"): Promise<void> {
  try {
    const password = $<HTMLInputElement>("#password").value;
    if (!password) return show("请输入房间密码");
    // issue #15 L-04 客户端半：最低 4 位与服务端建房门槛（4-64）同口径，短密码在本地即拦
    if (password.length < 4) return show("密码至少 4 位（与对方约定一致即可）");
    const code = $<HTMLInputElement>("#roomcode").value;
    if (mode === "join" && !code.trim()) return show("请输入房间码");

    show("连接中…");
    setNetLost(null);
    setBusy(true);
    net = await Net.connect(
      {
        mode,
        code,
        password,
        // join 也带上（服务端 join 不读，房间以已加载关卡为准）
        levelId: selectedLevel || urlLevel || DEFAULT_LEVEL_ID,
      },
      netHandlers(),
    );
    fillHudRoom(net.room.roomId);
    // 创建者：一键复制邀请链接（issue #16 L-05：不再把密码拼进 URL——链接会进剪贴板/
    // 历史/聊天记录与截图，密码随之泄露。对方打开后房间码已回填，手动输入同一密码加入；
    // ?pw= 深链仍兼容读取，旧书签/脚本不受影响）
    if (mode === "create") {
      const invite = `${location.origin}${location.pathname}?level=${encodeURIComponent(
        selectedLevel || urlLevel || DEFAULT_LEVEL_ID,
      )}&room=${encodeURIComponent(net.room.roomId)}`;
      const btn = document.createElement("button");
      btn.id = "btn-invite";
      btn.type = "button";
      btn.textContent = "复制邀请链接";
      btn.title = "链接只含房间码不含密码：对方打开后填入同一密码加入";
      // 样式统一在 index.html #btn-invite（#hud 整层 none 防挡画布，按钮 pointer-events:auto 单点恢复可点）
      btn.addEventListener("click", () => {
        // 非安全上下文（局域网 http）无 navigator.clipboard：copyText 内特性检测后走
        // execCommand 回退，双失败返 false 且绝不向外抛（逻辑与用例见 clipboard.ts 与
        // __tests__/clipboard.test.ts，M4 验收自动化 2026-10-23）。
        const flash = (text: string): void => {
          btn.textContent = text;
          setTimeout(() => (btn.textContent = "复制邀请链接"), 1500);
        };
        void copyText(invite).then((ok) => flash(ok ? "已复制" : "复制失败"));
      });
      $("#hud-room").appendChild(btn);
    }
    await enterGame();
  } catch (e: any) {
    // 进房成功但进游戏失败（关卡缺失等）→ 退回菜单并释放房间
    setBusy(false);
    // enterGame 半途失败可能已创建输入实例：先释放触屏（经旧键盘发全松），再销毁键盘
    touch?.dispose();
    touch = null;
    keyboard?.destroy();
    keyboard = null;
    if (net && !gameStarted) {
      net.leave();
      net = null;
    }
    const raw = e?.message ?? String(e);
    if (raw.includes("not found")) {
      // Colyseus「room not found」最常见根因：两台设备连的不是同一服务进程
      // （地址/端口不一致，或创建后服务重启过，旧房间已随旧进程消失）
      show("房间不存在或已失效。请核对：两台设备浏览器地址栏完全一致（含端口）；创建者页面未显示断线；期间没有重启过服务器。确认后由创建者重新创建房间再试。");
    } else {
      show(raw);
    }
  }
}


/** 页面加载即启动 Phaser：BootScene → MenuScene（开始界面）→ TempleScene（选关）→ GameScene */
function bootPhaser(): void {
  phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-root",
    // 画布固定 1280×960（原版设计尺寸）：forest 关卡 1248×928 居中后恰为 16px 边距，
    // 与原版逐像素同几何；此前 64px PAD 字边/全出血两案均劣于该案（视觉差分实测，报告 §十一）
    width: 1280,
    height: 960,
    backgroundColor: "#000000",
    // setTimeout 驱动：窗口被遮挡/后台时 rAF 会被浏览器完全冻结（场景队列停摆），此模式保活
    fps: { forceSetTimeOut: true, target: 60 },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // FadeScene 恒居末位=顶景（换屏黑幕，scenes/transition.ts）
    scene: [BootScene, MenuScene, TempleScene, GameScene, PauseMenu, EndMenu, GameOverMenu, SettingsScene, CreditsScene, CompleteScene, FadeScene],
  });
  // 响度对齐原版：game.sound.volume=0.1 全局主音量（bundle 实测），逐键默认 1.0，
  // 仅 waterSteps 0.5 / wind 0.2 / portalLoop 0.3（原版显式覆写）相对生效。
  // T5（14 号档）：fx 开关=全局总静音含 BGM（oracle Boot sound.mute=!settings.fx :2162295）
  phaser.sound.volume = 0.1;
  phaser.sound.mute = !getSettings().fx;
  (globalThis as unknown as Record<string, unknown>).__fw = phaser; // 调试句柄（验收自动化用）
  // 选关 → 弹出联机面板（?level= 深链时面板直接可见，跳过画布选关）
  phaser.registry.set("onLevelPicked", (levelId: string) => {
    selectedLevel = levelId;
    const el = document.querySelector("#menu-level");
    if (el) el.textContent = `已选关卡：${levelId}`;
    setBusy(false); // 换关回面板：上一局的忙态禁用不得残留（否则 journey 二次建房 click 卡死）
    $("#menu").classList.remove("hidden");
  });
  // 返回主菜单：收起联机面板（面板仅属于选关流程；TempleScene 返回钮黑幕 ops 内调用）
  phaser.registry.set("onBackToMenu", () => {
    $("#menu").classList.add("hidden");
  });
  if (selectedLevel) {
    const el = document.querySelector("#menu-level");
    if (el) el.textContent = `已选关卡：${selectedLevel}`;
  } else {
    $("#menu").classList.add("hidden");
  }
}

/** 玩家暂停（F3 翻转，原版 E4 togglePause=game.paused 全场物理冻结）：
 * P 键只向服务端发 pause/resume 请求，置位/解除以 pause-changed 广播为准
 * （onPauseChanged 统一翻画面，双端同一时刻冻结/恢复）。 */
function togglePause(): void {
  if (!gameStarted || !net) return;
  if (pausedByUser) net.resume();
  else net.pause();
}

function bindUi(): void {
  $("#btn-create").addEventListener("click", () => start("create"));
  $("#btn-join").addEventListener("click", () => start("join"));
  // 密码明文切换（issue #15 L-04）：type=password 防旁人偷窥，小钮按需回显自查
  $("#pw-toggle").addEventListener("click", () => {
    const pw = $<HTMLInputElement>("#password");
    const showPw = pw.type === "password";
    pw.type = showPw ? "text" : "password";
    const btn = $("#pw-toggle");
    btn.classList.toggle("shown", showPw);
    btn.setAttribute("aria-pressed", String(showPw));
  });
  // 邀请深链（issue #16 L-05）：房间码回填即用；旧链接带 ?pw= 时才自动加入（延迟一拍让
  // Phaser 初始化先走；失败回落面板可手改）。无深链 → 尝试刷新回座（issue #5 H-04）
  if (inviteRoom) {
    $<HTMLInputElement>("#roomcode").value = inviteRoom;
    if (invitePw) {
      $<HTMLInputElement>("#password").value = invitePw;
      window.setTimeout(() => void start("join"), 300);
    }
  } else {
    void tryResume();
  }
  // HUD 轮询刷新（4Hz 足够，DOM 开销可忽略；模块级单例，重入不叠加）
  setInterval(updateHud, 250);
  bootPhaser();
  // r8 件3：temple.json 预取（enterGame 关键路径 await 恒命中）
  void loadTempleLevels();
  // R 键请求整关重开（E1；服务端按 phase 把关：won/gameover 才受理）
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyP" && gameStarted) togglePause();
    if (e.code === "KeyR" && net) restartWithFade();
  });
}

window.addEventListener("DOMContentLoaded", bindUi);
