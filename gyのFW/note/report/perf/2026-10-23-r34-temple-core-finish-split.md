# r34：Temple 图集核心/结算拆张（落定门 247.4→74.6KB，房内驻留 −1.66MiB）

> 日期：2026-10-23 · 版本线：0.3.43 · 量具：`benchmark/perf-load.mjs`（四档 A/B/A／换臂台）、
> `benchmark/load-ab-bands.mjs`（三闸门）、`benchmark/perf-resident.mjs`（驻留）、
> [`scripts/split-temple-atlas.mjs`](../../../scripts/split-temple-atlas.mjs) `--check`（复现性）、
> [`temple-split.test.ts`](../../../packages/client/src/__tests__/temple-split.test.ts)（10 例静态网）。
>
> 结果：60 帧的 `TempleAssetsSlim.png`（1024×2048，解码 8.00MiB）按"什么时候必须到位"拆成
> **Core**（14 真帧＋46 别名，786×876，解码 2.63MiB，随落定门）与 **Finish**（42 帧开门动画，
> 992×982，解码 3.72MiB，房间可玩后取）。`forest_01` 的**落定门线上 247,358→74,566B
> （−172,792B，−69.9%）**，单关总量 247,358→204,327B（−43,031B，−17.4%）。
> `gameActivePerfMs` Δ＝fast3g **−754.5ms**（最差带 196 的 3.8×，面额兑现 87.3%）、
> slow3g **−2519.8ms**（带 172 的 14.6×，兑现 91.1%）；4g −372.3／off −155.7 带内不主张。
> 驻留：Menu／temple／离房后 **−5.37MiB**，Game **−1.66MiB**；`heapGCMB` 逐项不变。
> 件2 修掉了实施首测暴露的 fast3g **+875.8ms** 回归（暖装门提前落定后 chars-play 预热与
> 门后房内字体抢管道），修复后同一档转为 **−754.5ms**。

## 一、为什么拆：42 帧开门动画只在踩门那一刻上屏

r26 清零后 `TempleAssetsSlim.png` 仍是一张 1024×2048 的画布，60 帧里 **56 帧是真帧**——
其中 **42 帧是两扇门的开门动画**（`FinishBoy/Girl0001..0021`），只有玩家踩门才播放；
背景、时钟、门静帧、选关大厅装饰等 **14 帧**才是从选关大厅起就随时可能要画的。
但整张图集跟着 `loadGameAtlases` 进落定门：选关大厅与进房关键路径都要为 42 帧付
**8.00MiB 解码 + 235.0KB PNG + 12.3KB JSON**。

r32/r33 已证明"保留帧重打包"能同时省线上字节与驻留（Popup 16.00→2.88MiB、
机关变体 2048²→1×1–1033×1319）。本轮把同一容器口径套到 Temple 上，拆点取
**"门动画第一次可能需要上屏的时刻"**：门静帧在房间建成时就要画，开门动画在踩门时才有。

## 二、实施

| 件 | 内容 |
|---|---|
| 生成器 | [`split-temple-atlas.mjs`](../../../scripts/split-temple-atlas.mjs) 从官方 `TempleAssetsSlim.png` + 官方 JSON 重打包两张图：帧像素逐字节搬运（源矩形是官方 `frame`），目标坐标由确定性货架打包重算（`MAX_W=1024`、`GUT=2`、`PAD=1`）。拆点由帧名正则定：`Finish(Boy|Girl)\d{4}` 且非 `0000` ⇒ Finish，其余 ⇒ Core。`--check` 重建到 TEMP 与在库四件逐字节比对。 |
| Core | 14 真帧（背景/前景/时钟/两扇门 0000/选关大厅背景/装饰）＋ **46 个 `mainAlias` 别名帧**，画布 **786×876**（解码 2.63MiB）。JSON 仍声明官方**全部 60 个帧名、顺序不变**：42 个 Finish 帧与 4 个零消费帧别名到同一块 4×4 全透明像素。漏改的按名取帧只会画透明，不会落进 Phaser 的 `__BASE`（整张图集铺满屏）。 |
| Finish | 42 真帧（两扇门 0001..0021），画布 **992×982**（解码 3.72MiB），帧名/顺序/`sourceSize` 照抄官方。 |
| 装载点 | Core 仍走 r26 的落定门（`BootScene.loadGameAtlases`＋`TempleScene.preload` 兜底），URL 换成 `TempleAssetsCore.*`。Finish 由 `GameScene.create` 的 `kickTempleFinish()` 在 chars-play 之后、结算图集之前单独声明（`loadTempleFinish`），已缓存时零请求；同会话换关/重开命中缓存。 |
| 降级 | 门精灵始终在 Core 的 `FinishBoy/Girl0000` 静帧上；`applyDoorFrame` 在 Finish 未到位时回落 0000 并返回 false，快照下一拍补帧——迟到/失败只影响开门动画，不影响门的存在。 |
| 释放 | `main.ts leaveToMenu` 在 `GameScene.stop` 之后调 `GameScene.releaseTempleFinish`，3.72MiB 不留在选关大厅；换关 advance 不释放（仍在房内，重进同关零请求）。 |
| 静态网 | [`temple-split.test.ts`](../../../packages/client/src/__tests__/temple-split.test.ts) 10 例：60 帧名/顺序/真帧-别名集合、逐帧像素与官方同矩形相等、别名块唯一且环带透明、四周 1px 环带、画布与字节预算（Core ≤旧画布 34%、Finish ≤47%、两件 PNG 合计 <Slim）、落定门只装 Core、kick 顺序、降级、释放连线、生成器 `--check`。 |

