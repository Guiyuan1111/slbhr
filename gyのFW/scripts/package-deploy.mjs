#!/usr/bin/env node
/**
 * 1.0 forest-only 分发打包（release/1.0-forest 分支专用）。
 *
 * 产出可直接部署的 Linux 服务器包：客户端构建产物 + **预转译的服务端/共享 JS** +
 * 官方素材与关卡数据（仅第一部）+ 预装生产 node_modules（linux-x64）+ DEPLOY.md。
 *
 * 用法：node scripts/package-deploy.mjs [--no-smoke]
 * 产出：TEMP/gy-fw-forest-<版本>.tar.gz + 同名 .sha256
 *
 * ## 为什么服务端要预转译（#51）
 *
 * 旧包发 TS 源码、让目标机用 `node --import tsx` 跑。tsx 4.x 的 **ESM loader 不读
 * tsconfig 的 useDefineForClassFields**（归一化只存在于 CJS require 钩子），于是
 * `x!: number` 按 ES2022 define 语义编成原生 class field，覆盖 Colyseus schema 在
 * 实例上装的访问器 → 变更不进 ChangeTree → 首次增量广播 encodeValue 读不到类型
 * 元数据崩溃 → 整进程带崩、玩家卡 loading。包内恰不含 tsconfig，故必现。
 *
 * 现在改为**构建期**用 esbuild 转译成 .js 再入包：
 * - 目标机不再需要 tsx，`node packages/server/src/index.js` 直跑；
 * - 转译参数由本仓库锁定（tsconfigRaw 显式 useDefineForClassFields:false 兜底，
 *   配合 state.ts 的 `declare` 字段双重保险）；
 * - **逐文件转译不打包**：`import.meta.url` 的路径锚点（ROOT / vendor/box2d.js /
 *   TEMP）全部天然保持正确，不需要任何路径 hack，目录布局与源码期完全一致。
 *
 * ## 剪除规则（"只包括第一部"在打包层收口，分支源码不删三部共用代码）
 * - data/light|ice、data/tutorials/levels 仅留 forest_01（其余两部首关不入）
 * - assets/atlasses/Temples/{light,ice}、assets/audio/LevelMusic_dark.mp3
 * - dist/data 整删、dist/assets 游戏资产子目录整删（运行时由顶层 /assets /data
 *   路由兜底服务，staticGz 未命中 next() 落到下一条挂载——避免素材双份入包）
 */
import { cpSync, rmSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("..", import.meta.url));
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const name = `gy-fw-forest-${version}`;
const stage = join(root, "TEMP", "deploy-stage");
const pkgDir = join(stage, name);
const noSmoke = process.argv.includes("--no-smoke");

