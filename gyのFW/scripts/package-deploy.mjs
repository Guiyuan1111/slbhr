#!/usr/bin/env node
/**
 * 单部神庙分发打包（1.x=forest / 2.x=light / 3.x=ice 共用同一套脚本）。
 *
 * 产出可直接部署的 Linux 服务器包：客户端构建产物 + **预转译的服务端/共享 JS** +
 * 官方素材与关卡数据（仅指定的一部）+ 预装生产 node_modules（linux-x64）+ DEPLOY.md。
 *
 * 用法：
 *   node scripts/package-deploy.mjs [--temple forest|light|ice] [--no-smoke] [--plan]
 *   --plan    只打印解析后的打包计划（包名 / 剪裁集 / 教学关保留集），不落盘不构建
 *
 * 产出：TEMP/gy-fw-<temple>-<版本>.tar.gz + 同名 .sha256
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
 * ## 剪除规则（"只含一部"在打包层收口，分支源码不删三部共用代码）
 *
 * 剪裁以**该部 temple.json 清单**为准，而非硬编码文件名：清单引用了哪些关卡文件
 * （含 tutorials/ 下的首关与隐含关），就保留哪些。这样第二部/第三部在清单里引用
 * 别部首关（light 清单含 tutorials/forest_01.json、ice 清单含 forest_01+light_01）
 * 时不会把该关剪掉——那是该部自己的内容，不是越界。
 *
 * - data/ 下非本部目录整删；data/tutorials/levels 只留本部清单引用到的文件
 * - assets/atlasses/Temples/ 下非本部目录整删
 * - 本部不使用的 BGM 变体（dark 族仅 light 部有：7 关 type=dark）
 * - dist/data 整删、dist/assets 游戏资产子目录整删（运行时由顶层 /assets /data
 *   路由兜底服务，staticGz 未命中 next() 落到下一条挂载——避免素材双份入包）
 *
 * ## 房间名为什么不随部改名
 *
 * `gameServer.define("forest", …)` / `client.create("forest", …)` 里的 "forest" 是
 * Colyseus 的 room type key，不是用户可见的东西。改名要同时改服务端源码与已构建的
 * 客户端 dist（每部重新构建），收益为零、风险是在两条线上制造协议漂移。故全线统一
 * 保持 `forest` 作为稳定协议常量。
 */
import { cpSync, rmSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

/** 各部的剪裁表。数据边界一律由 temple.json 清单推导，这里只放清单推不出的两件事：
 *  目录级剪裁（别部的 data/图集目录）与本部用不到的 BGM 变体。 */
const TEMPLES = {
  forest: { data: ["light", "ice"], audio: ["LevelMusic_dark.mp3"], label: "第一部森林神庙" },
  light: { data: ["forest", "ice"], audio: [], label: "第二部灯光神庙" },
  ice: { data: ["forest", "light"], audio: ["LevelMusic_dark.mp3"], label: "第三部冰雪神庙" },
};

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const TEMPLE = argOf("temple", "forest");
const PLAN_ONLY = args.includes("--plan");
const noSmoke = args.includes("--no-smoke");

if (!TEMPLES[TEMPLE]) {
  console.error(`package-deploy: 未知 --temple=${TEMPLE}（可选 ${Object.keys(TEMPLES).join(" / ")}）`);
  process.exit(1);
}
const T = TEMPLES[TEMPLE];

const root = fileURLToPath(new URL("..", import.meta.url));
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const name = `gy-fw-${TEMPLE}-${version}`;
const stage = join(root, "TEMP", "deploy-stage");
const pkgDir = join(stage, name);

/** 本部 temple.json 清单引用的全部关卡 id（含 tutorials/ 下的首关与隐含关） */
function manifestLevelIds() {
  const p = join(root, "data", TEMPLE, "temple.json");
  if (!existsSync(p)) throw new Error(`缺少 ${p}`);
  const j = JSON.parse(readFileSync(p, "utf8"));
  const ids = new Set();
  const tutorials = new Set();
  for (const lv of j.levels ?? []) {
    const f = String(lv.filename ?? "");
    const id = basename(f).replace(/\.json$/, "");
    if (id) ids.add(id);
    if (f.startsWith("tutorials/")) tutorials.add(basename(f));
  }
  return { ids: [...ids].sort(), tutorials: [...tutorials].sort() };
}

const manifest = manifestLevelIds();
/** 本部首关（冒烟开局用）：与 verify.mjs / CI 同一份推导 */
const FIRST_LEVEL = execFileSync(
  process.execPath,
  [join(root, "scripts/first-level.mjs"), join(root, "data", TEMPLE, "temple.json"), TEMPLE],
  { encoding: "utf8" },
).trim();

/** 本部 DEPLOY 文档：优先 DEPLOY.<temple>.md；第一部沿用 DEPLOY.md。
 *  没有对应文档就拒绝打包——否则会出厂一份「文档说 forest、内容是 light」的自相矛盾包。 */
function deployDoc() {
  const perTemple = join(root, `DEPLOY.${TEMPLE}.md`);
  if (existsSync(perTemple)) return perTemple;
  if (TEMPLE === "forest") return join(root, "DEPLOY.md");
  throw new Error(
    `缺 DEPLOY.${TEMPLE}.md：分发包自带的部署指南必须与本部内容一致（DEPLOY.md 是第一部专用）。` +
      `先把 ${T.label} 的部署指南写成 DEPLOY.${TEMPLE}.md 再打包。`,
  );
}

if (PLAN_ONLY) {
  console.log(`包名        gy-fw-${TEMPLE}-${version}`);
  console.log(`神庙        ${TEMPLE}（${T.label}）`);
  console.log(`关卡数      ${manifest.ids.length}（清单内 id 全保留）`);
  console.log(`教学关保留  ${manifest.tutorials.join(", ") || "（无）"}`);
  console.log(`删 data/    ${T.data.map((x) => `data/${x}`).join(", ") || "（无）"}`);
  console.log(`删图集      ${T.data.map((x) => `assets/atlasses/Temples/${x}`).join(", ") || "（无）"}`);
  console.log(`删音频      ${T.audio.join(", ") || "（无）"}`);
  let doc;
  try {
    doc = basename(deployDoc());
  } catch (err) {
    doc = `✗ ${err.message}`;
  }
  console.log(`部署文档    ${doc}`);
  process.exit(0);
}

const DEPLOY = { _doc: null };
try {
  DEPLOY._doc = deployDoc();
} catch (err) {
  console.error(`package-deploy: ${err.message}`);
  process.exit(1);
}

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
cp(DEPLOY._doc, join(pkgDir, "DEPLOY.md"));
// 一键部署入口：deploy.sh 放包根（`sudo ./deploy.sh` 最顺手），scripts/verify.mjs 为其验收件。
// deploy/ 下其余文件是开发机长跑场景的资料（npm ci/build、tsx 启动），与本包形态不符，不随包出厂。
cp(join(root, "deploy/deploy.sh"), join(pkgDir, "deploy.sh"));
cp(join(root, "scripts/verify.mjs"), join(pkgDir, "scripts/verify.mjs"));
// verify.mjs 用 first-level.mjs 推导本部首关——随包出厂，包里自洽不依赖仓库脚本
cp(join(root, "scripts/first-level.mjs"), join(pkgDir, "scripts/first-level.mjs"));
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
]) rm(p);

