# r39：结算星碑动画跨变体重绑（修复 `sourceSize` 空引用与「继续」死锁）

> 日期：2026-10-23 · 版本线：0.3.43 · 量具：[`benchmark/perf-advance.mjs`](../../../benchmark/perf-advance.mjs)
> （沿用 r36 武装判胜＋结算窗静网门＋三窗拆账，未改口径）、新增专项门禁
> [`scripts/e2e/finish-anims.mjs`](../../../scripts/e2e/finish-anims.mjs)。
>
> 结果：r29 把结算图集按关卡类型拆成三张后，`finish_stone_*` 动画键长期存活于全局
> AnimationManager，而换关会卸掉另外两种变体的纹理——动画里缓存的 `Frame` 随之被销毁。
> `buildSeq` 的 `exists` 幂等卫又让重建被跳过，于是「speed/puzzle 关之后的 general 结算板」
> 星碑 `play()` 每帧抛 `Cannot read properties of null (reading 'sourceSize')`，
> `finalAt` 回调中断、「继续」**永不启用**——这是可复现的真玩软锁，不是噪声页错。
> 本轮在开板时先摘掉三张变体的全部 9 个星碑键再重建；专项门禁从 **2/8（92 条/1.8s、
> 整场 1311 条页错、继续点不动）** 变为 **8/8（3 帧、0 页错、forest_04→forest_05 换关成功）**。
> 5 次换关的 off 档 A/B 中页错 **125/152/103/96 → 0/0**，链内最大帧隔
> **1234.2/1558.5/1079.8/1109.3ms → 199.9/195.4ms**。修复前误差风暴污染时序读数，
> 故另做双臂各 2 会话×3 次换关的控制组（两臂 0 页错）：换关→可玩 A **1125.8ms** /
> B **1098.3ms（−27.4ms，−2.4%）**，落在散布内，**不主张时序收益**。
> 代价：客户端 **+99B 原始 / +39B gzip-9**（Node 同口径），无资源与服务端改动。

## 一、问题与影响面

触发序列（`data/forest/temple.json` 实测）：

| 关卡 | 类型 | 结算面板 | 结果 |
|---|---|---|---|
| forest_01 | general | #1 | 正常 |
| forest_02 | general | #2 | 正常（general 纹理未换） |
| forest_03 | **speed** | #3 | 正常（speed 纹理在场） |
| forest_04 | general | **#4** | **星碑动画抛错、继续禁用** |
| forest_05 | general | **#5** | **同左**（stale 键仍指向已卸 general 纹理的 Frame） |
| forest_06 | speed | #6 | 正常（speed 键在 #3 已重建） |

规则不是"每块 board 都坏"，而是**当前变体的动画键最后一次注册时所绑的纹理，后来被
`loadPopupFinish` 卸掉过**。因此它命中所有 `speed/puzzle → general` 的换关，也命中
`won` 相位刷新回座重开 EndMenu（[`journey wonrefresh`](../../../scripts/e2e/journey.mjs) 覆盖）。
用户看到的是：星碑停在首帧、右下「继续」永远灰色，只能刷新页面——战役 r36/r37/r38 里
反复出现的 `sourceSize` 页错随换关次数增长，根因就是这条链，不是渲染或量具噪声。

## 二、失效链（逐环取码）

