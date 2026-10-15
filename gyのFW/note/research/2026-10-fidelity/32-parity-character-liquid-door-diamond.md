# 32 · character / liquid / door / diamond 逐参数保真审计（rpc 槽）

> 对象：`Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js`（2,218,873 B，只读未动）。
> 方法：python3 `open(p,'rb').read().decode('utf-8', errors='replace')` 后按 define 模块边界切片
> （character @1814714–1833842、Liquid @1660416–1675269、Door @1642290–1645754、Diamond @1639542–1642290、
> Ground @1786994–1805324、Device @1618052–1623519、MechManager @1833842、Level @1882993–1910485、
> Clock @1867975、Phaser.Physics.Box2D 插件 @1565000–1616873），切片存 `TEMP/rpc/mod_*.js` 复核。
> 引用约定：`@N` = **utf-8 解码后的字符偏移**（python str.find 口径）。与 33 号档（rpd）的 latin1 字节偏移
> 在本文涉及区段恒差 **+9**（交叉验证：wind define 本档 @1732146 ↔ 33 档 @1732155、Box @1636957 ↔ @1636966）。
> 我方源码：`packages/shared/src/kernel/{character,build,world,b2}.ts`、`packages/shared/src/level2.ts`、
> vendor 引擎 `packages/shared/vendor/box2d.js`（原版 init.js 字节级提取）。产出日期 2026-10-15。

## §0 结论速览

| 机制 | 原版锚点 | 我方 | 评级 |
|---|---|---|---|
| character 复合体 fixture（portal 圆/躯干圆/脚圆/梯形） | @1817805–1818078 | character.ts:89–124 | **全部 ✓** |
| character 常数 16 项 | @1820610–1821118 | character.ts:18–31（14 项，2 项冰面专属不适用） | **✓** |
| 行走力公式 SelfCrossSV(±F)·√p + 助推 i.y+=20 | @1827061/1827110（左）、@1827505/1827553（右） | character.ts:194–210 | **✓（r23b 仲裁复核通过）** |
| 跳跃（impulse 1 + SetLinearVelocity 直设 15.5/√√n·15.5 + 长度封顶） | @1828275–1829100 | character.ts:221–243 | **✓** |
| liquid 三 fixture（0.15–0.5 / 冰 0–0.5 / 致死 0.18–1.0，mask 61695/0/4369） | @1661871/1662550/1663678 | build.ts:124–160 | **✓** |
| 液体致死类型矩阵（7 全杀 / wg 遇 6 / fb 遇 5） | @1821118 | character.ts:142–144 + world.ts:305–314 | **✓** |
| liquid kind 语义（5=water WaterBox / 6=lava FireBox / 7=green GreenBox / 55=冻结水） | @1661049、@1665021–1665111 | build.ts:191 + level2 liquidKindOf | **✓（55 森林 0 使用）** |
| door 64×8px 感应带（2m×0.25m @PTM32） | @1643287 + @1644219 | build.ts:284–300 | **✓** |
| door 25fps 扫帧 / 21 帧 isUp / isOpen 匹配角色 | @1643986、@1644428、@1644547 | world.ts:375–398 | **✓ + P2 两处边缘** |
| diamond 0.7×0.7m 盒感应 + silver/fbwg 万能 + 计数 | @1640275、@1641005、@1641794 | build.ts:267–281 + world.ts:343–357 | **✓** |
| win = door1.isUp && door2.isUp（双门同帧到位） | @1905872 | world.ts:401–424 | **✓ + P2 同帧优先级** |

**P0 = 0 项，P1 = 0 项，P2 = 12 项**（§7 清单；全部为边缘/口径/注释/呈现层差异，无宏观可感知行为差）。

**方法学要点（hanging 教训对照）**：本档重点核对的三类"错一点全关变"语义全部逐字节坐实——
① 感应几何尺寸（门带 2m×0.25m、钻石 0.7m 方盒、液体致死带顶面在液面下 0.18m）；
② 判定顺序（接触回调在 Step 求解期直改状态、门扫帧在 Step 前、checkEnd 在 Step 后）；
③ Immune/过滤位（致死带 mask 4369 必含角色 cat16 bit4、角色 mask 4353 必含地面 cat1 bit0、
双角色互不碰撞——4353&16=0）。三者均与我方一致。

---

## §1 坐标系与单位前置（决定所有参数表的可比性）

