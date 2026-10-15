# 34 · ball（BallPrototype）逐参数保真审计（rb1 槽）

> 槽：rb1。日期 2026-10-15。只读审计，**未改任何 .ts/.mjs 源码**。
> 事实源：`Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js`（latin1 口径 2,218,873 B，
> 与 30-33 号档同一版本；`@N` = latin1 字节偏移）。切片留存 `TEMP/rb1/{Ball,BoxedDevice,Device}.js`（gitignore 内）。
> 定位：`define("States/Level/Devices/Ball" @1624705`（至 Beamer @1626654）；基类 Device @1618061、BoxedDevice @1623528。
> 我方实现：`packages/shared/src/kernel/mechanisms.ts:412-432`（buildBall）、`b2.ts`（过滤/fixture 助手）、
> `packages/shared/src/level2.ts:525-527`（ball 解码）。
> 运行时探针：`note/evidence/forest_08/tools/rb1-ball-parity-probe.mjs`（`npx tsx` 可复跑，走真实
> parseLevel→World 构建链，本文 §6 引用其输出）。

## §0 结论速览

**P0 = 0，P1 = 0，P2 = 3。** ball 是 Devices 家族中结构最简的动力学道具：单个主圆 fixture + 单个 portal
感应圆，无状态机、无关节、不注册 MechManager。我方 buildBall 与原版逐参数一致；20/20 个 ball 对象的
初始体心、质量（1.156106096521044 kg）、惯量（0.0924884877216835 kg·m²）、双 fixture 全参数（r/μ/e/ρ/
cat/mask/sensor/userData）在内核实测中与 oracle 公式**位级一致**（§6）。前四例已修的「简化掉自由度」类
缺陷（hanging 锚点零惯量、转臂无限位、风柱宽度、旋转箱中心）在 ball 上**均不存在**。

| 评级 | 项 | 数据面 | 备注 |
|---|---|---|---|
| P2-a | buildBall/level2 不解析 rotation（体角 + BoxedDevice 中心矫正随 rot 旋转均缺） | 20/20 球 rotation=0，零触发 | 与 33 号档 P1-2（箱，已修）同族潜在项 |
| P2-b | linearDamping/angularDamping 属性不解析 | 20/20 properties=null（对象级+图块集级均无），零触发 | oracle @1625420-1625657 条件设置；temple 移植风险 |
| P2-c | `params.ts:148-152` BALL.radius=0.9 陈旧（实际 0.4） | 常量零引用 | 33 号档 §3.3 已记，本档探针再证实值 |

顺带项：**forest_05.json Chars 层无 gid 空对象（id=38）→ 原版同样忽略，无差异**（§5）。

---

## §1 原版 Ball 结构（@1624705–1626654）

Ball 直接继承 BoxedDevice（无中间变体），模块内仅有构造器 + 两个原型字段，无任何方法覆写
（无 update/updateState/checkState/ocupy/架构注册）。构造链全序：

```
new Ball(game, h)                        // h = Phaser 解析的地图对象原样（@1902980 createObjects）
  ① b.x -= mpx(0.5)  → x−16px            // @1624925；mpx=×32 正向（@1565877）
     b.y += mpx(0.65) → y+20.8px         // @1624966
  ② BoxedDevice（@1623528）：_defaults.enableBody=true；
     e=(mpx(boxSize.x/2), mpx(boxSize.y/2))=(32,32)px   // boxSize 原型 {2,2} @1624105，Ball 未覆写
     e.SelfRotateRadians(−π·rotation/180)；x+=e.x；y−=e.y
  ③ Device（@1618061）：合并 options（deepObjectExpand 只补缺）→ rotation→弧度 →
     resSprite(h,i,atlas,frame) @1619756 → enable(sprite) → clearFixtures() @1620106 →
     SetAngle(π·c.rotation/180 || 0) @1620145   // c.rotation 为原始度数
  ④ 主圆 fixture：b2CircleShape(this.radius=0.4) @1625047/@1626228，friction 0.2 @1625144、
     restitution 0.1 @1625170、density 2.3 @1625199、filter.categoryBits=17 @1625231
     （maskBits 不设 → vendor 原型默认 65535 @1412845）
  ⑤ 条件阻尼：null!=properties.linearDamping → SetLinearDamping @1625420-1625493；
     null!=properties.angularDamping → SetAngularDamping @1625582-1625657
  ⑥ portal 圆：b2CircleShape(0.1)@(0,0) @1625695/@1625724，cat=4096 @1625809、mask=4096 @1625847、
     friction 0.5 @1625881、density 0 @1625907、userData={"portal-sensor":true} @1625943、
     isSensor 不设（缺省 false = 实心，与 portal fixture 同 cat/mask 相撞 = 传送检测通道）
  ⑦ 原型：options={boxWidth:1.8, boxHeight:1.8, atlasName:"MechAssets", frameName:"ball0000"}
     @1626133-1626189；radius=0.4 @1626228
```

