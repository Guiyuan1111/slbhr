/**
 * HTTP 服务器显式超时（#32）：Node 缺省 server.timeout=0（空闲永不超时），未鉴权连接可
 * 长期挂起占用 socket/FD。三道收口：
 *  - headersTimeout 15s / requestTimeout 30s：请求头与整体请求的接收时限；
 *  - timeout 60s：socket 空闲上限——房间内存活连接每秒有 ping 广播（ForestRoom 全相位
 *    心跳），不会误伤；仅 MatchMake 完成后弃置的裸 HTTP 连接受它约束。
 * 数值口径与 matchmakeGuard（M5 16KB 上限）同属未鉴权入口的对称防护。
 */
import type http from "node:http";

export const SERVER_TIMEOUTS = {
  headersTimeout: 15_000,
  requestTimeout: 30_000,
  timeout: 60_000,
} as const;

export function applyServerTimeouts(server: http.Server): void {
  server.headersTimeout = SERVER_TIMEOUTS.headersTimeout;
  server.requestTimeout = SERVER_TIMEOUTS.requestTimeout;
  server.timeout = SERVER_TIMEOUTS.timeout;
}
