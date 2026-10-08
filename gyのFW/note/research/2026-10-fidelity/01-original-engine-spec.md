# 01 · 原版构建包行为规格（子代理 A 完整报告）

> **⚠ 勘误指针（2026-10-08）**：本文个别常数/计数已被后续内核落地实证修正——球半径 0.9→0.4、
> 箱宽 1.8→1.77、§2.5 gid 归属三处（pusher 权威计数 73、leverA/B 权威计数 25/49、forest_02 平台 2 个）、
> Wind 阻尼/限速已结案。权威勘误全文见 [../handoff/2026-10-04-execution-freeze.md](../handoff/2026-10-04-execution-freeze.md) §四
> 与 [05-mechanism-constants.md](05-mechanism-constants.md) 结案注；工程最终事实以 `packages/shared/src/kernel/` 代码与单测断言为准。

> 对象：`D:\01_Guiyuan1111\GitHub\slbhr\Fireboy-and-Watergirl\output\A\`（只读参考，禁改）。
> 引用约定：`init.js` = `js\init.eb02fbdab2aa1d24.js`（2,273,196 字节），`@N` = 字节偏移。
> 产出日期：2026-10-04，只读调研，未修改任何文件。

## §0 全局警告：该构建包并非纯净原版

抓取仓库（README 指向 `yezhiyi9670/fireboy-and-watergirl-grabber` 的二次改版，托管痕迹为 **4399 版内核 + `apps.ak-ioi.com` 镜像**）。以下内容是**镜像作者注入的修改，不能当"原版事实"**：

1. `init.js` 头部 0–8300 字节的 `GameConfig`（自适应 tick 调度、`zooming.lock`/`minScaleRatio`、cheating、`console.log2`、"quantumEdition" 等注释）——原版 Phaser 主循环被换成累积时间 substep 执行器（@200–4700）；
2. `output\A\gameIndex.html` 里的 umami 统计、`/multiplayer.js`（netlib 键位转发联机）、全屏按钮（第 41–121 行）；`output\multiplayer.js` 与根目录 `multiplayer.js` 是两个不同版本（5899B vs 7934B），均为本地加入；
3. main 模块域名白名单检查被注释掉改成恒真（@2264700 附近，原代码可见 `4399.com/localhost/127.0.0.1` 白名单被 `//` 注释）。

引擎本体（Phaser 2 + box2d.js + 关卡/素材/数值）可信为原始产物。

## §1 结构盘点

