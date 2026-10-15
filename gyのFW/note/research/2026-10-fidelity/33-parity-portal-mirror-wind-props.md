# 33 · portal / boxmirror·boxheavy / infinitemirror / wind 逐参数保真审计（rpd 槽）

> 对象：`Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js`（latin1 口径 2,218,873 B，只读未动）。
> 方法：python3 `open(p,'rb').read().decode('latin1')` 按字节偏移切片；关卡数据用 python3 逐 JSON 扫描
> （tileset `tiles[].type` 解析，per-level `firstgid` 归属，Phaser 规则）。
> 引用约定：`@N` = **latin1 字节偏移**（与 05 号档一致；05 号档称 bundle 2,273,196 B 为 bytes 口径差异，本档以
> `len(bytes)=2,218,873` 为准）。Devices 区段（<1.8M）utf-8 文本偏移与 latin1 偏移恒差 +9。
> 产出日期：2026-10-15。本档为只读审计，除本文档外未改动任何源码。

## §0 结论速览

| 机制 | 原版 | 我方 | 数据使用（全部 49 关） | 评级 |
|---|---|---|---|---|
| portal | @1683625 完整实现 | **无设备实现**（接收侧感应圆已备） | **0 对象**（oracle 亦 0） | P2 潜在缺失 |
| box | @1636966 = BoxPrototype 薄壳 | buildBox 逐参一致 | 16 关 42 对象 | 无差异 |
| boxheavy | @1637540 = BoxPrototype 变体 | buildBox(heavy) 逐参一致 | 仅 forest_bonus_2（17） | 无差异 |
| boxmirror | @1638199 = BoxPrototype 变体（内嵌 45° 镜条） | **无实现** | **0 对象**（oracle 亦 0） | P2 潜在缺失 |
| infinitemirror | @1649815 独立类 | **无实现** | **0 对象**（oracle 亦 0） | P2 潜在缺失 |
| wind | @1732155 完整实现 | 已实现，6 处残差 | 15 关 33 对象 | **P1×1 + P2×5** |
| （新发现）旋转箱中心矫正 | BoxedDevice 位移随 rotation 旋转 | level2 解码未做 | forest_24_1 箱 objid=31（17.4°） | **P1** |

**P0 = 0 项。** 任务书预判的"infinitemirror 缺失 → 列关号标 P0"经数据扫描证伪：本 build（oracle 与我方逐字节
一致的 48 关）**没有任何关卡实例化 portal / boxmirror / infinitemirror**，三者是 bundle 中的死代码类
（MechManager 有映射、关卡数据无对象）。当前无任何受影响关卡；若日后移植 temple 世界（LargeObjects#0/#1
portal 模板属性已存在于图块集）则升级 P0。

---

## §1 数据域决定性前置（全 49 关普查）

关卡全集 = `packages/client/public/data/forest/levels/*.json`（48）+ `packages/client/public/data/tutorials/levels/forest_01.json`（1）。
oracle 侧 = `Fireboy-and-Watergirl/output/A/data/{forest,tutorials}/levels/*.json`（48）。**双方 48 关语义逐字节一致**
（`json.load` 后 `==` 全等，2026-10-15 实测）。`data/forest/temple.json` 是选关清单（世界地图）非 Tiled 图。

设备类型普查（tileset `tiles[type]` 解析 + per-level firstgid）：

| type | 关卡数 | 对象数 | 关卡清单 |
|---|---|---|---|
| portal | **0** | 0 | —（图块集 LargeObjects#0/#1 有模板属性 `{'group':0,'inverted':False,'portalId':0}` / `inverted:True`） |
| boxmirror | **0** | 0 | —（Objects#12） |
| infinitemirror | **0** | 0 | —（Objects#11，默认 `{'group':0}`） |
| boxheavy | 1 | 17 | forest_bonus_2（全部 rot=0，无对象级 properties） |
| wind | 15 | 33 | forest_03, 03_1, 09, 09_1, 14, 14_1, 20, 21, 22, 25, 25_1, 26, 27, 27_1, 28 |
| box | 16 | 42 | forest_01(tut,1), 04, 04_1, 13, 13_1, 14, 14_1, 21, 24, 24_1, 29, 30, 32, 32_1, bonus_1, bonus_2 |
| ball | 13 | 20 | 04_1, 07, 08, 19, 19_1, 20, 27, 27_1, 29, 32, 32_1, bonus_1, bonus_3 |
| beamer / rotmirror / lightpusher / timedpusher | 0 | 0 | —（level2.ts:526 注释"森林未用"与本扫描互证） |

