# 余关路线生产批次计划（47 关盘点）

> 产出日期：2026-10-11。性质：**只读盘点后的批次计划**——47 个余关（`data/forest/levels/`，forest_01 已在
> `data/tutorials/levels/` 完成通关路线，见 `note/forest01-route.md`）逐关经真实解析器
> `packages/shared/src/level2.ts` 的 `parseLevel` 解析统计，类型名一律取代码实际类型名，未做任何推测。
> 盘点脚本为一次性工具（TEMP/level-survey/，node --import tsx 直载解析器），数据快照随本文档定稿，用后已删。
>
> 产线现状：`scripts/e2e/routetool/`（kernel.mjs 初排回跑 / optimize.mjs ±1f 硬化 / validate.mjs 内核复核）
> + `scripts/e2e/route.mjs` 真实服务端门禁（repeat≥3 ALL PASS）。

---

## 0. 结论速览

- 47 关全部解析成功（`parseLevel` 零抛错）；除 `forest_bonus_2` 为 39×35 外，其余 46 关均为 39×29 格（tile 32px）。
- 机关原语共 12 种形态；按「出现关数」直方图 top5：**PlatformDef 37 / LeverDef 31 / PusherDef 29 / BoxDef 15 / WindDef 15**。
- 复杂度分布：低 14 关、中 26 关、高 7 关；按复杂度升序切 **5 批（9/10/10/10/8）**，13 组 `_1` 变体全部与本体同批（路线直接改造复用）。
- 预判最难 3 关：`forest_bonus_2` ≫ `forest_07` > `forest_15`（详见 §6）。
- 数据可信度审计仅 2 条标注（§2）：forest_05 一个空对象、forest_22 一个未消费属性 `windWidth`；无任何未识别机关类型。

---

## 1. 类型体系与评分口径

### 1.1 解析层实体（`packages/shared/src/level2.ts`，均为代码实际类型名）

| 类型名 | JSON 载体 | 内核实现（`packages/shared/src/kernel/mechanisms.ts`） | 组信号语义 |
|---|---|---|---|
| `LiquidRun` | Ground tilelayer 同行连续同种液体格 | world 内液体传感器（WATER/LAVA/GREEN = type 5/6/7） | 无组 |
| `DiamondDef`（kind: red/blue/silver/fbwg） | Chars 层 gid `type=diamond` | sensor 拾取 | 无组；**拾取仅计数同步，非通关条件**（`world.ts` `checkEnd`：双门 isUp → won） |
| `LeverDef` | Objects 层 gid `type=lever` | `Lever`（信号源 hasSignal） | 有组 |
| `PusherDef` | Objects 层 gid `type=pusher` | `Pusher`（信号源 hasSignal） | 有组 |
| `BoxDef`（`heavy` 即 boxheavy） | Objects 层 gid `type=box`/`type=boxheavy` | `buildBox` → `PropBody(kind)` | 无组 |
| `BallDef` | Objects 层 gid `type=ball` | `buildBall` → `PropBody("ball")` | 无组 |
| `WindDef` | Objects/LargeObjects 层 gid `type=wind` | `Wind`；**状态恒等于 initialState，不接组信号**（组号仅同步给客户端） | 组无效 |
| `PlatformDef` | Objects 层矩形 `type=platform` | `MovingPlatform`：平移（dx/dy）或旋转臂（`dtheta` 存在时）；`rotation` 非零为斜置 | 受驱（hasSignal=false），纯信号驱动 |
| `HangingDef` | Objects 层折线 `type=hanging` | `buildHanging`（distance+revolute 摆板） | 无组，被动物理 |
| `PulleyDef` | Objects 层折线 `type=pulley` | `buildPulley`（pulley 关联双板） | 无组，被动物理 |
| `RomanDef` | Objects 层多边形 `type=roman` | `buildRoman`（跷跷板） | 无组，被动物理 |
| `WindowDef` | Objects 层矩形 `type=window` | `buildWindow`（**静态碰撞体**，刻意不渲染的隐形墙） | 组无效 |