### 仓库根 `Fireboy-and-Watergirl\`
- `index.html`（8450B，选 A–F 六作的传送门页）、`README.md`、`LICENSE`、抓取脚本 `1.unpack_har.py` / `2.grab_files.py` / `common.py`
- `har\A..F.har`（19–33MB/个，网络抓包原始档）；`data\A..F\resource-list.json`（每个构建的资源清单+关卡加载顺序）；`img\`（background.jpg/icon.png）
- `output\A..F\` 六套完整客户端：A=森林神庙（`output\A\game.json`：`{"id":"forest","title":"Fireboy & Watergirl in The Forest Temple"}`）；B=光庙；C=冰庙；D=水晶庙；E=元素合集；F=童话（另含 `fairy-tales.min.js`、`version.js`）

### output\A（共 81 个文件）

| 类别 | 路径与数量 |
|---|---|
| 入口 | `gameIndex.html`（4915B；`data-main="js/init.eb02fbdab2aa1d24.js"`，require.js 引导）、`game.json`、`bower_components\requirejs\require.js` |
| 引擎 JS | `js\init.eb02fbdab2aa1d24.js`（2,273,196B ≈ 5.4 万行，未混淆字符串可全文检索；文件第 1–3 行注释 "The code in the game disables console.log"，实际禁用点在 @2262459：`m.log||(console.log=function(){})`） |
| 图集（TexturePacker，atlasJSONArray） | `assets\atlasses\` 7 对 json+png：CharAssets(732KB png/239帧)、GroundAssets(95KB/343帧)、MechAssets(484KB/163帧)、MenuAssets(196KB/60帧)、MenuBackgrounds、PopupAssets、PreloaderAssets；外加 `assets\atlasses\Temples\forest\TempleAssets.json/png`(288KB/60帧) |
| 音频 mp3 | `assets\audio\` 33 个：LevelMusic(+_speed/_dark/_Finish/_Finish_speed/_Over)、MenuMusic、Clock、Death、Diamond、Door、EndDiamond/EndFail/EndPass、Freeze/Melt、IceSteps_fb/_wg、Jump_fb/_wg、Lever、LightPusher、Platform、Pusher、Portal×4、Slider、WaterSteps、Wind、CharToggle1/2 |
| 图块集(Tiled json) | `assets\tilemaps\tilesets\` 4 个：Ground.json、Chars.json、Objects.json、LargeObjects.json（其 `image` 字段引用的 Ground.png/Chars.png/Objects.png/LargeObjects.png **不在包内**，仅编辑用；运行时不用这些图） |
| 散图 | `assets\images\`：Beam.png、GameNameForest.png、TempleHallForest.jpg、branding\branding_logo_kizi.png |
| 字体 | `assets\fonts\chinese\font.fnt/font.png`（1.6MB 中文位图字体，bitmapText 键名 "font"） |
| 关卡数据 | `data\forest\levels\` 47 个 json（02–32 共 31 关 + 13 个 `_1` 变体 + bonus_1/2/3）；`data\tutorials\levels\forest_01.json`；`data\forest\temple.json` |

## §2 关卡数据模式（重点）

### 2.1 层结构
所有关卡为 **Tiled 1.11.2 JSON**，正交 32×32 瓦片。标准 39×29 格 = **1248×928px**；唯一例外 `forest_bonus_2` 为 39×35=1248×1120。层清单：

- `Ground`（tilelayer）：地形+液体+斜面；全部碰撞由引擎在 `convertTilemap` 按 type 生成；
- `Chars`（objectgroup）：**出生点、门、钻石**（层名有误导性，实为"角色相关物"）；
- `Objects`（objectgroup）：机关（gid 对象 + 无 gid 的 type 对象）；
- `Tutorial_dual / Tutorial_single / Tutorial_keyboard`（仅 forest_01 与 forest_bonus_1）：按 `settings.controls` 选层（JS @1936760 `_.findWhere(f.layers,{name:"Tutorial_"+this.game.settings.controls})`）。
- **没有 Hazard 层**——危险面就是 Ground 层液体瓦片。JS 只按层名硬取 Objects 与 Chars（@1936494/1936530）。

### 2.2 瓦片 type 语义（来自 `assets\tilemaps\tilesets\Ground.json` tiles/tileproperties + JS 实证）
瓦片 gid = firstgid(=1) + 本地图号；地图数据里实际出现的本地图号仅 1–8：

| 地图值(gid) | 本地图号 | type | 官方语义（证据） |
|---|---|---|---|
| 1 | 0 | 0 | 实心地面。`drawTile` 随机取 `MaskBox00000..00003` 四种蒙版（@1831573）；碰撞整格方块（createGroundShape 0/10 分支 @1843899） |
| 2 | 1 | 1 | 凸斜面 A：三角形顶点 (−1,0),(−1,−1),(0,−1)（物理系 1m=1格；@1843899）。ASCII 上呈"/"（向右升高） |
| 3 | 2 | 2 | 凸斜面 B（镜像 '\'，顶点 (0,0),(−1,−1),(0,−1)）；11→同1、12→同2 是雪地变体 remap（@1831600） |
| 4 | 3 | 3 | 凹/倒三角件 C：(0,0),(−1,0),(−1,−1) |
| 5 | 4 | 4 | 倒三角件 D：(0,0),(−1,0),(0,−1) |
| 6 | 5 | **5** | **水 WaterBox**（@1704002 三元式 `5→"WaterBox"`） |
| 7 | 6 | **6** | **火/岩浆 FireBox** |
| 8 | 7 | **7** | **绿泥 GreenBox** |
| — | 9–14 | 8/9 | **仅液体行两端盖专用**：type8=左端盖墙（顶外扩0.3m）、type9=右端盖（createGroundShape 8/9 分支 + convertTilemap 液体分支 @1833100），不来自地图数据 |
| — | 10/11/12/13/14 | 9/10/11/12/-1/55 | 森林未用：雪地/暗面/冻结水面（55→type5 且 `startFrozen=true` @1699471；type10/11/12 供 `CreateSnows` 沿 WE/SE/SW 扫雪 @1844900；-1 只画不撞 @1833950） |

**全部 48 关地面 gid 统计**：1×14114、2×764、3×881、4×770、5×628、6×407（水）、7×327（岩浆）、8×315（绿泥）。例：L2 水18/岩浆18/绿泥16；L13/15/17/20/24/27 无液体；L21 仅 2 格水。

> **结论：复刻的 `LIQUID_TILE={water:5,lava:6,green:7}`（`gyのFW\packages\shared\src\level.ts:119`）方向完全正确，不必对调。** 双重证据：`createLiquidGraphics` @1704002 + 角色致死判定 @1864139：`7===type || ('wg'===char&&6===type) || ('fb'===char&&5===type)` 才死——**火人碰水(5)死、水女孩碰岩浆(6)死、绿泥(7)双杀**。
> ⚠ `note\handoff.md` 第 11 行验收表述"火人趟水应安然无恙、水女孩趟水应化烟"与原版恰好相反（火人趟水必须死）。疑似笔误，改文案不改代码。

### 2.3 Chars/Objects 的 gid 语义（图块集本地 id，来自 4 个 tileset json 的 tiles.type + char/color 属性）

- `Chars.json`（8 帧 64×64，firstgid 通常 16）：本地 0=`char,fb`（火出生）、1=`char,wg`、2=`door,fb`、3=`door,wg`、4=`diamond,fb`、5=`diamond,wg`、6=`diamond,silver`、7=`diamond,fbwg`（森林数据**未使用** 7；推测留给神庙奖励）。
- `Objects.json`（16 帧）：0=`pusher`、1=`lever`(onis:1,startPos:-1)、2=`lever`(onis:-1,startPos:1)、4=`box`、5=`beamer`、6=`rotmirror`、7=`lightpusher`、10=`ball`、11=`infinitemirror`、12=`boxmirror`、13=`boxheavy`、14=`timedpusher`(time:2000)、15=`wind`。
- `LargeObjects.json`：0=`portal`、1=`portal`(inverted)、2=`wind`(length 10)。
- **注意 firstgid 不固定**：Objects 可为 23 或 24（如 forest_05=23、forest_02=24，故 L5 的 gid24/25 是**拉杆**而 L2 的 gid24 是**按钮**）；forest_14/16/20 甚至 Objects=16、Chars=32/35。**解析必须逐关读 `map.tilesets[].firstgid+source`**（复刻 level.ts 按 source 名查，正确）。

### 2.4 无 gid 对象（type 即类名，Objects 层自定义对象）

- `platform`：矩形(x,y,w,h)即板体；properties `dx/dy`（**单位=格=米**）平移向量、`group` 联动拉杆/按钮；另有 `dtheta/offsetX/offsetY`（旋转板）、`paddingX/paddingY`（默认 y 0.06m）（MovingPlatform @1714493–1719100）
- `hanging`：polyline 两点（锚点→摆板），`fullRotation` 属性（L2 两根摆绳）
- `pulley`：polyline 四点（板1、轮1(上移2m)、轮2、板2）定滑轮组
- `roman`：polygon 三点定一根可翻转罗马杠（roman_bar 贴图+两端 roman_end，中心支点，@1748207）
- `window`：仅 bonus_1（2 个）
- 数据残留噪声：forest_05 的 Chars 层有 1 个空对象（id38，x=576,y=−40，w=h=0，无 type）——原版运行时 console.warn 跳过（@1948081 createObjects 找不到类只警告），复刻解析器应容忍。

### 2.5 出生点/门/钻石表达 + 机关全集出现表（全 48 关扫描）

| 物（本地图号） | 总数 | 出现关数/范围 | 运行时语义（证据） |
|---|---|---|---|
| char fb/wg(0/1) | 48+48 | 每关恰 1 对 | `new character(x,y,'fb'/'wg')`，pers1/pers2（@1948270） |
| door fb/wg(2/3) | 48+48 | 每关恰 1 对 | 64×64 位图对象；Door 类（@1680900–1683200） |
| diamond fb(4)/wg(5) | 235/230 | 34/34 关 | 生成时 y 再上抬 1m；±5px 正弦漂浮 2s yoyo（@1678150） |
| silver(6) | 14 | 07,11,13,13_1,17,17_1,20,23,25_1,27,27_1,29,32,32_1 各 1 颗 | 任何角色可拾；**不计入 totalDiamonds**（@1948500），单独存 `levelState.silverDiamond` |
| pusher 按钮(Obj0) | 73 | 29 关+bonus | 压板（下压 0.7m、阈值 0.2m、@1745300–1747900） |
| lever onis=1(Obj1) | 29 | 22 关 | 拉杆（@1691743–1696242） |
| lever onis=−1(Obj2) | 45 | 24 关 | 同上，初始方向相反 |
| box(Obj4) | 42 | 16 关+bonus | 可推木箱 |
| ball(Obj10) | 20 | 13 关+bonus | 球（半径≈0.9m、density 2.3、restitution 0.1、@1662664） |
| boxheavy(Obj13) | 17 | **仅 bonus_2** | 重箱 |
| wind(LargeObj2) | 33 | 14 关 | 风区（@1772662，density0/mass0、windWidth/length、wind_effect 15帧动画、sound 'wind'） |
| platform | 223 | 45 关 | 移动平台（@1714493） |
| hanging | 20 | 7 关（02,12,12_1,19,19_1,25,25_1） | 摆（@1684255） |
| pulley | 11 | 10 关 | 滑轮（@1737338） |
| roman | 6 | 14,14_1,24,24_1 | 罗马杠（@1748207） |
| window | 2 | bonus_1 | 窗（@1780613） |
| **森林未用**：beamer/rotmirror/lightpusher/timedpusher/infinitemirror/boxmirror/portal/slider/snow/cover | 0 | — | 属其它神庙机关，tileset 是六作共用超集 |

### 2.6 temple.json（选关图，`data\forest\temple.json`）

48 节点：`{id,x,y,filename,time,mobileTime,required,type,initial,opened,_id}` + `edges[source,target]` 图。要点：`type ∈ general|speed|puzzle`（对应 MenuAssets DiamondSpeed/DiamondPuzzle 与 PopupAssets FinishStoneSpeed/Puzzle 图标）；`time/mobileTime` 为每关**时限秒数**（speed 关要在限时内过，推测）；`required` 全 0（本包无钥匙解锁）；`_id` 即加载顺序（与 `data\A\resource-list.json` levels 数组一致：01,02..07,30,31,32,08..29, 然后 13 个 `_1` 变体, bonus 1/3/2）；`edges` 决定大厅连线布局；x,y 为大厅归一化坐标；`color:#5B4610`。Bonus 关 `requirePerfects:false, wing:0`（为"完美通关/翅膀"预留字段，本包未启用）。

