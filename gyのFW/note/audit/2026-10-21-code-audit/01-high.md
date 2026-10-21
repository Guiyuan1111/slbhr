# 01 · 高危问题

> 状态：H1–H4 均待修，修复后回填 [04-fix-log.md](04-fix-log.md)。证据行号以 0.3.40 工作区为准。

## H1 暂停菜单在同一页面内只能正常关闭一次

- **证据**：`packages/client/src/scenes/overlays.ts:152` 的 `closing` 初始为 `false`；`:188` 在第一次关闭时置 `true`；`create()`（`:157-183`）不重置。
- **触发链**：第一次 P → 菜单 → 继续 → `requestClose()` 置 `closing=true` 并 `scene.stop()`。Phaser 的 `scene.stop/start` 复用同一 Scene 实例（`SceneManager.start` 只 shutdown 后重跑 `create`），字段保留。第二次 P 重新 `create()` 但 `closing` 仍为 `true`，`requestClose()` 在 `:187` 直接返回，菜单永不关闭，游戏保持暂停。
- **影响**：同一局第二次暂停即卡死，只能刷新页面。属用户可稳定触发的功能缺陷。
- **修法**：`create()`/`init()` 开头重置 `closing=false`；SHUTDOWN 复位；增加“暂停→继续→暂停→继续”的 L3 用例。
- **置信度**：高（静态读码；Phaser 场景实例复用语义已核对）。

## H2 刷新回座进入 `started` 时相机永久冻结

- **证据**：`packages/client/src/scenes/GameScene.ts:219` `camFrozen = true`；`setupCameraManager()`（`:1117-1134`）不解除冻结；`create()` 在 `:441` 把 `prevPhase` 直接设为当前 phase；只有 `:1466` 的 `ready→started` 迁移会置 `camFrozen=false`。
- **触发链**：刷新页面 → `Net.tryResume()` 等待 `client.reconnect()` → 服务端 `onLeave` 的 `allowReconnection` 已把相位恢复为 `started` → `enterGame()` 再启动 GameScene，`create()` 看到 phase 已是 `started`，没有迁移事件，`camFrozen` 永远为 `true`。滚轮/拖拽在 `:1138` 与 `:1150` 也被冻结门挡住。
- **影响**：刷新回座后画面固定在整图最小缩放，不能跟随角色、不能缩放/拖拽；游戏仍可操作，但基本不可玩。
- **修法**：`init()` 先复位相机冻结；`create()` 完成相机初始化后，若当前 phase 为 `started` 则显式解冻并执行一次目标更新。
- **置信度**：高（静态路径明确；审计时未做浏览器复现）。

## H3 主动“返回菜单”被当成断线，7 秒重连后弹错误横幅

- **证据**：`packages/client/src/net.ts:160` 只把关闭码 `1000` 当作主动离开；Colyseus 主动离开使用 **4000**（`node_modules/@colyseus/core/build/Protocol.js:38` `WS_CLOSE_CONSENTED = 4000`），服务端收到 `LEAVE_ROOM` 后以 4000 关闭（`Room.js:778-785`）。
- **触发链**：`leaveToMenu()` 调 `net.leave()` 后把模块变量 `net=null`，但旧 Net 实例的 `onLeave` 回调仍存活 → 走 `net.ts:173-191` 的 4 次退避（约 7s）→ `onDisconnect(false)` → `main.ts:449-456` 设置“连接已断开，请刷新页面重新加入”横幅并写错误文本。
- **影响**：每次正常返回菜单都会先显示“正在重连”，随后留下断线错误横幅；用户会误以为掉线。
- **修法**：把 4000 与 1000 都视为 consented；`leave()` 置 `leaving` 标志并在 `onLeave` 首行直接返回；同时清理恢复令牌。
- **置信度**：高（读码 + 依赖源码确认）。

## H4 选关树烘焙结果无上限缓存，内存随星级变化持续增长

- **证据**：`packages/client/src/scenes/templeTreeBake.ts:272-277` 的 `results` 是模块级 `Map`，`cacheKey` 包含全部 48 关的星级状态；`:376` 只写入、从不删除。每个结果含 3 张 `canvasW×canvasH` 画布；按 1280×960 视口计算约 1036×864×4×3 ≈ 10.7MB。
- **触发链**：玩家每改变一次星级并重进选关树，就会生成一个新 key；旧 key 的 3 张画布永久保留。48 关逐星推进可累积数十到上百个 key，内存可达数百 MB 甚至 GB。
- **附加问题**：`:289-313` 在 `startTreeBake()` 内同步执行 3 次 `drawLayerContent`、3 次 `getImageData` 和 3 次 SAT 构建，真正的分帧只覆盖 bevel/outline；选关树首入仍会有主线程卡顿。
- **影响**：长会话内存泄漏；低内存设备可能崩溃或触发浏览器回收卡顿。
- **修法**：缓存改 LRU（1–2 个 key）并在淘汰时释放 canvas；把预处理拆成分片任务并设每帧预算。
- **置信度**：高（缓存无淘汰确定；内存量按代码常量估算）。
