/**
 * 单次重连超时护栏行为测试（#41-B）：reconnectAttempt 是 net.ts 重连循环与
 * tryResume 共用的纯助手——及时 resolve 直通；超时抛错且迟到 resolve 的房间被
 * leave(true)（防孤儿连接）；vendor 拒绝原样抛出。
 * net.ts 顶层无副作用（Client 仅按需实例化），node 环境可直接导入。
 */
import { describe, expect, it, vi } from "vitest";
import { RECONNECT_ATTEMPT_TIMEOUT_MS, reconnectAttempt } from "../net";

function fakeClient(reconnectImpl: (token: string) => Promise<any>) {
  return { reconnect: vi.fn(reconnectImpl) };
}

describe("reconnectAttempt（#41-B）", () => {
  it("及时 resolve：返回房间且不调用 leave", async () => {
    const room = { leave: vi.fn() };
    const c = fakeClient(() => new Promise((r) => setTimeout(() => r(room), 5)));
    await expect(reconnectAttempt(c as never, "tok", 500)).resolves.toBe(room);
    expect(room.leave).not.toHaveBeenCalled();
  });

  it("超时：抛「重连超时」，迟到 resolve 的房间被 leave(true)", async () => {
    const room = { leave: vi.fn() };
    let resolveLate!: (r: (typeof room)) => void;
    const c = fakeClient(
      () =>
        new Promise((r) => {
          resolveLate = r;
        }),
    );
    await expect(reconnectAttempt(c as never, "tok", 30)).rejects.toThrow("重连超时");
    resolveLate(room);
    await new Promise((r) => setTimeout(r, 10));
    expect(room.leave).toHaveBeenCalledWith(true);
  });

  it("vendor 拒绝：原样抛出且不触发多余 leave", async () => {
    const c = fakeClient(() => Promise.reject(new Error("token invalid")));
    await expect(reconnectAttempt(c as never, "tok", 500)).rejects.toThrow("token invalid");
  });

  it("默认超时 5s（循环退避档最大 4s，超时档必须压得住挂起）", () => {
    expect(RECONNECT_ATTEMPT_TIMEOUT_MS).toBe(5000);
  });
});
