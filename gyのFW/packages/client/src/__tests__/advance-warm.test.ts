/**
 * r36 换关字节预热的静态网。
 *
 * 换关链（结算「继续」→ 下一关可玩）在 r13 后只剩两类**必须现拉**的字节：机关变体
 * PNG/JSON（每关必换）与房内字体 PNG（只在 roombase↔blank 变体切换时）。r36 在 won 空闲窗
 * 用 `fetch(..., {cache:"force-cache"})` 先把它们灌进 HTTP 缓存；r37 起这些 URL 带内容哈希
 * `?v=` 与 immutable，链上 Phaser 按同一 URL 声明即零请求（不再有 304 复验）。
 *
 * 失效模式都不报错：
 *  1) 预热 URL 与 preload 装载 URL 分叉 ⇒ 预热了另一份文件，链上照旧现拉，白耗带宽且
 *     "看起来没效果"——两处必须共用 mechAtlasUrls/roomFontPng（本测试钉死唯一字面量）；
 *  2) 把建场后资源（音乐/结算板）混进预热 ⇒ 与 preload 抢管道（r34 件2 实测拖慢进房 1.3s）；
 *  3) 预热改成建纹理/动键 ⇒ 引擎侧正确性开始依赖预热（本函数必须只碰 HTTP 缓存）；
 *  4) 预热 URL 指向不存在的变体文件 ⇒ 静默 404，链上仍现拉。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { inspect } from "../../../../scripts/atlas-slim/needs.mjs";
import { mechVariantId } from "@fw/shared/mech-needs";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const BOOT = "packages/client/src/scenes/BootScene.ts";
const MAIN = "packages/client/src/main.ts";
const GAME = "packages/client/src/scenes/GameScene.ts";
const OVERLAYS = "packages/client/src/scenes/overlays.ts";

/** 从源码里截一个顶层函数体（含签名），用于"只碰 HTTP 缓存"这类负面断言 */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `找不到 ${name}`).toBeGreaterThanOrEqual(0);
  const end = src.indexOf("\n}\n", start);
  expect(end, `${name} 未闭合`).toBeGreaterThan(start);
  return src.slice(start, end + 3);
}

describe("r36 换关字节预热", () => {
  let needs: Awaited<ReturnType<typeof inspect>>;
  beforeAll(async () => {
    needs = await inspect(ROOT);
  });

  it("每关的机关变体 PNG/JSON 都在库（预热目标不是空 URL）", () => {
    expect(needs.levels.length).toBe(48);
    const seen = new Set<string>();
    for (const l of needs.levels) {
      const id = mechVariantId(l.parsed);
      seen.add(id);
      for (const ext of ["png", "json"]) {
        const f = `assets/atlasses/mech/MechAssets-${id}.${ext}`;
        expect(existsSync(path.join(ROOT, f)), `${l.filename} → ${f}`).toBe(true);
      }
    }
    // 任务口径的 24 个变体：数量漂移意味着预热/装载的键面变了，报告需要重算
    expect(seen.size).toBe(24);
  });

  it("房内字体两变体 PNG 在库，fnt 元数据共用一份", () => {
    for (const f of [
      "assets/fonts/chinese/font-roombase.png",
      "assets/fonts/chinese/font-roomblank.png",
      "assets/fonts/chinese/font.fnt",
    ]) {
      expect(existsSync(path.join(ROOT, f)), f).toBe(true);
    }
  });

  it("装载与预热共用同一 URL 构造：字面量只允许出现在 BootScene", () => {
    const boot = SRC(BOOT);
    expect(boot.split("/assets/atlasses/mech/MechAssets-").length - 1, "机关变体路径字面量").toBe(1);
    expect(boot.split("/assets/fonts/chinese/font-roombase.png").length - 1, "roombase 字面量").toBe(1);
    expect(boot.split("/assets/fonts/chinese/font-roomblank.png").length - 1, "roomblank 字面量").toBe(1);
    for (const p of [MAIN, GAME, OVERLAYS]) {
      const s = SRC(p);
      expect(s, `${p} 不应自拼机关变体路径`).not.toContain("/assets/atlasses/mech/MechAssets-");
      expect(s, `${p} 不应自拼房内字体 PNG`).not.toContain("/assets/fonts/chinese/font-room");
    }
    expect(boot).toContain("export function mechAtlasUrls(");
    expect(boot).toContain("export function roomFontPng(");
    expect(boot).toContain("load.atlas(ATLAS_MECH, png, json)");
    expect(boot).toContain("load.bitmapFont(key, roomFontPng(key), FONT_FNT)");
  });

  it("预热集 = 机关变体两件 + 仅变体切换时的房内字体 PNG", () => {
    const warm = fnBody(SRC(MAIN), "warmNextLevelBytes");
    expect(warm).toContain("mechAtlasUrls(mechVariantId(lv))");
    expect(warm).toContain("if (nextFont !== roomFontKey(currentTempleEntry?.filename))");
    expect(warm).toContain("urls.push(roomFontPng(nextFont))");
    expect(warm).toContain(`fetch(url, { cache: "force-cache" })`);
  });

  it("预热只碰 HTTP 缓存：不建纹理、不动键、不混入建场后资源", () => {
    const warm = fnBody(SRC(MAIN), "warmNextLevelBytes");
    for (const bad of [
      ".textures", ".anims", "load.atlas", "load.bitmapFont", "loadMechAtlas", "loadRoomFont",
      "prepareGround", "LevelMusic", "PopupFinish", "chars-play", "font.fnt",
    ]) {
      expect(warm, `预热不得出现 ${bad}`).not.toContain(bad);
    }
  });

  it("预热在 fetch 落地时立即起跳，地面烘焙仍留 500ms 定时器", () => {
    const prefetch = fnBody(SRC(MAIN), "prefetchNextLevel");
    const warmAt = prefetch.indexOf("if (phaser) warmNextLevelBytes(lv, next.filename);");
    const timerAt = prefetch.indexOf("groundPrefetchTimer = window.setTimeout(");
    expect(warmAt, "预热调用").toBeGreaterThanOrEqual(0);
    expect(timerAt, "烘焙定时器").toBeGreaterThanOrEqual(0);
    expect(warmAt, "预热必须在定时器之外、fetch 落地即起跳").toBeLessThan(timerAt);
    expect(prefetch).toContain("GameScene.prepareGround(nextId, lv, phaser.textures)");
    expect(prefetch).toContain("}, 500);");
  });
});
