/**
 * 相机装置（M12 从 GameScene 抽出的纯状态机，0.3.43 起接线——GameScene 持 camRig 实例，
 * 引擎写（setZoom/centerOn/HUD 反缩放）与输入监听注册留在 GameScene 侧；
 * 拆分映射表见 note/evidence/2026-10-23-recheck/04-m12-camera-prep.md）。
 *
 * 原版 CameraManager bundle @1881500 移植（0.3.x F4 翻转），GameConfig.zooming（bundle @1260）：
 * lockAtMinScale=true, minScaleRatio=0.9, lockScaleRatio=0.97, maxScale=1.5；
 * 滚轮 ×0.8/×1.2 钳 [minScale,maxScale]，1s 静置 debounce 回弹；
 * 焦点=双角色中点；弹簧 a=1/15（用户平移中 1/3）、阻尼 0.5；
 * 边界=原版 checkBounds(@1845100) 关卡矩形语义（W·h<视口 → 钉关卡中心，否则按半视口钳进）。
 *
 * **2026-10-24 起静态化**：用户裁定固定全图，GameScene 仅调 setupStatic/applyForced/
 * applyIfDirty/resetTransient；动态语义方法（setupForLevel/updateCamTarget/animateCam/
 * onCamWheel/onCamPointerMove/onCamPointerUp/resetForLevel）保留并由单测覆盖，随时可恢复接线。
 *
 * 纯度约束：不 import Phaser（连类型都不引），引擎依赖全部经参数/回调注入——
 * - cameras.main.zoom → onCamWheel / onCamPointerMove 的 zoom 参数；
 * - input.pointer1/2 → env.pointer1/2（结构类型 RigPointer，Phaser.Input.Pointer 天然满足）；
 * - window.setTimeout/clearTimeout → RigTimers（缺省 window 实现；node 单测注入假时钟）；
 * - setZoom/centerOn/HUD 反缩放等引擎写不入本类：步进/复位方法返回 CamApply 三元组，
 *   由调用方（GameScene.applyCam 残壳）落引擎。
 */

/** 关卡四周留白 32px（原版 groundTexture 1312×992 @(-32,-32) 实测；接线后单一来源在本模块，
 *  GameScene 导入使用——原 :43 本地常量已删） */
export const PAD = 32;
/** 相机最小可视格子（GameScene.ts:61-62 同值；mpx=32 即 tile 尺寸） */
const TILES_DESKTOP = { w: 40, h: 30 };
const TILES_SMALL = { w: 20, h: 15 };

/** 关卡像素尺寸（LevelData 的 widthPx/heightPx 子集，避免引 @fw/shared 类型） */
export interface LevelSize {
  widthPx: number;
  heightPx: number;
}

/** 一次"应落引擎"的相机三值（GameScene.applyCam :1287-1289 写 setZoom/centerOn 用）。
 *  animateCam/applyForced 返回**复用的内部对象**，调用方当帧消费、不得保留引用（r3 零分配口径）。 */
export interface CamApply {
  x: number;
  y: number;
  scale: number;
}

/** 指针结构视图：Phaser.Input.Pointer 满足（isDown/x/y/getDistance 均为公开成员）。
 *  getDistance 语义=本次按下以来累计位移（原版 hammer pan threshold 用，:1205）。 */
export interface RigPointer {
  isDown: boolean;
  x: number;
  y: number;
  getDistance(): number;
}

/** 事件处理时的引擎只读环境（GameScene 接线处逐帧取自 this.cameras.main / this.input） */
export interface RigPointerEnv {
  /** cameras.main.zoom（滚轮/捏合/拖拽均以当前动画值乘算，:1179/:1195/:1208） */
  zoom: number;
  pointer1: RigPointer;
  pointer2: RigPointer;
}

/** 计时器抽象（GameScene.ts:224 camWheelReset 存 window 句柄，缺省实现同 window.*） */
export interface RigTimers {
  /** 等价 window.setTimeout(fn, delayMs)，返回可取消句柄 */
  schedule(delayMs: number, fn: () => void): number;
  /** 等价 window.clearTimeout(handle) */
  cancel(handle: number): void;
}

/** 缺省计时器：与 GameScene 现行 window.setTimeout/clearTimeout 逐字同源（:1181-1185） */
const windowTimers: RigTimers = {
  schedule: (delayMs, fn) => window.setTimeout(fn, delayMs),
  cancel: (handle) => window.clearTimeout(handle),
};

