# 05 · 机关常数提取（原版混淆 JS 逐字节证据）

> 对象：`Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js`（2,273,196 B，只读）。
> 方法：node `fs.readFileSync(path,'latin1')` 按字节偏移切片（切片留存于 `gyのFW/TEMP/extract-c/d*.txt`，均带 `@行首偏移|` 前缀）。
> 引用约定：`@N` = 该**行首**的字节偏移（常量可能在该行内任意位置）；`define` 偏移 = `define("类名")` 所在行。
> 产出日期：2026-10-04。只读调研；除本文档外未改动任何仓库文件。

## §0 公共约定（先读，所有偏移解释都依赖它）

### 0.1 坐标与单位

| 项 | 值 | 证据 |
|---|---|---|
| ptm | `setPTMRatio(32)`，1m = 32px = 1 瓦片 | @1939689 |
| 屏↔物理变换 | sprite 坐标 = `mpx(-phys)` = **−32·phys**（x、y 均取负，镜像坐标系）；phys = −sprite/32 | PointProxy @1638350 区段（gettor 包一层 `-`） |
| 重力 | `gravity.y=1000`(px) → PointProxy settor `pxm(-a)` → 物理 **−31.25 m/s²** ⇒ **物理 +y = 屏幕向上** | @1940007 + PointProxy y-setter + gravity PointProxy 定义 @1596079 |
| 插件换算 | `mpx(v)=v·ptm`（正），`pxm(v)=v/ptm`（正） | @1602436 / @1602498 |
| Device.mpx/pxm | `mpx(a)=mpx(-a)`=**−32a px**、`pxm(a)=pxm(-a)`=**−a/32 m**（注意带负号，与插件相反） | @1658841–1659038 |
| 角度 | box2d 弧度；因坐标镜像，正角在屏幕上呈顺时针观感。Tiled `rotation` 属性为**度**，Device 构造时 ×π/180 | @1657038 |

### 0.2 Device 基类（@1655861，所有机关的公共行为）

| 行为 | 值/规则 | 偏移 |
|---|---|---|
| options 合并 | `deepObjectExtend(g,_defaults)` ← 地图对象 `c` ← 类原型 `this.options`；**deepObjectExtend 只填充缺失键（`null==a[c]` 才写入，已有值永不覆盖）⇒ 地图数据优先于类默认值** | @1656689–1656878，函数体 @2269237 |
| 默认 layer | `overGround` | @1656906 |
| **state 初值** | `+(properties.initialState)\|\|0`（地图无 initialState 则 0） | @1657319 |
| 贴图 | atlasName+frameName → resSprite，anchor 0.5 | @1657471–1657752 |
| 物理 | `enableBody===true` 时 enable+clearFixtures+SetAngle(π·rotation/180) | @1657812–1657878 |
| 指示灯 | lightFrame 存在时：child 精图为 `lightFrame+"_on0000"`，起始 `frameName=_off0000`；`offFrameName/onFrameName` 挂在 sprite 上 | @1658067–1658507 |
| 灯色 | group 首位数字 → `groupColors={1:#ff0000,2:#00cc00,3:#0D3EFF,4:#ffff00,5:#EC0EF1,6:#57beff,7:#9933FF}`，offTint=onTint=组色 | @1659264–1659681，表 @1660909 |
| updateLight(state) | state 真值→onFrame+onTint，否则 offFrame+offTint；构造后 `_.defer` 调一次 | @1659692–1660183，defer @1658538 |
| 每帧 | `update()→checkState()`（由引擎 update 链驱动） | @1660204 |
| state 切换入口 | `_updateState()→updateLight(state)+updateState()`（由 MechManager 信号驱动） | @1660292 |

### 0.3 MechManager 组同步（@1877082）

- `registerDevice`：按 `properties.group` 入组；有 `signal` 的设备（Lever/Pusher）把 `deviceChanged` 挂上自己的 signal。@1877606–1877856
- `deviceChanged(源)`：`g = OR(组内所有**有 signal**设备的 state)`；然后把 g 赋给组内**无 signal**设备并 `_updateState()`。**有 signal 的设备 state 不被覆盖**。@1879917–1880384
- `resetStates()`：全部设备 `updateState(true)`（true=静音）。@1879511
- 工厂表 `classNames`：pusher/lever/box/platform/beamer/rotmirror/lightpusher/portal/ball/pulley/hanging/boxmirror/boxheavy/infinitemirror/slider/timedpusher/wind/cover/window/roman。@1880454–1881108

### 0.4 任务书中旧锚点的更正

01 报告/任务书的 `@44867、@45070、@45115` 等是**行号**而非字节偏移（该字节区 44300–46200 实为 p2.js 碰撞检测代码）。换算：行 44867=`startLevel` 定义 @1942466；行 44755=`setupTutorial` @1937436；行 45070=`checkEndGame` @1950841；行 45097=`levelState.time` @1951945；行 45115=`updateTutorial` @1952695。

---

## §1 MovingPlatform（platform）@1714500–1722606

### 常数表

| 名 | 值 | 单位 | 偏移 |
|---|---|---|---|
| 形状矫正 | width<height 时交换 w/h、x+=h/2、y+=w/2、shapeRotation=−π/2；否则 x+=w/2、y+=h/2、rot=0 | — | @1714936–1715120 |
| padding.x / padding.y | properties.paddingX ?? 0 / paddingY ?? **0.06** | m | @1715216 |
| fixture | SetAsOrientedBox(w/2−padX, h/2−padY, (0,0), rot)（半宽高） | m | @1715853 |
| friction / restitution | 0.7 / 0 | — | @1716067/@1716094 |
| density | 有 dtheta → **0.5**，否则 **0** | — | @1716122 |
| userData | `{reflection:true}` | — | @1716207 |
| filter | category 256 / mask 4369 | — | @1716249/@1716287 |
| dtheta 关节 | revolute，锚点=质心−(offsetX\|\|0, offsetY\|\|0)；dtheta>0: [0, π·dtheta/180]，否则 [π·dtheta/180, 0]（**dtheta 单位是度**）；enableLimit | rad | @1716466–1717009 |
| maxMotorTorque（转臂） | **200** | N·m | @1717041 |
| 平移关节 | prismatic，轴=(dx,dy)；`lowerTranslation=−|(dx,dy)|`、upper=0（⇒ 行程=恰好 (dx,dy) 米：state0=地图原位，state1=原位+(dx,dy)） | m | @1717180–1717470 |
| motorSpeed（创建值） | **0.5**（仅创建；运行时 ±2 见下） | m/s | @1717538 |
| maxMotorForce | **220** | N | @1717570 |
| state 初值 | 0 | — | @1717709 |
| 贴图三段 | BarCapLeft@(+mpx(w/2−0.5),+mpx(h/2−0.5))、BarCapRight@镜像、BarCenter@(0,0) scale.x=(w−2)/3；lights[0].scale.x=(w−1)/3；sprite.scale 1.05/0.95（rot=0 时 x=1.05,y=0.95，否则对调） | px | @1717820–1718884 |
| options 默认 | `properties:{group:0, dx:4, dy:0}`、lightFrame `moving_platform_light` | m | @1718920 |
| 音效 | `"platform"`（playInstance 循环，到行程端点停） | — | @1719091 |

