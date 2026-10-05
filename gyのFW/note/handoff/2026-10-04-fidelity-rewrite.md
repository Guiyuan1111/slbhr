# 2026-10-04 保真重写开工交接（分支 feat/fidelity-rewrite）

> 本篇是"复刻保真重写"执行阶段的**开工交接**：需求冻结记录、本会话已完成的工作、Box2D 提取的最新实证与下一步精确操作。
> 阅读顺序建议：本篇 → `../research/2026-10-fidelity/00-overview.md`（调研总览/接续指南）→ 按需查 01–04 分册。
> 上游纠偏记录见 `../handoff.md` 末尾"2026-10-04 使命调整与调研纠偏"。

## 0. 三行状态

1. **需求已冻结、已开工**：分支 `feat/fidelity-rewrite` 已建（基点 main@3efbf42），工作区干净，尚无代码提交。
2. **物理内核提取完成前置侦察**：Box2D 在原版 `init.js` 中的真实形态已查明（见 §4，与旧假设不同，有字节偏移证据）。
3. **本机原本没有 Node**：已装便携版 v22.15.0 到 `TEMP/node/`（TEMP 已在 .gitignore）；`npm run build`/`start.bat` 只有在把它加入 PATH 后才能跑。

## 1. 使命与冻结需求（用户原话要点，不得再问）

用户唯一目的（原话要义）：**开发可以线上联机的森林冰火人；当前阶段拆分=先忠实复刻原版**；前任 AI 写的复刻代码"不一定好"，**授予重构/重写之权**。要求三轮以上细致提问后**坚决执行、禁止再询问、禁止随意停止**。三轮提问已完成，用户全选推荐项，冻结如下：

- **物理内核**：从原版 `init.js` 里**提取 box2d.js 原样复用**作为服务端权威仿真（不引入 planck、不自写 AABB 物理）。
- **范围**：重写 `packages/shared`（全机制数据驱动关卡解析 + box2d 封装 + 机关类 + 角色力模型）→ 改造 `packages/server`（新内核接入 + 机关状态进快照）→ client 只做接线修复（保留已验证渲染管线）。
- **素材接线**：游戏内表现批次优先（rising 帧、stairs 动画、lever/pusher 状态灯、水声、教学渐显、删臆造浮尘、Navy0000、银钻计数、取关路径统一）。
- **验收**：数值对拍——原版页面本地插桩采金轨迹（forest_01 全段 + 每类机关一个专项场景），新内核吃相同输入序列差分；手感终验=用户实玩。
- **不含**：关卡传送门/存档、触屏适配（本轮不做）。
- **溢出优先级**：保真闭环 ＞ 解锁关数 ＞ 素材接线。
- **完成后**：合 main + tag 0.3.0 + `note/release/0.3.0.md`；期间细粒度 commit；联机在内核切换期间暂时不可玩可接受。

## 2. 禁改区与合规红线（用户确认，永久生效）

- `Fireboy-and-Watergirl/`（参考库）**永久只读**：对拍只观察、不注入、不修改任何文件。
- 仓库保持 **private**；官方素材仅限私人 2 人联机使用，不分发、不公开、不商用。
- **不动 8099 魔改版**，不得把它当金标准（其中 `multiplayer.js`、GameConfig 头、作弊钩都是注入物，不是原版）。
- 全局规则（`C:\Users\gy\.zcode\AGENTS.md`）：禁止编造；**模型为文字模型，禁止读取图片**（所以验收只能数值/状态差分，不能看截图）；commit 严禁 co-author；bat 必须 GBK+CRLF 无 chcp；临时物一律放项目 `TEMP/` 且用完清理；引用附完整链接；每版本写 `note/release/<版本号>.md`。

## 3. 本会话已完成的工作

### 3.1 代码现状盘点（为改造定位，均已读）

