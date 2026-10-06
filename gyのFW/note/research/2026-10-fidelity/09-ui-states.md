# 09 · 原版 UI 状态机规格（Menu/Temple/结算弹窗，逆向提取）

> 2026-10-06。来源：bundle 美化版逐行提取（行号为 init.eb02fbdab2aa1d24.js）+ 实机截图
> 显示树实测（TEMP/uiref/*.png 为原版、TEMP/uiref-ours/*.png 为我方复刻）。

## 状态全景

boot → load → menu → levelMenu → level → endGame（success ? EndMenu : GameOverMenu）；
首次全 3 星 → gameComplete（彩带）；buy/SettingsMenu/CreditsMenu/SoftLockMenu 为叠加弹窗。

## 坐标约定

世界原点 = 屏幕中心（Boot 设 camera.x=−w/2）；右上 = (w/2, −h/2)。IngameMenu 系弹窗内部为左上角系（板中心=屏幕中心）。状态切换统一 `state.fade(name,...)`（黑幕 500ms + Loading 字）。

## Menu（TempleHall）

| 元素 | 实测（1280×960） |
|---|---|
| 背景 | TempleHallForest.jpg 1708×960 居中（左右裁 214） |
| 石柱 ×8 | Beam.png ~107-154×1058，均匀分布（入场滑入动画） |
| 标题 | GameNameForest.png 860×270 @ (640,288) |
| Play | bitmapText「开始游戏」251×76 @ (640,513)，无底板，周围 Navy0000 ×5 |
| 角色 | 火 @ (320,875)、水 @ (960,875)：glow+legs+head（约 330 高，idle 30fps） |
| 其他 | 左下设置钮、右上「?」（Credits）、kizi logo（品牌，我方省略） |

Play → levelMenu（传 temple 对象）。

## Temple（LevelMenu，tree 型选关）

- 背景：TempleAssets MenuBackground0000 平铺 1280×960。
- 树布局：k=0.9H、C=min(1.2k, 0.9W)；节点 = (x·C−C/2+640, y·k−k/2+480)；缩放 x=min(k,C)<800?0.5:0.6。
- 树纹理：bitmapData 画边（temple.color #5B4610、线宽 16x、只画已解锁侧）+ 底座 Mask + 滤镜烘焙 RenderTexture（实测 treeTexture 1037×864 居中三层叠放）。
- 节点：Diamond{,Speed,Puzzle,Dark}+星级帧（104×104；Speed 101；Puzzle 118×110）；锁定 = Lock0000；数字 bitmaptext 默认隐藏（右下「显示关卡数」切换）。
- 返回：左下 BackButton0000 +「返回」→ menu。显示关卡数钮 @ (1165,909)。
- 进度：星级 = 1 基础 + 钻石收满 +1 + 限时 +1（puzzle 看银钻、dark 看限时）；state4=3星…state1=可玩；tree 邻接传播可玩性；softLock = 总星 < minRequired。

## 结算/暂停弹窗（IngameMenu 基类：PopupBackground0000 1082×642 + 弹簧滑入）

- **EndMenu**（通关）：三行 FinishCounter（Finish/Diamonds/Time 图标 + Tick/Cross 达成位）x=−200、y=−halfHeight+20/100/180；限时小字；Continue StoneButton (0, halfHeight−140) 延迟 enable；左箭头 popupArrow + 右 FinishStone 星动画（帧 1-7/8-14/15-21 @30fps）；每 700ms 逐行达成（endPass/endDiamond 音效）。
- **GameOverMenu**：「Game Over」fontStone_large 36 + Menu/Retry 两枚 StoneButton (±0.4halfWidth, 0.4halfHeight)。
- **PauseMenu**：「Paused」36 + Retry/End/Resume 三钮；P 键或暂停钮触发 togglePause。
- StoneButton = MenuAssets StoneButton0000/0001 252×117 + fontStone 26（过宽拉伸底图）。

## 字体

四个名字（font/fontStone/font_large/fontStone_large）全指向 assets/fonts/chinese/font.fnt（基准 48）；字号按调用处：font 18/20/24/28，fontStone 20/22/26，fontStone_large 36/38/32，font_large 40/30。

## 我方实现（0.3.12）

- MenuScene/TempleScene 落地（上表实测坐标直用）；流程 = 画布 Menu → Temple → 点关卡 → DOM 联机面板（?level= 深链直通面板，e2e 兼容）。
- 进度 localStorage（fw-temple-progress-v1），解锁 = initial 或相邻已通关（tree 传播）。
- 省略项（功能性/品牌）：kizi logo、设置/Credits 弹窗、buy、SoftLockMenu（我方 48 关全开放）、联机暂停。
- ✅ 已复刻（0.3.13）：EndMenu/GameOverMenu/PauseMenu → scenes/overlays.ts（板内局部坐标系）。
