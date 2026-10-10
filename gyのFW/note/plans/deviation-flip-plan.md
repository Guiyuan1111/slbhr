# 冻结偏离翻转计划（deviation-flip-plan）

> 2026-10-11 · 只读研究产出（本轮未改任何代码）。
> **〔2026-10-11 结案〕确认区 8 条全部翻转落地**：F1 c6cf4b2 / F2 6afcafc / F3 d7f52df /
> F4 8594887 / F5 3f0dbc2 / F6 835c1e7 / F7 f29c7ba / F8 c229acf。各条目下的
> 「测试/文档影响」已逐条兑现（e2e 场景重写、det r28 位级裁决、fidelity 裁决、
> research/11 §2C 勘误等），验收明细见 note/handoff.md 顶部 M2 条目。
> 使命：用户已决定——**所有「复刻自造、且已被研究证明原版不存在或语义不同」的冻结偏离，全部翻转为原版语义**。
> 本档把散落在 wiring §13、research/10 §联机特有偏离、research/02 E/G/M、research/11、release/0.3.0 §已知偏离 中的偏离记录逐条核对到**当前代码**，区分：
> - **确认区**：证据充分（文档+代码双源），当前代码仍为复刻语义，需施工翻转（8 条）；
> - **已核销区**：文档曾列为冻结偏离，代码已翻转完毕，仅注释/文档残留（12 条，无需施工，附注释清理项）；
> - **待核实区**：找不到充分证据或需进一步取证/用户裁决，禁止凭印象施工（9 条）；
> - **范围外（架构豁免）**：与「服务端权威联机」冻结架构互斥、0.3.0 已裁定的项，翻转=推翻架构，不在本计划范围（3 条）。
>
> 证据引用约定：`文件:行号` 为仓库当前代码；`research/NN §X` 指 `note/research/2026-10-fidelity/` 下档案；`init.js:NNNNN` 为原版 js-beautify 美化版行号（research/00 §约定，需与字节偏移交叉定位）；`@N` 为 init.eb02fbdab2aa1d24.js 字节偏移。

---

## 一、确认区（需施工翻转，共 8 条）

### F1. 输入双键组通吃 → 原版按角色分键

- **一句话**：本机方向键与 WASD 两组键都能控制本机角色；原版按角色固定键组（CharCursors）。
- **当前复刻语义**：`packages/client/src/input.ts:8`（头注释自认「两组键通吃本机角色（E16，冻结偏离）」）、`input.ts:12-14`（`LEFT/RIGHT/UP` 同时收 Arrow* 与 KeyA/D/W）。
- **原版语义**：按角色分键——水女孩 WASD、火人方向键（research/02 E16：`init.js:42786-42788` CharCursors）；单机同屏模式另有 CursorToggle 切换（research/02 E16、research/10 中感知 #5）。联机特有偏离清单亦点名此项（research/10 §联机特有偏离）。
- **改动点**：
  - `packages/client/src/input.ts`：`KeyboardInput` 增加本机角色入参（main.ts 建 KeyboardInput 处传入 `myRole`），`emit()` 按角色只认本角色键组（fb=Arrow*，wg=KeyA/D/W）；触屏虚拟键（`setVirtual`，input.ts:72-76）保持角色无关（原版触屏三键即本机通用键，research/02 E16；键与角色的绑定细节见待核实 h）。
  - `packages/client/src/main.ts`（KeyboardInput 构造处）、`packages/client/index.html` 操作说明文案同步。
- **测试/文档影响**：e2e 输入时间线按键名注入——`scripts/e2e/inputs/walkin-doors.json` 用 ArrowRight（fb 线）+ `KeyD`（wg 线），与原版分键天然兼容，但须核验 regression.mjs 双浏览器角色分配与键组的对应关系（若 browser1 不是 fireboy 则该脚本全红）；`scripts/e2e/movements.json` 纯方向键，须确认执行端为 fireboy。`scripts/baseline/diff-kernel.mjs:49` 注释「方向键=火人、WASD=水女孩」已按原版键名口径，翻转后产品与工具口径一致（受益）。单测不受影响（内核层无键概念）。
- **forest_01 路线影响**：否（纯客户端输入映射，不改物理）。
- **风险**：低-中。主要风险在 e2e 角色分配与触屏兼容。

