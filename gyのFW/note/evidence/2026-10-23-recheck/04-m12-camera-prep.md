# 04 · M12 挂账：GameScene 相机子系统拆分草案（CameraRig）——开发前置

- 日期：2026-10-23
- 执行槽：D 槽（预处理备料；未接线，未做任何路线/可达性裁决）
- 来源挂账：`note/audit/2026-10-21-code-audit/02-medium.md` M12（GameScene 过度集中，0.3.42 已拆 mechSmoothing / snapshotValidation / platformSound，相机子系统为剩余挂账之一）
- 基线：`packages/client/src/scenes/GameScene.ts` @ commit `24662a9`（2102 行）；下文 :NNN 均指该文件行号，接线前若 GameScene 有新提交须重对行号
- 纪律：逐行等价、不接线、可独立单测；本次**未修改 GameScene.ts 及任何既有文件**，仅新增三个文件

## 0. 产出物

| 文件 | 行数 | 说明 |
|---|---|---|
| `packages/client/src/scenes/cameraRig.ts` | 337 | CameraRig 纯状态机草案（不 import Phaser，引擎依赖全注入） |
| `packages/client/src/__tests__/cameraRig.test.ts` | 462 | 17 例单测（vitest 全绿） |
| `note/evidence/2026-10-23-recheck/04-m12-camera-prep.md` | 本档 | 映射表 + 覆盖清单 + 接线建议 |

验证门禁（本机实跑）：
- `npx vitest run packages/client/src/__tests__/cameraRig.test.ts` → **17/17 绿**
- `npx tsc --noEmit -p tsconfig.json` → **0 错**（新文件已入 tsc include）
- `npx vitest run` 全仓 → **17 文件 / 189 用例全绿**（无并发干扰）

## 1. GameScene 行号 → CameraRig 成员映射表

### 1.1 字段（GameScene :213-240 相机管理段）

| GameScene 行号 | 原语义 | CameraRig 成员 | 备注 |
|---|---|---|---|
| :43 `PAD` | 关卡四周留白 32px | cameraRig.ts 模块常量 `PAD` | 同值副本；接线时二选一去重 |
| :60-62 `TILES_DESKTOP/TILES_SMALL` | 最小可视 40×30 / 20×15 格 | 模块常量（同值副本） | mpx=32 保持字面量同源 |
| :218 `camMinScale` | 0.9 比例标定 | `camMinScale` | `setupForLevel` 重算 |
| :219 `camLockScale` | 0.97 比例标定 | `camLockScale` | 同上 |
| :220 `camMaxScale=1.5` | 缩放上界 | `camMaxScale` | |
| :221 `camUserScale` | 捏合覆盖态 | `camUserScale` | pointerup lockAtMinScale 回弹 |
| :222 `camWheelScale` | 滚轮覆盖态 | `camWheelScale` | 1s debounce 回弹 |
| :223 `camUserCenter` | 拖拽世界中心 | `camUserCenter` | pointerup 立即复位 |
| :224 `camWheelReset` | 回弹句柄（window） | `camWheelReset` | 句柄语义经 `RigTimers` 注入 |
| :225 `camFrozen` | 冻结门（初值 true） | `camFrozen`（公开可读写） | 解冻赋值点留 GameScene（见 1.3） |
| :226-228 `camX/camY/camScale` | 弹簧现值 | 同名字段（公开） | HUD 反缩放读 `camScale` |
| :229-231 `camTX/camTY/camTScale` | 弹簧目标 | 同名字段 | |
| :232-234 `camVX/camVY/camVScale` | 弹簧速度 | 同名字段 | |
| :235-238 `camLastX/Y/Scale` | r3 脏守卫（NaN 起步） | 同名字段 | `applyIfDirty` 语义关键 |
| :239 `pinchState` | 捏合锚 `{startDist,startScale}` | `pinchState` | |
| :240 `panState` | 拖拽锚 `{cx,cy,px,py}` | `panState` | |

### 1.2 方法