wind 对象级 properties 全集：`initialState`、`length`（6/7/8/9/10/11/12/14/15/16/20）、`group`、
**`windWidth:1.5`（仅 forest_22 objid=26）**。无 `flat`、无 `invertInput`。rotation 非零实义：
−90（多数）、−90.736（forest_20）、−89.524（forest_21）、180（forest_21）、−180.022（forest_25）。

## §2 portal（传送门）

### 2.1 原版参数表（@1683625，至 Pulley @1697647）

| 参数/行为 | 值 | 证据 |
|---|---|---|
| 类默认 options | `{sensorWidth: 2, sensorHeigh: 1.5, lightSensorWidth: 0.1}` | @1689967（地图对象可覆盖，数据未用） |
| boxSize | `{x: 2, y: 3}` → BoxedDevice 位移 e=(mpx(1),mpx(1.5))=(32,48)px 按 −rotation° 旋转 | @1690045 + BoxedDevice @1623528 |
| sensor fixture | `SetAsOrientedBox(2, 1.5, (0,0), 0)`，density 0，**isSensor=true**，cat=4096 mask=4096，userData `{lightProperties:{type:"transparent"}}` | 构造体中段 |
| eventHorizon fixture | `SetAsOrientedBox(0.1, 1.5, (0,0), 0)`，density 0，**isSensor=false（实体！）**，cat=4096 mask=4096，userData 含 `type:"portal"` + getOutput + getPoint + device | 同上；角色 mask 含 4096（b2.ts:30 同源）故会被实体拦停 |
| inverted | 仅视觉翻转（`scale.x=-1` ×2）+ 下方数学分支；配对时缺省 false | 构造体 + MechManager.connectPortals @1834634 |
| 配对 | 按 `properties.portalId` 分组，`i[0].other = i[1]` | @1834894 |
| 假墙 | connectToWall：探测门面 ±0.5m 处瓦片 type===−1（墙）→ createFakeBlock 0.5×1.5 @1836200；**开门(state1) mask=0 关门 mask=4369/cat1**（updateState） | @1834634–1836330 |
| 状态门控 | state1：两 fixture SetFilterData(cat/mask=4096)；state0：置 0（穿透） | updateState |
| transport 数学 | @1691036：`e=(0,1)R(rot_src)`；`d = pos−src`，**inverted 相异时按 e 镜像** `d = e·(2d·ê)−d`；`d←R(Δrot)`；`SetPosition(other+d)`。速度：inverted 相同 → `R(−Δrot)(v)` 再按 e 镜像；相异 → `R(Δrot)(v)`；**合成速度 <10 时**沿 `other.normal`（inverted?(1,0):(−1,0) 再 R(rot)，side==1 再取反）施加冲量 `f·(1/mass)`（=单位 Δv 出膛助推） | @1691036–1691300 |
| getOutput（光路） | `Δ=rot_other−rot_src`；**inverted 相同 → R(Δ+π)，相异 → R(Δ)** | @1687518 |
| getPoint（光路点） | 以门局部 Y 轴 `(0,1)R(rot)` 为镜：inverted 相异时点先镜像，再 R(Δ)，加 other 位置 | @1687639 |
| 入射登记 | eventHorizon BeginContact → 按入射点局部 x 符号+inverted 判 side(±1)，压入 `transporting` 队列，update() 中逐个 transport | 构造体尾部 |
| ocupy | (b,c±2),(b−1,c±2)，b=x/32 | 尾部 |

### 2.2 我方对照

| 项 | 我方 | 结论 |
|---|---|---|
| Portal 设备类 | **无**（全仓 grep 仅 client/src/main.ts:362 音效表提及 portalLoop） | 缺失 |
| 角色 portal 感应圆 | character.ts:88–97：r0.1@(0,0)、cat4096/mask4096、groupIndex −1、fr0、density0、userData `{"portal-sensor":true}` | ✅ 与原版 @1817422–1817830（`this.portalSensor` @1817814）逐参一致 |
| 箱/球 sensor 圆 | mechanisms.ts:384–390 / 409–415：r0.1、cat4096/mask4096、fr0.5、density0 | ✅ 同原版 BoxPrototype/Ball |
| CHAR_MASK bit12 | b2.ts:30 `4353 = 1\|256\|4096` | ✅（portal eventHorizon 实体位就绪） |
| 传送/光路/假墙/配对 | 均无 | 缺失 |

