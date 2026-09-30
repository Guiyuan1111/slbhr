/** 全部物理/手感参数。调参只改这一个文件（对照原版校准，见 note/PLAN.md 第 8 节）。 */
export const P = {
  /** 仿真频率（服务端固定步长） */
  tickRate: 60,
  /** 图块边长（像素），官方 Tiled 数据为 32 */
  tile: 32,
  /** 重力加速度 px/s²（原版 box2d 实测：gravity.y=1000px/s²，ptm=50） */
  gravity: 1000,
  /** 下落终端速度 px/s */
  maxFall: 950,
  /** 水平移速 px/s（原版 defaultMaxSpeed=8.5m/s×50ptm=425） */
  moveSpeed: 425,
  /** 起跳初速 px/s（负=向上；原版 jumpVelocity=15.5m/s×50=775，跳高≈300px） */
  jumpVel: -775,
  /** 土狼时间 s：离开地面后仍可起跳的宽限 */
  coyote: 0.09,
  /** 跳跃缓冲 s：落地前按跳的预存时长 */
  jumpBuffer: 0.12,
  /** 玩家碰撞盒（官方角色约 64px 高，盒略小） */
  playerW: 26,
  playerH: 56,
  /** 液体判定收缩 px：身体内缩该距离后才算接触液体 */
  liquidInset: 4,
  /** 死亡后重生延迟 s */
  respawnDelay: 1.1,
  /** 站门判定外扩 px */
  doorTolerance: 12,
  /** 移动平台速度 px/s */
  platformSpeed: 130,
  /** 拉杆触发冷却 s（接触翻转的最小间隔） */
  leverCooldown: 0.6,
  /** 钻石拾取判定半径 px（原版蹚池行走必拾到池中钻石，实测需 ≥40） */
  diamondRadius: 40,
} as const;