## §3 混淆 JS 字符串挖掘结果（引擎架构与手感）

### 3.1 模块/类名全集（`define("…")` 共 105 个，@7763–2272970）

- **引擎栈**：Phaser（两处 define @7763/@1112069）、PIXI @305652、**box2d.js 1.0.2（Phaser.Physics.Box2D 插件）** @1595xxx–1654k（`this.ptmRatio=50` 默认、`version:"1.0.2"`）、hammer.js @1814110、underscore @2034211、jquery @2166181、backbone @2166677、bowser（UA 检测）、requirejs（外部）。
- **States**：Boot→Load→menu(TempleHall/Menu/SingleMenu/TempleSelector/MultiHall/MultiMenu)、levelMenu(Grid/Tree/Buttons/LevelButton)、level(Level)、endGame、gameComplete、buy(BuyMenu/SoftLockMenu 付费墙)、settings、credits。UI 组件：Button/GoldButton/StoneButton/GoldLock/Lock/MuteButton/PauseMenu/EndMenu/GameOverMenu/IngameMenu/Clock/LevelUI/FinishCounter/CursorToggle/CharCursors/TouchButton/Navies。
- **States/Level 本体**：Ground @1829138、**character @1857531**、CharCursors @1849922、MechManager @1877075、CameraManager @1881609、Level @1927498、Clock/LevelUI/FinishCounter/EndMenu/GameOverMenu/PauseMenu/CursorToggle/IngameMenu。
- **States/Level/Devices**（机关类）：Device(基类 @1655854)、BoxedDevice、BackgroundCover、**Ball、Beamer、Box、BoxHeavy、BoxMirror、Diamond、Door、Hanging、InfiniteMirror、Lever、LightPusher、Liquid、MovingPlatform、Portal、Pulley、Pusher、Roman、RotMirror、Slider、Snow、TimedPusher、Wind、Window**。
- 工厂总表 @1880560：`classNames={pusher:Pusher, lever:Lever, box:Box, platform:MovingPlatform, beamer, rotmirror, lightpusher, portal, ball, pulley, hanging, boxmirror, boxheavy, infinitemirror, slider, timedpusher, wind, cover:BackgroundCover, window, roman}`——**map 对象的 `type` 字符串就是这里的 key**（gid 对象的 type 由 tileset `tiles[].type` 注入，@1936100 `deepObjectExtend(c, r[gid])`）。

