# r35：菜单图集画布重打包（1024²→753×577，驻留 −2.34MiB，slow3g Menu −145.5ms）

> 日期：2026-10-23 · 版本线：0.3.43 · 量具：`benchmark/perf-load.mjs`（四档 A/B/A／换臂台）、
> `benchmark/load-ab-bands.mjs`（三闸门）、`benchmark/perf-resident.mjs`（驻留）、
> [`scripts/shrink-menu-main.mjs`](../../../scripts/shrink-menu-main.mjs) `--check`（复现性）、
> [`menu-mini.test.ts`](../../../packages/client/src/__tests__/menu-mini.test.ts)（12 例静态网）。
>
> 结果：`MenuAssetsSlim.png` 是 1024²（解码 4.00MiB），29 个 keep 帧的像素面积只有 362,483px
> （34.6%）。本轮把 29 帧连同帧外 1px 真实邻域重打包到 **753×577（解码 1.66MiB）**，31 个清零帧
> 别名到一块 4×4 透明区，官方 **60 个帧名与顺序全部保留**。PNG **84,297→75,022B（−9,275B，
> −11.0%）**、JSON **12,551→10,172B（−2,379B，−19.0%）**；Menu 窗线上 **1619→1610KB／18 条不变**
> （PNG −9.0KiB 直传、JSON gzip 后 −0.2KiB）。`menuActiveMs` Δ＝slow3g **−145.5ms**
> （最差带 110 的 1.3×，线上面额 150.7ms 的 **96.5%**）；fast3g −30.3／4g −46.8／off +38.2（n=8）
> 均带内不主张。驻留 Menu **40.96→38.61MB**、temple **55.89→53.54MB**、Game **65.14→62.80MB**、
> 离房后 **66.97→64.63MB**，全态 **−2.34MiB**；`heapGCMB` 与 `audioMB` 逐项不变。

## 一、为什么还剩这张画布：清零后仍按 1024² 付解码

r31 把 60 帧里零消费的 31 帧原地清零，线上从 195,797B 降到 84,297B，但**画布没动**：
`MenuAssets` 在 Boot 阻塞批里按 1024×1024 解码 4.00MiB，之后在 Menu/temple/settings/credits/HUD
五个态里一直驻留。真正会画的只有 29 帧（r31 口径）：

| 场景 | 帧 | 数量 |
|---|---|---:|
| TempleScene 星碑 | `Diamond*/DiamondSpeed*/DiamondPuzzle*0000-0003` | 12 |
| TempleScene 树底座 | 四种 `*_Bkg_Mask0000`（含零消费的 `DiamondDark` 掩膜） | 4 |
| Temple/设置/弹窗按钮与 HUD | `BackButton*`、`Lock0000`、`NewSign0000`、`MusicButton*`、`FxButton*`、`Navy0000`、`SettingsButton0002/0003`、`StoneButton*` | 13 |

这 29 帧的像素矩形合计 **362,483px**，只占 1024² 的 34.6%。它们多数按非整数比例缩放
（星碑底座、Lock、NewSign，未开 `pixelArt`），且树烘焙直接从源图按 `cutX/cutY` 取
`*_Bkg_Mask0000` 的像素做浮雕——所以不能只搬帧矩形，**帧外邻域也必须照抄**。

## 二、实施

