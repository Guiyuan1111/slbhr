# r12 · 客户端帧内残余分配与相机/HUD 每帧强写

日期：2026-10-21　版本基线：0.3.42（`18a54e8`）　优化提交：量具 `1251929` + 勘误 `300a75f`、实现 `6221aeb`+`e7a788e`

## 一、选题依据（为什么不碰已闭合的面）

r0–r11 已把服务端步进（−15~−22%）、同步出流（−54~−63%）、编码（−10~12%）、世界构建（10.5×）、
每 World 内存（−76%）、客户端 update 段分配（−97%）、冷启动（−32%）、场景切换（−11%）、空闲脚本
（判至 <2% 地板）、工具链、GC 归因（0–0.4%）、字体子集（−5.2%）逐面收账；渲染 JS 面在 r7 判为
"理论地板"，幕布税与真 GPU 口径挂账。本轮用新加的**帧内写入计数器**（见 §二）重新取证，发现三处
r3「update 分配 −97%」之后残留、且此前三轮从未计过数的写侧热点：

1. **T10 平台电机声按位姿对象差分**——GameScene 每帧逐台构造 `{x,y,angle}` 字面量喂给
   `PlatformSoundTracker.update`。森林关最多 47 台平台，60fps 下即 2820 个短命对象/秒。
2. **相机弹簧永不精确收敛**——`animateCam()` 走的是浮点阻尼弹簧，settle 后 `camX/camScale`
   与目标恒差最后一比特，`applyCam` 的 r3 脏守卫（三值相等才跳过）每帧判"变了"，因此调用方
   一直用 `applyCam(true)` 强制作废守卫：`cam.setZoom()` + `cam.centerOn()` 每帧各一次，
   每次都无条件置 Phaser camera dirty 并重算视图矩阵。
3. **HUD 反缩放补偿随相机写连坐**——`applyCam` 内 HUD 补偿循环挂在相机写之后，每帧对每个
   HUD 件做 `setScale` + x + y 三次属性写。但 HUD 件全部 `setScrollFactor(0)`，其屏幕位置
   **只随 zoom 变**，平移不影响；实测稳定态仍是 3 写/件/帧（f01 4 件 × 3 = 1452 次/8 秒）。

## 二、量具（`benchmark/perf-client.mjs`，提交 `1251929`）

在 r7 帧预算口径上新增帧内写入计数器（零分配包装，只自增）：

| 计数器 | 语义 | 捕获方式 |
| --- | --- | --- |
| `camZoom` / `camCenter` | 主相机 `setZoom`/`centerOn` 调用数 | 沿**活相机实例的原型链**上溯到真正的属主原型再包装（Phaser 3.90 的 `setZoom` 不挂在 `cameras.Base.prototype` 上，直取原型会静默计 0——本轮第一个量具 bug，已修并重跑基线） |
| `setPos` / `setAngleW` / `setScaleW` / `setTex` | Image/Sprite/Container/BitmapText 四类对象的 `setPosition`/`setAngle`/`setScale`/`setTexture` 调用数 | 类原型包装 |
| 原有 | `totalAvg`/`updateAvg`/`allocKBs`/`gcDrops`/`mechCalls` + GL 侧计数 | 不变 |

`--compare` 表已扩展这些字段；快照命名 `client-r12-baseline-*` / `client-r12-opt-*`。

## 三、基线取证（8 秒，双渲染器各一轮）

| 场景 | 渲染器 | 帧数 | camZoom/帧 | setScale/帧 | 分配 KB/s | update 段 avg |
| --- | --- | --- | --- | --- | --- | --- |
| forest_01（稳定态） | Canvas | 484 | 1.00（484） | 3.00（1452） | 1149 | 0.211ms |
| forest_01 | WebGL(SwiftShader) | 102 | 1.00（102） | 3.00（306） | 690 | 0.410ms |
| forest_bonus_2（47 台平台） | Canvas | 460 | 1.00（460） | 3.00（1380） | 2438 | 0.292ms |
| forest_bonus_2 | WebGL | 79 | 1.00（79） | 3.00（237） | 1227 | 0.715ms |

即"角色不动、机关在动"的静置 8 秒里，相机与 HUD 仍按满帧率强写——**这就是本轮的可回收面**。

## 四、实施（三项，均为等价改写，不动协议与物理）