### updateState 伪代码（@1719608–1720376）

```
b = (是revolute且dtheta>0) ? -2 : 2        // 运行时速率 ±2 m/s
if state==0: SetMotorSpeed(b)              // 向 upper(0)/起始端
else:        SetMotorSpeed(-b)             // 向 lower(-|d|)/远端
ApplyForce((1,0),(0,0))                    // 唤醒 body 的固定小力
未静音则 playInstance("platform")
checkState(): state0 && pos>=upper → 停声; state1 && pos<=lower → 停声
   （pos：prismatic=GetJointTranslation；dtheta>0 取 −角度，否则取角度）
update()：revolute 时把 body 角度钳回 ±limit（SetAngle(−limit)）
```

### TS 片段

```ts
movingPlatform: {
  friction: 0.7, restitution: 0,
  densityTranslation: 0, densityArm: 0.5,
  paddingY: 0.06,                          // m, paddingX 默认 0
  motorSpeedCreate: 0.5,                   // m/s（仅创建值）
  motorSpeedRun: 2,                        // m/s，updateState 每步 SetMotorSpeed(±2)
  maxMotorForce: 220,                      // N
  armMaxMotorTorque: 200,                  // N·m，revolute（dtheta，度→弧度）
  categoryBits: 256, maskBits: 4369,
  defaults: { dx: 4, dy: 0, group: 0 },    // 地图未写时
  spriteScale: { x: 1.05, y: 0.95 },       // rot≠0 时对调
  sound: "platform",
}
```

---

## §2 Lever（lever）@1691750–1695838

### 常数表

| 名 | 值 | 单位 | 偏移 |
|---|---|---|---|
| 杆 fixture | `SetAsOrientedBox(0.15, 0.7, (0, 0.55), 0)` —— **半宽 0.15 / 半高 0.7**（全尺寸 0.3×1.4m），中心在 body 原点上方 0.55m（物理 +y=屏幕上） | m | @1693211 |
| friction / restitution / density | 0.7 / 0 / **1.6** | — | @1693340–1693395 |
| filter | category 1 / mask 61695 | — | @1693421–1693457 |
| revolute 支点 | 质心 + (0, **−0.7**)（物理）＝支点在 body 中心下方 0.7m（屏幕） | m | @1693676 |
| 限位 | lowerAngle=**−0.2π**、upperAngle=**+0.2π**（±36°） | rad | @1693791/@1693831 |
| maxMotorTorque | **10** | N·m | @1693899 |
| motorSpeed 初值 | **0**（未扳动前不自动回弹；首次过零翻转后才有 ±4 回弹） | rad/s | @1693931 |
| startPos 语义 | `startPos===−1 → SetAngle(GetLowerLimit())`，否则 SetAngle(GetUpperLimit())（+1=扳向上限） | — | @1694055 |
| state 初值 | Device 规则=0（tileset 无 initialState；onis/startPos 只定初始倾角与回弹方向） | — | @1657319 |
| 贴图 | 杆 `lever_stick0000` + 灯 `lever_stick_light_off/on0000`；座 `lever_base0000` + 灯 `lever_base_light_off/on0000`；都挂 lights（受组色 tint，state→on/off 帧） | — | @1692157–1693088 |
| 音效 | `"lever"`，**每次过零（开与关）都 play()** | — | @1694452 |

### checkState 伪代码（@1694485–1695042）

```
state==0 && angle*onis < 0:
    state=1; SetMotorSpeed(-4*onis); play("lever"); signal.dispatch(this)
state==1 && angle*onis > 0:
    state=0; SetMotorSpeed(+4*onis); play("lever"); signal.dispatch(this)
// onis=+1: 初始扳向上限侧；被扳过竖直(过零)→锁到对侧(state1)；
// 再扳回→马达 +4·onis 自动弹回原侧(state0)。马达转速 4 rad/s。
```

### TS 片段

```ts
lever: {
  fixtureHalf: { x: 0.15, y: 0.7 }, centerOffsetY: 0.55,   // m（物理 +y=屏幕上）
  pivotBelowCenter: 0.7,                                    // m
  density: 1.6, friction: 0.7, restitution: 0,
  categoryBits: 1, maskBits: 61695,
  angleLimit: 0.2 * Math.PI,            // ±36°
  maxMotorTorque: 10, motorSpeedFlip: 4, // rad/s，方向 = ∓4·onis
  sound: "lever",
}
```

### 附：LightPusher @1696249（森林未用，同族备查）

mass=0；光敏传感器盒 `sensorWidth/2 × pusherHeight/2`（默认 1.5/0.4→0.75×0.2m）isSensor @1696667；梯形实体（同 Pusher 顶点但高 `pusherHeight−0.1`）@1697159–1697497；`checkState`：传感器被**同色光**照亮(iluminated===properties.color)→state1，否则 0（无音效播放在 state0 分支）@1698345–1698581；音效 `"lightPusher"` @1698260。

---

## §3 Pusher（pusher 按钮）@1744642–1747906

### 常数表

| 名 | 值 | 单位 | 偏移 |
|---|---|---|---|
| 梯形顶点（物理局部坐标） | `(−w/2−0.5, 0)`, `(w/2+0.5, 0)`, `(w/2, h)`, `(−w/2, h)`，默认 w=**1**, h=**0.6** ⇒ **底宽 2m、顶宽 1m、高 0.6m**（底宽比顶宽多 1m，两侧各 0.5m） | m | @1745895–1746130，默认 @1747155 |
| friction / restitution / density | 0.7 / 0 / **0.1** | — | @1746340–1746395 |
| userData / filter | `"pusher"`；category 1 / mask 61695 | — | @1746421–1746489 |
| prismatic 轴 | `(0,1)`（物理竖直）；Initialize(bodyA=按钮, bodyB=地面, 质心)。**translation 量的是地面相对按钮的位移 ⇒ 按钮被踩下 0.2m 即 translation=+0.2** | — | @1746607–1746690 |
| 行程 | lower=**0**、upper=**0.7**（可下沉最多 0.7m） | m | @1746775/@1746810 |
| motorSpeed / maxMotorForce | **−15**（回弹，即向 translation→0）/ **5**（力很小，人站上去压得住） | m/s、N | @1746872/@1746901 |
| 触发阈值 | translation > **0.2** → state=1；≤ 0.2 → state=0 | m | @1747473/@1747641 |
| 贴图 | 块 `pusher_block0000` + 灯 `pusher_block_light0000`（只 tint 不换帧——无 on/offFrameName），underGround；`base` 精灵在 (x, y+mpx(0.5))=上方 16px，overGround，帧 `_default0000` | — | @1745225–1745762 |
| options | `{pusherWidth:1, pusherHeight:0.6}` | m | @1747155 |
| 音效 | `"pusher"`，**压下与回弹（每次 state 翻转）都 play() 并 dispatch** | — | @1747300 |