组同步规则（`MechManager.deviceChanged`）：组内信号源（Lever/Pusher）state 取 OR → 赋给组内受驱平台。
Ground 网格形状原语：`GROUND_TYPE` 0=实心、1/2=凸斜面、3/4=半格三角、5/6/7=三种液体（8/9 端盖运行时生成）。

### 1.2 有效性判据（本盘点口径，路线生产只操作"有效"机关）

- **有效链源**：Lever/Pusher 且所在组含 ≥1 个非零轴 `MovingPlatform`；其余为**摆设源**（扳了也不动任何东西）。
- **摆设平台**：零轴（dx=dy=0）平台，或所在组无任何信号源的平台（永停在原位）。
- **风**：initialState=1 常开（有效助力/障碍）；initialState=0 永不吹（摆设）。
- Window 恒为静态隐形墙，不进操作序列。

### 1.3 复杂度评分（分量全部可追溯，评级一句话据此写）

```
total = 链调度(2×有效链源 + 1×受驱平台)
      + 硬机关(3×PulleyDef + 3×RomanDef + 2×旋转臂PlatformDef + 1×HangingDef + 1×常开风 + 1×boxheavy)
      + 2×有效原语种数 + 尺寸(cols×rows/800) + 液体种类数 + [钻石>15 记 1]
```

评级阈值：**低 ≤14、中 15–30、高 ≥31**。钻石非通关条件，只对超长收捡路线（>15 颗）记 1 分参考。

---

## 2. 审计标注（JSON 有但解析器不认识/不消费）

全 47 关逐层扫描（层名 / gid 对象 tiletype / 有 type 对象的 properties 三类白名单核对）结果：

| 关卡 | 发现 | 处置 |
|---|---|---|
| `forest_05` | Chars 层空对象 id=38（无 gid 无 type），`parseLevel` 记入 `unknown` | 原版 console.warn 跳过语义，不影响任何数据 |
| `forest_22` | Objects 层 wind#26 携带属性 `windWidth`，解析器未消费 | 内核风柱宽固定 2.6m（`mechanisms.ts` `Wind` 构造）。原版若该关非默认风宽，仅影响手感细节，路线不受影响；内核对齐时可复核 |

其余 45 关：**无**未识别层名、**无**未识别对象 type、**无**未消费属性。特别地，`level2.ts` 注释所列
beamer / rotmirror / lightpusher / infinitemirror / boxmirror / timedpusher 六类"森林未用"机关与传送门
在本 47 关中**零出现**（`parseLevel` 的 `unknown` 除上述一条外为空，交叉佐证）。

---

## 3. 机关原语 × 关卡数直方图

raw = 该原语出现在多少关；eff = 其中以**有效形态**出现（摆设源/零轴台/常关风不计 eff）。

| 原语（代码类型名） | raw | eff | 备注 |
|---|---|---|---|
| PlatformDef（平移） | 37 | 35 | bonus_1 零轴×6、bonus_2 零轴×2；35 关中含无源组摆设台（bonus_1×24、bonus_2×11 等） |
| LeverDef | 31 | 28 | 摆设拉杆：forest_09×1、09_1×2、21×3、28×2（共 4 关全摆设） |
| PusherDef | 29 | 29 | 全部有效（29 关） |
| BoxDef | 15 | 15 | boxheavy 仅 bonus_2（×17） |
| WindDef | 15 | 15 | 全 33 台：常开 19 / 常关 14；常关集中在 21×3、27×3、27_1×3 及 09_1/20/25/25_1/28 各×1 |
| BallDef | 13 | 13 | |
| PulleyDef | 10 | 10 | 21/04/04_1/05/24/24_1/29/30/bonus_1/bonus_2 |
| HangingDef | 7 | 7 | 全部 fullRotation 变体；25_1 独占 7 台 |
| PlatformDef（旋转臂 dtheta） | 6 | 6 | 07×4、18×3、27/27_1×2、30×2、31×1 |
| RomanDef | 4 | 4 | 14/14_1×1、24/24_1×2 |
| BoxDef（boxheavy 变体） | 1 | 1 | 仅 bonus_2 |
| WindowDef | 1 | 1 | 仅 bonus_1（×2，静态隐形墙） |

