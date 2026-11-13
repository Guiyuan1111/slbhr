// I4 recipe 探针（v12-real 单配方模式）：搜索 JSON 最后一个 final 段（I3）的累积程序 + I4 v12 编排直评。
// 走 autosearch --evalchild --evaljob 子进程隔离（vendor 泄漏口径与主跑一致）。
// 用法: node --import tsx TEMP/probe-ice02-i4.mjs [searchJson] [--bare]
//   VARIANT=<json> 覆盖配方（{wg:[[name,...args]...],fb:[...]}，替换 SEGI.I4 副本）
//   TRACE=1        打印子进程 [dbg] 逐帧采样（需 AS_DBG=I4）；AS_TRACE=1 打印 [idx]/[throw]
// 注意：RECIPE 是 autosearch.mjs SEGI.I4.recipe 的手工副本，改配方两处同步。
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const AUTO = join(ROOT, "scripts/e2e/routetool/autosearch.mjs");
const CHAIN = join(ROOT, "note/research/2026-10-autoplay/tools/checkpoints-ice_02.json");
const argv = process.argv.slice(2);
const bare = argv.includes("--bare");
const searchPath = argv.find((a) => !a.startsWith("--")) ?? join(ROOT, "note/research/2026-10-autoplay/tools/out/ice_02.autosearch.search.json");

const rep = JSON.parse(readFileSync(searchPath, "utf8"));
const finIdx = rep.segs.map((s, i) => [s, i]).reverse().find(([s]) => s.final);
if (!finIdx) { console.error("搜索 JSON 无 final 段"); process.exit(2); }
const [lastFin, fi] = finIdx;
const chain = JSON.parse(readFileSync(CHAIN, "utf8"));
const segDef = chain.segments[4];
console.log(`prefix=segs[${fi}] ${lastFin.id} endF=${lastFin.final.endF} → I4「${segDef.title}」`);

const MARK = "##EVALRESULT##";
const runEval = (sf, sw) => {
  const jobPath = join(tmpdir(), `probe-i4-${process.pid}.json`);
  writeFileSync(jobPath, JSON.stringify({ level: "ice_02", segDef, sf, sw, totalCapF: lastFin.final.endF + 2200 + 260 }));
  const res = spawnSync(process.execPath,
    ["--import", "tsx", AUTO, "--level", "ice_02", "--evalchild", "--evaljob", jobPath],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, cwd: ROOT });
  try { unlinkSync(jobPath); } catch {}
  const out = res.stdout ?? "";
  const i = out.indexOf(MARK);
  if (i < 0) throw new Error("evaljob 失败: " + (res.stderr ?? "").slice(-400));
  if (process.env.TRACE) out.slice(0, i).split("\n").forEach((l) => { if (l.includes("[dbg") || l.includes("[idx")) console.log(l); });
  return JSON.parse(out.slice(i + MARK.length))[0];
};
const px = (p) => [Math.round(p.x), Math.round(p.y)];
const show = (tag, r) => console.log(`${tag}\t death=${r.deathF}(${r.deadWho ?? "?"}) entry=${r.entryF} wp=[${r.wpMetF}] met=${r.metAt >= 0} S.fb=${px(r.S.fb)} S.wg=${px(r.S.wg)}`);

// v28=SEED（与 SEGI.I4.recipe 同步）：v26 流（斜坡边缘弧→池缘擦碰→rj645）+ 错峰上塔
// （wg 领先 sleep45 防踏板碰撞限速）+ walkTo(-1,1135,20) 最短消动量出板。
// 窗口律（E-B/v26/v27 三跑交叉）：落板=首次按压注册+~390f，可通过至 +~445f；
// fb 预计 miss ~20f、wg ~65f——交由 beam search 逐帧 shaving。
const REC = (doorX, lead) => ([
  ["sleep", lead],
  ["walkTo", 1, 940, 999], ["runJump", 1, 1000, 25], ["sleep", 5],
  ["walkTo", 1, 1168, 30], ["sleep", 2],
  ["walkTo", -1, 1135, 20], ["runJump", -1, 1130, 25],
  ["runJump", -1, 645, 25],
  ["walkTo", -1, 400, 999], ["runJump", -1, 430, 25],
  ["walkTo", -1, doorX, 60], ["sleep", 40],
]);
const RECIPE = process.env.VARIANT ? JSON.parse(process.env.VARIANT) : { wg: REC(184, 0), fb: REC(80, 45) };
const toSpec = (rows) => rows.map(([n, ...a]) => ({ n, a }));

if (bare) {
  show("bare-对照", runEval(lastFin.final.sf, lastFin.final.sw));
} else {
  show("v28-seed", runEval([...lastFin.final.sf, ...toSpec(RECIPE.fb)],
    [...lastFin.final.sw, ...toSpec(RECIPE.wg)]));
}
