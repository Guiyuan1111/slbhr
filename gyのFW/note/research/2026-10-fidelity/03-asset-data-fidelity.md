# 03 · 素材与数据保真度盘点（子代理 C 完整报告）

> 取证方式：只读脚本对 `gyのFW` 与 `Fireboy-and-Watergirl\output\A` 逐字节比对 + 8 图集帧清单集合运算 + 48 关 JSON 全量机制枚举 + 原版 `js\init.eb02fbdab2aa1d24.js`（init.js，@偏移=字节偏移）反向取证。未触碰两仓库任何文件。产出日期：2026-10-04。

## 总判定

- **素材文件层：100% 保真**。复刻 `assets/` 59 文件与原版逐字节 md5 一致、`data/` 49 文件逐字节一致（脚本 diff=[]）；`packages/client/public/` 与 `dist/` 均为同源副本。
- **帧名层：460 个静态帧引用全部命中，0 个"名字对不上"**（历史上的 MaskBox 5 位/decor 后缀/液体动画键坑均已修复，见 note/handoff.md:32、note/release/0.2.0.md:24/48）。真正的差距集中在：**图集只装载 6/8、机关只建模 4 类/全作 12+ 类、音频只接 7/33、关卡只跑 1/48、整条菜单/选关/预载/中文字体 UI 管线未用原版素材**。

## §1 图集使用率矩阵

### 装载与注册（`packages/client/src/scenes/BootScene.ts`）

| 图集 | 原版帧数 | 复刻是否加载 | 引用/命中 |
|---|---|---|---|
| CharAssets | 239 | ✅ :31 | 216/216 |
| GroundAssets | 343 | ✅ :32 | 150/150 |
| MechAssets | 163 | ✅ :33 | 8/8 |
| MenuAssets | 60 | ✅ :36 | 2/60 |
| MenuBackgrounds | 5 | ❌ 未加载 | 0 |
| PopupAssets | 111 | ✅ :35 | 29/111 |
| PreloaderAssets | 3 | ❌ 未加载 | 0 |
| Temples/forest/TempleAssets | 60 | ✅ :34 | 55/60 |

注册动画 27 个键（BootScene.ts:62-99）：`{fire,water}` × {`_idle`(19/30帧), `_legs_idle`, `_legs_run`, `_jump`(11帧), `_fall`(5/11帧), `_stairs`(0-29)}、`smoke`(45帧)、`liquid_{water|lava|green}(,_left,_right)`(各15帧30fps)、`door_{fb,wg}_open`(FinishBoy/Girl 0-21, 25fps)、`finish_stone_{1,2,3}`(FinishStone 1-7/8-14/15-21)。

**登记但未触发**：`{role}_stairs`（BootScene.ts:79，GameScene 全文件无一处 play）——原版通关确实走楼梯动画，复刻只演石碑结算。

### 完全没用（unused）帧集清单（脚本集合差集）

