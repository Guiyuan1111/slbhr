// window 渲染验证探针：打开 3700 的 forest_bonus_1，从 Phaser 显示列表取证窗框对象。
// 用法：node --import tsx note/evidence/forest_bonus_1/tools/verify-window.mjs（本文件，2026-10-27 自 TEMP/parity-fix 改指）
// 输出：窗框容器/子对象的存在性、帧名、世界坐标、可见性、缩放；并对照 level.windows 数据算期望位。
import { chromium } from "playwright";

const URL = "http://127.0.0.1:3700/?level=forest_bonus_1";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 1000 } });
const warnings = [];
page.on("console", (m) => {
  if (m.type() === "warning" || m.type() === "error") warnings.push(`${m.type()}: ${m.text()}`);
});
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000); // Boot→Menu→深链面板可见
await page.fill("#password", "e2e-pw");
await page.click("#btn-create");
await page.waitForTimeout(8000); // 建房→GameScene 建场景+素材

const report = await page.evaluate(() => {
  const game = globalThis.__fw;
  if (!game) return { error: "__fw 不存在" };
  const scene = game.scene.getScenes(true)[0] ?? game.scene.getScenes().find((s) => s.scene.key === "Game");
  if (!scene) return { error: "无活跃场景", keys: game.scene.getScenes().map((s) => s.scene.key) };
  const out = { sceneKey: scene.scene.key, windows: [], levelData: null, missing: [] };
  const d = scene.d ?? scene.data?.get?.("d");
  const lvl = d?.level ?? scene.level;
  if (lvl?.windows) out.levelData = lvl.windows;
  const walk = (list, depth) => {
    for (const go of list ?? []) {
      const tex = go.texture?.key;
      if (tex === "mech" && /Window|_default/.test(String(go.frame?.name))) {
        const par = go.parentContainer;
        out.windows.push({
          frame: go.frame?.name,
          x: Math.round(go.x * 10) / 10,
          y: Math.round(go.y * 10) / 10,
          scaleX: Math.round(go.scaleX * 1000) / 1000,
          visible: go.visible,
          parent: par
            ? {
                x: Math.round(par.x * 10) / 10,
                y: Math.round(par.y * 10) / 10,
                angle: par.angle,
                scaleX: Math.round(par.scaleX * 1000) / 1000,
                depth: par.depth,
              }
            : null,
        });
      }
      if (go.list) walk(go.list, depth + 1);
    }
  };
  walk(scene.children?.list, 0);
  return out;
});
console.log(JSON.stringify(report, null, 1));
console.log("console 警告/错误数:", warnings.length);
for (const w of warnings.slice(0, 6)) console.log("  ", w.slice(0, 160));
await browser.close();