### checkState 伪代码（@1747427–1747824）

```
state==0 && translation>0.2 → state=1; play("pusher"); signal.dispatch(this)
state==1 && translation<=0.2 → state=0; play("pusher"); signal.dispatch(this)
```

### TS 片段

```ts
pusher: {
  trapezoid: { topW: "<pusherWidth>", bottomExtra: 0.5, height: 0.6 }, // 底=w+1
  defaults: { pusherWidth: 1, pusherHeight: 0.6 },
  density: 0.1, friction: 0.7, restitution: 0,
  axis: [0, 1], travel: [0, 0.7],        // m；translation=下沉深度
  motorSpeedReturn: -15, maxMotorForce: 5,
  threshold: 0.2, userData: "pusher",
  categoryBits: 1, maskBits: 61695, sound: "pusher",
}
```

---

## §4 BoxedDevice / Box / BoxHeavy @1661459–1676188

### BoxedDevice 基类

| 项 | 值 | 偏移 |
|---|---|---|
| enableBody | `_defaults.enableBody=true`（默认开物理） | @1661676 |
| 中心矫正 | `e=mpx(boxSize/2)`（插件 mpx，正值）旋转 −rotation；`x+=e.x; y−=e.y`（Tiled 角点→中心） | @1661716–1661951 |
| boxSize | `{x:2, y:2}` | @1662036 |
| ocupy | 占据 (x/32,y/32) 及 3 邻格（黑暗层用） | @1662082 |

### BoxPrototype（Box 的实体；Box=纯别名 @1675374）

| 名 | 值 | 单位 | 偏移 |
|---|---|---|---|
| boxWidth/boxHeight 默认 | **1.77 / 1.77**（不是 1.8！） | m | @1674701 |
| properties.boxSize | 有则覆盖 boxWidth（宽高同值） | m | @1671943 |
| 主 fixture | 八边形（切角 0.1m）：顶点 = 角点内收，`Set(顶点.reverse())` | m | @1672154–1672978 |
| friction | properties.friction ?? **0.4**；restitution 0 | — | @1673066–1673171 |
| density | options.density（Box 默认 **0.45**） | — | @1673199/@1674701 |
| 四角圆 | r=0.1，圆心 (±(w/2−0.06), ±(w/2−0.06))；category 17 / mask **4097**；friction=**circleFriction(0.1)**；density 0 | m | @1673370–1674122 |
| 传送门传感器 | 中心圆 r=0.1；cat 4096/mask 4096；friction 0.5；density 0；`{portal-sensor:true}` | — | @1674143–1674398 |
| **linearDamping / angularDamping** | **1 / 20** | — | @1674585/@1674628 |
| 贴图 | `movingbox0000`（MechAssets） | — | @1674701 |

### BoxHeavy @1675973 / BoxMirror @1676489（森林未用后者）

- BoxHeavy：`frameName="movingbox20000"`、`density=0.8`、`circleFriction=0.05`，其余同 Box。@1675973
- BoxMirror：mirror 2×0.05m 45° 镜面 fixture（density 0）@1676985–1677248。

### 可堆叠性

无专门代码——靠 density(0.45/0.8)+摩擦(0.4)+角圆(摩擦 0.1/0.05)+阻尼(1/20) 自然堆叠；角圆摩擦极低使箱子间少卡死。

### TS 片段

```ts
box: {
  size: 1.77,                       // m（宽=高）
  chamfer: 0.1,                     // m 八边形切角
  cornerCircle: { r: 0.1, offset: 0.06, friction: 0.1, categoryBits: 17, maskBits: 4097 },
  friction: 0.4, restitution: 0, density: 0.45,
  linearDamping: 1, angularDamping: 20,
  frame: "movingbox0000",
},
boxHeavy: { density: 0.8, circleFriction: 0.05, frame: "movingbox20000" }, // 其余同 box
```

---

## §5 Ball（ball）@1662671–1664269

| 名 | 值 | 单位 | 偏移 |
|---|---|---|---|
| **半径** | **0.4**（01 报告"≈0.9"系目测，实为 0.4） | m | @1663004 + @1664243 |
| friction / restitution / density | **0.2 / 0.1 / 2.3** | — | @1663116–1663173 |
| filter | category **17**；mask 未设（b2 默认 0xFFFF） | — | @1663199 |
| linearDamping / angularDamping | **无默认值**；仅当地图 `properties.linearDamping/angularDamping` 存在时 Set | — | @1663334/@1663497 |
| 传送门传感器 | 圆 r=0.1 cat 4096/mask 4096 friction 0.5 density 0 | — | @1663663–1663918 |
| 出生偏移 | 超类矫正前 `x−=mpx(0.5)`（−16px）、`y+=mpx(0.65)`（+20.8px）；boxSize 仍 2×2 ⇒ 净偏移约 (+16,−11.2)px | px | @1662870–1662912 |
| options | `{boxWidth:1.8, boxHeight:1.8, frameName:"ball0000"}` —— **boxWidth 1.8 对 Ball 无实际作用**（Ball 不走 BoxPrototype，boxSize 用基类 2×2），属死数据 | — | @1664091 |

### TS 片段

```ts
ball: { radius: 0.4, friction: 0.2, restitution: 0.1, density: 2.3,
        categoryBits: 17 /* mask 默认 65535 */, frame: "ball0000",
        portalSensor: { r: 0.1, categoryBits: 4096, maskBits: 4096, friction: 0.5 } }
```

---

## §6 Diamond（diamond）@1677884–1680308

| 名 | 值 | 单位 | 偏移 |
|---|---|---|---|
| 传感器 | 盒 **0.7×0.7**（半宽高 0.35），isSensor，density 0，friction 0.7；userData 最终为 `{lightProperties:{type:"transparent"}}`（`"diamond-"+色` 先写后被覆盖） | m | @1678630–1678937，options @1680005 |
| 出生偏移 | `x+=mpx(1)`（+32px）、`y−=mpx(1)`（−32px，即再上抬 1m） | px | @1678125–1678163 |
| 漂浮 | `sprite.y=−5` 起始；延迟 **2000·random()** ms 后 tween `y:−5→+5`，**2000ms**，Sinusoidal.InOut，yoyo+loop ⇒ ±5px / 2s / 随机相位 0–2s | px、ms | @1679640–1679910 |
| 分色规则 | `"silver"===char \|\| "fbwg"===char → 任何角色可拾；否则须 data.char===diamond.char`；且仅 begin-contact 生效 | — | @1679309 |
| 拾取 | play("diamond")；silver→`data.silverDiamond++`，否则 `data.diamonds++`；destroy | — | @1680064–1680108 |

