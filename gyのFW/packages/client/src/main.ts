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
import { Net } from "./net";
import { KeyboardInput } from "./input";
import { BootScene } from "./scenes/BootScene";
import { MenuScene } from "./scenes/MenuScene";
import { TempleScene } from "./scenes/TempleScene";
import { GameScene } from "./scenes/GameScene";
import { PauseMenu, EndMenu, GameOverMenu } from "./scenes/overlays";
import { saveBest } from "./progress";

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`缺少元素 ${sel}`);
  return el as T;
};

const DEFAULT_LEVEL_ID = "forest_01";
/** URL ?level= 选关（冻结需求 #12；合法性由服务端校验，非法 id 返回 4404 文案） */
const urlLevel = new URLSearchParams(location.search).get("level") ?? "";
/** 关卡四周的岩壁边距（原版 groundTexture 1312×992 = 关卡 +32 边距） */

let phaser: Phaser.Game | null = null;
/** 选关界面所选关卡（filename 去扩展名）；?level= 深链直通 */
let selectedLevel = urlLevel;
let net: Net | null = null;
let keyboard: KeyboardInput | null = null;
let gameStarted = false;
let pausedByUser = false;
let currentLevel: LevelData | null = null;
/** temple.json 中当前关卡的条目（filename/time/type），结算星级与存档键用 */
let currentTempleEntry: { filename: string; time: number; type: string } | null = null;
/** 已选关卡的星级/通过判定（EndMenu 与 saveBest 共用） */
let lastResult: { stars: number; passed: boolean } | null = null;

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

/** 图块集 source → 根相对 URL（去掉前导 ".."，见 fetchLevel 注释） */
function tilesetUrl(source: string): string {
  const parts = source.split("/");
  while (parts.length > 0 && parts[0] === "..") parts.shift();
  return "/" + parts.join("/");
}

function show(err?: string): void {
  $("#menu-error").textContent = err ?? "";
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
    gameover: "有人化烟了！整关即将重开（按 R 立即重开）",
  };
  $("#hud-status").textContent = text[phase] ?? "";
  $("#hud-status").classList.toggle("warn", phase === "paused" || phase === "gameover");
  keyboard?.setPaused(phase !== "started");
  // 钻石计数（GameScene 写 __fwHudCounts；原版游戏内无计数，DOM 承载以免画布偏离）
  const hudCounts = (globalThis as unknown as Record<string, { red: number; blue: number; silver: number }>).__fwHudCounts;
  const hudTotals = (globalThis as unknown as Record<string, { red: number; blue: number; silver: number }>).__fwHudTotals;
  const diaEl = document.querySelector("#hud-diamonds");
  if (diaEl && hudCounts && hudTotals) {
    const parts = ["红 " + hudCounts.red + "/" + hudTotals.red, "蓝 " + hudCounts.blue + "/" + hudTotals.blue];
    if (hudTotals.silver > 0) parts.push("银 " + hudCounts.silver + "/" + hudTotals.silver);
    diaEl.textContent = parts.join(" · ");
  }
}

async function enterGame(): Promise<void> {
  if (!net) throw new Error("未连接房间");
  // join 方以房间的真实关卡为准（修 E14 双端路径分裂的最后一环）；拿不到回退 URL/默认
  const levelId = (await net.waitForLevelId()) || selectedLevel || urlLevel || DEFAULT_LEVEL_ID;
  const level = await fetchLevel(levelId);
  show();

  keyboard = new KeyboardInput(window, (input) => net?.sendInput(input));

  // 场景数据走全局句柄：Phaser 已随页面启动（Menu/Temple 选关流），此处仅切入 Game
  currentLevel = level;
  // temple.json 条目（time/type/filename）：EndMenu 限时、星级口径、进度存档键都出自这里
  currentTempleEntry = null;
  try {
    const tj = await (await fetch("/data/forest/temple.json")).json();
    const entry = (tj.levels ?? []).find((lv: { filename?: string }) => String(lv.filename ?? "").endsWith(`/${levelId}.json`));
    if (entry) currentTempleEntry = { filename: String(entry.filename), time: Number(entry.time) || 0, type: String(entry.type ?? "general") };
  } catch { /* 缺省 general/无限时，结算仍可用 */ }
  (globalThis as unknown as Record<string, unknown>).__fwInit = { net, level, keyboard };
  (globalThis as unknown as Record<string, unknown>).__fwRestart = () => net?.restart();
  (globalThis as unknown as Record<string, unknown>).__fwPauseKeyboard = (b: boolean) => keyboard?.setPaused(b);
  (globalThis as unknown as Record<string, unknown>).__fwTogglePause = () => togglePause();
  (globalThis as unknown as Record<string, unknown>).__fwSfx = (name: string) => {
    const gs = phaser?.scene.getScene("Game") as unknown as { sfx?: (k: string) => void } | null;
    gs?.sfx?.(name);
  };
  (globalThis as unknown as Record<string, unknown>).__fwLeaveToMenu = () => {
    net?.leave();
    net = null;
    gameStarted = false;
    pausedByUser = false;
    keyboard?.setPaused(true);
    const sm = phaser!.scene;
    sm.stop("Game");
    sm.stop("EndMenu");
    sm.stop("GameOverMenu");
    sm.stop("PauseMenu");
    sm.start("Temple");
    const dia = document.querySelector("#hud-diamonds");
    if (dia) dia.textContent = "";
    const hud = document.querySelector("#hud");
    if (hud) hud.classList.add("hidden");
    updateHud();
  };

  // HUD 轮询由 bindUi 注册一次（性能审计 #3：曾按入房次数叠加永不清理）

  gameStarted = true;
  $("#menu").classList.add("hidden");
  $("#hud").classList.remove("hidden");
  // 切入游戏场景（Game 若已在跑则重启以载入关卡数据）
  const sceneMgr = phaser!.scene;
  sceneMgr.stop("Menu");
  sceneMgr.stop("Temple");
  sceneMgr.stop("Game");
  sceneMgr.start("Game");
}