### F2. 死亡后 2.5s 自动整关重开 → 原版 GameOverMenu 静置等玩家点 Retry

- **一句话**：任一人死后房间 2.5 秒自动重开；原版死亡弹 GameOverMenu 后静置，仅玩家点 Retry 才整关重载。
- **当前复刻语义**：`packages/server/src/rooms/ForestRoom.ts:32`（`AUTO_RESTART_MS = 2500`，注释自认「偏离已记录」）、`ForestRoom.ts:308-311`（gameover 事件挂 setTimeout 自动 `restartLevel`）；`packages/client/src/main.ts:112`（HUD 文案「整关即将重开（按 R 立即重开）」）。wiring §13 #3 冻结记录；research/10 §联机特有偏离「gameover 2.5s 自动重开（原版静置等点击）」。
- **原版语义**：`checkEndGame` 任一 `isDead` → `gameOver()`（research/02 E1：`init.js:45070-45075`）→ GameOverMenu，Retry 点击才 `retry` 重载整关（research/02 E1：`init.js:45154-45156`）；无任何自动重开路径。
- **改动点**：
  - `packages/server/src/rooms/ForestRoom.ts:308-311`：删自动重开 timer（`restartTimer` 字段与清理逻辑一并删）；保留 `onMessage("restart")`（ForestRoom.ts:100-105，gameover/won 受理任意端 Retry——联机化映射，见待核实 i）。
  - `packages/client/src/main.ts:112` HUD 文案改「点『再试一次』重开」；GameOverMenu（`packages/client/src/scenes/overlays.ts:157-164`）已具备 Retry 钮，无需改。
- **测试/文档影响**：e2e 行为冒烟 `scripts/e2e/movements.json` 链路含「液体致死→自动重开」（0.3.0 DoD、handoff.md 0.3.23 条目 88f3410 描述），翻转后 gameover 不再自动回 started——该冒烟断言须改为「致死→gameover→显式 restart→started」；self-acceptance.md §三场景表对应行更新；`note/release/` 下一版本记录本翻转。
- **forest_01 路线影响**：否（不改物理，只改死亡后流程相位机）。
- **风险**：中。e2e/旅程用例联动改；联机体验上「静置等点击」需双端都有 Retry 入口（已有）。

### F3. 本机暂停=本地停手、服务端继续 → 原版 P 键全场物理冻结

- **一句话**：P 键只让本机停手、房间照跑；原版 togglePause 是 `game.paused` 全场物理冻结+时钟暂停。
- **当前复刻语义**：`packages/client/src/main.ts:340-345`（`togglePause` 注释「本地停手，服务端继续」）、`input.ts:57-66`（`setPaused` 只闸本机上报）；`overlays.ts:4` 注释「pause 为本地停手，服务端继续——联机对齐 AFK 语义」。research/10 §联机特有偏离「本机暂停=服务端继续（原版=物理冻结）」。
- **原版语义**：P 键翻转 `game.paused` + `clock.pause/resume` + PauseMenu（research/05 §577：`@1940862-1940941`；research/02 M11：`init.js:44830-44831`、`44915-44922`）——物理步进整体冻结，双方都停。
- **改动点**：
  - `packages/client/src/main.ts` `togglePause()`：改发 `pause`/`resume` 消息（net.ts 消息面加一对）。
  - `packages/server/src/rooms/ForestRoom.ts`：消息处理内置权威 `pausedBy` 标志，tick 累加器在暂停期不推进（物理冻结、`timerMs` 不走——原版 clock.pause 语义）；任一端 P 键即全场冻结。
  - `packages/client/src/input.ts`/`overlays.ts` 注释同步（本地停手闸保留为暂停期的输入丢弃层）。
  - ⚠ 决策点：原版单机无「对方被冻结」问题，联机下任一端可冻结另一端（挂机/恶意）。research/10 把本项列为「设计决定，供确认」——若用户坚持翻转即接受该语义。
