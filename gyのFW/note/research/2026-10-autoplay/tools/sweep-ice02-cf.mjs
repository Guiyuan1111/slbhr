// ice_02 反事实驱动（fw-ice02-cf 槽）：TimedPusher timeMs 副本变体直评。
// 【反事实副本实验，非原版路线】——变体经内存深拷贝关卡 doc 注入 properties.time，
// 原文件 data/tutorials/levels/ice_02.json 只读零接触。
// 回放环逐行复刻 scripts/e2e/routetool/autosearch.mjs evaluate 的物理口径：
//   同 PRIM_TABLE 编译程序（lastFin 前缀 + 变体后缀）、同 step→快照顺序、同死亡/WIN 判定、
//   同队列空输入锁存。遥测=AS_DBG_MOD=2 同列同格式（f,fbx,fby,fbg,wgx,wgy,wgg,P2y，
//   全 toFixed(0)），可与 tools/out/ice02-i4/{w16.M1-*,w13.G3-*}.csv 存档帧逐帧对表。
// 与 evaluate 的差异（仅搜索无关项）：无 entryG/wpG/targetG 门（entryF/horizon 冻结不适用），
// 循环跑到 死亡/WIN/capF 为止——故对照跑 endF 会大于存档 2463（存档受 horizon 冻结），
// 对表时只比存档行数前缀。
// 用法: node --import tsx note/research/2026-10-autoplay/tools/sweep-ice02-cf.mjs \
//         <variants.json> --timeMs 4000,4800,5600 [--csv out.csv] [--frames-dir <dir>]
// variants JSON 同 sweep-ice02-i4 口径: { name: {fb:[[n,...a]...], wg:[...]}, ... }
import { readFileSync, appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = "/home/gy/桌面/dev/slbhr/gyのFW";
const ORIG_DIR = join(ROOT, "data", "tutorials", "levels");
const ORIG_JSON = join(ORIG_DIR, "ice_02.json");
const AUTO = join(ROOT, "scripts", "e2e", "routetool", "autosearch.mjs");
const CHAIN = join(ROOT, "note", "research", "2026-10-autoplay", "tools", "checkpoints-ice_02.json");
const SEARCH = join(ROOT, "note", "research", "2026-10-autoplay", "tools", "out", "ice_02.autosearch.search.json");

const rep = JSON.parse(readFileSync(SEARCH, "utf8"));
const lastFin = [...rep.segs].reverse().find((s) => s.final).final;
const chain = JSON.parse(readFileSync(CHAIN, "utf8"));
const segDef = chain.segments[4];
const totalCapF = lastFin.endF + 2200 + 260; // =3829，与 sweep-ice02-i4 同口径

// ---- 槽内依赖（只读 import；argv 需含 --level ice_02 供 autosearch 顶层 chain 校验）----
if (!process.argv.includes("--level")) process.argv.push("--level", "ice_02");
const auto = await import(pathToFileURL(AUTO).href);
const { PRIM_TABLE } = auto;
const botcore = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "botcore.mjs")).href);
const { NONE } = botcore;
const { parseLevel } = await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "level2.ts")).href);
const { World } = await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "kernel", "world.ts")).href);
const kernel = await import(pathToFileURL(join(ROOT, "scripts", "e2e", "routetool", "kernel.mjs")).href);
const { makeProvider } = kernel;

// ---- 原始 doc 与 TimedPusher 对象定位（通用扫描，禁写死层号）----
const origDoc = JSON.parse(readFileSync(ORIG_JSON, "utf8"));
function timedPusherObjects(doc) {
  const hits = [];
  for (const layer of doc.layers ?? []) {
    if (layer.type !== "objectgroup") continue;
    for (const o of layer.objects ?? []) {
      if (o.properties?.time !== undefined && o.propertytypes?.time === "int") hits.push(o);
    }
  }
  return hits;
}
const tpObjs = timedPusherObjects(origDoc);
if (tpObjs.length !== 1) throw new Error(`ice_02 TimedPusher 对象数=${tpObjs.length}，预期 1（timeMs 原值=${tpObjs[0].properties.time}）`);

