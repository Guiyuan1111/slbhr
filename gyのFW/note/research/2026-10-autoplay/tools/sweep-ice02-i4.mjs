// I4 sweep 驱动（fw-route-ice02b 槽）：批量变体直评 + 逐变体遥测提取。
// 每变体独立 spawnSync 子进程（vendor 隔离同 probe1/2 口径），子进程 AS_DBG=I4 AS_DBG_MOD=2，
// 父进程从子 stdout 抽 [dbgI4] 帧表，算关键事件（按压/开闸/落闸/不可通过/擦碰/土墩/竖井/钉死）。
// 用法: node --import tsx TEMP/fw-ri2-1/sweep1.mjs <variants.json> [--csv out.csv]
// variants JSON: { name: {fb:[[n,...a]...], wg:[...]}, ... }
import { readFileSync, writeFileSync, appendFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const AUTO = join(ROOT, "scripts/e2e/routetool/autosearch.mjs");
const CHAIN = join(ROOT, "note/research/2026-10-autoplay/tools/checkpoints-ice_02.json");
const searchPath = process.env.SEARCH_JSON ?? join(ROOT, "note/research/2026-10-autoplay/tools/out/ice_02.autosearch.search.json");

const rep = JSON.parse(readFileSync(searchPath, "utf8"));
const lastFin = [...rep.segs].reverse().find((s) => s.final).final;
const chain = JSON.parse(readFileSync(CHAIN, "utf8"));
const segDef = chain.segments[4];
const totalCapF = lastFin.endF + 2200 + 260;

const MARK = "##EVALRESULT##";
const toSpec = (rows) => rows.map(([n, ...a]) => ({ n, a }));
const r2 = (v) => (v == null ? "?" : Math.round(v));

function runVariant(name, v) {
  const jobPath = join(tmpdir(), `sweep1-${process.pid}.json`);
  writeFileSync(jobPath, JSON.stringify({
    level: "ice_02", segDef, totalCapF,
    sf: [...lastFin.sf, ...toSpec(v.fb)],
    sw: [...lastFin.sw, ...toSpec(v.wg)],
  }));
  const res = spawnSync(process.execPath,
    ["--import", "tsx", AUTO, "--level", "ice_02", "--evalchild", "--evaljob", jobPath],
    { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, cwd: ROOT,
      env: { ...process.env, AS_DBG: "I4", AS_DBG_MOD: "2" } });
  try { unlinkSync(jobPath); } catch {}
  const out = res.stdout ?? "";
  const i = out.indexOf(MARK);
  if (i < 0) throw new Error(`${name}: evaljob 失败: ${(res.stderr ?? "").slice(-400)}`);
  const rec = JSON.parse(out.slice(i + MARK.length))[0];
  // 帧表: [f, fbx, fby, fbg, wgx, wgy, wgg, P2]
  const frames = [];
  for (const line of out.slice(0, i).split("\n")) {
    const m = line.match(/f(\d+) fb\[(\d+),(\d+),g(\d)\] wg\[(\d+),(\d+),g(\d)\].*P2=\[\d+,(\d+)\]/);
    if (m) frames.push([+m[1], +m[2], +m[3], +m[4], +m[5], +m[6], +m[7], +m[8]]);
  }
  return { rec, frames };
}

// ---- 事件提取（2f 采样粒度）----
function events(frames) {
  const ev = {};
  const P2 = frames.map((r) => r[7]);
  ev.pressF = frames.find((r) => r[7] < 112)?.[0] ?? -1;
  ev.openF = frames.find((r) => r[7] <= 17)?.[0] ?? -1;
  ev.fallF = ev.openF >= 0 ? (frames.find((r) => r[0] > ev.openF && r[7] > 17)?.[0] ?? -1) : -1;
  ev.deadF_est = frames.find((r) => r[7] >= 42 && ev.fallF > 0 && r[0] > ev.fallF)?.[0] ?? -1;
  for (const role of ["fb", "wg"]) {
    const xi = role === "fb" ? 1 : 4, yi = role === "fb" ? 2 : 5, gi = role === "fb" ? 3 : 6;
    const g = (r) => r[gi] === 1;
    // 西板着陆：首帧 x∈[870,935] y∈[210,260] 且 grounded（跳板落地后）
    const board = frames.find((r) => g(r) && r[xi] >= 870 && r[xi] <= 935 && r[yi] >= 210 && r[yi] <= 260);
    ev[role + "_boardF"] = board?.[0] ?? -1; ev[role + "_boardX"] = board ? r2(board[xi]) : "?";
    // 擦碰：board 之后首帧 grounded x∈[560,720] y∈[230,275]
    const graze = board ? frames.find((r) => r[0] > board[0] && g(r) && r[xi] >= 560 && r[xi] <= 720 && r[yi] >= 230 && r[yi] <= 275) : null;
    ev[role + "_grazeF"] = graze?.[0] ?? -1; ev[role + "_grazeX"] = graze ? r2(graze[xi]) : "?";
    // 土墩着陆：graze 之后首帧 grounded x∈[420,530]
    const mound = graze ? frames.find((r) => r[0] > graze[0] && g(r) && r[xi] >= 420 && r[xi] <= 530) : null;
    ev[role + "_moundF"] = mound?.[0] ?? -1; ev[role + "_moundX"] = mound ? r2(mound[xi]) : "?";
    // 竖井到场：mound 之后首帧 x≤310
    const shaft = mound ? frames.find((r) => r[0] > mound[0] && r[xi] <= 310) : null;
    ev[role + "_shaftF"] = shaft?.[0] ?? -1; ev[role + "_shaftX"] = shaft ? r2(shaft[xi]) : "?";
    // 终态钉死：末帧 x
    const last = frames[frames.length - 1];
    ev[role + "_endX"] = r2(last[xi]); ev[role + "_endY"] = r2(last[yi]);
  }
  return ev;
}

const variants = JSON.parse(readFileSync(process.argv[2], "utf8"));
const csvPath = process.argv.includes("--csv") ? process.argv[process.argv.indexOf("--csv") + 1] : null;
const cols = ["name", "deathF", "deadWho", "met", "wonAt", "entryF", "wp", "pressF", "openF", "fallF", "deadF_est",
  "fbDoorUp", "wgDoorUp", "fbAtDoor", "wgAtDoor",
  "fb_boardF", "fb_boardX", "fb_grazeF", "fb_grazeX", "fb_moundF", "fb_moundX", "fb_shaftF", "fb_shaftX", "fb_endX",
  "wg_boardF", "wg_boardX", "wg_grazeF", "wg_grazeX", "wg_moundF", "wg_moundX", "wg_shaftF", "wg_shaftX", "wg_endX", "endF"];

if (csvPath && !existsSync(csvPath)) appendFileSync(csvPath, cols.join(",") + "\n");

for (const [name, v] of Object.entries(variants)) {
  const { rec, frames } = runVariant(name, v);
  const ev = events(frames);
  const row = {
    name, deathF: rec.deathF, deadWho: rec.deadWho ?? "-", met: rec.metAt >= 0 ? "WIN@" + rec.metAt : "no",
    wonAt: rec.wonAt, entryF: rec.entryF, wp: JSON.stringify(rec.wpMetF), ...ev, endF: rec.endF,
    fbDoorUp: rec.D?.doors?.fireboy?.isUp ? 1 : 0, wgDoorUp: rec.D?.doors?.watergirl?.isUp ? 1 : 0,
    fbAtDoor: rec.S?.fb?.atDoor ? 1 : 0, wgAtDoor: rec.S?.wg?.atDoor ? 1 : 0,
  };
  console.log(cols.map((c) => String(row[c] ?? "?")).join("\t"));
  if (csvPath) appendFileSync(csvPath, cols.map((c) => String(row[c] ?? "?")).join(",") + "\n");
  // 逐变体帧表归档（调参后回看用）
  if (process.env.SWEEP_FRAMES) {
    writeFileSync(`${process.env.SWEEP_FRAMES}.${name}.csv`,
      frames.map((r) => r.join(",")).join("\n"));
  }
}