要点：

- **不调用 registerDevice**（与 Box/BoxPrototype 同；对照 Lever/Pusher/平台均调用）→ 球不进
  MechManager.devices，不参与 deviceChanged 组同步/resetStates。全仓 grep `registerDevice` 在
  Ball/Box/BoxPrototype 切片内均无命中。
- **boxWidth/boxHeight=1.8 对 Ball 物理是死参数**：主 fixture 用 `this.radius`，boxWidth 仅被
  BoxPrototype（12 处引用）作八边形尺寸读取；Ball 切片内唯一定义处 1 次命中。亦无 width/height 消费
  （Device 里 options.width/height 仅被 pxm 换算赋值 @1619295-1619408，无后续读；且 Phaser parser 对
  tile 对象根本不透传 width/height，@1040068 分支只拷 gid/name/type/x/y/visible/properties[+rotation]）。
- **坐标透传链**：Phaser parser 对 tile 对象原样保留 Tiled 坐标（x=左缘、y=底边），rotation 仅非零时带
  （@1040068-1040122）→ 球体心（rot=0）= `(rawX+32−16, rawY−32+20.8) = (rawX+16, rawY−11.2)`px，
  物理 `(−px/32, −py/32)`（公共换算见 30 号档 §0.2）。

## §2 逐参数对照表

oracle @1624705-1626654 vs 我方 mechanisms.ts:412-432 + level2.ts:525-527 + b2.ts。

| 参数 | oracle（偏移+摘录） | 我方（文件:行） | 判 |
|---|---|---|---|
| 体类型 | BoxedDevice `_defaults.enableBody=!0` → enable 动态体（30 号档 §0.5） | mechanisms.ts:415-418 `bd.type=b2_dynamicBody` | ✓ |
| 起步 fixture 集 | enable 自带精灵矩形即被 `clearFixtures()` 清空（@1620106）→ 净零起步 | :418 裸体直接 CreateFixture | ✓（净效果恒等） |
| 位置预调整 | `b.x-=mpx(0.5)`（−16px）、`b.y+=mpx(0.65)`（+20.8px）@1624925/1624966 | :414 `def.x-16, def.y+20.8`（def 已是图块中心=(rawX+32, rawY−32)，净式恒等） | ✓（探针 20/20 位级一致） |
| BoxedDevice 中心矫正 | e=(32,32)px 按 −rotation 旋转 @1623900（rot=0 ⇒ 恒等图块中心） | **未建模 rotation**（level2.ts:526 只取 x,y；buildBall 无 rotation 形参） | ✓（rot=0 恒等）/ **P2-a**（rot≠0 潜在） |
| 体角 | `SetAngle(π·c.rotation/180||0)` @1620145 | 不设（=0） | ✓（数据全 0）/ P2-a |
| 主圆半径 | `this.radius`=0.4（原型 @1626228） | :419 circleFixture r=0.4 | ✓ |
| 主圆摩擦 | 0.2 @1625144 | :421 | ✓ |
| 主圆恢复 | 0.1 @1625170 | :422 | ✓ |
| 主圆密度 | 2.3 @1625199（→ mass=2.3π·0.4²=1.156106096521044，I=½mr²=0.0924884877216835；密度>0 不触发 30 号档 §0.6 兜底） | :423（探针实测同值至末位） | ✓ |
| 主圆过滤 | `categoryBits=17` @1625231；**maskBits 不设** → vendor 原型默认 65535（@1412845 `b2Filter.prototype.maskBits=65535`；我方 vendor 字节级同源，探针直证 `new b2FixtureDef().filter` = 1/65535/0） | :420 `categoryBits:FILTER.PROP_CAT`(=17, b2.ts:32)、maskBits 缺省走 vendor 默认 | ✓ |
| 条件阻尼 | properties.linearDamping/angularDamping 存在才 Set*Damping @1625420-1625657 | 无对应（不解析两属性，恒 0） | ✓（数据零触发）/ **P2-b** |
| portal 圆 | r0.1@(0,0)、cat4096/mask4096、fr0.5、ρ0、userData `{"portal-sensor":true}`、isSensor 缺省 **false（实心）** @1625695-1625943 | :425-431 逐项同（b2.ts:76 `isSensor ?? false` 同缺省语义） | ✓ |
| options boxWidth/Height 1.8 | @1626133，Ball 物理不读（§1 死参数） | 未建模 | ✓（无需建模） |
| atlas/frame | MechAssets/ball0000（纯视觉，overGround 层） | 客户端层 | 设计内不计 |
| state 机 | 无覆写、不注册（§1）→ 无 checkState/updateState/组联动/resetStates | PropBody 无状态、props 不进 manager.register（mechanisms.ts:764） | ✓ |
| ocupy | BoxedDevice 2×2（@1624212 起），导航/尘埃非物理 | 无 | 同 30 号档 P2-D10 族（视觉层） |
| fixture 链表序 | CreateFixture 主圆先、portal 圆后；b2 链表前插 → GetFixtureList 逆序 | 同引擎同序 | ✓（无物理差） |
| 快照角符号 | — | world.ts:187 props `angle=-GetAngle()`（协议层负号，30 号档 §5-j 口径） | 协议层不计 |
| 工厂 | classNames `ball: Devices.Ball` @1837145 族 + `new c(this.game, h)` @1902980 | level2 解码 → buildMechanisms :764 | ✓ |