- **测试/文档影响**：`scripts/e2e/journey.mjs` pause 场景断言重写（当前断言=本地停手「服务端 anim=jumping→idle 收到全松」，翻转后断言=双端物理冻结、phase/时钟停摆）；self-acceptance.md §三 pause 行更新。
- **forest_01 路线影响**：否（不改物理积分本身）。
- **风险**：高（联机体验/滥用面+相位机改动）；建议最后批执行或与用户确认后再动。

### F4. 相机固定全景 → 原版滚轮/捏合动态缩放（CameraManager）

- **一句话**：相机恒为 1280×960 全景；原版有 CameraManager 支持滚轮/捏合缩放（minScale≈全景）。
- **当前复刻语义**：`packages/client/src/scenes/GameScene.ts:236-240`（setBounds 全景、scroll=(16,16)，0.3.8/0.3.23 只对齐了几何）；wiring §13 #2 冻结记录；handoff.md:76「原版有动态变焦相机（minScale≈全景），我们固定 1280×960」。
- **原版语义**：滚轮/捏合缩放，minScale≈全景（research/02 M11：CameraManager `init.js:43348-43477`）。maxScale 上限与缩放步进 research 未记 → 见待核实 b。
- **改动点**：`packages/client/src/scenes/GameScene.ts` create 段注册 wheel/pinch 输入 → `cameras.main.zoom` 钳位 [minScale≈1, maxScale]；HUD/弹窗层已有 scrollFactor(0)（GameScene.ts:935 附近）需复核 zoom 下 HUD 不随缩放。
- **测试/文档影响**：`benchmark/visual-diff.mjs`（默认 zoom 必须恒全景，基准脚本若曾缩放需显式复位）；L4 视觉抽检加缩放态样张。
- **forest_01 路线影响**：否（纯渲染）。
- **风险**：低（默认视图不变；maxScale 待取证后填）。

### F5. 教学文字用系统衬线字体 → 原版 font.fnt 中文位图字

- **一句话**：教学文本是 Georgia/KaiTi 衬线 `add.text`；原版教学文字走 font.fnt 位图字体管线。
- **当前复刻语义**：`packages/client/src/scenes/GameScene.ts:849-863`（`fontFamily: 'Georgia, "KaiTi", …, serif'`）。wiring §13 #6 的教学残留项（时钟/结算/暂停/菜单已换位图字：`BootScene.ts:40` 加载 FONT_MAIN，`GameScene.ts:932-935` 时钟 bitmapText，`overlays.ts:46/60/164` 弹窗 bitmapText）；research/03 §6 明确「教学文字为系统衬线文本（非 bitmapFont）」是差距。
- **原版语义**：中文 bitmapFont `font`（四别名）贯穿局内文字（research/03 §6：`@1912643`、`@2219650`；research/09 §字体：font 18/20/24/28 按调用处）。教学调用处的具体字号未记 → 见待核实 c。
- **改动点**：`packages/client/src/scenes/GameScene.ts:849-863` `buildTutorial` 改 `add.bitmapText(FONT_MAIN, …)`，保留触发/渐显/淡出逻辑（GameScene.ts:868-884 不动）；0.3.19 D5 的 wordWrap 框宽约束需按位图字重新核验（BitmapText 无 useAdvancedWrap，需测长句）。
- **测试/文档影响**：visual-diff 基线（forest_01 出生点教学文本像素变化，指数需重采）；无内核/服务端影响。
- **forest_01 路线影响**：否（渲染层）。
- **风险**：低-中（位图字排版与 400ms 渐显 tween 兼容性）。