| GameScene 行号 | 原方法 | CameraRig 成员 | 等价性要点 |
|---|---|---|---|
| :370-387（`init()` 末段） | H2 相机临时态复位（c7dc51b） | `resetTransient()` | 逐字段一致（13 项）；**不碰**位姿三值 camX/camY/camScale/camTX/camTY/camTScale；camLast 三值回 NaN |
| :1157-1174 `setupCameraManager` | 标定+初值+注册监听 | `setupForLevel(level, rw, rh): CamApply` | 覆盖 :1160-1169（minScale/lockScale 标定 + 钉关卡中心 minScale）与 :1170 `applyCam(true)` 的守卫半；**监听注册 :1171-1173 留 GameScene** |
| :1176-1186 `onCamWheel` | 滚轮 ×0.8/×1.2 钳位 + debounce | `onCamWheel(dy, camZoom)` | `camZoom` 参数注入替代 `this.cameras.main.zoom`（:1179）；`window.setTimeout/clearTimeout` → `RigTimers` |
| :1188-1210 `onCamPointerMove` | 双指捏合 / 单指拖拽 | `onCamPointerMove(p, env)` | `Phaser.Math.Distance.Between`（:1194）内联同式 `Math.sqrt(dx*dx+dy*dy)`（已核 phaser src/math/distance/DistanceBetween.js）；pointer1/2、zoom 经 `RigPointerEnv` 注入；threshold 10（:1205）保留 |
| :1212-1220 `onCamPointerUp` | 回弹 + 手势态清空 | `onCamPointerUp()` | **无冻结门**（与原实现一致） |
| :1222-1265 `updateCamTarget` | 每帧目标适配 + checkBounds | `updateCamTarget(level, fb, wg, rw, rh, desktop)` | `pFb/pWg` 快照以 `{x,y}|null` 传入（Number(x)\|\|0 容错保留）；`sys.game.device.os.desktop` 参数化；**本方法无冻结门**（调用位 :1502 挡，接线保持同构） |
| :1267-1277 `animateCam` | 弹簧步进 a=1/15·1/3，阻尼 0.5 | `animateCam(): CamApply` | 等价 :1276 `applyCam(true)`：步进后记 last 并返回三元组 |
| :1279-1307 `applyCam` | 脏守卫 + 引擎写 + HUD 反缩放 | `applyForced()` / `applyIfDirty()` | 仅 :1283-1286 守卫半入 rig；**:1287-1306 引擎写（setZoom/centerOn + HUD 补偿循环）留 GameScene** |
| :1309-1325 `resetCamera` | 整轮复位回冻结全图 | `resetForLevel(level): CamApply \| null` | 末尾 `applyCam()` 为**非强制**：三值与 last 全等返回 null（跳引擎写），与 r3 脏守卫原语义一致 |

### 1.3 留在 GameScene 的调用位（rig 只提供 camFrozen 读写）

| GameScene 行号 | 原代码 | 接线形态 |
|---|---|---|
| :482（`create()` 末尾） | `if (this.prevPhase === "started") this.camFrozen = false` | `this.rig.camFrozen = false`（H2 刷新回座解冻） |
| :1501-1505（`update()`） | `if (!this.camFrozen) { updateCamTarget(); animateCam(); }` | `if (!this.rig.camFrozen) { rig.updateCamTarget(...); 引擎写(rig.animateCam()) }` |
| :1514（`onPhaseChanged`） | `if (cur === "started") this.camFrozen = false`（原版 camFreeze=@1943673） | `this.rig.camFrozen = false` |
| :1545（`resetRound`） | `this.resetCamera(this.d.level)` | `const ap = this.rig.resetForLevel(this.d.level); if (ap) 引擎写` |
| :1445（`buildHud` 末尾） | `this.applyCam(true)` | 残壳 applyCam 走 `rig.applyForced()` |

## 2. 已覆盖 / 未覆盖清单

### 2.1 单测已覆盖（17 例，cameraRig.test.ts）

