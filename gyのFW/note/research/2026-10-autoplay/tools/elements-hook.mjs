/**
 * elements hook：kernel.mjs 的 LEVELS_DIRS 定点插入 elements 子庙目录（进程内载入文本替换，
 * 磁盘零改动）。锚点失配即抛错（防静默漂移）。见 elements-shim.mjs 头注。
 */
const OLD_DIRS = 'const LEVELS_DIRS = ["data/forest/levels", "data/light/levels", "data/ice/levels", "data/fairytales/levels", "data/tutorials/levels"]';
const NEW_DIRS = 'const LEVELS_DIRS = ["data/forest/levels", "data/light/levels", "data/ice/levels", "data/elements/crystal/levels", "data/elements/fire/levels", "data/elements/forest/levels", "data/elements/ice/levels", "data/elements/light/levels", "data/elements/water/levels", "data/elements/wind/levels", "data/fairytales/levels", "data/tutorials/levels"]';

export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context);
  if (url.endsWith("/scripts/e2e/routetool/kernel.mjs")) {
    const src = String(r.source ?? "");
    if (!src.includes(OLD_DIRS)) {
      throw new Error(`[elements-hook] kernel.mjs LEVELS_DIRS 锚点失配——routetool 可能已被其他槽更新，本 shim 应复核后停用/改写`);
    }
    r.source = src.replace(OLD_DIRS, NEW_DIRS);
  }
  return r;
}