**评级：P2 潜在缺失**（本 build 数据 0 使用；受影响关卡清单 = 空）。复现思路：`grep -c '"type":"portal"'` 不适用——
portal 是 tileset type，需按 §1 方法扫 gid→LargeObjects#0/#1；结果 0。若移植 temple 世界数据出现 LargeObjects
gid→local 0/1 对象，level2.ts:542 会静默落入 `unknown`，届时必须先补 Portal。

## §3 box / boxheavy / boxmirror（推箱家族）

### 3.1 原版：三者同为 BoxPrototype 变体（回答任务书问题）

**不是三个独立 Device 类**。`Box`（@1636966）与 `BoxHeavy`（@1637540）是纯薄壳（BoxHeavy 仅覆 3 标量），
`BoxMirror`（@1638199）覆 2 尺寸 + 加 1 条镜 fixture。几何与动力学全在 BoxPrototype（@1633506）：

| 参数/行为 | 值 | 证据 |
|---|---|---|
| 类默认 options | `{boxWidth: 1.77, boxHeight: 1.77, frameName:"movingbox0000", density: 0.45, circleFriction: 0.1}`；`properties.boxSize` 可覆 boxWidth（数据未用） | @1636507 + 构造体首行 |
| 主 fixture | 八边形（切角 g=0.1，顶点 push 后 **reverse**），friction=`properties.friction ?? 0.4`，restitution 0，density=options.density，**未设 filter → 默认 cat1/mask65535** | 构造体 |
| 四角滚圆 | r=0.1 @ ±(boxWidth/2−0.06·g?)=±0.825（原式 `boxWidth/2 − 0.6*g`，g=0.1 → ±0.825），**cat17/mask4097**，friction=circleFriction，density 0，transparent | 构造体 j(d,±f) |
| 中心 portal 圆 | r=0.1@(0,0)，cat4096/mask4096，fr0.5，density0，userData `{"portal-sensor":true}` | @1625944 |
| 阻尼 | `SetLinearDamping(1)`、`SetAngularDamping(20)` | @1636372 |
| BoxHeavy 覆写 | `frameName="movingbox20000"` @1637748、`density=0.8`、`circleFriction=0.05` @1637788（**密度/滚圆摩擦差 → 同形更重、滚阻更小**） | @1637540–1637810 |
| BoxMirror 覆写 | `mirrorWidth=2, mirrorHeight=0.05` @1638421、frame BoxMirror0000；`boxFixture.userData → {lightProperties:{type:"transparent"}}`；新增镜条 fixture：`SetAsOrientedBox(1, 0.025, (0,0), **π/4**)` @1638790 附近，friction 0、restitution 0、**density 0**、userData `type:"mirror"`（**光学：箱体透明、内嵌对角线为镜；动力学仍=标准 0.45 密度可推箱**） | @1638199–1639000 |
| BoxedDevice 中心矫正 | `e=(mpx(boxSize.x/2), mpx(boxSize.y/2))`（boxSize 默认 {2,2} @1624093 → e=(32,32)px），`R(−rotation°)` 旋转后 `x+=e.x, y−=e.y` | @1623528–1624400 |

### 3.2 我方对照（buildBox，mechanisms.ts:340–394）

| 项 | 原版 | 我方 | 结论 |
|---|---|---|---|
| boxWidth/Height | 1.77 | 1.77（:342 硬编码） | ✅ |
| 八边形顶点 | push 8 点后 `Set(l.reverse())` | 同序同 reverse（:353–362） | ✅ |
| 主 friction | props.friction ?? 0.4（数据全无 friction → 0.4） | 0.4（:364） | ✅（数据等价） |
| 主 density | 0.45 / heavy 0.8 | 0.45 / 0.8（:366） | ✅ |
| 主 filter | 默认 cat1/mask65535 | 未设 → b2 默认同值 | ✅ |
| 角圆 | r0.1@±0.825、cat17/mask4097、fr0.1/0.05、density0 | :368–382 全同 | ✅ |
| portal 圆 | r0.1、cat4096/mask4096、fr0.5、density0 | :384–390 | ✅ |
| damping | 1 / 20 | :391–392 | ✅ |
| 体角 | Device SetAngle(π·rot/180) | :348 | ✅ |
| **BoxedDevice 中心矫正** | e=(32,32)px 按 **−rotation** 旋转后 x+=e.x、y−=e.y | **level2.ts:507/510 只取 centerOf（x+32, y底−32）→ 旋转项丢失** | ❌ **P1**（见 3.3） |
| BoxMirror 镜条/光学 userData | 有 | 无（且内核无光学系统） | P2 潜在（0 使用） |

