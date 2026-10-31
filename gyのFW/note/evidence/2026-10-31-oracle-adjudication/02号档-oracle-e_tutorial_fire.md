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
