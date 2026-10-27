/**
 * 版本号一键同步（对比报告 #3 修正案：以最小脚本替代 changesets——本仓直推 main、
 * 发版记手写，痛点仅"版本号四处+README+lock 手工同步"）。
 *
 * 用法：
 *   node scripts/bump-version.mjs <x.y.z>          同步四处 package.json + README + lock
 *   node scripts/bump-version.mjs --verify         只读校验六处版本一致（CI/发版前检查）
 *
 * 事务化（#38）：先全部读取并校验（四处 version 彼此一致、README 行可匹配），在内存中
 * 生成候选内容后统一写盘；随后同步 package-lock，失败则回滚全部已写文件再退出——
 * 任何一步失败都不会留下半同步状态。
 *
 * 跨平台（#38）：npm 执行优先走 npm_execpath（process.execPath + npm-cli.js，Windows
 * 下绕开 npm.cmd PATHEXT 问题）；环境未提供时回退 spawnSync("npm", …, {shell:true})。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const verifyOnly = args.includes("--verify");
const ver = args.find((a) => a !== "--verify");
if (!verifyOnly && (!ver || !/^\d+\.\d+\.\d+$/.test(ver))) {
  console.error("用法: node scripts/bump-version.mjs <x.y.z> [--verify]");
  process.exit(2);
}

const PKGS = ["package.json", "packages/client/package.json", "packages/server/package.json", "packages/shared/package.json"];

/** 收集六处版本（四处 package.json + README 行 + lock 根/工作区条目） */
function collectVersions() {
  const pkgVersions = PKGS.map((f) => {
    const raw = readFileSync(f, "utf8");
    const m = raw.match(/"version":\s*"([^"]+)"/);
    if (!m) throw new Error(`${f}: 未找到 version 字段`);
    return { f, raw, v: m[1] };
  });
  const readmeRaw = readFileSync("README.md", "utf8");
  const rm = readmeRaw.match(/^> \*\*当前版本\*\*：(\d+\.\d+\.\d+)/m);
  if (!rm) throw new Error("README.md: 未匹配「当前版本」行");
  const lockRaw = readFileSync("package-lock.json", "utf8");
  const lm = lockRaw.match(/"version":\s*"(\d+\.\d+\.\d+)"/);
  if (!lm) throw new Error("package-lock.json: 未找到 version 字段");
  return { pkgVersions, readmeRaw, readmeV: rm[1], lockV: lm[1] };
}

if (verifyOnly) {
  const { pkgVersions, readmeV, lockV } = collectVersions();
  const root = pkgVersions[0].v;
  const bad = [
    ...pkgVersions.filter((p) => p.v !== root).map((p) => `${p.f}=${p.v}`),
    ...(readmeV !== root ? [`README.md=${readmeV}`] : []),
    ...(lockV !== root ? [`package-lock.json=${lockV}`] : []),
  ];
  if (bad.length) {
    console.error(`[verify] 版本不一致（根 ${root}）: ${bad.join(", ")}`);
    process.exit(1);
  }
  console.log(`[verify] 六处版本一致: ${root}`);
  process.exit(0);
}

// ---- 事务化写入：全部校验通过才落盘 ----
const { pkgVersions, readmeRaw } = collectVersions();
const root = pkgVersions[0].v;
const drifted = pkgVersions.filter((p) => p.v !== root);
if (drifted.length) {
  console.error(`${drifted.map((p) => p.f).join(", ")} 与根 ${root} 不一致，先手工对齐再 bump`);
  process.exit(1);
}

const writes = [
  ...pkgVersions.map((p) => ({ f: p.f, old: p.raw, new: p.raw.replace(/("version":\s*)"[^"]+"/, `$1"${ver}"`) })),
  { f: "README.md", old: readmeRaw, new: readmeRaw.replace(/^> \*\*当前版本\*\*：\d+\.\d+\.\d+/m, `> **当前版本**：${ver}`) },
];
for (const w of writes) {
  if (w.new === w.old) {
    console.error(`[bump] ${w.f}: 内容未变化（正则未命中？）——中止，不写任何文件`);
    process.exit(1);
  }
}
for (const w of writes) {
  writeFileSync(w.f, w.new);
  console.log(`[bump] ${w.f}: ${root} -> ${ver}`);
}

/** 跨平台同步 lock：npm_execpath 优先，回退 shell 化 npm（Windows 命中 npm.cmd） */
function syncLock() {
  const execpath = process.env.npm_execpath;
  if (execpath && execpath.endsWith("npm-cli.js")) {
    const r = spawnSync(process.execPath, [execpath, "install", "--package-lock-only"], { stdio: "inherit" });
    return r.status === 0;
  }
  const r = spawnSync("npm", ["install", "--package-lock-only"], { stdio: "inherit", shell: process.platform === "win32" });
  return r.status === 0;
}

if (!syncLock()) {
  console.error("[bump] package-lock 同步失败——回滚全部已写文件");
  for (const w of writes) writeFileSync(w.f, w.old);
  console.error("[bump] 已回滚，仓库保持 bump 前状态");
  process.exit(1);
}
console.log(`[bump] 完成：${root} -> ${ver}`);
