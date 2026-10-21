/**
 * jsonRes：API JSON 响应的协商压缩 + 校验式复用（r15 件C）。
 *
 * 背景（perf-load r15-base 逐 URL/头部拆账）：/api/level/:id 走 express `res.json()`
 * ——既没有 Content-Encoding，也没有 ETag/Cache-Control，响应体按原字节传输。关卡 JSON
 * 高度冗余（实测 49 个文件 422KB→gzip9 48KB；forest_bonus_2 59,943B→br 1,954B，省 96.7%），
 * 入房与换关链每次都要为整份原文付费；隧道口径下 58KB 按 2Mbps 约 234ms。
 *
 * 不缓存压缩产物：单关 br q5 压缩实测 ≈1ms（59,943B→1,954B），比驻留一份 Buffer 更划算
 * ——服务端不留无界缓冲（r14 驻留内存轮的口径）。
 *
 * 语义红线：关卡数据随版本可能原地更新，故**不给新鲜期**（`no-cache`），只做校验式复用
 * ——命中条件请求即 304（几百字节头），未命中才回正文。客户端不支持编码、未声明
 * Accept-Encoding、或正文 <1KB 时按原字节响应（与 `res.json()` 等价）。
 */
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { matchesEtag } from "./staticGz.js";

/** 低于此体量不压缩：协商成本高于收益（同 staticGz 的 ≥1KB 约定） */
const MIN_BYTES = 1024;

export function sendJson(req: Request, res: Response, payload: unknown): void {
  const body = Buffer.from(JSON.stringify(payload));
  // 内容寻址：同内容必同标签，进程重启/多实例也稳定（不同于静态的 mtime+size）
  const etag = `"json-${createHash("sha256").update(body).digest("hex").slice(0, 24)}"`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("ETag", etag);
  if (matchesEtag(req, etag)) {
    res.status(304).end();
    return;
  }

  const enc = String(req.headers["accept-encoding"] ?? "");
  let out = body;
  const wantBr = enc.includes("br");
  if (body.length >= MIN_BYTES && (wantBr || enc.includes("gzip"))) {
    const packed = wantBr
      ? zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
      : zlib.gzipSync(body, { level: 6 });
    // 压缩反而变大（冗余度极低的正文）就回退原样
    if (packed.length < body.length) {
      out = packed;
      res.setHeader("Content-Encoding", wantBr ? "br" : "gzip");
    }
  }
  res.setHeader("Content-Length", String(out.length));
  res.status(200).end(out);
}