- **CharAssets 23 帧**：`fire_head_rising`×5、`water_head_rising`×11（原版上升帧，init.js@1862157 `"rising", generateFrameNames(o+"_head_rising",0,4)`）、`fire_ice_legs`×3、`water_ice_legs`×3（冰冻腿部，@1862439）、`_default0000`。
- **GroundAssets 193 帧**：`Dust0000-0059`（60 帧仅 0000 被用作贴图）、`BeamDust0000-0059`（同上）、`BlackBox/BlackBoxLeft/BlackBoxRight` 0-14（黑暗关液体，45 帧）、`IceBox(_Left/_Right)`、`frost`×10、`vapor`×10、`BeamGradient`、`FreezeEffect`、`SnowFlat`、`SnowSlope`、`DarkDisk`、`_default`。MaskBox 全 13 帧均被使用。
- **MechAssets 155/163 未用**（仅用 8 帧）：`wind_base`×4+`wind_effect`×30+`wind_base_light_on/off`；`ball`；`pulley_anchor/base/platform/rope`；`hanging_anchor/base/platform`；`roman_bar/base/center/end`；`portal` 全家 76 帧（`portal_center`×40、`portal_glow`×30 等）；`beamer(_light_on/off)`；`lightpusher`×3；`timed_pusher`×4；`slider`/`SliderDot`/`SliderTrack`；`BoxMirror`、`rotmirror`×4、`infinitemirror`×3；**lever 亮灯帧 `lever_base_light_on/off`、`lever_stick_light_on/off`×4**；`moving_platform_light_on/off`×2；`pusher_block_silver`；`WindowCenter/Left/Right`；`BackgroundCover`、`_default`。
- **MenuAssets 58/60 未用**（仅 `StoneButton0000/0001`，GameScene.ts:690,700-701）：`BackButton(0000/0001/Full×4)`、`FxButton`、`MusicButton`、`MuteButton`、`VibrateButton`、`SettingsButton`×4、`ToggleControlButtonDual/Single`×4、`ToggleSingleScreen`×12、**选关钻石图标 `Diamond0000-3`+`DiamondDark/Puzzle/Speed` 及 `_Bkg_Mask` 系**、`Lock`、`GoldLock`、`UnlockButton`、`NewSign`、`Navy0000`、`_default`。
- **PopupAssets 82/111 未用**：`FinishStoneDark/Puzzle/Speed`（各 22，另三游戏模式石碑）、`Confetti`×4、`SilverIcon`（结算银钻行）、`PauseButton`、`MuteButton`×2、`FingerRingLeft/Right/Jump`（触屏教学手指）、`CursorToggle`、`DeviceItemRenderer`、`Clock`、第 2 枚 `popupArrow`、`_default`。复刻用了 `PopupBackground/FinishIcon/DiamondsIcon/TimeIcon/Tick/Cross/popupArrow0000/FinishStone0000-21`。
- **TempleAssets 5/60 未用**：`Diamond1_Bkg_Empty0000`、`Icon0000/0001/0002`、`MenuBackground0000`（选关大厅用）。
- **MenuBackgrounds 5/5、PreloaderAssets 3/3：整个图集未加载**（`HolderTexture/Loading/SliderHolder`、`LoaderBar/LoaderHolder/LoaderTitle` 全闲置）。

## §2 sync-assets.mjs 核对

- 脚本本体（`scripts/sync-assets.mjs:9-19`）只做一件事：仓库根 `assets/`、`data/` → `packages/client/public/` 全删全拷。**它不从原版抓取**；根目录副本按 note/PLAN.md 由一次性人工复制，现比对证明与原版逐字节一致。
- 同步覆盖：8 图集+2 PNG、33 mp3、`images`（Beam.png、GameNameForest.png、TempleHallForest.jpg、branding/branding_logo_kizi.png）、`fonts/chinese/font.fnt+font.png`、`tilemaps/tilesets` 4 json、`data` 48 关+temple.json——**无遗漏**。public（59+49）与 dist（108 文件）与根一致。
- **反向差距（同步了但代码零引用）**：`images/` 4 文件、`fonts/` 2 文件（无 `bitmapFont`/font.fnt 加载，BootScene 只 load 图集+音频）、`MenuBackgrounds.*`、`PreloaderAssets.*`、4 个 tileset json 仅被 parseLevel 当元数据读、33 中 24 个 mp3（见 §4）。原版侧这些全被引用：GameName/TempleHall @init.js:2220815、HallBeam(assets/images/Beam.png) @2221112、KiziLogo @2212773、bitmapFont 4 别名 @2219650、temple.json @2199840。
- **两端取关路径不一致（确切行号）**：服务器 `packages/server/src/levels.ts:16` `LEVEL_DIRS = ["data/forest/levels", "data/tutorials/levels"]`（forest 关走第一目录）；客户端 `packages/client/src/main.ts:28` `fetch(\`/data/tutorials/levels/${id}.json\`)` + `:34` `base = "/data/tutorials/levels/"` 写死 tutorials 目录。仅当 id=forest_01（只存在于 tutorials）时两端巧合一致；其余 47 关服务器从 `data/forest/levels` 读到、客户端 fetch 404。`main.ts:18` `LEVEL_ID="forest_01"` 写死，`ForestRoom.ts:38` 默认同值。
- tileset json 引用的 `image`（Ground.png/Chars.png/Objects.png/LargeObjects.png）在原版包内本来就不存在（原版 tilemaps 目录仅 4 个 json），复刻代码不依赖这些 png（BootScene.ts:7-8 注释即此事实）。

## §3 音频保真（33 mp3）

全部在库且经服务器无扩展名路由可达（`packages/server/src/index.ts:31-44` 补 `.mp3`；静态目录 `:25`）。原版加载机制：键名→文件名首字母大写（init.js@1933380，`levelMusic→LevelMusic.mp3`、`jump_fb→Jump_fb.mp3`；@2223397 菜单态同法；`levelMusic_dark/_speed/levelMusicFinish(_speed)` 按 `levelData.type` 运行时选择 @1931685）。