| 项 | 原版证据 | 我方 | 判定 |
|---|---|---|---|
| PTM | `setPTMRatio(32)` @1894867；插件 `mpx=a*ptmRatio / pxm=a/ptmRatio` @1565868 | b2.ts:46–52 `px2m=−px/32` | ✓ |
| 世界↔屏幕变换 | PointProxy get/set 双取负 @1600940；Body 构造 `SetXY(−pxm(c),−pxm(d))` @1581001 起；postUpdate `sprite.x=mpx(−body.x)` @1588693 → **physics = (−screenX/32, −screenY/32)** | b2.ts:5–7 注释同式，px2m 取负 | ✓ |
| 重力 | Level 内 `box2d.gravity.y = 1e3` @1895199（PointProxy 取负换算）→ b2 (0, −31.25) m/s² | build.ts:176 `b2World((0,−31.25))` | ✓ |
| 步长 | Level 内自定义 stepper：`Step(min(0.04, elapsed/1e3), velocityIterations, positionIterations)` @1896875；vi=8/pi=3 为插件默认 @1559908/1559942 | world.ts:266 `Step(dt, 8, 3)`，dt=服务端固定 1/60 | ✓ 迭代数 / P2-11 步长口径 |
| Device 基类坐标 | `options.width/height = pxm(...)` 基类统一换米 @1619280；Device.prototype.mpx/pxm **取负** @1620987 | build.ts 按已换米数值直写 | ✓ |
| Body anchor | Body 构造/postUpdate 均**不读** sprite.anchor（@1581001、@1588693） | build.ts 直接用像素坐标 | ✓（door anchor.y=0.99 @1643026 仅渲染） |

---

## §2 character（States/Level/character @1814714）

### 2.1 原型常数表（@1820610–1821118 原文）

```js
(e.prototype.facing = "left"), (e.prototype.feetFriction = 0.5), (e.prototype.r1 = 0.48),
(e.prototype.r2 = 0.2), (e.prototype.dr = 0.03), (e.prototype.y1 = 0.2), (e.prototype.y2 = -0.9),
(e.prototype.spriteScale = 0.95), (e.prototype.jumpImpulse = 1), (e.prototype.jumpVelocity = 15.5),
(e.prototype.jumpIceVelocity = 10), (e.prototype.runForce = 50), (e.prototype.floatForce = 30),
(e.prototype.defaultMaxSpeed = 8.5), (e.prototype.waterIceMaxSpeed = 2),
(e.prototype.absoluteMaxSpeed = 40)
```

| 常数 | 原版 | 我方 character.ts | 判定 |
|---|---|---|---|
| feetFriction | 0.5 | :19 `0.5` | ✓ |
| r1 / r2 / dr / y1 / y2 | 0.48 / 0.2 / 0.03 / 0.2 / −0.9 | :20–24 同 | ✓ |
| jumpImpulse | 1 | :25 | ✓ |
| jumpVelocity | 15.5 | :26 | ✓ |
| runForce / floatForce | 50 / 30 | :27–28 | ✓ |
| defaultMaxSpeed | 8.5 | :29 | ✓ |
| absoluteMaxSpeed | 40 | :30 | ✓ |
| jumpIceVelocity 10 / waterIceMaxSpeed 2 | 冰面专属 | 未定义（森林无冰，注释 :9 声明恒走非冰路径） | ✓（范围裁剪，见 §7-10） |
| spriteScale 0.95 / facing "left" 初值 | 渲染 | :66 facing 数值化 1/−1，初值 1（朝右） | P2-9（初帧朝向呈现，入帧即被 update 覆写） |

### 2.2 复合体 fixture（构造序 = 物理序，@1817805–1818078）

原版构造序（Raw 切片逐行）：
1. portalSensor：`b2CircleShape(0.1)` @(0,0)，density 0，cat **4096** mask **4096** groupIndex **−1** friction 0（@1817805 附近，def 区含 `filter.groupIndex = -1`）；
2. `m(p, [0, r], 0)` @1817996：躯干圆 r=0.48 @(0,0.2)，m 助手 = density **0**、cat **16**、mask **4353**、friction=入参 0；
3. `this.feetSensor = m(q, [0, s], this.feetFriction)` @1818020：脚圆 r=0.2 @(0,−0.9) friction **0.5**，userData `"feet"`；
4. `n(p, q, r, s)` @1818078：梯形 [(b−f,d),(−b+f,d),(c−f,e),(−c+f,e)] = **(±0.45, 0.2) / (±0.17, −0.9)**，density **1.4**（唯一质量源）、friction 0、cat16/mask4353。

| 参数 | 原版 | 我方 character.ts | 判定 |
|---|---|---|---|
| 构造顺序 portal→躯干圆→脚圆→梯形 | @1817805→1817996→1818020→1818078 | :89→98→105→114（注释 :85–87 记 2026-10-06 校准） | ✓ |
| portal 圆 0.1 / cat4096 / mask4096 / group −1 | 同上 | :89–96（FILTER.PORTAL_CAT/MASK=4096, b2.ts:36–37） | ✓ |
| 躯干圆 r0.48@(0,0.2) fric0 dens0 | m 助手 | :98–103 | ✓ |
| 脚圆 r0.2@(0,−0.9) fric0.5 "feet" | @1818020 | :105–111 | ✓ |
| 梯形 (±0.45,0.2)/(±0.17,−0.9) dens1.4 fric0 | n 助手 | :114–124（CHAR.r1−dr=0.45、CHAR.r2−dr=0.17 逐点同） | ✓ |
| cat16 / mask4353（=1+256+4096：地面/平台/portal） | def 区 `maskBits = 4353` | FILTER.CHAR_CAT/CHAR_MASK b2.ts:29–30 | ✓ |
| fixedRotation / SetBullet(true) / userData "pers" | 构造体 `(this.body.fixedRotation = !0)` 等 | :77–82 | ✓ |
| 双角色互不碰撞 | 4353 & 16 = 0 | 同值同式 → 同样互不碰撞 | ✓ |