产物总账（`forest_01` 实取；括号内为 `w·h·4` 解码）：

| 产物 | 画布 | PNG | JSON | 解码 | 装载时机 |
|---|---:|---:|---:|---:|---|
| `TempleAssetsSlim`（旧） | 1024×2048 | 235,021B | 12,337B | 8.00MiB | 落定门 |
| `TempleAssetsCore`（新） | 786×876 | 65,217B | 9,349B | 2.63MiB | 落定门 |
| `TempleAssetsFinish`（新） | 992×982 | 121,925B | 7,836B | 3.72MiB | create 后 |
| 新两件合计 | — | **187,142B** | 17,185B | 6.34MiB | — |

两件 PNG 合计比 Slim 轻 **47,879B**；Core 画布为旧画布的 **32.8%**（−67.2%），
两张合计为旧画布的 **79.3%**（−20.7%）——线上与驻留的收益主要来自"把 42 帧挪出关键路径"，
而不是把像素总量压到最低。

## 三、字节账：落定门 −172.8KB，单关总量 −43.0KB

- **落定门**：旧 = Slim PNG 235,021B＋官方 JSON 12,337B ＝ **247,358B**；
  新 = Core PNG 65,217B＋Core JSON 9,349B ＝ **74,566B**
  ⇒ **−172,792B（−168.74KB，−69.9%）**。这是 `gameActive` 之前少付的字节。
- **单关总量**：Finish 两件 129,761B 改在 create 之后取，旧总量 247,358B → 新 204,327B
  ⇒ **−43,031B（−42.02KB，−17.4%）**。
- **稳定档逐请求窗口**（fast3g／slow3g，两轮均值，A/B/C 三臂）：
  Menu 窗 **1619KB／18 条**三臂一致（Temple 不参与 Menu，天然阴性对照）；
  房内窗 **1595KB／38 条 → 1427KB／35–36 条**，真双载＝0、页错＝0。
  该窗口同时包含落定门内的 Core 与 create 后的 Finish/chars-play 位移，只作守恒核对；
  "落定门 −172.8KB"以上面的逐文件字节账为准。
- **4g**：臂 A 房内窗 1816KB／38 条（chars-play 竞态，按 r30 先例不引用 A 的字节窗），
  臂 B 1427KB／35 条、臂 C 1595KB／38 条；off 档字节窗在 1711–3647KB 间摆动，同样只用时间指标。

## 四、四档 A/B/A（2 轮/臂；资产轴换臂，JS bundle 逐字节相同）

`ab-assets.sh` 只换 `dist/assets/atlasses/Temples/forest/` 的四件：臂 A/C＝r34 前的
Slim PNG＋官方 JSON（ERA_A `54a9641` 代），臂 B＝Core/Finish；三臂入口指纹相同，收尾已装回并复算。
off 档另跑 r34e/f/g/h 四条链池化到 **n=8/臂**。
`load-ab-bands.mjs <tier> <era> menuActiveMs gameActivePerfMs`；
Δ＝B̄−mid(Ā,Ĉ)，三闸门：①Δ 超最差带 ②Δ 超臂 B 散布 ③高漂移档 n≥8。