| 状态 | 文件 | 证据 |
|---|---|---|
| 已接且实际触发（7） | Jump_fb / Jump_wg / Diamond / Death / Door / LevelMusic / LevelMusicFinish | 注册 BootScene.ts:41-53；播放 GameScene.ts:130/626（bgm）、552（death）、571（jump）、588（door）、601（diamond） |
| 已加载、从不播放（2） | **Lever.mp3（键 sfx_lever）、EndPass.mp3（sfx_end_pass）** | BootScene.ts:47-48；全 src 无触发点（脚本扫描仅命中注册行） |
| 完全未接（24） | CharToggle1/2、Clock、EndDiamond、EndFail、Freeze、IceSteps_fb/wg、LevelMusicOver、LevelMusic_dark、LevelMusic_speed、LevelMusicFinish_speed、LightPusher、Melt、MenuMusic、Platform、PortalClose/PortalLoop/PortalOpen/PortalTransport、Pusher、Slider、WaterSteps、Wind | 原版均有对应 sounds 键读取（init.js sounds.* 集合：charToggle1/2, clock, death, diamond, door, endDiamond, endPass, freeze, jump_fb/wg, lever, lightPusher, melt, menuMusic, platform, portal×4, pusher, slider, waterSteps, wind, levelMusic×3+变体） |

键名体系差异：原版 camel 键（`levelMusic`…）↔ 复刻 `sfx_/bgm_` 前缀键——仅命名层，文件指向一致。另：原版按钮/推块触发 `sounds.pusher.play()`（init.js@1747581/1769128）；复刻推块/按钮无任何音效。

## §4 关卡数据覆盖面（48 关 → 机制矩阵）

机制语义取自 `assets/tilemaps/tilesets/Objects.json` tiles：0=pusher、1=leverA、2=leverB、4=box、5=beamer、6=rotmirror、7=lightpusher、10=ball、11=infinitemirror、12=boxmirror、13=boxheavy、14=timedpusher、15=wind；LargeObjects：0/1=portal、2=wind(LG)；Chars local：0/1 出生、2/3 门、4/5/6/7 红/蓝/银/双色钻。

森林 48 关实际机制使用种类 × 关卡数：`platform 36｜pusher 30｜leverB 23｜leverA 21｜box 16｜wind(LG) 15｜银钻 14｜ball 13｜pulley 10｜hanging 7｜roman 4｜window 1｜boxheavy 1`（beamer/portal/mirror/lightpusher/timedpusher/wind(small) 在森林关 **0 次**）。

复刻支持模型 = parse 通过（需 Ground+Chars+Objects 引用，`shared/level.ts:138/194`）∧ 机制 ⊆ {pusher, leverB, box×1, platform}（`level.ts:254-267` 只认 local 0/2；`GameScene.ts:271-286` 只画 0/2/4；`world.ts:76-79` 推箱只取第一个）。

| 结果 | 关卡 |
|---|---|
| **parse 直接崩（缺 Objects 图块集引用，7 关）** | forest_03、forest_03_1、forest_06、forest_06_1、forest_12、forest_12_1、forest_26 |
| 机制集合在模型内（5 关） | **forest_01（当前唯一接入）**、forest_11、forest_13、forest_13_1、forest_31 ——其中 13/13_1 各 4 箱（仅第 1 个有物理，其余只画不动）；18/31/07/27/27_1/30 平台带 `dtheta/offsetY` 属性被复刻忽略 |
| 其余 36 关 | 含未实现件：leverA 20 关、wind 15、ball 13、pulley 10、hanging 7、roman 4、boxheavy 1（bonus_2）、window 1（bonus_1）、多箱（24_1=2、30=3、bonus_2=18）；对象被 parseLevel 塞进 mechProps 后**无贴图分支、无物理，凭空消失** |
| **当前可完整渲染+仿真** | **= 1 关（forest_01）**，且系 `main.ts:18` 写死所致 |

## §5 渲染管线核对（地面/液体/浮尘）

