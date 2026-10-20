# 15 号档 · 镜头行为与场景环境 VFX 审计（camfx-audit 槽）

日期：2026-10-20 ｜ 槽位：camfx-audit ｜ 性质：只读考古+档卷（零代码改动）。
口径：oracle 字节字证（`output/A/js/init.eb02fbdab2aa1d24.js`，md5 `d637cb8c…`，下记 **bundle:偏移**；行格式化件辅以行号）+ 我方源码 file:line（`packages/client/src/` 省略前缀）。文字模型禁像素判读，一切参数取自代码常量；本档未做运行时对拍处均已注明。13 号档（UI 转场）已闭环的 state.fade/面板弹簧/按钮/结算时序/彩带不重复；MenuScene idle（TempleHall 光柱/Navies 蜡烛利萨茹）修复中，本档跳过；12 号档（角色/设备动画注册）已闭环面不重复。本档补 **镜头行为全景 + 关卡/结算场景环境演出族**。

## 0. 结论速览

- **oracle 镜头=自建 `States/Level/CameraManager`**（define @bundle:1838271，还原件 TEMP 转储 mod 级通读），不是 Phaser 相机：`game.camera`（Phaser 2 Camera）全 bundle **0 处游戏侧调用**（shake/zoom/pan/fade/flash/follow/focusOn 全 0 命中，仅引擎内部 `camera.view/x/y/_shake` 引用）；游戏侧唯一相机写入=debug 模式置 0（Q 键，:1844678）。真身=对 `level.root` 容器做**双角色适配缩放 + 弹簧跟随 + 滚轮/捏合缩放 + 边界钳制**，我方 0.3.29-F4 已按此移植（GameScene.ts:995-1170）。**参数面 14 项逐项对齐（§2 表 ✅），行为面 7 项偏差（§2 表 ⚠️）**。
- **镜头行为偏差 7 项**（无一破坏性，最大者=触屏 pan 位移除数与 16px 边界域差）：①focusOn 目标 `Math.round` 取整 vs 我方浮点（≤0.5px）；②pan 位移除数 oracle=`game.camera.scale`（stage scale，推定 1）vs 我方=zoom（放大时手感不同）；③捏合期间平移补偿（pinchCenter/delta 项）缺失；④wheel 监听面 oracle=$(window) 全页+preventDefault vs 我方 canvas 内；⑤移动端判定 bowser.mobile vs Phaser device.os.desktop；⑥cursors.active 闸（已在代码注释挂账，触屏域）；⑦checkBounds 域差：oracle 钳**关卡矩形**、我方钳**关卡+PAD 世界矩形**（16px 边距带——38 号档 levelvis 发现的 settled scroll(−16,+16) 系统差即此机理，commit cf5781b）。
- **场景 ambient VFX**：森林关卡的环境演出族 oracle 全景=静态背景砖纹/静态 decor 植物烘焙/**Navies 漂移**/液体 30fps 三段贴片/风 base+effect/钻石正弦浮动/平台灯罩——**我方已全部复刻且参数逐项同**（§3 表 ✅ 11 项）。**实质缺口 4 项**：风机关 400ms 延迟停帧缺失、wind_effect 相位连续性缺失、平台灯组色 tint 缺失、暂停全画面静帧缺失（oracle `game.paused` 语义=动画全停，我方 PauseMenu 打开时 ambient 继续动）；另有弱机条件件（低 FPS 3s 降级拆 navies+dust）我方无。**休眠件 3 族**（尘埃光束遮罩/dark 黑暗遮罩/雪面）oracle 代码在、森林 0 用例→双侧可见行为等价，记录性不入修。
- 计数：**缺失 8（可见 5+休眠 3）｜偏差 7｜一致 16｜不适用/交叉 6**（§2/§3 总表）。Top3 建议（均 S）见 §5。

## 1. oracle 机制全景（证据基座）

### 1.1 相机双引擎辨析（先定铁案）