---

## 4. 关卡总表（47 关）

尺寸列为格数（cols×rows）。机关清单为代码类型名；「链 a→b」= a 个有效链源驱动 b 台受驱平台。

| 关卡 id | 机关清单 | 尺寸 | 复杂度 | 评级依据（一句话） |
|---|---|---|---|---|
| forest_02 | PusherDef×4、PlatformDef×2(H1/V1)、HangingDef×2、water/lava/green、DiamondDef×16；链 4→2 | 39×29 | 中 | 4 压板全耦合 2 平台 + 三系液体横穿，机关多但无硬物理 |
| forest_03 | WindDef×2(常开)、water/lava、DiamondDef×22 | 39×29 | 低 | 常开风柱爬升 + 22 颗钻收捡，零控制链 |
| forest_03_1 | 同 forest_03（数据一致） | 39×29 | 低 | 同上，路线可直接复用 |
| forest_04 | LeverDef×1、PusherDef×1、PlatformDef×2(V2)、PulleyDef×1、BoxDef×1、lava/green；链 2→2 | 39×29 | 中 | 首个 lever+pusher 双源链，叠加滑轮与箱、双液 |
| forest_04_1 | 04 超集：+1 源 +1 台 +1 球（链 3→3） | 39×29 | 中 | 04 的三链加密版，本体路线扩段复用 |
| forest_05 | LeverDef×3、PlatformDef×3(H3)、PulleyDef×1、water/lava；链 3→3 | 39×29 | 中 | 三拉杆顺次驱动三横台，唯一含空对象标注的关 |
| forest_06 | 无机关，water/lava 液面 | 39×29 | 低 | 全 47 关唯二零机关关，纯液面走位 |
| forest_06_1 | 同 forest_06（数据一致） | 39×29 | 低 | 同上，基线校准用 |
| forest_07 | LeverDef×1、PusherDef×4、PlatformDef×5(V1+旋转臂×4)、BallDef×3、lava/green；链 5→5 | 39×29 | 高 | 5 链全耦合且 4 台为旋转臂 + 3 球滚动物理，时序组合最重 |
| forest_08 | LeverDef×2、PusherDef×2、PlatformDef×4(H1/V3)、BallDef×2、water/lava；链 4→4 | 39×29 | 中 | 四链四台纯调度 + 双球，无硬机关 |
| forest_09 | WindDef×1(常开)、water/lava/green、DiamondDef×14；LeverDef×1 摆设 | 39×29 | 低 | 常开风 + 三系液体；拉杆无受驱设备（摆设不操作） |
| forest_09_1 | WindDef×2(常开×1/常关×1)、water/lava/green；LeverDef×2 摆设 | 39×29 | 低 | 同 09 加一常开风；两拉杆均摆设 |
| forest_10 | LeverDef×2、PlatformDef×2(H1/V1)、water/lava/green；链 2→2 | 39×29 | 低 | 最小控制链样本：两杆两台 + 三系液体 |
| forest_11 | LeverDef×2、PusherDef×1、PlatformDef×3(H1/V2)；链 3→3 | 39×29 | 低 | 三链三台，水+岩浆双液 |
| forest_12 | HangingDef×3(fullRotation)、water/lava/green、DiamondDef×20 | 39×29 | 低 | 三摆板被动跨越，零控制链，收钻路线长 |
| forest_12_1 | 同 forest_12（数据一致） | 39×29 | 低 | 同上，路线直接复用 |
| forest_13 | LeverDef×5、PusherDef×2、PlatformDef×6(H5/V1)、BoxDef×4；链 7→6 | 39×29 | 中 | 7 源 6 台全耦合矩阵 + 4 箱，无液体；纯调度密度大 |
| forest_13_1 | 同 forest_13（数据一致） | 39×29 | 中 | 同上，路线直接复用 |
| forest_14 | RomanDef×1、WindDef×1(常开)、BoxDef×1、green | 39×29 | 低 | 跷跷板配重 + 常开风，单液系 |
| forest_14_1 | 同 forest_14（数据一致） | 39×29 | 低 | 同上，路线直接复用 |
| forest_15 | LeverDef×4、PusherDef×4、PlatformDef×9(H7/V2)、DiamondDef×16；链 8→9 | 39×29 | 高 | 8 源 9 台全耦合为全 47 关最高链调度密度，且无液体兜底 |
| forest_16 | LeverDef×2、PlatformDef×2(V2)、water/lava；链 2→2 | 39×29 | 低 | 双竖直平台链 + 双液，标准入门控制关 |
| forest_17 | LeverDef×5、PlatformDef×11(H6/V5)；链 5→11 | 39×29 | 中 | 5 源驱动 11 台平台矩阵，单源扇出多、扳杆次序敏感 |
| forest_17_1 | 17 加密：PlatformDef×12；链 5→12 | 39×29 | 中 | 17 的平台矩阵加一，本体路线扩段复用 |
| forest_18 | LeverDef×2、PusherDef×2、PlatformDef×5(V2+旋转臂×3)、water/lava/green | 39×29 | 高 | 3 旋转臂 + 三链 + 三系液体，硬机关与链调度叠加 |
| forest_19 | PusherDef×4、PlatformDef×6(H1/V5)、HangingDef×2、BallDef×1、water/green；链 4→6 | 39×29 | 中 | 压板群驱 6 台 + 摆板 + 球，四段绿液 |
| forest_19_1 | 19 改版：LeverDef×3 替换 4 压板、液体加岩浆（三系）；PlatformDef×6(H1/V5)、HangingDef×2、BallDef×1；链 4→6 | 39×29 | 中 | 19 的控制源换型变体，链更多、摆板同构 |
| forest_20 | LeverDef×2、PusherDef×6、PlatformDef×8(H5/V3)、BallDef×3、WindDef×1(常关摆设)；链 7→8 | 39×29 | 高 | 7 源 8 台 + 6 压板 + 3 球，调度与道具双高 |
| forest_21 | LeverDef×3(全摆设)、WindDef×3(全常关)、PulleyDef×1、BoxDef×1、water | 39×29 | 低 | 控制类机关全是摆设，实考滑轮平衡 + 推箱过水 |
| forest_22 | PusherDef×2、PlatformDef×5(H2/V3)、WindDef×5(常开)；链 2→5 | 39×29 | 中 | 2 压板扇出 5 台 + 5 常开风走廊；含 windWidth 未消费属性 |
| forest_23 | LeverDef×1、PusherDef×2、PlatformDef×3(H1/V2)、water/lava/green；链 3→3 | 39×29 | 中 | 三链三台 + 三系液体，标准中坚样本 |
| forest_24 | PusherDef×1、PlatformDef×1(H1)、RomanDef×2、PulleyDef×1 | 39×29 | 中 | 跷跷板×2 + 滑轮 + 压板台，力学机关三件套 |
| forest_24_1 | 24 + BoxDef×1（数据同构） | 39×29 | 中 | 同上多一箱，本体路线扩段复用 |
| forest_25 | LeverDef×2、PusherDef×1、PlatformDef×2(H1/V1)、HangingDef×1、WindDef×1(常关)、water/green | 39×29 | 中 | 双链 + 单摆板 + 常关风摆设，双液（水+绿） |
| forest_25_1 | 同 25 但 HangingDef×7 | 39×29 | 中 | 摆板群（7 台 fullRotation）摆渡，本体路线扩段复用 |
| forest_26 | WindDef×5(常开)、water/lava、DiamondDef×26 | 39×29 | 低 | 全 47 关钻石最多（26），常开风关卡，零控制链 |
| forest_27 | LeverDef×2、PusherDef×1、PlatformDef×3(V1+旋转臂×2)、BallDef×1、WindDef×3(常关)、lava | 39×29 | 中 | 双旋转臂 + 球 + 三常关风摆设，单液系岩浆 |
| forest_27_1 | 27 换液变体（lava→water） | 39×29 | 中 | 仅液体系不同，本体路线换渡段复用 |
| forest_28 | LeverDef×4(2 摆设)、PlatformDef×2(H1/V1)、WindDef×2(常开×1)、water/lava、DiamondDef×18；链 2→2 | 39×29 | 低 | 双链 + 常开风 + 18 钻，摆设杆需跳过 |
| forest_29 | LeverDef×1、PusherDef×2、PlatformDef×4(H1/V3)、PulleyDef×1、BoxDef×1、BallDef×1、water/lava/green；链 3→4 | 39×29 | 中 | 三链 + 滑轮 + 箱球道具 + 三系液体，复合面广 |
| forest_30 | LeverDef×1、PusherDef×2、PlatformDef×3(V1+旋转臂×2)、PulleyDef×1、BoxDef×3、water/lava | 39×29 | 高 | 双旋转臂 + 滑轮 + 三箱推运，硬机关密度仅次于 bonus |
| forest_31 | LeverDef×2、PusherDef×2、PlatformDef×3(H2+旋转臂×1)、water/lava/green；链 4→3 | 39×29 | 中 | 4 源 3 台（含多源组）+ 旋转臂 + 三系液体 |
| forest_32 | PusherDef×2、PlatformDef×2(V2)、BoxDef×1、BallDef×1、water/lava/green；链 2→2 | 39×29 | 中 | 压板双链 + 推箱滚球 + 三系液体 |
| forest_32_1 | 32 换液变体（液量分布不同） | 39×29 | 中 | 同 32，本体路线换渡段复用 |
| forest_bonus_1 | LeverDef×1、PusherDef×1、PlatformDef×37(H5/V26/零轴×6，24 台无源摆设)、PulleyDef×1、WindowDef×2、BallDef×1、water/lava；链 2→7 | 39×29 | 高 | 37 平台的超大矩阵（过半为摆设）+ 隐形墙，规模全 47 关第二 |
| forest_bonus_2 | LeverDef×2、PusherDef×12、PlatformDef×47(H36/V9/零轴×2，11 台无源摆设)、BoxDef×35(boxheavy×17)、PulleyDef×2；链 14→34 | 39×35 | 高 | 唯一 39×35 大图；14 源 34 台 + 12 压板 + 35 箱（17 重箱），规模与密度双极值 |
| forest_bonus_3 | LeverDef×2、PusherDef×3、PlatformDef×6(H3/V3，斜置 rotation≠0×2)、BallDef×3、green；链 5→6 | 39×29 | 中 | 5 链 6 台含 2 台 135° 斜置平台 + 3 球，绿液 |

