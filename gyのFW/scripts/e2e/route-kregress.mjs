/**
 * 内核侧正式语料全量回归（对比报告 #6 / note/plans/2026-10-27-next-improvements.md B2）：
 * 读 formal-corpus.list，逐条 spawn validate.mjs（进程隔离，语义与单关 validate 逐位相同），
 * 输出逐关成败表 + 汇总。改内核后先跑这个，立刻知道哪些关卡行为漂移。
 *
 * 口径：WIN=内核 validate（runKernel 逐帧步进）；"内核 WIN·真服受阻"族
 * （forest_05/14/14_1/32，出处 note/plans/2026-10-27-corpus-registry.md）在此口径下属正常绿。
 *
 * 用法：node --import tsx scripts/e2e/route-kregress.mjs [--list <清单>] [--timeout 300]
 * 退出码：全绿 0 / 任一 FAIL 1 / 清单缺失 2。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const argOf = (args, k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const args = process.argv.slice(2);
const LIST = join(ROOT, argOf(args, "list", "scripts/e2e/inputs/routes/formal-corpus.list"));
const TIMEOUT = Number(argOf(args, "timeout", "300"));
if (!existsSync(LIST)) { console.error(`[kregress] 清单缺失: ${LIST}`); process.exit(2); }
const entries = readFileSync(LIST, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
console.log(`[kregress] 语料 ${entries.length} 条，逐条 validate（timeout ${TIMEOUT}s）`);
const fails = [];
for (const rel of entries) {
  const level = basename(rel, ".json");
  const t0 = Date.now();
  const r = spawnSync("node", ["--import", "tsx", "scripts/e2e/routetool/validate.mjs", "--level", level], { encoding: "utf8", timeout: TIMEOUT * 1000, cwd: ROOT });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const m = out.match(/WIN @f(\d+)/);
  const ok = r.status === 0 && m;
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[kregress] ${ok ? "✓" : "✗"} ${level.padEnd(12)} ${ok ? `WIN@f${m[1]}` : `FAIL(status=${r.status})`}${!ok && r.error ? ` ${r.error.message.split("\n")[0]}` : ""} ${sec}s`);
  if (!ok) fails.push(level);
}
console.log(fails.length === 0
  ? `[kregress] ALL GREEN：${entries.length}/${entries.length} WIN`
  : `[kregress] ${entries.length - fails.length}/${entries.length} WIN，FAIL: ${fails.join(",")}`);
process.exit(fails.length ? 1 : 0);
