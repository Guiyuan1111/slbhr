/** 服务器显式超时回归（#32）：三道超时必须显式设置且不保留 Node 缺省 timeout=0。 */
import http from "node:http";
import { describe, expect, it } from "vitest";
import { SERVER_TIMEOUTS, applyServerTimeouts } from "../serverTimeouts.js";

describe("applyServerTimeouts（#32）", () => {
  it("三道超时为正数且 timeout 不为 0（缺省永不空闲超时）", () => {
    const { headersTimeout, requestTimeout, timeout } = SERVER_TIMEOUTS;
    expect(headersTimeout).toBeGreaterThan(0);
    expect(requestTimeout).toBeGreaterThan(0);
    expect(timeout).toBeGreaterThan(0);
  });

  it("apply 后服务器三项字段被置位", () => {
    const server = new http.Server();
    expect(server.timeout).toBe(0); // Node 缺省：永不空闲超时（漏洞面）
    applyServerTimeouts(server);
    expect(server.headersTimeout).toBe(SERVER_TIMEOUTS.headersTimeout);
    expect(server.requestTimeout).toBe(SERVER_TIMEOUTS.requestTimeout);
    expect(server.timeout).toBe(SERVER_TIMEOUTS.timeout);
    server.close();
  });
});
