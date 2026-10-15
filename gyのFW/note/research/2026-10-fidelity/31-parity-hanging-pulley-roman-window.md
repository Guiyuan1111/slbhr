# 31 号档 —— hanging / pulley / roman / window 逐参数保真审计（rpb 槽，2026-10-15）

> 审计方式：原版 `Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js`（2,218,873 B）python3 按字节偏移切片阅读，
> 与我方 `packages/shared/src/kernel/{mechanisms,build,b2}.ts`、`level2.ts`、`character.ts` 逐参数对照。
> 模块定位：`define("States/Level/Devices/Hanging")` @**1645763**、`Pulley` @**1697647**、`Roman` @**1708275**、`Window` @**1739926**（共 27 个 Devices 模块，160.9 万–174.2 万区间）。
> 评级：P0=宏观可感知 / P1=边缘或非物理面 / P2=数值微差·等价实现。
> 本槽只审计落盘，未改任何 .ts/.mjs 源码；探针脚本只读 import 仓库源码。
>
> **〔2026-10-15 主会话修复状态〕** §1.3 P0 已修（commit 907ba54）：`mechanisms.ts` buildHanging
> 锚点体 fixture 改原版精灵矩形 38×35px（density 1/friction 0.2/cat 0/mask 65535），
> 探针复跑锚点体 mass=1.2988/inertia=0.2821 逐位归位、8 N·s 冲量板心摆幅 339→415px、绳角 ±18°；
> det r32 基线漂移面=hanging 7 关（02/12/12_1/19/19_1/25/25_1）与其余 41 关位级不变，
> e2e forest_12 repeat3 ALL PASS。§window P1（渲染缺失）待办：客户端补 WindowLeft/Center/Right 绘制。

## 0. 公共事实（两侧共享的换算与缺省）

| 事实 | 原版证据 | 我方 |
|---|---|---|
| PTM=32，物理=(−x/32,−y/32) | `setPTMRatio(32)` @1894916；Body 构造 `position.SetXY(-pxm(c),-pxm(d))` @1581025 段 | b2.ts:46 `px2m=-px/32` ✓ |
| 重力 1000px/s² | `gravity.y = 1e3` @1895228 | build.ts:176 `(0,-31.25)` ✓ |
| 插件缺省 friction 0.2 / restitution 0 / density 1 | @1559777 | —（各 fixture 显式给值，见下） |
| `enable()` 出来的体恒为 dynamic | `enableBody` @1561493：`new Body(game,a,a.x,a.y,2)`，第二参只控子精灵递归 | b2 动态体显式建 ✓ |
| enable 自动建"精灵尺寸矩形"fixture | Body 构造尾 `b && this.setRectangleFromSprite(b)` @1581025 段；setRectangleFromSprite @1593177 → `addRectangle(w,h,0,0,rot)` @1590003（density=world.density 等） | —（关键差异点，见 §1.3） |
| `body.mass = 0` ⇒ `SetType(b2_staticBody)` | mass setter @1599100：`if (0===a) this.data.SetType(b2_staticBody)` | 直接建静态体 ✓ |
| vendor 缺省 filter cat1/mask65535/group0 | 我方 vendor/box2d.js:6881（原版引擎字节提取） | makeFixtureDef 不触碰 filter → 同一 vendor 缺省 ✓ |
| distance joint 缺省 frequencyHz=0/dampingRatio=0，Initialize 重置为 0 | vendor/box2d.js:8390-8396 | 同一 vendor ✓（刚性绳） |
| 零质量动态体回退 mass=1、I=0、invI=0 | vendor/box2d.js:7334 ResetMassData | 同一 vendor ✓（hanging 锚点问题的机制根源，见 §1.3） |

## 1. Hanging（摆板）——7024dd5 修复后独立复核

### 1.1 逐参数对照表

