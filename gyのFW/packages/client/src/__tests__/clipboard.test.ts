/**
 * copyText（M4 剪贴板回退）单测——node 环境最小 stub 注入 navigator/document，不依赖 jsdom。
 * 覆盖点（对齐 note/evidence/2026-10-23-recheck/06-m4m3-acceptance.md 任务 A）：
 *  1 clipboard API 可用 → 成功且不触碰 execCommand 回退面
 *  2 clipboard undefined（局域网 http 主场景）→ textarea+execCommand 回退成功，
 *    textarea 参数（value/readonly/select/setSelectionRange）与 finally 清理（remove）逐项断言
 *  3 execCommand 返回 false → 判失败（false，不抛）
 *  4 writeText reject（权限被拒）→ 自动落回退并成功
 *  5 双路径皆抛（writeText reject + execCommand throw）→ 异常被捕获返 false，绝不向外抛
 *  6 writeText 同步 throw（非 Promise reject）→ 同样被 await 捕获落回退
 *  7 空文本守卫 → 直接 false，不触碰任何剪贴板面
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "../clipboard";

/** 最小 textarea 替身：copyText 只触 value/setAttribute/style/select/setSelectionRange/remove */
interface MockTA {
  value: string;
  style: Record<string, string>;
  attrs: Record<string, string>;
  select: ReturnType<typeof vi.fn>;
  setSelectionRange: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  setAttribute: (k: string, v: string) => void;
}

/** 最小 document 替身：createElement 每次发新替身并登记，execCommand/appendChild 可断言 */
function makeDoc(execCommandImpl?: (...a: unknown[]) => boolean) {
  const created: MockTA[] = [];
  const doc = {
    createElement: vi.fn((_tag: string) => {
      const ta: MockTA = {
        value: "",
        style: {},
        attrs: {},
        select: vi.fn(),
        setSelectionRange: vi.fn(),
        remove: vi.fn(),
        setAttribute(k: string, v: string) {
          this.attrs[k] = v;
        },
      };
      created.push(ta);
      return ta;
    }),
    body: { appendChild: vi.fn() },
    execCommand: vi.fn(execCommandImpl ?? (() => true)),
  };
  return { doc, created };
}

function stubGlobals(doc: unknown, navigator: unknown): void {
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", navigator);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("copyText（M4 剪贴板回退）", () => {
  it("1 clipboard API 可用 → writeText 成功返回 true，不触碰 execCommand 回退面", async () => {
    const writeText = vi.fn(async () => undefined);
    const { doc } = makeDoc();
    stubGlobals(doc, { clipboard: { writeText } });
    await expect(copyText("http://x/?room=AB12")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("http://x/?room=AB12");
    expect(doc.createElement).not.toHaveBeenCalled();
    expect(doc.execCommand).not.toHaveBeenCalled();
  });

  it("2 clipboard undefined（局域网 http）→ textarea+execCommand 回退成功，参数与清理逐项到位", async () => {
    const { doc, created } = makeDoc(() => true);
    stubGlobals(doc, {}); // navigator.clipboard 缺失
    const link = "http://127.0.0.1:3661/?level=forest_01&room=ABCD";
    await expect(copyText(link)).resolves.toBe(true);
    expect(created).toHaveLength(1);
    const ta = created[0];
    expect(ta.value).toBe(link);
    expect(ta.attrs.readonly).toBe("");
    expect(ta.style.position).toBe("fixed");
    expect(ta.style.opacity).toBe("0");
    expect(doc.body.appendChild).toHaveBeenCalledWith(ta);
    expect(ta.select).toHaveBeenCalledTimes(1);
    expect(ta.setSelectionRange).toHaveBeenCalledWith(0, link.length);
    expect(doc.execCommand).toHaveBeenCalledWith("copy");
    expect(ta.remove).toHaveBeenCalledTimes(1); // finally 清理，即使成功也摘除挂载节点
  });

  it("3 execCommand 返回 false → 判失败（false，不抛），textarea 照常清理", async () => {
    const { doc, created } = makeDoc(() => false);
    stubGlobals(doc, {});
    await expect(copyText("x")).resolves.toBe(false);
    expect(created[0].remove).toHaveBeenCalledTimes(1);
  });

  it("4 writeText reject（权限被拒）→ 自动落回退并成功", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    const { doc } = makeDoc(() => true);
    stubGlobals(doc, { clipboard: { writeText } });
    await expect(copyText("fallback")).resolves.toBe(true);
    expect(doc.execCommand).toHaveBeenCalledWith("copy");
  });

  it("5 双路径皆抛（writeText reject + execCommand throw）→ 异常被捕获返 false，绝不向外抛", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    const { doc, created } = makeDoc(() => {
      throw new Error("execCommand is not supported");
    });
    stubGlobals(doc, { clipboard: { writeText } });
    await expect(copyText("x")).resolves.toBe(false);
    expect(created[0].remove).toHaveBeenCalledTimes(1);
  });

  it("6 writeText 同步 throw（非 Promise reject）→ 同样被 await 捕获落回退", async () => {
    const writeText = vi.fn(() => {
      throw new Error("sync throw");
    });
    const { doc } = makeDoc(() => true);
    stubGlobals(doc, { clipboard: { writeText } });
    await expect(copyText("x")).resolves.toBe(true);
    expect(doc.execCommand).toHaveBeenCalledWith("copy");
  });

  it("7 空文本守卫 → 直接 false，不触碰任何剪贴板面", async () => {
    const writeText = vi.fn(async () => undefined);
    const { doc } = makeDoc(() => true);
    stubGlobals(doc, { clipboard: { writeText } });
    await expect(copyText("")).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
    expect(doc.createElement).not.toHaveBeenCalled();
    expect(doc.execCommand).not.toHaveBeenCalled();
  });
});
