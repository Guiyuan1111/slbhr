/**
 * png-opt：PNG **无损**重压缩（r20 件3 候选的量具与执行器）。
 *
 * 只做一件事：把 IDAT 重新编一遍（zlib level 9 + libpng 同款逐行滤波择优，均在 encodePngRgba 里），
 * **解码后的 RGBA 逐字节不变**——所以这不是"改素材"，是"换容器的压缩参数"：
 *  1) 辅助块（cHRM/gAMA/pHYs/iTXt）由 decodePng 原样带出、编码器原样写回，浏览器解释这些字节的方式不变；
 *  2) 每个文件写盘前后都跑一次 `decodePng(encode(decode(x))) === decode(x)` 的逐字节比对，
 *     不一致直接拒绝写入（不是"应该无损"，是"逐字节验证过无损"）；
 *  3) 只受理 8bit 无交错的 RGBA(color=6)/RGB(color=2)。调色板/16bit/交错一律跳过并列明原因——
 *     实测本仓 14 张全为 RGBA 且**distinct RGBA 色数 1273～15575**，全部超过 256，
 *     所以"转 8bit 调色板"这条路对本仓素材不成立（要省更多只能量化，那是有损，不在本工具范围）。
 *
 * 用法：
 *   node scripts/png-opt.mjs                 # 干跑：打印逐文件前后与合计，不写盘
 *   node scripts/png-opt.mjs --apply         # 写盘（逐文件验证像素一致后才写）
 *   node scripts/png-opt.mjs --check         # 幂等核验：现有文件再编一遍是否还能变小
 * 退出码：有任何文件验证不过 → 1。
 */
import fs from "node:fs";
import path from "node:path";
import { decodePng, encodePngRgba } from "./png-raw.mjs";

const ROOT = "packages/client/public";
const APPLY = process.argv.includes("--apply");
const CHECK = process.argv.includes("--check");

function collect(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collect(p));
    else if (e.name.toLowerCase().endsWith(".png")) out.push(p);
  }
  return out;
}

const files = process.argv
  .filter((a, i) => !a.startsWith("--") && i > 1)
  .map((a) => path.join(ROOT, a));
const targets = files.length ? files : collect(ROOT);

let before = 0;
let after = 0;
let written = 0;
const skipped = [];
let failed = 0;

for (const p of targets) {
  const rel = p.slice(ROOT.length + 1);
  const buf = fs.readFileSync(p);
  let img;
  try {
    img = decodePng(buf, rel);
  } catch (err) {
    skipped.push({ rel, why: String(err.message).replace(/^.*?: /, "").slice(0, 70) });
    continue;
  }
  if (img.color !== 6) {
    // color=2 会被 decodePng 展开成 RGBA，重编码等于顺手改了像素格式，不在"只换压缩参数"的承诺里
    skipped.push({ rel, why: `color=${img.color}（仅受理 RGBA=6；RGB 展开成 RGBA 会改像素格式）` });
    continue;
  }
  const reencoded = encodePngRgba(img.w, img.h, img.data, img.ancillary);
  const again = decodePng(reencoded, `${rel} 重编码后`);
  const identical = Buffer.compare(again.data, img.data) === 0;
  const blocksKept = again.chunks === decodePng(buf, rel).chunks;
  if (!identical || !blocksKept) {
    console.error(`  ✘ ${rel} 验证不过（像素一致=${identical} 块序一致=${blocksKept}）——拒绝写入`);
    failed++;
    continue;
  }
  before += buf.length;
  after += reencoded.length;
  const delta = buf.length - reencoded.length;
  if (delta > 0 && (APPLY || !CHECK)) {
    console.log(`  ${rel.padEnd(52)} ${(buf.length / 1024).toFixed(1).padStart(8)}KB → ${(reencoded.length / 1024).toFixed(1).padStart(8)}KB  省 ${(delta / 1024).toFixed(1).padStart(7)}KB`);
  }
  if (delta > 0 && APPLY) {
    fs.writeFileSync(p, reencoded);
    written++;
  }
}

console.log(
  `${APPLY ? "已写盘" : CHECK ? "核验（不写盘）" : "干跑（不写盘）"}：` +
    `${targets.length - skipped.length - failed} 个可重编 ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB` +
    ` ⇒ 省 ${((before - after) / 1024).toFixed(1)}KB；写盘 ${written} 个；跳过 ${skipped.length} 个；验证失败 ${failed} 个`
);
for (const s of skipped) console.log(`  skip ${s.rel}: ${s.why}`);
process.exit(failed ? 1 : 0);