| # | 参数 | 原版（偏移+摘录） | 我方 | 判定 |
|---|---|---|---|---|
| 1 | barWidth 取值 | @1646003-1646123 `this.barWidth = this.options.properties.barWidth \|\| this.options.barWidth`；@1649103 `d.prototype.options = { barWidth: 3.2 }` | mechanisms.ts:422 `def.barWidth ?? 3.2`；level2.ts:459 透传 properties.barWidth | ✓（`\|\|` vs `??`：barWidth=0 falsy 边界数据不存在，P2-nil） |
| 2 | 锚点/板位置点 | @1646123 `anchor = b2Vec2(polyline[0]+x, polyline[0][1]+y)`；@1646243 `pos = polyline[1]+x/y` | level2.ts:319-322 absPoints 绝对化；mechanisms.ts:423-424 pts[0]/pts[1] | ✓ |
| 3 | 板体类型/位置 | @1647083-1647203 `enable(p,!1)` → dynamic @1561493，体位=sprite 位=pos | mechanisms.ts:435-438 dynamic @ phys(pos) | ✓ |
| 4 | 锚点体类型/位置 | @1647083 `enable(g)` → dynamic，体位=anchor | mechanisms.ts:426-429 dynamic @ phys(anchor) | ✓ |
| 5 | **锚点体 fixture** | @1647143 `m_fixtureList.m_filter.categoryBits = 0`（其余不动）＝精灵矩形 fixture：hanging_anchor0000 帧 **38×35px**（MechAssets.json 实测）→ 1.1875×1.09375m，friction 0.2 / restitution 0 / **density 1**（@1559777 缺省），mask 保持 65535 | mechanisms.ts:430 `circleFixture(r=0.05, cat 0, mask 0, density 0)` | **✗ P0（惯量语义，见 §1.3）** |
| 6 | 板六边形顶点 | @1647563-1647923 `m=barWidth/2, n=m+0.1`；(m,0.12)(−m,0.12)(−n,0)(−m,−0.12)(m,−0.12)(n,0) | mechanisms.ts:433-446 同序同值 | ✓ |
| 7 | 板 fixture 物理 | @1647923-1648100 friction 0.4 / restitution 0 / density 2.5 / cat 65535 / mask 65535 | mechanisms.ts:446 同 | ✓ |
| 8 | 板阻尼 | @1647443 `SetLinearDamping(0.4), SetAngularDamping(0.3)`（仅板） | mechanisms.ts:447-448 | ✓ |
| 9 | 板默认精灵 fixture 清除 | @1647523-1647563 `j.clearFixtures()`（"_default0000" 34×34 矩形被清） | 从未创建 | ✓ 等价 |
| 10 | distance joint | @1648163-1648460 `o.Initialize(g.body.data, p.body.data, e, f)`，e=pxm(anchor)、f=pxm(pos)；频率/阻尼不设（缺省 0/0 刚性，vendor:8390） | mechanisms.ts:451-453 `Initialize(anchor,platform,phys(anchor),phys(pos))`，同一 vendor 缺省 | ✓ |
| 11 | revolute 轴点（7024dd5 修复点） | @1648523 `o.Initialize(g.body.data, p.body.data, f)`，**f=pxm(pos)=板心** | mechanisms.ts:457-458 `Initialize(anchorBody,platform,phys(pos))`，bodyA/B 序亦同（g 先） | ✓ |
| 12 | 限位 ±0.85π/2 | @1648643 `lowerAngle=(-0.85*Math.PI)/2, upperAngle=(0.85*Math.PI)/2`；@1648700 `properties.fullRotation \|\| (o.enableLimit=!0)`（限位值恒设、仅开关门控） | mechanisms.ts:459-463 `if(!fullRotation){ ±0.425π; enableLimit=true }` | ✓（fullRotation 时两者 enableLimit=false，无效限位等价；truthy vs `===true` 数据无冲突 P2） |
| 13 | revolute 钉锚关节 body 序 | @1648883 `o.Initialize(g.body.data, this.game.level.groundBody, e)`＝(锚, 地) | mechanisms.ts:466-468 `Initialize(groundBody, anchorBody, phys(anchor))`＝(地, 锚) | P2（无限位/电机，约束对称；参考角两侧均 0） |
| 14 | 电机 | 全关节无 enableMotor/maxMotorTorque | 同 | ✓ |
| 15 | 视觉宽 1.15 | @1646843 `h.width = 1.15*this.mpx(this.barWidth)`——只设贴图 sprite 宽（mpx 负号 → 负显示宽，仅翻转渲染），不进 fixture | 内核无 1.15；客户端 033e7a9 用 1.15×barWidth 贴图 | ✓ 只影响视觉 |
| 16 | 绳视觉/ update() | @1649243-1649363 rope 旋转=atan2(板−锚)，纯渲染 | 客户端层 | ✓ 不涉内核 |
| 17 | MechManager 注册 | Hanging 构造无 registerDevice 调用（不受组信号） | buildMechanisms 不注册 hangings | ✓ |

### 1.2 关卡数据面（48 关扫描，dict/list 双兼容重扫）