// 别部的关卡数据与神庙图集：目录级剪裁（清单推不出来，只能按部枚举）
for (const other of T.data) {
  rm(`data/${other}`);
  rm(`assets/atlasses/Temples/${other}`);
}
// 本部用不到的 BGM 变体（dark 族仅 light 部有）
for (const f of T.audio) rm(`assets/audio/${f}`);

// tutorials 只留本部清单引用到的文件（forest→forest_01；light→light_01+forest_01；
// ice→ice_02+forest_01+light_01）。清单引用即本部内容，不能按"部名前缀"再筛。
const tutDir = join(pkgDir, "data/tutorials/levels");
for (const f of readdirSync(tutDir)) {
  if (!manifest.tutorials.includes(f)) rmSync(join(tutDir, f));
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
    "--level", FIRST_LEVEL,
  ];
  // 本机/CI 有 playwright 才带浏览器用例；包里没有 playwright，故只在这里判断
  let hasPlaywright = true;
  try { require_.resolve("playwright"); } catch { hasPlaywright = false; }
  if (!hasPlaywright) smokeArgs.push("--no-browser");
  execFileSync(process.execPath, smokeArgs, { cwd: root, stdio: "inherit" });

  // 再验一次「交付给 AI 的那条命令」：包内自带的 scripts/verify.mjs 必须能在包内跑通。
  // 它用的是包内 node_modules（生产依赖）与包内 colyseus.js——与目标机环境一致；
  // 这一步同时证明 verify.mjs 没有偷偷依赖仓库里的 devDependency。
  const verifyPort = Number(process.env.FW_PKG_VERIFY_PORT ?? 2598);
  execFileSync(process.execPath, [join(pkgDir, "scripts/verify.mjs"), "--base", `http://127.0.0.1:${verifyPort}`, "--no-browser"], {
    cwd: pkgDir,
    stdio: "inherit",
  });
}

const out = join(root, "TEMP", `${name}.tar.gz`);
rmSync(out, { force: true });
execFileSync("tar", ["-czf", out, "-C", stage, name], { stdio: "inherit" });
const sha = execFileSync("sha256sum", [out], { encoding: "utf8" }).split(" ")[0];
const mb = (statSync(out).size / 1048576).toFixed(1);
writeFileSync(`${out}.sha256`, `${sha}  ${name}.tar.gz\n`);
console.log(`package-deploy: ${out} (${mb} MiB, ${TEMPLE} / ${manifest.ids.length} 关)`);
console.log(`package-deploy: sha256 ${sha}`);
console.log("package-deploy: 部署指引见包内 DEPLOY.md（Release 说明含同文）");