| 引擎件 | bundle 字证 | 结论 |
|---|---|---|
| Phaser 2 Camera（`game.camera`） | `game.camera` 93 处全在引擎内部（view/x/y/preUpdate/fixedToCamera 补偿/culling）；`camera.follow/shake/zoom/pan/flash/fade/focusOn` 游戏侧 **0 命中** | 引擎相机只做渲染视口，从不移动（唯一写入=debug 置 0，:1844678） |
| 自建 CameraManager | define("States/Level/CameraManager") @1838271；`updateCamera/animate/focusOn/checkBounds` 四件套（:1842683/:1843516/:1843683/:1844746 行区） | **真相机**：操作 `level.root` 的 x/y/scale，HUD 不随动 |
| camGraphics | 创建 :1838765 + fixedToCamera :1838822 + destroy :1847371，**无任何 draw 调用** | 死句柄，无视觉输出，我方无对应=无差异 |
| GameConfig.zooming | bundle 头部内联配置 :1219-1240：`lockAtMinScale:true / minScaleRatio:0.9 / lockScaleRatio:0.97` | 我方 GameScene.ts:199 已按此硬编码 |
| gameConfig.id | 外部 game.json：`{"id":"forest",...}` | 相机 40×30 格钳的 `"elements"===id` 分支恒假 ⇒ 桌面恒 40×30（:1844236 区），我方 TILES_DESKTOP={40,30} 正确 |
| PTM | `setPTMRatio(32)` :1894916 | 格钳公式 mpx=32，我方同 |

### 1.2 CameraManager 全参数字证（bundle 偏移 → 我方现状）

| 参数/语义 | oracle 值与偏移 | 我方现状 | 裁定 |
|---|---|---|---|
| minScale | `min(minScaleRatio·realW/levelW, minScaleRatio·realH/levelH)` :1839152-1839273 | GameScene.ts:1008 同式 | ✅ |
| lockScale | 同式 ratio=0.97 :1839363 | :1009 | ✅ |
| maxScale | **1.5** :1839453 | :205 | ✅ |
| 初始态 | root=-(levelW/2,levelH/2)·minScale + `camFreeze=true` :1839583-1839906 | resetCamera 同几何（:1164-1168） | ✅ |
| 解冻时机 | startLevel 后 **1600ms** `camFreeze=false`，再 +400ms clock.start+解物理 :1901410-1901506（:1898770/:1899006 同证） | phase="started" 解冻（:1351，内核域 02/06 档已锁） | ✅（边界项） |
| 滚轮缩放 | deltaY>0?×0.8:×1.2，乘**当前 root.scale**（动画值），钳 [min,max] :1839977-1840001；`_.debounce(…,1000)` 静置回弹 :1840050-1840107：`wheelScale≤lockScale→lockScale 否则 null` | onCamWheel :1025-1034（×cameras.main.zoom、clearTimeout/setTimeout 等价 debounce、回弹同式） | ✅ |
| 捏合缩放 | 首触记 `pinchScale=root.scale`，`userScale=clamp(hammer.scale·pinchScale)` :1840458-1840520 | onCamPointerMove :1041-1047（pointer 距离比等价 hammer scale） | ✅ |
| 捏合平移补偿 | userCenter=f(pinchOrigin,pinchCenter,userScale,delta/scale) 每 pinch 事件更新 :1840520-1840560 | **无**（捏合期间 return，中心不动） | ⚠️ #3 |
| pinchend | lockAtMinScale 回弹同 wheel :1841697-1841785 | :1062-1063 | ✅ |
| pan | hammer pan（threshold **10** :1763381 字证），`userCenter=panOrigin−delta/game.camera.scale` :1842046-1842100；panend 复位 :1842238 | :1050-1057+1065（threshold 10 :1053；除数=zoom） | ⚠️ #2/#10 |
| cursors.active 闸 | pinch/pan 均以 `!pers1.cursors.active && !pers2.cursors.active` 为前置 :1840421/:1842013 | 无（触屏键=DOM 不占画布，:1001 注释已挂账） | ⚠️ #6 |
| 逐帧驱动 | `Level.update → if(!camFreeze) updateCamera(),animate()` :1901348 区（:1842787） | :1339-1342 同序 | ✅ |
| 取景框 | `viewportPadding{top:64,left:0,bottom:0,right:0}`、`worldPadding{top:100,left:200,bottom:100,right:200}` :1838880-1838890 | :1083-1086（+400/+200 常量、vh=rh−64） | ✅ |
| 自动缩放 | c=min(\|Δx\|+400,levelW)、d=min(\|Δy\|+200,levelH)；i=vw/c、j=vh/d（仅超界）、h=min(i,j) else 1 :1842962-1843120 | :1083-1089 同式 | ✅ |
| 放大钳 | 小屏（id==="elements"∥mobile∥w≤780∥h≤480）{20,15} 否则 {40,30}；`h·32·格 > 边 → h=边/(32·格)` :1843176-1843400 | :1091-1094（TILES_DESKTOP/SMALL :55-56） | ✅ |
| 焦点 | 中点·h → `target=round(−a+realW/2)`（**Math.round**）:1843694 | :1099-1100（无取整） | ⚠️ #1 |
| 边界钳 | checkBounds：关卡矩形 [0,0,W,H] 屏域钳边；关卡·scale<视口→居中；末步 `−realW/2` 回 root 域 :1844746-1844900 | :1104-1109 世界域（关卡+2PAD）等价钳 | ⚠️ #7（16px 域差） |
| 弹簧 | a=userCenter?**1/3**:**1/15**；`v=(v+Δ·a)·0.5`（阻尼 0.5）；pos+=v :1843516-1843560 | animateCam :1113-1121 逐字同 | ✅ |
| debug | Q 键切 level.debug：scale=1 居中+camera 置 0 :1844678/:290-297 | 无 | ➖（dev-only） |
| 低帧降级 | startLevel 后 3s `suggestedFps<40` → `useDust=false`+**销毁全部 navies**+销毁 dust 层 :1901662-1901680 | 无 | ⚠️ #5 |

