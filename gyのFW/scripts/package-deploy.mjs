#!/usr/bin/env node
/**
 * 1.0 forest-only 分发打包（release/1.0-forest 分支专用）。
 *
 * 产出可直接部署的 Linux 服务器包：客户端构建产物 + 服务端/共享 TS 源码 +
 * 官方素材与关卡数据（仅第一部）+ 预装生产 node_modules（linux-x64）+ DEPLOY.md。
 *
 * 用法：node scripts/package-deploy.mjs
 * 产出：TEMP/gy-fw-forest-<版本>.tar.gz + 同名 .sha256
 *
 * 剪除规则（"只包括第一部"在打包层收口，分支源码不删三部共用代码）：
 * - data/light|ice、data/tutorials/levels 仅留 forest_01（其余两部首关不入）
 * - assets/atlasses/Temples/{light,ice}、assets/audio/LevelMusic_dark.mp3
 * - dist/data 整删、dist/assets 游戏资产子目录整删（运行时由顶层 /assets /data
 *   路由兜底服务，staticGz 未命中 next() 落到下一条挂载——避免素材双份入包）
 */
import { cpSync, rmSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const version = JSON.parse(await import("node:fs").then(m => m.readFileSync(join(root, "package.json"), "utf8"))).version;
const name = `gy-fw-forest-${version}`;
const stage = join(root, "TEMP", "deploy-stage");
const pkgDir = join(stage, name);

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
execSync("npm ci --omit=dev --no-audit --no-fund", { cwd: pkgDir, stdio: "inherit" });

const out = join(root, "TEMP", `${name}.tar.gz`);
rmSync(out, { force: true });
execSync(`tar -czf ${out} -C ${stage} ${name}`, { stdio: "inherit" });
const sha = execSync(`sha256sum ${out}`).toString().split(" ")[0];
const mb = (statSync(out).size / 1048576).toFixed(1);
execSync(`echo "${sha}  ${name}.tar.gz" > ${out}.sha256`);
console.log(`package-deploy: ${out} (${mb} MiB)`);
console.log(`package-deploy: sha256 ${sha}`);
console.log("package-deploy: 部署指引见包内 DEPLOY.md（Release 说明含同文）");