/**
 * 相机纯状态机：临时态字段 + 复位语义 + 冻结门 + 输入事件纯计算 + 弹簧惯性步进。
 * 字段保持 GameScene 原名（camFrozen/camX/…），便于接线时逐行对账；
 * 公开可读是给引擎写段（HUD 反缩放读 camScale）与单测逐字段断言用的。
 */
export class CameraRig {
  private readonly timers: RigTimers;

  // ---- 标定三值（GameScene.ts:218-220；setupForLevel 按 minScaleRatio/lockScaleRatio 重算）----
  camMinScale = 1;
  camLockScale = 1;
  camMaxScale = 1.5;
  // ---- 用户输入覆盖态（:221-224）----
  /** 双指捏合结果（:1197）；pointerup 回弹语义见 onCamPointerUp */
  camUserScale: number | null = null;
  /** 滚轮结果（:1180），1s 静置回弹（:1182-1185） */
  camWheelScale: number | null = null;
  /** 单指拖拽平移的世界中心（:1209）；pointerup 立即复位回自动焦点（:1217） */
  camUserCenter: { x: number; y: number } | null = null;
  /** 滚轮回弹 debounce 句柄（window.setTimeout 返回值；:224/:1181-1185） */
  camWheelReset: number | null = null;
  // ---- 冻结门（:225）：true 挡 wheel/pointermove 输入并停 update 步进（:1502 调用位门槛）；
  // 解冻点在 GameScene：create 末尾刷新回座 started（:482）与 onPhaseChanged started（:1514）----
  camFrozen = true;
  // ---- 弹簧现值/目标/速度（:226-234）----
  camX = 0;
  camY = 0;
  camScale = 1;
  camTX = 0;
  camTY = 0;
  camTScale = 1;
  camVX = 0;
  camVY = 0;
  camVScale = 0;
  /** r3 脏守卫：上次实际应用的相机三值，NaN 起步保证首帧强制应用（:235-238） */
  camLastX = NaN;
  camLastY = NaN;
  camLastScale = NaN;
  // ---- 手势进行中态（:239-240）----
  pinchState: { startDist: number; startScale: number } | null = null;
  panState: { cx: number; cy: number; px: number; py: number } | null = null;

  /** applyIfDirty/applyForced 复用返回对象（r3：update 路径零稳态分配） */
  private readonly applyOut: CamApply = { x: 0, y: 0, scale: 1 };

  constructor(timers?: RigTimers) {
    this.timers = timers ?? windowTimers;
  }

  /**
   * H2 相机临时态复位（GameScene.init 末尾 :370-387，c7dc51b 引入）：
   * 场景实例在 stop/start 间复用，临时态须逐次复位——尤其 camFrozen
   * （刷新回座 started 由 create 末尾解冻；refresh 进 ready 则保持冻结到开局事件）。
   * 注意：**不碰**位姿三值 camX/camY/camScale/camTX/camTY/camTScale——
   * 它们由紧随其后的 create→setupForLevel 设定（原顺序 init→create）。
   */
  resetTransient(): void {
    this.camFrozen = true; // :372
    this.camUserScale = null; // :373
    this.camWheelScale = null; // :374
    this.camUserCenter = null; // :375
    if (this.camWheelReset != null) {
      // :376-379
      this.timers.cancel(this.camWheelReset);
      this.camWheelReset = null;
    }
    this.pinchState = null; // :380
    this.panState = null; // :381
    this.camVX = 0; // :382
    this.camVY = 0; // :383
    this.camVScale = 0; // :384
    this.camLastX = NaN; // :385
    this.camLastY = NaN; // :386
    this.camLastScale = NaN; // :387
  }

  /**
   * 相机标定+初值（GameScene.setupCameraManager 状态前半 :1160-1170）：
   * minScale=0.9 比例、lockScale=0.97 比例（对关卡矩形），初始钉关卡中心全图 minScale。
   * 返回等价 applyCam(true)（:1170）的三元组；监听注册（:1171-1173）留 GameScene。
   * 不清用户覆盖态——原实现同样不清（由 init 段 resetTransient 先行清空）。
   */
  setupForLevel(level: LevelSize, rw: number, rh: number): CamApply {
    this.camMinScale = Math.min((0.9 * rw) / level.widthPx, (0.9 * rh) / level.heightPx); // :1160
    this.camLockScale = Math.min((0.97 * rw) / level.widthPx, (0.97 * rh) / level.heightPx); // :1161
    this.camScale = this.camMinScale; // :1166
    this.camX = this.camTX = level.widthPx / 2 + PAD; // :1167
    this.camY = this.camTY = level.heightPx / 2 + PAD; // :1168
    this.camTScale = this.camMinScale; // :1169
    return this.applyForced(); // :1170 applyCam(true)
  }

