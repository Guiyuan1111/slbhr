# 13 号档 · UI 转场动画保真审计（uitrans-audit 槽）

日期：2026-10-20 ｜ 槽位：uitrans-audit ｜ 性质：只读考古+档卷（零代码改动）。
口径：oracle 字节字证（`output/A/js/init.eb02fbdab2aa1d24.js`，md5 `d637cb8c…`，下记 **bundle:偏移**；该件为行格式化件，辅以行号）+ 我方源码 file:line，双源逐项裁定。文字模型禁像素判读，一切参数取自代码常量；本档未做运行时对拍，无实机数据处均已注明。12 号档（角色/设备动画）已闭环面不重复，本档补 **界面切换/面板/菜单/结算 UI 族**。

## 0. 结论速览

- **oracle 全部换屏走自建 `state.fade` 黑幕**（overlay 工厂 bundle:2211744 → 500ms 淡入 alpha 0→1（:2212785）→ `state.start` → 500ms 淡出（:2213182）；"Loading" 文字 800ms 后现、300ms 点循环（:2212125/:2212213）；定义 :2213815）。**全 bundle 0 处 camera.fade/flash/StateTransition**（grep 字证）。我方所有切换（Menu↔Temple↔Game、结算 Continue、GameOver 双钮）均**裸切**——最大单件缺失。
- **面板入场非 tween，是弹簧物理**：IngameMenu 基类 `force=2.3`（:1850446）、`friction=0.7`（:1850514）、起点 `y=1.5·realHeight`（:1852057）、dt 钳 0.04（:1852409）；黑幕 alpha **跟板位置动态** `0.7·(1−Δy/全程)`（:1852225）。我方 buildBoard=Back.easeOut 420ms+静态 0.7 黑幕（overlays.ts:33-36）——形状近似、手感参数不同。
- **任务三项假设证伪**：①LevelMenu 进场**无 stagger/tween**（LevelMenuButtons 全静态，我方亦静态=一致）；②NewSign **无弹跳**（两处皆静态贴片，bundle:1920491/:1947823）；③oracle 按钮**无 hover 语义**（换帧=按压反馈 mousedown/up；我方做成 hover 换帧+无按压=语义错位）。
- **popupArrow 非 2fps 闪烁**：oracle 为"0000 静置→末拍单帧 0001 恒亮"（:1876067/:1877712，全 bundle 仅此两处引用、无动画注册）；我方 2fps 无限闪烁（overlays.ts:152-163）——偏差。
- **星碑动画**：oracle `play("to_"+stars)`=**分段** 1-7/8-14/15-21（:1877727）；我方播累计 1..7N 段（overlays.ts:164-172），BootScene 的分段键 finish_stone_* 成死代码——偏差。
- 计数：**41 项盘点 = 已复刻/一致 10 ｜ 偏差 18 ｜ 缺失 10 ｜ 不适用/边界 3**（§2 总表）。

## 1. oracle 机制速览（证据基座）

### 1.1 换屏黑幕 state.fade（main 模块，bundle:2211744-2213815）

- overlay 工厂 `k({showText})`：黑 Graphics 铺 realWidth×realHeight + bitmapText "Loading"（alpha=0）；rAF 循环：`elapsed>800ms` 后文字 alpha=1，`Math.floor((d−800)/300)%4` 驱动 "Loading..."→"Loading"→"Loading."→"Loading.." 点循环（:2212125/:2212213）。
- 淡入 `s()`：alpha 0→1 tween **500ms、easing null（Linear）**（:2212785）；完成后 stage 背景置黑。
- `state.fade(to, clearWorld, clearCache, data)`（:2213815）：fading 门 → overlay(showText:true) → 500ms 淡入 → `AdManager.showAd` → `state.start` → 新 overlay alpha=1 → 下一 rAF 500ms 淡出（:2213182）→ 收尾。
- 调用面（8 处，全部换屏）：EndMenu Continue :1878226、GameOverMenu Menu :1880672、Level.retry :1909660、Level.quit :1910067、LevelMenu.startLevel :1935281、goBack :1935440、Menu.startTemple :1941847、Menu.skipToLevel :1942047。
- **不走 fade 的三处（bare start，无黑幕）**：Level.gameOver→"endGame"（:1907069）、gameFinish→"endGame"（:1909856）、firstComplete→"gameComplete"（:1932467/:1939658）；Boot→Load→Menu 首入链亦裸切（Load.create `state.start("menu")`）。

### 1.2 面板基类 IngameMenu（define @bundle:1848948，弹簧常量 1850446-1852409；还原件行 43576-43681）

- 板=PopupBackground0000（boardBg cacheAsBitmap），初始 target=outside={x:W/2, y:**1.5H**}（:1852057）；`show()`→target=center，`hide()`→target=outside。
- 每帧弹簧（:1852409-1852409 区）：`a=min(0.04, elapsed/1000)`；`ay=(target.y−board.y)·2.3·a`（:1850446）；`vy=(vy+ay)·0.7`（:1850514）；`board.y+=vy`；|Δtarget|<1 且 |vy|<1 静止；接近 outside（<3px）→visible=false（滑出即隐）。
- 黑幕 alpha=**0.7·(1−(board.y−center.y)/(outside.y−center.y))**（:1852225）——随板入逐帧加深至 0.7。
- 板缩放 `min(1, min(W/1082, H/642))`（:1851667 附近 `this.board.scale.set(a)`）。
- 子类全表：PauseMenu、EndMenu、GameOverMenu、SettingsMenu、CreditsMenu、SoftLockMenu、BuyMenu、GameCompleteMenu——**八面同一套滑入/滑出**。

### 1.3 其余字证锚点