### F6. 风力相位时基 simTimeS → 原版墙钟 elapsed

- **一句话**：风力 `sin` 相位用仿真累计时基；原版用页面加载起的墙钟 elapsed。
- **当前复刻语义**：`packages/shared/src/kernel/world.ts:74`（`simTimeS`）、`:218-219`（注释自认「取 simTimeS 为时基」）、`:238`（每步累加）；`packages/shared/src/kernel/mechanisms.ts:616-630`（`(1.2+0.2·Math.sin(nowS))·…`，nowS=仿真时间秒）。research/11 §2C 定性此项为「原版是墙钟（页面加载时刻决定相位），我方用 simTimeS」。
- **原版语义**：`(1.2+0.2·sin(elapsed/1000))·100·衰减` 的 elapsed 为墙钟（research/11 §2C）。
- **改动点**：`mechanisms.ts` applyForce 时基改墙钟（如 `performance.now()` 基准，锚点=服务端世界创建时刻）。
  - ⚠ **硬冲突**：L2 确定性门禁（`benchmark/perf-determinism.mjs` 48 关位级哈希链）与金轨迹对拍（fidelity-score，forest_03 等风区关）都建立在「同输入⇒同输出」上；墙钟相位使逐跑哈希漂移，两套门禁全部失效，需重定义口径（如门禁加 `FW_WIND_PHASE` 固定相位旁路，或 det 专用确定性时基 env）——**翻转前必须先落这个口径**。
- **测试/文档影响**：上两基准全部重采基线；research/11 §2C 结论改写（C 类转 B 类）。
- **forest_01 路线影响**：**否**（forest_01 无风区，release/0.3.0.md:40「wind_effect 尾迹…forest_01 无风区」），但 47 个其余关的 det 基线全动。
- **风险**：最高（动摇确定性验收体系本身；且原版语义本质是「每局随机相位」，逐帧对拍不可复现是原理性的——research/11 §2C/§6）。**建议：先做决策评审（翻转+重构门禁 vs 豁免保留 simTimeS 并改档标注），未裁决前不施工。**

### F7. 接触事件出步后统一处理 → 原版在接触回调内直接改状态

- **一句话**：液体致死/钻石/门带等接触事件在物理 Step 结束后统一消费；原版在 Begin/EndContact 回调里直接改状态（body 移除由插件 `_toRemove` 延迟）。
- **当前复刻语义**：`packages/shared/src/kernel/world.ts:79`（`contactEvents` 队列）、`:106-109`（回调内仅入队）、`:239`（步后调用）、`:248-256`（`processContactEvents`，注释自认「原版在接触回调里直接改状态……这里统一出步后处理」）。research/11 §2B 将其列为 B 类分叉源（驱动层重写件）。
- **原版语义**：回调内直接改状态+_toRemove 延迟移除（research/11 §2B）。
- **改动点**：`world.ts` 的 contact 回调改为即时消费事件（液体致死/钻石/门 isOpen 直改），保持 Step 内语义序；研究 research/11 §4.1「驱动序逐项对拍」同批做（收益预估 +0.5~2 指数）。
- **测试/文档影响**：det r27 基线预计漂移（同帧相位变化）→ 按防再犯流程重切基线并留档（research/12 §四·5：凡改物理语义必须另做位姿/轨迹对拍，不能以 det 变绿为充分条件）；`packages/shared/src/__tests__/kernel2.test.ts`（门/时序类用例）与 `48-level-behavior.test.ts` 复跑；金轨迹 fidelity-score 复跑对比。
- **forest_01 路线影响**：**是（唯一一条）**——同帧事件相位变化可能改写位级轨迹（行为级路线预计不变，但 `note/forest01-route.md` 的实测时序、e2e `walkin-doors.json` 的毫秒时间线、det/fidelity 基线都需 forest_01 全段复验）。
- **风险**：中-高（物理语义改动，须金轨迹裁决而非单测绿）。