  /**
   * 静态相机装配（2026-10-24 用户裁定：固定全图——跟随/自动缩放/滚轮/捏合/拖拽全部停用，
   * 机关全程可见便于双人思考）。视图=整关矩形适配视口并钳 ≤1、钉关卡矩形中心：
   * 标准关(1248×928) scale=1 中心(656,496)，与原动态相机 settled scroll(16,16) 视图逐位相同；
   * 超高关 forest_bonus_2(1248×1120) scale=960/1120≈0.857 整图入画（原动态相机为裁切+跟随，
   * 底部机关出视野——有意偏离 oracle，见 note/evidence/2026-10-24-visual-verify-48levels 01号档补记）。
   * 原版动态相机语义（CameraManager bundle @1881500 移植）完整保留在本类其余方法并由单测覆盖。
   * 冻结恒真：GameScene 不接输入监听、update 不步进，三值自装配后终局不变。
   */
  setupStatic(level: LevelSize, rw: number, rh: number): CamApply {
    const s = Math.min(1, rw / level.widthPx, rh / level.heightPx);
    this.camScale = this.camTScale = s;
    this.camX = this.camTX = level.widthPx / 2 + PAD;
    this.camY = this.camTY = level.heightPx / 2 + PAD;
    this.camVX = this.camVY = this.camVScale = 0;
    this.camFrozen = true;
    return this.applyForced();
  }

  /**
   * 滚轮缩放（GameScene.onCamWheel :1176-1186；原版 $(window).wheel @1883520）：
   * ×0.8/×1.2 从当前动画值乘，钳 [camMinScale, camMaxScale]；1s 静置 debounce 回弹——
   * 届时 ≤lockScale 停在 lockScale（lockAtMinScale），否则复位交还自动适配。
   * @param dy 滚轮纵向增量（Phaser wheel 事件第 4 参）
   * @param camZoom this.cameras.main.zoom（注入替代引擎读）
   */
  onCamWheel(dy: number, camZoom: number): void {
    if (this.camFrozen) return; // :1178 冻结门
    const next = Math.min(this.camMaxScale, Math.max(this.camMinScale, (dy > 0 ? 0.8 : 1.2) * camZoom)); // :1179
    this.camWheelScale = next; // :1180
    if (this.camWheelReset != null) this.timers.cancel(this.camWheelReset); // :1181
    this.camWheelReset = this.timers.schedule(1000, () => {
      // :1182-1185
      this.camWheelScale = this.camWheelScale != null && this.camWheelScale <= this.camLockScale ? this.camLockScale : null;
      this.camWheelReset = null;
    });
  }

  /**
   * 双指捏合缩放 + 单指拖拽平移（GameScene.onCamPointerMove :1188-1210；
   * 原版 pinch @1883640 / pan @1885447，threshold 10）。
   * 捏合优先：双指按下时以 startScale×距离比钳位；否则在未捏合时单指拖拽 >10px 起平移，
   * camUserCenter=起点世界中心 − 指针位移/zoom。原版以 cursors.active 闸（触屏光标激活禁用），
   * 本复刻触屏键为 DOM 按钮不占画布，无此闸（:1153 注）。
   * @param p 事件指针；@param env zoom + input.pointer1/2 快照
   */
  onCamPointerMove(p: RigPointer, env: RigPointerEnv): void {
    if (this.camFrozen || !p.isDown) return; // :1190 冻结门 + 未按下闸
    const p1 = env.pointer1;
    const p2 = env.pointer2;
    if (p1.isDown && p2.isDown) {
      // :1193-1199 捏合（Phaser.Math.Distance.Between 同式：Math.sqrt(dx*dx+dy*dy)，已核 phaser src）
      const dist = Math.sqrt((p1.x - p2.x) * (p1.x - p2.x) + (p1.y - p2.y) * (p1.y - p2.y));
      if (!this.pinchState) this.pinchState = { startDist: dist, startScale: env.zoom }; // :1195
      if (this.pinchState.startDist > 0) {
        this.camUserScale = Math.min(this.camMaxScale, Math.max(this.camMinScale, this.pinchState.startScale * (dist / this.pinchState.startDist))); // :1197
      }
      return;
    }
    if (this.camUserScale != null) return; // :1201 捏合压制拖拽
    const cx = this.camUserCenter?.x ?? this.camX - PAD; // :1202-1203（世界 ← 现值 −PAD）
    const cy = this.camUserCenter?.y ?? this.camY - PAD;
    if (!this.panState) {
      if (p.getDistance() < 10) return; // :1205 原版 hammer pan threshold: 10
      this.panState = { cx, cy, px: p.x, py: p.y }; // :1206
    }
    const zoom = env.zoom; // :1208
    this.camUserCenter = { x: this.panState.cx - (p.x - this.panState.px) / zoom, y: this.panState.cy - (p.y - this.panState.py) / zoom }; // :1209
  }