- **地面**：原版 drawTile（init.js@1831573）：type0→`"MaskBox0000"+floor(4*rand)`（5 位数字、4 变体）、其余→`"MaskBox"+type+"0000"`；type 12→2、55→5 归一；ForeGround0000 取自 TempleAssets。复刻 GameScene.ts:166-171/186-188/199-206 帧名逐一相同（13/13 MaskBox 全命中）、端盖 MaskBox8/9 与原版 5 位/4 位混用规则一致。差异仅两处：森林数据未出现 10/11/12/55 型（无法实测归一差异）；PRNG 不同（复刻 mulberry32 固定种子 :54-63/:158，原版 Math.random）。
- **液体**：原版 5→WaterBox、6→FireBox、7→GreenBox，`generateFrameNames(prefix+"Left"+"|"+prefix+"Right", 0..14, "", 4)` 30fps（init.js@1704002）——复刻 `level.ts:119` LIQUID_TILE、`BootScene.ts:83-91`、`GameScene.ts:305-333` 帧名/族/段序全一致。
- **浮尘/Navies**：原版实为两套。(1) **Navies 悬浮物**：`useDust` 默认开（init.js@1930471，fps<40 关闭 @1942749），按 `getNaviesPoints`（种子 "ASDFA"、步进 `Math.round(3*rng+3.5)` @1836440）撒 `States/Common/Navies` 精灵——本体是 **MenuAssets 的 `Navy0000`** +极坐标漂移动画（@1940283-1940506、@1116990 区段）；(2) **dust 层**：仅当关卡 objects 里 `find(type==="beamer")` 命中才 `fillDustLayer()`（@1940535），铺 `ceil(width/10)` 个 BeamDust0000 并用光束做 mask——森林 48 关 0 个 beamer，**原版森林关从不出现 BeamDust**。复刻：GameScene.ts:451-473 无条件 18 颗 `Dust0000/BeamDust0000` 静帧+透明度漂移；`Navy0000` 帧未用；且复刻把 "ASDFA" 步进公式用于 **decor 前景装饰**撒点（GameScene.ts:375-376）——该公式在原版属 getNaviesPoints（decorate 另有自身循环 @1829743-1829800，同种子同 z()，但 O 变体用计数器奇偶 `w%2+1`、复刻用纯随机 :402）。

## §6 UI/流程素材盘点

原版流程素材链（init.js 证据）：Preloader（PreloaderAssets 3 帧 + KiziLogo @2212635/2212773）→ 菜单/大厅（**MenuBackgrounds** + MenuAssets 按钮/设置/开关全家 @2219322 起、背景 `assets/images/TempleHallForest.jpg`、标题 `assets/images/GameNameForest.png`、Navy0000 装饰 @2220571-2220815；多庙分支引用包内不存在的 GameNameElements.png）→ 选关（`data/forest/temple.json` levels×48/edges×47 @2199840 + MenuAssets Diamond 系图标 + TempleAssets Icon0000-2/Diamond1_Bkg_Empty/MenuBackground0000）→ 局内 HUD（`TempleAssets.Clock0000` + 中文 bitmapFont "font"@1912643；原版确用中文字体 `fonts/chinese/font.fnt+png` 四别名 @2219650）→ 结算（PopupAssets：FinishStone 按模式 4 套、Confetti、SilverIcon、Pause/Mute、FingerRing 触屏提示 + Common/StoneButton 用 MenuAssets StoneButton）→ 传送/冰/黑暗等机关专属素材（portal/ice/BlackBox 族）。

复刻对应物：**DOM+CSS 菜单与联机栏 0 素材**（index.html:30-186 全部自制样式）；游戏内 HUD 用图集帧 3 处（Clock0000 GameScene.ts:478、diamond_fb/wg0000 :506-507、其余计数为 serif 文本 :479-504）；结算板 PopupAssets 7 类帧 + `FinishStone` + MenuAssets `StoneButton`（:649-701）；教学文字为系统衬线文本（:435-449，非 bitmapFont）；**无预载画面、无选关门户、无大厅**——temple.json/MenuBackgrounds/PreloaderAssets/images×4/font.fnt 全库引用数 0（脚本 grep 证实）。

## §7 "名字对不上"清单（本语境 = 引用/接线层面的错位）

1. 帧名拼写：**无**（460/460 命中；历史坑已修）。
2. `sfx_lever`、`sfx_end_pass` 加载后无触发点（BootScene.ts:47-48 vs GameScene 全文件）。
3. `{role}_stairs` 动画注册后无触发点（BootScene.ts:79）。
4. 客户端关卡取数目录（main.ts:28/34 tutorials）≠ 服务器解析目录（levels.ts:16 forest 优先）。
5. level.ts:15-16 与 GameScene.ts:269-270 两套 gid 注释互斥（"24=拉杆" vs "24=推块"），按 tileset 实际语义 0=pusher/2=lever；level.ts:70 行内注释（0=拉杆 2=按钮）与代码行为（0→plates、2→levers）**相反**。