- **复位语义逐字段（H2 等价）**：`resetTransient` 13 字段逐一断言（frozen=true、userScale/wheelScale/userCenter=null、回弹句柄取消、pinch/pan=null、三速度=0、last 三值=NaN）+ **不碰位姿三值**哨兵断言；`resetForLevel` 脏支（返回三元组）/净支（返回 null）两支 + 全字段复位断言
- **冻结门挡三类输入**：frozen 下滚轮（不改 wheelScale、不挂句柄）/ 捏合（不改 userScale、不建 pinchState）/ 拖拽（不改 userCenter、不建 panState）全被挡；解冻后同一批调用生效（证明门即 camFrozen 本体）；pointerUp 无门（冻结期同样清手势态）
- **惯性衰减收敛到零**：a=1/15 千帧步进后 |camV*|<1e-12、位置误差<1e-10（比初差 1344 收敛 12 个数量级；阈值在 double 噪声底 ~9e-14 之上）；a=1/3 快档首步速度恰为自动档 5 倍（a 比 (1/3)/(1/15)=5）
- **缩放夹取边界**：滚轮 ×0.8/×1.2 上下夹（10→1.5、0.01→minScale、1.4→1.5、1.0 域内）；捏合 ×距离比上下夹（×10→1.5、×0.005→minScale）+ startScale 锚定不随 zoom 漂移 + startDist=0 守卫；滚轮 1s 回弹两支（≤lockScale 锁 lockScale / >lockScale 复位）+ debounce 重挂；pointerup lockAtMinScale 三支（=/</>）；wheel>user 覆盖优先级
- **附加**：`setupForLevel` 标定与初始三元组（656,496,minScale）；checkBounds 居中支无视焦点 / 钳制支边界三例；窄屏 tiles 降档（600×480 small、780≤rw small）；fb/wg 缺一早退；脏守卫 NaN 起步与同值跳过；H2 全链路演练（init 复位 → create 标定顺序）

### 2.2 未覆盖 / 留在 GameScene（接线时人工对账）

- **Phaser camera 对象操作段**（applyCam :1287-1306）：`cam.setZoom/cam.centerOn` 与 HUD 反缩放循环（`hudItems` 1/zoom 补偿）——引擎写，不入 rig；rig 以返回三元组交付
- **输入监听注册**（:1171-1173）：`this.input.on("wheel"/"pointermove"/"pointerup")` 三行与回调适配（zoom/pointer1/2 注入点）
- **冻结门调用位与解冻赋值点**（:482/:1502/:1514/:1545/:1445）：调用侧代码，见 1.3
- **`windowTimers` 缺省实现路径**：依赖 `window`，node 单测不可达（单测走 FakeTimers 注入）；接线后在浏览器侧由既有行为兜底（与现行 window.setTimeout 逐字同源）
- **原版 cursors.active 闸**（:1153 注）：本复刻有意无此闸（触屏键为 DOM 按钮），不在 rig 也不补
- **相机轨迹数值基线**（38 号档 F2 44/48 关、39 号档 §3.3 settled scroll(16,16) 口径）：属 det 级验收，接线后才可跑，本次不涉及

## 3. 后续接线步骤建议（本次不接）

1. `GameScene.ts` 引入 `import { CameraRig } from "./cameraRig"`，新增 `private readonly rig = new CameraRig()`（timers 缺省 window 实现，行为与现行 window.setTimeout 一致）
2. 删除 :218-240 相机段 22 个字段，读写改经 `this.rig.*`（字段同名，机械替换；`camScale`/`camFrozen` 为公开可读写，其余建议只走方法）
3. 方法替换（按 1.2 映射）：`init()` :370-387 → `rig.resetTransient()`；`setupCameraManager` 状态半 → `rig.setupForLevel` + 引擎写半（setZoom/centerOn）；三个 onCam* 私有方法删除（回调内联注入）；`updateCamTarget`/`animateCam` 删除改调 rig；`applyCam` 收敛为残壳（`force ? rig.applyForced() : rig.applyIfDirty()` → 非 null 落引擎 + HUD 补偿）；`resetCamera` → `rig.resetForLevel`
4. `PAD`/`TILES_*` 常量去重：导出 rig 模块常量或保留 GameScene 侧（二选一，防双份漂移）
5. 门禁：tsc 0 → vitest 全绿（含 cameraRig 17 例）→ 相机轨迹 det 基线（38/39 号档口径）不回归 → 事后在 02-medium.md M12 挂账节回写"相机子系统已拆"并更新 GameScene 行数
6. 风险提示：`updateCamTarget` 的 `pFb/pWg` 传参类型为 `{x,y}|null`，快照对象结构满足即可，无需新建 DTO；`rig.camWheelReset` 类型为 `number`（浏览器句柄），若未来换 Node 计时器需连同 `RigTimers` 接口一起调整

## 4. 存疑待核

- 无数据缺陷类存疑。一处口径提示：`onCamWheel` 对 `dy===0` 走 ×1.2 支（`dy > 0 ? 0.8 : 1.2`，:1179 原样保留）——与原实现逐字一致，非缺陷，接线后若有滚轮轨迹异常可回看此分支。
- 映射行号以 `24662a9` 的 GameScene.ts（2102 行）为准；接线前 GameScene 若有新提交，行号需按本档相对结构重新定位（方法名与字段名锚点不变）。
