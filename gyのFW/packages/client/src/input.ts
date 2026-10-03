/**
 * 键盘输入：方向键 / WASD → InputState 快照。
 * 只有按键状态变化时才发消息（按钮事件频率天然很低）。
 */
import { sameInput, type InputState } from "@fw/shared";

const LEFT = ["ArrowLeft", "KeyA"];
const RIGHT = ["ArrowRight", "KeyD"];
const UP = ["ArrowUp", "KeyW"];
const ALL = [...LEFT, ...RIGHT, ...UP];

export class KeyboardInput {
  private last: InputState = { up: false, left: false, right: false };
  private paused = false;

  constructor(target: Window, private onInput: (input: InputState) => void) {
    const handle = (e: KeyboardEvent, pressed: boolean) => {
      if (!ALL.includes(e.code)) return;
      e.preventDefault();
      if (pressed) this.pressed.add(e.code);
      else this.pressed.delete(e.code);
      this.emit();
    };
    target.addEventListener("keydown", (e) => handle(e, true));
    target.addEventListener("keyup", (e) => handle(e, false));
    // 窗口失焦清空按键，避免卡键
    target.addEventListener("blur", () => {
      if (this.pressed.size > 0) {
        this.pressed.clear();
        this.emit();
      }
    });
  }

  private pressed = new Set<string>();

  /** 暂停期间丢弃上报（菜单/结算时防止误触发） */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.pressed.clear();
      this.emit();
    }
  }

  private emit(): void {
    if (this.paused) return;
    const next: InputState = {
      up: UP.some((c) => this.pressed.has(c)),
      left: LEFT.some((c) => this.pressed.has(c)),
      right: RIGHT.some((c) => this.pressed.has(c)),
    };
    if (!sameInput(next, this.last)) {
      this.last = next;
      this.onInput(next);
    }
  }
}
