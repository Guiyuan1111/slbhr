/**
 * 安全响应头工厂（#45）：从 index.ts 抽出的可测单元。
 * CSP 以启动时从构建产物提取内联脚本 sha256 的方式放行 index.html 的早期错误捕获脚本
 * （与所服务内容同源保证一致；产物缺失时退化为仅 'self'——页面本身也 404）。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RequestHandler } from "express";

/** 提取 dist/index.html 全部内联 <script> 的 CSP sha256 清单（空格前缀连接）；产物缺失返回 "" */
export function buildInlineScriptHashes(root: string): string {
  try {
    const html = readFileSync(join(root, "packages/client/dist/index.html"), "utf8");
    const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
      (m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`,
    );
    return hashes.length ? " " + hashes.join(" ") : "";
  } catch {
    return "";
  }
}

/** CSP 组装：connect-src 放开 ws/wss 兼容局域网 IP 直连与隧道（同源升级时 'self'
 *  在部分浏览器不覆盖 ws: scheme）；frame-ancestors none + XFO DENY 双保险。 */
export function composeCsp(scriptHashes: string): string {
  return [
    "default-src 'self'",
    "script-src 'self'" + scriptHashes,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: data:",
    "connect-src 'self' ws: wss:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** 全响应安全头中间件：nosniff / DENY / no-referrer / CSP（#45 纵深防御） */
export function securityHeadersMiddleware(csp: string): RequestHandler {
  return (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", csp);
    next();
  };
}
