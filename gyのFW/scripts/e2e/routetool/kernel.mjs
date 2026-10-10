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

const LEVELS_DIRS = ["data/tutorials/levels", "data/forest/levels"]
  .map((rel) => join(ROOT, rel))
  .filter((dir) => {
    try { readdirSync(dir); return true; } catch { return false; }
  });
const { parseLevel } = await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "level2.ts")).href);
const { World } = await import(pathToFileURL(join(ROOT, "packages", "shared", "src", "kernel", "world.ts")).href);

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

/** 关卡 JSON 检索：tutorials 与 forest 两个关卡库（forest_01 在前者，其余 47 关在后者） */
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

/** 每次调用新建 World（物理状态不可复用，一次回跑一个实例） */
export function makeWorld(level) {
  const { dir, doc } = locateLevel(level);
  return new World(parseLevel(level, doc, makeProvider(dir)));
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
 */
export function runKernel(level, routeDoc, opts = {}) {
  const total = routeDoc.totalFrames;
  const ins = expandFlat(routeDoc.fb, routeDoc.wg, total);
  const w = makeWorld(level);
  for (let f = 0; f < total; f++) {
    w.step(1 / 60, { fireboy: ins.fb[f], watergirl: ins.wg[f] });
    const fb = w.snapshotPlayer("fireboy"), wg = w.snapshotPlayer("watergirl");
    opts.traceTo?.push({ f, fb: [fb.x, fb.y], wg: [wg.x, wg.y], ph: w.phase });
    if (fb.dead || wg.dead || fb.dying || wg.dying) return { won: false, deathF: f };
    if (w.phase === "won") return { won: true, deathF: -1, winF: f };
  }
  return { won: false, deathF: -1 };
}
