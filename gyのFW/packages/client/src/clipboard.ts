/**
 * 剪贴板复制（9fc2bb3 引入的邀请链接复制逻辑抽出的可测纯函数模块，M4 验收自动化前置）。
 *
 * 原实现内联在 main.ts #btn-invite 点击回调里，无法单测；抽为 copyText 后：
 * - 安全上下文：navigator.clipboard.writeText（await 同时捕获同步 throw 与 reject）；
 * - 非安全上下文（局域网 http，M4 主场景）：textarea + document.execCommand("copy")
 *   回退，回退自身 try/catch 且 finally 必清理挂载节点，绝不向外抛；
 * - 双失败返 false；空文本直接 false（守卫：无内容可复制没有成功语义）。
 */

/** textarea + execCommand 回退（M4 原实现原样搬移成函数，行为逐行不变） */
function fallbackCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  try {
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

/**
 * 复制文本到剪贴板。
 * @returns true=任一路径成功；false=空文本或双路径均失败。绝不 reject、绝不向外抛。
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  const clip = navigator.clipboard;
  if (clip?.writeText) {
    try {
      await clip.writeText(text); // 同步 throw 与 reject 都由 await 捕获
      return true;
    } catch {
      // 落到 execCommand 回退（权限被拒/上下文不支持等）
    }
  }
  return fallbackCopy(text);
}
