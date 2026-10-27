# 30 · 保真审计：platform / pusher / lever / Device 基类 逐参数对照

> 槽：rpa（repo-parity-A）。日期 2026-10-15。只读审计，未改任何 .ts/.mjs 源码。
> 事实源：`Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js`，**当前版本 2,218,873 B**（mtime 2026-10-15）。
> ⚠ 该文件与 05 号文档提取时（2,273,196 B）不是同一份——**本文所有 @偏移 只对当前版本有效**，与 05 号的偏移不可互查。
> 定位法：`python3` `re.finditer(r'define\("States/Level/Devices/…"')` + 子串 find。切片留存 `TEMP/rpa/*.js`（Device/BoxedDevice/Lever/Pusher/MovingPlatform/BoxPrototype，gitignore 内）。
> 我方实现：`packages/shared/src/kernel/{mechanisms,build,b2,world}.ts`、`packages/shared/src/level2.ts`。
> 运行时探针：`TEMP/rpa/probe{,2,3}.mts`（`npx tsx` 可复跑，本文 §5 引用其输出）。
> 〔2026-10-27 收容更新〕TEMP/rpa 已清库，切片与四探针收容 `tools/breakpoint-rpa/`（本目录下）；文中 TEMP/rpa 复现路径按新址替换。

**结论速览：P0 = 0，P1 = 2（其中 1 条为已知跨机制时基），P2 = 11。** 本槽四机制的全部物理语义（关节类型/锚点/限位/马达/密度/摩擦/过滤/坐标换算/组联动）与原版逐参数一致；唯一实测偏差是转臂平台限位过冲（oracle 有逐帧硬钳、内核无），见 §5-D1。

---

## §0 公共基础设施事实（先读，各节引用它）