复杂度合计：低 14 / 中 26 / 高 7（=47）。

---

## 5. 生产批次表（5 批，复杂度升序，每批 8–10 关）

分批原则：批内 total 升序；13 组 `_1` 变体与本体**同批**（解析数据一致或为本体超集/换液变体，路线直接改造复用）；
每批只引入尽量少的新原语，其余全部复用前批。「原语库+内核初排」逐批复用：批 N 开工前，批 1..N−1 的路线段
与原语操作模板（routetool kernel.mjs 时间线）已入库。

| 批次 | 关卡列表（批内即建议生产顺序） | total 范围 | 本批新增原语 | 复用已有 |
|---|---|---|---|---|
| **批 1** 被动机关与液体基线（9 关） | forest_06 → 06_1 → 09 → 09_1 → 03 → 03_1 → 12 → 12_1 → 26 | 4–11 | `LiquidRun`(water/lava/green)、`WindDef`(initialState=1 常开)、`HangingDef`(fullRotation) | forest_01 已产路线的走位/斜面/台阶基元（`note/forest01-route.md`） |
| **批 2** 控制链与道具入门（10 关） | forest_21 → 14 → 14_1 → 16 → 10 → 28 → 11 → 32 → 32_1 → 23 | 11–19 | `LeverDef`→`PlatformDef`(平移 H/V) 链、`PusherDef`→`PlatformDef` 链、`BallDef`、`BoxDef`、`RomanDef`(14)、`PulleyDef`(21) | 批 1 的风/摆板/液体；滑轮与跷跷板各仅 1 关先行试产 |
| **批 3** 多链调度与旋转臂（10 关） | forest_05 → 22 → 04 → 02 → 08 → 24 → 24_1 → 31 → 27 → 27_1 | 21–25 | `PlatformDef` 旋转臂变体（`dtheta`，27×2、31×1） | 批 2 全部链/道具原语 + 批 1 摆板/风/液体；滑轮（04/24）、跷跷板（24）二刷 |
| **批 4** 平台矩阵与斜置台（10 关） | forest_25 → 25_1 → bonus_3 → 17 → 04_1 → 17_1 → 19 → 19_1 → 13 → 13_1 | 20–30 | `PlatformDef` 斜置变体（`rotation`≠0，bonus_3 的 135° 台） | 批 1–3 全部；25/25_1 摆板群复用批 1 摆板原语 |
| **批 5** 收官高难（8 关） | forest_29 → 18 → bonus_1 → 30 → 15 → 20 → 07 → bonus_2 | 29–99 | `WindowDef`（bonus_1 静态隐形墙）、`BoxDef` 重箱变体 boxheavy（bonus_2） | 批 1–4 全部原语；旋转臂（18/30/07）、滑轮（29/30/bonus_1/bonus_2）均为复用 |

