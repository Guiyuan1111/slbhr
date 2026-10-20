# 14 号档 · 音效保真度审计（flashp 音频槽）

日期：2026-10-20 ｜ 槽位：flashp（音频审计）｜ 性质：只读考古+档卷（零代码改动，全静态作业，未起浏览器/服务器/Playwright）。
口径：oracle 字节字证（`Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js`，md5 `d637cb8c…`，下记 **bundle:偏移**；已与 `har/A.har` 原始网络件逐计数比对，`sounds.*` 引用面**完全一致**——本地 oracle 件可信）+ 我方源码 file:line。门禁不含音频、游玩报告从未触发，本档为该项目音频面**首次全量普查**。

## 0. 结论速览

- **oracle 音频系统全貌**：33 个 mp3（Boot 全量预载，bundle:2169530 区 `p=[...]`）；menu 态仅装 `[menuMusic, pusher]`（:1101148），level 态装 18 基础键+按地图对象类动态追加（:1887100-1888400）。**主音量 `game.sound.volume=0.1`**（:2162271）+ **总静音 `sound.mute=!settings.fx`**（Boot :2162295、Level init :1886199、onResume、fx 开关信号 :2209677）——**fx 关=全 mute（含 BGM）**；music 开关只控制 BGM 起播/停止（settingsSignal→当前态 `updateMusic()` :2209677），**一次性曲目（levelMusicOver/Finish）播放不受 music 开关门控**（:1822227/:1906276 无门直接 play）。自建 `playInstance/stopInstance`（实例计数，:2216418）。pan/rate 全 bundle 0 游戏侧使用（playbackRate 6 处全为 Phaser Video 引擎内部）。
- **我方接线**：19 键（`audio.ts` menu 批 1+game 批 18），主音量 0.1 已对齐（main.ts:441）；SFX 走 `settings.fx`、BGM 走 `settings.music` 分轨门控（GameScene.ts:411-417）——**与 oracle「fx=总静音」语义不同**。
- **计数（森林适用口径）**：缺失触发 **1 类**（UI 按钮点击音全缺——oracle 每颗按钮点击播 pusher 键、settings.fx 门控，覆盖主菜单/选庙/选关/设置/结算全部按钮）；触发不一致 **9**；参数偏差 **0**（适用面 master 0.1 / waterSteps 0.5 / wind 0.2 全一致），门控语义差 **3** 子项（fx 总静音、music 即时性、one-shot 曲目门控）。资产层缺失 **14 键**（charToggle1/2 + clock/freeze/iceSteps×2/lightPusher/levelMusic_dark/melt/portal×4/slider），**逐键经 oracle 森林+教学关 58 份地图数据扫描字证：除 charToggle（单模式）外全部 0 用例**——oracle 森林通关同样永不触发，属「大庙机制开荒随机制补」而非现役缺口。
- **Top3（按玩家感知频次）**：①UI 按钮点击音全缺（每次点击都缺）成本 S+；②退场声音泄漏（`scene.stop("Game")` 不停音——Phaser 3 场景共享全局 sound manager（InjectionMap `sound:'sound'`，node_modules/phaser/src/scene/InjectionMap.js:27），mid-level 返回菜单时 bgm_level/风声循环继续播进菜单；oracle 在 quit/retry 显式 `levelMusic.stop()` bundle:1909660/:1910067）成本 S；③速度关终局曲错装（oracle 按 type 选 `levelMusicFinish_speed` :1906276，我方恒播 `bgm_finish`，`bgm_finish_speed` 装载 0 播放；且 finish 路径只停 `bgm_level` 不停 `bgm_level_speed`，速度关终局底噪叠播）成本 S×2。

## 1. oracle 音频系统全档（证据基座）

### 1.1 资产清单与装载

- **33 键全集**（Boot 态 preload，bundle:2169530 区）：menuMusic、levelMusic、levelMusic_dark、levelMusic_speed、levelMusicOver、levelMusicFinish、levelMusicFinish_speed、charToggle1、charToggle2、endPass、endFail、endDiamond、jump_fb、jump_wg、waterSteps、iceSteps_fb、iceSteps_wg、death、diamond、door、freeze、melt、lever、pusher、platform、wind、portalOpen、portalLoop、portalClose、portalTransport、clock、slider、lightPusher。键名=文件名去扩展名首字母小写（`charAt(0).toUpperCase()` 拼路径，:1888733/:2170050）。
- menu 态复载 `[menuMusic, pusher]` 并覆盖 `game.currentSounds`（:1101148-1101180）——**菜单按钮点击音用的 pusher 键在菜单态由 menu 批供给**。
- level 态：18 基础键（:1887180-1887290，charToggle1/2 与 iceSteps/freeze/melt/endFail **无条件装载**）+ 遍历地图对象按类 `prototype.sounds()` 追加（:1888323）：lever、lightPusher、platform（MovingPlatform 与 RotMirror 同键）、portal 四件套、pusher、slider、timedPusher=`[pusher, clock]`、wind。

