/**
 * 从原版 init.js（参考库，永久只读）按字节原样提取 Box2D 引擎 bundle。
 *
 * 证据（均为 init.js 字节偏移，latin1 计数与 Buffer 索引一致）：
 * - init.eb02fbdab2aa1d24.js 共 2,273,196 字节；
 * - 引擎为单一 Google Closure 顶层逗号表达式链：起于 @1,132,453 的 `var COMPILED = !1,`（全文件唯一），
 *   止于 @1,654,645 的 `define("box2d", ["Phaser"], ...)` 适配器之前（切片末尾多带一个衔接逗号，由加载器在求值时去掉）；
 * - bundle 同时编入了 Phaser.Physics.Box2D 插件（引用全局 Phaser），加载器提供最小占位；
 * - 求值后导出扁平命名空间 `this.box2d`（与适配器语义一致），集成器为半隐式欧拉（先速度后位置），
 *   与原版逐帧一致：g=31.25 m/s²、h=1/60 时 1 秒位移 = g·h²·n(n+1)/2 = 15.8854 m（508.33 px @ ptm 32）。
 *
 * 用法：node scripts/vendor-box2d.mjs   （参考库文件必须存在且未被修改）
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INIT = join(ROOT, "..", "Fireboy-and-Watergirl", "output", "A", "js", "init.eb02fbdab2aa1d24.js");
const START = 1132453;
const END = 1654645;

const buf = readFileSync(INIT);
if (buf.length !== 2273196) throw new Error(`init.js 长度 ${buf.length} ≠ 2273196，参考库可能被改动，中止`);
const head = buf.subarray(START, START + 18).toString("latin1");
const tail = buf.subarray(END, END + 15).toString("latin1");
if (head !== "var COMPILED = !1,") throw new Error(`起点锚文本不符: ${JSON.stringify(head)}`);
if (tail !== 'define("box2d",') throw new Error(`终点锚文本不符: ${JSON.stringify(tail)}`);

const slice = buf.subarray(START, END);
const out = join(ROOT, "packages", "shared", "vendor", "box2d.js");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, slice);
console.log(`vendor/box2d.js  <- init.js[${START}, ${END})  ${slice.length} bytes`);
console.log("sha256:", createHash("sha256").update(slice).digest("hex"));
