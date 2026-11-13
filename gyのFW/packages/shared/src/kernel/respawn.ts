/**
 * box2d 内核 —— RespawnManager 检查点/复活内核（F 部 fairytales 专属）。
 *
 * oracle 对位（逐行，Fireboy-and-Watergirl/output/F/fairy-tales.min.js
 * L61065–61179 `define("States/Level/RespawnManager")`；取证
 * note/evidence/2026-10-30-fairytales/01号档-取证.md §2.3，2026-10-30）：
 *
 *  - 自动抓取（oracle update @L61081–61101）——以下条件全真时抓一份：
 *      1. 队列空 或 距上次抓取 elapsed > 666ms（本实现 nowMs − last.timeMs > 666）；
 *      2. 双角色均非 dying；
 *      3. 双角色 feetSensor.contacts 非空；
 *      4. 双角色线速度向量长度严格 === 0（内核实测：站定后 box2d 求解器将速度
 *         收敛到恰 0——TEMP/rrm 探针 2026-10-31，fairies_000 静置 900 帧逐帧
 *         GetLength()===0，无需近似口径）；
 *      5. 双角色光标无按键（oracle cursors.checkActive @L58398–58400 =
 *         up.isDown || left.isDown || right.isDown；本实现经 inputs 入参，
 *         缺省视为无按键——headless/基准服务无输入层的调用口径）；
 *      6. 双角色至少一条脚底接触的世界系流形法线 y > 0.9（oracle
 *         `contacts.some(a => a.m_normal && a.m_normal.y > .9)`；m_normal 由
 *         character.update 每帧预填——与 character.ts 同式 m_fixtureA 局部法线
 *         →世界系，未填的接触按 oracle 同款守卫跳过）。
 *    抓取后入队；队列 >5 shift（环形上限 5，FIFO 丢最老）。
 *  - 快照（oracle grabCheckpoint @L61125–61139）：characters / fairies / objects
 *    三组各取 body 的 transform + 线速度 + 角速度三件套；不快照 joint 与机关内部
 *    计时。仙女只快照主 body（anchor/elbow 由 DistanceJoint 拉回，oracle 同口径）；
 *    本实现 objects 组收窄为 props（箱/球，World.mechanisms.props 公开可达）——
 *    关节驱动机关（平台/摆/滑轮等）回放 transform 会与 joint 对抗，oracle 亦未
 *    处理该冲突，收窄口径在 01号档 §2.3"不快照 joint"语义内。
 *  - 恢复（oracle loadLatestCheckpoint @L61141–61158）：从新到旧找第一份
 *    elapsed > 4 秒的快照（否则取第一份=最老），按 pers1 → pers2 → objects →
 *    fairies 序 SetTransform + SetLinearVelocity + SetAngularVelocity；随后该份
 *    time 刷新为当前时刻、队列重置为该份单元素；返回抓取时的 gameTime
 *    （= 本实现 timerMs）供 ui.clock.resumeAt 计时回拨。
 *  - 复活（oracle Level.revive @L62017–62031）：销毁重建 pers1/pers2 →
 *    loadLatestCheckpoint → ended=false → paused=false → clock.resumeAt(gameTime)。
 *    R2 裁定（01号档 §6）：oracle 走 h5ads 激励广告，我方复刻 = 免费一次
 *    （门禁归宿主层；内核只提供 loadLatest 返回 timerMs 供回拨 world.timerMs）。
 *  - oracle bug 不复刻：R 键 keydown 处理器调用未定义的 setCheckpoint（@L61081，
 *    按 R 即 TypeError 被 jQuery 吞）——01号档明示勿复刻。
 *
 * 快照数值口径：oracle 存 b2Transform.Clone()；(p,q) 变换与 (position, angle)
 * 双射且逐位等值（vendor SetTransformXYRadians：m_xf.q.SetAngleRadians +
 * m_xf.p.SetXY），本实现存六元标量 {x,y,angle,vx,vy,av}——plain data，服务器
 * 可直接 JSON 序列化。恢复调用族与 oracle 相同（含 vendor 内建语义：非零线/角
 * 速度自动唤醒、SetTransform 即时改 m_xf 且相等值跳过）。
 *
 * 时基：nowMs 由宿主传入（建议 = simTimeS*1000 仿真钟，oracle 用墙钟
 * game.time——内核确定性对拍口径换仿真钟，同 Fairy.update 先例）。
 *
 * 本文件不改 world.ts / mechanisms.ts（主会话 portal 批所有）；World 挂接点见
 * 文件尾「World 集成建议」。
 */
import type { Role } from "../types.js";
import type { B2 } from "./b2.js";
import { b2 } from "./b2.js";
import type { InputState } from "./character.js";
import type { World } from "./world.js";

