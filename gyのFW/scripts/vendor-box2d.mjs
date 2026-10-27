/**
 * 从原版 init.js（参考库 Fireboy-and-Watergirl/，永久只读）按字节原样提取 Box2D 引擎 bundle。
 *
 * 切片定位（#44 重写）：不再硬编码偏移——按锚文本动态定位，参考库小版本更新也能复现：
 * - 起点：全文件唯一的 `var COMPILED = !1,`（Closure prelude，逗号表达式链头）；
 * - 终点：`define("box2d", ["Phaser"], ...)` requirejs 适配器起点（适配器本身不进切片，
 *   切片末尾多带一个衔接逗号，由 src/box2d/load.ts 求值时剥离）；
 * - 完整性：产物 sha256 必须等于本脚本内 EXPECTED_SHA256（与 vendor/README.md、
 *   src/box2d/load.ts 的 VENDOR_BOX2D_SHA256 三处一致），不符即拒写。
 *
 * 实测（当前参考库 init.eb02fbdab2aa1d24.js = 2,218,873 字节）：
 *   切片 = [1,105,959, 1,616,882)，510,923 字节，sha256 = d8a9edad036999053839ae5da070811e34417a6616dc39af6743f802471ee80e
 *
 * 用法：node scripts/vendor-box2d.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INIT = join(ROOT, "..", "Fireboy-and-Watergirl", "output", "A", "js", "init.eb02fbdab2aa1d24.js");
/** 与 vendor/README.md、packages/shared/src/box2d/load.ts 三处一致的完整性锚 */
const EXPECTED_SHA256 = "d8a9edad036999053839ae5da070811e34417a6616dc39af6743f802471ee80e";

const buf = readFileSync(INIT);
const text = buf.toString("latin1");
const START = text.indexOf("var COMPILED = !1,");
const END = text.indexOf('define("box2d",');
if (START < 0) throw new Error("起点锚 `var COMPILED = !1,` 未找到——参考库结构可能已变，人工核验后更新脚本");
if (END < 0 || END <= START) throw new Error("终点锚 `define(\"box2d\",` 未找到或先于起点——人工核验后更新脚本");

const slice = buf.subarray(START, END);
const sha = createHash("sha256").update(slice).digest("hex");
if (sha !== EXPECTED_SHA256) {
  throw new Error(
    `切片 sha256 ${sha} ≠ 期望 ${EXPECTED_SHA256}\n` +
      `参考库内容与既有 vendor 不一致（升级或损坏）。人工核对后：若为合法升级，同步更新 ` +
      `EXPECTED_SHA256 / vendor/README.md / src/box2d/load.ts 三处；否则拒绝生成。`,
  );
}
const out = join(ROOT, "packages", "shared", "vendor", "box2d.js");
writeFileSync(out, slice);
console.log(`vendor/box2d.js  <- init.js[${START}, ${END})  ${slice.length} bytes`);
console.log("sha256:", sha, "（与既有 vendor 一致，未发生漂移）");