### 3.2 物理/手感常量（`e.prototype.*` @1863650–1863990，火/水共用同一 character 类）

```
feetFriction=0.5  r1=0.48  r2=0.2  dr=0.03  y1=0.2  y2=−0.9  spriteScale=0.95
jumpImpulse=1  jumpVelocity=15.5  jumpIceVelocity=10  runForce=50  floatForce=30
defaultMaxSpeed=8.5  waterIceMaxSpeed=2  absoluteMaxSpeed=40   （米、秒、米/秒）
```

- **世界尺度**：`setPTMRatio(32)`（@1939712，Level.create）⇒ **ptm=32：1m = 1 格 = 32px**；插件 PointProxy 对 x/y 都取负（@1638460–1638950），物理坐标 = 屏幕坐标 ÷(−32)——与 `forest01-route.md` 记的 `(−32·b2x, −32·b2y)` 完全一致。
- **重力**：`game.physics.box2d.gravity.y = 1e3` px ⇒ 物理 −1000/32=−31.25 m/s²（@1940535）。
- **换算成 px/s 即复刻 params.ts 的取值**：maxSpeed 8.5→272；jumpVelocity 15.5→496（理论跳高 123px，实测 103px 差在脚底锚点）；absoluteMaxSpeed 40→1280；platform motorSpeed 0.5m/s→16px/s（注意：0.5 仅创建值，运行时 ±2=64px/s，见 §3.3 MovingPlatform 与 02 报告 E7）；数值换算本身全部吻合。
- 移动/施力逻辑 @1870200–1873400：地面按住方向键时 `currentRunForce` 以 e≈每帧增速爬到 runForce=50；力向量=法线×currentRunForce，且 `p>0.6 && 0≤i.y<20 时 i.y+=20`（贴地吸附 20N）；松键时 `i=(7·−vx, 0)` 刹车、冰面 fb×0.2/wg×1 特殊摩擦（`setFriction` @1866900：fb 冰摩擦 0、wg 冰摩擦 0.7 且限速 2m/s——冰庙逻辑，森林无冰可忽略）；**跳跃**需 `cursors.up` 且接触法线 n.y>0.2（`prohibitJump` 防连跳），先 `ApplyLinearImpulse(0,1)` 再 `SetLinearVelocity(x, jumpVelocity)`（n.y>0.65 满跳，否则 √√(n.y) 折减），同时向脚下 `reactable`（摆/平台）各施 −1 冲量（@1872500）；空中左右键用 floatForce=30。
- 液体手感：水中/冰中行走循环播放 `waterSteps`/`iceSteps_*`（@1868200）；`isOnLiquid` 由死亡传感器 begin/end 维护（@1862900）。
- 碰撞过滤（category/mask）：角色 feetSensor+躯干 category 16、mask 4369（@1858700–1862500）；液体传感器 category1 mask61695/4369；平台 category 256；拉杆 category 1。