/** 单 body 快照（b2Transform≡(position,angle) 双射的六元标量展开，物理单位：m/rad/m·s⁻¹/rad·s⁻¹） */
export interface CheckpointBody {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  /** 角速度（角色/仙女 fixedRotation 恒 0；箱/球为实值） */
  av: number;
}

/** 一份检查点（oracle grabCheckpoint 返回结构的标量化） */
export interface RespawnCheckpoint {
  /** 抓取时刻（宿主时钟 ms；oracle time = game.time.time，参与 667/4s 两级年龄判定） */
  timeMs: number;
  /** 抓取时关卡计时值（oracle gameTime = game.time.now；loadLatest 返回它供计时回拨） */
  timerMs: number;
  /** [fireboy, watergirl]（oracle characters[0]=pers1 / [1]=pers2） */
  characters: [CheckpointBody, CheckpointBody];
  /** 与 world.fairies 同序同长（只快照主 body） */
  fairies: CheckpointBody[];
  /** 与 world.mechanisms.props 同序同长（箱/球） */
  props: CheckpointBody[];
}

/** oracle 环形队列上限（L61092–61094：length > 5 → shift） */
const MAX_CHECKPOINTS = 5;
/** oracle 抓取间隔门（L61083：elapsedSince(last.time) > 666） */
const GRAB_INTERVAL_MS = 666;
/** oracle 回放年龄门（L61143：elapsedSince(c.time) > 4e3） */
const REWIND_AGE_MS = 4000;

function snapshotBody(body: any): CheckpointBody {
  const p = body.GetPosition();
  const v = body.GetLinearVelocity();
  return { x: p.x, y: p.y, angle: body.GetAngle(), vx: v.x, vy: v.y, av: body.GetAngularVelocity() };
}

/**
 * RespawnManager（oracle 同名类；构造参数 world 门面，全部经
 * world.players / world.fairies / world.mechanisms 公开访问器读写）。
 */
export class RespawnManager {
  /** 环形队列（oracle checkpoints；最老在 [0]） */
  readonly checkpoints: RespawnCheckpoint[] = [];

  constructor(private readonly world: World) {}

  /**
   * oracle update（@L61081–61101）：站定条件全真时抓一份。返回本帧是否抓取。
   * 宿主在 step 尾调用；inputs 传当帧输入（缺省=无按键口径，见文件头 §5）。
   */
  maybeCheckpoint(nowMs: number, inputs?: Record<Role, InputState>): boolean {
    const q = this.checkpoints;
    if (q.length > 0 && nowMs - q[q.length - 1].timeMs <= GRAB_INTERVAL_MS) return false;
    for (const role of ["fireboy", "watergirl"] as const) {
      if (!this.settled(role, inputs?.[role])) return false;
    }
    q.push(this.grabCheckpoint(nowMs));
    if (q.length > MAX_CHECKPOINTS) q.shift();
    return true;
  }

  /**
   * oracle grabCheckpoint（@L61125–61139；public 同 oracle prototype 方法，供宿主
   * /测试直调）。快照序 = 注册序：characters[f,w] → fairies → props。
   */
  grabCheckpoint(nowMs: number): RespawnCheckpoint {
    const w = this.world;
    return {
      timeMs: nowMs,
      timerMs: w.timerMs,
      characters: [snapshotBody(w.players.fireboy.body), snapshotBody(w.players.watergirl.body)],
      fairies: w.fairies.map((f) => snapshotBody(f.body)),
      props: w.mechanisms.props.map((p) => snapshotBody(p.body)),
    };
  }

  /**
   * oracle loadLatestCheckpoint（@L61141–61158）：恢复"4 秒前最近一份"（否则最老
   * 一份），队列重置为该份，返回其 timerMs（宿主回拨 world.timerMs，即 oracle
   * clock.resumeAt 的入参；oracle gameTime 抓取时定格、恢复时不刷新——同款）。
   * 空队列返回 null（oracle 此路 TypeError 崩溃，不复刻）。
   */
  loadLatest(nowMs: number): number | null {
    const q = this.checkpoints;
    if (q.length === 0) return null;
    let pick: RespawnCheckpoint | undefined;
    for (let i = q.length - 1; i >= 0; i--) {
      if (nowMs - q[i].timeMs > REWIND_AGE_MS) {
        pick = q[i];
        break;
      }
    }
    if (!pick) pick = q[0];
    this.applyCheckpoint(pick);
    pick.timeMs = nowMs;
    q.length = 0;
    q.push(pick);
    return pick.timerMs;
  }

