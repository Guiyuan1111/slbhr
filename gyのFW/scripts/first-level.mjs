#!/usr/bin/env node
/**
 * 从某一部的 temple.json 推导「该部首关」的关卡 id。
 *
 * 为什么不能简单地取第一条：# 原版清单里混着别部的教学关——
 *   - forest 清单：首关 forest_01 在 tutorials/ 下（不在 forest/levels/）
 *   - light  清单：首关 light_01 在 tutorials/ 下，另有一条 initial 指 tutorials/forest_01.json
 *   - ice    清单：第 1 条 initial 竟是 tutorials/light_01.json，真正的首关是第 2 条 ice_02
 * 所以规则是：**在 initial=true 的条目里挑第一个属于本部前缀的**；没有则退到全部条目里
 * 第一个属于本部前缀的；再没有才用清单第一条。
 *
 * 用法：
 *   node scripts/first-level.mjs <temple.json> <temple>
 *   → stdout 输出关卡 id（如 forest_01 / light_01 / ice_02）
 *
 * 复用方：package-deploy.mjs（冒烟开局用）、scripts/verify.mjs（验收开局用）、
 * release-asset CI（解包复验开局用）——三处必须同口径，故实现只有这一份。
 */
import { readFileSync } from "node:fs";

const [jsonPath, temple] = process.argv.slice(2);
if (!jsonPath || !temple) {
  console.error("用法: node scripts/first-level.mjs <temple.json> <temple>");
  process.exit(2);
}

export const idOf = (entry) =>
  String(entry?.filename ?? "")
    .split("/")
    .pop()
    ?.replace(/\.json$/, "") ?? "";
export const isOwn = (entry, temple) => idOf(entry).startsWith(`${temple}_`);

const j = JSON.parse(readFileSync(jsonPath, "utf8"));
const levels = j.levels ?? [];
const pick =
  levels.find((l) => l.initial && isOwn(l, temple)) ??
  levels.find((l) => isOwn(l, temple)) ??
  levels[0];
const id = idOf(pick);
if (!id) {
  console.error(`first-level: ${jsonPath} 里找不到可用关卡条目`);
  process.exit(1);
}
console.log(id);