| # | 事实 | oracle 证据（偏移+摘录） | 我方 | 判 |
|---|---|---|---|---|
| 0.1 | PTM=32：`setPTMRatio(32)` | @1894883 `this.game.physics.box2d.setPTMRatio(32)` | b2.ts 头注释、phys() | ✓ |
| 0.2 | 物理坐标 = (−px/32, −py/32)，双轴镜像：Body 构造 `position.SetXY(-this.world.pxm(c), -this.world.pxm(d))` | @1581500 | mechanisms.ts:16-18 `phys(B,x,y)=new b2Vec2(-x/32,-y/32)` | ✓ |
| 0.3 | PointProxy 双取负（get 端 `mpx(-gettor())`） | @1601226 `return this.world.mpx(-this.gettor.call(this.object).x);` | 同上 + m2px | ✓ |
| 0.4 | 重力：`gravity.y = 1e3`(px/s²) → settor `pxm(-a)` → 物理 **−31.25 m/s²** | @1895195 + PointProxy setter | build.ts:176 `new b2World(new b2Vec2(0,-31.25), true)` | ✓ |
| 0.5 | enable 默认动态体：`enableBody` → `new Body(game,a,a.x,a.y, 2)`（type 2=dynamic）+ anchor 0.5 | @1561562 | Lever/Pusher/平台均 `bd.type=b2_dynamicBody`（mechanisms.ts:98,172,260） | ✓ |
| 0.6 | 零密度动态体兜底：`m_mass>0 ? … : ((this.m_mass = 1), (this.m_invMass = 1))`，且 I=0→invI=0（不可自转）；localCenter 保持 (0,0) | @1435762 ResetMassData | vendor/box2d.js 字节级同源（grep 实证该行在 vendor 内）；探针：forest_02 平台 `GetMass()=1`、forest_07 转臂 `GetMass()=1.32=0.5×(3×0.88)` | ✓ |
| 0.7 | prismatic 轴**归一化**：`m_localXAxisA = a.localAxisA.Clone().SelfNormalize()` ⇒ 行程单位=米，state1 位移=+（dx,dy)米（物理）＝屏幕 (−32dx,−32dy)px | @1174094 | mechanisms.ts:302-312（lower=−hypot(dx,dy)）；探针：dx=5 平台 state1 位移 −160.00px 恰=5m | ✓ |
| 0.8 | revolute 关节角 `GetJointAngleRadians = bodyB.a − bodyA.a − ref`；oracle 侧 bodyA=机关体、bodyB=groundBody ⇒ 关节角=−体角 | @1169374；Initialize 序见各节 | 我方同 Initialize 序（Lever@120、平台@288/304） | ✓ |
| 0.9 | **prismatic 无 `GetJointAngleRadians`**（vendor 方法表 grep：只有 GetJointTranslation/GetJointSpeed…）⇒ oracle `update()` 的角度钳制只作用于转臂 | vendor/box2d.js 方法清单 | 我方 updateState 分支 `isRevulse…? -2 : 2` 等价（@1680382 的存在性判断恒等价） | ✓ |
| 0.10 | options 合并：`deepObjectExtend` **只填缺失键永不覆盖**（`null==a[c] && (a[c]=clone(b[c]))`），顺序 `_defaults ← 地图对象 ← 类原型 options` ⇒ 地图数据 > 类默认 | 函数体 @2214834；调用序 @1618884-1619161 | level2.ts:444-449 显式缺省（dx:4/dy:0/group:0）+ mergedProps（level2.ts:297-300 图块集 tileproperties ← 对象 properties） | ✓ |
| 0.11 | groundBody = Ground 设备体的**裸 b2Body**：`this.game.level.groundBody = this.groundBody.data`，userData "ground"；`mass=0` setter → `SetType(static)` | @1790244；mass setter @1599242 | build.ts:179-183 静态体 (0,0) + SetUserData("ground") | ✓ |
| 0.12 | 地面 fixture 常数（影响机关碰撞面）：`categoryBits=1, maskBits=4369, friction=0.8` | @1801193 createGroundFixture | build.ts:88-94 | ✓ |
| 0.13 | 求解迭代 8/3、固定帧率口径 referenceTPS=60；但 **oracle 实跑为可变 dt**：`useElapsedTime=!0` + `Step(Math.min(0.04, elapsed/1000), 8, 3)` | @1896600、@1896799、@429 | world.ts:266 `Step(dt,8,3)`，dt 由调用方给（服务端 1/60） | **P1-D2** |
| 0.14 | 组同步 MechManager：`deviceChanged`：`g=源.state`，再 `null != b.signal && (g = g || b.state)`（组内信号源 OR），随后 `null == b.signal && (b.state = g)`，对全组 `_updateState()`；信号源 state 不被覆盖 | @1836841、@1836997、@1836632 | mechanisms.ts:57-80（OR→非信号源赋值+signalApply） | ✓ |
| 0.15 | `resetStates()`：开局（`levelStarted=!0` 时）对全部设备 `updateState(!0)` | @1836240、调用点 @1898149 | 内核无对应（平台已贴限位，见 §5-P2b） | P2 |
| 0.16 | 工厂表 classNames：`pusher→Devices.Pusher, lever→Devices.Lever, platform→Devices.MovingPlatform` | @1837145/1837174/1837224 | buildMechanisms（mechanisms.ts:710-750） | ✓ |

---

## §1 Device / BoxedDevice 基类

oracle：`define("States/Level/Devices/Device" @1618052`、`BoxedDevice @1623519`。