### F8. 画布外 DOM 钻石计数 HUD → 原版局内无计数（仅结算面板有）

- **一句话**：局内 DOM 常显红/蓝/银钻计数；原版游戏画布内没有任何实时计数，钻石只在通关结算面板出现。
- **当前复刻语义**：`packages/client/src/scenes/GameScene.ts:955`（注释自认「原版游戏内无计数，仅通关结算面板有 → DOM #hud-diamonds」）；`packages/client/src/main.ts:122`、`main.ts:175`（updateHud 写 DOM 计数）；`packages/client/index.html:202`（#hud-diamonds 元素）。0.3.11 以「功能保留」迁出画布（handoff/2026-10-04-fidelity-rewrite §16；保真报告 §12「我方钻石计数功能增项」）。
- **原版语义**：局内无计数（同上双源证据）。
- **改动点**：删 `main.ts` 两处 DOM 写入与 `index.html:202` 元素（GameScene 内部 `diamondKinds` 统计保留——EndMenu 结算仍要用）。
  - ⚠ 决策点：该项与房间码/联机面板同类，属「联机功能 UI」而非物理行为；若用户认定「翻转范围=游戏内行为、联机辅助 UI 豁免」，则本条降级为豁免记录。
- **测试/文档影响**：无 e2e 断言引用 `#hud-diamonds`（scripts/ 全目录 0 引用，已核）；无单测影响。
- **forest_01 路线影响**：否。
- **风险**：低（纯删 DOM 增项）。

### 建议翻转顺序与风险分级汇总

| 批次 | 条目 | 风险 | 理由 |
|---|---|---|---|
| 第一批（渲染层，互不依赖） | F5 教学字体 → F4 相机缩放（先补待核实 b/c 取证）→ F8 DOM 计数（待用户裁决） | 低 | 不碰物理与相位机；F5 后重采 visual-diff 基线 |
| 第二批（流程相位机） | F2 删自动重开 → F1 按角色分键 | 低-中 | e2e 输入/旅程用例同批改；不碰物理 |
| 第三批（内核，须基线重切） | F7 接触事件时机（金轨迹裁决+det r28 留档+forest_01 全段复验） | 中-高 | 唯一影响 forest_01 位级轨迹的条目 |
| 第四批（架构裁决后） | F3 暂停全场冻结（产品确认滥用面）→ F6 风力墙钟（先定 det 门禁新口径） | 高 | 与确定性验收体系/联机体验强耦合，未裁决不施工 |

依赖关系：F6 与 F7 都动内核时序，**不应同批**（否则 det 漂移无法归因）；F7 先行、复验稳定后再评估 F6。每条翻转按自验收制度走 L0-L4 全门禁（note/self-acceptance.md §四），物理类改动（F6/F7）必须附金轨迹/位姿对拍，不得以 det 变绿为充分条件（research/12 §四·5）。

---

## 二、已核销区（曾列冻结偏离，代码已翻转；共 12 条，仅注释/文档残留）