| 件 | 参数 | bundle 偏移 |
|---|---|---|
| Button 按压 | downFrame 换帧 + `label.scale.set(0.95)`/回 1 | :1088674（StoneButton 帧 ["StoneButton0000","StoneButton0001"] :1848121） |
| LevelButton（菱形节点） | `diamond.scale.set(0.95)` 即时 :1105248；setUp 延迟 **100ms** 回 1（:1105414，常量 100 @:1105464） | 原始行 26469-26480 |
| TempleHall 光柱 ×8 | `t+=0.003`/帧 :1097040；`rotation=0.2·sin(t_offset+t·t_speed)` :1097136；`y=−H/2−帧高/2−|sin|·H/4` :1097166 区；宽 `0.6+0.4·|sin|` 脉冲；alpha `0.6+0.4·rand` :1094106；t_offset=(i−3.5)·2π/7−rand·π/6、t_speed=rand·0.6（行 26155-26156）→ 相位速度 0-0.108 rad/s（周期 ≥58s） | :1094049 |
| Navies 蜡烛 ×4 | scale 0.3-1.0 rand；offsetCart=(±100,±25) rand；`r=400·rand·sin(rprime)`、rprime+=7e-4+5e-4·rand /帧、θ+=3e-4+5e-4·(rand−0.5) /帧（行 26079-26093） | :1091311/:1091498/:1091591 |
| 结算 700ms 链 | `f=700` :1876767；四级 `_.delay` 嵌套 :1876786/:1877004/:1877210/:1877517——**隐藏行 delay=0 立即串联**（`g.visible && f`） | 行 44290-44361 |
| popupArrow | 生成 :1876067（行 44315）；末拍 `frameName="popupArrow0001"` :1877712（行 44346）——单次换帧恒亮，无闪烁动画 | — |
| 星碑 | `k.animations.play("to_"+stars)` :1877727（行 44347）；to_1/2/3=帧 1-7/8-14/15-21 @30fps once（EndMenu renderContent 注册） | — |
| Continue 启用 | 与星碑播放在**同一回调**（行 44348-44349 `animationDone=!0, b.enable()`） | :1877712 区 |
| 时限文本 | `p.alpha=0.7`（"font" 18 号，secondsToString(data.time)） | :1874743 |
| Confetti 发射器 | `makeParticles(Confetti0000-3)` :1927673；scale 0.5-1；`setYSpeed(100,200)` :1927815；`setXSpeed(−5,5)`；rotation 20-50；`start(false, 2500, 60, 0)` :1927928（粒寿 2500ms/每 60ms 一发/无限流）；doKill：emitter 停 + 5200ms 后收尾；GameCompleteMenu.close：hide()→**1000ms**→onClose | 行 45679-45691 |
| firstComplete | Menu.afterAddContent :1939549 / LevelMenu.afterAddContent :1932358；bare start("gameComplete") :1939658/:1932467 | — |
| Level 进场 | `root.alpha=0`→下一 rAF 置 1+`ui.show()`（单帧门） :1896262；startLevel：1600ms 后 camFreeze=false（:1898770/:1899006）→再 400ms clock.start+解物理 | — |
| animateFinish | stairs 双角色 + **1600ms**→gameFinish（bare endGame :1909856） | :1906557 |
| 进关音 | `menuMusic.fadeOut(500)`（LevelMenu.startLevel） | :1935094 |
| LoaderBar | Load 态 crop 进度条（LoaderBar0000 裁剪 200px 宽）+LoaderHolder+LoaderTitle | :2164711 |
| camera.fade/flash | **0 命中**（grep `camera.fade|camera.flash|camera.shake|StateTransition` 全空） | — |

## 2. 总表（41 项逐项裁定）

裁定：✅已复刻 ｜ ⚠️偏差 ｜ ❌缺失 ｜ ➖不适用/边界。成本 S/M/L。oracle 证据一律 bundle:偏移；我方一律 file:line（`packages/client/src/` 省略前缀）。

### 一、场景切换族

| # | 项 | oracle 证据 | 我方现状 | 裁定 | 成本 | 建议 |
|---|---|---|---|---|---|---|
| 1 | 换屏黑幕 fade（500+500ms+Loading 文字点循环 800/300ms） | :2213815 定义；8 调用点 §1.1 | MenuScene.ts:77-82 Play 裸 `start("Temple")`；TempleScene.ts:191 back 裸 `start("Menu")`；BootScene.ts:98；main.ts:341/352-355 | ❌缺失 | M | **Top1**：做一个全屏黑幕 fade 工具（含 Loading 文字），挂 Menu↔Temple↔Game/结算全部换屏点 |
| 2 | 首入链 Boot→Load→Menu | 裸 `state.start("menu")`（Load.create） | BootScene.ts:98 裸 | ✅一致（双侧裸切） | — | — |
| 3 | 胜利→结算入场 | animateFinish stairs+1600ms（:1906557）→**bare** endGame（:1909856）→板弹簧入、无黑幕 | GameScene.ts:1436 1600ms→main.ts:341 `start("EndMenu")` 覆盖式 | ✅已复刻（族同构；板运动差见 #7） | — | — |
| 4 | EndMenu Continue→换关 | fade("levelMenu") :1878226 | __fwNextLevel 活房间 advance 裸切（overlays.ts:178-188、main.ts:246） | ⚠️偏差 | L | 并入 Top1；联机语义受挂账 #6 约束，须与 connect-ui 语义协同 |
| 5 | GameOver Menu/Retry 退场 | fade("levelMenu") :1880672；retry→fade("level") :1909660 | overlays.ts:200-207 裸 stop+restart/leave | ⚠️偏差 | M | 并入 Top1 |
| 6 | 暂停进出 | game.paused + PauseMenu 同基类弹簧入，无黑幕 | main.ts:314-315 start/stop("PauseMenu")+服务端冻结 | ✅已复刻（族同构） | — | — |

### 二、面板入场族（六面共用参数，单点修复）