| 参数 | oracle（偏移+摘录） | 我方（文件:行） | 判 |
|---|---|---|---|
| state 初值 | @1619482 `this.state = null != this.options.properties ? +this.options.properties.initialState \|\| 0 : 0` | mechanisms.ts:28 `state = 0`（数据无 initialState，见 §6） | ✓ |
| 宽高换算 | @1619280 `options.width = pxm(width)`（插件正 pxm=px/32） | level2 存 px，mechanisms 除以 32 | ✓ |
| Device.mpx/pxm 带负 | @1621015 `return this.game.physics.box2d.mpx(-1 * a)` | b2.ts:46 `px2m(px)=-px/32`、mechanisms phys() | ✓ |
| 体角 | Device @1619725 区段 `sprite.body.data.SetAngle((Math.PI * c.rotation) / 180 \|\| 0)` | 平台 mechanisms.ts:266 `bd.angle = rotation*π/180`；Box 族 level2 `rotation: num(o.rotation)`→buildBox mechanisms.ts:348 | ✓（平台/箱）；**Lever/Pusher 未建模 rotation**，数据恒 0 → P2-D3 |
| BoxedDevice boxSize 缺省 | @1624083 `d.prototype.boxSize = { x: 2, y: 2 }` | level2 图块中心换算（64×64 中心=矫正后值） | ✓ |
| BoxedDevice 中心矫正 | @1623863-1623896 `e=new b2Vec2(mpx(boxSize.x/2), mpx(boxSize.y/2))`（**插件正 mpx**，=(32,32)px）→ `SelfRotateRadians(−π·rot/180)` → `c.x+=e.x; c.y-=e.y`；rot=0 ⇒ 中心=(x+32, y−32) | level2 `tileObjRect`+`centerOf`（顶边换算+中心）：gid 对象 y 取底边，64×64 中心=（o.x+32, o.y−32）恒等；带 rot 的通式已在 box 分支落地（另一槽工作树未提交 diff 同式），lever/pusher 分支尚未带 rot | ✓（rot=0）/ P2-D3（rot≠0 潜在） |
| registerDevice | 构造尾调用（Lever @1655340 区段 `this.registerDevice()`；Pusher `doRegister()`；平台 `this.registerDevice()`） | buildMechanisms 循环 `manager.register(...)`（mechanisms.ts:721-746） | ✓ |
| update/updateState 管线 | @1622362 区段 `update()→checkState()`；`_updateState()→updateLight+updateState()`（信号驱动） | world.ts:254-263 每步 levers→pushers checkState；`signalApply()`=updateState（mechanisms.ts:42-44,324-326） | ✓（次序差异见 §5-P2d） |
| ocupy 占格 | @1624193 `b=options.x/32…` 2×2 占格（导航/尘埃用，非物理） | 内核无（纯逻辑/视觉） | P2-D10 |
| 灯/groupColors | @1621465 `groupColors={1:#ff0000,…7:#9933FF}`、updateLight | 客户端层，非本槽物理 | —（不计） |

---

## §2 Lever（拉杆）

oracle：`define("States/Level/Devices/Lever" @1653060`。继承 BoxedDevice（2×2 矫正 ⇒ 杆体中心=64×64 图块中心）。

| 参数 | oracle（偏移+摘录） | 我方（mechanisms.ts） | 判 |
|---|---|---|---|
| 体 | `physics.box2d.enable(stickSprite)` 动态体 @1653272 区段，clearFixtures @1654470 区段 | :97-101 动态体 + 无默认 fixture | ✓ |
| 杆 fixture | @1654494 `SetAsOrientedBox(0.15, 0.7, new box2d.b2Vec2(0, 0.55), 0)`（半尺寸 0.15×0.7、局部中心 +0.55m=屏幕上方 17.6px） | :104 同式 | ✓ |
| 摩擦/恢复/密度 | @1654532/1654551/1654673 `friction=0.7, restitution=0, density=1.6` | :107-109 同值（探针：mass=0.672=1.6×0.42m²） | ✓ |
| 过滤 | @1654690/1654719 `categoryBits=1, maskBits=61695` | :110-111 `GROUND_CAT/LIQUID_SENSOR_MASK`(=1/61695, b2.ts:26,39) | ✓ |
| **revolute 支点** | @1654930 `k=this.body.data.GetWorldCenter()`、@1654947 `g=new b2Vec2(k.x, k.y − 0.7)`、@1655018 `j.Initialize(this.body.data, groundBody, g)`（**bodyA=杆、bodyB=地**，质心上方 0.7m=杆顶端） | :117-120 `wc=GetWorldCenter(); pivot=(wc.x, wc.y−0.7); jd.Initialize(this.body, groundBody, pivot)` 同序同点 | ✓ |
| 限位 | @1655060/1655081 `lowerAngle=−0.2π, upperAngle=+0.2π, enableLimit=true` | :121-123 同值 | ✓ |
| 马达 | @1655144/1655165/1655192 `maxMotorTorque=10, motorSpeed=0, enableMotor=true` | :124-126 同值（初值 0=未扳动不回弹） | ✓ |
| startPos | @1655317 `startPos === −1 ? SetAngle(GetLowerLimit()) : SetAngle(GetUpperLimit())` | :130-131 同语义（=== −1 否则上限） | ✓ |
| checkState | @1655787/1655904 `state==0 && ja*onis<0 → state=1, SetMotorSpeed(−4*onis)`；`state==1 && ja*onis>0 → state=0, SetMotorSpeed(+4*onis)`（+音效+signal） | :138-153 同逻辑（onFlip/events 替代音效/signal） | ✓ |
| onis/startPos 来源 | tileproperties（Objects.json local1 {onis:1,startPos:−1} / local2 {onis:−1,startPos:1}）+ 对象覆盖 | level2.ts:498-505 `num(props.onis,1)`/`num(props.startPos,−1)`，mergedProps 先图块集后对象 | ✓ |
| 初始 state | Device 规则=0（数据无 initialState，§6） | :28 | ✓ |

