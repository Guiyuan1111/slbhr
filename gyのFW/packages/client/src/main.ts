/**
 * 客户端入口：DOM 菜单（创建/加入房间）→ 连接 → 拉关卡 → 启动 Phaser。
 * HUD 用 DOM（计时/钻石/状态提示），画布只负责游戏世界。
 */
import Phaser from "phaser";
import { parseLevel, type LevelData, type Role } from "@fw/shared";
import { Net } from "./net";
import { KeyboardInput } from "./input";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`缺少元素 ${sel}`);
  return el as T;
};

const LEVEL_ID = "forest_01";
/** 关卡四周的岩壁边距（原版 groundTexture 1312×992 = 关卡 +32 边距） */
const LEVEL_PAD = 32;

let phaser: Phaser.Game | null = null;
let net: Net | null = null;
let level: LevelData | null = null;
let keyboard: KeyboardInput | null = null;

async function fetchLevel(id: string): Promise<LevelData> {
  const res = await fetch(`/data/tutorials/levels/${id}.json`);
  if (!res.ok) throw new Error(`关卡下载失败 (${res.status})`);
  const json = await res.json();
  // 图块集引用按 /data 相对路径回源（服务器静态目录与关卡目录相对关系一致）。
  // parseLevel 是同步取用，必须先预取全部图块集再以同步 getter 提供（直接传
  // Promise 会让 tileTypeOf 全部失败，地面/液体类型全部退化为 0）。
  const base = "/data/tutorials/levels/";
  const sources = new Set<string>();
  for (const t of json.tilesets ?? []) if (t?.source) sources.add(String(t.source));
  const resolved = new Map<string, object>();
  await Promise.all(
    [...sources].map(async (s) => {
      resolved.set(s, await fetch(joinUrl(base, s)).then((r) => r.json()));
    }),
  );
  return parseLevel(id, json, (source) => {
    const ts = resolved.get(source);
    if (!ts) throw new Error(`图块集未预取: ${source}`);
    return ts;
  });
}

function joinUrl(base: string, rel: string): string {
  // rel 形如 ../../../assets/tilemaps/tilesets/Ground.json，需要归一化
  const parts = (base + rel).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== "." && p !== "") out.push(p);
  }
  return "/" + out.join("/");
}

function show(err?: string): void {
  $("#menu-error").textContent = err ?? "";
}

function updateHud(): void {
  if (!net) return;
  const st = net.room.state;
  const phase = st.phase as string;
  // 原版观感：计时与钻石计数都在画布内（GameScene ui 层），DOM 只留联机栏与状态
  $("#hud-status").textContent =
    phase === "paused"
      ? "对方断线，等待重连…"
      : phase === "finished"
        ? "通关！"
        : phase === "lobby"
          ? "等待另一位玩家加入…"
          : "";
  $("#hud-status").classList.toggle("warn", phase === "paused");
  keyboard?.setPaused(phase !== "playing");
}

async function enterGame(): Promise<void> {
  level = await fetchLevel(LEVEL_ID);
  show();

  keyboard = new KeyboardInput(window, (input) => net?.sendInput(input));

  phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-root",
    width: level.widthPx + LEVEL_PAD * 2,
    height: level.heightPx + LEVEL_PAD * 2,
    backgroundColor: "#000000",
    // setTimeout 驱动：窗口被遮挡/后台时 rAF 会被浏览器完全冻结（场景队列停摆），此模式保活
    fps: { forceSetTimeOut: true, target: 60 },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, GameScene],
  });
  // 场景数据走全局句柄：Phaser 会自动引导首场景，额外的 start 会造成双重启动竞态
  (globalThis as unknown as Record<string, unknown>).__fwInit = { net, level };
  (globalThis as unknown as Record<string, unknown>).__fw = phaser; // 调试句柄（验收自动化用）

  // HUD 轮询刷新（4Hz 足够，DOM 开销可忽略）
  setInterval(updateHud, 250);

  $("#menu").classList.add("hidden");
  $("#hud").classList.remove("hidden");
}

async function start(mode: "create" | "join"): Promise<void> {
  try {
    const password = $<HTMLInputElement>("#password").value;
    if (!password) return show("请输入房间密码");
    const code = $<HTMLInputElement>("#roomcode").value;
    if (mode === "join" && !code.trim()) return show("请输入房间码");

    show("连接中…");
    net = await Net.connect(
      { mode, code, password, levelId: LEVEL_ID },
      {
        onRole: (role) => {
          $("#hud-role").textContent = role === "fireboy" ? "你扮演：火人（方向键）" : "你扮演：水女孩（WASD）";
          // 场景可能已启动（角色消息晚到），同步给渲染层
          const scene = phaser?.scene.getScene("Game") as import("./scenes/GameScene").GameScene | null;
          scene?.setMyRole(role);
        },
        onDeath: ({ role, cause }) => {
          const name = role === "fireboy" ? "火人" : "水女孩";
          const why = cause === "water" ? "落水" : cause === "lava" ? "碰到岩浆" : "碰到绿浆";
          $("#toast").textContent = `${name}${why}了！`;
          setTimeout(() => ($("#toast").textContent = ""), 2000);
        },
        onWin: () => {
          /* 胜利面板由 updateHud 按 phase 驱动 */
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
    show(e?.message ?? String(e));
  }
}

function bindUi(): void {
  $("#btn-create").addEventListener("click", () => start("create"));
  $("#btn-join").addEventListener("click", () => start("join"));
  $("#btn-restart").addEventListener("click", () => {
    net?.restart();
    keyboard?.setPaused(false);
  });
}

window.addEventListener("DOMContentLoaded", bindUi);
