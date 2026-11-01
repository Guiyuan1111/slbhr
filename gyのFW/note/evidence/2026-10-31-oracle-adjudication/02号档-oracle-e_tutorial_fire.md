# 02号档 · oracle e_tutorial_fire 实机裁决（fw-oracle-efire 槽）

- 日期：2026-10-31
- 对象：oracle E 部快照（`Fireboy-and-Watergirl/output/E`，**严格只读**）中的 `data/tutorials/levels/tutorial_fire.json`
- 关卡数据同一性：`md5 oracle/output/E/data/tutorials/levels/tutorial_fire.json == md5 gyのFW/data/tutorials/levels/e_tutorial_fire.json == 033137514bb81d33016923583083587e`（cmp 逐字节相等）
- 方法：本地静态伺服（127.0.0.1:8873，GET/HEAD only）+ headless chromium 页内探针（playwright；`plugin.update` 帧劫持计数、页内 `{isDown}` 标志驱动真实输入、Box2D fixture 世界顶点倾倒）。全程无任何对 oracle 目录的写操作，无外部网络上传。
- 探针工具：本目录 `tools/`（`serve.cjs`、`00-bootstrap.mjs`、`01-require-test.mjs`、`02-navigate-dump.mjs`、`03-geom.mjs`、`04-harness.mjs`、`cases/*.json` 输入 + `cases/evidence-extract.json` 紧凑证据摘录；原始帧采样曾存 `TEMP/fw-oe-1/`，已按槽规清理，可依 §6 重跑再生）。注意：`tools/` 下 `probe1-dump.mjs`、`probe2-behavior.mjs`、`serve-8871.cjs` 系 01号档（crystal_03）槽文件，与本档无关。

## 0. 一句话终判

**oracle 原件 tutorial_fire（=e_tutorial_fire）不可通关。** fb 门与 wg 门各自所在的上部复合体（row-14 / row-5）与出生点所在的下部世界之间不存在任何物理通路：全部候选上行口要么超出 oracle 实测最大跳升（118.9px，实测见 §3.1），要么被上方楼板净空削顶（削至 537.5，见 §3.2），要么位于被柱体顶天封死的封闭口袋中（§3.4）。胜利管线本身无缺陷（正向对照 §3.6：双门 reachability 一旦成立即 `ended=true → endGame(success)`），封锁纯系几何+跳跃上限。我方内核 02号档（fw-route-efire）「疑似结构不可通关」的判决在 oracle 原件上成立，**终判可升级为「双侧实证：结构不可通关」**。

## 1. 实测环境与坐标系

- 进关姿势：`require('States/Level/Level')` + `g.progress.attributes.temples.find(id==='fire')`，level 0 即 `tutorials/levels/tutorial_fire.json`（`required:0, unlock_key:'free'`，temple 数据文件证实为火神殿入口关，**无需先过其他关解锁**）。
- 坐标换算（运行时实测标定）：`screen_x = -world_x*32`、`screen_y = -world_y*32`；地面 body transform = 单位阵（p=(0,0), 单位旋转），fixture 局部顶点即世界顶点。Tiled JSON 坐标与 sprite 坐标同系。
- 122 个地面多边形 fixture 全量倾倒（`03-geom.mjs` → 原始 `geom.json`），与 JSON Ground 层逐段核对一致，无多出/缺失的碰撞体；`cover` 对象（(-8,-16) 336×504）无 `enableBody`，纯视觉遮挡，**不产生碰撞**（其遮蔽区即左上封闭口袋，几何上仍由 Ground 层柱体封死）。

## 2. oracle 运行时权威数据（`02-navigate-dump.mjs` → level-dump）