### 1.3 HUD 与面板的固定屏语义

- oracle HUD（LevelUI/Clock/PauseButton）挂 `layers.ui` 组——`game.add.existing` 直挂 world（:1900500 区），**不在 root 内**⇒ 相机缩放 root 时 HUD 不动，即"固定屏"。我方 scrollFactor(0)+applyCam 1/zoom 反缩放补偿（:1263-1291/:1135-1151）等价。
- IngameMenu `fixToCamera`（:1851160）实为把面板组定位于 (−realW/2,−realH/2)（居中世界的左上角）——相机静止下=屏幕覆盖，与面板场景化等价；板宽自适应 `min(1,min(realW/1082,realH/642))` :1851260 区（13 号档 #9 已录）。

### 1.4 场景 ambient VFX 全景（Game/End/GameOver/Temple/Complete）

| 演出件 | oracle 机制与参数 | bundle 偏移 |
|---|---|---|
| 层栈 | root 子序：background→tutorial→underGround→**lights**→ground→overGround→chars→overChars→decorations→liquids（+root 外 ui；**dust 挂 root 最末**） | :1900377-1900737 |
| 背景 | `tileSprite(0,0,W,H,"TempleAssets","BackGround0000")` 静态平铺+cacheAsBitmap，无视差无动画 | :1799560-1799620 |
| 地面烘焙 | bmd 三滤镜一次烘死：InlineFilter(3,red)+OutlineFilter(3.5,black)+ShadowFilter(8,0)→RenderTexture；运行零成本 | :1799300-1799420 |
| decor 植物 | Ground.decorate：种子点步进（seedrandom "ASDFA" 步距 round(3r+3.5)∈[3.5,6.5]）撒 decor_O_1/2·X·A·V·T_1/2/3 贴片，旋转 floor(3r)·π/2、镜像 ±1，烘焙 decosTexture+cacheAsBitmap，**静态** | :1797205-1797300 |
| Navies 漂移 | 4 种子点对角步进至空格（game 侧 Math.random 方向），每组 `new Navies(x,y,floor(1+3r))`→**f+1 只=2..4**（Navies 构造 h=0..f 闭区间，f 缺省 3），组 scale 0.3+0.7r，子只 scale 0.3+0.7r；逐帧 `r′+=speed.r; pos.r=offset.r·sin r′; θ+=speed.θ; x=cart.x+pos.r·cosθ…`（双频利萨如） | :1901398-1901420 / Navies @1090818 |
| 液体 | WaterBox/FireBox/GreenBox（+Left/Right 端盖）帧 0-14 **@30fps loop**，左格 x=16、中格 (b+0.5)·32（仅宽>2）、右格 (w−0.5)·32、y=16，**整组 y+2**；同相位无随机延迟 | :1670540-1670690 |
| 风机关 | base `wind_base` 0-4@30fps（默认帧 0000，liquids 层）；effect `wind_effect` 0-30@30fps **建时即播+`next(floor(30r))` 随机相位、常驻不停**，origin(0.5,1)、height=mpx(length)、overChars 层、初始不可见；**on**：effect.visible+base.play；**off**：effect 即隐，base **400ms 后** `stop()+frame=0000` | :1732455-1732550 / :1733320-1733420 |
| 钻石浮动 | sprite.y=−5 → tween y:+5，**2000ms Sinusoidal.InOut yoyo loop**，起播 delay `2000·random()`（随机相位） | :1640040-1640060 |
| 平台灯罩 | 设备灯机制（Device 基类 :1620265-1622200）：lightFrame 建 `_on/_off0000` 子精灵，`updateLight(state)` 换帧+tint；**tint=组色** `groupColors={1:#ff0000,2:#00cc00,3:#0D3EFF,4:#ffff00,5:#EC0EF1,6:#57beff,7:#9933FF}`（取 properties.group 首位数字，0/缺→白）:1623002；平台 `moving_platform_light` scale.x=(宽格−1)/3 | :1679627/:1679246 |
| 尘埃层（休眠） | useDust 恒 true，但 **fillDustLayer 仅当存在 beamer**：ceil(W/10) 枚 BeamDust0000 随机撒点+rotation 180r；maskGraphics lineStyle(40) 按 beamer 光束遮罩；逐帧 `angle±0.002`（按索引奇偶）+`anchor.set(sin,cos)` 圆漂移 | :1901456-1901520 / :1909580-1909300 区 |
| 黑暗遮罩（休眠） | 仅 `levelData.type==="dark"`：darknessBmd(W+64,H+64) MULTIPLY 黑幕+chars/devices drawDarkMask 挖光+darkGradients 渐变层 | :1900900-1901300 |
| 雪面（休眠） | tile type 10/11/12 → Snow 三向（WE/SE/SW）贴片入 ground.bmd+ice fixture（onIce 机械域） | :1722269-1722741 |
| 火把/光柱 | 图集 0 火把帧（Torch/Flame/Candle 全无——四图集 grep 字证）；光柱仅 TempleHall（菜单，跳过）；beamer 光束=休眠 | — |
| End/GameOver 背板 | `state.start("endGame",!1,!1)` **clearWorld=false**：关卡 root 常驻，World.update 继续→**液体/风效/Navies 动画不停**；Level.update 停→dust/tutorial/相机停；面板黑罩=13 号档 #7/#8 | :1900760 / End @1881260 |
| 暂停 | `game.paused=!game.paused`（引擎级）：paused 分支只跑 scale/state.pauseUpdate+debug——**stage.update 不跑⇒全部动画静帧**（液面/钻石/海军/风效全停），仅面板弹簧/其 tween 经 pauseUpdate 继续 | 引擎 :416750 区 / :1902000 区 |
| Complete 彩带 | emitter(0,−realH/2,200)+Confetti0000-3+scale 0.5-1+YSpeed 100-200+XSpeed ±5+rot 20-50+start(false,2500,60,0)；doKill：off+5200ms shutdown | :1926776-1928200（13 号档 #35/#36 已录，本档仅复核无新件） |
| Temple/LevelMenu | LevelMenuButtons/Grid/Tree 全静态 0 tween（13 号档 #12 交叉）；无相机操作（游戏侧 camera 引用全在 Level 族） | :1915305-1923682 |