### TS 片段

```ts
diamond: { sensor: 0.7, bobAmp: 5 /*px*/, bobPeriod: 2000 /*ms*/, bobPhaseMax: 2000 /*ms*/,
           spawnLiftPx: { x: 32, y: -32 }, sound: "diamond" }
```

---

## §7 Door（door）@1680712–1683858

| 名 | 值 | 单位 | 偏移 |
|---|---|---|---|
| 传感器 | 盒 `pxm(width/2)×pxm(height/2)` = **64×8px = 2×0.25m**；options `{width:64, height:8}`（px） | px | @1681726 + @1682662 |
| 传感器位置 | sprite/body 在 `(x+mpx(1), y+4)` = **(对象x+32px, 对象y+4px)**，盒心=body 原点 | px | @1680997/@1681133 |
| 属性 | static body；isSensor；density 0；friction 0.7；userData `"door-"+char` | — | @1681622–1682088 |
| isOpen 判定 | 同色角色 begin→`isOpen=true`，end→`false` | — | @1682345 |
| 贴图 | `FinishBoy/FinishGirl0000..0021`（TempleAssets，22 帧，代码 0–21 与图集一致），sprite@(x,y+4)，scale **0.8**，anchor.y **0.99**，background 层 | — | @1681079–1681544 |
| 帧推进 | **25 帧/s**（`c=25·min(0.04, elapsed/1000)`），`currentFrac±c` 后 `frame=round`；到 21 帧 `isUp=true` 并 dispatch+停声；关门反向扫帧，0 帧停声+dispatch；动画期间 `sounds.door.playInstance()` 循环 | 帧/s | @1682796–1683653 |
| 动画表 | "open" 注册为 10fps 占位（实际由 update 手推） | — | @1681252 |

### update 伪代码（@1682718–1683802）

```
a = 当前帧号
isUp = (a===21)
dt = min(0.04, elapsed/1000); adv = 25*dt
isOpen:  a<21 → currentFrac+=adv; frame=round; 无声则 playInstance("door")
         a==21 → signal.dispatch(); 停声
!isOpen: a>0  → currentFrac-=adv; frame=round; 无声则 playInstance("door")
         a==0 → 停声; signal.dispatch()
```

### TS 片段

```ts
door: { sensorPx: { w: 64, h: 8 }, sensorOffsetPx: { x: 32, y: 4 },
        spriteScale: 0.8, frames: 22 /*0000-0021*/, advanceFps: 25,
        maxStep: 0.04 /*s*/, sound: "door" }
```

---

## §8 Hanging（hanging 摆）@1684262–1688007

| 名 | 值 | 单位 | 偏移 |
|---|---|---|---|
| barWidth | properties.barWidth ?? **3.2** | m | @1684580 + @1687642 |
| 锚点/板位 | `anchor=polyline[0]+(x,y)`，`pos=polyline[1]+(x,y)`（px） | — | @1684664–1684797 |
| 绳 | tileSprite@anchor，宽=**polyline[0].y−polyline[1].y**（只取 Δy），高 20，`pulley_rope0000`，anchor(0,0.5) | px | @1684919 |
| 板宽 | 贴图 `hanging_platform0000`，`width = 1.15·mpx(barWidth)`（mpx 带负号，Phaser 负宽=翻转绘制；量值=1.15×barWidth） | m | @1685369 |
| 板 fixture | 六边形：`(m,0.12),(−m,0.12),(−n,0),(−m,−0.12),(m,−0.12),(n,0)`，m=barWidth/2，n=m+0.1（两端尖 0.1m）；friction **0.4**；restitution 0；**density 2.5**；cat 65535/mask 65535 | m | @1686096–1686658 |
| 阻尼 | **linearDamping 0.4，angularDamping 0.3** | — | @1685952/@1685994 |
| 锚点 body | `hanging_anchor0000` 精灵开物理，fixtureList `categoryBits=0`（不与任何东西碰撞，纯绳端） | — | @1685704–1685746 |
| 关节1 | DistanceJoint(anchorBody↔platformBody)@pxm(anchor),pxm(pos) —— 绳长=两点距离，不可伸长 | — | @1686776–1687014 |
| 关节2 | Revolute(anchor↔platform)@f：限位 **±0.85π/2 = ±0.425π（±76.5°）**；`properties.fullRotation` 真值时**不设限**（整周旋转） | rad | @1687082–1687270 |
| 关节3 | Revolute(anchor↔groundBody)@e（锚点钉死在世界） | — | @1687407–1687517 |
| update | `rope.rotation = atan2(−Δy,−Δx)`（platform−anchor，px） | — | @1687787 |
| reactable | 本类**未设** `"reactable"` userData（跳跃反冲只作用于 Pulley 平台） | — | 全文仅 @1740185/@1740231（Pulley）与 @1872529（角色）两处 |

### TS 片段

```ts
hanging: { barWidth: 3.2, boardThickHalf: 0.12, tipExtra: 0.1,
           density: 2.5, friction: 0.4, restitution: 0,
           linearDamping: 0.4, angularDamping: 0.3,
           swingLimit: 0.425 * Math.PI, /* fullRotation 属性→无限位 */
           boardSpriteW: 1.15, ropeThicknessPx: 20, anchorCategoryBits: 0 }
```

---

## §9 Pulley（pulley 滑轮）@1737345–1744238

| 名 | 值 | 单位 | 偏移 |
|---|---|---|---|
| polyline 四点 | [0]=板1、[1]=轮1、[2]=轮2、[3]=板2（各 +对象 x,y） | — | @1737751–1738159 |
| 轮锚点 | `anchor1/2 = polyline[1]/[2] + (x, y−mpx(2))` ⇒ **沿 polyline 点上移 2m**（−64px） | m | @1737751/@1737898 |
| barWidth | properties.barWidth ?? **2.7** | m | @1737668 + @1742076 |
| 板 | 两块，body `SetFixedRotation(true)`、userData **`"reactable"`**、linearDamping **0.1** | — | @1740101–1740320 |
| 板 fixture | 六边形同 Hanging（半厚 0.12、端尖 +0.1），friction 0.4，**density 3** | — | @1740609–1741046 |
| 板贴图 | `pulley_platform0000` 宽 `1.3·mpx(barWidth)`；座 `pulley_base0000`；轮 `pulley_anchor0000`@(anchor±10, y+10−60) | px | @1739441–1741311 |
| 滑轮约束 | `b2PulleyJointDef.Initialize(plat1, plat2, groundAnchorA=pxm(anchor1), groundAnchorB=pxm(anchor2), plat1质心, plat2质心, ratio=1)` —— **绳长联动由 box2d 原生约束完成，无自定义代码** | — | @1741642–1741835 |
| update | 三段绳 tileSprite 重画；轮 `rotation = len/π/10`（装饰）；平台静止时 cacheAsBitmap | — | @1742207–1744183 |

