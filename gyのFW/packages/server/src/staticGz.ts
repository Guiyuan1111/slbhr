/**
 * staticGz：带压缩协商的静态文件中间件（0.3.14 引入 gzip，0.3.21 升级 brotli 协商 + 分级缓存，
 * r15 补齐压缩路径的条件校验）。
 * - 压缩：文本类扩展名 + ≥1KB ≤8MB；客户端支持 br 优先 brotli（比 gzip 再省 ~15%），
 *   否则 gzip；产物按 路径+mtime+编码 内存缓存；异常回退 express.static。
 * - 缓存（perf-load 基准优化项）：
 *   · Vite 内容哈希产物（如 index-CnbrvQg2.js / vendor-B1Q2w3e4.js：`-` 后 8 位以上
 *     [A-Za-z0-9_-]，大小写混合且非纯十六进制）→ immutable 1 年（版本升级换文件名自然失效）；
 *   · index.html → no-cache（必须回源校验，才能拿到新哈希引用）；
 *   · 其余**文本**（图集 JSON/位图字 .fnt/关卡数据）→ public 1 天 + ETag（过期回源即 304）。
 *   · **二进制素材（PNG/JPG/MP3）不走压缩路径，由 fallback（express.static）给 max-age=0 +
 *     ETag 逐次回源**——这是有意保留而非遗漏：图集帧布局与客户端代码同版本耦合，若也吃
 *     1 天新鲜期，"新版 JS + 旧版图集"最长可错位 24h（表现为整屏错帧）。304 仅花一个
 *     往返、几百字节头，代价远低于错位风险。
 *   · 压缩响应带 Vary: Accept-Encoding（经代理/隧道缓存时的协商正确性）。
 * - 条件校验（r15）：0.3.21 起压缩路径直接 res.end(buffer) 自行托管，绕过了 express.static
 *   的 ETag/304，导致**所有 br/gzip 响应无条件校验能力**（perf-load r15-base 头部拆账实测
 *   br 响应 etag 列全为 no）——新鲜期一过即整份重下。现按 编码+mtime+大小 生成强 ETag，
 *   并处理 If-None-Match（含 W/ 不透明比较与 `*`）/If-Modified-Since → 304。ETag 含编码是
 *   RFC 7232 的要求：br/gzip/identity 是三种不同表示，不可共用同一实体标签。
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
/** r37 客户端内容寻址参数：`?v=` + 8 位小写十六进制（scripts/asset-versions.mjs 产物）。
 *  URL 随字节变化，故可 immutable；其他形式的 v 不升级缓存策略。 */
const VERSIONED_QUERY = /[?&]v=[0-9a-f]{8}(?:&|$)/;

export function isVersionedUrl(url: string): boolean {
  return VERSIONED_QUERY.test(url);
}

export function cachePolicy(urlPath: string, versioned = false): string {
  if (urlPath.endsWith(".html")) return "no-cache";
  if (versioned) return "public, max-age=31536000, immutable";
  if (HASHED_EXT.test(urlPath)) return "public, max-age=31536000, immutable";
  return "public, max-age=86400";
}

/** express.static 兜底路径（二进制/小文本/不协商压缩）：未版本化二进制必须保持
 *  max-age=0——图集帧布局与客户端代码同版本耦合，吃新鲜期会"新版 JS + 旧版图集"
 *  错位；带内容哈希 v 的 URL 例外（字节变则 URL 变）。 */
export function fallbackCachePolicy(urlPath: string, versioned: boolean): string {
  if (urlPath.endsWith(".html")) return "no-cache";
  return versioned ? "public, max-age=31536000, immutable" : "public, max-age=0";
}

/** 强 ETag：编码 + mtime(16 进制) + 字节数。编码进标签 = 每种表示各自有身份。 */
export function entityTag(st: fs.Stats, encoding: "br" | "gzip"): string {
  return `"${encoding}-${Math.round(st.mtimeMs).toString(16)}-${st.size.toString(16)}"`;
}

/** If-None-Match 判定（RFC 9110 §13.2.4 弱比较）：`*`、多标签列表、W/ 前缀都算命中。
 *  导出给 JSON 响应路由共用（./jsonRes.ts），保证两处条件校验语义一致。 */