### 1.2 触发点全表（bundle:偏移）

| 键 | 触发 | 参数 |
|---|---|---|
| menuMusic | menu 态解码完成且 settings.music→startMusic（:1102270 区）；music 开关→updateMusic 停+条件重播（:1101843）；LevelMenu.startLevel→`fadeOut(500)`+onFadeComplete stop（:1935104） | loop=true、allowMultiple=false |
| levelMusic | level 解码完成且 settings.music→play（:1889150 区）；**按 levelData.type 选曲**：dark→_dark / speed→_speed（:1887100）；death/animateFinish/retry/quit 显式 stop（:1822178/:1906226/:1909582/:1910022）；music 开关→updateMusic（:1905636） | loop=true（decode 前置设置） |
| levelMusicOver | 角色 `_doKill`（liquidTouched→kill→delay0）：death 音→levelMusic.stop→**无门控直接 play**（:1822134-1822227） | 无门控（music 关也播） |
| levelMusicFinish(_speed) | animateFinish：levelMusic.stop→play（按 type 选 _speed 变体）（:1906226-1906276）→1600ms→gameFinish | 无门控 |
| endPass | 结算板行达成链，**恒 3 拍**、700ms 节拍（f=700 三级 `_.delay` 嵌套，:1876959/:1877124/:1877339），隐藏行也发声 | — |
| endDiamond | 第三拍后 700ms（`m.visible && f` 门）星碑动画同拍播（:1877655） | — |
| endFail | **装载但全 bundle 0 播放点（死资产）**；与 `har/A.har` 原始件一致（非本地件损毁） | — |
| charToggle1/2 | 单模式光标切换点击：wg→fb=1、→wg=2（:1867186-1867252） | — |
| jump_fb/jump_wg | 起跳成功（prohibitJump 置位）按角色播（:1829534-1829574） | — |
| waterSteps | 左/右按住 && isOnLiquid：loop 循环播；松开/离液 stop（:1825313-1825517） | **loop=true, volume=0.5** |
| iceSteps_fb/wg | 左/右按住 && isOnIce（Snow 设备脚接触计数，:1663221/:1724643；森林+教学关 0 用例→永不触发） | loop=true（无音量覆写） |
| death | `_doKill` 播（:1822134）；注：oracle 件含 `GameConfig.cheating.isInvulnerable` 分支——免死模式播 death+烟雾**不 kill**（:1821424，oracle 原生自带，与 har 原始件一致） | — |
| diamond | Diamond.grabbed（:1641734） | — |
| door | 门动画中：开 a<21 / 关 a>0 期间 `playInstance`（isPlaying 守卫防重启）；到 21（全开）/0（全关）`stopInstance`（:1644774-1645136） | 实例计数 |
| lever | 两向翻转都播（0→1 与 1→0，:1655981-1656232） | — |
| lightPusher | 仅激活 0→1 播，释放不播（:1659676） | — |
| platform | MovingPlatform 信号翻转：stopInstance 旧+playInstance（:1680735-1681037）；RotMirror 同键（:1716428）；到关节限位 stopInstance（:1717408） | 实例计数 |
| pusher | 两向越过 0.2 都播（:1707660-1707823）；**且是全部 UI 按钮的点击音**：Button 基类 mouseup/touchend→`currentSounds[soundId].play()`（settings.fx 门控，:1087871/:1088299）——GoldButton :1090170、StoneButton :1848163、BackButton :1910766、设置开关钮 :1853899/:1855242、局内设置钮 :1862379、选关菱形 :1104686、选庙图标 :1951421 | 按压还伴 navigator.vibrate(50)（settings.vibrate） |
| clock | timedPusher 激活期 `play(null, (22796−time)/1000)`——按配置时长**从曲目中段起播**的倒计时滴答（:1729881；森林 0 用例） | position 偏移 |
| slider | 原始逐帧播已被注释（:1721107），现行=按行程 1/27 分段补发 play（:1721486；森林 0 用例） | — |
| wind | 开：loop=true+playInstance **volume=0.2**；关：stopInstance（:1737642-1737920） | loop, vol 0.2 |
| portalOpen/Close/Transport/Loop | 开=Open 播+Loop 实例（**loop=true, volume=0.3**）；关=stopInstance+Close 播；传送=Transport 播（:1692237-1693251；森林 0 用例） | Loop: loop, vol 0.3 |
| freeze/melt | 液体池被蓝/红光束照射冻结/融解（type 5，:1667861-1667983；Beamer 森林 0 用例→永不触发） | — |

