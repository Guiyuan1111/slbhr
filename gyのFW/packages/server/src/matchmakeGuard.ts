/**
 * matchmakeGuard：/matchmake 入口闸门（M5 请求体上限 + #45 方法分流/CORS 收口）。
 *
 * 背景：Colyseus 0.16 的 Server.handleMatchMakeRequest 对 POST body 无上限——持续
 * `req.on("data")` 累加后 `Buffer.concat` + `JSON.parse`（Server.js:225-231），公网隧道下
 * 一个超大 body 即可打爆内存。这里在 http.Server 的 request 事件最前面加一道 16KB 闸门。
 *
 * 安装顺序（关键）：Server 构造时 attachMatchMakingRoutes 会 `removeAllListeners("request")`
 * 并重新挂自己的监听器（Server.js:192-194），因此必须在 `new Server(...)` 之后安装；
 * 用 `prependListener` 保证先于 Colyseus 监听器执行。未超限的请求只做字节计数，
 * 不缓存 body、不 pause，Colyseus 仍能正常读取完整 body。
 */
import type http from "node:http";
import { isOriginAllowed } from "./originPolicy.js";

export const MATCHMAKE_MAX_BYTES = 16 * 1024;

/**
 * 在 server 上安装 /matchmake POST 请求体上限。
 * @param server 与 Colyseus WebSocketTransport 共用的 http.Server
 * @param maxBytes 允许的最大 body 字节数（缺省 16KB）
 */
export interface MatchmakeGuardOptions {
  maxBytes?: number;
  /** 显式跨域白名单（FW_ALLOWED_ORIGINS，逗号分隔）；同源与无 Origin 恒放行 */
  allowedOrigins?: string[];
}

export function installMatchmakeBodyGuard(server: http.Server, opts: number | MatchmakeGuardOptions = {}): void {
  const { maxBytes = MATCHMAKE_MAX_BYTES, allowedOrigins = [] } =
    typeof opts === "number" ? { maxBytes: opts } : opts;
  server.prependListener("request", (req, res) => {
    // 用 "/matchmake"（与 Colyseus Server.js:196 的 indexOf 判定同口径，含末尾无斜杠变体），
    // 避免 /matchmake 裸路径绕过上限。静态资源/健康检查/WS upgrade 完全不受影响。
    if (!(req.url ?? "").includes("/matchmake")) return;

    // #32：Colyseus handleMatchMakeRequest 有 OPTIONS(204)/POST/GET(404) 三个响应分支
    // （core Server.js:206-256），PUT/DELETE/HEAD/PATCH 无分支——不写响应也不 end，
    // socket 永久挂起（未鉴权连接可无限占用 FD），由 guard 立即 405 并关闭连接。
    // #36：GET 必须交还 Colyseus（vendor 返回 404）——此前一律 405 与 vendor 语义冲突，
    // 且断言「非 OPTIONS/POST 无响应分支」的注释前提对 GET 不成立。
    if (req.method !== "POST" && req.method !== "OPTIONS" && req.method !== "GET") {
      if (!res.headersSent) {
        res.writeHead(405, { Allow: "OPTIONS, POST, GET", Connection: "close" });
        res.end(() => req.destroy());
      } else {
        req.destroy();
      }
      return;
    }
    // #45：CORS/Origin 收口。Colyseus 缺省 OPTIONS 回 ACAO:* + ACAC:true（规范无效组合，
    // 且允许任意站点跨域建房/探房）。改白名单口径：无 Origin（curl/Node/e2e）放行、
    // 同源放行、白名单放行，其余 403；OPTIONS 由本层直接应答（回显单一 Origin），
    // 不再交给 vendor（其通配头不可收敛）。
    const origin = req.headers.origin;
    if (!isOriginAllowed(origin, req.headers.host, allowedOrigins)) {
      res.writeHead(403, { Connection: "close" });
      res.end(() => req.destroy());
      return;
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": origin ?? "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      });
      res.end();
      return;
    }
    if (req.method !== "POST") return;

    let rejected = false;
    const reject = (): void => {
      if (rejected) return;
      rejected = true;
      const body = JSON.stringify({ error: "请求体过大" });
      if (!res.headersSent) {
        res.writeHead(413, {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Connection: "close",
        });
        // end 回调在响应刷出后销毁请求，避免 RST 先于 413 到达客户端
        res.end(body, () => req.destroy());
      } else {
        req.destroy();
      }
    };

    // 声明长度已超限：无需等 body，立即拒绝
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      reject();
      return;
    }

    // 无 content-length（chunked）或声明值不超限：边收边计数；不消费/不 pause，
    // Colyseus 的 data 监听器照常拿到同一批 chunk。
    let received = 0;
    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes) reject();
    });
  });
}