  /**
   * oracle setCheckpointData 全量回放（@L61115–61123），恢复序同 oracle
   * loadLatestCheckpoint：pers1 → pers2 → objects(=props) → fairies。
   */
  private applyCheckpoint(cp: RespawnCheckpoint): void {
    const B: B2 = b2();
    const w = this.world;
    this.restore(w.players.fireboy.body, cp.characters[0], B);
    this.restore(w.players.watergirl.body, cp.characters[1], B);
    const props = w.mechanisms.props;
    for (let i = 0; i < props.length && i < cp.props.length; i++) this.restore(props[i].body, cp.props[i], B);
    const fairies = w.fairies;
    for (let i = 0; i < fairies.length && i < cp.fairies.length; i++) this.restore(fairies[i].body, cp.fairies[i], B);
  }

  /** oracle 三连（SetTransform→SetLinearVelocity→SetAngularVelocity，不多不少） */
  private restore(body: any, s: CheckpointBody, B: B2): void {
    body.SetTransformVecRadians(new B.b2Vec2(s.x, s.y), s.angle);
    body.SetLinearVelocity(new B.b2Vec2(s.vx, s.vy));
    body.SetAngularVelocity(s.av);
  }

  /**
   * 整关重开时清空（world.reset() 重建全部 body，旧快照引用必然失效）。
   * 宿主在 reset 尾调用（或整体重建 RespawnManager，二选一）。
   */
  clear(): void {
    this.checkpoints.length = 0;
  }

  /**
   * oracle 站定判定单侧（update 条件 2–6 的 per-role 展开）：
   * 非 dying + feetContacts 非空 + 线速度严格 0 + 光标无按键 + 存在法线 y>0.9 的
   * 脚底接触。法线换算与 character.update 同式（m_fixtureA 局部法线→世界系；
   * m_normal 由每帧 character.update 预填——step 尾调用时已就绪，本步新建的接触
   * 尚未填、按 oracle `a.m_normal &&` 守卫跳过）。
   */
  private settled(role: Role, input?: InputState): boolean {
    const c = this.world.players[role];
    if (c.dying) return false;
    if (c.feetContacts.length === 0) return false;
    if (c.body.GetLinearVelocity().Length() !== 0) return false;
    // oracle cursors.checkActive（@L58398-58400）：任一方向键 isDown 即 active
    if (input && (input.up || input.left || input.right)) return false;
    return c.feetContacts.some((ct: any) => ct.m_normal && ct.m_normal.y > 0.9);
  }
}

// ─── World 集成建议（主会话落地；本文件不改 world.ts）─────────────────────────
//
// 1. 字段/构造：World 构造尾 `this.respawn = new RespawnManager(this);`
//    （RespawnManager 只经 world.players / world.fairies / world.mechanisms 既有
//    公开访问器读写，无需新增 getter；props 已公开，主会话无需补）。
//
// 2. step() 尾（flushPendingRemove 之后、checkEnd 之后均可——phase!=="playing" 时
//    step 已早退，天然不抓）：
//      this.respawn.maybeCheckpoint(this.simTimeS * 1000, inputs);
//    —— oracle Level.update 每帧调 respawnManager.update()；仿真钟 ms 与 666ms 门
//      的粒度（≈40 帧）下帧序无关紧要。
//
// 3. revive() 建议签名与流（oracle Level.revive @L62017–62031：先销毁重建 pers1/pers2
//    再 loadLatestCheckpoint；R2 裁定免费一次）：
//      revived = false;                       // 新增字段（免费一次门禁，也可放房间层）
//      revive(): boolean {
//        if (this.revived || this.phase !== "gameover") return false;
//        // 第一步：销毁重建双角色（oracle 同构；feetContacts/状态位随之清零，接触
//        // 监听按 userData "pers" 自然重建）：
//        //   this.chars = { fireboy: new Character(this.B, this.built.world, "fireboy", this.level.spawn.fireboy), … }
//        //   + 重挂 winds registerCharBodies（现有 reset() 同款）
//        // 第二步：loadLatest 必须在重建之后调——内部读 world.players 当帧最新引用：
//        const t = this.respawn.loadLatest(this.simTimeS * 1000);
//        if (t === null) return false;          // 队列空（开局即死未抓过）→ 宿主退化 retry
//        this.phase = "playing";
//        this.timerMs = t;                      // clock.resumeAt 计时回拨（oracle gameTime）
//        this.revived = true;
//        return true;
//      }
//
// 4. reset() 尾 `this.respawn.clear()`（或整体重建实例）——旧快照引用已销毁 body。
//
// 5. 服务器快照（RoomState）若需暴露 checkpoint 态：RespawnCheckpoint 为 plain
//    data 可直序列化；timeMs/timerMs 语义见接口注释。