| 件 | 内容 |
|---|---|
| 生成器 | [`shrink-menu-main.mjs`](../../../scripts/shrink-menu-main.mjs)：帧像素从 `MenuAssetsSlim.png` 的官方矩形逐字节搬运；每帧向外带 **1px 真实邻域**（越界按 CLAMP_TO_EDGE 取源边缘），区块间 1px 透明 GAP、画布四周 1px PAD；确定性货架打包（高/宽/名排序，候选宽度含 `sqrt(area)` 的 1/1.1/1.25 倍与 256–1024，取面积最小）得到 **753×577**。`--check` 重建到 TEMP 与在库两件逐字节比对。 |
| 别名 | 31 个清零帧全部指向打包区下方一块 **4×4 全透明区**，`sourceSize` 照抄官方；JSON 声明官方全部 **60 个帧名、顺序不变**。漏改的按名取帧只会画透明，不会落进 Phaser 的 `__BASE`（整张图集铺满屏）。 |
| 几何前提 | 生成器断言官方 60 帧全部 `trimmed:false`、`rotated:false`、`spriteSourceSize` 偏移 0；否则拒绝重打包。 |
| 装载 | `BootScene` 的 `ATLAS_MENU_PNG/JSON` 改指 `MenuAssetsMini.*`，仍是菜单图集唯一装载点（[`BootScene.ts`](../../../packages/client/src/scenes/BootScene.ts)）。 |
| 静态网 | [`menu-mini.test.ts`](../../../packages/client/src/__tests__/menu-mini.test.ts) 12 例：60 帧名/顺序、29 真帧+31 别名、真帧几何照抄、逐帧像素与 Slim 同矩形逐字节相等、每帧 1px 邻域与 Slim 的 CLAMP 采样逐字节相等、区块外全透明/两两不相交、别名块环带透明、画布与字节预算、Boot 唯一装载点、树烘焙仍按 JSON 的 `cutX/cutY` 取源图、keep 口径与 `needs.mjs` 一致。 |
| 门禁换样 | 前场画布与树烘焙两块金样按换样协议重钉：`prephase-canvas` 的 manifest 记录 `--reason`；[`treebake.mjs`](../../../scripts/e2e/treebake.mjs) 新增“`--save` 必须带 `--reason`”，理由进 fixture。原因与像素账见 §六。 |

产物总账：

| 产物 | 画布 | PNG | JSON | 解码 | 线上（Menu 窗实测） |
|---|---:|---:|---:|---:|---:|
| `MenuAssetsSlim`（旧） | 1024×1024 | 84,297B | 12,551B | 4.00MiB | 1619KB（PNG 82.6KiB＋JSON 1.3KiB） |
| `MenuAssetsMini`（新） | 753×577 | 75,022B | 10,172B | 1.66MiB | 1610KB（PNG 73.6KiB＋JSON 1.1KiB） |
| Δ | 434,481px（41.4%） | **−9,275B（−11.0%）** | **−2,379B（−19.0%）** | **−2.34MiB（−58.6%）** | **−9KB／18 条不变** |

## 三、字节账：文件 −11.4KB，线上 Menu 窗 −9.2KB

- **文件账**：PNG 84,297→75,022B（−9,275B）、JSON 12,551→10,172B（−2,379B），合计
  **96,848→85,194B（−11,654B＝−11.38KiB，−12.0%）**。
- **线上账**：JSON 在服务端 gzip 后从 1.3KiB 降到 1.1KiB（解码面 12.3→9.9KiB），PNG 直传
  −9.0KiB，故 **Menu 窗 1619→1610KB（−9.2KB）**、请求数 18 条不变。按 r20 价签，9.2KB
  在 slow3g 值 **150.7ms**（PNG 9.0×16.384＝148.4 ＋ JSON 0.2×16.384＝3.3）。
- **窗口守恒**：稳定档房内窗三臂 **1427KB／35 条**（slow3g 36 条），真双载 0、页错 0；
  4g 臂 C 与 off 臂 B/C 出现 chars-play 竞态（35→43/40/41 条），按 r30 先例只作守恒核对，
  不引用其字节差。MenuAssets 只在 Boot 装载，房内窗与落定窗口不受本轮影响。

## 四、四档 A/B/A（2 轮/臂；资产轴换臂，JS bundle 逐字节相同）

`ab-assets.sh` 只换 `dist/assets/atlasses/` 的两件：臂 A/C＝r35 前的 Slim PNG＋官方 JSON
（重命名为 Mini 文件名），臂 B＝Mini；三臂入口指纹同为 `51d53f434926c7d6`，收尾已装回并复算。
off 档另跑 r35b/c/d 三条链池化到 **n=8/臂**。
`load-ab-bands.mjs <tier> <era> menuActiveMs gameActivePerfMs`；
Δ＝B̄−mid(Ā,Ĉ)，三闸门：①Δ 超最差带 ②Δ 超臂 B 散布 ③高漂移档 n≥8。

