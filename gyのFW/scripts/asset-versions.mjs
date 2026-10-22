// r37：为链关键静态素材生成内容哈希清单（packages/client/src/asset-versions.ts）。
// 客户端 URL 追加 ?v=<hash>，服务端对带 v 的请求给 immutable——字节变则 URL 变；
// URL 不变则字节不变，可安全免复验。清单覆盖换关链上的机关变体与房内字体。
// 用法：node scripts/asset-versions.mjs [--check]
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "packages", "client", "src", "asset-versions.ts");
const MECH_DIR = "assets/atlasses/mech";
const FONT_DIR = "assets/fonts/chinese";

const files = [];
for (const f of readdirSync(join(ROOT, MECH_DIR)).sort()) {
  if (/^MechAssets-[A-Za-z0-9_-]+\.(png|json)$/.test(f)) files.push(`${MECH_DIR}/${f}`);
}
for (const f of ["font-roombase.png", "font-roomblank.png", "font.fnt"]) {
  files.push(`${FONT_DIR}/${f}`);
}

const rows = files.map((rel) => {
  const hash = createHash("sha1").update(readFileSync(join(ROOT, rel))).digest("hex").slice(0, 8);
  return `  "/${rel}": "${hash}",`;
});
const text = [
  "// r37 内容寻址清单：由 scripts/asset-versions.mjs 生成（--check 校验），勿手改。",
  "// 键 = 运行时 URL 路径，值 = 文件字节 sha1 前 8 位；追加 ?v= 后服务端给 immutable。",
  "export const ASSET_VERSIONS: Record<string, string> = {",
  ...rows,
  "};",
  "",
].join("\n");

if (process.argv.includes("--check")) {
  let cur = "";
  try {
    cur = readFileSync(OUT, "utf8");
  } catch {
    console.error(`asset-versions: 缺少 ${OUT}（先运行 node scripts/asset-versions.mjs）`);
    process.exit(1);
  }
  if (cur !== text) {
    console.error("asset-versions: 清单与素材不一致（运行 node scripts/asset-versions.mjs 重新生成）");
    process.exit(1);
  }
  console.log(`asset-versions: ${files.length} 条逐字节一致`);
} else {
  writeFileSync(OUT, text);
  console.log(`asset-versions: 已写入 ${files.length} 条 → ${OUT.split("/").slice(-1)[0]}`);
}