**运行时验证**（probe3.mts，隔离世界）：杆 SetAngle(36°) 后首步沉降到 **30.660°** 并 10s 纹丝不动——这是引擎本征平衡（重力矩 vs 限位/马达求解），oracle 用同一字节级引擎+同参数，必然同平衡位形；非偏差。onis/startPos 两种组合静置均不自翻（state 恒 0），与 kernel2.test.ts:337 金轨迹口径一致。

---

## §3 Pusher（按钮/压杆）

oracle：`define("States/Level/Devices/Pusher" @1704782`。继承 BoxedDevice（boxSize 缺省 {2,2}，未覆写 ⇒ 按钮体=64×64 图块中心）。

| 参数 | oracle（偏移+摘录） | 我方（mechanisms.ts） | 判 |
|---|---|---|---|
| 体 | 按钮 sprite 动态体 @1705677 区段 + clearFixtures + `SetAngle(π·rotation/180)` @1705929 | :171-174 动态体；rotation 未建模（数据恒 0，§6） | ✓/P2-D3 |
| 梯形顶点 | @1706013-1706363 `push(−w/2−0.5, 0), push(w/2+0.5, 0), push(w/2, h), push(−w/2, h)`；w/h 缺省 1/0.6（@1707157 `options={pusherWidth:1, pusherHeight:0.6,…}`） | :179-184 硬编码 [(-1,0),(1,0),(0.5,0.6),(-0.5,0.6)]，同序同值 | ✓ |
| 物理常数 | @1706445/1706463/1706503 `friction=0.7, restitution=0, density=0.1` | :187-189 同值（探针 mass=0.09=0.1×0.9m²） | ✓ |
| userData/过滤 | @1706528 `userData="pusher"`；@1706551/1706572 `categoryBits=1, maskBits=61695` | :190 fixture userData "pusher"、:185-186 过滤同值；**:175 body 也 SetUserData("pusher")（oracle 无）** | ✓ / P2-D9 |
| prismatic | @1706790 `Initialize(i.data, groundBody, i.data.GetWorldCenter(), (0,1))`（bodyA=按钮、轴 +y 物理=屏幕上） | :194-195 同序同锚（COM=局部 (0,0.2667)，同引擎自算） | ✓ |
| 行程/限位 | @1706874/1706905 `upperTranslation=0.7, lowerTranslation=0, enableLimit=true` | :196-198 同值 | ✓ |
| 马达 | @1706968/1706996/1707022 `motorSpeed=−15, maxMotorForce=5, enableMotor=true`（−15 拉回行程 0=弹起，5N 弱回弹） | :200-201 同值 | ✓ |
| checkState | @1707557/1707667 `state==0 && translation>0.2 → 1`；`state==1 && translation<=0.2 → 0` | :209-220 同阈值同语义 | ✓ |
| initialState | Device 规则（数据无；即使有也只致 1 帧瞬态，translation=0 会立即翻回 0） | 恒 0 | ✓/P2-D6 |
| ocupy 覆写空 | @1707800 区段 `d.prototype.ocupy = function(){}` | 不适用 | ✓ |

方向语义核验（读码推导，探针佐证）：梯形 y∈[0,0.6] 物理=屏幕上方凸台；玩家踩上→按钮下沉（translation 增大）>0.2 触发；松开 5N 马达拉回。kernel2.test.ts:355「角色踩上按钮→触发→组平台移动」已闭环。

---

## §4 MovingPlatform（移动平台/电梯/转臂闸门）

oracle：`define("States/Level/Devices/MovingPlatform" @1675269`。**直接继承 Device（非 BoxedDevice）**，中心化在自身构造器。