| 档 | menuActive Ā/B̄/Ĉ | Δ | 最差带 | 臂B散布 | Δ/带 | 判定 | 面额 | 兑现率 |
|---|---|---:|---:|---:|---:|---|---:|---:|
| slow3g | 28685/28495/28596 | **−145.5ms** | 110 | 86 | 1.3× | ①②过 ⇒ 可主张 | 150.7ms | 96.5% |
| fast3g | 9251/9239/9288 | −30.3ms | 91 | 214 | 0.3× | 带内 ⇒ 不算差异 | 47.1ms | — |
| 4g | 4032/3979/4020 | −46.8ms | 112 | 210 | 0.4× | 带内 ⇒ 不算差异 | 18.8ms | — |
| off（n=8） | 615/617/542 | +38.2ms | 352 | 472 | 0.1× | 带内 ⇒ 不算差异 | — | — |

`gameActivePerfMs`：slow3g −127.5（最差带 182／臂B 25）、fast3g −49.3（156／224）、
4g +7.0（957／200）、off +86.0（789／760）——四档全带内，符合“Menu 段收益会被后续网络
等待吸收”的预期：本轮只动了 Menu 段 9.2KB，房内关键路径上没有新增/减少字节。

slow3g 是唯一可主张档：Δ 同时超过最差带（110）与臂 B 自身散布（86），且兑现线上面额的
96.5%；fast3g 的 −30.3ms 与面额 47.1ms 同向，但被 91ms 的带吞掉，按口径不主张。

## 五、驻留：全态 −2.34MiB

`perf-resident` 资产轴 A/B/A（`forest_01`，三臂各 28–43 次采样）：

| 态 | 臂A（旧） | 臂B（新） | 臂C（旧） | Δ(B−A/C 中点) |
|---|---:|---:|---:|---:|
| Menu（暖装落定） | 40.96MB | 38.61MB | 40.96MB | **−2.35MiB** |
| temple 首入／重进／三进 | 55.89／55.89／55.89MB | 53.54／53.54／53.54MB | 55.89／55.89／55.89MB | **−2.35MiB** |
| Game（开局静止） | 65.14MB | 62.80MB | 65.14MB | **−2.34MiB** |
| temple 离房后 | 66.97MB | 64.63MB | 66.97MB | **−2.34MiB** |

- 4.00−1.66＝2.34；Menu/temple 两态读 2.35 是 `texMB` 按源 `w·h·4` 逐张累加后的 0.01 舍入。
- `heapGCMB` 三臂逐项相同（11.6／26.9／26.9／27.0／23.1／28.7，臂C Game 23.0 为同一读数带）；
  `audioMB`（6.82／21.81）、树结果位图（10.24MB）也逐项不变——省下的是菜单图集的解码画布。
- 该收益与使用场景无关：MenuAssets 在 Boot 装载后不释放，故五个态同步 −2.34MiB。

## 六、像素等价与采样相位

- **帧矩形**：29 个真帧与 Slim 同坐标裁剪**逐字节相等**；`w/h/sourceSize/trimmed/rotated` 照抄官方。
- **帧外邻域**：每帧 1px 环带与“Slim 按 CLAMP_TO_EDGE 采样”的值逐字节相等（测试逐像素回算），
  覆盖 LINEAR 缩放时的双线性外扩；区块两两不相交，区块外全透明。
- **别名**：31 个别名共用一个 4×4 透明块，块外 1px 环带 alpha 0。
- **前场画布**（`prephase-canvas`，五态）：menu 逐字节相同；temple/temple-numbers/settings/credits
  分别 **1042/849/117/6** 个像素差，**99.2% 为 Δ1、最大 Δ15、平面区 0**，全部落在渐变/抗锯齿边。
  两笔来源已用对照实验钉死：① 1024²(POT)→753×577(NPOT) 使 Phaser 的 wrap 从 REPEAT 变
  CLAMP_TO_EDGE，旧基线里贴边帧的 wrap 溢出条纹消失（POT 补白对照把 settings 117→13）；
  ② 帧在画布内的新位置改变 GPU 插值量化，帧边双线性权重差 1LSB。按换样协议
  `--save --reason` 刷新基线，理由写进 manifest 的 provenance。