- hanging 共 7 关：forest_02(2)/12(3)/12_1(3)/19(2)/19_1(2)/25(1)/25_1(7)。02/12/12_1/25/25_1 全部 `fullRotation:true`（无限位风车板）；19/19_1 无该属性 → ±0.425π 限位。
- barWidth 覆盖仅 forest_25 `barWidth:9`、forest_25_1 `barWidth:3`（×7）；其余缺省 3.2。无第三折线点被使用（forest_02 id41 polyline 有 3 点，原版只读 [0][1]，我方同取 pts[0]/pts[1] ✓）。

### 1.3 发现 P0：锚点体零惯量 → 绳向摆动自由度丢失（附探针实测）

**机理**：原版锚点体保留 enable(g) 自带的精灵矩形 fixture（38×35px，density 1）→ mass=1.2988、I=0.2821。
我方锚点 fixture density=0 → vendor ResetMassData（vendor/box2d.js:7334）零质量回退 **mass=1、I=0、invI=0**。
joint2（锚↔板，轴=板心）把板心钉在**锚点旋转系**上：锚点惯量>0 时，板的重力/冲击扭矩经 joint2 反作用于锚点→锚点转=绳方向摆（钟摆 DOF）；invI=0 时该扭矩通道为零→板心在世界系焊死，只剩板自转。
03号档（note/evidence/forest_02/03号档）验证了自转 DOF（修复目标），但只测了板角、未测板心——绳摆 DOF 的丢失在其探针观测面之外。

**内核探针复现**（脚本收容 `note/evidence/forest_02/tools/rpb-hanging-anchor-probe.mjs`、`rpb-hanging-impulse-probe.mjs`，tsx 直跑，未改源码）：

1) 箱子（1.77m，density 0.45）空投 forest_02 h0 板东端（锚(384,264)、板(384,408)，fullRotation 语义）：

```
[A ours(density0 circle r0.05)] anchor mass=1.0000 inertia=0.0000 | board mass=1.9800
  f 30 board(384.0,408.0)px a=60.3° anchorA=0.00°        ← 板心恒不动
  f240 board(384.0,408.0)px a=444.1° anchorA=0.00°
[B original(rect38x35 density1)] anchor mass=1.2988 inertia=0.2821 | board mass=1.9800
  f 30 board(377.4,407.8)px a=59.2° anchorA=2.63°        ← 锚点摇摆，板心 ±6.6px
  f240 board(386.4,408.0)px a=430.5° anchorA=-0.96°
```

2) 板心 +x 方向 8 N·s 横向冲量（±0.425π 限位，forest_19 语义）：

```
[A ours] f30→f180 board(384.0,408.0)px ropeDeg=0.00 —— 完全零响应（冲量被约束整体吸收）
[B original-faithful] board 339.1→414.8→355.5px，ropeDeg +18.15→−12.35→+11.42 —— 衰减钟摆
```

**结论**：参数级差异实锤（fixture 密度/形状/惯量），结构级后果（绳摆 DOF 有无）经内核探针证实。
角色横跳落板/侧向推挤时原版板会显著荡开（75px+），我方纹丝不动。修复方向（锚点 fixture 换精灵矩形、density 1）属生产裁决，归 5.3/主会话；修复后需 det 全量重跑（含 hanging 7 关必漂）。
**存疑待核**：原版录制帧中摆板受横向冲击的实际摆幅（建议 5.3 用 oracle 帧对比 forest_19 落板场景做终裁）。

## 2. Pulley（滑轮）

### 2.1 逐参数对照表

