/**
 * 路线产线·内核 harness：关卡 JSON → World → 路线回放（自验收 L2/L3 公用件）。
 *
 * 产线全流程（route 产线 = 输入关卡 JSON → 产出路线 + 门禁报告）：
 *   1. 初排    人工/半自动在内核里走通（原语库+分段时间线，见 note/forest01-route.md）；
 *   2. optimize ±1f 容忍硬化（成组平移坐标下降），写回路线 JSON；
 *   3. validate  内核复核 WIN；
 *   4. ../route.mjs 真实服务端门禁（repeat≥3 ALL PASS 才算关卡通关）。
 *
 * 内核经 tsx 直载 TS 源（node --import tsx），与真实服务端同一份实现，
 * 不再依赖 TEMP 期的临时编译产物。路线 JSON 格式与门禁 runner 相同：
 * { level, tickHz, totalFrames, fb: [{f,dir,type}], wg: [...] }。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../lib.mjs";

// 关卡目录与服务器 levels.ts LEVEL_DIRS 检索序对齐（fw-fairydrag 槽 2026-10-31：补
// data/fairytales/levels F 部；tutorials 仍兜底最后——与既有 forest/light/ice 关卡解析零交集，
// 前插会改变 tutorials 兜底前的命中序，故按服务器同位次插在 tutorials 之前）。
const LEVELS_DIRS = ["data/forest/levels", "data/light/levels", "data/ice/levels", "data/fairytales/levels", "data/tutorials/levels"]
  .map((rel) => join(ROOT, rel))
  .filter((dir) => {
    try { readdirSync(dir); return true; } catch { return false; }
  });
const { parseLevel } = await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "level2.ts")).href);
const { World } = await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "kernel", "world.ts")).href);
// fw-fairydrag 槽（2026-10-31）：fy 轨回放的坐标换算与服务器 ForestRoom.fairydrag 同源
// （b2.ts px2m，屏幕 px → 物理米，-px/32），禁本地复写防漂移。
const { px2m } = await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "kernel", "b2.ts")).href);

/** 路线 doc.fy 轨 → 按帧分组（{f,i,x,y}；x/y=null=松手；同帧保持文件序） */
export function fyByFrame(fy) {
  const byF = new Map();
  for (const e of fy ?? []) {
    if (typeof e?.f !== "number" || typeof e?.i !== "number") continue;
    if (!byF.has(e.f)) byF.set(e.f, []);
    byF.get(e.f).push(e);
  }
  return byF;
}

/** 帧首施加仙女拖拽事件（服务器 ForestRoom fairydrag 同语义：非有限数=松手） */
export function applyFy(w, events) {
  if (!events) return;
  for (const e of events) {
    const fy = w.fairies?.[e.i];
    if (!fy) continue;
    const ok = (v) => typeof v === "number" && Number.isFinite(v);
    fy.setDrag(ok(e.x) && ok(e.y) ? { x: px2m(e.x), y: px2m(e.y) } : null);
  }
}

/** 关卡 JSON 的 tileset 引用解析（source 相对关卡所在目录） */
export function makeProvider(baseDir) {
  const cache = new Map();
  return (source) => {
    if (!cache.has(source)) {
      const p = new URL(source, `file:///${baseDir}/`).pathname.replace(/^\/([A-Za-z]:)/, "$1");
      cache.set(source, JSON.parse(readFileSync(decodeURI(p), "utf8")));
    }
    return cache.get(source);
  };
}

/** 关卡 JSON 检索：tutorials 与三部关卡库（各部首关在 tutorials，其余在本部目录） */
export function locateLevel(level) {
  for (const dir of LEVELS_DIRS) {
    try {
      return { dir, doc: JSON.parse(readFileSync(join(dir, `${level}.json`), "utf8")) };
    } catch (e) {
      if (e?.code !== "ENOENT") throw e;
    }
  }
  throw new Error(`关卡 ${level}.json 未找到（检索 ${LEVELS_DIRS.join("、")}）`);
}