| 项 | 实测 |
|---|---|
| pers1=fb 出生 | sprite (1328, 796.544)，脚底 832（崖台 1248-1440@832）|
| pers2=wg 出生 | sprite (1328, 956.544)，脚底 992（东南口袋 1216-1440@992）|
| door1(fb) | 传感器中心 (1344, 452)，64×8 sensor；data pos (1312+32, 448+4)；位于 row-14 楼板 992-1440@448 |
| door2(wg) | 传感器中心 (1344, 164)；位于 row-5 楼板 1280-1440@160 |
| 玩家物理 | `jumpVelocity=15.5 m/s, jumpImpulse=1, runForce=50, floatForce=30, maxSpeed=defaultMaxSpeed=8.5, feetFriction=0.5`，质量 0.9548，fb/wg **完全同参** |
| 重力/比例 | `setPTMRatio(32)`（init.js @1897714 附近）、`box2d.gravity.y=1000`（@1898087）经 PointProxy `pxm(-1000)` → 世界 **31.25 m/s²**；与 init bundle 内 `jumpVelocity=15.5` 组合，解析跳升 = 15.5²/(2·31.25)·32 = 123.0px |
| 门逻辑（Devices/Door 源码 @1645xxx） | `isOpen` 由同 char 碰 sensor 置位；`isUp`=开启动画第 21 帧；**胜利条件 `door1.isUp && door2.isUp`，无任何钻石门槛**；`totalDiamonds=10` 仅计分 |
| 设备表 | pulley(744,128, prismatic) / box x0(1104,608 中心, density 0.45) / platform p0(组2, dy=-3, 静息中心 848) / pusher b0(组2, 720-784@顶800) / platform p1(组1, dy=+5, 静息中心 1008) / pusher b1(组1, 208-272@顶800, 位于 mesa) / boxheavy x1(680,96 中心, density 0.8) / cover(无碰撞) |
| 滑轮盘实测静息位 | platform1(A) 中心 y=**144**（轨道左竖段下端，盘顶≈128，恰在 row-4-west 地面高度）；platform2(B) 中心 y=**440**（轨道右竖段下端 (1200,440)，盘顶≈424，恰在 row-14 上方约 24px）——两盘静息即轨道端点 |

## 3. 逐项裁决

### 3.1 oracle 最大跳升（一切上行的标尺）

站立满跳实测（`04-harness` case `maxrise-clean`，row-20-west 平地 x=500，f60 按住上）：

- 起跳 v0 = **496 px/s**（=15.5 m/s，逐帧 vy 实测），vy 衰减 50 px/帧 ⇒ g=1000 px/s² 精确；
- **脚底最高 640 → 521.1，净升 118.9px**（离散步进下的实测值；解析 123）；
- 跑动跳受 15.5 m/s 总速度长钳制（`v.Length()>jumpVelocity → SelfNormalize().SelfMul(jumpVelocity)`，源码 @18319xx）：满速 8.5 m/s 时垂直分量仅 12.93 m/s，升限 **~94px**（实测 92.4）。

结论：**任何 ≥128px 的升坎在 oracle 下不可跳**；跑跳升限更低。

### 3.2 row-14（fb 门层）全部上行口逐一实测否决

| # | 候选通路 | 需要 | oracle 实测 | 判定 |
|---|---|---|---|---|
| ① | row-20-east 楼板(960-1248@640) → r15 台(928-992@480) | 升 160 | case `T1`：满助跑+多相位起跳，脚底最高 **537.5**（<480），全程无 feet<481 帧 | ✗ |
| ② | x0 箱顶(1072-1136@576) 西跳上 r15 台 | 升 96，但全程处 row-14 楼板(448-480)正下方 | case `T2`：脚底最高 **537.5** 即头部(537.5−56=481.5)撞楼板底(480)削顶回落的实测轨迹； 西侧楼板下(960-992)起跳同理（净空削顶 72） | ✗（净空死） |
| ③ | 立柱顶(512-544@672) → r13 岛(736-864@416) | 升 256；且柱顶上即 row-20-west 楼板(640-672)底=0 净空，根本无法立足 | 几何实测（fixture 顶点） | ✗ |
| ④ | x1 落井(736-832)/烟囱(704-736) 垂直井 | 无任何落脚点，顶部分别为 r13 岛底 / row-4-west 底 | 几何实测 | ✗ |
| ⑤ | 滑轮盘 B(静息顶≈424) 从下方登上 | 自 row-20-east(640) 需升 216 | 静息位实测 §2 | ✗ |
| ⑥ | p0(992-1088@848/928) 作垫脚 → row-20-east(640) | 升 208 | 平台行程实测 §3.3 | ✗ |

