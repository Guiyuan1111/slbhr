# r28 · 房内字体按关双变体：46/48 关 777.0→209.8KB，教学关零回归（2026-10-22）

> 目标：r27 之后房内字体仍是第一笔 **777.0KB**，但 46/48 关只画 **27 个字**（三块面板字面量＋时钟/结算数字），
> 只有 `forest_01` 与 `forest_bonus_1` 有教学文本（114 字）。
> 做法：沿用 r27 的原地清零口径产两张 PNG（画布 2191×1024、chunks、官方 `font.fnt`、全部坐标不动），
> 按关选键与 URL；教学关的全量字体在关卡定出后补进仍在飞的暖装门，跨变体换关卸旧键。
> 结果：非教学关每进房字体 **777.3→210.1KB（−567.2KB，−73.0%）**；`gameActivePerfMs` Δ＝4g **−501.0ms**、
> fast3g **−1725.3ms**、slow3g **−5488.5ms**（三档三闸门全过）；Menu 四档带内；off +158.5ms 带内不主张；
> 教学关 forest_01 4g **+63.3ms 带内**（最差带 80／臂B 散布 201）⇒ 无回归；roomtext forest_01 **6/6**、
> forest_12 **5/5** 逐字节；房内解码驻留 **Δ0**（两变体同为 8,974,336B），Menu 驻留 **−8.56MB**。

## 〇、面额来源：同一需求集，按关再切一刀

r24 的勘察已经把房内字体的需求集算清：48 关里只有 `forest_01` 与 `forest_bonus_1` 的选中教学层带文本，
其余 46 关只需行钉字面量（暫停／再试一次／返回菜单／继续／游戏结束）与动态数字点（`0123456789:`）。
r27 把 114 字全集压到 777.0KB 后，这 777KB 对 46 关仍是整笔浪费；r28 用同一原地清零口径再产一张
27 字变体，让 46 关只付 **209.8KB**。

与 r24 的货架重排、r27 的全量清零同属一条链，但像素策略完全继承 r27：

| 项 | r27 `font-roomblank` | r28 `font-roombase` |
| --- | --- | --- |
| 需求集 | 114 字（教学∪行钉∪数字） | **27 字**（行钉∪数字，不依赖关卡） |
| 像素口径 | 帧矩形 ∪ 4px ring 逐字节照抄官方，其余清零 | **同左** |
| 坐标 / 幅面 / chunks / fnt | 不动 | **不动** |
| 装载关卡 | 全部 48 关（r27） | **仅 2 个教学关**；其余 46 关装 base |

需求口径只有一份：[scripts/font-subset/room.mjs](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/scripts/font-subset/room.mjs)
（`roomBaseChars` / `roomChars` / `tutorialLevels`），生成器与静态网共用，避免两处各写一份解析。

## 一、实施（`b6d0446`＋`27e857e`＋`5a9e27b`＋`0d0289b`）

生成器 [scripts/font-subset/build-font-blank.mjs](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/scripts/font-subset/build-font-blank.mjs)
从 r27 的单产物扩成“同口径双产物”，`--check` 同时校验两张：

```
node --import tsx scripts/font-subset/build-font-blank.mjs --check
{"variant":"font-roomblank", ... "used":114,"declared":258,"keptTexels":884444,"outBytes":795671}
--check PASS font-roomblank.png sha256=6434548a97d0c02093eb7b3d1a7a1a9551f5671cb1376d1546b8f26517586470
{"variant":"font-roombase", ... "used":27,"declared":258,"keptTexels":189341,"outBytes":214876}
--check PASS font-roombase.png sha256=ebcb004d1f1e340197b38d9afab2daab168ea6f939b5d599c80209df36619653
```

| 项 | 官方 `font.png` | `font-roomblank` | `font-roombase` |
| --- | --- | --- | --- |
| 线上 PNG | 1,638,701B（1600.3KB） | **795,671B（777.0KB，−51.4%）** | **214,876B（209.8KB，−86.9%）** |
| 保留字形 | — | 114 / 258 | **27 / 258** |
| 保留 texel | — | 884,444 | 189,341 |
| 保留墨点 / 清零墨点 | — | 578,199 / 1,321,113 | 122,235 / 2,006,535 |
| 画布 / chunks / fnt | 2191×1024 | 同左 | 同左 |
| 解码驻留 | 8,974,336B（8.56MiB） | 同左 | 同左 |