  /**
   * 指针抬起（GameScene.onCamPointerUp :1212-1220；原版 pinchend/panend）：
   * userScale ≤lockScale 回弹锁在 lockScale，否则复位交还自动适配；userCenter 立即复位。
   * **无冻结门**（与原实现一致：冻结期抬起同样清手势态）。
   */
  onCamPointerUp(): void {
    if (this.camUserScale != null) {
      this.camUserScale = this.camUserScale <= this.camLockScale ? this.camLockScale : null; // :1214-1215
    }
    this.camUserCenter = null; // :1217
    this.pinchState = null; // :1218
    this.panState = null; // :1219
  }

  /**
   * 每帧目标更新（GameScene.updateCamTarget :1222-1265；原版 updateCamera @1886262）：
   * 焦点=双角色中点（userCenter 覆盖），缩放=自动适配（userScale→wheelScale 依次覆盖，
   * wheel 优先级最高 :1247-1248），再按 checkBounds 关卡矩形语义钳进（:1261-1264）。
   * **本方法无冻结门**——原实现靠调用位 :1502 的 `if (!this.camFrozen)` 挡，接线时保持同构。
   * @param fb/wg 双角色快照（{x,y}；缺一早退 :1227，Number(x)||0 容错同源 :1228-1231）
   * @param rw/rh 视口尺寸（this.scale.width/height）
   * @param desktop sys.game.device.os.desktop（:1243 窄屏/移动判定用）
   */
  updateCamTarget(level: LevelSize, fb: { x: number; y: number } | null, wg: { x: number; y: number } | null, rw: number, rh: number, desktop: boolean): void {
    if (!fb || !wg) return; // :1227
    const fx = Number(fb.x) || 0; // :1228-1231
    const fy = Number(fb.y) || 0;
    const gx = Number(wg.x) || 0;
    const gy = Number(wg.y) || 0;
    // 自动适配：间距 bbox + worldPadding(200/100)，钳到关卡大小（:1234-1241）
    const c = Math.min(Math.abs(gx - fx) + 400, level.widthPx);
    const d = Math.min(Math.abs(gy - fy) + 200, level.heightPx);
    const vw = rw;
    const vh = rh - 64; // viewportPadding top 64（:1238）
    const i = c > vw ? vw / c : 1;
    const j = d > vh ? vh / d : 1;
    let h = i < 1 || j < 1 ? Math.min(i, j) : 1;
    // 最小可视 40×30 格（窄屏/移动 20×15；mpx=32）（:1242-1246）
    const small = !desktop || rw <= 780 || rh <= 480;
    const tiles = small ? TILES_SMALL : TILES_DESKTOP;
    if (h * tiles.w * 32 > rw) h = rw / (tiles.w * 32);
    if (h * tiles.h * 32 > rh) h = rh / (tiles.h * 32);
    if (this.camUserScale != null) h = this.camUserScale; // :1247
    if (this.camWheelScale != null) h = this.camWheelScale; // :1248 wheel 优先级最高
    this.camTScale = h; // :1249
    // 焦点：双角色中点（关卡坐标→世界 +PAD）；拖拽平移时 userCenter 覆盖（:1250-1252）
    this.camTX = (this.camUserCenter?.x ?? (fx + gx) / 2) + PAD;
    this.camTY = (this.camUserCenter?.y ?? (fy + gy) / 2) + PAD;
    // checkBounds（原版 @1845100，F2 翻转；:1253-1264）：钳制域=关卡矩形（屏域，全 rw/rh 无 PAD）。
    // W·h < rw → 钉关卡中心（居中，与焦点无关）；否则钳 F ∈ [PAD+rw/(2h), PAD+W−rw/(2h)]。
    if (level.widthPx * h < rw) this.camTX = level.widthPx / 2 + PAD;
    else this.camTX = Math.min(Math.max(this.camTX, PAD + rw / (2 * h)), PAD + level.widthPx - rw / (2 * h));
    if (level.heightPx * h < rh) this.camTY = level.heightPx / 2 + PAD;
    else this.camTY = Math.min(Math.max(this.camTY, PAD + rh / (2 * h)), PAD + level.heightPx - rh / (2 * h));
  }