row-14 上唯一"低门"是从 r13 岛(416) 东跳西坡(960,480)-(992,448)（落差 32-64、沟 96px，range 内）——但岛只能从 r15 台(480)西跳上来（升 64），r15 台又只能从 row-14 上来，**循环封死**；r15 台以下的所有来路即 ①②，已否决。**fb 门不可达。**

### 3.3 b1 控制链与 mesa 电梯（pusher 锁存语义实测）

case `b0`/`b1`（fb 传送立上压板）：

- **oracle pusher 为一次性锁存**：`state 0→1` 后永不回落（b0 在 fb 于 f240 传送离板后至 f390 仍 state=1）；
- b0(组2) → p0(组2,dy=-3)：p0 中心 848 → **944**（约 1.08px/帧连续下沉 89 帧到位）并**保持**——p0 顶 928，即 02号档 probe20 的"缓沉至 944"终态；
- b1(组1) → p1(组1,dy=+5)：p1 中心 1008 → **848**（顶 832=mesa 面）并**保持**。

即 oracle 中 p1 是"一次触发永久升起"。但 b1 位于 mesa(160-416@832) 上，实机唯一施压方式是有人/物先上 mesa：p1 未升时西区地面(992)→mesa 升 160 不可跳（>118.9），x0 箱推入 r20 熔岩可被 fb 涉水西推→r22(0-160@704)→滚落 mesa 触发 b1——但 **mesa 本身是死端口袋**：塔墩(384-416@768) 东跳 b0 板层(672-832@832) 沟 256px 超射程；塔墩→柱顶(672) 0 净空不可立足；mesa→r22(704) 升 128>118.9。**mesa 自锁成立，且即使解锁也通向不了任何门。**

### 3.4 板 A/B 激活点与 row-4 复合体封死链（wg 门的死因）

- 激活语义：盘 A(741-827, 静息中心 144) 与盘 B(1157-1243, 静息中心 440) 绳约束联动；唯一重物 x1(boxheavy, 680,96，静置于 row-4-west 640-736@128) 须被推东越过 row-4-west 东缘(736)，坠入 736-832 落井直落盘 A 顶(128)——case `pulley` 实证 x1 从 (784,300) 下落不触 A（A 在上方 144，下落起点已在 A 之下），**证实 A 必须由 row-4-west 落井自上而下加载**；A 载重下沉、B 升向 row-5（我方内核 probe5 端点 A 411/B 172 与轨道几何自洽）。
- row-4-west(640-736@128) 的来路只有：r06 台(480-576@192, 升 64) ← r10 台(320-480@320, 升 128>118.9 ✗) ← **r15 封闭口袋顶(0-320@480)**：该口袋被柱 320-352（y=32-480，上接天花板 0-32 层）整封，`cover` 只是遮视觉，几何上无口（§1、§3.2 fixture 全量核对）；row-4-east(832-1024@128) 与 row-4-west 之间 96px 同层沟可跳，但 row-4-east 自下方（row-14 升 320 / r13 岛升 288）同样不可达。
- 故 **x1 永远无法被加载，盘 B 永不上升，wg 门(row-5) 不可达**——即便 row-14 可达（fb 门自身已不可达）也一样。

### 3.5 终判：oracle 通关路径

**不存在。** 完整路径清单（自出生出发的全部实际可达集）：

- fb：崖台(832) → 东南口袋/涉熔岩 → row-20 层(640/654.4) ↔ p0/b0 板层(832) ↔ 西区地面(992) ↔ [p1 死锁的 mesa 口袋 / r22 死口袋]；向东全部止步于 row-20-east，无任何上行口（§3.2）。
- wg：同层可达集（熔岩即死），无上行口。

两扇门均不在可达集内；无隐藏关底、无 portal、无其他机关可改变地形（pusher/platform/pulley 全部只是上述已封死机关）。

