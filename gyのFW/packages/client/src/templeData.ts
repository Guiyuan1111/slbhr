/**
 * temple.json 页面级单例（r8 perf 件3，2026-10-20；2026-10-25 起按关卡前缀分庙缓存——
 *  第二部 light：templeIdOf(levelId) → /data/<temple>/temple.json）。
 *
 * 此前同一文件被三处各自拉取：enterGame（连接关键路径上 await fetch，~30ms）、
 * GameScene.fetchTempleTime（每次场景 create 重复 fetch+parse）、TempleScene
 * （Phaser load.json 走 game cache，另一份）。本模块给非 loader 路径一个共享
 * Promise：bindUi 启动时预取，点击建房时 enterGame 的 await 恒命中已完成态。
 * 失败语义与旧路径一致（拿不到=空数组，走 general/不限时缺省，结算/星级照常）。
 */

/** temple.json 条目（time/type/filename；与 main.ts templeRaw 同构） */
export interface TempleEntry {
  id?: number;
  filename?: string;
  time?: number;
  type?: string;
}

/** 神庙键（=data 目录与 Temples 图集子目录；E 部七元素为 elements/<x> 共七键） */
export type TempleKey =
  | "forest"
  | "light"
  | "ice"
  | "crystal"
  | "elements/crystal"
  | "elements/fire"
  | "elements/forest"
  | "elements/ice"
  | "elements/light"
  | "elements/water"
  | "elements/wind"
  | "fairytales";

/** 关卡 id → 神庙键（light/ice/crystal 各部前缀；E 部元素关 e<x>_ 前缀 → elements/<x>；
 *  E 教学 e_tutorial_<元素> → elements/<元素>（oracle elements/<x>/temple.json 含该教学关
 *  条目，time/type 由此取——2026-10-31 勘误，前版回 forest 兜底取不到计时）；其余回 forest 兜底） */
export function templeIdOf(levelId: string | null | undefined): TempleKey {
  const tut = /^e_tutorial_(fire|water|wind)$/.exec(levelId ?? "");
  if (tut) return `elements/${tut[1]}` as TempleKey;
  const m = /^(eforest|efire|eice|elight|ewater|ewind|ecrystal|fairies|forest|light|ice|crystal)[-_/]?/.exec(levelId ?? "");
  if (!m) return "forest";
  const p = m[1];
  if (p === "fairies") return "fairytales";
  if (p.startsWith("e") && p.length > 1 && !"forest light ice crystal".split(" ").includes(p)) {
    return `elements/${p.slice(1)}` as TempleKey;
  }
  return p as TempleKey;
}

/** 逐庙单例（forest/light 各一份；失败清对应项支持重试） */
const pendings = new Map<string, Promise<TempleEntry[]>>(); // 逐庙（forest/light/ice）

/** 取 temple.json levels 数组（levelId 决定神庙目录，缺省 forest；成功时同庙页面生命周期内只
 *  fetch 一次；失败返回 [] 并清缓存，下次调用重新请求——避免一次网络抖动把空数组永久固化） */
export function loadTempleLevels(levelId?: string | null): Promise<TempleEntry[]> {
  const temple = templeIdOf(levelId);
  let pending = pendings.get(temple);
  if (!pending) {
    pending = fetch(`/data/${temple}/temple.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: { levels?: TempleEntry[] }) => j?.levels ?? [])
      .catch(() => {
        // 本次调用方已持有 promise，清空只影响下一次调用，不会造成并发重复请求
        pendings.delete(temple);
        console.warn(`[fw] ${temple} temple.json 加载失败，将重试`);
        return [] as TempleEntry[];
      });
    pendings.set(temple, pending);
  }
  return pending;
}