批 4 以 forest_25（total 20）开头属有意安排：`_1` 变体随较难一方定批（25_1 为 7 摆板群，total 26）。

各批验收口径沿用现有产线：`optimize` ±1f 硬化 → `validate` 内核复核 WIN → `route.mjs` 真实服务端 repeat≥3 ALL PASS。

---

## 6. 优先级结论与风险预判

**直方图 top5**（按出现关数）：PlatformDef 37、LeverDef 31、PusherDef 29、BoxDef 15、WindDef 15——
平台平移链是绝对主轴，批 2 的「拉杆/压板 → 平台」范式建立后可覆盖 35 关；硬物理原语（滑轮 10、摆板 7、
旋转臂 6、跷跷板 4）是少数深水区，已在批 2–3 各安排 1–2 关先行试产。

**预判最难 3 关**：

1. `forest_bonus_2`（total 99，断档第一）：唯一 39×35 大图；14 信号源驱动 34 平台、12 压板、35 箱
   （含 17 个 boxheavy）、2 滑轮。规模、链调度密度、推箱物理（boxheavy 密度 0.8/轮摩擦 0.05）三项同时
   达到极值，且是 boxheavy 唯一量产关——建议批 5 压轴、预留单独初排会话。
2. `forest_07`（total 36）：5 链全耦合驱动 5 平台，其中 4 台为 `dtheta` 旋转臂，再叠加 3 个 BallDef。
   旋转臂限位端点时序 + 球体滚动的双不确定度叠加，单步试错成本全 47 关（除 bonus_2）最高。