### 3.6 胜利管线正向对照（排除"门坏了"的替代解释）

case `doorpc`：fb 传送入 door1 传感器(1344, feet 448)、wg 入 door2(1344, feet 160)——

- 当帧 `d1.isOpen=d2.isOpen=true`；~45-60 帧后 `d1.isUp=d2.isUp=true`；`ended=true`、物理暂停、`animateStairs`（body 移至门位 (1344,452)/(1344,164)）；~f150 `game.state → endGame`（success）。

即：**只要可达，门即工作**。封锁 100% 来自几何+跳升上限，非机关失效、非数据缺陷的对象漏建（JSON 逐字节同源，oracle 运行时与 JSON 一致）。

## 4. 我方内核语义差异清单（均为记录项，无一能重开通路）

1. **pusher 锁存**：oracle `state 0→1` 一次触发永久保持，platform 到位后驻留。我方 02号档的搜索链按"持续施压"语义建模（如 E0 "fb 压板"段、"p0 载荷缓沉"窗口）——若我方内核同样是锁存语义则无差异，仅链建模方式不同；若为持续语义则存在真实行为差异（建议内核侧对照 `packages/shared` pusher 实现核对，本槽不下终判）。
2. **滑轮盘静息位**：oracle A=144/B=440（轨道端点）。我方 probe5 记录的"未加载态"若与之不符，属我方实现细节差异；但两盘在两侧引擎中都只能从 row-14/row-4 侧登乘，结论不变。
3. **p1 行程**：oracle 1008→848（中心，顶 832）一次性；与 02号档"升 848/顶 832"一致 ✓。
4. **跳升**：oracle 实测站立净升 118.9（解析 123），跑动跳钳制后 ~94。02号档"满充能 rise 实测上限 ~123px"与我方内核一致；oracle 同参，无缺口。
5. **熔岩碰撞**：oracle 为"下半厚板（面深 +14.4px）+两端楔帽"的实体板，fb 立于 654.4/1006.4 与 02号档一致 ✓。
6. **门/钻石**：门无钻石门槛，10 颗钻纯计分——若我方内核把钻石计入开门条件，属我方多加的语义（对"不可通关"结论无影响，但会错杀其他关的可行性，建议内核侧自查）。

## 5. 与 02号档（fw-route-efire）结论对照

| 02号档论点 | oracle 实测裁决 |
|---|---|
| ① fb 门(1312,448)/wg 门(1312,160) 在封闭上部复合体 | **成立**（门传感器 (1344,452)/(1344,164)；row-14/row-5 与出生点无通路） |
| ② row-14 上行口全部超跳限（升 128-256 > 123） | **成立且更严**：oracle 实测净升 118.9；x0 箱顶路线即便升幅足够也被楼板净空削顶（537.5 vs 480）——我方"净空不足"判断在 oracle 原件复现 |
| ③ mesa 电梯 p1 由 mesa 上的 b1 控制=自锁 | **成立**（b1 锁存语义实测；mesa 口袋本身亦为死端） |
| ④ wg 西界 352 熔岩墙、r20 熔岩杀 wg | 成立（熔岩碰撞体实测；fb 免疫但同样无上行口） |
| ⑤ 板 A/B 联动激活点在不可达 row-4-west | **成立**：oracle 盘 A 静息 144，唯一加载方式=row-4-west 落井投放 x1；row-4 复合体经 r15 封闭口袋顶被柱 320-352 顶天封死 |

## 6. 复现

```bash
# 1) 伺服（8873 专属）
node note/evidence/2026-10-31-oracle-adjudication/tools/serve.cjs &

# 2) 结构/运行时权威 dump（产物曾存 TEMP/fw-oe-1/，已清理；可重跑）
node note/evidence/2026-10-31-oracle-adjudication/tools/02-navigate-dump.mjs
node note/evidence/2026-10-31-oracle-adjudication/tools/03-geom.mjs

# 3) 行为探针（case 输入与证据摘录收容于 tools/cases/：maxrise-clean/T1/T2/b0/b1/pulley/doorpc + evidence-extract.json）
node note/evidence/2026-10-31-oracle-adjudication/tools/04-harness.mjs note/evidence/2026-10-31-oracle-adjudication/tools/cases/maxrise-clean.json
```