| # | 项 | oracle 证据 | 我方现状 | 裁定 | 成本 | 建议 |
|---|---|---|---|---|---|---|
| 7 | 板滑入运动 | 弹簧 force 2.3/friction 0.7/起点 y=1.5H/dt 钳 0.04（:1850446/:1850514/:1852057/:1852409） | Back.easeOut 420ms y 960→159（overlays.ts:36） | ⚠️偏差 | S | **Top2**：buildBoard 换 update 驱动弹簧（六面同享） |
| 8 | 黑幕跟板动态 alpha | `0.7·(1−Δy/全程)`（:1852225） | 静态 0.7 矩形（overlays.ts:33） | ⚠️偏差 | S | 并入 Top2 |
| 9 | 板缩放适配 | `min(1, min(W/1082, H/642))`（:1851667 区） | 固定原生 1082×642 @1280×960 ⇒ 等价 | ➖不适用（现视口等价；换自适应分辨率时需补） | — | — |
| 10 | 面板关闭滑出 | hide()→target=outside 弹簧滑出，近 outside 自动隐 | scene.stop() 瞬消（overlays.ts:71/75/78、menus.ts:60/86/122） | ❌缺失 | S | 并入 Top2（hide 复用同一弹簧） |
| 11 | 八面共用基类结构 | §1.2 八个子类 | buildBoard 六面共用（overlays/menus） | ✅结构同构 | — | — |

### 三、LevelMenu 族

| # | 项 | oracle 证据 | 我方现状 | 裁定 | 成本 | 建议 |
|---|---|---|---|---|---|---|
| 12 | 节点/枝干/底座进场 stagger | **无**——LevelMenuButtons（define :1915305）addContent 全静态布局、0 tween 调用（还原件行 45354-45578） | TempleScene.ts 全静态（烘焙+节点即建） | ✅一致（「sprite 层可能有进场 tween」假设证伪） | — | — |
| 13 | NewSign | 静态贴片：节点 +40/−20 scale x（:1920491）；TempleSelector +60/−60 scale 0.7（:1947823）；**无弹跳** | 未实现（INDEX §3 挂账 #9） | ❌缺失（静态件，非动画） | S | 随 UI 校准轮立项（挂账 #9） |
| 14 | 菱形节点按压 | scale 0.95 即时（:1105248）+100ms 回 1（:1105414/:1105464）+pusher 音 | TempleScene.ts:179-183 仅 pointerup、无反馈 | ❌缺失 | S | **Top3 打包** |
| 15 | BackButton | 按压换帧 0000↔0001+标签；退场 fade("menu")（:1935440） | TempleScene.ts:187-192 裸 image+裸切 | ⚠️偏差 | S | 并入 Top1/Top3 |
| 16 | 「显示关卡数」钮 | Button（按压 label 0.95） | TempleScene.ts:203-211 裸文本 | ⚠️偏差（微） | S | 并入 Top3 |
| 17 | TempleSelector 神庙轮盘（pan 物理 strip） | 行 26xxx-45xxx（Menu 单机多神庙形态） | 无（森林单神庙树视图） | ➖不适用（缺神庙族，挂账在案） | — | — |

### 四、按钮动效族

| # | 项 | oracle 证据 | 我方现状 | 裁定 | 成本 | 建议 |
|---|---|---|---|---|---|---|
| 18 | StoneButton 反馈语义 | **按压**换帧 0000↔0001（:1848121）+label.scale 0.95（:1088674）；无 hover 事件 | overlays.ts:56-58 **hover** 换帧、无按压反馈 | ⚠️偏差（语义错位） | S | **Top3**：pointerdown/up 换帧+label 缩放 |
| 19 | 主界面 Play 金钮 | GoldButton 按压 label 0.95+pusher 音 | MenuScene.ts:76-82 裸 zone 无反馈 | ❌缺失 | S | Top3 |
| 20 | 设置齿轮 | 按压换帧（multi ["SettingsButton0000","0001"]） | MenuScene.ts:109-110 hover 换帧 0002/0003 | ⚠️偏差（同 #18） | S | Top3 |
| 21 | 「?」credits 钮 | GoldButton 同 #19 | MenuScene.ts:111-116 裸文本 | ❌缺失 | S | Top3 |
| 22 | MuteButton | 右上角静音钮，点击换帧 0000↔0001（:1099952） | 无此件（settings 走齿轮面板） | ❌缺失（件） | S | 低观感收益，随 UI 校准轮 |
| 23 | 全按钮 pusher 点击音 | Button 基类 settings.fx 门控统一播 | 无按钮点击音 | ❌缺失（音效族） | S | Top3 |

### 五、MenuScene 主界面 idle

| # | 项 | oracle 证据 | 我方现状 | 裁定 | 成本 | 建议 |
|---|---|---|---|---|---|---|
| 24 | 光柱 ×8 动态 | 相位速度 0-0.108 rad/s（周期≥58s）+y 摆幅 \|sin\|·H/4+宽 0.6-1.0 脉冲+alpha 0.6-1.0 rand（§1.3） | 仅 rotation=0.2·sin(0.8/s+i·0.9)——快 7-25×；无 y 摆/宽脉冲；alpha=(i%3) 伪随机（MenuScene.ts:45-53、132-138） | ⚠️偏差 | M | **Top5**：按 §1.3 参数重写 update |
| 25 | Navy 蜡烛 ×4 | 双频 lissajous 漂移（r 至 ±400px、θ 进动、scale 0.3-1.0 rand） | y ±14px yoyo tween 1.5-2.6s（MenuScene.ts:84-101） | ⚠️偏差 | M | Top5 |
| 26 | 角色立绘 idle | head idle 0-29@30fps+腿静帧+glow y+40（TempleHall.createChar，行 26224 起）；glow alpha=1 | head.play idle ✅（MenuScene.ts:62-73、BootScene.ts:107）；glow setAlpha(0.85)（MenuScene.ts:65） | ⚠️偏差（微） | S | 去掉 0.85 |
| 27 | 标题 GameName / Kizi / 版本横幅 | 静态（无 tween）；版本横幅画布内 0 命中（index.html 亦无） | 静态；无版本横幅 | ✅一致 | — | — |

### 六、结算面内时序