| # | 曾列偏离 | 核销证据（代码现状） | 残留清理 |
|---|---|---|---|
| 1 | 教学渐显判定=本机角色（wiring §13 #4） | **已按原版「任一角色」（pers1‖pers2）实现**：GameScene.ts:987-993 双角色坐标都传入 updateTutorial（0.3.19 D5，release/0.3.19.md:11） | GameScene.ts:868 与 :987 注释仍写「按本机角色/冻结偏离 #4」——**注释已失实，需改** |
| 2 | pusher 贴图二档，原版 0.7m 连续行程（wiring §13 #5） | **已连续**：快照下发 x/y，块体贴图随体（GameScene.ts:1251-1261，0.3.1 PusherState） | GameScene.ts:458 注释仍写「二档化，冻结偏离 #5」——**注释已失实，需改** |
| 3 | 银钻行「有银钻就单列」（wiring §13 附近冻结要求） | 已按原版 puzzle 型规则：overlays.ts:92-97「general 三行；puzzle 两行（Finish/Silver，钻石行隐藏）」 | 无 |
| 4 | 时钟/结算/暂停用系统衬线文本（wiring §13 #6 其余项） | 时钟 bitmapText（GameScene.ts:932-935）、三弹窗/菜单/Temple 全 bitmapText（overlays.ts:46/60/164、MenuScene.ts:76、TempleScene.ts:107） | 仅教学文字残留（=确认区 F5） |
| 5 | animFrame 不进快照、rising 头部倾角不渲染（wiring §13 #7） | 头部倾角已进快照并渲染（GameScene.ts:1114 `ps.headTilt`）；动画状态机按内核 AnimState（idle/jumping/rising/falling，GameScene.ts:1133-1162）——与原版客户端本地状态机同构，原版本无快照概念，无语义差 | 无 |
| 6 | 风区 0.975 阻尼/15m/s 限速不复刻（execution-freeze §四，后被推翻） | 0.3.5 R2 金轨迹实证后补齐（mechanisms.ts:617-618 阻尼公式；research/05 §16.1 结案注） | 无 |
| 7 | 墙面装饰 G12 旧近似分布 | 0.3.2 按 seedrandom("ASDFA") 忠实移植（research/03 §5【2026-10-09 勘误】确认与原版对齐） | 无 |
| 8 | 臆造浮尘 18 颗常驻（research/02 G13） | 0.3.0 删除、改按原版 Navies（Navy0000+极坐标，GameScene.ts:886-914 注释） | 无 |
| 9 | 教学同 id 多文本仅显首条（release/0.3.0 §已知偏离） | 0.3.14 keyboard 层优先（research/10 P2-14 ✓） | 无 |
| 10 | lever motorSpeed 初值 | 已按原版初值 0、过零翻转后才 ±4·onis（mechanisms.ts:126、:142-152；research/05 §590 勘误表） | 无 |
| 11 | 响度自定（保真报告 §22「原版 master=0.1、我方自主响度——记录不改」） | 0.3.23 F4 已整体重标定 master 0.1+逐键归一（handoff.md 0.3.23 条目） | 无 |
| 12 | 门扫帧 round 闸门/单步脉冲 isUp（0.3.27 根因，语义曾偏离「每步重算」） | 0.3.27 已改原版口径每步重算（research/13 §三，commit 437d8ac） | 无 |

---

## 三、待核实区（证据不足，禁止凭印象施工；共 9 条）