| 文件 | 要点 |
|---|---|
| `packages/shared/src/params.ts` | 现 P 常量全是自造近似值（jumpVel −496、moveSpeed 272…），重写时按 research/01 的原版常数替换 |
| `packages/shared/src/world.ts` | 自写 AABB 运动学 `World.step(dt)`。**保留这个公共 API 形状**（players/diamonds/platforms/levers/plates/box/phase/timerMs/events），内部换成 box2d；server 依赖它 |
| `packages/shared/src/level.ts` | `parseLevel(id,json,getTileset)`；LIQUID_TILE={5,6,7} 正确勿动；SOLID_TYPES 把斜坡 1/2 当实心是错的（原版 1/2 是 45°斜面）；缺 Objects tileset 会 throw——forest_03/06/12 系共 7 关解析崩溃的根因之一；startPos 读 object props 是死逻辑（原版运行时合并 tileset 默认值） |
| `packages/shared/src/types.ts` | Role/InputState/Anim/WorldEvent 事件联合，扩展机关事件时从这里 |
| `packages/server/src/rooms/state.ts` | Colyseus schema，字段必须 constructor 赋值（defineTypes + useDefineForClassFields:false 坑已注释说明）；**缺 lever/plate/门/多箱/ball/wind 状态字段**（审计 E13） |
| `packages/server/src/rooms/ForestRoom.ts` | 2 人房/密码/角色先到先得/60Hz 累加器(≤6步)/断线冻结 60s；phase 直接 playing（原版有延时计时，E15）；restart=整关重开语义已对 |
| `packages/server/src/levels.ts` | LEVEL_DIRS=["data/forest/levels","data/tutorials/levels"]，与 client main.ts 的硬编码 tutorials 路径不一致（E16 之一） |
| `start.bat` | build→tsx 起服；因本机无 Node 现已不可用，需 PATH 含 TEMP\node 或用户装系统 Node |

### 3.2 运行环境