## 2. 总表 A——镜头行为逐项裁定（19 项）

裁定：✅已复刻一致 ｜ ⚠️偏差 ｜ ❌缺失 ｜ ➖不适用。成本 S/M/L。oracle=bundle:偏移；我方=GameScene.ts:line。

| # | 项 | oracle 证据 | 我方现状 | 裁定 | 成本 | 建议 |
|---|---|---|---|---|---|---|
| C1 | 相机引擎形态 | 自建 root 相机（§1.1），引擎相机 0 操作 | setupCameraManager 移植（:995） | ✅同构 | — | — |
| C2 | minScale/lockScale/maxScale | 0.9/0.97/1.5（:1839152/:1839363/:1839453） | :1008-1009/:205 | ✅ | — | — |
| C3 | 冻结期全图 minScale+解冻 1600ms | :1839583/:1901410 | resetCamera+:1351 | ✅ | — | — |
| C4 | 滚轮 ×0.8/×1.2+1s debounce+lockAtMinScale 回弹 | :1839977-1840107 | :1025-1034 | ✅ | — | — |
| C5 | 捏合缩放 startScale×比钳位 | :1840458 | :1041-1047 | ✅ | — | — |
| C6 | 捏合期间平移补偿 | userCenter 随 pinch delta 更新（:1840520） | 无 | ⚠️ | S | 触屏实测后补（与 C11/C12 打包） |
| C7 | pinchend/panend 复位语义 | :1841697/:1842238 | :1060-1067 | ✅ | — | — |
| C8 | pan threshold 10 | hammer defaults（:1763381） | :1053 | ✅ | — | — |
| C9 | 弹簧 a=1/15（pan 1/3）/阻尼 0.5 | :1843516 | :1113-1121 | ✅ | — | — |
| C10 | pan 位移除数 | `÷game.camera.scale`（stage scale，推定 1；**存疑**未运行时取证） | `÷zoom`（:1056-1057） | ⚠️ | S | 放大态平移手感差；触屏轮一并 |
| C11 | wheel 监听面 | `$(window).on("wheel")`+stopPropagation+preventDefault（:1840010 区） | canvas input wheel（:1019） | ⚠️ | S | 视口外滚轮不应缩放/滚页面——按 oracle 补 preventDefault 面 |
| C12 | 移动端判定 | `bowser.mobile`（:1843176） | `!device.os.desktop`（:1091） | ⚠️（微） | S | 边缘 UA 判定差；桌面恒一致 |
| C13 | cursors.active 闸 | :1840421/:1842013 | 无（:1001 注释挂账） | ⚠️ | — | 已挂账，随触屏光标域 |
| C14 | focusOn 取整 | `Math.round`（:1843694） | 浮点（:1099-1100） | ⚠️（微） | S | 目标取整 1 行（亚像素抖动消除） |
| C15 | 取景框/自动缩放公式 | §1.2 表 :1838880-1843400 | :1083-1094 | ✅ | — | — |
| C16 | 放大钳 40×30/20×15 格 | id==="elements" 恒假（game.json id=forest）+setPTMRatio(32) | TILES 常量 :55-56 | ✅ | — | — |
| C17 | checkBounds 居中/钳边语义 | :1844746-1844900 | :1104-1109 | ⚠️（域差） | S | 关卡矩形 vs +PAD 世界矩形=16px 边距带；38 号档 settled scroll(−16,+16) 同源（cf5781b）；改钳关卡矩形即收 |
| C18 | debug 模式（Q 键） | :1844678/:290 | 无 | ➖ | — | dev-only，不适用 |
| C19 | 低帧降级（拆 navies+dust） | :1901662-1901680 | 无 | ❌ | M | 弱机才触发；殿后（§5-4） |

