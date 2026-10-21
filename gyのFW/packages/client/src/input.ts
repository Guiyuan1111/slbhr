/**
 * 键盘输入：按角色分键（F1 翻转，原版语义）——火人=方向键 ↑←→，水女孩=W/A/D。
 * 触屏虚拟键（TouchLeft/Right/Up）两角色同构，均控制本机角色（原版触屏控制器按角色
 * 实例化，dual 模式 wg 垫左下、fb 垫右下，互不可跨）。
 * 原版证据：bundle init.js @1856520 `"wg"===id → addKey(W)/addKey(A)/addKey(D)`、
 * @1856587 else(fb) → addKey(UP)/addKey(LEFT)/addKey(RIGHT)。
 *
 * 发送策略（PLAN §5.2）：
 * - 按键状态变化即发（按钮事件频率天然很低）；
 * - 另有 66ms（≈15Hz）定时强制重发最后状态，防单次消息丢失后角色卡键；
 * - 每条消息带单调递增 seq（服务器按全量快照语义消费，seq 仅用于排查乱序/重放）。
 */
import { sameInput, type InputState, type Role } from "@fw/shared";

/** 角色键位表（原版 bundle @1856520-1856662；无下键——跳跃制游戏） */
const KEYSETS: Record<Role, { left: string[]; right: string[]; up: string[] }> = {
  fireboy: { left: ["ArrowLeft"], right: ["ArrowRight"], up: ["ArrowUp"] },
  watergirl: { left: ["KeyA"], right: ["KeyD"], up: ["KeyW"] },
};
/** 触屏虚拟键（touch.ts 注入），与角色键位并列合并 */
const TOUCH = { left: ["TouchLeft"], right: ["TouchRight"], up: ["TouchUp"] };
/**
 * 角色键位 × 触屏键预组合（r3 客户端帧预算）：keyset() 此前每次调用现场
 * spread 合并三个新数组（isMoveDown 每帧 1 次 + emit 按键事件/15Hz 重发），
 * 现改为模块级只读共享结构，零分配。调用方（emit/isMoveDown）只读不改。
 */
const MERGED_KEYSETS: Record<Role, { left: string[]; right: string[]; up: string[] }> = {
  fireboy: { left: [...KEYSETS.fireboy.left, ...TOUCH.left], right: [...KEYSETS.fireboy.right, ...TOUCH.right], up: [...KEYSETS.fireboy.up, ...TOUCH.up] },
  watergirl: { left: [...KEYSETS.watergirl.left, ...TOUCH.left], right: [...KEYSETS.watergirl.right, ...TOUCH.right], up: [...KEYSETS.watergirl.up, ...TOUCH.up] },
};
/** 角色未就位（onRole 前）：键盘方向过滤为空集，仅触屏键可贡献 */
const MERGED_TOUCH_ONLY = { left: TOUCH.left, right: TOUCH.right, up: TOUCH.up };
const ALL_CODES = [
  ...new Set([
    ...KEYSETS.fireboy.left, ...KEYSETS.fireboy.right, ...KEYSETS.fireboy.up,
    ...KEYSETS.watergirl.left, ...KEYSETS.watergirl.right, ...KEYSETS.watergirl.up,
    ...TOUCH.left, ...TOUCH.right, ...TOUCH.up,
  ]),
];

/** 上行消息 = 输入快照 + 序列号（服务器只读 up/left/right） */
export type InputMessage = InputState & { seq: number };

/** 强制重发周期（≈15Hz，PLAN §5.2） */
const RESEND_MS = 66;

export class KeyboardInput {
  private last: InputState = { up: false, left: false, right: false };
  private paused = false;
  private seq = 0;
  private resendTimer: number;
  /** 本机角色（onRole 到达前为 null：键盘不生效，触屏在进房后才有意义） */
  private role: Role | null = null;
  /** 监听目标与具名 handler：destroy 必须精确摘除，匿名单例会在返场重进时叠加 */
  private readonly target: Window;
  private readonly onKeyDown = (e: KeyboardEvent): void => this.handleKey(e, true);
  private readonly onKeyUp = (e: KeyboardEvent): void => this.handleKey(e, false);
  private readonly onBlur = (): void => {
    // 窗口失焦清空按键，避免卡键
    if (this.pressed.size > 0) {
      this.pressed.clear();
      this.emit();
    }
  };
  private destroyed = false;

  constructor(target: Window, private onInput: (input: InputMessage) => void) {
    this.target = target;
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
    // ≥15Hz 重发最后状态（emit 内部被 paused 挡住时静默跳过）
    this.resendTimer = window.setInterval(() => this.emit(true), RESEND_MS);
  }

  private pressed = new Set<string>();

  private handleKey(e: KeyboardEvent, pressed: boolean): void {
    if (!ALL_CODES.includes(e.code)) return;
    e.preventDefault();
    if (pressed) this.pressed.add(e.code);
    else this.pressed.delete(e.code);
    this.emit();
  }

  /** onRole 到达时注入本机角色，键位表随之定向（就位后重发一次快照，收敛悬空按住态） */
  setRole(role: Role): void {
    this.role = role;
    this.emit();
  }

  /** 本机左右移动键是否按住（水声 waterSteps 的原版触发条件之一）。
   *  r3：直查 pressed 集合——旧实现每帧 [...pressed].some(闭包)+keyset() 三数组全改共享结构，零分配 */
  isMoveDown(): boolean {
    const ks = this.role ? KEYSETS[this.role] : null;
    // KEYSETS 各方向均为单键（F1 分键表），取 [0] 即全量
    if (ks && (this.pressed.has(ks.left[0]) || this.pressed.has(ks.right[0]))) return true;
    return this.pressed.has("TouchLeft") || this.pressed.has("TouchRight");
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
    if (this.destroyed) return;
    this.destroyed = true;
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
    this.target.removeEventListener("blur", this.onBlur);
    window.clearInterval(this.resendTimer);
  }

  /** 当前生效的键位组：角色未就位时仅触屏键可贡献（键盘方向过滤为空集）。
   *  r3：返回模块级预组合只读结构（调用方 emit/isMoveDown 只读） */
  private keyset(): { left: string[]; right: string[]; up: string[] } {
    return this.role ? MERGED_KEYSETS[this.role] : MERGED_TOUCH_ONLY;
  }

  private emit(force = false): void {
    if (this.paused) return;
    const ks = this.keyset();
    const next: InputState = {
      up: ks.up.some((c) => this.pressed.has(c)),
      left: ks.left.some((c) => this.pressed.has(c)),
      right: ks.right.some((c) => this.pressed.has(c)),
    };
    if (!force && sameInput(next, this.last)) return;
    this.last = next;
    this.onInput({ ...next, seq: ++this.seq });
  }
}