- **Node 缺失 → 便携版已装**：下载源 `https://cdn.npmmirror.com/binaries/node/v22.15.0/node-v22.15.0-win-x64.zip`，解压至 `gyのFW\TEMP\node\`（node.exe 同目录含 npm.cmd）。**用法**：需要 node/npm/npx/tsx/vitest 时先 `set "PATH=<仓库绝对路径>\TEMP\node;%PATH%"`（cmd 每条命令独立 shell，PATH 不跨命令保留）。`node_modules/` 是老环境遗留，esbuild/tsx 原生二进制经 `node -v` 冒烟前建议先跑一次 `npm run build` 验证兼容性。
- git 不在 PATH：`set "PATH=%PATH%;%ProgramFiles%\Git\cmd"` 后调用（同上不持久）。
- 中文 commit 信息：写 UTF-8 消息文件到 `%TEMP%\fwmsg*.txt`，`git commit -F`；单行内联 `set VAR + %VAR%` 有解析期展开坑，勿在一行里混用。

### 3.3 提取侦察脚本

`TEMP/scan-modules.mjs`（define 边界扫描）与 `TEMP/probe-box2d-range.mjs`（盒区间/签名探针）已存在、可复跑（TEMP 已 gitignore，不入库；收尾时按规则清理）。

## 4. Box2D 提取——最新实证（重要，推翻旧假设）与下一步

**证据文件**：`Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js`（2,273,196 字节，字符串未混淆；以下 @ 均为字节偏移，latin1 读取计数，稳定可复验）。

### 4.1 本会话实测结论

- `define(` 正则扫出 105 个"命名模块"，其中 `goog.LOCALE@1133390 / goog.TRUSTED_SITE@1133426 / goog.STRICT_MODE_COMPATIBLE@1133466 / goog.ENABLE_DEBUG_LOADER@1134969 / goog.defineClass.SEAL_CLASS_INSTANCES@1145565` 是**假阳性**——它们匹配到的是 Closure 编译器自己的 `define()` 调用，不是 requirejs 模块。
- **Box2D 引擎的真实形态**：`goog.defineClass.SEAL_CLASS_INSTANCES` 这个"条目"实际是一个 **509,080 字节的 Google Closure 编译产物大 bundle**，@1,145,565 → 至 box2d 适配器前。引擎类签名首现：`b2Vec2@1,151,323`（count 876）、`CreateJoint@1,200,682`(35)、`b2World@1,282,891`(170)、`b2Body@1,408,691`(310)、`b2Fixture@1,439,310`(121)——全部落在这 509KB bundle 内。即：**引擎=Closure 预lude(@1,133,390 起 goog.LOCALE 等) + goog base + 编译后的 Box2DJS 全量**，不是多个独立 requirejs 模块。
- **适配器**：`define("box2d", …)` 真 requirejs 模块 @1,654,645，仅 411 字节，止于 @1,655,056；下一模块 `States/Level/Devices/BackgroundCover@1,655,056` 起点严丝合缝。**切片终点=1,655,056**；**起点≈1,133,390**（往回看数百字节确认上一个真 requirejs 模块 `States/Menu/...` 或 Phaser shim 的收尾位置即可定死）。
- 匿名 `define(` 计数=0：不存在匿名 define 干扰。
- 遗留小异象：字符串 `Box2D` 首现 @880,909，在 PIXI 区段(305,652–1,112,078)内部，未解释——大概率是 PIXI 里某调试注释/无关文本，提取切片不用管，但如果后续对拍发现异常可回查。

### 4.2 给下一个执行者（AI）的精确步骤

1. **先打印适配器全文**：`src.substr(1654645, 411)`——它定义引擎如何导出（返回值/全局注册），决定 shim 怎么写。
2. **定死切片**：从 @1,133,390 往前回看 ~2KB 找前一真模块收尾；切片 = [起点, 1,655,056)。落盘 `TEMP/box2d-bundle.js`。
3. **Node 求值冒烟**（写 `TEMP/box2d-smoke.mjs`）：`window=globalThis`、requirejs-lite `define` 注册表（识别命名 define 数组依赖并注入）、执行切片。断言：`b2World`/`b2Body`/`b2PolygonShape`/`b2RevoluteJoint` 等类可得；自由落体 ½gt²（用 31.25 m/s²）；ptm=32 换算；jumpVelocity 15.5 m/s 理论顶点 ≈123px 数量级。原版是 Box2DJS/Isaac Burns 端口（≈Box2DFlash 2.1a 语义），**不是 planck**。
4. **vendor 入库**：冒烟通过后原样放入 `packages/shared/vendor/`（或 server 侧，内核归属服务端；选一并写进 release 文档），附 README 说明来源字节区间与"永久只读参考库提取，禁分发"。
5. **Phaser.Physics.Box2D 插件层不提取**（依赖 Phaser 命名空间）：对照 research/01 的用法常数（step 迭代 vel8/pos3、`step=min(0.04,elapsed)`、力模型 jumpImpulse=1/runForce=50/floatForce=30/maxSpeed 8.5/absMax 40/feetFriction 0.5/r1 0.48/r2 0.2/dr 0.03/y1 0.2/y2 −0.9、prohibitJump 边沿跳、n.y>0.65 全额跳、platform 运行时电机 ±2m/s=64px/s、pusher 行程 0.7m/触发位移>0.2m/回弹 motorSpeed −15、lever ±0.2π/±4×onis/过零翻转/组 OR 同步、liquid 每行对象+0.18m 入水致命+下半格实体+8/9 封盖、door 64×8 感应带+25fps21 帧开门+双 isUp→stairs+1600ms、diamond 0.7m 感应±5px2s 浮动），在 shared 里用**显式 1/32 m↔px 适配器**直接驱动裸 b2 类。屏幕坐标= (−32·b2x, −32·b2y)。

### 4.3 金轨迹对拍（提取完成后的下一里程碑，未开工）

- 本地起静态服服务 `output/A`（自选端口，**勿用 8099/2567**），browser-use 技能（`control-browser`，插件根 `C:\Users\gy\.zcode\cli\plugins\cache\zcode-plugins-official\browser-use\0.5.1\`）驱动。
- 页面 `page.route` 拦截媒体防 IDM 劫持；console 被隐藏 iframe 坑掉时用回注技巧；游戏实例从 requirejs registry 里摸；对 `world.step` 后 body transform 采样；`KeyboardEvents` 注入确定性输入；先做**确定性复验**（同输入两次采样一致才可信）。平台速度 64px/s 与跳跃顶点要实测钉死。

## 5. 重写蓝图（todo 快照，按依赖排序）

1. ✅ 三轮提问、需求冻结（见 §1）。
2. ✅ 读现有 shared/server 代码（§3.1；client 的 GameScene/BootScene/main.ts/net/input **尚未读**，接线批次前补）。
3. 🔄 box2d 提取+冒烟+vendor（侦察完成，执行步骤见 §4.2）。
4. ⏸ 原版插桩金轨迹采集（§4.3）。
5. ⏸ 重写 shared：level.ts 全机制数据驱动（firstgid 逐关：Objects 23/24/16 因关而异；斜面对象化；7 个解析崩溃关修复）+ box2d 封装 + 机关类全谱（platform/pusher/leverA/B/box/boxheavy/wind/ball/pulley/hanging/roman/window/silver，forest 需求矩阵见 research/01）+ 角色力模型 + 死亡整关重开 + 门扫帧 + 延时计时。
6. ⏸ shared 单测（vitest）+ 对拍差分全绿。
7. ⏸ server：state.ts 扩机关状态（修 E13）、ForestRoom 接新内核、levels.ts 与 client 取关路径统一（修 E16）。
8. ⏸ client 接线批次（§1 素材清单）。
9. ⏸ 双浏览器联机复验 + note 纠偏更新 + TEMP 清理。
10. ⏸ 合 main + tag 0.3.0 + `note/release/0.3.0.md`。

## 6. 易踩坑清单（本会话实证）

- cmd：`set "X=…" && "%X%"` 同行展开为字面 `%X%`，永远用完整绝对路径或分两条命令。
- 工作目录会漂：所有 Bash 命令用绝对路径。
- `gyのFW` 中文路径在 cmd 引号下无恙，可直接用。
- Bash 无 node/npm/git 默认 PATH，参照 §3.2 先注入。
- Colyseus schema 字段赋值必须写在 constructor（原生 class fields 绕过 setter 拦截 → encode 崩）。
- 参考库内 `init.js` 的美化行号（`init.js:NNNNN`）只在旧调研文档语境成立，**字节偏移 @ 才是稳定证据**；文档规范沿用 research/00 §约定。

## 7. 本会话 git 状态

- 分支 `feat/fidelity-rewrite`（未提交新内容前= main 的 6 个 docs commit：a8e2a15…3efbf42，均无 co-author）。
- 本篇与 handoff.md 指针更新作为本分支第一个 commit。

## 8. 2026-10-05 追加：机关金轨迹专项（0.3.4）

- 三轮问答冻结（自检范围/修复边界/发版策略等 9 项）后执行机关专项：
  wind 位置公式修复（bb71f0f）、滑轮锚点方向修复（5290ec4）、角色 fixture 序对齐（e4081fb）。
- 取证全录：`note/research/2026-10-fidelity/08-pulley-forensics.md`（金轨迹解码纠偏、
  终点三体吻合、亚像素混沌定性、已试方案裁决表）。
- 发版：`note/release/0.3.4.md`；对拍全家桶口径见 research/08 表格。
- 待办移交：forest_01 fb 0.17m 瞬态为 HEAD 既有回归（先于本次改动，疑与 diff-kernel
  同帧多事件表或 bb71f0f 相关），行为一致级、不阻塞发布，留待下轮排查。

## 9. 2026-10-06 追加：复刻度量化基准 + 保真四轮（0.3.5）

- 新增 `benchmark/`（fidelity-score.mjs：综合复刻度指数 0-100、--save/--compare 快照对比）。
- R1：金轨迹 f0 相位破译（=起跑后第 5 帧，双角色 dy=3.45px 实证），diff-kernel/benchmark settle 60→5。
- R2：Wind 阻尼×0.975/帧 + 15m/s 限速补齐（1f22a99），forest_03 综合 76.4→85.9。
- R3/R4：行走/限速模型逐行核验忠实；残余偏差（bonus_2 坍缩链、forest_04 滑轮瞬态、
  forest_07 球级联、forest_01 fb 0.17m、风 sin 相位）定性为接触序敏感亚像素混沌。
- 报告：`note/report/perf/2026-10-06-fidelity-benchmark.md`；快照：benchmark/results/。
- 综合复刻度：82.55（v0.3.4）→ 84.57（0.3.5）。

## 10. 2026-10-06 追加二：机关参数审计轮（0.3.6）

- R5：buildBall 逐字节审计通过；R6：pusher 三处失配修复（密度 0.03/电机力 7/T 形底唇）。
- **方法论存档**：lever 的 bundle 静态解读方案实测偏 2.54px、金轨迹验证旧形制 0.0000 全对——
  金轨迹实证 > bundle 静态解读（resSprite/enable 装载链有未建模等效性），已回退并存档。
- 快照 r6-final=84.53（bonus_2 级联重掷噪声级）；报告 §七/§八。