| # | 参数 | 原版（偏移+摘录） | 我方 | 判定 |
|---|---|---|---|---|
| 1 | barWidth | @1698007 `properties.barWidth \|\| options.barWidth`；@1702327 缺省 `{barWidth: 2.7}` | mechanisms.ts:473 `?? 2.7`；forest_04 数据 2.5 透传（level2.ts:465） | ✓ |
| 2 | 轮锚点 | @1698127-1698247 `anchor1 = polyline[1] + (x, y − mpx(2))`；Device.mpx(a)=−32a（@1620996）→ **y+64px**（polyline 点下方 2m） | mechanisms.ts:478-479 `w1.y + 64` | ✓ |
| 3 | 双板位置 | @1698367-1698487 `o=polyline[0]+x/y`、`p=polyline[3]+x/y` | mechanisms.ts:474 `pts[0]/pts[3]` | ✓ |
| 4 | 板体 dynamic+fixedRotation | @1699387-1699447 enable(q)/enable(r)（dynamic）；@1700287-1700407 `SetFixedRotation(!0)` | mechanisms.ts:482-485 dynamic+`bd.fixedRotation=true` | ✓ |
| 5 | userData | @1700447-1700527 `m_userData="reactable"`（角色跳跃 −1 冲量标记，原版 @1829382；character.ts:232-240 直译 ✓） | mechanisms.ts:486 `SetUserData("reactable")` | ✓ |
| 6 | linearDamping 0.1 | @1700527（无 angular damping，fixedRotation 下无意义） | mechanisms.ts:487 | ✓ |
| 7 | 六边形/密度 3 | @1700767-1701367 同 hanging 顶点，friction 0.4 / restitution 0 / **density 3**，**filter 不设** → vendor 缺省 cat1/mask65535 | mechanisms.ts:490-497 同顶点 density 3，不设 filter → 同一 vendor 缺省 | ✓ |
| 8 | 默认精灵 fixture | enable(q/r) 自动建（"_default0000" 34×34）→ @1700767 `g.clearFixtures()` 清除 | 从未创建 | ✓ 等价 |
| 9 | PulleyJointDef.Initialize 七参 | @1701847-1702147 `m.Initialize(q.body.data, r.body.data, e, f, q.body.data.GetWorldCenter(), r.body.data.GetWorldCenter(), 1)`——groundAnchor=pxm(anchor1/2)、localAnchor=双板**质心**、**ratio=1** | mechanisms.ts:503 `Initialize(plat1,plat2,phys(a1),phys(a2),plat1.GetPosition(),plat2.GetPosition(),1)` | ✓（P2：GetPosition vs GetWorldCenter——对称六边形质心=原点，数值差 ~1e-19 量级） |
| 10 | collideConnected | 不设 → vendor 构造器 `collideConnected=!0`（vendor/box2d.js:8939），双板互撞 | 同一 vendor 缺省 | ✓ |
| 11 | 电机/限位 | 无 | 无 | ✓ |
| 12 | 视觉 1.3×barWidth / 轮 / 三段绳 | @1699687 `plat1.width=1.3*mpx(barWidth)`（负显示宽）、@1701367-1701727 wheel、@1702447-1704247 update() 绳——全部渲染层 | 内核无；客户端 033e7a9 同口径 | ✓ 只影响视觉 |

数据面：pulley 共 10 关（04、04_1、05、21、24、24_1、29、30、bonus_1、bonus_2），折线 4 点序=板1/轮1/轮2/板2 ✓；仅 forest_04(+_1) 有 `barWidth:2.5`。

**本机制无 P0/P1 差异。**

## 3. Roman（罗马杆）

### 3.1 逐参数对照表

原版模块名实为 `define("States/Level/Devices/Roman", ["./BoxedDevice"])` @1708275。