1. **r29 起纹理按变体拆张，换关卸旧张**：`loadPopupFinish` 在变体变化时
   `textures.remove` 另外两张（[`BootScene.ts:225-232`](../../../packages/client/src/scenes/BootScene.ts#L225)）。
2. **动画在注册时把帧名解析成 Frame 对象**：`AnimationManager.create` → `new Animation`
   （[`AnimationManager.js:513`](../../../node_modules/phaser/src/animations/AnimationManager.js#L513)），
   构造器 `this.frames = this.getFrames(...)`（[`Animation.js:80`](../../../node_modules/phaser/src/animations/Animation.js#L80)），
   每个名字当场解析成 `textureManager.getFrame(key, frame)`
   （[`Animation.js:454`](../../../node_modules/phaser/src/animations/Animation.js#L454)）。
3. **卸纹理即销毁 Frame**：`TextureManager.remove` → `Texture.destroy` → `Frame.destroy`
   把 `this.data = null`（[`Frame.js:824-829`](../../../node_modules/phaser/src/textures/Frame.js#L824)）。
   动画键仍持有旧 Frame 对象。
4. **幂等卫挡住重建**：`buildSeq` 的 `if (a.exists(key)) return;` 见到旧键就直接跳过；
   开板时虽已重新装回同名纹理，动画仍绑在旧 Frame 上。
5. **起播即抛，且每帧重试**：`stone.play(stoneKey)` → `startAnimation` → `handleStart`
   （[`AnimationState.js:1035`](../../../node_modules/phaser/src/animations/AnimationState.js#L1035)）
   → `setCurrentFrame` → `setSizeToFrame` → `Frame.realWidth` 读 `this.data.sourceSize`。
   `hasStarted = true` 写在 `setCurrentFrame` **之后**（同文件 :1041-1044），异常使其永远停在
   `false`；`update` 在 `!hasStarted` 时每帧重试 `handleStart`
   （[`AnimationState.js:1519-1525`](../../../node_modules/phaser/src/animations/AnimationState.js#L1519)）。
6. **回调中断、「继续」死锁**：`finalAt` 里 `stone.play(stoneKey)` 与 `enabled = true` 相邻
   （[`overlays.ts:346-347`](../../../packages/client/src/scenes/overlays.ts#L346)），异常发生在
   `play` 内，`enabled` 永不置真；按钮的 `disabled` 谓词为 `() => !enabled || leaving`
   （[`overlays.ts:365`](../../../packages/client/src/scenes/overlays.ts#L365)）。

**探针实测**（r38 构建，5 次换关会话，`TEMP/r39-probe/animprobe.log`）：120 条捕获全部同型——
`anim=finish_stone_2`、帧纹理 `popup-finish-general`、帧名 `FinishStone0008`、
`animFrameDestroyed=true`，相邻时间戳差 **16/16/17ms**；首栈：
`realWidth → setSizeToFrame → setCurrentFrame → handleStart → startAnimation → play → callback`。

## 三、修复

两处改动，均在 `EndMenu.create` 路径上，无动画键改名：

1. **每次注册前先摘旧键**（[`BootScene.ts:529-547`](../../../packages/client/src/scenes/BootScene.ts#L529)）：
   `buildFinishAnims` 先遍历三张变体的 1–3 星共 9 个键，`scene.anims.remove(stale)`，再走
   `textures.exists(key)` 守卫与 `seq(...)` 重建。摘三张而非只摘当前张：另外两张的键同样可能
   指向已卸纹理，且开销是 9 次字符串查找，低到不值得分情况。
2. **无条件调用**（[`overlays.ts:276-280`](../../../packages/client/src/scenes/overlays.ts#L276)）：
   `EndMenu.create` 不再以 `uiAtlas === finishKey` 为前置；纹理缺失时 `buildFinishAnims`
   也会先摘掉 stale 键再静默返回，板子退回主图集的同名空帧、星碑不播动画，但**不会**拿旧
   Frame 去播，「继续」照常启用。若跳过调用，正是 r39 的失效链。

静态网同步：[`popup-finish.test.ts`](../../../packages/client/src/__tests__/popup-finish.test.ts)
把唯一调用点断言改成无条件调用，并新增"摘键在纹理守卫之前、覆盖 3 变体×3 星"的断言；
`room.mjs`／`font-roomblank.test.ts` 的房内行钉随 overlays 净增 2 行同步（321/323、357、381、388、399）。

## 四、专项门禁：面板真的在播、按钮真的能点

[`scripts/e2e/finish-anims.mjs`](../../../scripts/e2e/finish-anims.mjs)：双人入房 → 调试开门＋武装判胜，
连过 forest_01→05（面板类型 general/general/speed/**general**/general），在第 4 块板递归扫
EndMenu 显示列表找 `finish_stone_*` 精灵，断言 `hasStarted`、帧对象未销毁、1.8s 内 ≥2 个不同帧、
窗内 pageerror=0；随后找到板内 (541,502) 的 `StoneButton0000`，发 pointerdown/pointerup 走**真实的
disabled 谓词**，断言换关到 forest_05；整场页错必须为 0。

| 判据 | r38 构建（pre-fix） | r39 构建（post-fix） |
|---|---|---|
| general 变体（speed 之后重载） | ✓ `finish_stone_2` | ✓ `finish_stone_2` |
| 星碑动画已起播 | ✗ `hasStarted=false` | ✓ `true` |
| 动画帧对象未销毁 | ✗ | ✓ `true` |
| 观察窗出现 ≥2 帧 | ✗ 仅 `FinishStone0008` | ✓ 3 帧（0008/0011/0014） |
| 第 4 块板 1.8s 窗页错 | ✗ **92 条** | ✓ **0** |
| 找到「继续」并触发 | ✓ | ✓ |
| 「继续」可用并换关 | ✗ 点不动 | ✓ forest_04→forest_05 |
| 整场页错 | ✗ **1311 条** | ✓ **0** |
| 汇总 | **2/8 FAIL** | **8/8 PASS** |

证据文件：[pre-fix](../../../benchmark/results/finish-anims-r39-prefix.json)（含 8 项判据、页错计数
与首两条原文）、[post-fix](../../../benchmark/results/finish-anims-r39-postfix.json)；最终构建复跑
`scripts/e2e/out/finish-anims.json` 仍为 8/8、页错 0，帧序 0008/0012/0014（观察窗相位不同）。

## 五、基准：页错与掉帧是实锤，时序列不作主张

**臂**：A = r38 构建 `index-DEytQHYW.js`（109,118B），B = r39 构建 `index-De_FGfdb.js`（109,217B）；
`off` 档、每会话 5 次换关、A 4 会话 / B 2 会话。快照与逐会话数据在
[`benchmark/results/advance-r39-off-*.json`](../../../benchmark/results/)。

| 会话 | 臂 | 页错（条） | 链内最大帧隔（ms） | firstRender 均值（ms） |
|---|---|---:|---:|---:|
| off-a1 | A | 125 | 1234.2 | 1014.3 |
| off-a2 | A | 152 | 1558.5 | 1016.4 |
| off-a3 | A | 103 | 1079.8 | 1042.9 |
| off-a4 | A | 96 | 1109.3 | 1053.8 |
| off-b1 | B | **0** | **199.9** | 1128.2 |
| off-b2 | B | **0** | **195.4** | 1227.6 |

A 的 96–152 条页错与 1.08–1.56s 单次帧隔，正是面板 #4/#5 每帧抛错＋重试造成的误差风暴；
b 臂的帧隔回到 195–200ms 的平台期。**A 的换关→可玩均值不能拿来和 B 比**：错误风暴横跨
`callAt` 采样点，A 的读数被"卡住时的低值/恢复时的尖峰"双向污染（同一臂内 853.7–1236.9ms 的散布
就是证据）。

**控制组**（两臂各 2 会话×3 次换关，只到 speed 面板，所有会话页错 0；`advance-r39-ctl-*.json`）：

| 臂 | 逐 run `firstRenderMs`（6 个） | 合并均值 | 最大帧隔 |
|---|---|---:|---:|
| A（r38） | 1057.7 / 1209.5 / 1011.2 / 1158.5 / 1162.7 / 1155.0 | **1125.8ms** | 159.1ms |
| B（r39） | 1129.9 / 1049.0 / 979.8 / 1105.6 / 1108.7 / 1217.0 | **1098.3ms** | 198.2ms |

Δ = **−27.4ms（−2.4%）**，小于两臂内散布（A 极差 198.3ms、B 极差 237.2ms），判为噪声；
B 没有可测的换关变慢。**本轮不主张时序收益**——修的是正确性（软锁＋页错风暴），顺带把
A 的假尖峰从读数里移除。

**字节与驻留**：两臂链内 **0KB**、结算窗 73.5KB、建场后 49.2KB、纹理驻留 **58.9MB** 逐项相同；
修复只动内存中的动画键，不产生网络与显存变化。

## 六、兼容、安全与失效模式

- **无资源/服务端/vendor 改动**；三张结算图集、帧名、动画键名（`finish_stone_{1,2,3}`、
  `finish_stone_{speed,puzzle}_{1,2,3}`）逐字不变。
- **纹理缺失时**：先摘 stale 键再返回；星碑用主图集 `ATLAS_POPUP` 的同名空帧（官方 JSON 声明、
  透明但不会落 `__BASE`），不播动画、「继续」可用。代价是极端装载失败时没有星碑动画，
  但不会软锁——这是有意选择的降级方向。
- **为何不"换纹理时清动画"**：`loadPopupFinish` 在 GameScene 预取与 EndMenu.preload 两处都会跑，
  且动画可能在别的场景/面板里被引用；把重绑收敛在唯一消费点（`EndMenu.create`）更窄。
  同理，9 个键全摘是幂等的，重复开板不会累积。
- **Canvas 路径**未触碰；结算板像素由 `roomtext` 的 end/gameover 面逐字节复核。

## 七、末轮门禁

| 项 | 结果 |
|---|---|
| typecheck | 0 错 |
| build | `index-De_FGfdb.js` 109,217B（gzip-9 36,897B）／`index.html` 26,141B（sha1 e4a66b37） |
| vitest | **30 文件／322 例**全绿（含本轮静态网更新） |
| 十一项 `--check` | asset-versions 51 条、四 Slim、Temple 四件、Char 六件、PopupFinish 六件、24 机关变体、Menu/Popup 主图集、prephase 重排、字体 blank、DOM skin 全部逐字节 |
| det `--compare r0-baseline` | **48/48 位级一致** |
| fixtures | **6/6 PASS**（01/main·oracle-gold、04、12、26/main·oracle-gold） |
| prephase-canvas | 5/5 逐字节 |
| roomtext forest_01／forest_12 | 6/6／5/5 面逐字节（含 end/gameover） |
| domskin | 4/4 |
| audiofamily／charsplay（off） | ALL PASS／ALL PASS（窗口期良性降级 2 条） |
| treebake／groundcache | ALL PASS／ALL PASS |
| journey journey／refresh／wonrefresh／deathretry／rejoin | 7/7 · 3/3 · 6/6 · 4/4 · 3/3 |
| route forest_01／forest_12 | 各 1 轮 won=true（winAt 39,508／12,978ms） |
| regression（zz_probe walkin-doors） | won=true，errors=0，sync=0，缺帧=0 |
| tilesprite 像素门禁 | forest_01 Game 1/1＋Temple 1/1；forest_24 8/8；私有画布全 1×1，ndiff 全 0 |
| **finish-anims（本轮新增）** | **8/8，0 页错，继续换关 forest_04→forest_05** |

## 八、结论与下一轮

- **修复**：结算星碑动画在纹理变体切换后重绑；软锁与 `sourceSize` 页错风暴同时消失。
  这是 r36/r37/r38 报告中"随换关次数增长"的页错的根因，属于基线既有缺陷，非 r38 引入。
- **代价**：客户端 +99B 原始／+39B gzip-9；开板时多 9 次动画键查找与删除，不可测。
- **量化**：专项门禁 2/8→8/8；页错 1311→0（门禁）／96–152→0（5 换关会话）；
  最大帧隔 1.08–1.56s→195–200ms；控制组时序 −27.4ms 在噪声内，不主张。
- **下一轮候选**：Temple Finish 保留/释放再账；4g 档小于 100ms 的收益需更多轮次；
  `loadPopupFinish` 的纹理移除与动画注册是否进一步收敛到同一生命周期钩子（本轮先以最小面修复）。
- 素材再编码（任务 #42）仍是用户保留项，未经裁决不动。