| 参数 | oracle（偏移+摘录） | 我方（mechanisms.ts） | 判 |
|---|---|---|---|
| 竖直变体矫正 | @1675701 `c.width < c.height ? (swap w/h, c.x+=c.height/2, c.y+=c.width/2, shapeRotation=−π/2) : (c.x+=c.width/2, c.y+=c.height/2, 0)`——swap 后 `c.height=原w`，故**两支中心同为 (x+原w/2, y+原h/2)** | :242-257 两支均 `cx+=def.w/2; cy+=def.h/2`（原值），wM<hM 时 swap+shapeRotation=−π/2 | ✓ |
| 体角 | @1676349 区段 `SetAngle(this.options.rotation)`（弧度，仅 Tiled 旋转；−π/2 只进 fixture） | :266 `bd.angle = rotation*π/180`（注释引 bundle 勘误史） | ✓ |
| padding | @1675979 `padding={x: paddingX??0, y: paddingY??0.06}` | :271 硬编码 padX=0、padY=0.06（数据无 paddingX/Y，§6） | ✓/P2-D4 |
| fixture | @1676607 `SetAsOrientedBox(w/2−padX, h/2−padY, (0,0), n)` | :271 同式 | ✓ |
| 摩擦/恢复 | @1676683/1676702 `friction=0.7, restitution=0` | :274-275 | ✓ |
| 密度 | @1676714 `null != properties.dtheta ? 0.5 : 0` | :276 `isRevolute ? 0.5 : 0`（dtheta=0 边界：oracle `null!=0` 真→0.5+revolute；我方 `!==undefined` 同真，dthetaPositive=false→限位 [0,0]，等价） | ✓ |
| userData/过滤 | @1676733 `{reflection:true}`；@1676996/1677033 `categoryBits=256, maskBits=4369` | :277-279（b2.ts:34,27 同值） | ✓ |
| 转臂 revolute | @1677270 `f = GetWorldCenter() − (offsetX\|\|0, offsetY\|\|0)`；@1677332 `Initialize(body, groundBody, f)`（bodyA=平台）；@1677550/1677592 `dtheta>0 ? [0, π·dtheta/180] : [π·dtheta/180, 0]`；@1677778 `maxMotorTorque=200, enableMotor=true`（motorSpeed 缺省 0） | :282-300（锚点用 GetPosition()——本 fixture 局部中心 (0,0)，COM≡origin，恒等；offsetX 硬编码 0，数据无 offsetX，§6；limit/torque 同值） | ✓/P2-D4 |
| 平移 prismatic | @1677915 `e = new b2Vec2(properties.dx, properties.dy)`；@1678007 `Initialize(body, groundBody, GetWorldCenter(), e)`；@1678155/1678186 `lowerTranslation=−e.Length(), upperTranslation=0, enableLimit`；@1678266/1678297 `motorSpeed=0.5, maxMotorForce=220, enableMotor` | :302-313 逐项同值（dx/dy 缺省 4/0 来自类原型 options @1679613，level2.ts:444-446 同缺省） | ✓ |
| state 初值 | @1678430 构造尾 `this.state = 0`（**无条件覆盖**，忽略 initialState） | :229 字段 `state = 0` | ✓ |
| updateState | @1680382 `b = (GetJointAngleRadians 存在 && dtheta>0) ? −2 : 2`；state0→`SetMotorSpeed(b)`、else→`−b`；@1680538 `ApplyForce((1,0),(0,0))`（1N 于世界原点） | :317-322 同逻辑同力（prismatic 无 GetJointAngleRadians ⇒ b 恒 2，我方 isRevolute 分支等价） | ✓ |
| checkState | @1680700-1681200 三个闭包：pos=GetJointTranslation（prismatic）/∓关节角（转臂），到端点仅**停音效** | :328-330 no-op（音效不属内核） | ✓ |
| **update() 限位硬钳** | @1679971-1680049 `GetJointAngleRadians() < GetLowerLimit() && SetAngle(−lower)`；`> GetUpperLimit() && SetAngle(−upper)`（**每帧 teleport 回限位**；prismatic 无此方法被 `null !=` 短路） | **无对应实现** | **✗ → P1-D1** |
| 视觉 | shapeSprite/BarCap×2/BarCenter、`sprite.scale 1.05/0.95`、lights、drawDarkMask | 客户端层 | P2-D10 |
| 音效 | "platform" 循环、到端停 | 内核 mech 事件 | P2-D10 |

