/**
 * 平台电机声的逐台实例管理（14 号档 T10）。
 *
 * oracle MovingPlatform/RotMirror：每次 updateState 翻转 stopInstance 旧实例 + playInstance
 * 新实例，到关节限位 stopInstance（bundle @1762997/@1764259）。快照协议无事件通道，客户端
 * 按位姿差分自检：起步=play，停住（限位）=stop，反向=stop+play。
 *
 * 纯逻辑模块：播放/停止由 host 注入，便于单测；不持有 Phaser 类型。
 */

export interface PlatformPose {
  x: number;
  y: number;
  angle: number;
}

export interface PlatformSoundHost<S> {
  /** 新建并起播一个独立实例；音频缺失/音效关闭时返回 null。 */
  play(id: string): S | null;
  /** 停止并释放一个实例。 */
  stop(id: string, sound: S): void;
}

interface Track {
  x: number;
  y: number;
  angle: number;
  dx: number;
  dy: number;
  da: number;
  moving: boolean;
  sound: unknown;
}

/** 与旧 stepPlatSnd 同口径：位移 >0.5px 视为运动；角度阈值覆盖快照量化 0.001rad。 */
const MOVE_PX = 0.5;
const MOVE_RAD = 0.005;

export class PlatformSoundTracker<S> {
  private readonly tracks = new Map<string, Track>();

  constructor(private readonly host: PlatformSoundHost<S>) {}

  update(id: string, pose: PlatformPose): void {
    const t = this.tracks.get(id);
    if (!t) {
      this.tracks.set(id, { x: pose.x, y: pose.y, angle: pose.angle, dx: 0, dy: 0, da: 0, moving: false, sound: null });
      return;
    }
    const dx = pose.x - t.x;
    const dy = pose.y - t.y;
    const da = pose.angle - t.angle;
    const translated = Math.abs(dx) + Math.abs(dy) > MOVE_PX;
    const rotated = Math.abs(da) > MOVE_RAD;
    if (!translated && !rotated) {
      if (t.sound !== null) {
        this.host.stop(id, t.sound as S);
        t.sound = null;
      }
      t.moving = false;
      t.dx = t.dy = t.da = 0;
    } else {
      const reversed = t.moving && ((translated && t.dx * dx + t.dy * dy < 0) || (rotated && t.da * da < 0));
      if (!t.moving || reversed) {
        if (t.sound !== null) this.host.stop(id, t.sound as S);
        t.sound = this.host.play(id);
      }
      t.moving = true;
      t.dx = dx;
      t.dy = dy;
      t.da = da;
    }
    t.x = pose.x;
    t.y = pose.y;
    t.angle = pose.angle;
  }

  clear(): void {
    for (const [id, t] of this.tracks) {
      if (t.sound !== null) this.host.stop(id, t.sound as S);
    }
    this.tracks.clear();
  }
}