关键 case 一览：`maxrise-clean`（净升 118.9）、`T1`（row-20-east→r15 台最高 537.5）、`T2`（箱顶西跳削顶 537.5）、`b0`/`b1`（锁存+行程）、`pulley`（盘静息 144/440、x1 下落不触 A）、`doorpc`（双门→endGame success 正向对照）。


---

## 主会话复核（2026-10-31，pusher「锁存」观测定谳=瞬时语义一致，无内核缺口）

本档 §3.3「oracle pusher 为一次性锁存（state 0→1 永不回落）」复核为**探针假象**：oracle
Pusher.checkState 原文（A bundle `define("States/Level/Devices/Pusher"` @39854 起，checkState
在类内 +67 行）为 `0===state && translation>0.2 → 1；1===state && translation≤0.2 → 0`
——与内核 `packages/shared/src/kernel/mechanisms.ts` Pusher.checkState 逐字同语义（瞬时，
松手回 0）。b0 在 fb 离板后仍 state=1 的真因=**x0 箱仍留在板上**（translation 持续 >0.2），
属"有载荷持续施压"而非锁存。四项行为差异记录中第①项撤销，②③④（滑轮盘端点静息/
p0 驻留/门无钻石门槛）为 oracle 行为实录，我方待对拍项不变。

---

## 独立复核（fw-oracle-etutorial 槽，2026-11-01）

> 本节为追加式独立复核（主会话批准）：以上文任何一行未改。本槽用自有探针在真 oracle 上重测全部承重点；工具 `tools/etutorial-*`（伺服 `etutorial-serve-8874.cjs`、dump/analyze 件已被并行槽 ffdb607 先行收容，`etutorial-harness.mjs` + 11 个 `etutorial-case-*.json` + `etutorial-summarize.mjs` + `etutorial-evidence.json` 系本槽提交 cf041d2）；原始帧采样曾存 `TEMP/fw-oe-1/`，按槽规清理，可依本节复现命令再生。端口 8874，ROOT=`Fireboy-and-Watergirl/output/E`，全程只读（GET/HEAD 伺服 + headless chromium 页内 `plugin.update` 帧劫持）。坐标：screen px，`screen=-world*32`（sprite 与 body 实测零偏差）；脚底=body 中心+35.2（足圆 r6.4 圆心=躯干底 825.3，底 831.7≈832 实测标定）；头圆 r15.36，头顶=中心−21.76。

### 复-0. 数据同源与运行时权威数（重验）

`md5(output/E/data/tutorials/levels/tutorial_fire.json) == md5(gyのFW/data/tutorials/levels/e_tutorial_fire.json) == 033137514bb81d33016923583083587e`，`cmp` 逐字节相等——与上文头部记载一致。运行时 dump（`etutorial-dump.mjs` → `et-dump.json`）：fb 出生 sprite (1328,796.544)、wg (1328,956.544)；door1 pos (1344,448)/sprite (1344,452)/sensor 64×8 y[448,456]；door2 (1344,160)/(1344,164)/y[160,168]；jumpVelocity 15.5、mass 0.9548、maxSpeed 8.5、重力 1000 px/s²、122 个地面 fixture、totalDiamonds 10——**与上文 §1/§2 全部一致**。

### 复-1. 逐项对照表（上文数字 vs 本槽实测）