export function matchesEtag(req: express.Request, etag: string): boolean {
  const inm = req.headers["if-none-match"];
  if (typeof inm !== "string" || inm.trim() === "") return false;
  if (inm.trim() === "*") return true;
  const strip = (t: string) => t.trim().replace(/^W\//, "");
  return inm.split(",").some((t) => strip(t) === strip(etag));
}

/** 新鲜度判定：If-None-Match 优先，其次 If-Modified-Since。
 *  时间头按 HTTP 的 1 秒粒度取整比较，否则同秒内写入的文件会被判为已变。 */
export function isFresh(req: express.Request, etag: string, mtimeMs: number): boolean {
  if (matchesEtag(req, etag)) return true;
  const ims = req.headers["if-modified-since"];
  if (typeof ims === "string" && ims.trim() !== "") {
    const since = Date.parse(ims);
    if (!Number.isNaN(since)) return Math.floor(mtimeMs / 1000) <= Math.floor(since / 1000);
  }
  return false;
}

interface CompCacheEntry {
  mtimeMs: number;
  /** r15：失效判据由单 mtime 扩为 mtime+size（与 express.static 的 ETag 同源）。
   *  残留边界：同一毫秒内原地改写且字节数不变的文本会命中旧压缩产物——fs 层无法分辨，
   *  本项目素材/产物的更新都伴随构建（新 mtime 且几乎必变长度），实际不可达。 */
  size: number;
  br?: Buffer;
  gz?: Buffer;
}
const compCache = new Map<string, CompCacheEntry>();

export function staticGz(root: string) {
  // cacheControl:false：兜底路径的缓存头由 fallbackCachePolicy 统一给（r37 版本感知），
  // 否则 express.static 会用 max-age=0 覆盖掉版本化 URL 的 immutable。
  const fallback = express.static(root, { cacheControl: false });
  // 根前缀锚点（M-02）：resolve 归一化后必须仍落在 root 内。rootAbs 恰好等于根时放行
  // （urlPath="/" 场景），其余一律要求 rootAbs + sep 前缀——Windows 下 `..%5c` 反斜杠
  // 穿越同样被 resolve+前缀检查拦下。
  const rootAbs = resolve(root);
  const rootPrefix = rootAbs.endsWith(sep) ? rootAbs : rootAbs + sep;
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const enc = String(req.headers["accept-encoding"] ?? "");
    let urlPath = "";
    try {
      urlPath = decodeURIComponent((req.url ?? "").split("?")[0]);
    } catch {
      urlPath = req.url ?? "";
    }
    const wantBr = enc.includes("br");
    const versioned = isVersionedUrl(req.url ?? "");
    if ((!wantBr && !enc.includes("gzip")) || !GZ_EXT.test(urlPath)) {
      res.setHeader("Cache-Control", fallbackCachePolicy(urlPath, versioned));
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
        // 小文本/超限文件也走兜底：缓存头同样由统一策略给（cacheControl:false 不再代劳）
        res.setHeader("Cache-Control", fallbackCachePolicy(urlPath, versioned));
        fallback(req, res, next);
        return;
      }
    } catch {
      fallback(req, res, next);
      return;
    }
    const isHtml = urlPath.endsWith(".html");
    // html 走 no-cache + 原样（体量小，压缩收益低于协商成本）
    if (isHtml) {
      res.setHeader("Cache-Control", "no-cache");
      fallback(req, res, next);
      return;
    }
    let cached = compCache.get(fpAbs);
    if (!cached || cached.mtimeMs !== st.mtimeMs || cached.size !== st.size) {
      cached = { mtimeMs: st.mtimeMs, size: st.size };
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
    const etag = entityTag(st, wantBr ? "br" : "gzip");
    res.setHeader("Content-Type", ctype);
    res.setHeader("Cache-Control", cachePolicy(urlPath, versioned));
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", new Date(st.mtimeMs).toUTCString());
    // 条件校验：新鲜即 304（不带正文，也不带 Content-Encoding/Content-Length）
    if (isFresh(req, etag, st.mtimeMs)) {
      res.status(304).end();
      return;
    }
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