### 3.3 机关行为要点（逐类证据）

- **Liquid** @1699450–1707000：每"行"液体一个对象，传感器两条：显示/光源带(顶0.15m–0.5m)与 **killFixture（顶下 0.18m 至整格深，mask 4369，type:"liquid_death"）**；type55=冰面 startFrozen；图形=每行 `Water/Fire/GreenBox{Left|..|Right}0000..14` 15 帧 30fps 循环（行宽>2 才铺中段）。
- **Door** @1680900：静态传感器（64×8）；本角色站上→`isOpen`，帧进度以 **25 帧/s** 推进 `FinishBoy/FinishGirl0000..21`（10fps 动画表仅是占位），到 21 帧 `isUp`；**两门 isUp→ended→animateFinish**（@1950841）：停 BGM、`levelMusicFinish`、双人 `animateStairs`、1600ms 后 `gameFinish`（存 `levelState.diamonds{red,blue,silver}/time`，进 endGame 结算）。任一角色 `isDead` → gameOver（`levelMusic.stop()+levelMusicOver.play()`、death_smoke 0–45 帧 30fps，@1864600）。
- **Diamond** @1677877：underGround 层、mass0 传感器、±5px 2s 正弦漂浮随机相位（0–2s 延迟）；`silver/fbwg` 人人可拾，否则需同色；拾取播 `diamond` 音。
- **Lever** @1691743：杆+底座双贴图（MechAssets lever_* + `_light_on/off`）；躯干 0.15×0.7m 盒 density1.6；**revolute 关节连地面，限位 ±0.2π(±36°)，motorSpeed=±4×onis 自动回弹、maxMotorTorque 10**；角度过零翻转 state 并 `signal.dispatch`→MechManager 同步同 `group` 全体设备（@1877180–1880500）。`startPos:±1` 定初始扳向。
- **Pusher** @1744635：**踏板**而非推块——梯形壳（顶宽比底宽多 1m 外扩 0.5m、高 0.6m、density0.1）+ **prismatic 竖直关节，行程 0–0.7m，motorSpeed −15/maxMotorForce 5 自动回顶**；位移>0.2m 记 state=1（`pusher` 音效）；lightpusher=带黄光的同类。
- **MovingPlatform** @1714493：宽<高 时自动交换并 −90°；density 0（平移）/0.5（dtheta 转臂，maxMotorTorque 200）；平移=prismatic(轴=dx,dy)，**motorSpeed 0.5、maxMotorForce 220**，行程 ±|(dx,dy)|m；外观 BarCapLeft/Right+BarCenter 三段、scale(1.05,0.95)；userData `{reflection:true}`。（运行时 updateState 每步 SetMotorSpeed(±2)=2m/s=64px/s——见 02 报告 E7，此处 0.5 仅为创建常量。）
- **Ball** @1662664 / **Box** 系 @1675209–1677877（box/boxheavy/boxmirror 均 BoxedDevice 子类，差异=尺寸/密度/贴图；boxWidth 默认 1.8m）；**Hanging** @1684255：`pulley_rope` tileSprite 长=|polyline 段|，摆板 hanging_platform 宽 1.15×barWidth、linearDamping 0.4、锚点 fixture category 0；**Pulley** @1737338：两平台过两轮（轮=锚点上移 2m），reactable；**Wind** @1772662：rotation+90、梯形风场盒、mass0，对场内角色施风力、wind_base/effect 动画；**Roman** @1748207：三点 polygon → 倾角 `atan(高/半宽)` 的 roman_bar 可翻转杠。
- **MechManager**：所有设备按 `properties.group` 分组，signal 触发时组内同步 state（@1880300）；portal 按 `portalId` 成对连接并对地面端点 `connectToWall`（森林无 portal）。