碰撞过滤交叉（双测 `(A.mask&B.cat)≠0 ∧ (B.mask&A.cat)≠0`，探针 §6 打印）：主圆(cat17/mask65535) ×
角色(cat16/mask4353 @1816520)＝碰撞、× 平台(256/4369 @1677052)＝碰撞、× 箱角圆(17/4097 @1635463)＝碰撞、
× 墙(32768/65535 @1562837)＝碰撞、× 地面(1/4369 @1801177)＝碰撞；portal 圆(4096/4096) × 角色＝穿越、
× portal fixture＝碰撞。两侧常数同构，语义无差。

## §3 数据面普查（全 49 关）

解析法同 33 号档 §1（tileset `tiles[].type` + per-level firstgid；**注意 firstgid 逐关可变**——forest_07
Objects firstgid=23，forest_27/27_1 因插入 LargeObjects 而为 26，须按「最大 firstgid≤gid」归属）。

| 项 | 值 |
|---|---|
| ball 对象总数 | **20**，分布 13 关：04_1(1)、07(3)、08(2)、19(1)、19_1(1)、20(3)、27(1)、27_1(1)、29(1)、32(1)、32_1(1)、bonus_1(1)、bonus_3(3) |
| 图块集定义 | Objects.json `tiles["10"]={type:"ball"}`；`tileproperties` **无 "10" 条目**（球无图块集级默认属性） |
| 对象级 properties | 20/20 = null |
| rotation | 20/20 = 0 |
| visible | 20/20 = true |
| linearDamping/angularDamping | 0 次出现（对象级+图块集级全查） |
| 双方数据一致性 | 13 关 JSON `json.load` 后 `==` 全等（我方 `data/forest/levels` vs oracle `output/A/data/forest/levels`，2026-10-15 实测） |

→ oracle 侧 rotation 矫正/条件阻尼两个分支对当前全部数据**恒不触发**；我方对应缺失在数据面无可观测差。

## §4 差异清单

### P0/P1

**无。** 未发现任何结构性简化、缺失 fixture/自由度/状态机分支。

### P2（数据面当前不触发/文档隐患）

- **a. rotation 维度未建模**：level2.ts:526 ball 分支不读 `o.rotation`，buildBall 无 rotation 形参、不设
  bd.angle、无 BoxedDevice e=(32,32)R(−rot) 矫正。若未来数据出现 rot≠0 的球，初始位置与体角双错
  （box 分支 level2.ts:508-523 已有可照抄的同族公式）。当前 20/20 rot=0，零触发。
- **b. linearDamping/angularDamping 不解析**：oracle 对存在该属性的球设体阻尼（@1625420-1625657）；
  我方恒 0。当前数据 0 次出现（含图块集级），零触发；temple 世界移植时需回查。
- **c. `params.ts:148-152` BALL 常量陈旧**（radius=0.9 ≠ 实际 0.4、无密度/摩擦字段）：零引用，仅文档
  隐患。33 号档 §3.3 已记并建议回填或删除；本档探针（mass=2.3π·0.4² 位级一致）再次钉死实值。

### 等价类记录（不评级）

- 我方 buildBall 不经精灵/enable 链直接建体：oracle 的精灵矩形 fixture 被 clearFixtures 当帧清空，
  净效果恒等（世界从未 Step 过含该矩形的时刻）。
- oracle `e.id=getNextFixtureId()`（调试簿记）、resSprite/autoCull/anchor、ocupy 2×2、ball0000 贴图：
  非物理层。
- wind 对球无作用：oracle 风仅认 `sprite.character`（33 号档 §5.1），两侧一致，不在本档重复计差。

