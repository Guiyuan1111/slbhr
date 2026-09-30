// 把仓库根目录的 assets/ 与 data/ 同步到 Vite 的 public 目录（开发与构建共用）。
// public 目录已在 .gitignore 中排除，避免素材双份入库。
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

for (const dir of ["assets", "data"]) {
  const src = join(root, dir);
  const dst = join(root, "packages/client/public", dir);
  if (!existsSync(src)) {
    console.error(`sync-assets: 缺少 ${src}`);
    process.exit(1);
  }
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
}
console.log("sync-assets: assets/ 与 data/ 已同步到 packages/client/public/");