| # | 项 | oracle 证据 | 我方现状 | 裁定 | 成本 | 建议 |
|---|---|---|---|---|---|---|
| 28 | 700ms 节拍链 | f=700（:1876767）四级嵌套，**隐藏行 delay 0 立即串联** ⇒ general 700/1400/2100/2800；puzzle\|dark 700/~1400/~1400/2100 | overlays.ts:129 固定 700+i·700、隐藏行不排程 ⇒ twoRows 第三行 2100、星碑 2800（晚 700ms） | ⚠️偏差（仅 twoRows 类型） | S | **Top4** |
| 29 | 星碑动画 | `play("to_"+stars)` 分段 1-7/8-14/15-21 @30fps once（:1877727） | overlays.ts:164-172 播累计 1..7N；BootScene.ts:152-154 分段键成死代码 | ⚠️偏差 | S | Top4：改播分段 |
| 30 | popupArrow | 0000 静置→末拍单帧 0001 **恒亮**（:1876067/:1877712；全 bundle 仅此两处、无动画注册=非闪烁） | overlays.ts:152-163 2fps 无限闪烁 | ⚠️偏差 | S | Top4：改末拍 setFrame |
| 31 | Continue 启用时机 | 与星碑播放在**同一回调**（行 44348-44349） | overlays.ts:186-188 星碑拍后 **+300ms** | ⚠️偏差（微） | S | Top4 |
| 32 | 时限文本 alpha | 0.7（:1874743） | overlays.ts:139-141 全不透明 | ⚠️偏差（微） | S | Top4 |
| 33 | 勾叉达成+音效节拍 | endPass×3（:1876955/:1877120/:1877335）+endDiamond（行 44345） | overlays.ts:129-133/173-176 sfx_end_pass×3+sfx_end_diamond | ✅已复刻 | — | — |

### 七、CompleteScene 彩带（firstComplete）

| # | 项 | oracle 证据 | 我方现状 | 裁定 | 成本 | 建议 |
|---|---|---|---|---|---|---|
| 34 | 触发语义 | progress.firstComplete→**bare** start("gameComplete")（Menu :1939549/:1939658；LevelMenu :1932358/:1932467） | TempleScene.ts:196-201 全 3 星+localStorage 门→launch("CompleteScene") | ⚠️偏差（触发域，非动画参数；记录性） | — | 见注 |
| 35 | 彩带本体 | 60ms 持续发射流/粒寿 2500ms/Y 速 100-200px/s/X±5/旋转 20-50°/scale 0.5-1/带宽 realWidth（:1927673-1927928） | menus.ts:102-119 两波×60 颗 tween 1.4-2.6s 落底（≈385-715px/s）+±2rad | ⚠️偏差 | M | Top6：改发射器 |
| 36 | 关闭时序 | hide()→1000ms→onClose→emitter 停+5200ms 收尾（行 45689-45700） | menus.ts:122 即 scene.stop() | ❌缺失 | S | 并入 Top6 |

### 八、GameScene 内演出族（边界：与关卡内容/内核域交界，略列）

| # | 项 | oracle 证据 | 我方现状 | 裁定 | 成本 | 建议 |
|---|---|---|---|---|---|---|
| 37 | HUD 显隐 | root.alpha 0→单帧 1+ui.show()（:1896262）——黑幕下不可辨，无独立淡入 | GameScene.ts:1261-1290 即建即显 | ✅等价（双侧皆"即时"） | — | — |
| 38 | 计时器/数字滚动 | Clock 整秒换字、**无 tween**（Clock.update）；LevelUI 仅 PauseButton+Clock、无钻石计数 HUD | GameScene.ts:1306-1313 整秒换字（r3 防重绘）；无计数 HUD | ✅已复刻（任务第 9 项：双侧皆无数字滚动） | — | — |
| 39 | 开局序列 | 1600ms camFreeze 解冻（:1898770/:1899006）→+400ms clock.start+解物理 | 内核/fixture 域（02/06/12 号档已锁，shared params/DOOR.finishDelayMs=1600） | ➖边界（不属 UI 档） | — | — |
| 40 | 进门 finish 演出 | stairs 25fps once+组 0.8/360ms 缩放（12 号档 §1.1）+1600ms→面板 | GameScene.ts:1425-1438 stairs+scale 0.76/360ms+finishDelay 1600ms | ✅已复刻 | — | — |
| 41 | LoaderBar 加载条 | Load 态 crop 进度条+标题（:2164711） | BootScene 无进度 UI（黑屏） | ❌缺失（仅冷载可见） | S | 低优先 |

## 3. 需实机核验 / 存疑

- **#24/#25 动态参数观感**：常量已全部字证（§1.3），但我方静态摆位经 2026-10-06 实机显示树校准、动态相位未做过运行时比对；若按 Top5 重写，建议先用虚拟钟 oracle 目测一遍光柱/蜡烛节奏再落地。字证本身无存疑。
- **MenuScene.ts:3-4 头注自相矛盾**（「光柱悬于屏幕外不可见——不绘制」vs 代码 :34-53 实际绘制）：文档性矛盾，非行为存疑；当前行为（origin(0.5,−0.5) 从顶部垂入）与 oracle anchor 语义一致，建议顺手勘误头注。
- **#34 触发语义**：oracle=通关后回 Menu/LevelMenu 时置位触发；我方=进 Temple 全 3 星+localStorage 门。动画参数无差，触发路径差异是否要改**待用户裁决**（联机形态下 firstComplete 语义本就需重定义）。
- 弹簧/阻尼/时长类参数全部为 bundle 直接常量，**无推测成分**；本档无任何「拿不准就写」项。

## 4. Top 建议（按观感收益/成本排序）

1. **【M】换屏黑幕 state.fade**（#1/#4/#5）：500ms 入+500ms 出+"Loading"点循环。每次换屏必见，与 oracle 观感差最大的一件；联机 advance 路径（#4）需与 connect-ui 语义协同、可后置。
2. **【S】面板弹簧滑入+动态黑幕+关闭滑出**（#7/#8/#10）：buildBoard 单点改造，六面同享；弹簧三常量直接抄 bundle。
3. **【S】按钮按压反馈包**（#14/#18/#19/#20/#21/#23）：StoneButton/齿轮 hover→按压语义、label.scale 0.95、菱形节点 0.95/100ms、Play/?/Continue 补按压、统一 pusher 点击音。
4. **【S】结算面板五微件**（#28/#29/#30/#31/#32）：popupArrow 改单拍恒亮、星碑改分段 to_N、twoRows 节拍链跳隐藏行、Continue 同拍启用、时限文本 alpha 0.7。
5. **【M】主界面 idle 校准**（#24/#25/#26）：光柱慢速+y 摆+宽脉冲、Navy lissajous、glow alpha 归 1。
6. **【S】彩带持续发射器+关闭时序**（#35/#36）：低频场景（48 关全 3 星一次），收益最小故殿后。