**state1 位移方向**（读码+探针双证）：translation=−δ(沿轴) ⇒ lower=−|e| ⇔ 沿 +轴位移 |e| 米＝屏幕 (−32dx, −32dy)px。probe.mts：forest_02 dx=5 平台 state1 后位移 **(−160.00, 0.00)px**，与期望逐位一致。

---

## §5 差异清单（评级 + 复现探针）

### P0（宏观行为可感知的语义错）
**无。** 本槽四机制未发现类似 forest_02 摆板轴点/体角叠加那级的错误；所有锚点、Initialize 参数序、关节类型、限位区间、马达常数、过滤位、密度分支、坐标换算、组联动均逐字节对上。

### P1（边缘参数/工况级偏差）

- **D1 转臂平台限位过冲（oracle 有逐帧硬钳，内核无）**
  oracle @1679971-1680049 每帧把越限转臂 `SetAngle(∓limit)` 传送回限位点；内核仅靠 revolute limit 软约束。实测（TEMP/rpa/probe2.mts，forest_07 dtheta=90+offsetY=−1）：state1 马达 +2 持续压向上限，1.5s 后体角 **−91.257°** 并稳态维持；oracle 同工况每帧钳回 **−90°**。差 ≈1.26°（1.5m 臂尖 ≈3.3cm≈1px），14 个转臂平台（forest_07/18/27/27_1/30/31）全部受影响；mechSnapshot 的 angle 同步带此偏差。受力工况（角色站臂）下过冲幅度还受载荷影响，两侧不再逐帧一致。
  复现：`npx tsx TEMP/rpa/probe2.mts`（构建 forest_07→找 isRevolute 平台→idle 1s→state=1+signalApply→step 90→打印体角）。修复方向（供 5.3 裁决，本文不动源码）：在平台每步 pre-Step 或 post-Step 补「revolute 且越限时 body.SetAngle(−越限端)」钳制，注意只限 revolute（prismatic 在 oracle 被存在性短路）。
- **D2 求解时基：oracle 可变 dt（min(0.04, elapsed)，useElapsedTime=true @1896600/@1896799），内核固定 1/60**
  跨机制通项（非本槽独有），world.ts 头注/金轨迹流程已按「喂录制 dt 序列」管理。列此存档：任何「固定 60Hz 假设」下的马达行程/弹簧平衡在 oracle 慢帧（dt 到 40ms）会有亚厘米级差异。复现：fidelity-score 换可变 dt 序列对拍。

### P2（数值/结构微差，数据面当前不触发）

- **a. resetStates 未实现**（@1836240，开局 `updateState(!0)`）：平台创建值 motorSpeed 平移 0.5/转臂 0 vs oracle 开局 ±2。两者都已贴死限位（探针 idle 2s 位移 0），仅限位预紧差异，物理等效。
- **b. deviceChanged 变化守卫**：oracle 每次派发对全组 `_updateState()`（含未变化），内核仅 state 变化时 signalApply（mechanisms.ts:72-77）→ ApplyForce(1,0) 施加次数少几次；力 1N、质量 ≥1kg、且被关节约束吸收，无可测位形差。
- **c. Lever/Pusher/BoxedDevice 的 rotation 维度未建模**（体角 SetAngle + 中心矫正随 rot 旋转）：数据扫描 74 lever/73 pusher rotation 全 0（§6）→ 潜在项；box 分支已由并行槽在工作树补（未提交 diff 与本审计公式互证一致）。
- **d. 设备 update 次序**：oracle 经 Phaser Group.update 逆注册序混排；内核 levers→pushers 分组顺序（world.ts:256-257）。组内 OR 满足交换律，终态等效。
- **e. Pusher body 级 userData "pusher" 多余**（oracle 仅 fixture userData @1706528）：内核无任何 body 级 "pusher" 判定（world.ts 仅认 "pers"），惰性无害。
- **f. Lever onis/startPos 内核兜底 (1/−1)**：oracle 缺属性时为 undefined→NaN 比较→永不翻转；数据面 74/74 全经图块集合并命中（§6），永不触发。
- **g. 平台 paddingX/paddingY/offsetX 未进解析**（内核硬编码 oracle 缺省 0/0.06，offsetX 硬编码 0）：数据面 0 次使用（§6）→ 潜在项。
- **h. Lever/Pusher initialState 瞬态未建模**：数据面 initialState 只出现在 wind（19 次），机关 0 次；即便出现，translation=0/角度贴限也会当帧翻回，瞬态≤1 帧。
- **i. dtheta=0 边界**：oracle `null != 0` 为真→revolute+密度 0.5+限位 [0,0]；内核 `!==undefined` 同判→等价（数据 dtheta 均 90，无 0 案例）。
- **j. 快照角符号约定**（world.ts:183 平台/箱 `−GetAngle()`，拉杆/吊挂正角）：客户端有一层配对取负；属协议层，不影响物理。
- **k. 纯视觉/音频层未复刻**（设计内）：平台三段贴图与 scale、拉杆/按钮 sprite+灯+暗遮罩、ocupy 占格、playInstance 音效；内核以 MechEvent 代替 signal/sound。

