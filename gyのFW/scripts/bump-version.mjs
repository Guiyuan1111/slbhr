/**
 * 版本号一键同步（对比报告 #3 修正案：以最小脚本替代 changesets——本仓直推 main、
 * 发版记手写，痛点仅"版本号四处+README+lock 手工同步"）。
 * 用法：node scripts/bump-version.mjs <x.y.z>
 * 范围：根/packages.client/server/shared 四处 package.json（正则原位替换，不重排版），
 *       README "当前版本"行，随后 npm install --package-lock-only 校验 lock 同步。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ver = process.argv[2];
if (!ver || !/^\d+\.\d+\.\d+$/.test(ver)) {
  console.error("用法: node scripts/bump-version.mjs <x.y.z>");
  process.exit(2);
}
const PKGS = ["package.json", "packages/client/package.json", "packages/server/package.json", "packages/shared/package.json"];
let prev = null;
for (const f of PKGS) {
  const raw = readFileSync(f, "utf8");
  const m = raw.match(/"version":\s*"([^"]+)"/);
  if (!m) { console.error(`${f}: 未找到 version 字段`); process.exit(1); }
  if (prev === null) prev = m[1];
  else if (m[1] !== prev) { console.error(`${f} 版本 ${m[1]} 与根 ${prev} 不一致，先手工对齐再 bump`); process.exit(1); }
  writeFileSync(f, raw.replace(/("version":\s*)"[^"]+"/, `$1"${ver}"`));
  console.log(`[bump] ${f}: ${m[1]} -> ${ver}`);
}
const readme = readFileSync("README.md", "utf8");
if (!/^> \*\*当前版本\*\*：\d+\.\d+\.\d+/m.test(readme)) { console.error("README.md: 未匹配「当前版本」行"); process.exit(1); }
writeFileSync("README.md", readme.replace(/^> \*\*当前版本\*\*：\d+\.\d+\.\d+/m, `> **当前版本**：${ver}`));
console.log("[bump] README.md 版本行已更新");
const lock = spawnSync("npm", ["install", "--package-lock-only"], { stdio: "inherit" });
if (lock.status !== 0) { console.error("[bump] package-lock 同步失败"); process.exit(1); }
console.log(`[bump] 完成：${prev} -> ${ver}`);