## 3. 总表 B——场景 ambient VFX 逐项裁定（18 项）

同上口径。oracle 偏移见 §1.4 表；我方 file:line。

| # | 项 | oracle | 我方现状 | 裁定 | 成本 | 建议 |
|---|---|---|---|---|---|---|
| V1 | 背景砖纹静态平铺 | tileSprite+cacheAsBitmap（:1799560） | :376-380（tileSprite 同帧同尺寸，边距留黑） | ✅ | — | — |
| V2 | 地面描边/投影三滤镜一次烘焙 | :1799300-1799420 | buildGround canvas 合成（:434-537，注引 1829279 区=同管线） | ✅ | — | — |
| V3 | decor 植物静态烘焙+层序 | §1.4 | buildDecorations（:887-991，G12） | ✅ | — | — |
| V4 | 层序（decor>chars、liquid>decor、navies∈overGround<chars） | :1900377-1900737 | 建序 :387-390+depth 6/7/3.5 同构 | ✅ | — | — |
| V5 | Navies 生成（种子/只数 2..4/缩放） | :1901398+@1090818 | buildNavies :1219-1258（G13） | ✅ | — | — |
| V6 | Navies 利萨如逐帧 | Navies.update @1090818 | updateNavies :1922-1931 逐字同 | ✅ | — | — |
| V7 | 液体 30fps 三段贴片+整组 y+2 | :1670540-1670690 | buildLiquids :822-845 | ✅ | — | — |
| V8 | 风机关 on 演出 | :1733320 区 | stepWinds on 分支 :1788-1790 | ✅ | — | — |
| V9 | 风机关 off：base 400ms 延迟停帧 | `_.delay(…,400)` 后 stop+复位（:1733390 区） | 即 stop+setFrame（:1792） | ❌ | S | **Top2**：off 分支改 delay(400) |
| V10 | wind_effect 相位常驻（不重启） | 建时即播+随机相位，只切 visible（:1732495-1732510） | 每次 on `play()` 从 0 重播、off setFrame 0000（:1790/:1793） | ❌ | S | 并入 Top2：effect 建时 play 一次，on/off 只 setVisible |
| V11 | 钻石 ±5px/2000ms/Sine.inOut/yoyo/随机相位 | :1640040-1640060 | buildDiamonds :551-567 | ✅ | — | — |
| V12 | 平台灯罩帧/缩放/双态 | :1679246/:1679627 | :647-652/:1754 | ✅ | — | — |
| V13 | 设备灯组色 tint（groupColors 7 色+白缺省） | :1623002/:1622000 | 推块/拉杆已 tint（:586/:603）；**平台灯无 tint**（:651） | ⚠️ | S | **Top1**：平台灯 setTint(GROUP_COLORS[p.group]??0xffffff) |
| V14 | 尘埃层（BeamDust+光束遮罩） | §1.4 | 无（G13 裁「森林从不出现」） | ➖休眠 | — | 森林 0 beamer⇒oracle 亦永不显示，双侧等价不修 |
| V15 | 黑暗遮罩（dark 型） | :1900900 区 | 无 | ➖休眠 | — | forest levels "type":"dark" **0 命中**（47 关全 grep） |
| V16 | 雪面/冰面渲染 | :1722269 区 | 无 | ➖休眠 | — | tile 10/11/12 全森林 0 用例（12 号档 §5.1 挂账交叉） |
| V17 | 暂停全画面静帧 | game.paused 引擎分支（:416750 区）：动画全停仅面板动 | PauseMenu 场景覆盖、GameScene 未暂停⇒水面/钻石/海军/风效继续动 | ❌ | S | **Top3**：PauseMenu create 时 scene.pause("Game")/关闭 resume（纯表现层，服务端冻结已分离） |
| V18 | End/GameOver 背板常驻动画 | clearWorld=false+World.update 语义（§1.4） | main.ts:341/:355 `game.scene.start` 不停 Game⇒背板同样常驻 | ✅ | — | — |
| V19 | Complete 彩带 | :1926776-1928200 | 13 号档 #35/#36（发射器 vs 双波 tween、关闭时序）已录偏差 | ➖交叉 | — | 不重复；随 13 号档 Top6 |
| V20 | Temple/LevelMenu ambient | 全静态（:1915305-1923682） | TempleScene 全静态 | ✅ | — | — |
| V21 | GameOverMenu 本体 ambient | 仅 IngameMenu 面板+黑罩（@1878715） | overlays GameOverMenu 同构 | ✅ | — | — |
| V22 | 火把/光柱/雾 | 图集 0 火把帧；光柱仅菜单域；雾无此件 | 同无 | ✅（双侧皆无） | — | — |

