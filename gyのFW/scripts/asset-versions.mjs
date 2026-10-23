// r37：为链关键静态素材生成内容哈希清单（packages/client/src/asset-versions.ts）。
// 客户端 URL 追加 ?v=<hash>，服务端对带 v 的请求给 immutable——字节变则 URL 变；
// URL 不变则字节不变，可安全免复验。清单覆盖换关链上的机关变体、房内字体，
// 以及 r43 起离房交还/重进重取的开始界面独占四图（重取必须命中 immutable 磁盘缓存）。
// r43：清单同时同步 index.html 里与清单同源的运行时 URL（目前是 DOM 菜单标题图）：
// DOM 走无 v 的 URL、Boot 走带 v 的 URL 时，同一字节冷启动会下载两遍（slow3g +1.7s 带宽）。
// 只改 src="..." 形式的精确路径；已带查询的 URL 会被重写为当前版本。
// 用法：node scripts/asset-versions.mjs [--check]
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "packages", "client", "src", "asset-versions.ts");
const HTML = join(ROOT, "packages", "client", "index.html");
const MECH_DIR = "assets/atlasses/mech";
const FONT_DIR = "assets/fonts/chinese";

const files = [];
for (const f of readdirSync(join(ROOT, MECH_DIR)).sort()) {
  if (/^MechAssets-[A-Za-z0-9_-]+\.(png|json)$/.test(f)) files.push(`${MECH_DIR}/${f}`);
}
for (const f of ["font-roombase.png", "font-roomblank.png", "font.fnt"]) {
  files.push(`${FONT_DIR}/${f}`);
}
// r43：开始界面独占四图（MenuScene SHUTDOWN 交还、preload 重取）。登记后重取 URL 与首装
// 完全一致且 immutable——否则重进要付 304 往返（slow3g 400ms RTT）与重新校验。
for (const f of [
  "assets/images/TempleHallForest.jpg",
  "assets/images/Beam.png",
  "assets/images/GameNameForest.png",
  "assets/images/branding/branding_logo_kizi.png",
]) {
  files.push(f);
}

const hashes = new Map();
const rows = files.map((rel) => {
  const hash = createHash("sha1").update(readFileSync(join(ROOT, rel))).digest("hex").slice(0, 8);
  hashes.set(`/${rel}`, hash);
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
/** 与客户端同源的 HTML 运行时 URL（r43）：只认 src="精确路径"，已有查询的重写为当前版本 */
const html = readFileSync(HTML, "utf8");
const nextHtml = html.replace(/(\bsrc=")(\/[^"?#]+)(?:[?#][^"]*)?(")/g, (m, pre, p, post) =>
  hashes.has(p) ? `${pre}${p}?v=${hashes.get(p)}${post}` : m,
);

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
  if (html !== nextHtml) {
    console.error("asset-versions: index.html 的同源 URL 未带当前版本（运行 node scripts/asset-versions.mjs 重新生成）");
    process.exit(1);
  }
  console.log(`asset-versions: ${files.length} 条与 index.html 同步项逐字节一致`);
} else {
  writeFileSync(OUT, text);
  console.log(`asset-versions: 已写入 ${files.length} 条 → ${OUT.split("/").slice(-1)[0]}`);
  if (html !== nextHtml) {
    writeFileSync(HTML, nextHtml);
    console.log("asset-versions: 已同步 index.html 的同源 URL");
  }
}
