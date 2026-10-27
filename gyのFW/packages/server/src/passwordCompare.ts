/**
 * 房间口令时序安全比较（2026-10-27 审计 P3-15）。
 *
 * 两人私用联机房，口令是唯一凭证；原 `candidate !== actual` 的字符串比较在首个
 * 不匹配字节处短路，理论上有逐字节时序侧信道（auth 限流窗内可反复探测）。长度
 * 差异先短路仍保留——长度口径（onCreate 4-64 位）本身公开，不构成泄漏面；内容
 * 比较两侧先过 sha256 再 timingSafeEqual，等长摘要规避了 timingSafeEqual 对
 * 输入等长的抛错路径。
 */
import { createHash, timingSafeEqual } from "node:crypto";

export function passwordEquals(candidate: string, actual: string): boolean {
  if (candidate.length !== actual.length) return false;
  return timingSafeEqual(
    createHash("sha256").update(candidate, "utf8").digest(),
    createHash("sha256").update(actual, "utf8").digest(),
  );
}