### 3.4 资源加载清单（@2220300–2223000 Load 状态、@2211724 Boot）

Boot 只加载 `game.json`+PreloaderAssets+KiziLogo；Load 加载：TempleHall<名>.jpg、GameName<名>.png、HallBeam(assets/images/Beam.png)、CharAssets/PopupAssets/MechAssets/GroundAssets/Temples/<t>/TempleAssets 图集、**4 个 tileset json（键名 Ground/Objects/LargeObjects/Chars，TILED_JSON 类型）**、中文位图字体、33 个音频（首字母大写映射：`levelMusic→LevelMusic.mp3` 等，`assets/audio/<Name>.mp3`）；关卡 json 由 Level 状态按 `levelPath="data/"+levelData.filename` 现载（@1930130），TempleAssets 再在 baseLoadComplete 里按当前神庙二次加载（@1930500）。资源键与 `data\A\resource-list.json` 一致。

### 3.5 游戏状态机

`boot→load→menu(TempleHall)→levelMenu→level`；level 内三标志：`level.ended`（停物理步进 `box2d.paused`）、角色 `dying/isDead`（`_.delay(_doKill,0)`）；成功走 `gameFinish→state("endGame",{success:true,data:levelData,state:levelState})`，失败走 gameOver→EndMenu/GameOverMenu（Retry 重开本关）；Pause 键 P（@1941200）+ 长按 ESC 系 PauseMenu；`GameConfig.cheating.isInvulnerable`（本构建 localStorage `fb-forest:invulnerable` 可开无死）与 `isFullUnlock` 是**镜像注入调试钩**（@1864139 死亡分支里被判断）。存档命名空间 `fb-forest`（save/loadSettings @2263300），ProgressModel(backbone) fetch `data/<temple>/temple.json` 与本地进度合并（@2199500）。