### 2.3 行走力公式（r23b 仲裁复核，本档结论：**仲裁成立**）

原版（update，@1826909–1827728，Raw 原文）：

```js
(e = (130 * g) / this.currentRunForce),                        // @1826xxx 爬升增量
this.body.data.GetLinearVelocity().Length() < 1 && this.currentRunForce > 0.5 * s && (e = s),
// LEFT @1827061–1827110：
(p = n.y > 0.6 ? n.y : 0),
(i = n.Clone().SelfCrossSV(-this.currentRunForce).SelfMul(Math.max(0, Math.sqrt(p)))),
p > 0.6 && i.y >= 0 && i.y < 20 && (i.y += 20))                 // @1827110/1827195
: (i = new box2d.b2Vec2(h, 0))                                  // 左空中漂浮力 @1827195
// RIGHT @1827505–1827638：SelfCrossSV(+F)，boost 同式，漂浮 i=(-h,0)
// 无输入 @1827728：(this.currentRunForce = 0.475 * s)，非冰刹车 i=(7·−vx, 0)
```

vendored 引擎 `SelfCrossSV`（vendor/box2d.js:619–621）：`(this.x = -a*this.y), (this.y = a*oldX)`。

| 项 | 原版 | 我方 character.ts | 判定 |
|---|---|---|---|
| 爬升 e=130·dt/currentRunForce；慢速(<1)且>半程给满 e=s | @1826909 区 | :186–188 | ✓ |
| LEFT i = CrossSV(−F)(n)·max(0,√p)，p=n.y>0.6?n.y:0 | @1827061 | :194–198 `{x:-(-F)*n.y, y:(-F)*n.x}`＝(−a·y, a·x) 逐项同（a=−F） | ✓ |
| LEFT 助推 `p>0.6 && 0≤i.y<20 → i.y+=20` | @1827110/1827195 | :199 | ✓ |
| RIGHT i = CrossSV(+F)(n)·√p + 同式助推 | @1827505/1827553 | :206–210 | ✓ |
| 空中漂浮力 (±30, 0) | @1827195/1827638 | :201/:212 | ✓ |
| 无输入 currentRunForce=0.475·s；刹车 i=(7·−vx,0) | @1827728 | :215–217 | ✓ |
| 施力闸 `i.x>0 && vx<maxSpeed` / `i.x<0 && vx>−maxSpeed`（maxSpeed=8.5，非冰不硬钳速度） | update 尾段 | :251–253 | ✓ |
| absoluteMaxSpeed=40 硬钳（无条件，位于 `null!=i` 括组**外**） | @1830216 | :256–260 | ✓ |
| 方向自洽 | 原版 b2 空间 x 镜像（§1），LEFT 得 b2(+F,0)=屏幕左 | 我方 px2m 同镜像 → 同一公式直接成立 | ✓ |

### 2.4 跳跃（@1828275–1829406）

| 项 | 原版 | 我方 :221–243 | 判定 |
|---|---|---|---|
| 触发门 `!prohibitJump && up && ((n && n.y>0.2) || contacts.length≥2)`；`prohibitJump && !up → 复位` | update 前段 | :221–222 | ✓ |
| `ApplyLinearImpulse((0,1),(0,0))` | @1828275 | :223 | ✓ |
| 非冰 SetLinearVelocity：`n.y>0.65 ? (vx,15.5) : (vx, √√n.y·15.5)`，长度>15.5 归一化封顶 | @1828887–1829100 | :225–230 | ✓ |
| 跳跃帧抹掉行走力 y 分量（f 标志） | `f=!0` → `f && (i.y=0)` | jumpedThisFrame :231/:247–250 | ✓ |
| 对脚下 "reactable" 体施 (0,−1) 冲量 | @1829406 | :233–240 | ✓ |
| prohibitJump=true + 音效钩子 | @1829xxx | :241–242 | ✓ |
| 冰面三分支（fb 3·n / wg jumpIceVelocity=10） | @1828710 | 未实现（森林无冰） | ✓（§7-10） |

### 2.5 脚部感应与液体致死入口（@1819816 回调 + @1821118 liquidTouched + @1821921 kill）

原版回调语义：`setFixtureContactCallback(feetSensor, cb)` 注册在自有 fixture 上；插件
`handleContactBeginOrEnd`（@1607880）对自有 fixture 注册恒以 **(myBody, otherBody, …, otherFixture, began, contact)**
派发（第 3/4 号派发行参数序为 (i,j,c,d) / (j,i,d,c)，e=对侧恒成立，与 A/B 序无关）→
`e.m_isSensor` 分流：liquid_death sensor → `began ? (liquidTouched(type), isOnLiquid=true) : (isOnLiquid=false)`；
非 sensor → `began && manifold.localNormal.Length()>0` 才入接触表，end 摘除。

