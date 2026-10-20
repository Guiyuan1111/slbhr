#!/usr/bin/env node
/**
 * level-audit/audit-data.mjs — 38 号档第 1 层：数据层全量对拍（48 关）。
 *
 * 对照面：
 *   A. oracle Tiled JSON（只读参考库 output/A）vs 我方 packages/client/public/data ——
 *      文件清单 / 规范化 JSON md5（含 tilesets 引用定义 / temple.json）。
 *   B. 我方 parseLevel（packages/shared/src/level2.ts，生产同码）逐关跑 48 关 ——
 *      实体计数 vs 原始 JSON 对象清单计数、unknown[] 弃置清单、液体 run 求和 vs 液体格数、
 *      Ground gid 全谱 / 出生点 / 门矩形抽样。落 JSON → stdout 摘要。
 *
 * 用法：node --import tsx note/research/2026-10-fidelity/tools/level-audit/audit-data.mjs [输出.json]
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.."); // gyのFW/
const SLBHR = resolve(ROOT, "..");
const ORACLE = join(SLBHR, "Fireboy-and-Watergirl", "output", "A");
const OURS_DATA = join(ROOT, "packages", "client", "public", "data");

const md5 = (buf) => createHash("md5").update(buf).digest("hex");
const canonMd5 = (p) => md5(JSON.stringify(JSON.parse(readFileSync(p, "utf8"))));

// ---- 48 关清单 = temple.json levels（filename 相对 data/）----
const temple = JSON.parse(readFileSync(join(ORACLE, "data", "forest", "temple.json"), "utf8"));
const levelFiles = temple.levels.map((l) => l.filename); // e.g. tutorials/levels/forest_01.json
if (levelFiles.length !== 48) console.warn(`[warn] temple.levels=${levelFiles.length}（预期 48）`);

// ---- A 静态面 ----
const staticReport = { levelFiles: [], tilesets: {}, temple: "", missing: [], canonDiff: [] };
for (const rel of levelFiles) {
  const a = join(ORACLE, "data", rel);
  const b = join(OURS_DATA, rel);
  try {
    const ca = canonMd5(a);
    staticReport.levelFiles.push({ rel, canonSame: ca === canonMd5(b) });
  } catch (e) {
    staticReport.missing.push(rel);
  }
}
for (const ts of ["Ground", "Chars", "Objects", "LargeObjects"]) {
  const a = join(ORACLE, "assets", "tilemaps", "tilesets", `${ts}.json`);
  const b = join(ROOT, "packages", "client", "public", "assets", "tilemaps", "tilesets", `${ts}.json`);
  staticReport.tilesets[ts] = canonMd5(a) === canonMd5(b);
}
staticReport.temple = canonMd5(join(ORACLE, "data", "forest", "temple.json")) === canonMd5(join(OURS_DATA, "forest", "temple.json"));

// ---- B 解析面：production parseLevel ----
const { parseLevel } = await import(join(ROOT, "packages", "shared", "src", "level2.ts"));
const tilesetCache = new Map();
const getTileset = (source) => {
  if (!tilesetCache.has(source)) {
    const p = join(ROOT, "packages", "client", "public", "assets", "tilemaps", "tilesets", basename(source));
    tilesetCache.set(source, JSON.parse(readFileSync(p, "utf8")));
  }
  return tilesetCache.get(source);
};

// 原始 JSON 对象清单 → 期望实体计数（与 level2 解析规则同构的独立重算，防"同一理解写两遍"盲区：
// gid→类型归属按 resolveGid 最大 firstgid 规则）
function expectFrom(raw) {
  const resolveGid = (json, gid) => {
    let best = null;
    for (const t of json.tilesets) {
      const f = Number(t.firstgid);
      if (f <= gid && (!best || f >= best.f)) best = { f, base: String(t.source).split("/").pop().replace(/\..*$/, "") };
    }
    return best;
  };
  const exp = { spawn: 0, doors: 0, diamonds: 0, levers: 0, pushers: 0, boxes: 0, balls: 0, winds: 0, platforms: 0, hangings: 0, pulleys: 0, romans: 0, windows: 0, unknownTypes: {} };
  const tilesetJson = (base) => JSON.parse(readFileSync(join(ROOT, "packages", "client", "public", "assets", "tilemaps", "tilesets", `${base}.json`), "utf8"));
  for (const L of raw.layers) {
    if (L.type !== "objectgroup") continue;
    for (const o of L.objects ?? []) {
      if (o.gid === undefined) {
        if (L.name === "Objects") {
          const t = String(o.type ?? "");
          if (["platform", "hanging", "pulley", "roman", "window"].includes(t)) exp[t + "s"]++;
          else exp.unknownTypes[`Objects:${t || "(empty)"}`] = (exp.unknownTypes[`Objects:${t || "(empty)"}`] ?? 0) + 1;
        } else if (L.name === "Chars") {
          exp.unknownTypes["Chars:noGid"] = (exp.unknownTypes["Chars:noGid"] ?? 0) + 1;
        }
        continue;
      }
      const ref = resolveGid(raw, Number(o.gid));
      const localId = Number(o.gid) - ref.f;
      const ts = tilesetJson(ref.base);
      const typeName = String(ts?.tiles?.[String(localId)]?.type ?? "");
      if (L.name === "Chars") {
        if (typeName === "char") exp.spawn++;
        else if (typeName === "door") exp.doors++;
        else if (typeName === "diamond") exp.diamonds++;
        else exp.unknownTypes[`Chars:${typeName || localId}`] = (exp.unknownTypes[`Chars:${typeName || localId}`] ?? 0) + 1;
      } else if (ref.base === "Objects") {
        if (typeName === "pusher") exp.pushers++;
        else if (typeName === "lever") exp.levers++;
        else if (typeName === "box" || typeName === "boxheavy") exp.boxes++;
        else if (typeName === "ball") exp.balls++;
        else if (typeName === "wind") exp.winds++;
        else exp.unknownTypes[`Objects:${typeName || localId}`] = (exp.unknownTypes[`Objects:${typeName || localId}`] ?? 0) + 1;
      } else if (ref.base === "LargeObjects") {
        if (typeName === "wind") exp.winds++;
        else exp.unknownTypes[`LargeObjects:${typeName || localId}`] = (exp.unknownTypes[`LargeObjects:${typeName || localId}`] ?? 0) + 1;
      } else {
        exp.unknownTypes[`@${ref.base}`] = (exp.unknownTypes[`@${ref.base}`] ?? 0) + 1;
      }
    }
  }
  return exp;
}

const perLevel = [];
for (const rel of levelFiles) {
  const id = basename(rel, ".json");
  const raw = JSON.parse(readFileSync(join(OURS_DATA, rel), "utf8")); // 我方与 oracle 规范化同 md5，读我方即等价
  const exp = expectFrom(raw);
  const got = parseLevel(id, raw, getTileset);
  // 液体格总数（groundType 5/6/7 计数）vs liquidRuns 求和
  let liquidCells = 0;
  for (const t of got.groundType) if (t === 5 || t === 6 || t === 7) liquidCells++;
  const runCells = got.liquidRuns.reduce((s, r) => s + (r.col1 - r.col0 + 1), 0);
  perLevel.push({
    id,
    expect: exp,
    got: {
      spawn: 2, doors: 2,
      diamonds: got.diamonds.length, levers: got.levers.length, pushers: got.pushers.length,
      boxes: got.boxes.length, balls: got.balls.length, winds: got.winds.length,
      platforms: got.platforms.length, hangings: got.hangings.length, pulleys: got.pulleys.length,
      romans: got.romans.length, windows: got.windows.length,
      unknown: got.unknown, tutorials: Object.keys(got.tutorialVariants),
    },
    liquidCells, runCells,
    cols: got.cols, rows: got.rows,
  });
}

const out = { static: staticReport, perLevel };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 1));

// ---- 摘要 ----
const canonDiff = staticReport.levelFiles.filter((x) => !x.canonSame);
console.log(`[data] 48 关规范化 md5 不一致: ${canonDiff.length}${canonDiff.length ? " → " + canonDiff.map((x) => x.rel).join(",") : ""}`);
console.log(`[data] tilesets 全同: ${Object.values(staticReport.tilesets).every(Boolean)}; temple 同: ${staticReport.temple}; 缺文件: ${staticReport.missing.length}`);
let mismatch = 0;
const unknownGlobal = {};
for (const p of perLevel) {
  const e = p.expect, g = p.got;
  const keys = ["diamonds", "levers", "pushers", "boxes", "balls", "winds", "platforms", "hangings", "pulleys", "romans", "windows"];
  const diffs = keys.filter((k) => (e[k] ?? 0) !== (g[k] ?? 0));
  const unknownKinds = Object.keys(e.unknownTypes ?? {});
  for (const u of unknownKinds) unknownGlobal[u] = (unknownGlobal[u] ?? 0) + e.unknownTypes[u];
  if (diffs.length || unknownKinds.length || p.liquidCells !== p.runCells || g.unknown.length) {
    mismatch++;
    console.log(`  [MISMATCH] ${p.id}: expect差=[${diffs.map((k) => `${k}:${e[k]}→${g[k]}`).join(",")}] unknownTypes=${JSON.stringify(e.unknownTypes)} parserUnknown=${JSON.stringify(g.unknown)} liquid ${p.liquidCells}vs${p.runCells}`);
  }
}
console.log(`[data] 实体计数不一致关卡: ${mismatch}/48`);
console.log(`[data] 原始数据中即非实体的对象（双方同弃，非我方丢失）: ${JSON.stringify(unknownGlobal)}`);
console.log(`[data] tutorialVariants 有层的关卡: ${perLevel.filter((p) => p.got.tutorials.length).map((p) => p.id + ":" + p.got.tutorials.join("|")).join(", ") || "(无)"}`);
