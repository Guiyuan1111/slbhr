/**
 * temple.json 页面级单例（r8 perf 件3，2026-10-20）。
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

let pending: Promise<TempleEntry[]> | null = null;

/** 取 temple.json levels 数组（成功时页面生命周期内只 fetch 一次；失败返回 [] 并清空 pending，
 *  下次调用重新请求——避免一次网络抖动把空数组永久固化为成功结果） */
export function loadTempleLevels(): Promise<TempleEntry[]> {
  if (!pending) {
    pending = fetch("/data/forest/temple.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: { levels?: TempleEntry[] }) => j?.levels ?? [])
      .catch(() => {
        // 本次调用方已持有 promise，清空只影响下一次调用，不会造成并发重复请求
        pending = null;
        console.warn("[fw] temple.json 加载失败，将重试");
        return [] as TempleEntry[];
      });
  }
  return pending;
}