async function start(mode: "create" | "join"): Promise<void> {
  try {
    const password = $<HTMLInputElement>("#password").value;
    if (!password) return show("请输入房间密码");
    const code = $<HTMLInputElement>("#roomcode").value;
    if (mode === "join" && !code.trim()) return show("请输入房间码");

    show("连接中…");
    net = await Net.connect(
      {
        mode,
        code,
        password,
        // join 也带上（服务端 join 不读，房间以已加载关卡为准）
        levelId: selectedLevel || urlLevel || DEFAULT_LEVEL_ID,
      },
      {
        onRole: (role: Role) => {
          $("#hud-role").textContent = role === "fireboy" ? "你扮演：火人" : "你扮演：水女孩";
          // 场景可能已启动（角色消息晚到），同步给渲染层
          const scene = phaser?.scene.getScene("Game") as import("./scenes/GameScene").GameScene | null;
          scene?.setMyRole(role);
        },
        onDeath: ({ role }) => {
          const name = role === "fireboy" ? "火人" : "水女孩";
          $("#toast").textContent = `${name}化烟了！整关即将重开`;
          setTimeout(() => ($("#toast").textContent = ""), 2000);
        },
        onPhase: (phase) => {
          updateHud();
          if (phase === "won") {
            keyboard?.setPaused(true);
            const f = net?.lastFinish;
            const diaTotal = currentLevel ? currentLevel.diamonds.filter((d) => d.kind !== "silver").length : 0;
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
            if (passed && currentTempleEntry) saveBest(currentTempleEntry.filename, stars, timeSec);
            phaser?.scene.start("EndMenu", {
              diamonds: diaGot,
              diamondsTotal: diaTotal,
              silver: f?.silver ?? 0,
              timeSec,
              timeLimitSec: limit,
              type,
              stars,
            });
          } else if (phase === "gameover") {
            if (!pausedByUser) phaser?.scene.start("GameOverMenu");
          }
        },
        onDisconnect: (recovered) => {
          if (!recovered) {
            show("连接已断开，请刷新页面重新加入");
            $("#hud-status").textContent = "连接已断开";
          }
        },
      },
    );
    const codeShown = net.room.roomId;
    $("#hud-room").textContent = `房间码 ${codeShown}（密码已校验）`;
    await enterGame();
  } catch (e: any) {
    // 进房成功但进游戏失败（关卡缺失等）→ 退回菜单并释放房间
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
    scene: [BootScene, MenuScene, TempleScene, GameScene, PauseMenu, EndMenu, GameOverMenu],
  });
  (globalThis as unknown as Record<string, unknown>).__fw = phaser; // 调试句柄（验收自动化用）
  // 选关 → 弹出联机面板（?level= 深链时面板直接可见，跳过画布选关）
  phaser.registry.set("onLevelPicked", (levelId: string) => {
    selectedLevel = levelId;
    const el = document.querySelector("#menu-level");
    if (el) el.textContent = `已选关卡：${levelId}`;
    $("#menu").classList.remove("hidden");
  });
  if (selectedLevel) {
    const el = document.querySelector("#menu-level");
    if (el) el.textContent = `已选关卡：${selectedLevel}`;
  } else {
    $("#menu").classList.add("hidden");
  }
}

/** 本地暂停（联机对齐 AFK 语义：本地停手，服务端继续） */
function togglePause(): void {
  if (!gameStarted) return;
  pausedByUser = !pausedByUser;
  keyboard?.setPaused(pausedByUser);
  if (pausedByUser) phaser?.scene.start("PauseMenu");
  else phaser?.scene.stop("PauseMenu");
}

function bindUi(): void {
  $("#btn-create").addEventListener("click", () => start("create"));
  $("#btn-join").addEventListener("click", () => start("join"));
  // HUD 轮询刷新（4Hz 足够，DOM 开销可忽略；模块级单例，重入不叠加）
  setInterval(updateHud, 250);
  bootPhaser();
  // R 键请求整关重开（E1；服务端按 phase 把关：won/gameover 才受理）
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyP" && gameStarted) togglePause();
    if (e.code === "KeyR" && net) net.restart();
  });
}

window.addEventListener("DOMContentLoaded", bindUi);
