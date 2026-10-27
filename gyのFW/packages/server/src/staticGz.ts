/**
 * staticGz：带压缩协商的静态文件中间件（0.3.14 引入 gzip，0.3.21 升级 brotli 协商 + 分级缓存）。
 * - 压缩：文本类扩展名 + ≥1KB ≤8MB；客户端支持 br 优先 brotli（比 gzip 再省 ~15%），
 *   否则 gzip；产物按 路径+mtime+编码 内存缓存；异常回退 express.static。
 * - 缓存（perf-load 基准优化项）：
 *   · Vite 内容哈希产物（如 index-CnbrvQg2.js / vendor-B1Q2w3e4.js：`-` 后 8 位以上
 *     [A-Za-z0-9_-]，大小写混合且非纯十六进制）→ immutable 1 年（版本升级换文件名自然失效）；
 *   · index.html → no-cache（必须回源校验，才能拿到新哈希引用）；
 *   · 其余（图集/音频/数据）→ public 1 天（内容随版本可能原地更新，不可 immutable）。
 *   · 压缩响应带 Vary: Accept-Encoding（经代理/隧道缓存时的协商正确性）。
 * - 安全（M-02）：请求路径经 decodeURIComponent + join 后若越过根目录（`..%2f` 穿越读取
 *   仓库内其它 JSON/HTML），一律拒绝并走 fallback（404）。回归用例见
 *   packages/server/src/__tests__/staticGz.test.ts。
 */
import fs from "node:fs";
import zlib from "node:zlib";
import { join, resolve, sep } from "node:path";
import express from "express";

const GZ_EXT = /\.(js|mjs|json|html|css|svg|fnt|txt|xml)$/;
/** Vite 产物哈希：`-` + 8 位以上 [A-Za-z0-9_-] + .js/.mjs/.css（点必须转义）。
 *  实际产物含大小写/非十六进制（index-CnbrvQg2.js），旧的 `-[0-9a-f]{8}.` 会漏判。 */
const HASHED_EXT = /-[A-Za-z0-9_-]{8,}\.(js|mjs|css)$/;

export function cachePolicy(urlPath: string): string {
  if (urlPath.endsWith(".html")) return "no-cache";
  if (HASHED_EXT.test(urlPath)) return "public, max-age=31536000, immutable";
  return "public, max-age=86400";
}

interface CompCacheEntry {
  mtimeMs: number;
  br?: Buffer;
  gz?: Buffer;
}
const compCache = new Map<string, CompCacheEntry>();

export function staticGz(root: string) {
  const fallback = express.static(root);
  // 根前缀锚点（M-02）：resolve 归一化后必须仍落在 root 内。rootAbs 恰好等于根时放行
  // （urlPath="/" 场景），其余一律要求 rootAbs + sep 前缀——Windows 下 `..%5c` 反斜杠
  // 穿越同样被 resolve+前缀检查拦下。
  const rootAbs = resolve(root);
  const rootPrefix = rootAbs.endsWith(sep) ? rootAbs : rootAbs + sep;
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    // #45：express.static（fallback）只处理 GET/HEAD，但压缩分支此前不判方法——
    // POST/PUT 到 .json 会 200 回静态文件（HTTP 语义错误）。非 GET/HEAD 一律交
    // fallback（404/405 语义由其决定）。
    if (req.method !== "GET" && req.method !== "HEAD") {
      fallback(req, res, next);
      return;
    }
    const enc = String(req.headers["accept-encoding"] ?? "");
    let urlPath = "";
    try {
      urlPath = decodeURIComponent((req.url ?? "").split("?")[0]);
    } catch {
      urlPath = req.url ?? "";
    }
    const wantBr = enc.includes("br");
    if ((!wantBr && !enc.includes("gzip")) || !GZ_EXT.test(urlPath)) {
      fallback(req, res, next);
      return;
    }
    const fpAbs = resolve(join(root, urlPath));
    if (fpAbs !== rootAbs && !fpAbs.startsWith(rootPrefix)) {
      fallback(req, res, next);
      return;
    }
    let st: fs.Stats;
    try {
      st = fs.statSync(fpAbs);
      if (!st.isFile() || st.size < 1024 || st.size > 8 << 20) {
        fallback(req, res, next);
        return;
      }
    } catch {
      fallback(req, res, next);
      return;
    }
    const isHtml = urlPath.endsWith(".html");
    // html 走 no-cache + 原样（体量小，压缩收益低于协商成本）。注意：fallback
    // （express.static）会覆写为 public, max-age=0——语义相近（都强制回源校验），
    // 保留本行以备 fallback 策略变更（#45 注释勘误：此前注释称生效的 no-cache 不实）。
    if (isHtml) {
      res.setHeader("Cache-Control", "no-cache");
      fallback(req, res, next);
      return;
    }
    let cached = compCache.get(fpAbs);
    if (!cached || cached.mtimeMs !== st.mtimeMs) {
      cached = { mtimeMs: st.mtimeMs };
      compCache.set(fpAbs, cached);
    }
    const ctype = urlPath.endsWith(".js") || urlPath.endsWith(".mjs")
      ? "application/javascript"
      : urlPath.endsWith(".json")
        ? "application/json"
        : urlPath.endsWith(".css")
          ? "text/css"
          : urlPath.endsWith(".svg")
            ? "image/svg+xml"
            : urlPath.endsWith(".fnt")
              ? "text/plain"
              : "application/octet-stream";
    res.setHeader("Content-Type", ctype);
    res.setHeader("Cache-Control", cachePolicy(urlPath));
    res.setHeader("Vary", "Accept-Encoding");
    try {
      if (wantBr) {
        if (!cached.br) cached.br = zlib.brotliCompressSync(fs.readFileSync(fpAbs), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
        res.setHeader("Content-Encoding", "br");
        res.setHeader("Content-Length", String(cached.br.length));
        res.status(200).end(cached.br);
      } else {
        if (!cached.gz) cached.gz = zlib.gzipSync(fs.readFileSync(fpAbs), { level: 6 });
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Content-Length", String(cached.gz.length));
        res.status(200).end(cached.gz);
      }
    } catch {
      fallback(req, res, next);
      return;
    }
  };
}