---

## §6 48 关数据面扫描（未解析字段的实际使用度）

扫描 `data/forest/levels/*.json + data/tutorials/levels/*.json`（与 oracle `output/A/data` 同源，forest_01 md5 一致）：

| 机关 | 对象数 | 对象级属性集合 | rotation≠0 | 结论 |
|---|---|---|---|---|
| platform | 223 | dx(209)/group(204)/dy(167)/dtheta(14)/offsetY(14) | 2 个 135°（bonus_3，已建模） | paddingX/Y、offsetX **0 次使用** → D4-g 潜在 |
| lever | 74 | 恒 (group,onis,startPos)（图块集合并后） | 0 | D3/D6/D-f 不触发 |
| pusher | 73 | 恒 (group,) | 0 | pusherWidth/Height **0 次使用**（硬编码缺省=oracle 缺省 1/0.6 安全） |
| 其他 | box 42 / ball 20 / boxheavy 17 / wind 33（rotation −90 族）/ hanging 20 / pulley 11 / roman 6 / window 2 | — | box 1 个 17.4°（他槽） | timedpusher/lightpusher/beamer 等 **0 对象**（TimedPusher @1726732 子类无需复刻） |

图块集缺省（assets/tilemaps/tilesets/Objects.json）：local0 pusher {group:0}；local1 lever {group:0,onis:1,startPos:−1}；local2 lever {group:0,onis:−1,startPos:1}——与内核硬编码缺省一致。

---

## §7 存疑待核

1. **D1 的 oracle 实测值**：−90° 是「每帧钳制」的读码推论（@1679971-1680049 语义明确），但没有 oracle 浏览器端运行时实测背书；如需实证可在 oracle-serve 环境下对 forest_07 转臂截帧量角。不影响「内核缺钳制」这一差异本身的判定。
2. **lever 30.660° 沉降位形在 oracle 端的同值性**：由「同一字节级引擎+同参数+同初始姿态⇒同解」保证（确定性引擎），但同样未做浏览器端实测；金轨迹对拍覆盖的关卡/时段未含拉杆静置特写。风险评级：低。
3. **platform w/h 缺省 128/32**（level2.ts:442-443）：oracle 端缺 width/height 的 platform 对象行为未单独考证（数据面 platform 对象均带显式 w/h，未触发）。
4. oracle 文件本次（2026-10-15）与 05 号文档提取时内容不同（字节数 2,218,873 vs 2,273,196）——差异成因（换包/再分发版）本槽未查，建议主会话确认以哪份为长期事实源；本文按当前文件自洽。

## 附：证据与产出清单

- oracle 切片（本地，gitignore）：`TEMP/rpa/{Device,BoxedDevice,Lever,Pusher,MovingPlatform,BoxPrototype}.js`
- 探针（可复跑）：`TEMP/rpa/probe.mts`（平移平台位移/质量）、`probe2.mts`（转臂限位过冲=P1-D1、拉杆静置）、`probe3.mts`（隔离拉杆平衡位形）
- 关联既有验证：kernel2.test.ts:337（拉杆不自翻）、:355（踩按钮→平台联动）、:327（48 关构建冒烟）；48-level-behavior.test.ts（逐关 10s 浸泡）
- 本审计未修改任何源码；工作树中 mechanisms.ts/level2.ts 的未提交改动属并行槽（windWidth/box 中心矫正），其 BoxedDevice 公式与本档 §1 推导互证一致。