- **树烘焙**（`treebake`）：mask 帧矩形与 1px 邻域都逐字节不变，但 Chromium 的 Canvas2D
  `drawImage` 缩小采样**不只取决于 src 矩形**——同一帧同邻域放到另一张图（画布尺寸/绝对坐标/
  远处内容任一不同）后，0.6/0.72 缩放的首段 mask 绘制会差 **554px**（baseScale 1.2；Δ≤85，
  全部落在 mask 矩形内，矩形外 0）；baseScale 1.0 的层差 **44px**。再经 Bevel 的
  `alpha>0.5→1` 阈值放大为三层 canvas 上 **1409px（tree-big，Δ≤128）** 与
  **102px（tree-all，Δ≤2）**，tree-done 不受影响。对照实验：POT 补白、整体平移、改画布尺寸、
  远处加色块都会改变采样结果，而 0.5 缩放逐位精确——任何重打包都无法位级复现旧图。
  故按“有意换金样”重钉，理由进 fixture；语义不变量（帧/邻域字节、别名、布局）由静态网另行断言。

## 七、末轮门禁

| 项 | 结果 |
|---|---|
| typecheck | 0 错 |
| `shrink-menu-main --check` | 两件逐字节（753×577，29 真帧／31 别名） |
| 其余九项 `--check` | `split-temple-atlas`／`build-slim-atlas`／`split-char-atlas`／`split-popup-finish`／`split-mech-atlas`／`shrink-popup-main`／`reflow-prephase`／`build-font-blank`／`build-dom-skin` 全部逐字节 |
| build | `index-ClQVBqls.js` 105,351B／gzip 35,952B（r34 105.34KB／35.96KB） |
| vitest | **27 文件／298 例**（menu-mini 12 例） |
| prephase-canvas | 5/5 连跑两次（换样后） |
| treebake | ALL PASS（9/9，换样后） |
| roomtext forest_01／forest_12 | 6/6／5/5 面逐字节 |
| domskin | 4/4（wide×3＋narrow） |
| audiofamily（off） | ALL PASS |
| charsplay（off） | ALL PASS（窗口期良性降级 2 条） |
| groundcache | ALL PASS（6/6） |
| journey refresh／wonrefresh／deathretry／rejoin | 3/3 · 6/6 · 4/4 · 3/3 |
| route forest_01／forest_12 | 各 1 轮 won=true（winAt 39,524／12,968ms） |
| regression（zz_probe walkin-doors） | won=true，errors=0，sync=0，缺帧=0 |
| det `--compare r32` | 48/48 位级一致 |
| 快照 | 21 份 load（42 轮）＋3 份 resident（690 次采样）：页错 0、真双载 0 |

门禁维护：`treebake.mjs` 的 `--save` 从此强制 `--reason`（缺省直接报错），fixture meta 记下
本轮换样理由；prephase 的 manifest provenance 同步到 `HEAD=8704d4c`、入口 chunk
`index-ClQVBqls.js=51d53f434926c7d6`。这两处是“像素基线随有意换图而变化”的登记，不是放宽门禁。

## 八、结论

- **收益**：菜单图集解码 **4.00→1.66MiB（−2.34MiB，−58.6%）**，五个使用态同步下降；
  线上 Menu 窗 **−9.2KB（−9KB/1619KB）**，slow3g `menuActiveMs` **−145.5ms**（最差带 110 的 1.3×，
  面额兑现 96.5%）；fast3g/4g/off 的负差在带内，不主张。`gameActivePerfMs` 四档无代价。
- **兼容**：官方 60 个帧名/顺序、29 个真帧的像素矩形与 1px 邻域、`sourceSize`、`trimmed=false`
  全部不变；清零帧别名到透明块；298 例单测、48 关确定性、前场五态、树烘焙、房内文本像素、
  真实通关、四个旅程与回归全绿。唯一可见差异是 Chromium 缩小采样的 1LSB 级相位，已按
  换样协议登记。
- **代价**：753×577 为 NPOT，Phaser wrap 由 REPEAT 变 CLAMP_TO_EDGE；帧外 1px 邻域与打包间隙使
  画布面积（434,481px）大于 keep 像素面积（362,483px）；两块像素金样重钉；树烘焙 0.16%
  的像素受采样相位影响（树本身内容未变）。
- **下一轮候选**：换关 advance 链的纹理重解码/驻留入账（Temple Finish 目前在换关间保留，可量
  “是否该在换关前释放”）；删除/降级已被 Mini 取代的 `PopupAssetsSlim.png`；菜单图集 GPU 上传
  时机的量测。素材再编码（任务 #42）仍是用户保留项，未经裁决不动。
