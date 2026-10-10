/**
 * 路线产线·内核复核：node --import tsx scripts/e2e/routetool/validate.mjs --level forest_01 [--route <path>] [--trace <out>]
 *
 * 产出：内核回跑结论 WIN/死亡帧/超时（退出码 0/1），--trace 落逐帧位置 JSON 供诊断。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, isAbsolute, dirname } from "node:path";
import { argOf, log, ROOT } from "../lib.mjs";
import { runKernel, makeWorld } from "./kernel.mjs";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const level = argOf(args, "level", "forest_01");
const routePath = argOf(args, "route", join(ROOT, "scripts", "e2e", "inputs", "routes", `${level}.json`));
const routeDoc = JSON.parse(readFileSync(isAbsolute(routePath) ? routePath : join(ROOT, routePath), "utf8"));

if (routeDoc.level && routeDoc.level !== level) {
  console.error(`路线文件 level=${routeDoc.level} 与 --level ${level} 不符`);
  process.exit(2);
}

const trace = argOf(args, "trace") ? [] : null;
const w = makeWorld(level); // 仅做构建冒烟：关卡 JSON/引用解析错误在此暴露
const r = runKernel(level, routeDoc, { traceTo: trace });

const writeTrace = (out, data) => {
  const p = isAbsolute(out) ? out : join(ROOT, out);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data));
  log(`trace → ${p}`);
};

if (r.won) {
  log(`${level}: 内核 WIN @f${r.winF}（${routeDoc.fb?.length ?? 0}+${routeDoc.wg?.length ?? 0} 事件）`);
  if (trace) writeTrace(argOf(args, "trace"), trace);
  process.exit(0);
} else {
  log(`${level}: 内核 FAIL ${r.deathF < 0 ? "超时未过关" : `死亡 @f${r.deathF}`}`);
  if (trace) writeTrace(argOf(args, "trace"), trace.slice(0, (r.deathF < 0 ? routeDoc.totalFrames : r.deathF) + 1));
  process.exit(1);
}