### 1.3 全局门控与常量

- 主音量 **0.1**（Boot :2162271）；`sound.mute=!settings.fx`（Boot+onResume+Level init+fx 信号四处同步）→ **fx 开关=全局总静音（含 BGM 与一切音效）**。
- music 开关：settingsSignal 派发→当前态存在 `updateMusic` 则调（:2209677）——menu/level 两态即时停/起；**不 gate 一次性曲目**（Over/Finish 裸 play）。
- 自建 `Sound.prototype.playInstance/stopInstance`（:2216418）：实例计数，0 或 loop→play 否则 restart；stopInstance 减到 0 才 stop。
- pan/rate：游戏侧 0 使用。

### 1.4 森林适用面裁定（oracle 侧数据字证）

对 `output/A/data/forest/levels/*.json + tutorials/levels/*.json` 全 58 份地图逐对象 gid→图块集 type 解析：实际出现=device char×96/diamond×490/door×96/lever×74/pusher×73/platform×223/wind×33/box×42/boxheavy×17/ball×20 + plain hanging×20/pulley×11/roman×6/window×2；**portal/lightpusher/timedpusher/beamer/rotmirror 0 用例，snow 0 用例，slider 无此图块类型**。→ oracle 森林通关实际只会触发：menuMusic、levelMusic(Finish/_speed)、levelMusicOver、endPass、endDiamond、jump×2、waterSteps、death、diamond、door、lever、pusher、platform、wind、pusher(按钮)。charToggle（单模式光标钮）在 dual 联机形态也不触发。

## 2. 我方现状（file:line，`packages/client/src/` 省略）

- 装载：`audio.ts:18-39` menu 批 `[bgm_menu]` + game 批 18 键（注释笔误「18 键」实 18 对）；BootScene.ts:90 装菜单批、MenuScene 驻留期暖装 game 批（BootScene.ts:88-93）、GameScene.preload 兜底（GameScene.ts:291）。无扩展名流式路由+显式 type=mp3（audio.ts:44）。
- 播放统一入口 `GameScene.sfx()`（GameScene.ts:411-417）：bgm* 走 settings.music、其余走 settings.fx；键未入缓存静默跳过。主音量 0.1（main.ts:441）。
- 已接线触发：bgm_level/_speed 按 type 循环播（GameScene.ts:398/:407）；重试重播（:1406-1410）；死亡 smoke+sfx_death+停 BGM+bgm_over（:1513-1518）；跳音按角色（:1549）；waterSteps loop vol0.5 本机角色在液+按方向（:1575，stop :1597）；门帧 1..20 播/0 或 21 停（:1587-1588）；钻石收集（:1610）；lever/pusher 吃服务器 sfx 事件（:1447-1448；ForestRoom.ts:400 双向都发；mechanisms.ts:138-152/:209-222 与 oracle 逐条直译）；wind loop vol0.2（:1797-1798）；平台起步单发（:1901，位移自检 platAnyStart）；终局 bgm_finish（:1416-1417）；结算 end_pass 逐行 700ms 节拍+end_diamond 第 2800ms（overlays.ts:129-131/:174-175，经 main.ts:219 `__fwSfx`）；菜单 bgm_menu（MenuScene.ts:119/TempleScene.ts:62/menus.ts:35-41，music 开关 applyMusic 即时停起 menus.ts:33-44）。

## 3. 总表（逐项裁定）

裁定：✅一致 ｜ ⚠️偏差 ｜ ❌缺失 ｜ ➖不适用（森林数据 0 用例/机制未复刻）。成本 S/M/L。oracle 证据=bundle:偏移；我方=file:line。

### 3.1 触发面