export function loadLevelDoc(level) {
  return locateLevel(level).doc;
}

/** 逐关卡解析产物缓存（r2 perf 件6，2026-10-18）：locateLevel 每次调用重新
 * readFileSync+JSON.parse（关卡+图块集）再全量 parseLevel，占 makeWorld 剩余
 * 成本 ~15%（0.3~0.5ms）。LevelData 为纯定义数据（kernel 只读、World.reset 重建
 * 即复用同实例——不变式既有；服务端 loadLevel 缓存同款论证），同关卡重复建世界
 * （autosearch/scan/optimize 单进程逐次试验、routeio build 计量）免重复解析。 */
const levelDataCache = new Map();

/** 每次调用新建 World（物理状态不可复用，一次回跑一个实例） */
export function makeWorld(level) {
  let data = levelDataCache.get(level);
  if (!data) {
    const { dir, doc } = locateLevel(level);
    data = parseLevel(level, doc, makeProvider(dir));
    levelDataCache.set(level, data);
  }
  return new World(data);
}

/** 平坦事件表 → 逐帧输入（同帧先 up 后 down，与门禁/导出链一致） */
export function expandFlat(fbEvs, wgEvs, totalFrames) {
  const mk = (evs) => {
    const sorted = [...evs].sort((a, b) => a.f - b.f || (a.type === "up" ? -1 : 1));
    const st = { up: false, left: false, right: false };
    const byF = new Map();
    for (const e of sorted) byF.set(e.f, [...(byF.get(e.f) ?? []), [e.dir, e.type === "down"]]);
    const out = [];
    for (let f = 0; f < totalFrames; f++) {
      for (const [k, v] of byF.get(f) ?? []) st[k] = v;
      out.push({ ...st });
    }
    return out;
  };
  return { fb: mk(fbEvs), wg: mk(wgEvs) };
}

/**
 * 内核回跑一条路线：WIN/死亡帧/超时，可选逐帧位置 trace（诊断用）。
 * opts: { traceTo: string[] | null } 传入数组则逐帧追加 {f, fb:[x,y], wg:[x,y], ph}。
 *
 * r1 perf 件4（2026-10-18）：无 trace 需求（缺省）时死亡判定直读角色状态
 * （snapshotPlayer 的 dying/dead 即 Character 同名字段直读，语义逐位相同），
 * 免逐帧两次 snapshotPlayer 分配——r0 实测该 harness 溢价对纯 step +3.9%~+153%
 * （高溢价关 forest_02/03/12 机关多、快照条目多）。traceTo 路径保持原快照口径
 * （validate/dtsweep/vtdiff 的全量轨迹语义不变）。
 */
export function runKernel(level, routeDoc, opts = {}) {
  const total = routeDoc.totalFrames;
  const ins = expandFlat(routeDoc.fb, routeDoc.wg, total);
  const w = makeWorld(level);
  const fyF = fyByFrame(routeDoc.fy); // 缺轨=空 Map，逐帧零查找开销之外无行为差
  const traceTo = opts.traceTo ?? null;
  const fbC = w.players.fireboy;
  const wgC = w.players.watergirl;
  for (let f = 0; f < total; f++) {
    applyFy(w, fyF.get(f));
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    if (traceTo) {
      const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
      traceTo.push({ f, fb: [fb.x, fb.y], wg: [wg.x, wg.y], ph: w.phase });
      if (fb.dead || wg.dead || fb.dying || wg.dying) return { won: false, deathF: f };
      if (w.phase === "won") return { won: true, deathF: -1, winF: f };
    } else {
      if (fbC.dead || wgC.dead || fbC.dying || wgC.dying) return { won: false, deathF: f };
      if (w.phase === "won") return { won: true, deathF: -1, winF: f };
    }
  }
  return { won: false, deathF: -1 };
}