### TS 片段

```ts
pulley: { barWidth: 2.7, wheelLiftM: 2, ratio: 1,
          board: { halfThick: 0.12, tipExtra: 0.1, density: 3, friction: 0.4,
                   fixedRotation: true, linearDamping: 0.1, userData: "reactable",
                   spriteW: 1.3 } }
```

---

## §10 Roman（roman 罗马杠）@1748214–1751588

| 名 | 值 | 单位 | 偏移 |
|---|---|---|---|
| 三点→尺寸 | `polygon[0][0]===polygon[1][0]`（首段竖直）→ `m=2·pxm(p2x−p1x)`、`k=pxm(p1y−p0y)`、`f=0.6`、`d=−atan(k/(m/2))`；否则 `m=2·pxm(p1x−p0x)`、同 k、`d=+atan(k/(m/2))`。**倾角=atan(高/半宽)，符号视支点侧**（Device.pxm=−px/32） | m/rad | @1748499–1748767 |
| bar 挂点 | `h = p1+(x,y) + (mpx(1), −mpx(1))` = p1 右移 32px、下移 32px（mpx 带负号） | px | @1748970 |
| bar 贴图 | tileSprite `roman_bar0000` 宽=mpx(m)、高 30；两端 `roman_end0000`@(±mpx(m/2),0) anchor(0.05,0.5)，右端 scale.x=−1；`roman_center0000`@h，overChars 层 | px | @1749111–1749639 |
| bar fixture | 梯形 `(−m/2,−0.3),(m/2,−0.3),(m/2−2,0.3),(−m/2+2,0.3)`（m 单位为米；顶面每侧内收 **2m**，高 0.6m）；friction 0.7；restitution 0；**density 0.1**；cat 1/mask 65535；`SetAngle(d\|\|0)` | m | @1749718–1750227 |
| 底座 | `roman_base0000`@(h.x, h.y−mpx(k))，`height=−2·mpx(k)`；mass=0；`SetAngle(rotation)`；三角 fixture `(−1,0),(0,k),(1,0)`（底宽 2m、顶点高 k）；density 0.1；cat 1/mask 65535 | m | @1750264–1751171 |
| **翻转机制** | bar↔底座 Revolute@bar 质心，**无马达、无限位** —— 纯动力学跷跷板：角色走过支点即压翻（本类无 update/checkState） | — | @1751208–1751387 |

### TS 片段

```ts
roman: { barHalfThick: 0.3, topInset: 2, densityBar: 0.1,
         baseTriangle: { halfW: 1, h: "k(=pxm(高差))" }, densityBase: 0.1,
         joint: "revolute@bar中心, 无马达无限位",
         tilt: "d = ±atan(k/(m/2)), 视 polygon 点序" }
```

---

## §11 Wind（wind 风区）@1772669–1780312

| 名 | 值 | 单位 | 偏移 |
|---|---|---|---|
| rotation | 地图 rotation **+90**（度）后再转弧度 | — | @1773165–1773194 |
| 机身实体 | `properties.flat` → 盒(w/2, h/2, 中心(0,0.3))；否则梯形 `(−w/2−0.6,0),(w/2+0.6,0),(w/2,h),(−w/2,h)`，w=**2.5**, h=**0.6**（底 3.7m 顶 2.5m）；friction 0.4；restitution 0；**density 0.2**；随后 `body.mass=0` | m | @1773383–1774197 |
| 风柱传感器 | `SetAsOrientedBox(windWidth/2, length/2, (0, length/2+0.5), 0)`：宽 windWidth、高=length、**从机身上方 0.5m 起**；isSensor。`windWidth = properties.windWidth ?? 2.6`；**length 只来自地图 properties.length（LargeObjects wind 瓦片注入 length:10）**——JS 无默认 | m | @1774226–1774384 |
| activeBodies | contact 回调只收 `sprite.character`，begin 入表/end 出表 | — | @1774830–1775295 |
| 动画 | 机身 `wind_base` 0–4 @30fps loop（图集 5 帧 ✓）；effect `wind_effect` 0–30 @30fps（图集实为 0000–0029 共 30 帧，代码多请求 1 帧）、随机起始帧、height=mpx(length)、rotation=rotation、初始 invisible、overChars 层 | — | @1775305–1775972 |
| options | `{boxWidth:2.5, boxHeight:0.6, windWidth:2.6, windHeight:10, frameName:"wind_base0000", lightFrame:"wind_base_light", layer:"liquids"}`（windHeight 死数据）；`boxSize={x:−3,y:2}` ⇒ 机身中心≈地图点 +(32,−48)px | — | @1776085/@1776310 |
| initialState | 走 Device 规则（properties.initialState） | — | @1657319 |
| 音效 | `"wind"`，loop=true，**volume=0.2**，playInstance；关闭时 stopInstance | — | @1776399 + @1778256–1778378 |

### 施力公式（update @1776591–1777862）

```
active = invertInput ? !state : state; 若 active==1：
for 每个风柱内角色:
    dir  = (0,1) 旋转 rotation 弧度
    dist = |charPos − bodyPos|
    F    = dir · (1.2 + 0.2·sin(now/1000)) · 100 · (1 − dist/length)
    ApplyForce(F, (0,0))                        // 源头≈100–140N，线性衰减到柱端为 0
    ⚠ 以下两步属镜像注入段（@1777273–1777721，ES2016 `**` 运算符+英文注释，非 4399 原码）：
       v *= 0.975^(elapsed/(1000/60))           // 注入者改为随 dt 缩放
       |v| = min(|v|, 15)                       // 15 m/s 限速（注入）
```

### updateState 伪代码（@1777881–1778863）

```
a = invertInput ? !state : state
a==1 且 effect 不可见 → effect.visible=true; 播 base loop; sounds.wind.loop=true;
                       sound=playInstance(); sound.volume=0.2
a==0 且 effect 可见   → effect.visible=false; 停声; _.delay(400ms 后停动画并回 wind_base0000)
```

### TS 片段