## 5. 边界声明

- 联机连接面板（DOM）动画归 connect-ui 槽域，本档未盘点。
- 关卡内机关/角色动画（12 号档）、开局序列内核时序（02/06 号档）不重复。
- 本档零代码改动；Top 建议均为**待立项**，落地须另开生产槽并过既有门禁（tsc/vitest/build/e2e）。

## §实施记录（uitrans-fix 槽，2026-10-20）

用户令修复。实施前逐点复核 bundle 原文（bytes 抽取脚本 TEMP/uitrans-fix/bytes.mjs，md5 d637cb8c… 与本档一致），§1/§2 全部常量与本档记录相符；等待 38 号档完工信号（5de0524，约 55 分钟）后分五批落地，版本 0.3.36→0.3.37。

### 修复清单（commit · 复验）

| 批 | 项 | commit | 要点与复验 |
|---|---|---|---|
| B | #7/#8/#10/#36 | ef68c96 | buildBoard 去 Back.easeOut → 逐帧弹簧（force 2.3/friction 0.7/起点 1.5H/dt 钳 0.04），黑幕 alpha=0.7·(1−Δy/全程) 每帧跟随，show/hide 翻 target（:1850938/:1851068 补证：show 置 visible=true、update 有 visible 门）；六面同享；PauseMenu 增 requestClose（滑出+1.5s 兜底强停）；Settings/Credits OK 滑出后停、Complete 依 oracle hide→1000ms→stop |
| D | #28/#29/#30/#31/#32 | 283d976 | 拍链按 oracle 四级 delay 实参精确配对（j/j/g/m·visible&&f）⇒ general 700/1400/2100/2800、twoRows 700/1400/1400/2100；隐藏行不建图但音照拍（:1877004 拍回调不看可见性——修正本档 §2#33 未察的 twoRows 少一拍音偏差）；星碑播分段键（BootScene 补 puzzle/speed/dark 前缀三段，激活死代码）；popupArrow 删 2fps 闪烁改末拍 0001 恒亮；Continue 与星碑同拍启用（删+300ms）；时限文本 alpha 0.7 |
| C | #14/#15/#16/#18/#19/#20/#21/#23 | 6e395b0 | StoneButton hover 换帧纠正为按压语义（down 0001+label 0.95 / up 复位+pusher 音，窗外松开只复位=oracle mouseup 无条件 setUp），disabled 访问器（禁用不换帧不回调，Continue 启用门迁入）；Menu Play/?/齿轮同族（齿轮保留 0002/0003=非 multi 分支，:1940071 复核）；菱形节点 scale·0.95/100ms 回尺；BackButton 帧换+label 缩放；显示关卡数 label 0.95；统一 fx 门控 pusher（sfx_pusher 在 AUDIO_GAME，Menu 暖装后可用，极早点击缺键仅 console 警告——不造音）。DOM 连接界面 CSS hover 未动 |
| E | #24/#25/#26+头注 | fe3353c | **字节真相超出本档记录**：oracle 光柱 8 根全部 make.sprite(0,0)（组=root 中心=屏心 640，无任何 x 赋值，:1094049/:1097428 区穷举 .x 赋值仅 char1/char2）——旧「柱间均布 x=80..1200」2026-10-06 静态校准无 bundle 支持，已按字节真相重写为屏心堆叠扇（rotation=0.2·sin(t_offset+t·t_speed)、y=−480−528.75−\|sin\|·240、宽 0.6-1.0 脉冲、alpha=0.6+0.4rand、t+=0.003 帧驱动）；蜡烛 ×4 组挂屏心双频 lissajous（旧 yoyo tween/按钮组相对位同废）；glow alpha 0.85→1；头注自相矛盾勘误 |
| A | #1/#4/#5/#15 退场半 | 057cf4c | transition.ts 新增（FadeScene 顶景：500ms Linear 入/出+Loading 字 800ms 后现+300ms 点循环+fading 门丢弃重入+黑幕吞输入加固）；接线六点：Menu Play→Temple、Temple back→Menu、enterGame→Game、leaveToMenu→Temple、reloadLevel(advance 回声双侧同达)→Game、__fwRestart→Game（GameOver/Pause 再试共Path）；EndMenu/GameOver/Pause 面板钮去即时 stop 由黑幕 ops 统一停；Continue leaving 门防黑幕窗双击；解除暂停走 requestClose 弹出 |

**有意保持（oracle 同构，非遗漏）**：EndMenu/GameOverMenu 出现=裸切（#3 裁定）、Boot→Menu 首入链（#2）、PauseMenu 进出（#6）、CompleteScene launch（#34 待裁决不动）、R 键裸 restart（键盘路径非 UI 面）、onPhase ready 回声停面板（无黑幕，联机形态特有路径）。

### 遗留表（2026-10-20 flashp1 槽销账更新，版本 0.3.39）