1. `packages/client/src/scenes/platformSound.ts`：`PlatformPose` 接口删除，
   `update(id, x, y, angle)` 改标量入参；差分/起步/限位停/反向逻辑逐字不变。
   调用方 [GameScene.ts:2092](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/GameScene.ts#L2092) 直传三个数。
   **仍走原始快照位姿**（不复用 `stepPlatforms` 的平滑位姿）——平滑位姿带 lead 外推，会把"已到限位
   但视觉仍在收敛"的平台判成继续运动，破坏 T10 的限位停声语义。
2. `GameScene.animateCam()`：弹簧积分后加亚像素吸附（位移阈 `CAM_EPS_POS=1e-3` 世界像素、
   缩放阈 `CAM_EPS_SCALE=1e-6`，速度同时归零），并把末行 `applyCam(true)` 改为 `applyCam()`，
   让 r3 脏守卫真正生效。阈值取"一个像素的千分之一"量级，远低于任何可视判据（见 §五 visual-diff）。
3. `GameScene.applyCam()`：HUD 反缩放补偿独立成 `camHudScale` 守卫——只有 zoom 变化才重补；
   `force=true`（`setupCameraManager` / `buildHud` / 相机复位）清守卫以保留"必须重补"语义。
   判据依据：HUD 件全部 `setScrollFactor(0)`，平移不改变其屏幕位置；`Scale.FIT` 下
   `this.scale.width/2` 为固定逻辑视口中点，不构成额外失效路径。
4. 单测：`platformSound.test.ts` 21 处调用点改标量（断言逐字不变，5 个用例覆盖首见不出声、
   起步单实例、连续运动不重复起播、限位停、反向停旧起新、转臂角度差分、音效关闭、clear 释放）。

## 五、前后对比（同一量具、同一场景）

### Canvas（软栅，JS 面可比）

| 指标 | forest_01 前 → 后 | forest_bonus_2 前 → 后 |
| --- | --- | --- |
| `camZoom`/`camCenter` 次数 | 484 → **31**（−93.6%） | 460 → **69**（−85.0%） |
| `setScaleW`（HUD 补偿） | 1452 → **93**（−93.6%） | 1380 → **207**（−85.0%） |
| 分配 | 1149 → **1044** KB/s（−9.1%） | 2438 → **2246** KB/s（−7.9%） |
| update 段 avg | 0.211 → 0.217ms（噪声带内） | 0.292 → **0.270**ms（−7.5%） |
| 帧总 avg | 7.082 → 7.630ms（软栅 present 抖动，非 JS 面） | 15.131 → **14.591**ms（−3.6%） |
| 有效 fps | 60.6 → 60.3 | 57.6 → 57.7 |

分配降幅与理论值对齐：fb2 47 台 × 60fps ≈ 2820 对象/秒 × ~70B ≈ **192 KB/s**，实测正好 −192 KB/s；
f01 平台少，实测 −105 KB/s。相机/HUD 写侧降幅由计数器直读，无需推算。

### WebGL（headless SwiftShader，10–13fps）

fb2 update 段 0.715 → **0.611ms**（−14.5%）；f01 0.410 → 0.452ms（+10%，与 r9 已判定的低帧率
抖动带一致，不作为结论）。低帧率下相机目标每帧仍在变（快照量化 + 机关运动），`camZoom` 计数仍≈帧数，
属正确行为而非回归——收敛收益只出现在 60fps 主路径。

### 为什么 HUD 写比相机写多 3 倍

每帧 `applyCam` 一次相机双写 + 每 HUD 件三次写（setScale/x/y），f01 4 件、fb2 亦 4 件，故
`setScaleW = 3 × camZoom`；本轮两条曲线一起塌，交叉验证了守卫生效点。

## 六、门禁

| 门禁 | 结果 |
| --- | --- |
| `npm run typecheck` | 0 错 |
| `npx vitest run` | 16 文件 172/172 通过（含 platformSound 5 例改标量后全绿） |
| `npm run build` | 成功（4.57s） |
| 位级确定性 `perf-determinism --compare r0-baseline` | **48/48 关逐位一致**（本轮纯客户端，符合预期） |
| 视觉复刻 `visual-diff --save visual-r12` | 容差 48 匹配率 **92.92**（历史新带 90.55–92.86 的上沿之上，未回归）；最优平移 (−1,0) 与既往一致 |
| e2e 行为层 | pause 11/11、leave 3/3、refresh 3/3（含 H2 相机解冻断言）、wonrefresh 6/6、rejoin 3/3 全 PASS |
| e2e 路线 | 隔离复跑（--port-base 3640）**2/2 ALL GREEN**：forest_01 3/3 winAt 39472/39466/39474ms（0.3.42 前基线带 39471）、forest_12 3/3 winAt 13441/13422/13437ms（前基线带 12967–13477）。**勘误入档**：首两次复跑时后台与前台 route-all 同时用默认 `--port-base 3620` 相撞，各自报"1/2 过"的假失败（各自失败的那一关正是对方占口的关卡），分口后双关全绿——route-all 并行必须显式分端口。 |
| 参考（非门禁）`fidelity-score` | 87.5/100；本轮无该口径前后基线，仅登记不判读 |

## 七、结论与挂账

- 收口面：客户端静置态的相机/HUD 强写从"每帧满写"降为"仅在 zoom 真变时写"（−85~−94%），
  T10 平台声差分的每帧对象分配按平台数线性消除（f01 −9.1%、fb2 −7.9% 分配速率）。
- 未收口 / 下一轮候选：
  1. 剩余 ~1044 KB/s 帧内分配的归属仍未逐项定名（r3 的 −97% 之后这块是新的最大单项），
     需要 heap 分配采样而不是计数器——候选为同步状态差分路径与机关平滑写入侧。
  2. 关卡推进链（换关时 `groundCache` 单槽失效导致的纹理重传、下一关数据预取）尚未量化。
  3. `setAngleW`（fb2 32 次/帧）为转臂真实旋转，非浪费，不动。
- 红线复核：Box2D vendored 内核零接触；协议/字节编码零接触；视觉与行为门禁全绿。