```ts
wind: { boxW: 2.5, boxH: 0.6, trapezoidBottomExtra: 0.6, density: 0.2,
        windWidth: 2.6, sensorLift: 0.5, lengthFromMapOnly: true, // LargeObjects 瓦片 length:10
        force: { base: 100, pulsAmp: 0.2, pulsFreq: "1Hz(sin t)", falloff: "1-dist/length" },
        rotationOffsetDeg: 90, sound: { name: "wind", loop: true, volume: 0.2, offDelayMs: 400 },
        // ⚠ 阻尼 0.975 与 15m/s 限速段为镜像注入，保真复刻应回退为"常量 0.975/帧或不含"——未解
      }
```

---

## §12 Window（window，仅 bonus_1）@1780620–1783086

| 名 | 值 | 偏移 |
|---|---|---|
| 几何 | 同 MovingPlatform 的宽高交换逻辑（width<height 时换+rot=−90）；静态 body；盒 w/2×h/2；friction 0.7、restitution 0、density 0；cat 1/mask 61695 | @1780813–1781892 |
| 行为 | **无**：读 `properties.dx/dy` 但未使用（死代码）；`state=0` 硬置（覆盖 initialState）；无 update/checkState —— 纯静态几何+可被组染色 | @1781990/@1782077 |
| 贴图 | WindowLeft/Right@±mpx(w/2−0.5)、WindowCenter scale.x=(w−2)/3；sprite.scale 1.05/1.05；无 lightFrame | @1782132–1782878 |
| options | `{lightAtlas:"MechAssets", properties:{group:0, dx:4, dy:0}}` | @1782922 |

---

## §13 角色 update 力模型 @1857538–1877064（对照 TEMP/char-region.js，此处全部为原始偏移）

### 13.1 原型常数（@1863540–1864087）

`facing="left"` @1863540；`feetFriction=0.5` @1863577；`r1=0.48` @1863617；`r2=0.2` @1863648；`dr=0.03` @1863678；`y1=0.2` @1863709；`y2=−0.9` @1863739；`spriteScale=0.95` @1863770；`jumpImpulse=1` @1863810；`jumpVelocity=15.5` @1863847；`jumpIceVelocity=10` @1863888；`runForce=50` @1863930；`floatForce=30` @1863965；`defaultMaxSpeed=8.5` @1864002；`waterIceMaxSpeed=2` @1864045；`absoluteMaxSpeed=40` @1864087。

### 13.2 身体构成（@1858325–1863385）

| 项 | 值 | 偏移 |
|---|---|---|
| 出生偏移 | `x+=mpx(1)`（+32px）、`y−=mpx(1)`（−32px） | @1858325/@1858371 |
| body | fixedRotation、userData `"pers"`、`SetBullet(true)` | @1858845–1858963 |
| 传送门传感器 | 圆 r=0.1@(0,0)，cat 4096/mask 4096/groupIndex −1 | @1860424–1860907 |
| 躯干上圆 | r1=0.48@(0, y1=0.2)，friction 0 | @1860907 |
| **feetSensor** | 圆 r2=0.2@(0, y2=−0.9)（=中心下方 0.9m），friction=feetFriction 0.5，userData `"feet"`，contacts=[] | @1860931–1861099 |
| 躯干梯形 | `(±(r1−dr), y1)`、`(±(r2−dr), y2)`（上宽 0.9m、下宽 0.34m、高 1.1m），friction 0，**density 1.4** | @1859733–1860078 |
| 过滤 | 全部 fixture cat **16** / mask **4353**（=1\|256\|4096：地面\|平台\|传送门） | @1859321–1859427 |
| 动画 | legs_running 0–7@30fps（wg 冰面变体 10fps）；head idle 0–29 / jumping 0–10 / falling 0–4 / rising 0–4 全 30fps；ice_legs 0–4@10fps；hitArea r=0.65·height | @1861367–1862375 |

### 13.3 接触维护（@1862750–1863385）

- feetSensor 回调：传感器对 `liquid_death`：begin→`liquidTouched(liquidType)` 且 `isOnLiquid=true`；end→`isOnLiquid=false`。**isOnLiquid 对任何液体都置真（不论是否致死），死亡与否由 liquidTouched 分色** @1862936。
- 非传感器：begin 且法线非零→contacts.push(contact)；end→splice @1863130–1863227。

### 13.4 update 主流程（@1867616 起；逐条偏移）

```
终止条件：level.ended 或 physics.paused → 跳过 @1867738
dying → 藏身、dead 时清速度 @1867840
k=jumpImpulse; l=jumpVelocity; s=runForce; h=floatForce; m=defaultMaxSpeed @1868066-1868196
水声：左右键按住 且 isOnLiquid → waterplaying||{loop=true,volume=0.5,play}; 否则停 @1868233-1868516
冰声：左右键按住 且 isOnIce → iceSteps_<char> 循环；否则停 @1868626-1868890
接触法线：每个 contact 取 m_manifold.localNormal→GetWorldVector 存 m_normal @1869500-1869690
  contacts 按 dot(normal,(0,−1)) 升序排序 → d=contacts[0]（最"贴地"的接触），n=其法线 @1869631-1869690
g = elapsed/1000 @1869719
e = 130·g / currentRunForce @1869764
|v|<1 且 crf>0.5·s → e = s（低速大步爬升）@1869813

左键（右键对称，CrossSV 符号相反）@1869916-1870324:
  有地面接触 d:
    crf<s → crf = min(crf+e, s)                      // 爬升 @1869990-1870019
    p = (n.y>0.6 ? n.y : 0)                          // 陡坡不施力 @1870078
    i = n ×(−crf) · max(0,√p)                        // 力=法线叉乘(数值,0)*√坡度 @1870118-1870211
    p>0.6 且 0≤i.y<20 → i.y += 20                    // 贴地吸附 +20N（物理+y=屏幕上）@1870263
  无接触: i = (h,0) = (±floatForce,0)                // 空中漂浮力 30N @1870324
无键 @1870820-1871066:
  crf = 0.475·s                                       // 回落到 47.5%·runForce=23.75
  wg 冰: i=(20·−vx,0) 且 SetLinearVelocity(0,0)；否则刹车 i=(7·−vx, 0)

prohibitJump 边沿复位：松开上键才清 @1871152
跳跃门控 @1871235: !prohibitJump && up.isDown && ( (n!=null && n.y>0.2) || feetSensor.contacts.length>=2 )
跳跃执行 @1871372-1872620:
  ApplyLinearImpulse((0, k=1), (0,0))
  冰面分支（森林无冰，略：fb 3·n / wg jumpIceVelocity=10）@1871464-1871909
  常规: n.y>0.65 → v=(vx, 15.5)；否则 v=(vx, √√n.y·15.5)；|v|>15.5→归一×15.5；SetLinearVelocity @1871929-1872291
  对脚下 reactable：遍历 feetSensor body 的 contactList，凡 fixtureA body userData==="reactable"
    → ApplyLinearImpulse((0,−1),(0,0),true)           // 反冲 1 N·s 向下 @1872339-1872484
  prohibitJump=true; 播 jump_fb/jump_wg @1872620

施力与钳制 @1872765-1873359:
  刚跳过(f=true) → i.y=0
  冰面: fb i×0.2 / wg i×1；|v|>maxSpeed → 归一×maxSpeed @1872824-1873006
  i.x>0 且 vx<maxSpeed → ApplyForce(i)；i.x<0 且 vx>−maxSpeed → ApplyForce   // maxSpeed 只门控 x 分量
  ⭐ |v|>absoluteMaxSpeed(40) → 归一×40 —— **矢量长度钳制**（终速保险）@1873359
```