原版 liquidTouched（@1821118，原文）：

```js
if(! (7 === a || ("wg" === this.char && 6 === a) || ("fb" === this.char && 5 === a)) ) { return; }
if(GameConfig.cheating.isInvulnerable) { /* 只播烟雾不杀，宿主魔改 flag，默认 false @1777 */ return; }
return this.kill();
```

| 项 | 原版 | 我方 | 判定 |
|---|---|---|---|
| 死亡类型矩阵 | 7 全杀；wg 遇 6；fb 遇 5（@1821118） | character.ts:142–144 同式；world.ts:307 `liquidTouched && !dying → kill` | ✓ |
| isOnLiquid：致死带 begin 恒置 true / end 置 false（**与免疫无关**，仅水声/水花用） | @1819816 回调 | world.ts:305–314 同（:311 无条件置 true） | ✓ |
| 非 sensor 落地接触：manifold 法线非零才入表 | @1819816 | world.ts:319 + character.ts:128–134 | ✓ |
| kill 防重入 `if(!this.dying)` | @1821921 | character.ts:146–152 | ✓ |
| dead 置位时机 | `_.delay(_doKill,0)` 内 `(this.dead=!0)` @1822828（下一个宏任务，下一帧 update 前生效） | kill() 同步置 dead（:149） | ✓ 等效（checkEnd 只读 isDead，不受影响） |
| isDead = 烟雾动画完成 | `generateFrameNames("death_smoke",0,45,4)` @30fps @1821612 → **46 帧 = 1.533s** | character.ts:160 `smokeT ≥ 45/30 = 1.5s` | **P2-1（差 1 帧 33ms）** |
| dying 期间每帧清零速度（dead 后） | update 首分支 | character.ts:156–164 | ✓ |
| GameConfig.cheating.isInvulnerable 分支 | @1821300 区（宿主魔改构建自带，默认 false @1777） | 未复刻 | P2-2 |

### 2.6 动画/朝向（headTilt/facing）

| 项 | 原版 | 我方 :266–324 | 判定 |
|---|---|---|---|
| n 存在时：left→(jumping, t=−1, a=atan2(n.y,n.x)−π/2 夹到 [−0.1π, 0.25π])；right→(+1, [−0.25π, 0.1π])；无输入→(idle,1,0) | update 后半 | :277–292 逐值同 | ✓ |
| n 为空：|vx|>4→jumping(facing 按符号)；vy>3→rising；vy<−3→falling；按键→jumping/保角；否则 idle | 同 | :293–320 | ✓ |
| 归一化速度 atan2(max(−0.333, o.y), o.x) 初角 | 同 | :274 | ✓ |

---

## §3 liquid（States/Level/Devices/Liquid @1660416）

### 3.1 构造与 kind 语义

- 原版由 **Ground.convertTilemap** 逐行段创建（MechManager.classNames 表 @1837300 起**无 liquid 条目**）：
  `CreateLiquid(type, B+1, C, A) → new Liquid(game, B+1−A, C, {type, width:A})`（@1804773 def / @1792963 call），
  B/C 为 tile 列/行计数 → x=行段首列 col0、y=row、width=段长（tile=米）。
  `55===f.type → (type=5, startFrozen=true)` @1661049；`_.delay(initialFreeze,10)` @1660666。
- body：`SetPosition(−c, −e)` = **b2 (−col0, −row)** @1661442（与我方 build.ts:121 逐字节同式）。
- 图形名映射 @1665021–1665111：5→**WaterBox**、6→**FireBox**、7→**GreenBox** ⇒
  **5=水（杀 fb）、6=岩浆（杀 wg）、7=绿酸（双杀）**，与 §2.5 致死矩阵互证。

数据域普查（49 关，本档 python 扫描）：水(5) 407 格/31 关、岩浆(6) 327 格/30 关、绿酸(7) 315 格/23 关、
**type55 冻结水 0 使用**（startFrozen 全系死代码，与我方 build.ts:192 `startFrozen:false` 一致）。

### 3.2 三 fixture 逐参数（原版 def 值直读）

| fixture | 原版顶点（米，局部） | mask | friction | sensor | 我方 build.ts | 判定 |
|---|---|---|---|---|---|---|
| sensorFixture（显示/光源带） | (0,−0.15)(−k,−0.15)(−k,−0.5)(0,−0.5)，i=1 → y∈[−0.5,−0.15] @1661871 | **61695** | **0.7** | **true** | :124–135 逐点逐值同 | ✓ |
| iceFixture（冰面带） | (0,0)(−k,0)(−k,−0.5)(0,−0.5) @1662550 | **0**（冻结时改 16，@1663xxx initialFreeze/freeze） | **0** | false | :137–147 同（mask 0 保留几何） | ✓ |
| killFixture（致死带） | (0,−0.18)(−k,−0.18)(−k,−1)(0,−1) @1663678 | **4369**（=1+16+256+4096，含角色 cat16） | **0.7** | **true** | :149–160 同（FILTER.GROUND_MASK） | ✓ |
| 三者 categoryBits | 均 **1** | — | — | — | FILTER.GROUND_CAT=1 | ✓ |
| userData | sensor `{type:"liquid",liquidType,…}`；ice `{type:"ice",…}`；kill `{type:"liquid_death",liquidType,…}` | — | — | — | build.ts:134/146/159 同键同值 | ✓ |
| body 类型/位置 | static，SetPosition(−col0,−row) | — | — | — | build.ts:119–122 | ✓ |