if (!existsSync(join(root, "packages/client/dist/index.html"))) {
  console.error("package-deploy: 缺 packages/client/dist——先 npm run build");
  process.exit(1);
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(pkgDir, { recursive: true });

/** 剪除规则生效后的整树复制 */
const cp = (src, dst) => {
  if (!existsSync(src)) throw new Error(`缺少 ${src}`);
  cpSync(src, dst, { recursive: true });
};
const rm = (p) => rmSync(join(pkgDir, p), { recursive: true, force: true });

cp(join(root, "package.json"), join(pkgDir, "package.json"));
cp(join(root, "package-lock.json"), join(pkgDir, "package-lock.json"));
// tsconfig 随包：本包已预转译，不需要它才能跑；保留是给"重装依赖后自行再转译/Rebuild"
// 留说明书，也是 useDefineForClassFields:false 这一约定的载体（#51 根因）。
cp(join(root, "tsconfig.json"), join(pkgDir, "tsconfig.json"));
cp(join(root, "DEPLOY.md"), join(pkgDir, "DEPLOY.md"));
cp(join(root, "packages/server"), join(pkgDir, "packages/server"));
cp(join(root, "packages/shared"), join(pkgDir, "packages/shared"));
cp(join(root, "packages/client"), join(pkgDir, "packages/client"));
cp(join(root, "assets"), join(pkgDir, "assets"));
cp(join(root, "data"), join(pkgDir, "data"));

// workspace 目录里不随包的东西：server/shared 的 __tests__、client 的 src 与 public
for (const p of [
  "packages/server/src/__tests__",
  "packages/shared/src/__tests__",
  // packages/shared/__tests__ 是 src 之外的旧位置测试（#51 复核发现漏剪）
  "packages/shared/__tests__",
  "packages/client/src",
  "packages/client/public",
  "packages/client/node_modules",
  "packages/server/node_modules",
  "packages/shared/node_modules",
  "packages/client/dist/data",
  "packages/client/dist/assets/atlasses",
  "packages/client/dist/assets/audio",
  "packages/client/dist/assets/fonts",
  "packages/client/dist/assets/images",
  "packages/client/dist/assets/tilemaps",
  "assets/atlasses/Temples/light",
  "assets/atlasses/Temples/ice",
  "assets/audio/LevelMusic_dark.mp3",
  "data/light",
  "data/ice",
]) rm(p);

// tutorials 只留第一部首关（LEVEL_DIRS 兜底目录里 forest_01 在此）
const tut = join(pkgDir, "data/tutorials/levels");
for (const f of readdirSync(tut)) {
  if (f !== "forest_01.json") rmSync(join(tut, f));
}

// 预装生产依赖（包内 node_modules 直接可用；目标平台 linux-x64）
execFileSync("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], { cwd: pkgDir, stdio: "inherit" });

// ---- 服务端预转译：TS → 同目录 .js（逐文件，不打包）----
const require_ = createRequire(import.meta.url);
const esbuild = require_(join(root, "node_modules", "esbuild"));
await esbuild.build({
  entryPoints: ["packages/server/src/**/*.ts", "packages/shared/src/**/*.ts"],
  outbase: ".",
  outdir: ".",
  absWorkingDir: pkgDir,
  // 逐文件转译：相对导入保持原样（源码里已全部写成 .js 后缀），
  // import.meta.url 锚点在运行时指向同目录，故 ROOT/vendor/TEMP 全部不受影响。
  bundle: false,
  format: "esm",
  platform: "node",
  target: "node22",
  logLevel: "warning",
  // 兜底：即使将来有新字段忘了写 declare，转译产物也不会生成原生 class field
  tsconfigRaw: { compilerOptions: { useDefineForClassFields: false } },
});
// 删掉 TS 源码：包里只留可直跑的 .js（避免有人又走 tsx 路径踩同一个坑）
const walk = (dir, out = []) => {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".ts")) out.push(p);
  }
  return out;
};
for (const f of [...walk(join(pkgDir, "packages/server/src")), ...walk(join(pkgDir, "packages/shared/src"))]) {
  rmSync(f);
}
// workspace 子路径导出改指 .js（同目录，路径语义与源码期一致）
const sharedPkgPath = join(pkgDir, "packages/shared/package.json");
const sharedPkg = JSON.parse(readFileSync(sharedPkgPath, "utf8"));
for (const k of Object.keys(sharedPkg.exports)) sharedPkg.exports[k] = sharedPkg.exports[k].replace(/\.ts$/, ".js");
writeFileSync(sharedPkgPath, JSON.stringify(sharedPkg, null, 2) + "\n");

// ---- 产物自检：包能不能真「开局」（#51 的验收盲区就在这一步）----
// 六步验收的 ⑥ 只 create→leave，房间状态从未广播过增量，所以「能起服不能开局」
// 完全隐形。这里直接跑 deploy-smoke：建房 + patch 持续 + 进程存活 + 浏览器进 Game。
if (!noSmoke) {
  const smokePort = Number(process.env.FW_PKG_SMOKE_PORT ?? 2599);
  const smokeArgs = [
    join(root, "scripts/e2e/deploy-smoke.mjs"),
    "--serve-dir", pkgDir,
    "--port", String(smokePort),
    "--window", "8000",
  ];
  // 本机/CI 有 playwright 才带浏览器用例；包里没有 playwright，故只在这里判断
  let hasPlaywright = true;
  try { require_.resolve("playwright"); } catch { hasPlaywright = false; }
  if (!hasPlaywright) smokeArgs.push("--no-browser");
  execFileSync(process.execPath, smokeArgs, { cwd: root, stdio: "inherit" });
}

const out = join(root, "TEMP", `${name}.tar.gz`);
rmSync(out, { force: true });
execFileSync("tar", ["-czf", out, "-C", stage, name], { stdio: "inherit" });
const sha = execFileSync("sha256sum", [out], { encoding: "utf8" }).split(" ")[0];
const mb = (statSync(out).size / 1048576).toFixed(1);
writeFileSync(`${out}.sha256`, `${sha}  ${name}.tar.gz\n`);
console.log(`package-deploy: ${out} (${mb} MiB)`);
console.log(`package-deploy: sha256 ${sha}`);
console.log("package-deploy: 部署指引见包内 DEPLOY.md（Release 说明含同文）");