## §4 渲染管线（原版如何画）

1. **地面 = ForeGround 纹理 × MaskBox 蒙版**（铁证 @1832900–1836300）：
   - 整层瓦片先逐格 `drawTile` 画进一张 `bitmapData(宽+64,高+64)` 蒙版 `n`：type0 随机 4 种 `MaskBox00000-3`(34×34)，其余 `MaskBox{type}0000`（type10→0、11→1、12→2、55→5 remap）；
   - `TempleAssets` 的 `ForeGround0000`（256×256 岩壁纹理）平铺满另一张 bitmapData `f`；
   - `bmd = bitmapData(...); bmd.alphaMask(f, n)` ⇒ "纹理裁成地形形状"的地面贴图；`maskBmd=n、foregroundBmd=f` 留作黑暗遮罩复用；
   - 同轮生成碰撞：type0 连续段合并成整块多边形（每遇右侧非同类就 Set 一个 u×1m 盒）、type5/6/7 行合并并生成端盖 8/9 与传感器、其余逐格 createGroundShape。**groundBody userData="ground"**、单一 static body（@1832750）。
2. **液体**：不是逐格贴图——每个"行段"一条 1 格高的动画带（Left/中×(w−2)/Right，15 帧 30fps，帧尺寸 46×47/50×50 > 32px 产生溢出光感）。
3. **摄像机**（CameraManager @1881609）：目标=双人包围盒 `|Δx|+worldPadding(200,100,200,100)` 需塞进视口(扣 viewportPadding top64)⇒ **连续动态缩放**；`minScale=0.9×屏/图`、`lockScale=0.97×`、`maxScale=1.5`（**0.9/0.97 是镜像注入值**，原版机制/25px 弹簧在 JS 里；桌面最小可视窗另设 `40×30m(=1280×960px)`、移动/小屏 `20×15m` @1886800）；跟手弹簧：`a=1/15(用户拖 1/3)、damping 0.5`，逐帧 `v=(v+(target−pos)·a)·0.5`（@1886660）；滚轮 ×0.8/×1.2 手动缩放、1s debounce 锁回 lockScale（wheelScale @1882300，注入段）；debug 模式定 1.0（@1886980）。
4. **浮尘/粒子**：地面四象限取可走空点 4 处×每处 `round(3·rng+3.5)` 个（seedrandom("ASDFA")）`Navies` 粒子（MenuAssets `Navy0000` 贴图，极坐标漂移 speed.r 7e-4±5e-4；@1116950+1836437）；**beamer 存在时**才 `fillDustLayer` 用 GroundAssets `BeamDust0000-59`（54×53）做光束浮尘；`Dust0000-59`(113×99)、`DarkDisk0000`(301×300)、`frost/vapor` 为冰庙/暗关素材。暗关（levelData.type==="dark"，森林无）用 `setupDarkness` MULTIPLY 黑罩+各设备 `drawDarkMask` 径向光（Lever 光锥代码 @1695300）。
5. 描边/投影等后处理由内联的 Phaser filter 库提供（outline/inline/shadow/bevel/colorMatrix，@1816566–1825891）；0.2.0 笔记"3.5px 描边+8px 软投影"是**我们从实拍反推的近似**，原版是否用 filter 渲染地面未见直接调用（推测：原版地面观感来自 MaskBox 蒙版+黑边烘焙在 ForeGround 纹理内）。
6. 角色贴图管线：CharAssets `fire|water_head_{idle|jumping|falling|rising|_ice_legs}`、`*_legs_{idle|running}`、`fire/water_stairs0000-29`（进门爬楼梯动画）、`*_glow0000`、`diamond_*`、`death_smoke0000-45`；spriteScale 0.95、锚点同心（与 0.2.0 做法一致）。