附带：k=f.width 为**原始** options 宽（tile=米）；Device 基类虽 pxm 过 width @1619280，但 Liquid 构造体随后
`this.options = f` 覆写回原始值——故顶点用 tile 米数，与我方 A=col1−col0+1 等价 ✓。
地面侧液体三件套（左右端盖 type8/9 + 中段下半格盒 y∈[−0.45,−1]）在 Ground.convertTilemap
@1792900 区逐点核对，与 build.ts:100–116 **逐点一致**（含 −s/2+0.05=−0.45）。

### 3.3 致死判定几何（feet 圆进入即死）

feet 圆 r=0.2 中心在体心下 0.9m（b2 y 向上）；kill 带顶面在液面下 0.18m、底 −1.0m。角色站在液体
底部格（中段盒顶 −0.45）时，feet 圆（y∈[−1.1,−0.7]）与 kill 带（[−1.0,−0.18]）相交 → **踏入液面约
0.18m 内即触发 begin → 立死**（下沉死亡线与原版完全同式，我方 build 几何逐点相同）。免疫角色
（fb 遇 6 / wg 遇 5）begin 同样置 isOnLiquid=true 但不杀 ✓（world.ts:307–313）。

### 3.4 未复刻面（均为冻结/光效链路，森林数据 0 触发）

nearBodies 追踪、initialFreeze/freeze/melt（冰 mask 0→16、pers 上抬 0.5m、frozenBodies static 化）、
sensorFixture.lightProperties 光照镜像、WaterBox/FireBox/GreenBox/IceBox 动画与 frost/vapor tween——
全部服务于 type55/Beamer 蓝光冻结，森林 49 关 **0 处可触发**（type55 普查 0 + beamer 普查 0，见 33 号档 §1）。
评级 P2-3。

---

## §4 door（States/Level/Devices/Door @1642290）

### 4.1 原版参数表

| 参数 | 值 | 偏移/摘录 | 我方 | 判定 |
|---|---|---|---|---|
| options | `{width: 64, height: 8}`（**像素**） | @1644219 | —（下方换算后直写米） | ✓ |
| fixture | `SetAsOrientedBox(pxm(width/2), pxm(height/2), (0,0), 0)` = **半宽 1m × 半高 0.125m**（2m×0.25m 条带） | @1643287 | build.ts:292 `boxFixture(body,B,1,0.125,(0,0),0)` | ✓ |
| 材质 | friction 0.7, restitution 0, density 0, **isSensor=true**，filter 未设（默认 cat1/mask 0xFFFF） | @16433xx | build.ts:293–298 同 | ✓ |
| 体 | `enable(sprite)` 后 `SetType(b2_staticBody)`；sprite 位 (c+mpx(1), e+4)px → 体中心屏幕 (x+32, y+4) | 构造体 @1642400 区 | build.ts:287–291 `pos=(x+32, 底边)`, body=(pos.x, pos.y+4)；level2 doors.y=顶边 +h 还原底边（level2.ts:412–413） | ✓ |
| userData | 字符串 `"door-fb"/"door-wg"` | @16434xx | build.ts:297 对象 `{type:"door",char}` | ✓ 等效（P2-4 记录） |
| 开门条件 | 回调：`c.sprite.character.data.char === a.data.char` 时 `began→isOpen=true / end→isOpen=false` | @1643986 | world.ts:325–330（roleOfBody(other)===role） | ✓ |
| 开门动画 | FinishBoy/FinishGirl 帧 0–21（**22 帧**），scale 0.8，anchor.y=0.99（仅渲染） | @1642891/1642798/1643026 | 客户端渲染层（内核不涉） | ✓ |
| 扫帧速率 | `b = min(0.04, elapsed/1e3); c = 25*b`（**25 帧/秒**，dt 上限 40ms） | @1644547 | world.ts:378 `25 * Math.min(0.04, dt)` | ✓ |
| isUp | `21 === a ? isUp=true : false`（a=当前帧号，每帧重算） | @1644428 | world.ts:397 `isUp = frac >= 21` | ✓（P2-5 离门后残余 2 帧） |
| 推进闸 | `isOpen && a<21 → currentFrac+=c`；`a===21 → signal.dispatch()`（驻门期间**每帧**派发） | update 中段 | world.ts:379–388（frac<21 推进、≥21 且未 signaled 派发一次事件） | ✓ 等效 |
| 闭合 | `!isOpen && a>0 → currentFrac−=c`；`a===0 → 停声+dispatch` | update 尾段 | world.ts:389–394（无闭合事件，checkEnd 每帧跑故等价） | ✓ |