### 3.3 P1 新发现：旋转箱初始中心偏差（forest_24_1）

BoxedDevice 矫正的 e 在 rot≠0 时随 −rotation 旋转；rot=0 时 e=(32,32) 恰等于"图块中心"换算，故 47/48 个箱
（rot=0）无差。唯 forest_24_1 objid=31 rot=17.4060839413096°：

```
原始公式（@1623528）：th=−17.406° → e=(32cosθ−32sinθ, 32sinθ+32cosθ)=(40.107, 20.962)
原版中心  = (1052+40.107, 880−20.962) = (1092.107, 859.038)
我方中心  = (1052+32, 880−32)          = (1084, 848)      Δ = (+8.107, +11.038)px ≈ (0.253, 0.345)m
```

即原版该箱初始位比我方偏右 8px、偏下 11px（屏系）。箱为动力学体自由落体，落在斜坡上可能稳定到不同位置，
影响 forest_24_1 上腔路线（26 号档主题区）。**存疑标注**：本结论为静态算术推演，未做运行时 A/B 探针；建议
生产槽以金轨迹核（原版帧 1 箱中心应在 (−1092.1/32, −859.0/32) 物理）。复现：§3.1 公式 + forest_24_1 objid=31。

顺带：`params.ts:142–145 BOX.width=1.8`（"待复核"）与实际 1.77 不符、`params.ts:148–152 BALL.radius=0.9`
与实际 `prototype.radius=0.4`（@1626218）不符——两常量**零引用**（仅 index.ts 转出），内核实值正确，属文档
隐患 P2，建议回填或删除，防未来误用。

## §4 infinitemirror（无限镜）

### 4.1 原版参数表（@1649815–1653068，Hanging 之后、Lever 之前）

| 参数/行为 | 值 | 证据 |
|---|---|---|
| 类默认 options | `{boxWidth: 1.8, boxHeight: 1.8, mirrorWidth: 3, mirrorHeight: 0.1}` | @1652464 |
| 镜条 fixture（唯一质量源） | `SetAsOrientedBox(1.5, 0.05, (0,0), π/4)`，friction 0.7、restitution 0、**density 0.2**、userData `type:"mirror"` | 构造体 |
| 死局部形状 | `o = SetAsOrientedBox(0.9, 0.9, (0,0), 0)` **建而未用**（未 CreateFixture） | 构造体（变量 o） |
| 附属圆 ×2 | r=0.3 @ (±1.1, ±1.1)（默认 density 0，无质量贡献） | @1651573 附近 |
| 体角 | `SetAngle(options.rotation)` | 构造体 |
| 关节 | revolute(body, **groundBody**, worldCenter)；`enableLimit=true`、**maxMotorTorque=500** @1652139、`motorSpeed=0`、`enableMotor=true` | 构造体 |
| updateState | `joint.SetLimits(this.state, this.state)` @1652603 —— **组状态 0/1 直接成为关节角限位（弧度）**：state0 锁 0rad、state1 锁 1rad（57.3°），马达扭矩 500 拉到位 | updateState |

任务书参数摘录（boxWidth 1.8 / mirror 3×0.1 / density 0.2 / maxMotorTorque 500 / motorSpeed 0 / enableMotor）
逐项核对属实，另补：镜条摩擦 0.7、restitution 0、限位即状态值本身。

### 4.2 我方对照

**无实现**（mechanisms.ts 无该类；level2.ts:525–527 落 `unknown`）。数据 0 使用（oracle 亦 0）→ **P2 潜在缺失**。
受影响关卡清单 = 空。复现：§1 扫描法 gid→Objects#11，结果 0。

## §5 wind（风）