## §5 顺带项：forest_05 Chars 层无 gid 空对象（id=38）

数据：`{id:38, name:"", type:"", x:576, y:-40, rotation:0, properties:null, visible:true}`（无 gid，
我方 data 与 oracle data 逐字节一致）。oracle 处理链逐级实证：

1. Phaser parser @1040100-1041640：无 gid → 落最后 else 分支，`J.rectangle=!0` 进 `F["Chars"]`（收录，但仅是坐标簿记）；
2. parseMapPropper（@1892560 区段）：`null != c.gid && null != r[+c.gid]` 双条件 → 无 gid 对象直接
   `e.push(void 0)`，**连图块集 type/属性合并都不参与**；
3. createCharObjects @1903195：仅处理 `f.type==="char"/"door"/"diamond"` 三分支；该对象 type 保持 `""`
   → 循环体内零操作（仅 console.log）。

**结论：原版完全忽略该对象，无任何物理/视觉实体。我方 parseLevel（level2.ts:400-403）丢弃并记一条
`Chars:空对象 id=38` 到 unknown（信息性）→ 无差异。** 该 unknown 记录可留作数据清洗提示，无需处置。

## §6 运行时探针（note/evidence/forest_08/tools/rb1-ball-parity-probe.mjs）

复跑：`npx tsx note/evidence/forest_08/tools/rb1-ball-parity-probe.mjs`（仓库根 gyのFW 下；2026-10-15
实测 **exit 0，121 项 PASS / 0 FAIL**）。方法：13 关逐关走真实 `parseLevel → new World(...)`，对
`mechanisms.props` 中 kind="ball" 的体 dump 体心/体角/阻尼/质量/惯量/全 fixture 参数，与从原始 JSON
现算的 oracle 公式（§1 ③④⑥）逐项比对。样例（forest_07 obj26）：

```
ball#0 objid=26 raw=(1056,128)
  PASS 体心px (1072.0000, 116.8000)        // =(rawX+16, rawY−11.2)
  PASS 体角rad 0 / linearDamping 0 / angularDamping 0
  PASS mass 1.156106096521044 / inertia 0.09248848772168353
  fixture[portal圆] r=0.1 fr=0.5 rest=0 ρ=0 cat=4096 mask=4096 grp=0 sensor=false userData={"portal-sensor":true}
  fixture[主圆]    r=0.4 fr=0.2 rest=0.1 ρ=2.3 cat=17 mask=65535 grp=0 sensor=false userData=null
[vendor 默认 filter] cat=1 mask=65535 group=0      // oracle @1412845 原型默认的我方引擎直证
```

（fixture 列表顺序为 b2 链表前插之逆：先印 portal 圆后印主圆，两侧同引擎同序，无物理差。）

## §7 存疑项

1. **oracle 浏览器端实测缺位**：本档结论基于「字节级同源引擎 + 逐参数同值 + 我方内核位级实测」的确定性
   推断（与 30 号档 §7.2 同一置信结构），未在 oracle 运行时对球做截帧比对。鉴于 ball 无状态机、无关节，
   不存在 30 号档 D1 那类「逐帧钳制」式隐藏行为面；剩余风险仅在建初始位形，已被探针钉死。风险评级：低。
2. **forest_27/27_1 的 Objects firstgid=26**（LargeObjects 插队）：本档扫描与 level2 resolveGid 均按
   「最大 firstgid≤gid」归属，二者一致；但任何外部复扫脚本若硬编码 firstgid=23 会误判（本槽探针初版
   即栽在此）。后续写扫描脚本注意。
3. **boxWidth=1.8 的用途旁证**：BoxPrototype 用它定八边形尺寸；Ball 仅在原型 options 里声明、构造器
   零读取——「死参数」判定为切片内全文 grep 结论，若 Closure 编译器曾把某处动态属性访问改名则理论上有
   漏检可能（同文件内 `boxWidth` 全部 13 处命中已逐一人工归类：BoxPrototype 12 + Ball 定义 1）。风险评级：极低。

## 附：证据与产出清单

- oracle 切片（本地，gitignore）：`TEMP/rb1/{Ball,BoxedDevice,Device}.js`
- 探针（可复跑，已入库）：`note/evidence/forest_08/tools/rb1-ball-parity-probe.mjs`（commit d6ee401）
- 本审计未修改任何源码；修复类 P2（rotation/damping 解析、params.BALL 常量）留主会话裁决
- 关联既有验证：33 号档 §2.2（箱/球 portal 感应圆逐参一致）、48-level-behavior.test.ts（含 13 关的逐关浸泡）、
  kernel2.test.ts:327（48 关构建冒烟）
