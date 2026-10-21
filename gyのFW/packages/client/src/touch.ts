/**
 * 触屏虚拟按键（PLAN §5.4 / M2）：左下（左右）右下（跳）三键，多点同按。
 *
 * 接线方式：不走独立 InputSource 抽象，而是把三个合成输入码
 * （TouchLeft/TouchRight/TouchUp）注入 KeyboardInput 的同一 pressed 集合——
 * 与键盘同源合并，变化即发 + 15Hz 重发 + seq + 暂停清键的全部既有语义零改动继承
 * （PLAN §5.4「来源切换不影响内核」的等价实现，wiring 层面而非协议层面）。
 *
 * 事件模型：Pointer Events + setPointerCapture（iOS Safari 13+ / Android Chrome 均支持），
 * 指针捕获保证手指滑出按钮后抬起事件仍回到按钮；按钮 CSS touch-action:none +
 * touchstart preventDefault 阻止滚动/双击缩放/长按菜单；user-scalable=no 已在 viewport 锁定。
 *
 * 可见性：粗指针设备（手机/平板）或 URL ?touch=1（桌面调试/自动化）时创建；
 * 游戏内 phase=started 才显示（main.ts updateHud 驱动，与键盘暂停闸门同源）。
 * 画布视觉复刻不受影响：按钮是 DOM 覆盖层（#touch-controls z-index 介于 hud 与 menu 之间），
 * 不进 canvas。
 */

/** 与键盘输入码并列的触屏合成码（input.ts 的 LEFT/RIGHT/UP 数组同步收录） */
export type TouchCode = "TouchLeft" | "TouchRight" | "TouchUp";

export class TouchControls {
  private root: HTMLDivElement;
  /** 当前是否有任一按钮处于按下态（样式高亮同步用） */
  private applicable: boolean;
  /** 仍在按下的合成码：只对原本按下的发送松开，避免 up/lostpointercapture 重复回调 */
  private readonly pressed = new Set<TouchCode>();
  private readonly onPress: (code: TouchCode, pressed: boolean) => void;

  constructor(onPress: (code: TouchCode, pressed: boolean) => void) {
    this.onPress = onPress;
    this.root = document.createElement("div");
    this.root.id = "touch-controls";
    this.root.classList.add("hidden");
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const forced = new URLSearchParams(location.search).get("touch") === "1";
    this.applicable = coarse || forced;
    if (this.applicable) {
      this.root.append(
        this.makeButton("TouchLeft", "◀", "left"),
        this.makeButton("TouchRight", "▶", "right"),
        this.makeButton("TouchUp", "▲", "jump"),
      );
    }
    document.body.append(this.root);
  }

  private makeButton(code: TouchCode, label: string, cls: string): HTMLButtonElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `touch-btn ${cls}`;
    el.textContent = label;
    el.setAttribute("aria-label", code === "TouchUp" ? "跳跃" : code === "TouchLeft" ? "左移" : "右移");
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* 已释放的指针，忽略 */ }
      this.pressed.add(code);
      el.classList.add("on");
      this.onPress(code, true);
    });
    const release = (e: Event) => {
      e.preventDefault();
      this.release(code, el);
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    // 指针捕获被系统收回时 pointerup 可能缺席：同一 release 兜底
    el.addEventListener("lostpointercapture", release);
    // 触摸滚动手势/双击缩放/长按系统菜单全部拦下（pointerdown 的 preventDefault
    // 不拦截滚动，必须配合 touch-action:none + touchstart 层面的拦截）
    el.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    return el;
  }

  /** 单键释放：只有原本按下才上报，避免 pointerup 与 lostpointercapture 重复发松开 */
  private release(code: TouchCode, el: HTMLElement): void {
    el.classList.remove("on");
    if (this.pressed.delete(code)) this.onPress(code, false);
  }

  /** 全部松开（隐藏/销毁前）：逐键上报并清残留高亮 */
  releaseAll(): void {
    for (const code of this.pressed) this.onPress(code, false);
    this.pressed.clear();
    this.root.querySelectorAll(".touch-btn.on").forEach((el) => el.classList.remove("on"));
  }

  /** 游戏进行中显示（ready/started），菜单/暂停/返回选关时隐藏 */
  setActive(active: boolean): void {
    if (!this.applicable) return;
    this.root.classList.toggle("hidden", !active);
    // 隐藏时释放仍按住的虚拟键，避免服务端持续收到按住态
    if (!active) this.releaseAll();
  }

  /** 释放并摘除 DOM（可重复调用）：dispose 后本对象不再使用 */
  dispose(): void {
    this.releaseAll();
    this.root.remove();
  }
}