### 4.2 win 判定（Level.checkEndGame @1905782，isUp&&isUp 行 @1905872，原文）

```js
(i.prototype.checkEndGame = function () {
  if (!this.ended)
    return (
      this.door1.isUp && this.door2.isUp && ((this.ended = !0), (this.game.physics.box2d.paused = !0), this.animateFinish()),
      this.pers1.isDead || this.pers2.isDead ? ((this.ended = !0), (this.game.physics.box2d.paused = !0), this.gameOver()) : void 0
    );
});
```

- door1=fb 门（properties 缺省或 char=fb）、door2=wg 门（@1903842/1903988）；signal 注册于门与角色死亡。
- **win 需双门同刻 isUp**（isUp 在驻门期间持续为真 → 等价"双人同时站在各自门带且门已开完"）。
  我方 world.ts:409 同式 ✓，且每帧 checkEnd ⊇ 原版信号驱动频度 ✓。
- 死亡分支读 `isDead`（烟雾完成）→ 我方同（world.ts:403）✓。
- **同帧 win+death**：原版逗号表达式**两个分支都会执行**（先 animateFinish 再 gameOver）；
  我方 gameover 先判、win 被短路（world.ts:401–423）。仅"双门开满与烟雾完成同一步"可触达，
  原版该帧行为本身亦自相冲突（先设 ended 再覆写）。评级 P2-6。

### 4.3 计时（animateFinish @1906156 / gameFinish @1906602 / Clock @1867975）

- 原版：checkEnd 置 `paused=true` → animateFinish（双角色 animateStairs 传送到门位 +0.4m，@1823543
  `a.pos.y+4`）→ `_.delay(gameFinish, 1600)` → `levelState.time = ui.clock.getElapsedSeconds()` @1906872。
- Clock：`Math.round((game.time.now − startTime)/1e3)`——**墙钟、整秒** @1869738。
- 我方：world.ts:420 `timeMs = timerMs + 1600`（仿真累计 + 楼梯演出 1600ms），毫秒精度。
  1600ms 演出账 ✓；精度差（整秒 vs ms）与时基（墙钟 vs 仿真步）→ **P2-7**（通关计时口径此前档已仲裁，
  本档仅记精度与取整差）。

---

## §5 diamond（States/Level/Devices/Diamond @1639542）

| 参数 | 原版 | 我方 | 判定 |
|---|---|---|---|
| 感应体 | `SetAsOrientedBox(options.width/2, options.height/2, (0,0), 0)`，options `{width:0.7, height:0.7}` **米**（Diamond 直继 Phaser.Sprite，无 Device 基类 pxm）→ **0.7×0.7m 方盒**（非圆） | build.ts:273 `boxFixture(...,0.35,0.35,(0,0),0,...)` | ✓ |
| 材质 | friction 0.7 / restitution 0 / density 0 / isSensor=true / filter 未设（默认 1/0xFFFF，与角色 cat16 mask4353 双向可通） | build.ts:274–277（filter 留默认） | ✓ |
| 位置 | 构造 `(x+mpx(1), y−mpx(1))`px → 屏幕 (x+32, y−32) = 图块对象中心 | build.ts:268–271 用 level2 中心（level2.ts:415–421 centerOf） | ✓ |
| userData 怪癖 | `h.userData="diamond-"+f` 后**立即被覆写**为 `{lightProperties:{type:"transparent"}}` @16403xx（fixture 实际不带 kind；kind 匹配走实例 `a.data.char`） | build.ts:278 `{type:"diamond",char}`（kind 入 userData，匹配走 DiamondInfo.char） | ✓ 等效（P2-8 记录字节差异） |
| 拾取条件 | `c.sprite.character && c.sprite.character.data.char && ("silver"||"fbwg"||char 同) && began` @1641005 | world.ts:344–351（begin only + eligible 同式） | ✓ |
| 计数 | `grabbed`: `"silver"===char ? silverDiamond++ : diamonds++`（**fbwg 计入 diamonds**）@1641680/1641794 | world.ts:353–354 同式 | ✓ |
| 销毁 | `this.destroy()`（即帧移除体） | world.ts:355 `pendingRemove` → Step 后 DestroyBody（box2d 禁回调内销毁，与插件 `_toRemove` 同款） | ✓ 等效 |
| 关卡总数 | `"silver"!==char && totalDiamonds++`（silver 不入总数）@1904112 区 | 我方 WinData 不发 total，silver 单列（world.ts:419） | ✓ 等效 |

数据域普查（49 关）：fb(red) **235** 个/34 关、wg(blue) **230** 个/34 关、silver **14** 个/14 关
（forest_07,11,13,13_1,17,17_1,20,23,25_1,27,…）、**fbwg 0 使用**（万象钻为死数据，kind 映射仍实现于
level2.ts:390 ✓ 与 33 号档"死代码类"结论同型）。