### 5.1 原版参数表（@1732155–1739925，Window 之前）

| 参数/行为 | 值 | 证据 |
|---|---|---|
| **rotation 预加 90°** | `c.rotation += 90`（度，Device 基类再 ×π/180）→ level 数据 rot=−90 实际体角 0 | @1732672 |
| boxSize | `{x: −3, y: 2}` → e=(mpx(−1.5),mpx(1))=(−48,+32)px 按 −(rot+90)° 旋转，`x+=e.x, y−=e.y` | @1735738 + BoxedDevice |
| 类默认 options | `{boxWidth: 2.5, boxHeight: 0.6, windWidth: 2.6, windHeight: 10, frameName:"wind_base0000", layer:"liquids"}`；**windHeight 全类未引用（死参数）** | @1735526–1735557 |
| 实体梯形 fixture（非 flat） | `[(−1.85,0),(1.85,0),(1.25,0.6),(−1.25,0.6)]`（底 ±(W/2+0.6)、顶 ±W/2、高 H），friction 0.4、restitution 0、density 0.2，默认 filter（cat1/mask65535，**实体可站立**） | @1732990 |
| flat 分支 | `properties.flat` → `SetAsOrientedBox(1.25, 0.3, (0,0.3), 0)`（矩形，中心上移 0.3） | @1732856 |
| 风柱传感器 | `SetAsOrientedBox(windWidth/2, properties.length/2, (0, length/2+0.5), 0)`，isSensor=true，transparent；windWidth=`properties.windWidth ?? 2.6` | @1733839–1733876、@1734124 |
| 作用对象过滤 | 接触回调仅认 `c.sprite.character != null` 的体（**只有两名角色**；箱/球/机关都不进 activeBodies） | 回调体 |
| 施力（update，state==1 时逐 active 体） | `dir=(0,1)R(rot)`；`F = dir·(1.2+0.2·sin(game.time.now/1000))·100·(1−dist/length)`，dist=体距机心距离；`ApplyForce(F, (0,0))`（字面世界原点 @1736623） | @1736458 |
| 阻尼 | `v ← v·0.975^(game.time.elapsed/16.67)`（60fps 归一；**英文注释为再分发者所加 @1736671–1736809，代码在执行路径，金轨迹 forest_03 f724–760 实证生效**） | @1736959 |
| 限速 | `v ← min(|v|, 15)` | @1737204 |
| invertInput | `g = properties.invertInput ? !state : state`（update 与 updateState 双处；**数据零使用**） | @1736109 |
| updateState | 仅可见性/音效（windEffect、wind.loop），无物理 | 尾部 |
| ocupy | 6 瓦片 (b±?,c/c−1) | 尾部 |

**构建来源注记**：该 bundle 为社区重制版——文件头 @0–7210 有成片自适应 tick 调度英文注释
（"Adaptive tick scheduling"、"The TPS at which the original game is designed is 60" 等），Wind 阻尼/限速段
即重制者补丁。录制游戏与 oracle 均按补丁后行为运行，我方按此复刻正确。

### 5.2 我方对照（mechanisms.ts:577–659、level2.ts:133–155、world.ts、ForestRoom.ts）

