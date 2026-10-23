/**
 * r37 内容寻址清单的静态网。
 *
 * 版本化 URL 的安全前提只有一条：**v 必须随文件字节变化**。清单若与素材脱节，
 * 服务端会按 immutable 把旧字节钉在浏览器里，且换关链看起来"零请求"（假阴性）。
 * 故这里逐条重算 sha1、核对覆盖集合，并要求 BootScene 的所有链关键 URL 都过
 * versionedAsset——漏一处就退回 304 复验，量具上只表现为"没有收益"。
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ASSET_VERSIONS } from "../asset-versions";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const BOOT = "packages/client/src/scenes/BootScene.ts";

const MECH = readdirSync(path.join(ROOT, "assets/atlasses/mech"))
  .filter((f) => /^MechAssets-[A-Za-z0-9_-]+\.(png|json)$/.test(f))
  .sort();
const FONTS = ["font-roombase.png", "font-roomblank.png", "font.fnt"];
/** r43：开始界面独占四图加入清单（重取走 immutable；DOM 标题图同 URL） */
const MENU_ONLY = [
  "/assets/images/TempleHallForest.jpg",
  "/assets/images/Beam.png",
  "/assets/images/GameNameForest.png",
  "/assets/images/branding/branding_logo_kizi.png",
];

describe("r37 内容寻址清单", () => {
  it("每条哈希等于文件字节 sha1 前 8 位", () => {
    const bad: string[] = [];
    for (const [url, v] of Object.entries(ASSET_VERSIONS)) {
      const sha = createHash("sha1").update(readFileSync(path.join(ROOT, url.slice(1)))).digest("hex").slice(0, 8);
      if (sha !== v) bad.push(`${url} 清单 ${v} ≠ 实算 ${sha}`);
    }
    expect(bad).toEqual([]);
  });

  it("覆盖恰为 24 个机关变体两件 + 三份房内字体 + 四张 Menu 独占图（无漏无多）", () => {
    expect(MECH).toHaveLength(48);
    const expectKeys = [
      ...MECH.map((f) => `/assets/atlasses/mech/${f}`),
      ...FONTS.map((f) => `/assets/fonts/chinese/${f}`),
      ...MENU_ONLY,
    ].sort();
    expect(Object.keys(ASSET_VERSIONS).sort()).toEqual(expectKeys);
    const variants = new Set(MECH.map((f) => f.replace(/\.(png|json)$/, "")));
    expect(variants.size).toBe(24);
    for (const v of variants) {
      expect(ASSET_VERSIONS[`/assets/atlasses/mech/${v}.png`]).toMatch(/^[0-9a-f]{8}$/);
      expect(ASSET_VERSIONS[`/assets/atlasses/mech/${v}.json`]).toMatch(/^[0-9a-f]{8}$/);
      // PNG 与 JSON 各自寻址：任一字节变化都会换 URL，不会出现"新图旧帧"
      expect(ASSET_VERSIONS[`/assets/atlasses/mech/${v}.png`]).not.toBe(
        ASSET_VERSIONS[`/assets/atlasses/mech/${v}.json`],
      );
    }
  });

  it("清单生成器 --check 与在库一致", () => {
    const out = execFileSync(process.execPath, ["scripts/asset-versions.mjs", "--check"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(out).toContain(`${MECH.length + FONTS.length + MENU_ONLY.length} 条与 index.html 同步项逐字节一致`);
  });

  it("BootScene：链关键 URL 全部经 versionedAsset，且清单只有这一处引用", () => {
    const boot = SRC(BOOT);
    expect(boot).toContain('import { ASSET_VERSIONS } from "../asset-versions.js"');
    expect(boot).toContain("export function versionedAsset(url: string): string");
    const fn = (name: string, end: string) => {
      const i = boot.indexOf(name);
      expect(i, name).toBeGreaterThanOrEqual(0);
      return boot.slice(i, boot.indexOf(end, i));
    };
    expect(fn("export function mechAtlasUrls(", "\n}")).toContain("versionedAsset(`${base}.png`)");
    expect(fn("export function mechAtlasUrls(", "\n}")).toContain("versionedAsset(`${base}.json`)");
    expect(fn("export function roomFontPng(", "\n}")).toContain("versionedAsset(");
    expect(boot).toContain('const FONT_FNT = versionedAsset("/assets/fonts/chinese/font.fnt")');
    for (const p of [
      "packages/client/src/main.ts",
      "packages/client/src/scenes/GameScene.ts",
      "packages/client/src/scenes/overlays.ts",
    ]) {
      expect(SRC(p), `${p} 不应直接读清单`).not.toContain("ASSET_VERSIONS");
    }
  });
});
