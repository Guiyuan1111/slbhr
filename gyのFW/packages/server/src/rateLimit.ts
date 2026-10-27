/**
 * 固定窗口限流（#45）：内存版、单进程口径（多实例/集群部署应在反代层限流）。
 *
 * key 取 express 的 req.ip（FW_TRUST_PROXY=1 时 express 需另行 set("trust proxy")，
 * 当前部署形态——127.0.0.1/隧道单入口——socket 对端即真实入口，req.ip 天然正确）。
 * 超限返回 429 + Retry-After；窗口翻新时顺手全量清扫过期键，防 Map 无界增长。
 */
import type { RequestHandler } from "express";

export interface FixedWindowOptions {
  /** 窗口时长（毫秒） */
  windowMs: number;
  /** 窗口内允许的最大请求数 */
  max: number;
}

export function fixedWindowRateLimit(opts: FixedWindowOptions): RequestHandler {
  const hits = new Map<string, { start: number; count: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? "?";
    let h = hits.get(key);
    if (!h || now - h.start >= opts.windowMs) {
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (now - v.start >= opts.windowMs) hits.delete(k);
      }
      h = { start: now, count: 0 };
      hits.set(key, h);
    }
    h.count++;
    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, opts.max - h.count)));
    if (h.count > opts.max) {
      res.setHeader("Retry-After", String(Math.ceil((opts.windowMs - (now - h.start)) / 1000)));
      res.status(429).json({ error: "请求过于频繁" });
      return;
    }
    next();
  };
}