| # | 项 | 处置 |
|---|---|---|
| #13 | NewSign 静态贴片 | ✅已修（985914a）：TempleScene 节点贴 NewSign0000（state>0&&!initial&&!played，位置 +40/−20 布局尺锚 0.5 无 tween=「弹跳」假设证伪后静态贴片本义）；progress.ts 增 played 集（fw-played-v1）+进关 markPlayed（oracle setPlayed :1935016 同语义）。证据链见 §实施记录(flashp1) |
| #22 | MuteButton | ❌**划销（复核证伪）**：oracle 死代码——全 bundle 0 实例化（UIState/LevelUI 两处 import 均被 IIFE 形参遮蔽，this.muteButton 3 处纯读零赋值），oracle 实际从不渲染静音钮（右上=PauseButton+Clock）；补可见件=背离 oracle（字节真相优先，0.3.37 E 批先例）。完整证据链见 §实施记录(flashp1) |
| #35 | 彩带持续发射器 | ⏸保留：M 成本涉性能面（发射器 vs tween 波），单独立项（本批范围外，挂账原样） |
| #34 | CompleteScene 触发语义 | ✅已修（P-02 批，0.3.40）：firstComplete 字节链对齐——置位前移至通关时刻、消费=Menu+Temple 双入口读即清、双旗与 played 分域；星门按字节证据保留（见 §实施记录(p02)） |
| #41 | LoaderBar | ✅已修（2ae3a9b）：BootScene 首位装 PreloaderAssets（oracle Boot 预装 :2160057 区）+buildLoaderBar 逐参复刻 :2164711（Bar crop 200×20/Holder anchor.5/Title (0,−80) anchor.47 双轴，进度=load.progress≡onFileComplete a/100 同源，COMPLETE 销毁；h5api.progress 平台件不移植） |
| #17 | TempleSelector 神庙轮盘 | ❌**划销（不适用）**：仅 MultiHall/MultiMenu（multi 形态）实例化（:1956494/:1961502），单机形态 Menu.startTemple 直 fade("levelMenu")（:1941847）无轮盘；我方=forest 单神庙树（LevelMenu 同构形态）本就该无此件。#13 之 TempleSelector 贴片（:1947823）随本件注记 multi 形态专属 |
| #9 | 板缩放自适应 | ✅已修（c16e77e）：buildBoard 按 fixToCamera :1851667 公式 s=min(1,min(W/板帧宽,H/板帧高)) 纹理帧动态读+容器 setScale；1280×960 下 s=1 与旧固定值 99/159/1119 逐位恒等（「自适应公式落地+零视觉差实测」口径），行程恒等式 outY−Y=H 与 s 无关黑幕比例式不变形 |
| — | R 键 restart 无黑幕 | ✅已修（9d1fdb5+92eb6de）：restartWithFade 提为模块级信封，__fwRestart 与 KeyR 同走（键盘/鼠标路径归一）；oracle 键盘仅绑 P 无 R（:1896097 区），R 属我方 E1 速度跑扩展、oracle retry 本走 fade :1909660 |

### 门禁数字（版本 0.3.37）

- tsc：0 error ｜ build：3.80s ✓ ｜ vitest：95/95（6 文件）
- e2e route f01 repeat1：PASS，winAt=39471ms（基线带 39472-39477ms，**零位移**——黑幕 500ms 不触及服务端锚定的时间线）
- e2e route f12 repeat1：PASS，winAt=13461ms
- det/fixtures：**零物理交集**（改动面=客户端 UI 场景七件：overlays/menus/MenuScene/TempleScene/BootScene 仅动画注册/main.ts 接线/transition 新增；packages/shared 内核与关卡数据零触碰）
- visual-diff：92.80（容差48）/87.80（容差24）——历史带 90.0-92.8 内同带（39 号档已谳量具含 DOM 污染口径）；Menu 光柱布局变更不在捕获流内（捕获不含 temple/菜单面），分数漂移属噪声
- 语义验证注记：e2e 等待逻辑全锚服务端权威相位（__fwPhaseT/room.state），GameScene.create 延后 ~500ms 不触及任何等待；winAt 无常数级位移（实测如上）

### 存疑待核

- E 批光柱屏心堆叠扇为**视觉布局变更**（字节直证优先于旧静态校准）：与 oracle 实际渲染观感的最终一致性建议后续有机会时实机并排目验一次（本槽文字模型禁像素判读）。
- Loading 文字在无广告环境下 oracle 亦仅理论可见（rAF 窗口 <300ms）；机制完整移植，若需「可见 Loading」需另议是否人为等待（非 oracle 行为，未做）。

## §实施记录（flashp1 槽，2026-10-20，版本 0.3.39——遗留表八项收尾批）

阶段一只读复核（bytes 抽取脚本 TEMP/flashp1/bytes.mjs，bundle md5 d637cb8c… 与本档一致）逐件复核 §1/§2 字证后动码；动码前等待双门同开（40 号档取证收卷 a31915f + 39 号档重定带 ≥2 commit，15:27 同满足）。**两件复核证伪划销（用户批复照准）**，四件落地，逐件 commit。

### 划销证据链（格式沿 38 号档 F1 伪差定谳先例）

**#22 MuteButton = oracle 死代码，从不渲染**：
1. `grep -ob 'MuteButton'` 全 bundle 恰 6 处——模块 define（:1099272）+帧串（:1099584/:1099952/:1099997，均在模块体内）+两处 import 路径串（UIState :1100490、LevelUI :1870321）；
2. UIState（:1100440 窗口原文）：`define(…,["../Common/MuteButton","Phaser"],function(c){…(function(c){…})(Phaser.State))`——import `c` 被 IIFE 形参遮蔽，类 extends Phaser.State；layoutContent 引 `this.muteButton` 但 `grep -ob 'muteButton'` 全 bundle 恰 3 处（:1102886/:1102911/:1102958）全为 null 守卫读、**无任何赋值点**；
3. LevelUI（:1870260 窗口原文）：4 依赖 3 形参（e=MuteButton，Phaser 未绑），IIFE `(function(e){…})(Phaser.Group)` 遮蔽，构造器仅 pauseButton+clock；
4. 结论：0 实例化 ⇒ oracle 界面无静音钮。组件语义已存档（点击翻 sound.mute+updateState 换帧 0000/0001+sprite.anchor(1,0)，:1099952 窗口）备后续用户裁决，本批不补件。

**#17 TempleSelector = multi 形态专属，我方形态本就该无**：define :1945002；引用全 5 处、实例化仅 MultiHall（:1956494 define 其 import j）/MultiMenu（:1961502）两态（gameConfig.type==="multi" 多神庙形态）；单机形态 Menu.startTemple（:1941847 窗口原文）直 `state.fade("levelMenu",!0,!1,a)`。我方复刻单神庙形态（Menu→TempleScene 树），oracle 单机形态同无此件 ⇒ 不适用划销；#13 之第二贴片（:1947823，scale 0.7/+60/−60 挂 icon）随本件注记。