**关键发现：`currentRunForce` 从未在构造器初始化。** 全部 11 处引用都在 update 内（@1869794–1870838）。若玩家在进入关卡前就按住方向键且从未松开，`crf` 为 undefined：`undefined<50` 为假不爬升，力向量含 NaN，比较全假 ⇒ **不施力**，直到第一次松键走 else 分支写入 0.475·runForce。01 报告"初值 undefined→首帧 0.475·runForce"的"首帧"表述需修正为"首个无输入帧"。

### 13.5 冰/摩擦（@1866657–1867606）

`setFriction`：fb 冰→脚摩擦 0、maxSpeed=defaultMaxSpeed；**wg 冰→脚摩擦 0.7、maxSpeed=waterIceMaxSpeed=2**；非冰→双方 0.5/8.5。Refilter+对所有接触 ResetFriction。`setOnIce` 由液面/冰面瓦片接触驱动。

### 13.6 死亡与楼梯（@1864130–1866502）

- `liquidTouched(type)`：致死规则 `7===type || (wg&&6) || (fb&&5)`。**⚠ 该函数区段（@1864130–1864913）是镜像改过的唯一函数级区域**：花括号风格+`GameConfig.cheating.isInvulnerable` 免死钩子（@1864301）；致死分色规则本身与 01 §2.2 一致，可视为原始语义。
- `_doKill` @1865049：death 音、levelMusic.stop、levelMusicOver.play；death_smoke 0–45@30fps（图集 45 帧=0000–0044，代码多请求 0045）@1865367；烟在 (0,−0.7m)；vx<0 时 scale.x=−1；onComplete→`isDead=true`+signal.dispatch @1865695。
- `animateStairs(door)` @1866031：藏 head/legs；`fire|water_stairs` 0–30@**25fps**（图集实为 0000–0029 共 30 帧，代码多请求 0030——Phaser 缺帧警告后按现有帧播）；anchor(0.5,1)；scale 1→0.8 tween 360ms Linear @1866402；body 瞬移到 `door.pos + (0,4)`。

### TS 片段（params.ts 追加）

```ts
char: {
  feetFriction: 0.5, r1: 0.48, r2: 0.2, dr: 0.03, y1: 0.2, y2: -0.9,
  spriteScale: 0.95, torsoDensity: 1.4,
  jumpImpulse: 1, jumpVelocity: 15.5, jumpIceVelocity: 10,
  runForce: 50, runForceIdleRatio: 0.475, runForceRampNum: 130, runForceLowSpeedStep: 50,
  floatForce: 30, defaultMaxSpeed: 8.5, waterIceMaxSpeed: 2, absoluteMaxSpeed: 40,
  groundStickN: 20, groundStickGate: 0.6, slopeForceGate: 0.6,
  brakeN: 7, iceBrakeNwg: 20,
  jumpGate: { normalY: 0.2, fullJumpY: 0.65, minContacts: 2 },
  reactableImpulse: -1, categoryBits: 16, maskBits: 4353,
  waterSoundVolume: 0.5,
  iceFriction: { fb: 0, wg: 0.7 },
  anims: { legsRunning: [0,7,30], headIdle: [0,29,30], headJump: [0,10,30],
           headFall: [0,4,30], headRise: [0,4,30], iceLegs: [0,4,10],
           stairs: [0,30,25], deathSmoke: [0,45,30], stairsScaleTweenMs: 360 },
  // currentRunForce 语义：无初值；首个"无输入帧"写 0.475·runForce
}
```

---

## §14 游戏流程 @1927507–1955671（Level 状态）

| 项 | 值/规则 | 偏移 |
|---|---|---|
| 物理步进 | 插件 update 被覆写：`step=min(0.04, elapsed/1000)`；velocityIterations 8/positionIterations 3（插件默认）；`useElapsedTime=true`；载入后先 paused | @1941441–1941776 |
| loadComplete | 建层(background/tutorial/underGround/lights/ground/overGround/chars/overChars/decorations/liquids/ui/dust) @1944588–1945767；Ground→gravity=1000→createObjects（未知 type 仅 console.warn）@1940007/@1947927 | — |
| createCharObjects | pers1/pers2（默认 fb；signal→checkEndGame）；door1/door2（signal→checkEndGame）；diamond（silver 不计 totalDiamonds） | @1948191–1949264 |
| Navies 生成 | 每个可走空点 `new Navies(x,y, floor(1+3·random))`（即 1–3→2–4 只/组），容器 scale 0.3+0.7·rand，overGround 层 | @1940249–1940339 |
| **Navies 类** @1116883 | 每只：scale 0.3+0.7r；offsetCart{±100,±25}px；offset.r=400r；speed{r:7e-4+5e-4r, theta:3e-4+5e-4(r−0.5)}；pos{r:r, θ:r·2π}；update：r′+=speed.r；pos.r=offset.r·sin(r′)；θ+=speed.θ；x/y=offsetCart+r·(cosθ,sinθ) | @1117336–1118205 |
| **取点算法** @1836428 | `rng=seedrandom("ASDFA")` @1836652；每点数量 `round(3·rng()+3.5)` @1836744；四起点 `(h/4,h/4),(3h/4,h/4),(h/4,3h/4),(**3h/4,h/4**)` @1837034–1837299 —— **第 4 点与第 2 点重复（原版 bug，第 4 象限实际没有专属起点）**；从起点沿随机±1 步进走到无 `properties.type` 的空瓦片即 valid；×32px 输出 | — |
| decorate | 再次 `seedrandom("ASDFA")`（与取点同种子独立复用） | @1838337 |
| **startLevel** @1942466 | 3s 后 `suggestedFps<40` → 弃用 dust/navies @1942670–1942973；levelStarted=true @1943001；`MechManager.resetStates()` @1943035；解除暂停；**连跑 4 次 updateLogic + 1 次 updateRender** 后再暂停 @1943238–1943451；**_.delay(1600)→camFreeze=false→再 _.delay(400)→clock.start()+解除物理暂停** @1943550–1943858 | — |
| **checkEndGame** @1950841 | `!ended` 时：`door1.isUp && door2.isUp` → ended=true、物理暂停、animateFinish()；`pers1.isDead\|\|pers2.isDead` → ended=true、暂停、gameOver()。由 door/pers 的 signal 驱动（door 每帧满开/全闭都会 dispatch） | — |
| **animateFinish** @1951222 | levelMusic.stop → levelMusicFinish.play → 双人 animateStairs(door) → **_.delay(1600)→gameFinish()** | — |
| **gameFinish** @1951684 | `levelState.diamonds=pers1+pers2`；silverDiamond 求和；`levelState.time=clock.getElapsedSeconds()` @1951945；clock.stop；`state("endGame",{success:true,data,state})` | — |
| **gameOver** @1954887 | clock.stop → `state("endGame",{success:false,...})` | — |
| **retry** @1954673 | levelMusic.stop → `state.fade("level",true,false,levelData)`（整状态重载）→ killAll。GameOverMenu 的 Retry 按钮→`game.level.retry()` @1925172 | — |
| 教程 | setupTutorial @1937436：层名 `Tutorial_"+settings.controls` 或 `Tutorial`；按 properties.id 分组；text 对象→bitmapText **18px**、maxWidth=宽、cacheAsBitmap、visible=false；rect 对象→Rectangle。updateTutorial @1952695：任一 rect 含 pers1/pers2 sprite 坐标→已显则无操作，未显则 alpha 0→1 tween **400ms Linear**；离开→400ms 淡出 | — |
| **Clock** @1912095 | start→startTime=now；getElapsedSeconds=`round((now−startTime)/1000)` @1913834；pause 记 pauseTime，resume 把差值补回 startTime；stop→stopped；显示 `secondsToString`（"MM:SS"）@2269308 区段 | — |
| 暂停 | P 键 @1940862–1940941：game.paused 翻转、clock.pause/resume、PauseMenu | — |