| # | 事项 | 已知信息 | 缺什么证据 |
|---|---|---|---|
| a | 「交换出生点」（research/10 §联机特有偏离「无交换出生点」） | 仅此一处提及，无机制描述 | 原版该行为的触发入口/字节偏移/语义（是单机 CharToggle 换操控还是出生位互换）——需回 bundle 取证 |
| b | 相机缩放 maxScale 与步进（F4 依赖） | research/02 M11 只给区间 `init.js:43348-43477` 与 minScale≈全景 | maxScale 数值、滚轮步进、捏合参数——需读 CameraManager 区间定档 |
| c | 教学文字位图字号/样式（F5 依赖） | research/09 只给 font 四字号 18/20/24/28 按调用处 | setupTutorial 调用处的实际字号/颜色——需读 `init.js:44755-44784` 区段定档 |
| d | 拉杆静止沉降角 0.196 vs 原版 0.535 rad | release/0.3.0.md:39「fixture 几何细节待复核，无游戏性影响」；0.3.6 金轨迹旧形制 0.0000 全对后未再动 | 差异根因（fixture 几何细节）；化妆级，是否值得追按用户裁决 |
| e | 原版拉杆「静止不自翻」的内部抑制机制 | release/0.3.0.md:38「源码条件在静止时恒真，金轨迹证明从不自翻；内核以过零边沿检测实现同行为」——行为已等效 | 原版内部抑制机制未定位（仅学术意义，行为面无翻转需求） |
| f | lever/pusher/roman/window 的 Tiled rotation 尊重 | research/12 §五：bundle 尊重视角（@1690124/@1745810/@1750244 等）但 48 关无数据用例，「记档不实现」 | 无数据用例=无可验证行为，无翻转对象；未来神庙关数据引入时按 bundle 实现 |
| g | INPUT_SHIFT +1 输入落帧标定 | 仅存在于对拍工具 `scripts/baseline/diff-kernel.mjs:50`、`benchmark/fidelity-anim.mjs:12`，产品代码 0 引用（已核） | 非产品行为，无翻转对象；列此防误改工具口径 |
| h | 触屏三键是否参与角色分键（F1 依赖） | 原版触屏三键存在（research/02 E16：`init.js:42566-42610`） | **已核实结案（2026-10-11，字节偏移取证）**：触屏控制器按角色实例化——`@1850480` `setup()` 按 `settings.controls` 三分支：`dual`=每角色一套三键垫（左/右/跳，wg 垫左下、fb 垫右下，`@1852865`）；`single`=单人左右键（`@1852790`）；else=左右触键+虚拟 up（fb 隐藏触键组 `@1855449`，键盘 wg=W/A/D `@1856520`、fb=↑/←/→ `@1856587`）。结论：触屏键绑定本机角色、不跨角色；联机每机单角色下触屏键即本机角色通用键（与现实现一致，无需改） |
| i | GameOver Retry 联机确认语义（F2 依赖） | 原版单机=单端点击（research/02 E1）；现服务端 gameover/won 受理任意端 restart（ForestRoom.ts:100-105） | 联机下「任一端点 Retry 即全员重开」本身是自造映射（架构必然）；是否要求双端确认属产品决策，非原版证据问题 |

---

## 四、范围外（架构豁免，翻转=推翻 0.3.0 冻结架构；共 3 条，不在本计划执行）

1. **固定 1/60 步长 vs 原版 rAF 可变 elapsed（min(0.04,elapsed)）**：research/11 §2B 列为分叉源，但 PLAN §5.2 冻结「服务端固定步长 dt=1/60」（144Hz 反面教材规避），且固定 timestep 是确定性复现前提（research/11 §5.1 引 Fix Your Timestep）。翻转=放弃 lockstep 确定性。
2. **服务端权威重写 vs 整包原样执行原版逻辑**：research/11 §4.3 已裁「架构否决」——整包执行可逐位一致但放弃服务端权威联机（0.3.0 冻结需求：联机架构不变，保真以金轨迹对拍为验收）。
3. **联机功能 UI 增项**（房间码/密码面板、hud-status 相位文案、R 键、设置/制作名单入口等）：原版单机无对应物，属联机架构必需层（PLAN §5.3/§11；research/10 §D「联机新增功能文案保留」）。若 F8 裁决为豁免，本条即其同类依据。

---

## 五、执行须知（给后续施工者）

1. **证据先行**：任何「复刻 X 行为」的改动先引 research 原版证据，禁止用对复刻自身的观测当原版依据（handoff.md §对后续 AI 的三条硬规则）。
2. **金轨迹实证 > bundle 静态解读**（research/11 §2B 方法论）；改物理语义必须位姿/轨迹对拍，det 变绿不是充分条件（research/12 §四·5）。
3. **det 基线重切留档链**：r24→r25-mechfix-a→r26-posefix→r27-rotfix 之后，F7/F6 如施工分别切 r28/r29，原因写入提交信息（research/12 §四·5）。
4. **每条翻转独立 commit**（无 co-author）+ 独立发版条目；e2e/旅程用例与实现同批改（self-acceptance §四）。
5. 本计划本身只读产出，未动任何代码；三个「注释已失实」清理点见已核销区 #1/#2。