装载与选择（[BootScene.ts:65](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/BootScene.ts#L65)、
[:78](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/BootScene.ts#L78)）：

- `roomFontKey(levelFile?)`：`levelFile` 缺省时读 `__fwInit.templeEntry.filename`；
  `TUTORIAL_LEVEL_FILES` 命中 ⇒ `font-full`，否则 `font-room`。名单由 `tutorialLevels` 独立回算，静态网钉住。
- `loadRoomFont(load, levelFile?)`：按键选 URL（`font-roomblank.png` / `font-roombase.png`），
  PNG 键与官方 `font.fnt` 一起装；同一时刻两把键互斥，装载前卸掉另一把（否则跨变体换关会叠第二份 8.97MB 解码）。
- [GameScene.ts:336](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/GameScene.ts#L336)
  `GameScene.preload` 声明本关变体；`overlays` 的面板用 `roomFontKey()`。

教学关的**门内回补**（`0d0289b`，[BootScene.ts:249](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/BootScene.ts#L249)、
[main.ts:451](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/main.ts#L451)）：
暖装起步时多半还不知道选关，Menu 不再预声明房内字体；若只靠 `GameScene.preload`，教学关的 777KB 会落到
暖装门**之后**独占管道（对照实测 4g +0.4s，按字节价 slow3g 约 +8s）。因此 `main.ts` 在
`currentTempleEntry` 定出、`await bgWarmSettled()` 之前调用 `warmRoomFontFor(filename)`：目标为教学关且暖装门
仍在飞时，把全量变体补进同一批；非教学关直接返回，暖装已落定/未启动也 no-op，由 `GameScene.preload` 照常兜底。

静态网 [font-roomblank.test.ts](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/__tests__/font-roomblank.test.ts)
**12 例**（r27 的 9 例扩为双产物面）：

- 需求面：基础集恰 27 字、全集恰 114 字、48 关磁盘集合、教学关名单与 `TUTORIAL_LEVEL_FILES` 一致；
- 调用面：GameScene 用 `this.roomFont`、overlays 用 `roomFontKey()`，5 个位图字调用点与 stoneButton 六处显式声明；
- 产物面：两变体保留面（帧∪ring）逐字节等于官方、清零面全 0、幅面/chunks 与官方一致、产品不带自己的 fnt；
- 冻结面：795,671B／214,876B、258 声明、按关 URL 表达式、跨变体卸键、教学关门内回补的调用顺序。

## 二、房内像素门禁 `roomtext --compare`：6/6＋5/5

量具与 r27 相同（双页真联机、Canvas、冻屏＋合成步进；判据是同页同轮**双键**地对官方复制体逐字节）。
末轮产物 `index-W3CG4guI.js` 上：

| 关卡 | 产品键 | 面 | ink | 判据 |
| --- | --- | --- | --- | --- |
| forest_01（教学） | `font-full` | clock-live / clock-initial | 2913 / 2913 | 逐字节 |
| | | tutorial-forest_01 | 80243 | 逐字节 |
| | | gameover / end / pause | 23612 / 5028 / 21006 | 逐字节 |
| forest_12（非教学） | `font-room` | clock-live / clock-initial | 2953 / 2953 | 逐字节 |
| | | gameover / end / pause | 23621 / 5073 / 21006 | 逐字节 |

`roomtext[compare]: ALL PASS`（forest_01 **6/6**、forest_12 **5/5**）。两地时钟 ink 差 40px 来自时限不同
（40s vs 25s）显示的数字不同，与字体无关；gameover/end 的个位数差异同理是关卡数据，不是字形。

**跨变体换关探针**（TEMP 一次性，末轮产物；输出留档在本报告）：

```
forest_01：房内字体键=font-full 解码={"font-full":8974336}
forest_12：房内字体键=font-room 解码={"font-room":8974336}   ← font-full 已卸
PauseMenu BitmapText：暫停@font-room | 再试一次@font-room | 返回菜单@font-room | 继续@font-room
forest_01 二进：房内字体键=font-full 解码={"font-full":8974336} ← font-room 已卸
CROSSLEVEL PASS
```

走的是真实 UI 入口（建房→join→结算回选关树→`onLevelPicked`→再建房），未篡改状态；
任一刻房内字体键恰为 1 把、解码恒为 8,974,336B，同会话没有叠第二份解码。

## 三、四档 A/B/A：面额兑现 43%～59%

臂 A/C＝`983059e`（r27 行为：Menu 暖装为每关预装 777KB 全量），臂 B＝`27e857e`（r28 实现；
`warmRoomFontFor` 尚未加入——该分支对非教学关 `roomFontKey !== FONT_FULL` 直接返回，故不影响森林关读数；
最终产物另以 `load-r28-fix-check-off`（off，forest_12）复核：Menu 无字体、房内仅 210.1KB 基础集）；
`FILES="packages/client/src/scenes/BootScene.ts"`，2 轮/臂，`--net` 四档。
快照 `benchmark/results/load-r28-ab-*`（12 份），分析 `node benchmark/load-ab-bands.mjs <档> r28 gameActivePerfMs menuActivePerfMs`。

| 档 | 臂A→臂B `gameActivePerfMs` | Δ（B̄−mid(Ā,Ĉ)） | 最差带 | 臂B 散布 | 三闸门 | 面额 | 兑现 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4g | 9354 → 8812ms | **−501.0ms** | 315 | 350 | ①②过 ⇒ 可主张（1.6×带） | −1161.6ms | 43.1% |
| fast3g | 21011 → 19307ms | **−1725.3ms** | 98 | 37 | ①②过 ⇒ 可主张（17.6×带） | −2904.1ms | 59.4% |
| slow3g | 64047 → 58557ms | **−5488.5ms** | 100 | 282 | ①②过 ⇒ 可主张（54.9×带） | −9293.0ms | 59.1% |
| off | 2211 → 2149ms | +158.5ms | 663 | 220 | ①不过 ⇒ **不主张**（高漂移档 n=2 <8，③亦不过） | — | — |

- 面额＝567.2KB × r20 价签（4g 2.048／fast3g 5.12／slow3g 16.384 ms/KB）。
- 兑现率明显低于 r25–r27 的 94%～106%，原因是**省下的字节在旧窗口里本来就有并行覆盖**：
  r27 的 777KB 全量字体在暖装门内与其他请求同批并行；r28 把整笔移出门后，留下 210.1KB 基础集
  在关卡 fetch 之后单独装载，暴露度更高。因此面额 1161.6／2904.1／9293.0ms 只能当上界，
  实测 −501／−1725／−5489ms 才是产品口径的收益。
- `Menu activeMs` 四档全部落在带内（4g −14.8／fast3g −23.8／slow3g −22.3／off +162.0ms；
  最差带 85/128/145/214）——Menu 阻塞批 1727KB／18 条两臂恒定，这是本轮自带的对照组。

字节窗口（`load-ab-bands` 两轮均值）：

| 档 | 臂A/C 到落定 | 臂B 到落定 | Δ | 房内窗 A/C→B |
| --- | --- | --- | --- | --- |
| fast3g | 3654KB / 56 条 | **3087KB / 55 条** | **−567KB / −1 条** | 1927→**1360KB** / 38→37 条 |
| slow3g | 3654KB / 56 条 | **3087KB / 55 条** | **−567KB / −1 条** | 1927→**1360KB** / 38→37 条 |
| 4g | 3654KB / 56 条 | 3529KB / 55 条 | −125KB / −1 条 | 1927→1803KB / 38→37 条 |
| off | 4319/58、4433/60 条 | 3752/57 条 | 窗口不稳定 | 不主张 |

- Menu 窗四档两臂恒为 **1727KB／18 条**（Δ0）。两臂的 777.3KB 字体都不在 Menu 快照内——
  旧臂它在暖装批里尚未完成，新臂根本不声明；所以 Menu 里程碑不受影响。
- fast3g/slow3g 的 **−567.2KB 就是字体本身**（777.3→210.1KB），请求数 −1 是旧臂里一条
  `font.fnt` 的 0KB 内存缓存复验（换键后不再出现），不是新的往返。
- 4g 的快照只显示 −125KB：臂 B 的 `CharAssetsPlay.png`（442.7KB）在 Game active 前已下完，
  而臂 A 的同一条仍在飞（快照里 0KB）。这是**同一笔资源提前到位**，不是新增负载；
  把字体直读差与稳定档窗口合起来看，真实账仍是 −567.2KB。
- `真双载=0`、页错=0，四档十二份快照一致。

**教学关回归对照**（forest_01，4g，`FILES="packages/client/src/scenes/BootScene.ts packages/client/src/main.ts"`，
臂 A/C＝`983059e`，臂 B＝工作树含 `0d0289b`；快照 `load-r28f01-ab-4g-*`）：

| 指标 | 臂A→臂B | Δ | 最差带 | 臂B 散布 | 结论 |
| --- | --- | --- | --- | --- | --- |
| `gameActivePerfMs` | 9294 → 9364ms | **+63.3ms** | 80 | 201 | 带内 ⇒ 无回归 |
| `menuActiveMs` | 4238 → 4255ms | +5.0ms | 97 | 110 | 带内 |
| 到落定字节 | 3655KB / 57 条 | 3655KB / 57 条 | — | — | **完全一致** |

教学关的装载窗口与 r27 等价（全量字体仍在暖装门内并行），这正是 `warmRoomFontFor` 要保住的性质。

## 四、驻留与卸键

量具＝`benchmark/perf-resident.mjs`（r28 快照 `resident-r28-forest_12.json`，forest_12；r27 基线为 forest_01）：

| 状态 | r27 臂B 纹理MB | r28 纹理MB | 说明 |
| --- | --- | --- | --- |
| menu（暖装落定） | 84.00（含 font-full 8.56） | **75.45（无房内字体）** | **−8.56MB**：Menu 不再预装任何房内字体 |
| game（开局静止） | 93.39（font-full 8.56） | 93.43（font-room 8.56） | 两变体解码同为 2191×1024×4；Δ+0.04 属同臂噪声 |
| temple 离房后 | 98.94 | 98.94 | 字体仍驻留（只有跨变体装载才卸旧键） |

- Menu 的 8.56MB 差是纯来源差：两臂 Menu 纹理源除字体外逐项相同（mech 16／popup 16／chars-play 10.75／
  ground 8／temple 8／chars 5.07…）；r27 在每个关卡的暖装里都装全量，r28 不装。
- game 的 `audioMB` 11.44 vs r27 的 21.81 **不是本轮差异**：forest_12 与 forest_01 属 r16 的不同音轨族，
  与字体无关；纹理面才是本轮的对照口径。
- `heapGCMB` 23.1 vs 23.3、`canvasTexMB` 9.42（r27 未列该字段）——无新增常驻对象。
- 教学关进房后仍是全量 777KB 字体（8.56MB 解码）；非教学关进房是基础变体（同尺寸解码画布）。
  即**驻留不变、线上字节少 567KB**；驻留的收益发生在 Menu 段（不预装），不是房内。

## 五、门禁（末轮套件）

串行执行（浏览器类步骤互斥，vitest 不与 regression 抢 `zz_probe` 夹具）：21 步 **exit=0**；
两个生成器步骤以本题文档要求的 `node --import tsx` 复跑后 **PASS**（首跑漏了 loader，见下）。

| 步骤 | 读数 |
| --- | --- |
| typecheck | 0 错 |
| `build-slim-atlas --check`（`--import tsx`） | 三张 Slim PNG 与重建逐字节（152.9／229.5／249.3KB，合计 −455.7KB） |
| `split-char-atlas --check` | 六件逐字节（53 帧 152.1KB ＋ 7 帧 28.3KB ＋ 182 帧 442.4KB） |
| `reflow-prephase --check` | png 字节一致 ✓ fnt 字节一致 ✓ |
| `build-font-blank --check`（`--import tsx`） | 两变体 PASS：`6434548a…`／`ebcb004d…`（795,671B／214,876B） |
| build | ✓ built in 4.59s；`index-W3CG4guI.js` 102.06KB（gzip 34.82KB） |
| vitest | **22 文件／243 用例**全过（r27 240 ＋ 本轮 3） |
| det（`perf-determinism --compare r32`） | **48/48** 关位级一致（合计 2.7s） |
| `roomtext --compare` forest_01／forest_12 | **6/6**／**5/5** 面逐字节 |
| `prephase-canvas` | **5/5** 态逐字节 |
| `domskin` | 4/4 逐字节 |
| `audiofamily`（off） | 22 项 ✓ |
| `charsplay`（off） | 21 项 ✓ |
| `treebake` | 9/9 金样一致 |
| `groundcache` | 6/6 |
| `journey` refresh／wonrefresh／deathretry／rejoin | 3/3 · **6/6** · **4/4** · 3/3 |
| `route` forest_01／forest_12 | won=true，winAt 39498／13462ms |
| `regression`（zz_probe walkin-doors，`--expect-win`） | won=true errors=0 sync=0 缺帧警告=0 |

- 首跑 `slim-check` 与 `fontblank-check` 以裸 `node` 调用，因生成器动态 import `.ts` 报
  `ERR_UNKNOWN_FILE_EXTENSION`；按生成器头注的 `node --import tsx` 复跑即 PASS。这是门禁脚本调用错误，
  不是产品或产物缺陷；最终套件的产品面全部通过。
- 像素面是“坐标不动＋滤波邻域原样”构造兑现的：canvas 五态与 domskin 四态**逐字节**，det 48 关**位级**。
- 玩法面零改动：route 双关 won、regression 零错零缺帧，与 r27 的 39517／13459ms 同量级。

**量具判读注记**：perf-load 的 `assertThrottleActive` 在 round2 会被缓存命中污染 TTFB 中位数
（一份 299KB 的 bundle 显示 4–7ms，而同源 cache-busted 80KB 请求实测 700–830ms，证明 CDP 4g 节流仍在）。
本轮没有改量具，遇到守卫未过时**重跑该臂**，以保持与历轮快照可比。另一个边界效应是“到落定”快照把
Game active 之前刚好下完的可选资源算进窗口（4g 的 chars-play 442.7KB），故字节账以稳定档的
逐请求差（−567.2KB）为准，不拿 4g 的窗口总量作面额。

## 六、剩余面额与下一轮

r28 之后房内窗（fast3g/slow3g 口径 **1360KB／37 条**）的大件构成：

| 字节 | 条目 | 状态 / 归属 |
| --- | --- | --- |
| 442.4KB | `CharAssetsPlay.png` | r23 已出门，仍在房内窗 |
| 249.3KB | `PopupAssetsSlim.png` | r26 已清零；结算板拆张未做 |
| 229.5KB | `TempleAssetsSlim.png` | r26 已清零 |
| **209.8KB** | `font-roombase.png` | **r28 新基线**（46 关）；教学关为 777.0KB |
| 152.9KB | `MechAssetsSlim.png` | r26 已清零；按关装载未做 |
| 93.0KB | `GroundAssets.png` | — |

下一轮候选（按可做性排序）：

1. **Popup 结算板拆张**：249.3KB 的结算图集在进房早期并不需要，按 r23 chars-play / r25 终局曲同一模式
   延后到首次打开结算板；上限约 249KB，风险与 r25 同型。
2. **MechAssets 按关装载**：清零后只剩 152.9KB，48 关 24 种子集；需要“关卡确定后装载”的机制，
   而 r28 的 `warmRoomFontFor` 正好提供了同一条“关卡定出后补进暖装门”的通道，可复用。
3. **MenuAssets 同类清零**：191.5KB，菜单段最后一笔非必要图集；`Button` 名是动态拼接，
   先把消费口径钉死再做。
4. `font-roombase` 再压：只剩 27 字，重排/降采样仍被 r24 的相位结论挡住，收益也小，暂不做。
5. 教学关的 777KB 全量字体：只有 2/48 关，且已回到门内并行装载；除非教学文本需求集能进一步收缩，
   否则不再动。

素材再编码（任务 #42）仍是用户保留项，未经裁决不动。
