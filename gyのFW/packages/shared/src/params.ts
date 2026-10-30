/**
 * 原版引擎常数——逐项从 init.js 实证提取（@偏移为字节锚，详见 note/research/2026-10-fidelity/01-original-engine-spec.md）。
 *
 * 单位约定：
 * - 物理侧一律"米、秒"（box2d 世界坐标，y 轴向上，屏幕坐标 = (−ptm·x, −ptm·y)，@1638460–1638950 PointProxy 双取负）；
 * - 显示侧像素换算乘 ptm。1 图块 = 1 米 = 32 像素（setPTMRatio(32) @1939712）。
 */

/** 世界尺度与步进 */
export const WORLD = {
  /** px/米 */
  ptm: 32,
  tile: 32,
  /** 1000 px/s² @1940535 → 31.25 m/s²，物理重力 (0, −31.25) */
  gravity: 31.25,
  /** 插件默认迭代（velocity 8 / position 3）@1596300 */
  velIterations: 8,
  posIterations: 3,
  /** 原版单帧最大步进 dt=min(0.04,elapsed) @1941460；我们服务端 60Hz 固定步长 1/60，此为上限保险 */
  maxStep: 0.04,
} as const;

/** 角色（火/水共用同一 character 类，原型常量 @1863650–1863990 + 构造体 @1857531–1862500） */
/**
 * 部别跳跃初速（m/s）：A–E 全系原型 15.5（init bundle jumpVelocity 字证），唯 F 部
 * fairy-tales.min.js 为 16.5（2026-10-31 fairies-01 槽实证——F 全图台沿按 96px 精确
 * 设计，15.5 使贴边跳 0.3-7px 临界 vs 16.5 的 5-15px 余量）。fairies 前缀=F 部 vintage。 */
export function jumpVelocityOf(levelId: string): number {
  return levelId.startsWith("fairies") ? 16.5 : CHAR.jumpVelocity;
}

export const CHAR = {
  // ---- 复合碰撞体（body 原点=贴图中心；fixture 局部坐标，米）----
  /** 躯干圆半径（m() 助手，位于 (0,y1)，friction 0，density 0） */
  r1: 0.48,
  /** 脚底圆半径（feetSensor，位于 (0,y2)，feetFriction，density 0） */
  r2: 0.2,
  /** 梯形四角内缩 */
  dr: 0.03,
  y1: 0.2,
  y2: -0.9,
  feetFriction: 0.5,
  /** 躯干梯形唯一质量源：n(r1,r2,y1,y2)：下宽 2r1−2dr@y1、上宽 2r2−2dr@y2，density 1.4、friction 0 @1858900 */
  torsoDensity: 1.4,
  fixedRotation: true,
  bullet: true,
  /** 贴图缩放（客户端用） */
  spriteScale: 0.95,
  /** 出生偏移：new character 时 x+=mpx(1)、y−=mpx(1)（屏幕像素，即物理 x−1m、y+1m 视角换算在 kernel 处理）@1857800 */
  spawnOffsetPx: 32,
  // ---- 手感（update @1870200–1873400，逐行转写）----
  jumpImpulse: 1,
  jumpVelocity: 15.5, // m/s
  jumpIceVelocity: 10, // oracle 同样定义未消费（@63028），保持未接线
  runForce: 50, // N
  floatForce: 30, // 空中横推 N
  defaultMaxSpeed: 8.5, // m/s
  waterIceMaxSpeed: 2, // wg 冰面限速（setFriction #35 接线）
  absoluteMaxSpeed: 40, // m/s 硬钳
  /** 跑力爬升常数：e=130·g/currentRunForce（currentRunForce 初值 undefined 是原版事实——首次按住键不发力，先经历一次"松键→0.475·runForce"初始化）*/
  runRamp: 130,
  /** 松键刹车冲量系数：i=(7·−vx, 0) @1870838 */
  brakeFactor: 7,
  /** 无输入帧把爬升力重置为 0.475·runForce */
  idleRunFactor: 0.475,
  /** 贴地吸附：p>0.6 且 0≤i.y<20 时 i.y+=20 @1870290 */
  groundAttachN: 20,
  /** 力方向门控：仅 i.x≠0 且未超速才 ApplyForce；跳跃生效帧强制 i.y=0 @1872500–1873400 */
  jumpFullNormalY: 0.65, // n.y>0.65 满跳，否则 √√(n.y)·jumpVelocity（双开方为源码直证 @1872300）
  jumpMinNormalY: 0.2, // 起跳许可：n.y>0.2 或脚触点≥2（prohibitJump 边沿防连跳）
  headTiltMin: -0.333, // 头部倾斜 atan 用（客户端渲染参考）
  // ---- 碰撞过滤 @1858700–1862500 ----
  category: 16,
  mask: 4353, // = 0x1101：bit0|bit8|bit12
  portalCategory: 4096,
} as const;

