/**
 * 键盘输入：方向键 / WASD → InputState 快照。
 *
 * 发送策略（PLAN §5.2）：
 * - 按键状态变化即发（按钮事件频率天然很低）；
 * - 另有 66ms（≈15Hz）定时强制重发最后状态，防单次消息丢失后角色卡键；
 * - 每条消息带单调递增 seq（服务器按全量快照语义消费，seq 仅用于排查乱序/重放）。
 * 联机每机单角色：两组键（方向键/WASD）通吃本机角色（E16，冻结偏离，见 wiring §13）。
 */
import { sameInput, type InputState } from "@fw/shared";

const LEFT = ["ArrowLeft", "KeyA", "TouchLeft"];
const RIGHT = ["ArrowRight", "KeyD", "TouchRight"];
const UP = ["ArrowUp", "KeyW", "TouchUp"];
const ALL = [...LEFT, ...RIGHT, ...UP];

/** 上行消息 = 输入快照 + 序列号（服务器只读 up/left/right） */
export type InputMessage = InputState & { seq: number };

/** 强制重发周期（≈15Hz，PLAN §5.2） */
const RESEND_MS = 66;

export class KeyboardInput {
  private last: InputState = { up: false, left: false, right: false };
  private paused = false;
  private seq = 0;
  private resendTimer: number;

  constructor(target: Window, private onInput: (input: InputMessage) => void) {
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
    // ≥15Hz 重发最后状态（emit 内部被 paused 挡住时静默跳过）
    this.resendTimer = window.setInterval(() => this.emit(true), RESEND_MS);
  }

  private pressed = new Set<string>();

  /** 本机左右移动键是否按住（水声 waterSteps 的原版触发条件之一） */
  isMoveDown(): boolean {
    return [...this.pressed].some((c) => LEFT.includes(c) || RIGHT.includes(c));
  }

  /** 暂停期间丢弃上报（菜单/结算时防止误触发） */
  setPaused(paused: boolean): void {
    // 先在未暂停态把「全松」快照发出去再置位——置位后 emit 被闸拦下，
    // 末次按住态会留在服务端持续驱动角色（如按着→进门后暂停，角色一直怼墙）
    if (paused && !this.paused) {
      this.pressed.clear();
      this.emit();
    }
    this.paused = paused;
  }

  /**
   * 触屏虚拟按键注入（M2）：与键盘同源合并进同一 pressed 集，
   * 变化即发/重发/seq/暂停清键语义全部继承（见 touch.ts 头注释）。
   */
  setVirtual(code: "TouchLeft" | "TouchRight" | "TouchUp", pressed: boolean): void {
    if (pressed) this.pressed.add(code);
    else this.pressed.delete(code);
    this.emit();
  }

  destroy(): void {
    window.clearInterval(this.resendTimer);
  }

  private emit(force = false): void {
    if (this.paused) return;
    const next: InputState = {
      up: UP.some((c) => this.pressed.has(c)),
      left: LEFT.some((c) => this.pressed.has(c)),
      right: RIGHT.some((c) => this.pressed.has(c)),
    };
    if (!force && sameInput(next, this.last)) return;
    this.last = next;
    this.onInput({ ...next, seq: ++this.seq });
  }
}