| 档 | gameActive Ā/B̄/Ĉ | Δ | 最差带 | 臂B散布 | Δ/带 | 判定 | 面额 | 兑现率 |
|---|---|---:|---:|---:|---:|---|---:|---:|
| slow3g | 56963/54448/56972 | **−2519.8ms** | 172 | 137 | 14.6× | ①②过 ⇒ 可主张 | 2764.7ms | 91.1% |
| fast3g | 18704/17984/18773 | **−754.5ms** | 196 | 102 | 3.8× | ①②过 ⇒ 可主张 | 864.0ms | 87.3% |
| 4g | 9015/8445/8620 | −372.3ms | 842 | 158 | 0.4× | 带内 ⇒ 不算差异 | 345.6ms | — |
| off（n=8） | 2053/1867/1993 | −155.7ms | 638 | 524 | 0.2× | 带内 ⇒ 不算差异 | — | — |

`menuActiveMs`：fast3g −15.5（最差带 252／臂B 169）、slow3g +17.5（139／166）、
4g +20.5（157／120）、off −1.6（323／362）——四档全带内，符合"Temple 不进 Menu"的预期。

面额按 r20 价签（1KB＝1024B）：168.74KB×16.384ms/KB＝2764.7ms、×5.12＝864.0ms、×2.048＝345.6ms。
两个可主张档分别兑现 **91.1%／87.3%**；4g 的面额被 842ms 的最差带吞掉，不主张。

### 件2：fast3g 首测回归 +875.8ms 的机制与修复

首版实现（只拆张、不动预热时序）在 fast3g 测到 **+875.8ms**（Ĉ/Ā 18781/18770、B̄ 19651，
最差带 125、臂B 散布 146，7.0×）。`cold.resourcesAfterGame` 的时间线给出机制：

- Core 变小后暖装门**早于关卡定出**就 complete（≈12.97s，关卡 ≈13.00s 才定），
  `warmRoomFontFor` 已无活可干；教学关房内字体（777.3KB）于是落到 `GameScene.preload`，
  在淡出之后才开始取 → 13.630–19.579s。
- 同一拍暖装 complete 的 r23 预热把 **chars-play 442.7KB** 踢进刚刚空下来的队列
  （12.985–17.216s）——它与房内字体共用同一条 1.6Mbps 管道，重叠约 4.2s。
- 落定门因此被推到 **19.724s**（对照臂 18.8s）。

r23 的设计注释本就写着"快进房路径由 `GameScene.kickCharsPlay` 兜底"，所以修法是让门内预热让路：
`BootScene` 增加 `entryInFlight` 标志（`markEntryInFlight()` 由 `main.ts enterGame` 在点击后置位，
覆盖正常开局与刷新回座；暖装 complete 时**消费一次**），进房在途时跳过 chars-play 预缓存。
修复后 fast3g 同链：字体 13.593–17.886s、落定门 **18.035s**，`charsPlayInWindow=none`
（create 之后再取）。同一 A/B/A 由 +875.8ms 转为 **−754.5ms**。

## 五、驻留：Menu/temple/离房后 −5.37MiB，Game −1.66MiB

`perf-resident` 资产轴 A/B/A（`forest_01`，三臂各 28–34 次采样）：

| 态 | 臂A（旧） | 臂B（新） | 臂C（旧） | Δ(B−A/C 中点) |
|---|---:|---:|---:|---:|
| Menu（暖装落定） | 46.33MB | 40.96MB | 46.33MB | **−5.37MiB** |
| temple 首入／重进／三进 | 61.26／61.26／61.26MB | 55.89／55.89／55.89MB | 61.26／61.26／61.26MB | **−5.37MiB** |
| Game（开局静止） | 66.80MB | 65.14MB | 66.80MB | **−1.66MiB** |
| temple 离房后 | 72.34MB | 66.97MB | 72.34MB | **−5.37MiB** |

- 8.00−2.63＝5.37；Game 态多了 Finish 3.72（8.00−(2.63+3.72)＝1.65，四舍五入 1.66）。
- 离房后回到 −5.37：`releaseTempleFinish` 确实把 3.72MiB 还给了选关大厅；temple 三态同值，
  说明 Finish 不随 Temple 场景驻留。
- `heapGCMB` 三臂逐项相同（11.6／26.9／27.0／23.0／28.7）：纹理是 GPU 资源，驻留按
  `g.textures.list` 的 `w·h·4` 计，不进 JS 堆。

## 六、几何与像素等价

- **逐帧**：Core 的 14 个真帧、Finish 的 42 个真帧都与官方 Slim 的同矩形裁剪**逐字节相等**；
  帧名、顺序、`sourceSize`、`trimmed=false` 原样保留，只改 `frame.x/y` 与 `meta.size/image`。