---

## §15 与 01 报告（§3.2/§3.3）的差异与修正

| # | 01 报告表述 | 本次实证 | 结论 |
|---|---|---|---|
| 1 | Ball "半径≈0.9m" | `radius=0.4` @1664243 | **半径 0.4m**（0.9 是把 boxWidth/贴图误当半径） |
| 2 | boxWidth 默认 1.8 | BoxPrototype **1.77** @1674701；1.8 只出现在 Ball 的死字段 @1664091 | 箱宽 1.77 |
| 3 | Pusher "顶宽比底宽多 1m 外扩 0.5m" | 顶点 @1745895：底=w+1、顶=w | **方向写反：底宽比顶宽多 1m** |
| 4 | Hanging 只记 linearDamping 0.4 | 另有 **angularDamping 0.3** @1685994 | 补充 |
| 5 | 杆"0.15×0.7m 盒" | `SetAsOrientedBox(0.15,0.7,(0,0.55))` | 0.15/0.7 是**半**尺寸（全 0.3×1.4m），中心偏移 0.55m；支点在中心下 0.7m @1693676 |
| 6 | Lever motorSpeed "±4×onis" | 初值 **0** @1693931；过零翻转后才 ±4·onis | 未扳动前杆不自动回弹 |
| 7 | 任务书锚点 @44867 等 | 为**行号**：startLevel 实为 @1942466（§0.4 换算表） | 更正 |
| 8 | （未提）Wind 阻尼/限速 | @1777273–1777721 为 ES2016+英文注释的**镜像注入段** | 原版行为未解（见 §16） |
| 9 | liquidTouched 已知镜像钩 | 确认；致死分色规则未被改动 | 维持 |
| 10 | Navies "4 象限" | 第 4 起点重复第 2 点（@1837235） | 原版 bug，复刻可选择照抄 |
| 11 | stairs 0000–29 / smoke 0–45 | 代码请求 stairs 0–30、smoke 0–45（均比图集多 1 帧名） | Phaser 缺帧仅警告；复刻按图集即可 |
| 12 | currentRunForce "首帧 0.475·runForce" | 无初值；0.475 只在**无输入帧**写入 @1870838 | 语义修正（§13.4） |
| 13 | 平台运行速度 ±2 m/s | 确认 @1719847；且 dtheta>0 时取 **−2** @1719670 | 补充符号细节 |

---

## §16 未解清单

1. **Wind 原版阻尼/限速**：`0.975^(elapsed/16.67)` 与 15 m/s 限速在镜像注入段内（ES2016 语法+英文注释为铁证）。原 4399 版该处是什么（常量 0.975？无限速？）无法从本构建包确证。施力公式本体（(1.2+0.2sin)·100·衰减）无注入痕迹，可信。
2. **Roman 的地图点序约定**：公式已完整提取（@1748499–1748767），但 k/d 的屏幕方向依赖 forest_14/14_1/24/24_1 各 polygon 的实际点序，未逐关核对（属关卡数据侧工作）。
3. **Door 传感器相对门对象 y 的语义**：盒心在 (x+32, y+4)px 处已实证；但 Tiled door 对象 y 本身是瓦片对象底边，关卡编辑器里的可视对齐需结合 47 张图逐关核对（超本次范围）。
4. **Hanging 板宽负值**：`width=1.15·mpx(barWidth)` 因 mpx 带负号实际写入负宽（Phaser 以裁剪实现，视觉=1.15×barWidth 但左右翻转）。对碰撞无影响（fixture 由六边形独立给出）；若复刻渲染引擎不支持负宽，直接取 1.15×barWidth×32 即可。
5. **Pusher `base` 精灵**帧为 `_default0000`（占位空帧）@1745560，即底座贴图实际不可见——是否有意如此未解（图集另有 `pusher_block_silver0000` 未被引用）。
6. **Wind `invertInput`** 与 `flat` 属性在森林 33 个风区里是否出现未逐关统计（属关卡数据侧）。
7. **角色空气控制**：无地面接触时 `i=(±floatForce,0)` 同样受 `vx<maxSpeed` 门控——但空中门控用的是 defaultMaxSpeed 还是冰面 maxSpeed 取决于 setOnIce 状态，未做逐帧仿真验证。

---

## 附 · 切片产物索引（gyのFW/TEMP/extract-c/，已 gitignore）

`d01-movingplatform d02-lever d03-lightpusher d04-pusher d05-boxeddevice d06-ball d07-boxfamily d08-diamond d09-door d10-hanging d11-pulley d12-roman d13-wind d14-window d15-devicebase d16-mechmanager d17-navies d18-clock d19-level d20-early(实为p2.js) d21-charupdate d22-charproto d23-endmenus d24-charfixtures d25-charliquid d26-charfriction d27-navies-class d28-charfixtures2 d29-charproto0 d30-charkill（各 .txt，@行首偏移| 前缀）`；扫描脚本 `scan.mjs scan2.mjs dump.mjs`。