| 裁决项 | 上文 | 本槽独立实测 | 判 |
|---|---|---|---|
| 数据同源 | md5 0331…587e | 同，逐字节相等 | 一致 |
| 站立满跳净升 | 118.9（640→521.1） | **118.9**（case et-maxrise，min feet 521.1，解析 123.0） | 一致（逐位） |
| 跑动跳净升 | ~94（实测 92.4） | **102.8**（et-runjump，min feet 537.15） | 数值差 +8.8（助跑/蓄压参数敏感），同样 ≪118.9，不影响任何判定 |
| 同高平跳射程 | （上文未单列；route 档 kernel ~196） | **201.6px**（et-runjump 飞行段位移） | 一致量级；封锁所需沟距均 ≥224，超射程成立 |
| ①fb 门/wg 门位置 | sensor (1344,452)/(1344,164) | 同左；fb 门在 row-14 楼板（992-1440@448），wg 门在 row-5 楼板（1248-1440@160） | 一致 |
| ②row-14 上行口 | T1 537.5 / T2 537.5 | **T1 537.2**（最佳跳 f124 @x1018.3 楼板正下方，头顶触 480 板底；et-t14）/**箱顶跳 537.2**（et-boxclip，头圆模型解析 536.96） | 一致（0.3px 级）；两向齐封：升限 521.1>480 需求，削顶 537.2 更够不到 |
| ③mesa 电梯自锁 | p1 由 mesa 上 b1 控制 | b1 板顶实测 **812.8**（bbox y[812.8,832]，208-272）；fb 传送上板→b1 state 0→1（f20），p1 **1008→848 驻留**（f161 首达 848，f299 仍 848；et-b1-press）；mesa 死口袋实证：塔墩起跳东向最远仅达 x≈514（et-mesa-range `maxXBeforeGapFall`=514.3，`everOnB0Layer`=false，全程未落 b0 层 640-864@832） | 一致且补强 |
| ④wg 西界/熔岩 | wg 杀、fb 免疫立于 654.4/1006.4 | et-lava-r20：fb 同点 (850) 立于 **654.1 存活**、wg **f91 死**；et-lava-bottom：fb 立西区实地面 991.7 存活、wg **f93 死**；熔岩板 bbox 实测 128-352 / 672-1216 / 736-960 / 1248-1376 / 352-736 @各带（3 poly 楔帽结构） | 一致（新增：wg 死亡有 ~1.5s 延迟，非即触即死，见复-3） |
| ⑤滑轮激活点 | A 须由 row-4-west 落井加载；x1 下落不触 A | 盘静息 **A(784,144)/B(1200,440)**（物理盘顶 139.2/435.2，与上文「盘顶≈128/≈424」按 sprite 盘面一致）；x1 自 (784,300) 下落全程不触 A（min y 300.27，阶段1）；x1 自 (784,96) 投落→A 载重，端点 **A 410.45 / B 173.55**（et-pulley，与上文引内核 probe5 的 A411/B172 差 ≤1.6px） | 一致 |

### 复-2. 本槽补全的封锁链细节（无一重开通路）

1. **430.4 熔岩实面条带**（x384-704@430.4，即 416 带熔岩 352-736 的实体面=板顶 416+14.4，两端楔坡 352-393.6 / 694.4-736）——上文未显式记录的上级构件：fb 专用（wg 沾即死），经东楔坡与 r13 岛(736-864@416)连成一片，故 fb 门上级组件实为 {条带+岛+r15 台+row-14}。封死不变：条带下方为 row-20-west(640)，升 **209.6** ≫118.9；西端贴柱 320-352（y32-480 顶天接天花板 320-1440@0-32）。条带→r10 台(320-512@320) 升 110.4<118.9 本可成立，但 (a) 条带自身不可达，(b) r10→r06 台(448-576@192) 升 **128>118.9**（跑跳 102.8 更不可及）仍封 row-4-west。
2. **岛→r10 西跳**：沟 224px（736→512）> 射程 201.6，实证超程。
3. **x0 箱顶实测 580.5**（上文按 Tiled 记 576；box 实高 56.6px，bbox y[580.5,639.7]）→箱顶→row-14 需升 132.5>118.9，且箱顶跳被楼板削顶 537.2（复-1②）——**更保守，判定不变**。
4. **r22 死口袋(0-192@704)→b1 理论落板通道**：r22 东缘 192 与 b1 西缘 208 沟 16px、落差 704→812.8≈109px，几何上敞开——但 r22 自身封死（西区地面升 288；p1 升位 833.8→r22 升 129.8>118.9 且沟 224），mesa 自锁不受影响。记录仅为完整性。
5. **wg 门的机关链端点量化**：x1 落井加载成功时 B 升至中心 173.55（盘顶≈168.7），距 row-5 面(160) 差 8.7px、B 西缘 1153.6-东缘 1246.4 紧贴 row-5 西缘 1248——若可达则为平凡登步。即 wg 门封锁**唯系** x1 无法加载（row-4-west 复合体封死，复-2.1）；机关本体无缺陷。
6. **柱 E(992-1024)** y64-320 实测：顶 64 与天花板底 32 间净空 32px<57px 角色高，不可立足亦不可穿越——row-4-east 顶上东去 row-5/row-14 的柱顶通路不存在。
7. row-4-west 实测 **608-736**@128（上文记 640-736，west 侧多出 32px 三角面）——来路封死论证不变。

### 复-3. 新增 oracle 行为观察（我方内核对拍项，均不改变封锁）

1. **wg 熔岩死亡延迟**：接触后 ~90-93 帧判死（r20 带 f91、底部带 f93），非即触即死——内核侧若为即死属语义差异，对「不可通关」无影响（wg 无论 1 帧还是 91 帧都无路可走）。
2. **入睡体不响应 SetPosition**：oracle box2d 移植中 `SetPosition` 不唤醒 sleep 体（本槽 harness 初版 b0/b1/pulley 三案全冻结即此因，`SetAwake(true)` 后复现）——探针方法论记录，与游戏本体无关。
3. **插曲**：et-pulley 阶段1 中 x1 下落被 (784,368) 钻石（静态体，10 颗之一）接住驻停——顺带证明钻石为可承载实体，无通路意义。
4. **正向对照重验**：et-doorpc 双门传送→d1.isUp f52 / d2.isUp f82（各自触感后 ~52 帧，与上文「45-60 帧」一致）→ `ended=true → state endGame`，全程 0 颗钻石——胜利管线无缺陷再证。

### 复-4. 复核结论

**维持上文终判：oracle 原件 tutorial_fire（=e_tutorial_fire）结构不可通关，双侧实证。** 本槽 11 案全部数字与上文承重结论一致（最大偏差：跑跳升限 +8.8px、若干构件边界的 Tiled 推算差 4-32px，全部朝更封死方向）；复-2 补全的条带/r22/柱顶细节均以「入口自身封死」告终。无发现我方内核没有的 oracle 通路。

### 复-5. 复现

```bash
# 1) 伺服（8874 本槽专属；etutorial-serve-8874.cjs 已随 ffdb607 收容于 tools/）
node note/evidence/2026-10-31-oracle-adjudication/tools/etutorial-serve-8874.cjs &

# 2) 运行时权威 dump + 几何分析（产物 TEMP/fw-oe-1/et-dump.json；已清理可重跑）
node note/evidence/2026-10-31-oracle-adjudication/tools/etutorial-dump.mjs
node note/evidence/2026-10-31-oracle-adjudication/tools/etutorial-analyze-geom.mjs

# 3) 行为探针（11 case 输入收容于 tools/etutorial-case-*.json；输出 *.out.json 落 case 同目录）
#    建议 copy 到 TEMP/fw-oe-1/ 后运行
for c in 01-maxrise 02-runjump 03-t14 04-boxclip 05-b0 06-b1 07-pulley 08-doorpc 09-lava-bottom 10-lava-r20 11-mesa-range; do
  cp "note/evidence/2026-10-31-oracle-adjudication/tools/etutorial-case-$c.json" TEMP/fw-oe-1/
  node note/evidence/2026-10-31-oracle-adjudication/tools/etutorial-harness.mjs "TEMP/fw-oe-1/etutorial-case-$c.json"
done

# 4) 关键数字摘录（读 TEMP 输出 → tools/etutorial-evidence.json）
node note/evidence/2026-10-31-oracle-adjudication/tools/etutorial-summarize.mjs
```

注意：若手改 case/teleport，须记得该 box2d 移植 `SetPosition` 不唤醒入睡体（复-3.2，harness 已内置 `SetAwake` 修复）。