### 落地四件（commit · 要点）

| 件 | commit | 要点 |
|---|---|---|
| #13 | 985914a | progress.ts `fw-played-v1`（loadPlayed/markPlayed，v1 结构不动）+TempleScene 节点循环贴片（紧跟 btn 后 add=内容组层序）+main enterGame/reloadLevel 进关即 markPlayed（oracle 单机=点击直进，我方联机=真进关时点，弹面板间隔不计，档注记）；isNew 门 `!initial&&!played`（state>0 由锁定分支 continue 隐含） |
| #41 | 2ae3a9b | BootScene buildLoaderBar：`filecomplete-atlas-preloader` 建组（单场景镜像 oracle Boot→Load 两段；此刻以 load.progress 补初值）+progress 事件 crop+COMPLETE 销毁 bar（holder/title 随场景回收，档注明） |
| #9 | c16e77e | buildBoard 自适应几何（W/H=scale.width/height、s 纹理帧动态读、boardX/Y/outY/shade 全推导）；现视口逐位恒等故 det/visual-diff/e2e 无涉；CX/CY/HALF_W 板局部系不动，六面板零改动 |
| R 键 | 9d1fdb5+92eb6de | restartWithFade 模块级（守卫后 const 中转修 TS18047：模块级 let 窄化不跨回调）；__fwRestart 指向共用函数（全局 API 不变）；KeyR 改走同信封。e2e 不用 R（grep 证） |

### 门禁数字（版本 0.3.39，主干工作树实测）

- tsc：0 error（92eb6de 后复验）｜ build：3.98s ✓ ｜ vitest：**106/106**（7 文件——基线 95→106 系并行 B-infra 槽 2e74e54 vitest 3.1.4→5.0.5 升级所增，非本批）
- e2e route f01 repeat1：PASS winAt=**39468ms**（0.3.38 带 39466-39477 内）；f12 repeat1：PASS winAt=**13075ms**。附注：f12 首跑 FAIL 系末段 KeyD 抬起 CDP 抖动（多槽并跑放大；停点 x=1177 vs 成功 1147），同树复跑即过、干净 worktree 复证 f01=39842/f12=13151 双 PASS——非代码回归
- det/fixtures：**零物理交集**（改动面=progress.ts 持久化+TempleScene 贴片+BootScene 加载条+overlays 板几何+main.ts 键盘信封；packages/shared 内核、packages/server、GameScene 物理零触碰）
- visual-diff：**92.11**（容差48）/86.73（容差24），最优平移 **(0,0)**——0.3.38 带 92.01-92.84 ±1.5-2 跑间噪声内同带；板缩放 s=1 恒等在 captures 无位移实证，NewSign/LoaderBar 不在捕获流（GameScene forest_01 idle 域外）

### 并行槽冲突两起（处置入档）

- 985914a 前身 d94093c 误将他槽 main.ts WIP 整文件带入 commit——reset 后基线重放法拆分重做（git show HEAD 基线+Edit 重放+选择性暂存），他槽 WIP 全数退还工作树，其后由其槽自行收编（24b5fb5）。
- 92eb6de 前身 fe37321 误以 `git update-index --cacheinfo` 相对路径在仓库根新建错误路径文件——reset 未入史，改 hash-object+全路径重提；教训：update-index 路径按仓库根解析，不随 cwd。

### 存疑待核

- NewSign 徽标消失时点=下次 TempleScene 重建（create 重读 played）；oracle 同为回 LevelMenu 重建消隐。联机形态「进关」时点取 enterGame/reloadLevel（advance 回声同达），与 oracle 点击直进的形态差已在代码注记。
- f12 winAt 带较 0.3.38（13429-13485）整体左移 ~300ms（本批 13075/13151），f01 在带内——同机多槽负载下逐帧调度的跑间漂移，两树四跑全 PASS 佐证非系统性；后续批次如需严带建议静窗复测。

## §实施记录（p02 槽，2026-10-20，#34 CompleteScene 触发语义·P-02）

用户批（16 号档 P-02：对齐 oracle firstComplete）。实施前逐字节复核 oracle bundle（output/A/js/init.eb02fbdab2aa1d24.js，md5 d637cb8c…，bytes 抽取脚本 TEMP/p02/bytes.mjs，收尾清理）。

### oracle 字证（全部字节级，无推测）

- **置位**：`ProgressModel.process()`（:2149483-:2149538）：遍历 temples×levels，`b`=每关 `best.stars≥3`；`b && !this.get("gameComplete") && (this.firstComplete = !0), this.set("gameComplete", b)`（set 无条件落 b）。调用面一：`update()`（EndMenu.create success 分支 :1881953 → :2152850 区）**仅 best 刷新**（`stars>0 && (null==best || betterThan)` :2152850）才 merge+process——即**通关时刻置位**；调用面二：`setPlayed`（:2153050，进关时；因 b=true 与 gameComplete=true 同瞬成立，此面对 firstComplete 无可达增量，见下）。
- **消费**：`Menu.afterAddContent`（:1939446 定义，:1939549 检查）与 `LevelMenu.afterAddContent`（:1932272 定义，:1932358 检查）首行：`firstComplete && ((firstComplete=!1), state.add("gameComplete", g), state.start("gameComplete", !1, !1, {success:!0}))`——**bare start**（无 fade；g=`States/Complete/Complete` 两模块各自 import）。
- **⚠️ 字节真相修正提案卡前提**：`firstComplete` ≠「首次通关某关」，而是**全 48 关 3 星 100% 的首次达成**（`e.best==null || e.best.stars<3 → b=false` :2149490 区）。故**星门保留在置位侧**（提案卡「选项 B 移除三星门」的设想被字节证据否定——移除即背离 oracle）；「首通即庆」的 B 选项语义修正为「全 3 星首通一次性」。setPlayed 调用面对 firstComplete 无可达增量：b 首次为 true 的同一句 process 即落 gameComplete=true，此后 `!get("gameComplete")` 恒假——我方只在 best 刷新路径调 processWinResult 即覆盖全部可达态。
- **呈现字节链**：Phaser2 core `clearCurrentState`（:357600-:357860）：`tweens.removeAll/camera.reset/input.reset/time.removeAll` 后 **`this._clearWorld && (world.shutdown(), …)`**——bare start 带 `clearWorld=!1` ⇒ 旧态显示表**不销毁**，庆典浮于选关画面之上、其下画面静止；菜单关闭 doKill（:1928175 区 menu.destroy→emitter 停→5200ms 空 shutdown）后即原画面。
- **played 与 firstComplete 两旗独立**（ played=:1935016/:2153050 每关布尔 vs firstComplete=:2149507 全局瞬态）。