| 项 | 原版 | 我方 | 结论 |
|---|---|---|---|
| 体角 | rad(rot+90) | `bd.angle=(π(def.rotation+90))/180`（:597） | ✅ |
| 机心位置 | BoxedDevice e=(−48,32)R(−(rot+90)°) | windBodyPos（level2.ts:149–155）同式；forest_03 金轨迹已证 | ✅ |
| 梯形 | (±1.85,0)/(±1.25,0.6) fr0.4 re0 density0.2 | :600–605 全同 | ✅ |
| flat 变体 | 有 | **无**（WindDef 未解析 flat） | P2（数据 0 使用） |
| 传感器几何 | windWidth/2 × length/2 @(0,length/2+0.5)，sensor，默认 filter | :607–613 同——**但 windWidth 硬编码 2.6** | ❌ **P1** |
| windWidth | properties.windWidth ?? 2.6 | 2.6 写死（:608） | forest_22 objid=26 数据 =1.5 → 该风柱感温区宽 73% 偏宽（原版 1.5m 柱外 0.55m 我方仍推人）。**受影响：仅 forest_22 一柱**。复现：该关 id=26 风柱旁侧站位对比 |
| 力公式 | dir·(1.2+0.2sin t)·100·(1−dist/length) | :640 同式 | ✅ |
| 力尾符号 | (1−dist/length) 可为负（柱末端 0.5m 内角点 dist>length → 反向微力） | `Math.max(0, …)` 截零（:640） | P2（≤9N、限柱尾，实测影响微小） |
| ApplyForce 点 | (0,0) 字面 | :642 字面同 | ✅（语义存疑见 §7.2，双方一致无实效差） |
| 阻尼 | 0.975^(elapsed/16.67) | ×0.975/步（fixed dt 1/60，:646） | ✅（fixed-dt 等价） |
| 限速 | 15 | :648–650 | ✅ |
| 角色过滤 | sprite.character | activeRoles（roleOfBody "pers"） | ✅ 等价（含"首个 End 提前移除"语义同构） |
| 组同步 | Wind 无 signal，deviceChanged OR 赋值 | hasSignal=false + manager.register（:744–746） | ✅ |
| initialState | `+properties.initialState\|\|0` | num(props.initialState)（level2.ts:522/539） | ✅ |
| **帧序** | 角色 update → 设备链（风在后）→ Step | **风 applyForce → 角色 update → Step**（world.ts:247–249） | P2：力与阻尼都在 Step 前生效，线性叠加等价；**实差仅在跳跃帧**（原版风内起跳初速 ×0.975≈15.11 vs 我方 15.5）与跑力门限 ±2.5% 边界 |
| 时基（F6） | `game.time.now`＝页面墙钟 ms（相位逐跑随机不可复现） | 缺省 simTimeS（det/门禁）、生产墙钟 ForestRoom.ts:193–196、e2e FW_WIND_PHASE | ✅ 等价类（原版本就非确定，三口径见 world.ts:62–70 注释） |
| invertInput | 有 | 未解析 | P2（数据 0 使用） |
| `params.WIND = {}` | — | params.ts:155 空壳，**零引用** | P2 文档隐患（本 §5.1 即全集，可回填） |

Wind 残差合计：**P1×1（windWidth）+ P2×5**（flat、invertInput、力尾截零、帧序、WIND 空壳）。

## §6 汇总

- **差异总数：P0=0，P1=2，P2=9**（portal 缺失、boxmirror 缺失、infinitemirror 缺失、BOX/BALL 常量陈旧×2、
  WIND 空壳、wind flat、wind invertInput、风力尾截零、风-角色帧序；其中前五项为"死代码/零引用"类隐患）。
- **P1 受影响关卡清单**：
  1. 旋转箱中心矫正缺失 → **forest_24_1**（箱 objid=31，Δ=(+8.1,+11.0)px）；
  2. windWidth 硬编码 → **forest_22**（风 objid=26，柱宽 1.5 被当作 2.6）。
- 复现思路见 §3.3 / §5.2 对应行；均为纯数据+源码推演，可由生产槽以运行时探针二次核。

## §7 存疑项

1. **旋转箱结论未经运行时验证**（§3.3）：算术从 @1623528 原式直接推得，但 resSprite/enable 链是否还有未建模
   等效（05 号档 lever 教训）未排除——建议按金轨迹判位后再改 level2.ts。
2. **ApplyForce(b,(0,0)) 的世界原点语义**（@1736623）：box2d 对非质心世界点施力本应生扭矩；原版角色
   fixedRotation 使其无实效。我方字面一致且角色同 fixedRotation → 无实效差。若日后风改作用于可转体（原版
   不会），需重审该点。
3. **oracle 为社区重制版**（§5.1 注记）：风阻尼补丁等修改已按"录制游戏实际行为"采纳；如未来拿到原厂
   未修改构建，Wind 阻尼段需重审（原厂应为常量 0.975/帧，无 elapsed 归一、无 15 上限——本档不改判，
   以我方金轨迹实证为准）。
4. level2.ts:542 的 LargeObjects unknown 分支对 portal **静默丢弃**（无 unknown 之外的告警）——当前数据安全，
   属未来移植风险，建议届时加显式告警（本档不改源码）。
5. utf-8 与 latin1 偏移差（+9，全在 1.84M 后字体数据区）：本档所有 @N 已统一 latin1 字节偏移；若以文本模式
   read 复核会偏 9 字节。