| # | 参数 | 原版（偏移+摘录） | 我方 | 判定 |
|---|---|---|---|---|
| 1 | 点序分支 | @1708570 `polygon[0][0]===polygon[1][0]` → 竖直支 `m=2*pxm(poly[2][0]−poly[1][0]), k=pxm(poly[1][1]−poly[0][1]), f=0.6, d=−atan(k/(m/2))`；否则 `m=2*pxm(poly[1][0]−poly[0][0]), d=+atan(k/(m/2))` | mechanisms.ts:519-527 同式（Device.pxm 负号→我方 `2*−(dx)/32` 等）；附加 length>=3 守卫（数据无 2 点竖直杆，P2-nil） | ✓ |
| 2 | bar 挂点 h | @1708995 `h = poly[1]+(x, y)+（mpx(1), −mpx(1))`；BoxedDevice @1623528 矫正 `c.x+=mpx(boxSize.x/2), c.y−=mpx(boxSize.y/2)`，boxSize={2,2}，**插件 mpx 正号** → options.xy=Tiled+(32,−32)；与 (−32,+32) 相消 → **h=poly[1]+Tiled=绝对 p1** | mechanisms.ts:531 `h={x:p1.x,y:p1.y}`（level2 absPoints 绝对点） | ✓（oracle 旁证：forest_24 r28 枢轴 (624,448)、底座 (624,512)） |
| 3 | bar 体 | @1709235 enable(e) → dynamic；@1710195 `SetAngle(d \|\| 0)`（fixture 创建后） | mechanisms.ts:533-537 dynamic，`bd.angle=d\|\|0`（创建时） | ✓ 等价（fixture 局部系不随时序变化） |
| 4 | bar 梯形 | @1709700-1709835 `(−m/2,−f/2)(m/2,−f/2)(m/2−2,f/2)(−m/2+2,f/2)`，f=0.6 | mechanisms.ts:538-543 同（±0.3、内收 2m） | ✓ |
| 5 | bar fixture | @1710075-1710195 friction 0.7 / restitution 0 / density 0.1 / cat 1 / mask 65535 | mechanisms.ts:543-549 同 | ✓ |
| 6 | bar 默认 fixture 清除 | @1709715 `e.body.clearFixtures()`（tileSprite 精灵矩形，宽度 mpx(m) 为负——原版即如此，清除后无影响） | 从未创建 | ✓ |
| 7 | 底座位置 | @1710315 sprite `(h.x, h.y − mpx(k))` → Device.mpx 负号 → y=h.y+32k px | mechanisms.ts:551 `baseCenter={h.x, h.y+32*k}` | ✓ |
| 8 | 底座静态化 | @1710675-1710795 `g.body.clearFixtures(), SetAngle(rad(rotation)), (g.body.mass=0)` → mass setter @1599100 `0 ⇒ SetType(b2_staticBody)` | mechanisms.ts:552-555 直接 b2_staticBody | ✓（含 rotation=0 等价；RomanDef 不解析 rotation 字段，数据全 0，P2 备注） |
| 9 | 底座三角/fixture | @1710795-1711155 `(−1,0)(0,k)(1,0)` 同序；friction 0.7 / restitution 0 / density 0.1 / cat 1 / mask 65535 | mechanisms.ts:556-566 同序同值 | ✓ |
| 10 | revolute | @1711275-1711395 `l.Initialize(e.body.data, g.body.data, h)`，h=**bar.GetWorldCenter()** 克隆；无电机无限位 | mechanisms.ts:568-570 `Initialize(base, bar, bar.GetPosition())` | P2×2（body 序对调——无限位/电机约束对称；GetPosition vs GetWorldCenter——梯形对称质心=原点） |
| 11 | ground 依赖 | 原版不用 groundBody（底座静态体独立） | mechanisms.ts:572 `void groundBody` | ✓ |
| 12 | 杆上角色交互 | 原版无专门"挂杆"代码（纯碰撞/摩擦 0.7 站立），reactable 标记不涉及 roman | character.ts 无 roman 特判 | ✓ |

数据面：roman 共 3 关 4 根——forest_14(+_1) 2 点（else 支，m=−13、k=+2.5、d≈−0.367rad）、forest_24(+_1) 各 2 根 3 点（竖直支，m=−10.5/−12、k=+2、d≈+0.364rad）。m 为负值两侧同式同数组同 vendor Set()，逐位一致 ✓。rotation 全 0。

**本机制无 P0/P1 差异。**

## 4. Window（窗口）

### 4.1 逐参数对照表

| # | 参数 | 原版（偏移+摘录） | 我方 | 判定 |
|---|---|---|---|---|
| 1 | 中心化/横竖交换 | @1740046-1740286 `b.width<b.height ? (swap, b.x+=b.height/2, b.y+=b.width/2, rotation=−90) : (b.x+=w/2, b.y+=h/2)`——注意换算基于旧 w/h，两支中心相同 | mechanisms.ts:669-679 同（先中心后交换判断）；level2.ts:470-477 rect 原样 | ✓ |
| 2 | 体 | @1740526-1740700 enable(sprite)→dynamic→clearFixtures→SetAngle(rad(rotation))→`this.body.static=!0`（→SetType static） | mechanisms.ts:680-683 直接 static @ phys(center) | ✓ |
| 3 | 盒 fixture | @1740766-1741246 `SetAsOrientedBox(width/2, height/2, (0,0), 0)`（width/height 已被 Device 基类 @1619261 pxm 化，含交换后值）；friction 0.7 / restitution 0 / density 0 / cat 1 / **mask 61695**（0xF0FF，不含角色 bit4——**角色穿窗、道具被挡**）；body 角在体上（−90° 时经 R(−π/2) 与我方 fixture 角方案世界几何相同） | mechanisms.ts:684-693 SetAsOrientedBox(w/2,h/2,0,rot)；0.7/0/0/cat1/61695 | ✓ |
| 4 | userData | @1741006 `{lightProperties:{type:"transparent"}}`（光照系统用，物理无读取） | 无 | P2（物理等价） |
| 5 | dx/dy | @1741246-1741366 `d = new b2Vec2(properties.dx, properties.dy)`——**局部变量，此后无任何引用（死代码）**；state=0；registerDevice 入组但 Window 无 updateState/checkState 重载（Device 空实现→_updateState 仅 updateLight，lights 空） | level2.ts:474-475 存 dx/dy；内核 buildWindow 不读 | ✓ 语义相同（静态墙永不运动；dx/dy 不开洞——原版无地面开洞逻辑，build.ts 亦无） |
| 6 | group | 原型缺省 `{group:0,dx:4,dy:0}` @1742206；bonus_1 数据 `{dx:0,dy:0,group:4}` → 入组 4，但如上仅灯光链路，零物理效果 | group=4 存而不用 | ✓ |
| 7 | **渲染** | @1740286-1742086 sprite "_default0000" + 子精灵 WindowLeft/Right/Center0000，scale 1.05——**原版窗口可见** | mechanisms.ts:663-665 注释断言"WindowLeft/Right/Center0000 帧在全部已发行图集（A/B）不存在→原版运行时缺帧渲染空白→客户端刻意不渲染" | **✗ P1：注释前提为假（见 4.2）** |