### 落地（packages/client 四文件+单测）

- **progress.ts**：`fw-gamecomplete-v1`（gameComplete 持久旗）+ 模块级 `firstComplete` 瞬态（进程内变量，不落盘=oracle 同构）；`processWinResult(allThreeStar)` 逐句对应置位段；`takeFirstComplete()` 读即清；`saveBest` 改返回 bool（=update betterThan 门）；旧键 `fw-complete-shown`（0.3.38 临时门）读时迁移为 gameComplete=1 后删除（防升级重播）。与 `fw-played-v1` 分键分域。
- **main.ts** won 分支（=oracle EndMenu.create→update 时点）：`saveBest(...)` 返回 true（best 刷新）才 `processWinResult(templeLevels.every(starsOf===3))`。
- **TempleScene.ts**（≡oracle LevelMenu）与 **MenuScene.ts**（≡oracle Menu）create 尾部消费点：`takeFirstComplete() && scene.launch("CompleteScene")`——先到先得。
- **呈现=launch 并行景**（维持 0.3.37 A 批口径，本批复核维持）：oracle bare start clearWorld=!1 显示表保留 ⇒ 庆典为浮层；Phaser 3 `scene.start` 会清 Temple 显示表（庆典关闭后黑屏）⇔ oracle 相悖，launch 即其可观察等价物。无黑幕包络（oracle 裸切无 fade，FadeScene 零涉）。微差记档：launch 下 Temple 存活（其无 idle 动画，视觉无差）；Menu 消费时光柱 idle 继续动（oracle bare start 后冻结）——浮层黑幕之下不可辨，接受。
- **联机形态等价性**（派发批准记档）：progress 存各端 localStorage——任一端达成全 3 星且 best 刷新即各自置位、回庙各自庆祝恰好一次；对方端进度独立不受感染（P1 实证：B 干净端仅写入自带 1 条）。
- **progress.test.ts**（+7）：置位段/读即清/b=false 无条件落 0/gameComplete 已置不重播/旧键迁移/saveBest betterThan 门/两旗分域。

### 门禁（全部实跑）

| 项 | 结果 |
|---|---|
| tsc / build | PASS / 3.87s |
| vitest | **126/126**（119+本批 7；119 口径含并行槽 m03 房间集成 13 例） |
| det 48/48 | `--compare r0-baseline` **位级一致**（纯客户端 UI/进度面，内核零触碰） |
| e2e route repeat1（--offset -15） | f01 PASS winAt=39468ms（0.3.38 带 39466-39477 内）；f12 PASS×2 winAt=13419ms（较 0.3.39 13075/13151 确定性右移 ~268ms——本批 diff 不触 pre-win 路径（det 位级一致+服务端零触碰佐证），判环境漂移，与上批 f12 左移同性质） |
| journey 全套 | journey 7/7 + pause 9/9 + rejoin 3/3 + deathretry 4/4 + rolesplit 6/6 ALL PASS（回面板预选/rejoin/advance 流程零 CompleteScene 干扰——庆典仅在 100% 出现，自动化不触达） |
| touch | 6/6 PASS |
| visual-diff（新口径） | **92.54**（容差48）/87.46（容差24），带 90.55-92.86 内 |
| ID 契约探针 | **14/14 PASS**（TEMP/p02/probe.mjs 按 connect-ui §T1-T12+C-client-dom 附加 2 项重建） |

### 语义实证（TEMP/p02/semcheck.mjs，11/11 PASS，截图六张收容 note/evidence/p02-complete/）

- **Part1 真实路线回放胜（dist，负对照+分域）**：A 端预置 47 关 3 星 + 真实胜 forest_01（2 星 41s）→ won@EndMenu 不播、回庙 A/B 均不播（星门未达，b=false）；progress 写入 {stars:2,time:41}、gameComplete="0"（无条件落 0 字节形）、played 集含胜出关；B 干净端 progress 仅自带 1 条（per-client 独立）。截图 p1-endmenu-a/p1-temple-a/p1-temple-b。
- **Part2 正链全流程（vite dev 页面内 `import("/src/progress.ts")`=应用同模块实例，sameRef=true 实证）**：`processWinResult(true)`（=oracle process() b=true 置位瞬间的进度态模拟——现有 48 关路线均为抢门线不收钻，真实 3 星胜在路线库不可达，星门字节语义下正链必须模拟此一步；**其余全真实**：真实模块/真实场景接线/真实画布点击）→ 回庙庆典播放（p2-temple-celebrate）→ 真实点「好的」关闭（hide→1000ms→stop）→ 同会话 Menu/Temple 再入不重播（p2-reenter-temple）→ 刷新后 Menu/Temple 均不重播+gameComplete 持久（p2-reload-temple）。
- 时序对齐结论：置位在通关时刻（won 即写，不待回菜单）、播放延迟到下一次菜单入口——与 oracle「EndMenu.create 置位、LevelMenu/Menu.afterAddContent 消费」两时刻一一对应。

### 收尾

- 16 号档 P-02 状态改已实施；版本 0.3.40 由协调方统一发（本槽禁 bump/禁动 README/release）。TEMP/p02 清理。