3. `forest_15`（total 33）：8 源 9 台全耦合、无液体无硬机关——纯粹扳杆顺序组合空间最大
   （`MechManager` OR 语义下多源组的状态合并使次序敏感），初排主要耗在链路拓扑分析而非物理调试。

（并列关注：forest_20（33）7 源 8 台 + 6 压板 + 3 球；forest_18（31）3 旋转臂 + 三系液体。）

**摆设机关清单**（路线操作序列必须跳过，避免无效扳杆）：摆设拉杆 13 根——forest_09/09_1/21 的全部拉杆、
forest_28×2、forest_20/25/25_1/27/27_1 各×1；常关风 14 台——forest_21/27/27_1 各×3、forest_09/20/25/25_1/28
各×1；摆设平台 35 台——forest_bonus_1×24（含零轴×6）、forest_bonus_2×11（含零轴×2）。

**风险与备注**：

- 全部 47 关的通关条件均为双门（`world.ts` `checkEnd`），钻石只影响计数与成就展示；各关是否收钻由
  产线按需决定，本计划只对 >15 颗钻的 10 关（02/03/03_1/06/06_1/12/12_1/15/26/28）在评级中记 1 分参考。
- forest_22 的 `windWidth` 未消费属性（§2）在批 3 初排该关时顺带核对一次风柱手感即可。
- 全 47 关尺寸高度统一（39×29，唯 bonus_2 39×35），路线时长量级接近，批次工期主要由链调度数与
  硬机关数决定，与 total 评分单调一致。