- **别名**：46 个别名共用一个 4×4 全透明块，块外 1px 环带 alpha 0；测试独立回算真帧/别名集合。
- **采样**：客户端未开 `pixelArt`（LINEAR），每帧四周 1px 透明环吸收双线性外扩；两张画布
  均按 `MAX_W=1024` 货架打包，帧不重叠、不越界。
- **行为门禁**：roomtext forest_01/forest_12 六面逐字节；route 双关真实通关；regression
  `zz_probe walkin-doors` 零错零缺帧；charsplay 零缺帧警告；运行时探针 5/5（Core 60 帧／
  Finish 42 帧、门精灵切到 `FinishBoy0002`、FORCE_DOORS 通关、离房 Finish 释放且 Core 保留）。

## 七、末轮门禁

| 项 | 结果 |
|---|---|
| typecheck | 0 错 |
| `split-temple-atlas --check` | 四件逐字节（Core 14＋46 别名／Finish 42 帧） |
| `build-slim-atlas --check` | 四张 Slim 与重建逐字节 |
| `split-char-atlas --check` | 六件逐字节（53+7+182 帧） |
| `split-popup-finish --check` | 六件逐字节（29/29/28 帧） |
| `split-mech-atlas --check` | 24 变体逐字节（PNG 1072.5KB＋JSON 107.4KB，解码 41.99MiB） |
| `shrink-popup-main --check` | 两件逐字节（1086×696） |
| `reflow-prephase --check` | png／fnt 字节一致 |
| `build-font-blank --check` | 两变体 PASS（`6434548a…`／`ebcb004d…`） |
| `build-dom-skin --check` | 字节一致 |
| build | `index-ELteDsHK.js` 105.34KB／gzip 35.96KB（r33 104.82／35.72KB） |
| vitest | **26 文件／286 例**（temple-split 10 例） |
| det `--compare r32` | 48/48 位级一致 |
| roomtext forest_01／forest_12 | 6/6／5/5 面逐字节 |
| prephase-canvas | 5/5 连跑两次 |
| domskin | 4/4（wide×3＋narrow） |
| audiofamily（off） | ALL PASS |
| charsplay（off） | ALL PASS（窗口期良性降级 2 条） |
| treebake | ALL PASS（9/9） |
| groundcache | ALL PASS（6/6） |
| journey refresh／wonrefresh／deathretry／rejoin | 3/3 · 6/6 · 4/4 · 3/3 |
| route forest_01／forest_12 | 各 1 轮 won=true（winAt 39,507／13,466ms） |
| regression（zz_probe walkin-doors） | won=true，errors=0，sync=0，缺帧=0 |
| 运行时探针（TEMP/r34/probe.mjs） | 5/5 PASS |

42 份 load 快照（84 轮）与 3 份 resident 快照全部页错 0、真双载 0。

门禁维护：r34 在 `GameScene.ts` 新增的代码使房内字体行钉整体后移，`room.mjs` 的
时钟两钉 1593→1628、1631→1666，`font-roomblank.test.ts` 的 PARAMETERISED 1493→1528
（内容逐行核对未变）；首次 `build-font-blank --check` 因此报红，更新后两变体 PASS。

## 八、结论

- **收益**：落定门线上 **−172.8KB（−69.9%）**，其中 slow3g **−2519.8ms**、fast3g **−754.5ms**
  （面额兑现 91.1%／87.3%）；4g 的 −372ms 在 842ms 带内不主张，Menu 段四档零代价。
  单关总量 **−43.0KB（−17.4%）**。驻留：Menu/temple/离房后 **−5.37MiB**、Game **−1.66MiB**。
- **兼容**：Core 声明官方全部 60 个帧名，帧名/顺序/像素/`sourceSize` 不变；Finish 未到位时门
  回落 0000 静帧并在下一拍补帧；离房释放、换关保留、重进命中；286 例单测、48 关确定性、
  房内文本像素、真实通关、四个旅程与回归全绿。
- **代价**：Finish 是 create 之后的新请求（121.9KB／3.72MiB 解码），弱网下开门动画可能晚数拍
  （画面停在静帧，不影响可玩）；Core JSON 多出 46 条别名；新增一个生成器与 10 例静态网。
  件2 的 `entryInFlight` 让进房在途时门内不再预热 chars-play，走 create 后的原兜底路径。
- **下一轮候选**：换关 advance 链的纹理重解码/驻留入账（Finish 目前在换关间保留，可量
  "是否该在换关前释放"）；MenuAssets 1024² 画布随 29 帧缩小（驻留侧，先做位图字相位核验）；
  删除/降级已被 Mini 取代的 `PopupAssetsSlim.png`。素材再编码（任务 #42）仍是用户保留项，
  未经裁决不动。
