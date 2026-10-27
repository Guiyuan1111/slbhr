/**
 * 进程级最后防线（#45）：房间级异常已由 ForestRoom.onUncaughtException 隔离（只弃
 * 出事房间）；uncaughtException/unhandledRejection 只做可观测（完整堆栈入日志），
 * 不主动退出——此时进程退出只会放大爆炸半径（全部房间同时掉线）。
 * 工厂导出便于单测（process.on 的内联回调无法被覆盖率观测）。
 */
export function logFatal(tag: string): (arg: unknown) => void {
  return (arg) => {
    console.error(`[fw] ${tag}:`, arg);
  };
}