/** 液体（Liquid @1699450–1707000）：每行一对象；下半格实心为地形（createGroundShape 5/6/7 分支 @1844050） */
export const LIQUID = {
  /** 致死传感器顶缘=表面下 0.18m，深至整格底 */
  killDepthTop: 0.18,
  /** 端盖墙（type8/9）顶外扩 0.3m @1833100 */
  capTopExtend: 0.3,
  category: 1,
  killMask: 4369, // 0x1111
  displayMask: 61695,
  /** 图形动画 15 帧 30fps（客户端） */
  animFrames: 15,
  animFps: 30,
} as const;

/** 门（Door @1680900） */
export const DOOR = {
  /** 静态传感器 64×8 像素（2m×0.25m） */
  sensorW: 2,
  sensorH: 0.25,
  frameRate: 25, // 开门扫帧速率
  frames: 21, // 到 21 帧 isUp
  /** 双 isUp→animateStairs→1600ms→gameFinish @1950841 */
  finishDelayMs: 1600,
} as const;

/** 钻石（Diamond @1677877–1678200） */
export const DIAMOND = {
  /** 传感器方块 0.7m（≈22.4px）；生成时 y 上抬 1m */
  size: 0.7,
  spawnLiftM: 1,
  floatAmpPx: 5,
  floatPeriodS: 2,
} as const;

/** 移动平台（MovingPlatform @1714493–1719100） */
export const PLATFORM = {
  /** 创建常量 0.5（仅初值），运行时 updateState 每步 SetMotorSpeed(±2) → 2 m/s = 64px/s（02 报告 E7） */
  createMotorSpeed: 0.5,
  runMotorSpeed: 2,
  maxMotorForce: 220,
  /** 旋转臂（dtheta）密度与扭矩 */
  rotDensity: 0.5,
  maxMotorTorque: 200,
  paddingY: 0.06,
  category: 256,
} as const;

/** 拉杆（Lever @1691743–1696242） */
export const LEVER = {
  /** 杆躯干盒 0.15×0.7m density 1.6 */
  torsoW: 0.15,
  torsoH: 0.7,
  torsoDensity: 1.6,
  limitAngle: 0.2, // ×π
  motorSpeed: 4, // ×onis
  maxMotorTorque: 10,
  category: 1,
} as const;

/** 按钮板（Pusher @1744635–1747900） */
export const PUSHER = {
  /** 壳：顶宽=底宽+1m 再外扩 0.5m、高 0.6m、density 0.1 */
  shellH: 0.6,
  shellDensity: 0.1,
  stroke: 0.7, // prismatic 行程 0..0.7m
  motorSpeed: -15, // 自动回顶
  maxMotorForce: 5,
  /** 位移>0.2m 记 state=1（触发组同步） */
  trigger: 0.2,
} as const;

/** 推箱家族（BoxedDevice @1675209–1677877） */
export const BOX = {
  /** boxWidth 默认 1.8（像素语义待机关批次源码复核：贴图槽 64px 见机调整） */
  width: 1.8,
} as const;

/** 球（Ball @1662664；radius 0.4 实证=oracle mass 2.3π·0.4²=1.1561，34 号档 §2；零引用，历史笔误 0.9 已纠） */
export const BALL = {
  radius: 0.4,
  density: 2.3,
  restitution: 0.1,
} as const;

/** 风（Wind @1772662）：mass0 梯形风场，对场内角色施力；参数待机关批次源码提取 */
export const WIND = {} as const;

/** 摆绳（Hanging @1684255）：摆板宽 1.15×barWidth、linearDamping 0.4、锚点 fixture category 0；reactable */
export const HANGING = {
  platformWidthFactor: 1.15,
  linearDamping: 0.4,
} as const;

/** 服务器固定步长（我们的决策：60Hz；原版为可变帧率+0.04 上限，低帧率行为等价见 01 §6） */
export const TICK_HZ = 60;

/**
 * 兼容层：旧代码以 P 命名引用 tickRate/tile。
 * 旧内核臆造参数（coyote/jumpBuffer/jumpVel 等）已随 AABB 内核退役删除（0.3.0），
 * 新代码一律用上方原版实证分组常量。
 */
export const P = {
  tickRate: TICK_HZ,
  tile: WORLD.tile,
} as const;