/** 变体世界：深拷贝 doc → 注入 timeMs → parseLevel+new World（绕过 makeWorld 的 locateLevel 缓存） */
function makeWorldCf(timeMs) {
  const doc = JSON.parse(JSON.stringify(origDoc));
  timedPusherObjects(doc)[0].properties.time = timeMs;
  return new World(parseLevel("ice_02", doc, makeProvider(ORIG_DIR)));
}

const toSpec = (rows) => rows.map(([n, ...a]) => ({ n, a }));
const r2 = (v) => (v == null ? "?" : Math.round(v));

/** 反事实回放：evaluate 同环（去 segC 门），遥测每 2f 一行，列/格式与 AS_DBG I4 dbg 行一致 */
function replayCf(sf, sw, timeMs, capF) {
  const w = makeWorldCf(timeMs);
  const progs = { fb: sf.map((sp) => PRIM_TABLE[sp.n](...sp.a)), wg: sw.map((sp) => PRIM_TABLE[sp.n](...sp.a)) };
  const idx = { fb: 0, wg: 0 };
  const state = { fb: { ...NONE }, wg: { ...NONE } };
  const inputs = { fb: NONE, wg: NONE };
  const snapOf = (role) => {
    const s = w.snapshotPlayer(role);
    return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, atDoor: s.atDoor, grounded: w.players[role].feetContacts.length > 0, dead: s.dead || s.dying };
  };
  const frames = [];
  let deathF = -1, deadWho = null, wonAt = -1, endF = 0;
  for (let f = 0; f < capF; f++) {
    const meS = { fb: snapOf("fireboy"), wg: snapOf("watergirl") };
    for (const role of ["fb", "wg"]) {
      const stp = progs[role][idx[role]];
      if (!stp) continue; // 队列空=锁存末输入（evaluate/drive 同款）
      const ctx = { f, w, me: meS[role], other: meS[role === "fb" ? "wg" : "fb"], mem: (stp._mem ??= {}), jumpHeld: state[role].up };
      let inp = null;
      try { inp = stp.run(ctx); } catch { inp = NONE; }
      const next = { up: !!(inp?.up), left: !!(inp?.left), right: !!(inp?.right) };
      state[role] = next; inputs[role] = next;
      let d = false;
      try { d = stp.done(ctx); } catch { d = false; }
      if (d) idx[role]++;
    }
    w.step(1 / 60, { fireboy: inputs.fb, watergirl: inputs.wg });
    const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
    if (f % 2 === 0) {
      const P2 = w.mechSnapshot().platforms[2]?.y;
      frames.push([f, Number(a.x.toFixed(0)), Number(a.y.toFixed(0)), w.players.fireboy.feetContacts.length > 0 ? 1 : 0,
        Number(b.x.toFixed(0)), Number(b.y.toFixed(0)), w.players.watergirl.feetContacts.length > 0 ? 1 : 0,
        P2 === undefined ? -1 : Number(P2.toFixed(0))]);
    }
    if (a.dead || a.dying || b.dead || b.dying) {
      deathF = f;
      deadWho = (a.dead || a.dying ? "fb" : "wg") + "@[" + (a.dead || a.dying ? a.x : b.x).toFixed(0) + "," + (a.dead || a.dying ? a.y : b.y).toFixed(0) + "]";
      endF = f; break;
    }
    if (w.phase === "won") { wonAt = f; endF = f; break; }
  }
  if (endF === 0 && deathF < 0 && wonAt < 0) endF = capF - 1;
  const a = w.snapshotPlayer("fireboy"), b = w.snapshotPlayer("watergirl");
  return {
    rec: {
      deathF, deadWho, wonAt, endF,
      S: { fb: { x: a.x, y: a.y }, wg: { x: b.x, y: b.y } },
    },
    frames,
  };
}