---

## §6 全局流程辅助证据（本档职责内的时序/接口语义）

| 项 | 原版证据 | 我方 | 判定 |
|---|---|---|---|
| 接触回调时点 | 插件 DefaultContactListener 在 Step 求解期同步回调（@1607880 handleContactBeginOrEnd） | world.ts:124–131（Step 内直改状态，F7 口径） | ✓ |
| 回调参数序 | 自有 fixture 注册 → e=对侧恒成立（@1607880 四派发行 (i,j,c,d)/(j,i,d,c) 配对） | world.ts:135–140 双向 classifyContact | ✓（语义等价证明见 §2.5） |
| 帧序 | doors→wg→fb→设备(逆注册序)→Step（2026-10-09 运行时探针，world.ts:251 注释引用） | world.ts:247–266（update→门扫帧→Step→checkEnd） | ✓ |
| 步迭代 | vi=8 / pi=3（插件默认 @1559908/1559942；Level stepper 透传 @1896875） | world.ts:266 | ✓ |
| GameConfig 头 | referenceFPS/TPS 60、ticking 自适应调度、cheating 默认 false（@1777 区，文件头 0–2400 字节） | 服务端固定 1/60 tick | ✓ 基准 / P2-11 |

---

## §7 差异清单（P2 ×12；P0/P1 = 0）

| # | 级别 | 内容 | 原版 | 我方 | 影响 |
|---|---|---|---|---|---|
| 1 | P2 | 死亡烟雾帧数账：`generateFrameNames("death_smoke",0,45)` = **46 帧**@30fps=1.533s | @1821612 | character.ts:160 `45/30`=1.5s | isDead 晚 33ms（原版），仅极限同帧判定边缘 |
| 2 | P2 | 宿主魔改 flag `GameConfig.cheating.isInvulnerable` 分支（免死只播烟雾）未复刻 | @1821300 区/@1777 | 无 | 默认 false，零行为差；移植"无敌"彩蛋时需补 |
| 3 | P2 | Liquid 冻结/光效链路未复刻（nearBodies/freeze/melt/lightProperties/动画） | @1660666–1665xxx | build.ts 仅几何三 fixture | 森林 49 关 0 触发（type55/beamer 普查 0）；移植 temple 时升级 |
| 4 | P2 | userData 载体差异：door `"door-fb"` 字符串 / diamond 被覆写为 lightProperties | @16434xx/@16403xx | `{type:"door",char}` / `{type:"diamond",char}` | 匹配逻辑等效，仅字节形态不同 |
| 5 | P2 | 离门后 isUp 残余：原版 a=round(frac)∈[20.5,21.5] → 离门后**多 2 帧** isUp；我方 frac≥21 立即翻 false | @1644428 | world.ts:397 | win 窗口 33ms 级边缘差 |
| 6 | P2 | 同帧 win+death：原版两分支都执行（animateFinish+gameOver 叠加）；我方 gameover 短路 win | @1905872–1906037 | world.ts:401–423 | 需双门开满 ∧ 烟雾完成同一步，极端边缘 |
| 7 | P2 | 通关计时：原版墙钟整秒（Clock round @1869738，start 于关卡就绪）；我方仿真 ms+1600 | @1906602–1906872 | world.ts:420 | 展示/战绩口径，前档已仲裁 |
| 8 | P2 | 钻石摆动 tween（±5px/2s/随机延迟）与动画帧名未复刻 | @16418xx | 无（客户端呈现层） | 纯视觉 |
| 9 | P2 | facing 初值 left（原版）/1（我方）；spriteScale 0.95 渲染 | @1820610 | character.ts:66 | 首帧渲染朝向，入帧即被 update 覆写 |
| 10 | P2 | 冰面全链路（setOnIce/setFriction/jumpIce/ice 声）未实现——森林无 Snow/type55/beamer | @1827xxx 冰分支 | character.ts:9 注释恒走非冰路径 | 森林 0 触发；移植 temple 升级 |
| 11 | P2 | 步长：原版变步 `min(0.04, elapsed)`（魔改调度 referenceTPS 60）vs 我方固定 1/60 | @1896875 | world.ts:238 | 60Hz 下等价；非 60 刷新率/掉帧时积分路径不同（det 口径既定决策） |
| 12 | P2 | **注释错误**：b2.ts:39 `LIQUID_SENSOR_MASK: 61695 // 0xF0FF：不含角色 bit4`——0xF0FF 低字节 0xFF **含** cat16(bit4)，值与原版 @1661871 一致，仅注释错 | @1661871 | b2.ts:39 | 无行为差；建议主会话修注释（本槽禁改源码） |

**P0 探针思路（无 P0，备而不用）**：若日后移植 temple（type55/beamer/portal 激活），需内核探针复核
①冻结时 pers 上抬 0.5m 与 ice mask 0→16 的时序（原版 `_.delay(initialFreeze,10)` 步外执行）；
②本档 §7-10 冰面分支三实现（fb 3·n / wg 10 / √√n 通用）。探针 = world.ts 单测挂 b2ContactListener
计数 + 冻结帧前后 body.position 位哈希，与 oracle 录像逐帧对拍。

