# TimedPusher 组派发保真修复——oracle C 部证据链全录（2026-10-28）

缘起：#50 前置侦察（解 ice 正式路线）从 ice_02 开局，地形/机制解码发现**门室封死悖论**——
双门所在小室（cols1-7, rows1-4）唯一入口 col8 被升降平台 p2 堵死，而内核里定时按钮 t0
按下后 p2 纹丝不动。逐层对质 oracle C 部引擎（output/C/js/init.c13c04134a9952ea.js，
2220805B，即移植注记所引 bundle），确认是**移植保真缺口**而非数据/几何误读。0.3.58 修复。

## 1. 悖论排查路径（排除项）

- **关卡数据无误**：data/tutorials/levels/ice_02.json 与 C 部官方文件逐字节一致（md5 对比）。
- **p2 几何无误**：oracle MovingPlatform 构造（C @1675266）：`width<height` 竖直分支
  swap 后 `x += height/2(=原w/2=16)`、`y += width/2(=原h/2=48)` → 中心 (272,112)，
  占 x256..288 / y64..160——与内核 mechSnapshot 一致（旧头注释"纵向 x+=原h/2"是笔误，
  代码与 oracle 一致，未改）。
- **"闸门被砌体卡死"不成立**：row1 col8 实心砖（gid1/type0）底 y64 恰贴 p2 顶 y64，
  疑似完全夹死。内核实测：手动置 p2 state=1 驱动马达，y112→16 全程 −96px 畅通无阻
  ——**零密度动态体（density 0）与静态体的接触不产生阻断**，oracle 同为 density 0
  （C @1677003 `h.density = 0`），同构。闸门语义=吊闸，视觉穿砌体升降。

## 2. 定时按钮的真实接线（C 部三类全文）

- **Pusher**（C @1704779..1708263）：构造器 `this.signal = new Phaser.Signal(); this.doRegister()`；
  `Pusher.prototype.doRegister = function () { return this.registerDevice(); }`（基类 Device）；
  Device.registerDevice → `game.MechManager.registerDevice(this)`。
  旧注"doRegister 空=C @1707424"引错类——@1707424 前后是 Pusher 的 doRegister=**非空**。
- **Device 基类 registerDevice**（C @1640xxx 区段）：`MechManager.registerDevice(this)`；
  **MechManager.registerDevice**（C @1834xxx 区段）：
  `deviceGroups[group].push(a); if (a.signal != null) a.signal.add(this.deviceChanged);`
  ——**每个设备都入组**；带 signal 者接线。
- **MechManager.deviceChanged**（聚合语义）：`g = a.state; 组内 signal 源依次 g = g||b.state;
  组内无 signal 者赋 g 并 _updateState()`——与我方 MechManager.deviceChanged 现实现一致
  （该聚合逻辑本就正确，缺的是定时钮这条派发源）。
- **TimedPusher**（C @1726729..1732143）：`extends Pusher`；构造器末尾
  `this.registerDevice()`（基类直调）→ **入组+signal 接线**；
  `TimedPusher.prototype.doRegister = function () {}` 空覆盖只废 Pusher 构造器里那条
  doRegister→registerDevice 路径，**不影响其自身末尾的基类注册**。
- **checkState 派发点**（三处 `signal.dispatch(this)`）：
  1. `f > 0 且 state==0` → state=1 + dispatch（压下沿；注意阈值 f>0，非 Pusher 的 0.2）；
  2. timer 到时（`f>0` 期 Phaser timer，按压期每帧 stop().start() 重置）→ state=0 + dispatch + timer=null；
  3. `!timer && state==1 && f<=0` → state=0 + dispatch（无 timer 早松沿）。
  早松（timer 未到）期间：state 保持 1、timer 继续走满 time 毫秒。

## 3. 内核修复（0.3.58，packages/shared/src/kernel）

- `mechanisms.ts`：TimedPusher `super(B, def.group, true)`（信号源）；
  buildMechanisms `manager.register(tp)`；注释按本文证据链重写。
- `world.ts` step()：tp 循环内 `prev = tp.state; checkState(...); if (state !== prev)
  manager.deviceChanged(tp.group)`——迁移沿同步派发；events 数组仍只承载音效广播
  （downState 沿+到时），oracle 中 dispatch 与音效本就是两条通道，协议零变化。
- 回归钉：`timedpusher-gate.test.ts` 3 例（不踩不动 / 踩下升+按住保持 / 离开 4s 回落）。

## 4. 影响面与验证

- 全库 TimedPusher 关（gid38 扫描 + 解析直方图）：forest_20、light_14/31、ice_02/07/07_1/
  09/09_1/11/12/13/21/22/24/24_1/26/31/bonus_1/bonus_2（解析 25 实例/14 关 + gid 扫描
  15 文件，两口径差为缺省 time=2000 的实例归并）。
- det：forest 48/48、light 40/40 位级一致；ice 51 关唯 ice_bonus_1 预期漂移（脚本踩中
  t0 group7 → p8 起动）——重录 **r2-tpgate**（ci.yml 同步），先例 ec03e06（#34/#35 重锚）。
- 359 测试绿 / kregress 15/15 / browser-room 4/4 / typecheck 零错。

## 5. 顺带勘误

- kernel/mechanisms.ts MovingPlatform 竖直分支头注释"纵向 (x+=原h/2, y+=原w/2)"与代码
  （cx+=def.w/2, cy+=def.h/2）矛盾——**代码是对的**（oracle C @1675266 同款），头注释为
  历史笔误，0.3.58 顺带改注释免再误导。