## §5 原版关键事实 vs 我们当时认知（对照）

| 项 | 当时认知（note 出处） | 本次实证 | 结论 |
|---|---|---|---|
| LIQUID_TILE 5/6 方向 | level.ts:10 注释"若反了对调" | 5=WaterBox 杀 fb；6=FireBox 杀 wg；7=GreenBox 双杀 | **无需对调；handoff.md 验收文案写反** |
| 1 tile=1m、ptm32、gravity1000px/s²、jumpVel496、runMax272、maxFall1280 | params.ts:6–29 | @1939712/@1940535/@1863856 换算 | 全部吻合 |
| 平台速度 | params.ts:29 `16px/s`（按 0.5m/s 换算） | 创建常量 0.5，**运行时 SetMotorSpeed ±2 → 64px/s** | **慢 4 倍错误**（02 报告 E7 为准） |
| 液体下半格实心碰撞 | 0.2.0"魔改修复" | createGroundShape 5/6/7 = 下半盒 @1844050 | 原版即如此，**不是魔改** |
| 机关 gid 本地 0/2/4 | 0.2.0"0=推块、2=拉杆、4=推箱" | tileset：0=**pusher 踏板按钮**、1/2=lever 双方向、4=box；firstgid 有 23/24/16 三种 | 数值对，**命名与固定偏移假设需修正** |
| forest_02 机关 | 0.1.0"4 拉杆+2 平台" | 按钮×4（2 个 group2）+ 平台×3（2 横 dx=5 group2 + 1 竖 dy=4）+ 摆绳×2，**0 拉杆** | 0.1.0 笔记有误 |
| 相机"固定全景≈原版" | 0.2.0 已知差异 | 原版连续动态变焦（双人包围盒驱动） | 差异确认 |
| 教学文字 7 条静态 | 0.2.0 已知差异 | forest_01 实为 **8 步**（id 0–7）；渐进与否当时未逐帧验证 | 条数应改 7→8；（后续 02 报告证实原版为触发式渐进） |
| 顶部时钟正计时 | 0.2.0 a26308c | Clock 状态 1912088 未展开验证 | 保持结论 |
| 通关演出 | 0.2.0 | Door 21 帧→双 animateStairs→levelMusicFinish→1600ms→结算 | 吻合，参数已有（25帧/s、1600ms） |
| 出生/门每关 1 对、银钻 14 关各 1 | 无记录 | 48 关全扫描 | 新增事实 |
| temple.json 关卡树/时限/bonus 顺序 | 无记录 | §2.6 | 新增事实（选关/结算/star 复刻依据） |
| 原版禁用 console.log | 任务描述 | @2262459 覆盖为 noop（游戏内 log 调用被吞） | 属实（该注释本身是镜像加的） |

## §6 其他值得记录的事实

- 关卡内**无机关专用层**：机关全在 Objects、角色物在 Chars；`platform/hanging/pulley/roman/window` 的 type 直接写在对象上，gid 对象的 type 由 tileset 注入（@1936100）。
- 原版把**关卡 JSON 当"资源"处理**：Phaser.TilemapParser 解析后自定义合并（parseMapPropper @1935700）——对 M3"全机关数据驱动"是最佳模板。
- 付费/广告残留：`States/Buy`、AdManager、`devUnlock/devSkipAds`（@2262300）——复刻直接无视。
- 物理步进：Level 覆写插件 update 为 `step=min(0.04,elapsed/1000)`（@1941460），velocityIterations 8/positionIterations 3（插件默认 @1596300）；我们 60Hz 固定步长等价于原版低帧率下行为。
- `note\report\visual-0.2.0\` 有对照截图（原版实拍 vs 我方）。