---

## §8 r23b 仲裁复核结论（任务书指定动作）

任务线索："2026-10-14 r23b 曾仲裁'源码行走力公式 i=SelfCrossSV(±F)·n 与助推 i.y+=20 与 kernel
character.ts 逐行一致'"。本档按字节偏移复核：

- 原版 LEFT：`n.Clone().SelfCrossSV(-currentRunForce).SelfMul(Math.max(0, Math.sqrt(p)))` @1827061；
  助推 `p > 0.6 && i.y >= 0 && i.y < 20 && (i.y += 20)` @1827110（RIGHT 对称 @1827505/1827553）。
- 我方 character.ts:196 `i = { x: -(-F) * n.y, y: -F * n.x }`＝CrossSV(−F) 的 (−a·y, a·x) 展开逐项同
  （vendored SelfCrossSV 定义 vendor/box2d.js:619–621 为准），:199 助推四条件逐字同。
- **复核结论：r23b 仲裁成立**。方向自洽性由 §1 坐标约定（双取负镜像）保证，无需额外镜像。

## §9 偏移速查表（本档 utf-8 口径；latin1 = 本表 +9）

| 项 | @ |
|---|---|
| character define / 常数块 / liquidTouched / feet 回调 | 1814714 / 1820610 / 1821118 / 1819816 |
| portalSensor / 躯干圆 / feetSensor / 梯形 | 1817805 / 1817996 / 1818020 / 1818078 |
| 行走力：爬升 / 左cross / 左助推 / 右cross / 右助推 / 0.475 | 1826909 / 1827061 / 1827110 / 1827505 / 1827553 / 1827728 |
| 跳跃：impulse / 15.5 / √√n / reactable / abs40 | 1828275 / 1828887 / 1829006 / 1829406 / 1830216 |
| kill / _doKill / death_smoke(0,45) / dead=!0 / animateStairs(+4) | 1821921 / 1822056 / 1821612 / 1822828 / 1823013,1823543 |
| Liquid define / 55→5 / SetPosition(−c,−e) / sensor mask61695 / ice mask0 / kill mask4369 | 1660416 / 1661049 / 1661442 / 1661871 / 1662550 / 1663678 |
| WaterBox / FireBox / GreenBox / killFixture | 1665021 / 1665066 / 1665111 / 1663867 |
| Door define / SetAsOrientedBox / isOpen 回调 / 21===a / 25·b / options 64×8 | 1642290 / 1643287 / 1643986 / 1644428 / 1644547 / 1644219 |
| Diamond define / SetAsOrientedBox / 拾取条件 / options 0.7 / grabbed / silverDiamond++ | 1639542 / 1640275 / 1641005 / 1641634 / 1641680 / 1641794 |
| Ground define / convertTilemap / CreateLiquid 调用 / createGroundFixture(cat1,mask4369,fric0.8) / CreateLiquid def | 1786994 / 1789848 / 1792963 / 1800980 / 1804773 |
| Device 基类 width pxm / mpx·pxm 取负 / MechManager classNames（无 liquid） | 1619280 / 1620987 / 1837300 |
| 插件：PointProxy 取负 / Body 构造 / postUpdate / setPTMRatio / mpx·pxm / vi8 pi3 / 回调派发 | 1600940 / 1581001 / 1588693 / 1579098 / 1565868 / 1559908 / 1607880 |
| Level：setPTMRatio(32) / gravity 1e3 / Step / createCharObjects / checkEndGame / animateFinish / gameFinish | 1894867 / 1895199 / 1896875 / 1903355 / 1905782 / 1906156 / 1906602 |
| Clock round / GameConfig.isInvulnerable 默认 false | 1869738 / 1777 |

## §10 存疑项

1. **离门 isUp 残余帧差（§7-5）**：`_outputFrames.indexOf(currentFrame.index)` 在 frame=21 时恒 21 的
   前提基于 Phaser Animation 帧号语义（currentFrame.index 为帧数组下标），未在运行时实测；若 index
   语义有出入，残余帧数可能是 1 而非 2。量级不逾 33ms，不影响任何已仲裁关卡解。
2. **同帧 win+death 的原版实际表现（§7-6）**：animateFinish 与 gameOver 叠加后的最终画面取决于
   两状态机对 `game.state` 的竞速，本档未运行 oracle 实测（只读静态审计）；我方取 gameover 优先。
3. **Clock.start 的精确时刻**（ready 倒计时结束 vs Level create）未逐字节追认，通关计时的零点口径
   沿用前档仲裁；本档仅对 1600ms 演出账与整秒取整差异背书。

（临时切片 `TEMP/rpc/` 共 8 文件按纪律保留至本档合入后由主会话裁决清理；本槽未改动任何 .ts/.mjs 源码。）