  /**
   * 弹簧逼近目标（GameScene.animateCam :1267-1277；原版 animate @1887350）：
   * a=1/15（用户平移中 1/3，:1269）、阻尼 0.5；步进后等价 applyCam(true)——
   * 脏守卫记录 last 三值并返回三元组供调用方落引擎（原 :1276）。
   * **本方法无冻结门**——原实现靠调用位 :1502 挡，接线时保持同构。
   */
  animateCam(): CamApply {
    const a = this.camUserCenter != null ? 1 / 3 : 1 / 15; // :1269
    this.camVX = (this.camVX + (this.camTX - this.camX) * a) * 0.5; // :1270-1272
    this.camVY = (this.camVY + (this.camTY - this.camY) * a) * 0.5;
    this.camVScale = (this.camVScale + (this.camTScale - this.camScale) * a) * 0.5;
    this.camX += this.camVX; // :1273-1275
    this.camY += this.camVY;
    this.camScale += this.camVScale;
    return this.applyForced(); // :1276 applyCam(true)
  }

  /**
   * 相机复位（GameScene.resetCamera :1309-1325；resetRound 在 ready 调用 :1545，
   * 等价原版整关 reload 回冻结全图）：清用户覆盖态/手势态/回弹句柄/速度，
   * 三值回关卡中心 minScale，camFrozen=true；末尾等价 applyCam()——**非强制**，
   * 三值与 last 全等时返回 null（引擎写跳过，r3 脏守卫 :1283 原语义）。
   */
  resetForLevel(level: LevelSize): CamApply | null {
    if (this.camWheelReset != null) this.timers.cancel(this.camWheelReset); // :1311
    this.camWheelReset = null; // :1312
    this.camUserScale = null; // :1313
    this.camWheelScale = null; // :1314
    this.camUserCenter = null; // :1315
    this.pinchState = null; // :1316
    this.panState = null; // :1317
    this.camVX = this.camVY = this.camVScale = 0; // :1318
    this.camScale = this.camMinScale; // :1319
    this.camX = this.camTX = level.widthPx / 2 + PAD; // :1320
    this.camY = this.camTY = level.heightPx / 2 + PAD; // :1321
    this.camTScale = this.camMinScale; // :1322
    this.camFrozen = true; // :1323
    return this.applyIfDirty(); // :1324 applyCam()（force=false）
  }

  /**
   * 强制应用（GameScene.applyCam force=true 路径 :1283 的否定分支）：
   * 记录 last 三值并返回三元组。引擎写（setZoom/centerOn/HUD 反缩放 :1287-1306）留 GameScene。
   */
  applyForced(): CamApply {
    this.camLastX = this.camX; // :1284-1286
    this.camLastY = this.camY;
    this.camLastScale = this.camScale;
    return this.emitApply();
  }

  /**
   * 脏守卫应用（GameScene.applyCam force=false :1283）：三值与 last 全等返回 null
   * （跳引擎写；setZoom/centerOn 无条件置 dirty 并重走 HUD 补偿循环，写同值无视觉差）。
   */
  applyIfDirty(): CamApply | null {
    if (this.camX === this.camLastX && this.camY === this.camLastY && this.camScale === this.camLastScale) return null; // :1283
    return this.applyForced();
  }

  /** 复用返回对象填充（r3：update 路径零稳态分配；调用方当帧消费不保留引用） */
  private emitApply(): CamApply {
    this.applyOut.x = this.camX;
    this.applyOut.y = this.camY;
    this.applyOut.scale = this.camScale;
    return this.applyOut;
  }
}