// ---- 事件提取（与 sweep-ice02-i4.mjs 逐字同口径：2f 采样上的同一批关键事件）----
function events(frames) {
  const ev = {};
  ev.pressF = frames.find((r) => r[7] < 112)?.[0] ?? -1;
  ev.openF = frames.find((r) => r[7] <= 17)?.[0] ?? -1;
  ev.fallF = ev.openF >= 0 ? (frames.find((r) => r[0] > ev.openF && r[7] > 17)?.[0] ?? -1) : -1;
  ev.deadF_est = frames.find((r) => r[7] >= 42 && ev.fallF > 0 && r[0] > ev.fallF)?.[0] ?? -1;
  for (const role of ["fb", "wg"]) {
    const xi = role === "fb" ? 1 : 4, yi = role === "fb" ? 2 : 5, gi = role === "fb" ? 3 : 6;
    const g = (r) => r[gi] === 1;
    const board = frames.find((r) => g(r) && r[xi] >= 870 && r[xi] <= 935 && r[yi] >= 210 && r[yi] <= 260);
    ev[role + "_boardF"] = board?.[0] ?? -1; ev[role + "_boardX"] = board ? r2(board[xi]) : "?";
    const graze = board ? frames.find((r) => r[0] > board[0] && g(r) && r[xi] >= 560 && r[xi] <= 720 && r[yi] >= 230 && r[yi] <= 275) : null;
    ev[role + "_grazeF"] = graze?.[0] ?? -1; ev[role + "_grazeX"] = graze ? r2(graze[xi]) : "?";
    const mound = graze ? frames.find((r) => r[0] > graze[0] && g(r) && r[xi] >= 420 && r[xi] <= 530) : null;
    ev[role + "_moundF"] = mound?.[0] ?? -1; ev[role + "_moundX"] = mound ? r2(mound[xi]) : "?";
    const shaft = mound ? frames.find((r) => r[0] > mound[0] && r[xi] <= 310) : null;
    ev[role + "_shaftF"] = shaft?.[0] ?? -1; ev[role + "_shaftX"] = shaft ? r2(shaft[xi]) : "?";
    const last = frames[frames.length - 1];
    ev[role + "_endX"] = r2(last[xi]); ev[role + "_endY"] = r2(last[yi]);
  }
  return ev;
}

// ---- 主循环：variants × timeMs ----
const variants = JSON.parse(readFileSync(process.argv[2], "utf8"));
const timeMsList = (process.argv.includes("--timeMs") ? process.argv[process.argv.indexOf("--timeMs") + 1] : "4000").split(",").map(Number);
const csvPath = process.argv.includes("--csv") ? process.argv[process.argv.indexOf("--csv") + 1] : null;
const framesDir = process.argv.includes("--frames-dir") ? process.argv[process.argv.indexOf("--frames-dir") + 1] : null;
if (framesDir) mkdirSync(framesDir, { recursive: true });

const cols = ["name", "timeMs", "verdict", "deathF", "deadWho", "wonAt", "endF",
  "pressF", "openF", "fallF", "deadF_est",
  "fb_boardF", "fb_boardX", "fb_grazeF", "fb_grazeX", "fb_moundF", "fb_moundX", "fb_shaftF", "fb_shaftX", "fb_endX", "fb_endY",
  "wg_boardF", "wg_boardX", "wg_grazeF", "wg_grazeX", "wg_moundF", "wg_moundX", "wg_shaftF", "wg_shaftX", "wg_endX", "wg_endY"];
if (csvPath && !existsSync(csvPath)) appendFileSync(csvPath, cols.join(",") + "\n");

for (const timeMs of timeMsList) {
  for (const [name, v] of Object.entries(variants)) {
    const sf = [...lastFin.sf, ...toSpec(v.fb)];
    const sw = [...lastFin.sw, ...toSpec(v.wg)];
    const { rec, frames } = replayCf(sf, sw, timeMs, totalCapF);
    const ev = events(frames);
    const verdict = rec.wonAt >= 0 ? `WIN@${rec.wonAt}` : rec.deathF >= 0 ? `DEATH@${rec.deathF}(${rec.deadWho})` : "TIMEOUT";
    const row = { name, timeMs, verdict, deathF: rec.deathF, deadWho: rec.deadWho ?? "-", wonAt: rec.wonAt, endF: rec.endF, ...ev };
    console.log(cols.map((c) => String(row[c] ?? "?")).join("\t"));
    if (csvPath) appendFileSync(csvPath, cols.map((c) => String(row[c] ?? "?")).join(",") + "\n");
    if (framesDir) writeFileSync(join(framesDir, `${name}.t${timeMs}.csv`), frames.map((r) => r.join(",")).join("\n") + "\n");
  }
}