| # | 项 | oracle | 我方 | 裁定 | 成本 | 建议 |
|---|---|---|---|---|---|---|
| T1 | UI 按钮点击音 | 每颗按钮点击播 pusher 键（settings.fx 门控；菜单态由 menu 批供给 pusher），:1087871+§1.2 pusher 行全引 | 全部菜单/结算/设置按钮 pointerup 无任何音 | ❌缺失（1 类，覆盖面最大） | S+ | 各 pointerup 加 `__fwSfx("sfx_pusher")`（或统一 stoneButton 封装处）；**注意我方菜单态未装载 pusher 键**——须把 pusher（或专用 ui 键）加入 AUDIO_MENU 批，或菜单态懒装 |
| T2 | 速度关终局曲 | 按 type 播 `levelMusicFinish_speed`（:1906276 选曲逻辑 :1887100） | 恒播 `bgm_finish`；`bgm_finish_speed` 装载 0 播放（grep 全库仅 audio.ts:36） | ⚠️偏差 | S | `finishKey()` 仿 `bgmKey()`（GameScene.ts:407） |
| T3 | 终局停 BGM 面 | animateFinish 停 levelMusic（speed 关=停 _speed 变体，同一 Sound 键位） | `stopByKey("bgm_level")` 只停常规键（GameScene.ts:1416），速度关 `bgm_level_speed` 继续叠播 | ⚠️偏差 | S | 补 `stopByKey("bgm_level_speed")` |
| T4 | 退场停音 | quit/retry 显式 `levelMusic.stop()`（:1909660/:1910022）；风/门/水循环各有显式 stop 面 | `leaveToMenu`/结算「返回菜单」仅 `sm.stop("Game")`（main.ts:225-241）；Phaser 3 场景共享全局 sound manager（node_modules/phaser/src/scene/InjectionMap.js:27 `sound:'sound'`；Systems.js shutdown 不停音）→ bgm_level/_speed/_over/bgm_finish/**sfx_wind 循环**泄漏进菜单（GameScene 无 SHUTDOWN 钩子，grep 0 命中）。*Phaser 语义推定+代码字证，未实机验证（本档全静态）* | ⚠️偏差（泄漏面最刺耳） | S | GameScene 注册 `events.once(SHUTDOWN)` 统一 stopByKey 本场景全部键，或 leaveToMenu 显式停 |
| T5 | fx 开关语义 | `sound.mute=!fx`=**总静音（BGM 一起哑）**，即时生效（:2209677/:2162295/:1886199） | fx 只 gate 新播 SFX（GameScene.ts:416）：music 不受影响、已播循环（水/风/门）继续到自然停止 | ⚠️偏差（门控语义） | S | setSettings 钩子同步 `game.sound.mute=!fx`（Phaser 3 mute 属性直配）——或维持分轨（体验取舍待用户裁决） |
| T6 | music 开关即时性 | settingsSignal→当前态 `updateMusic()` 即停/即起（:2209677/:1905636） | Game 态切 music 不即时生效（menus.ts:37 注释自认「Game 态由下次 bgmKey 播放时自然生效」）；Menu/Temple 态即时（menus.ts:33-44）=一致 | ⚠️偏差（仅 Game 态） | S | setSettings 广播+GameScene 监听停/起 bgm |
| T7 | 一次性曲目门控 | levelMusicOver/levelMusicFinish **不受 settings.music 门控**照播（:1822227/:1906276 无门） | bgm_over/bgm_finish 走 `sfx()` 的 music 分轨门（GameScene.ts:415）→ music 关的玩家听不到失败/终局曲 | ⚠️偏差（门控语义） | S | bgm_over/bgm_finish 绕过 music 门（忠实向）；是否采纳斯档待用户 |
| T8 | 菜单→关卡 BGM 退场 | menuMusic `fadeOut(500)`+onFadeComplete stop（:1935104） | `stopByKey("bgm_menu")` 硬停（GameScene.ts:396） | ⚠️偏差（参数级） | S | Phaser 3 `fadeOut(500)` |
| T9 | 结算 endPass 拍数 | 恒 3 拍（隐藏行也发声，:1876959-1877339 嵌套链无 hide 分支） | 逐可见行播：puzzle 关（钻石行隐藏）只有 2 拍 700/2100，跳 1400（overlays.ts:127-131 `if (row.hide) return` 在 delayedCall 注册之前） | ⚠️偏差 | S | 隐藏行保留空拍（只跳 tick 显示不跳音） |
| T10 | 平台音实例管理 | 逐台 playInstance+stopInstance（翻转/限位即停，:1680735/:1717408） | 任意一台起步单发一次、播完整曲、无限位停（GameScene.ts:1901） | ⚠️偏差（粒度） | S-M | platformPrev/platformMoving 字典已有（:1905-1910），补限位/反向 stop 判定即可 |
| T11 | lever/pusher 两向 | 两向都播（:1655981/:1707660） | 服务器双向都发 sfx（mechanisms.ts:138-152/:209-222）→一致 | ✅ | — | — |
| T12 | 死亡链 | death→levelMusic.stop→levelMusicOver（:1822134） | sfx_death+停两 bgm+bgm_over（GameScene.ts:1514-1518） | ✅ | — | — |
| T13 | 跳/水声/门/钻石/风 | §1.2 | GameScene.ts:1549/:1575/:1587/:1610/:1797 全对位（含 vol0.5/0.2、loop、帧守卫） | ✅ | — | — |
| T14 | 结算 endDiamond | 第三拍后 700ms 星碑同拍（:1877655） | 2800ms 固定拍+星碑动画（overlays.ts:174-175） | ✅（general 口径；puzzle 见 T9） | — | — |
| T15 | endFail | 死资产 0 播放（§1.2） | 同样装载 0 播放（grep sfx_end_fail 仅 audio.ts:31） | ✅（双方同「死」） | — | 如需省 9KB 传输可摘出（行为无差） |
| T16 | charToggle1/2 | 单模式光标切换（:1867186） | 联机双形态无光标切换（单模式机制未复刻） | ➖（随单模式） | M | 若立项单模式一并接 |
| T17 | portal×4 / lightPusher / clock / slider / freeze / melt / iceSteps×2 / levelMusic_dark | §1.2（森林 0 用例字证 §1.4） | 机制未复刻、音频未装（level2.ts:540 注释「森林未用」） | ➖（大庙开荒随机制，挂账 §3-3 同源） | S/键（机制落地后各 S） | 机制批次逐键补装 AUDIO_GAME+触发点 |
| T18 | 震动反馈 | 按钮点击 navigator.vibrate(50)（settings.vibrate，:1087871） | 无 | ➖（非音频，附带记录） | S | 移动端批次考虑 |

### 3.2 参数面

| 项 | oracle | 我方 | 裁定 |
|---|---|---|---|
| 主音量 | 0.1（:2162271） | 0.1（main.ts:441） | ✅ |
| waterSteps | loop, vol 0.5（:1825313） | loop, vol 0.5（GameScene.ts:1575） | ✅ |
| wind | loop, vol 0.2（:1737642） | loop, vol 0.2（GameScene.ts:1797） | ✅ |
| menuMusic | loop, allowMultiple=false（:1102270） | loop（MenuScene.ts:120；allowMultiple 语义由 isPlaying 守卫等效） | ✅ |
| levelMusic | loop=true（:1889150） | loop（GameScene.ts:398） | ✅ |
| portalLoop 0.3 / clock 偏移起播 / slider 分段 | :1693148/:1729881/:1721486 | 未接线（机制未复刻） | ➖ |
| pan / rate | 0 使用 | 0 使用 | ✅ |
| fx/music 门控语义 | fx=总静音；music 只 gate BGM 起停；one-shot 曲目无门 | fx/music 分轨；one-shot 曲目受 music 门 | ⚠️（已并入 T5/T7） |

## 4. 资产清单对照

oracle 33 键 vs 我方 19 键。我方未装载 14 键：charToggle1、charToggle2（单模式）；clock、freeze、melt、iceSteps_fb、iceSteps_wg、lightPusher、portalOpen、portalLoop、portalClose、portalTransport、slider（森林 0 用例机制）；levelMusic_dark（dark 庙本战役无 scope，森林 temple.json 0 个 dark 关）。反向：我方 0 多余键（bgm_level_speed/bgm_finish_speed=oracle 变体曲对应；bgm_finish_speed 现装载未播=T2）。文件面：我方 `assets/audio/` 磁盘文件与 oracle 33 键的对应文件均存在（音频装载走服务端 `/assets/audio/s/<name>` 流式路由，audio.ts:44）。

## 5. 修复建议汇总（全部留档待立项，本档零代码改动）

| 优先 | 件 | 成本 | 落点 |
|---|---|---|---|
| 1 | T1 UI 点击音（含菜单批补 pusher 键） | S+ | menus/overlays/MenuScene/TempleScene pointerup + audio.ts |
| 2 | T4 退场泄漏（SHUTDOWN 钩子统一停音） | S | GameScene.ts |
| 3 | T2+T3 速度关终局曲（finishKey+补停 _speed） | S×2 | GameScene.ts:1416-1417 |
| 4 | T5+T6+T7 设置门控语义三件（fx 总静音/music 即时/one-shot 免门） | S×3（T7 忠实向需用户取舍） | main.ts/settings/GameScene.ts |
| 5 | T8 fadeOut、T9 空拍、T10 平台实例管理 | S/S/S-M | GameScene.ts/overlays.ts |
| 6 | T17 十二键机制族+T16 单模式族 | 随机制批次 | 大庙开荒时逐键补 |

——审计完毕。证据中间件（oracle sounds.* 全量上下文转储、pristine har 计数比对）在 `TEMP/flashp-audio/`（收尾清理，结论已全部入档）。

## §6 实施记录（2026-10-20，auditfix 槽；先对 0.3.37 HEAD 复核再动码）

### 划销（复核发现已被覆盖）

- **T1 UI 按钮点击音**：0.3.36 C 批（6e395b0）已落——MenuScene Play/?/齿轮 ×3、TempleScene ×3、overlays.stoneButton 全接 `clickSfx`（fx 门控 pusher 键）；menu 态 pusher 键由 MenuScene 驻留期暖装供给（极早点击缺键仅警告，overlays.ts clickSfx 注）。本档 §3.1 T1 结案。
- **T9 endPass 拍数**：0.3.37 D 批（283d976）已落——隐藏行保留空拍音照发、拍链按 oracle delay 实参精确配对（general 700/1400/2100/2800、twoRows 700/1400/1400/2100，overlays.ts 现行码逐字核）。本档 §3.1 T9 结案（§0 计数「触发不一致 9」中相应减 2）。

### 落地（884457a，单 commit 六件）

- **T2**：`finishKey()` 仿 bgmKey 按 temple.json type 选 `bgm_finish_speed`（:1906276 选曲 :1887100 同构）——装载 0 播面补上；playStairsSequence 用之（forest_12=speed 关 e2e won 路径实测无错）。
- **T3**：playStairsSequence 补 `stopByKey("bgm_level_speed")`（oracle :1906226 levelMusic.stop 不分变体）。
- **T4**：GameScene create 注册 `events.once(SHUTDOWN)` 统一 stopByKey（bgm_menu/level/_speed/over/finish/finish_speed + sfx_wind/sfx_door + stopWater()）——Phaser 3 全局 sound manager 泄漏面收口；quit/换关/重开全路径覆盖，restart 的 SHUTDOWN→create 重播链保持（oracle retry 同构）。**实测注意**：0.3.37 A 批已把面板钮即时 stop 改由黑幕 ops 统一停，本钩子与其正交（黑幕 ops sm.stop("Game") 触发本钩子）。
- **T5**：fx=全局总静音——bootPhaser `sound.mute=!fx`（Boot :2162295）+ GameScene create（Level init :1886199）+ SettingsScene fx 钮即时（信号 :2209677）三处同步。
- **T6**：music 开关 Game 态即时——GameScene.applyMusicSetting()（off 停两支关卡 BGM；on 仅 started 进行中且无 BGM 在播时补起）。**有意偏差**：oracle 死亡/终局停曲后再开 music 会重播 levelMusic 与 Over/Finish 叠播（updateMusic 无状态守卫），该 quirk 不移植。
- **T8**：menuMusic 退场 fadeOut(500)+完停替硬停（:1935104；Phaser 3 无 BaseSound.fadeOut，tween volume→0 500ms 等价，完停后 volume 复位 1）。

### 未实施（维持原判）

- **T7 one-shot 曲免门**：bgm_over/bgm_finish 仍受 music 门——忠实向改动需用户取舍（本档 §5 优先 4 注）。
- **T10 平台音实例管理**（S-M）、T17 十二键机制族、T16 单模式族：随机制批。
- settings.ts 头注已改写为本档口径（fx 总静音/music 只 gate BGM/T7 偏差保留声明）。

### 门禁

- tsc 0 / vitest 95/95 / det 48/48 @r0-baseline / build 3.9s / journey pause 9/9 / e2e f01+f12 repeat1 PASS / visual-diff 92.03（音频零画面交集，带内）。