### 4.2 发现 P1（视觉/文档事实错误，物理无涉）：窗口帧实际存在

`WindowLeft0000`/`WindowCenter0000`/`WindowRight0000` 实测存在于 **A–F 全部 6 套**发行图集：
`Fireboy-and-Watergirl/output/{A,B,C,D,E,F}/assets/atlasses/MechAssets.json`（A 套帧框：Left 46×48 @376,1802、Center 108×46 @264,1802、Right 46×46 @426,1802），
**且我方仓库副本 `packages/client/public/assets/atlasses/MechAssets.json` 同样齐全**。
即原版运行时窗口（forest_bonus_1 两处）是可见实体（_default0000 底 + 三帧窗框、1.05 缩放），我方客户端不渲染 → 视觉保真缺口 + mechanisms.ts:663-665 注释失实（该注释是"不渲染"决策的依据）。
物理面（静态盒、cat1/mask61695）两侧一致，无碰撞差异。

数据面：window 仅 forest_bonus_1（2 处 64×32，无交换支触发）。

## 5. 总账

| 机制 | 对照项 | ✓ | P0 | P1 | P2 |
|---|---|---|---|---|---|
| hanging | 17 | 15 | **1**（锚点 fixture 零惯量→绳摆 DOF 丢失，探针实证） | 0 | 2（joint3 body 序；truthy/`\|\|` 边界） |
| pulley | 12 | 12 | 0 | 0 | 1（localAnchor 质心 vs 原点，等价） |
| roman | 12 | 10 | 0 | 0 | 2（joint body 序+质心；rotation 字段未解析，数据全 0） |
| window | 7 | 6 | 0 | **1**（帧存在、原版可见 vs 我方不渲染，注释失实） | 1（userData lightProperties） |

- P0 清单：**hanging 锚点体 fixture**（mechanisms.ts:430 `circleFixture(0.05, cat0/mask0/density0)` vs 原版精灵矩形 38×35px density1 → mass 1.2988/I 0.2821）。修复与否及关卡影响面归 5.3 裁决；本档仅提交证据与探针。
- P1 清单：**window 可见性**（mechanisms.ts:663-665 注释前提为假；客户端不渲染窗口）。
- 探针脚本：`note/evidence/forest_02/tools/rpb-hanging-anchor-probe.mjs`、`rpb-hanging-impulse-probe.mjs`（tsx 运行，只读 import，输出已内嵌 §1.3）。
- 复核结论：7024dd5 的轴点修复本身正确（@1648523 板心轴 + filter 65535² 均对）；其遗留问题在锚点体惯量（03号档探针观测面外）。

## 6. 存疑项（不下终判）

1. 原版录制游戏中摆板受角色横跳的实际摆幅/频率（本档为参数+内核结构实证，行为面建议 5.3 用 oracle 帧对比 forest_19 落板定案）。
2. hanging anchor 帧 38×35 依赖 MechAssets 图集（A–F 同尺寸，已抽查 A；若后续发现其他发行渠道图集尺寸不同需复核质量数值）。
3. roman `rotation` 字段：我方 RomanDef 未解析（若未来数据出现非 0 旋转会偏）；48 关现状全 0，无实际偏差。
4. forest_bonus_2 pulley 使用非整数坐标（y=743.051…px）：两侧同公式同精度直写，未做数值对照（缺 oracle 采样点）。