## 4. 需实机核验 / 存疑

- **C10 `game.camera.scale` 实际值**：Phaser 2 Camera.scale=stage 缩放，1280×960 RESIZE 口径推定 1；未运行时取证。若恒 1，oracle pan=屏幕像素 1:1 世界位移（放大时明显快于我方 zoom 除数）。修复前建议先用虚拟钟 oracle 目测 pan 手感。
- **暂停时是否重绘最后帧**：Phaser 2 paused 分支不跑 stage.update；渲染管线（render 分支）本档未追。按"动画停更=视觉静帧"对齐即可，不影响 Top3 方案。
- **bowser.mobile vs device.os.desktop 的 UA 边界集**未逐一比对（C12）；桌面两侧恒走桌面分支，无实际影响面。
- C17 的 16px 域差与 38 号档 levelvis「settled scroll 系统差(−16,+16)」「冻结 zoom 0.9231 vs 1.0」**同源互证**（cf5781b）；该档若实机判定边距带可见性，以其实测为准。
- 弹簧/阻尼/时长/tint 全部为 bundle 直接常量，无推测成分；除上述四点外本档无存疑项。

## 5. Top 建议（按观感收益/成本排序，均待立项）

1. **【S】平台灯组色 tint**（V13）：`light.setTint(GROUP_COLORS[p.group] ?? 0xffffff)` 一行；平台=森林最高频设备（221 台面，group 1-6 五色在用），oracle 光罩随组变色、我方恒白。
2. **【S】风机关演出两件**（V9/V10）：off 分支 400ms 延迟停帧 + effect 相位常驻（建时 play 一次+setProgress 随机，on/off 只切 visible）。森林 14 关有风区（代码注记），机关关高频可见。
3. **【S】暂停全画面静帧**（V17）：PauseMenu 打开时 `scene.pause("Game")`、关闭 resume；对齐 oracle `game.paused` 动画全停语义（水面/钻石/海军冻结，仅面板动）。注意与已有服务端冻结/时钟口径分离，纯表现层。
4. **【M】低帧降级路径**（C19）：开局 3s suggestedFps<40 → 销毁 navies+停用 dust 语义（我方无 dust，等价=拆 navies）；仅弱机可见，殿后。
5. **【M】触屏三件打包**（C6/C10/C11）：捏合平移补偿、pan 除数（先实机核 game.camera.scale）、wheel 全页 preventDefault；需触屏设备实测配合。

## 6. 边界声明

- MenuScene/TempleHall idle（光柱相位/y 摆/蜡烛利萨如/角色立绘 glow）修复中，本档跳过；UI 转场/面板/按钮/结算时序归 13 号档；角色与设备动画注册归 12 号档；风力学公式（1.2+0.2sin 时变推力/0.975 阻尼/15 上限）归 07/09 号档内核域——本档只收**视觉演出**面。
- 本档零代码改动；Top 建议均为**待立项**，落地须另开生产槽并过既有门禁（tsc/vitest/build/e2e+det 位级锚）。
- oracle 一切证据只读未动；TEMP/camera-vfx-audit 转储件为档卷工作底稿（模块级还原件 10 件），收尾保留供复验。
