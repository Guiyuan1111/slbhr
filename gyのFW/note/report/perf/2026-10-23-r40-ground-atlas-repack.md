# r40：地面图集按消费面重打包（落定门 PNG −62.4KB，驻留 −6.59MiB）

> 日期：2026-10-23 · 版本线：0.3.43 · 量具：`benchmark/perf-load.mjs`（四档 A/B/A／换臂台）、
> `benchmark/load-ab-bands.mjs`（三闸门）、`benchmark/perf-resident.mjs`（驻留）、
> `benchmark/perf-advance.mjs`（换关链）、
> [`scripts/shrink-ground-atlas.mjs`](../../../scripts/shrink-ground-atlas.mjs) `--check`（复现性）、
> [`ground-atlas-shrink.test.ts`](../../../packages/client/src/__tests__/ground-atlas-shrink.test.ts)（8 例静态网）。
>
> 结果：官方 `GroundAssets`（1024×2048，343 帧，解码 8.00MiB）里**只有 151 帧有消费点**。
> 按消费面重打包成 `GroundAssetsPlay`（634×584，151 真帧＋192 透明别名，解码 1.41MiB）：
> 落定门线上 PNG **93.0→30.6KB**、JSON **2.5→2.0KB**（合计 **−62.9KB**），房内窗口
> **3038→2975KB（−63KB）**；驻留四态 **−6.58～−6.59MB**；`gameActivePerfMs` slow3g
> **−1226.5ms**、fast3g **−357.8ms**（三闸门全过），4g after-click **−539.0ms**（过闸门但带很宽，
> 只作旁证）；4g 里程碑 gamePerf −573.0ms 因臂 B 散布 585 不足判定，advance 换关时序散布大、不主张。

## 一、为什么重打包：343 帧里 192 帧永不上屏

`GroundAssets.png` 是 1024×2048 的 8.00MiB 解码画布，从选关大厅进房时随 `loadGameAtlases`
进落定门批。官方 JSON 声明 343 个帧名，但复刻的地面链路只按名取其中 **151 帧**：

| 类别 | 帧数 | 消费点 |
|---|---:|---|
| 液体三段循环 | **135** | `WaterBox`／`FireBox`／`GreenBox` × 裸／`Left`／`Right` × `0000..0014`，`BootScene.buildGameAnims` 注册 9 条 `liquid_*` 动画（30fps） |
| 冰膜静帧 | **3** | `IceBox0000`／`IceBoxLeft0000`／`IceBoxRight0000`，`GameScene.buildLiquids` 建隐藏覆盖层 |
| 地面烘焙蒙版 | **13** | `MaskBox00000..00003`、`MaskBox1..9`＋`0000`，`GameScene.bakeGroundCanvas` 逐格盖章 |

其余 **192 帧**（`BeamDust`／`Dust` 等原版特效）在复刻里没有消费点，只贡献解码面积。
r32/r33/r34 已证明"保留帧重打包"能同时省线上字节与驻留；本轮的对象不是"晚点上屏"的帧，
而是**永远不会上屏**的帧——收益完全来自画布面积，不需要新增加载时机或降级分支。

## 二、实施

| 件 | 内容 |
|---|---|
| 生成器 | [`shrink-ground-atlas.mjs`](../../../scripts/shrink-ground-atlas.mjs)：从官方 PNG＋JSON 取 151 个真帧，按确定性货架打包（`GUT=2`、`MAX_W` 由投影宽度决定）重排到 **634×584**；源矩形是官方 `frame`，逐像素搬运。192 个清零帧与"零消费"帧全部写成 `mainAlias` 别名，指向打包区下方一块 **4×4 全透明区 (2,578)**。JSON 仍声明官方**全部 343 个帧名、顺序不变**、`sourceSize`/`trimmed=false`/`rotated=false` 照抄。`--check` 重建到 TEMP 与在库两件逐字节比对。 |
| 装载 | `BootScene` 的纹理键 `ground` 不变，只把 URL 换成 `GroundAssetsPlay.png`／`.json`（`ATLAS_GROUND_PNG`／`ATLAS_GROUND_JSON`）。液体动画键、冰膜 `setFrame`、烘焙蒙版的帧名字面量全部不动——消费面零改动。 |
| 消费点 | `GameScene.bakeGroundCanvas` 只加注释说明蒙版帧来自同一 `ATLAS_GROUND` 键；`drawImage` 的 1:1 整像素拷贝与原图集等价。 |
| 静态网 | [`ground-atlas-shrink.test.ts`](../../../packages/client/src/__tests__/ground-atlas-shrink.test.ts) 8 例：独立回算真帧/别名集合、343 帧名与顺序、逐帧像素与元数据、别名块唯一且环带透明、画布与字节预算、Boot 装载连线、运行时代码零 `GroundAssets.*` 引用、消费点字面量、生成器 `--check`。 |

**为什么这次不需要 MenuAssetsMini 那样的 1px 邻域**：地面帧的所有消费者都是 **1:1 整数像素**绘制——
液体精灵 `scale=1`、位置 `col*32+16+32`（整数，origin 0.5），烘焙是
`drawImage(cutX,cutY,w,h, dx,dy,w,h)` 的整像素拷贝。整数对齐时像素中心逐一对准纹素中心，
LINEAR 采样不会越出帧矩形；r24 的 canvas 相位探针在 `scale=1` 下 114 个采样点 0 差。
`GUT=2` 只隔离相邻帧，保证任何越界采样读到透明，而不是邻居。

**兼容性**：634×584 不是 2 的幂。WebGL1/2 对 NPOT 纹理在 `CLAMP_TO_EDGE`＋无 mipmap 下均合法，
Phaser 默认正是这套采样状态；Canvas 渲染器不受限制。旧官方两件仍留在 `assets/` 作为生成器输入
与旧客户端兜底，新客户端运行时不请求（静态网与四档快照双重确认）。

## 三、字节与驻留账

| 产物 | 画布 | PNG | JSON | 合计 | 解码 | 帧 |
|---|---:|---:|---:|---:|---:|---|
| `GroundAssets`（官方，保留） | 1024×2048 | 94,956B | 67,889B | 162,845B | 8.00MiB | 343 |
| `GroundAssetsPlay`（新） | 634×584 | 31,009B | 54,193B | 85,202B | 1.41MiB | 151 真帧＋192 别名 |
| Δ | — | −63,947B | −13,696B | **−77,643B（−47.7%）** | **−6.59MiB（−82.4%）** | 帧名不变 |

- **落定门线上**（gzip 后传输，两轮 A/C 完全一致）：`GroundAssets.png` **93.0→30.6KB**、
  `GroundAssets.json` **2.5→2.0KB**，合计 **−62.9KB**。PNG 本身已压缩，服务端按原始字节传输，
  所以线上差（−62.4KB）与文件差（−63,947B）基本相等；JSON 经 gzip 后差被压到 −0.5KB。
- **房内窗口**：A/C **3038KB／53–54 条** → B **2975KB／54 条**（**−63KB**）；
  `真双载=0`、`页错=0`。Menu 窗三臂同为 **1611KB／18 条**——地面图集在 Menu 之后才请求，
  天然阴性对照。
- **客户端 JS**：A `index-De_FGfdb.js` 109,217B／gzip-9 **36,897B**／brotli-11 31,869B；
  B `index-CFDkosYR.js` 109,237B／gzip **36,904B**／brotli 31,910B
  ⇒ **+20B raw／+7B gzip／+41B brotli**（Node zlib，level 9／quality 11；与 r39 报告同口径）。
  增量来自注释后的四处常量与装载行，无新逻辑。

## 四、四档 A/B/A（2 轮/臂；资产轴换臂）

`perf-load` 一臂两轮，臂 A/C＝官方图集（r39 构建 `index-De_FGfdb`），臂 B＝Play 图集。
`load-ab-bands.mjs r40 <tier> menuActiveMs gameActivePerfMs clickPerfMs gameActiveAfterClickMs`；
Δ＝B̄−mid(Ā,Ĉ)，三闸门：①Δ 超同臂最差带 ②Δ 超臂 B 自身散布 ③高漂移档（off）n≥8。

| 档 | gameActivePerfMs Ā/B̄/Ĉ | Δ | 最差带 | 臂B散布 | Δ/带 | 判定 |
|---|---|---:|---:|---:|---:|---|
| slow3g | 54161/52976/54244 | **−1226.5ms** | 202 | 8 | 6.1× | ①②过 ⇒ 可主张 |
| fast3g | 17902/17594/18001 | **−357.8ms** | 139 | 41 | 2.6× | ①②过 ⇒ 可主张 |
| 4g | 8557/7894/8376 | −573.0ms | 405 | 585 | 1.4× | ②不过 ⇒ 不足判定 |
| off（n=2） | 1852/1762/1932 | −129.8ms | 474 | 352 | 0.3× | 带内 ⇒ 不算差异 |

跨度 `gameActiveAfterClickMs`（点击锚在里程碑上，只作旁证）：

| 档 | Ā/B̄/Ĉ | Δ | 最差带 | 臂B散布 | 判定 |
|---|---|---:|---:|---:|---|
| slow3g | 25545/24444/25541 | **−1099.0ms** | 62 | 158 | ①②过 ⇒ 可主张 |
| fast3g | 8576/8231/8648 | **−381.0ms** | 183 | 218 | ①②过 ⇒ 可主张 |
| 4g | 4556/3856/4234 | −539.0ms | 513 | 489 | ①②过，带接近 Δ ⇒ 只作旁证 |
| off（n=2） | 1170/1028/1163 | −139.0ms | 137 | 109 | ①②过但③不过 ⇒ 不主张 |

- `clickPerfMs` 四档全在带内（slow3g −127.5、fast3g +23.3、4g −34.0、off +9.3），
  符合"图集在点击之后才取"的预期。
- `menuActiveMs` 四档也全在带内，**但 slow3g 的 −93.0ms 恰好过①②**（带 51／散布 42）。
  `GroundAssets` 在 Menu 之后才发起请求，机制上不可能影响 Menu 里程碑，判为噪声、不主张。
- 面额核对：63KB×16.384ms/KB＝1032ms（slow3g）、×5.12＝322.6ms（fast3g）。实测
  −1226.5／−357.8 略高于纯字节面额，合理：少的不只是传输，还有 6.59MiB 的解码与纹理上传。
  4g 的面额 129ms 被 513ms 的最差带吞掉，只保留 after-click 旁证。

**advance 换关链**（每臂 2 会话×5 次换关，off／4g／fast3g／slow3g，共 24 份快照）：
`firstRenderMs` 会话均值为 off A 1137.9／1167.9、B 1097.7／1128.8、A′ 1099.7／1113.0；
4g A 1290.3／1303.8、B 1277.1／1345.7、A′ 1434.0／1453.8；fast3g A 1269.0／1567.0、
B 1379.6／1301.1、A′ 1317.0／1484.0；slow3g A 1659.1／1352.5、B 1297.6／1387.5、
A′ 1332.5／1345.3。臂内散布与被换关卡的内容差异（机关变体有无）同量级，**换关时序不主张**
（r36 起的既定口径）。可强主张的是逐次驻留：同一关的 `texMB` 每次采样都恰好低 **6.59MB**；
链内 `chainKB=0`、结算窗 `73.5KB`（fast3g/slow3g 552.6KB）、离房后 `49.2KB` 与 r39 相同；
24/24 会话页错 0。

## 五、驻留：四态 −6.58～−6.59MB

`perf-resident`（`forest_01`，A/B/A 三臂，每臂 27–68 次采样）：

| 态 | 臂A（官方） | 臂B（Play） | 臂C（官方） | Δ(B−A/C 中点) |
|---|---:|---:|---:|---:|
| Menu（暖装落定） | 38.61MB | 32.03MB | 38.61MB | **−6.58MB** |
| temple 首入／重进／三进 | 48.86／48.86／48.86MB | 42.27／42.27／42.27MB | 48.86／48.86／48.86MB | **−6.59MB** |
| Game（开局静止） | 58.38MB | 51.79MB | 58.38MB | **−6.59MB** |
| temple 离房后 | 59.94MB | 53.35MB | 59.94MB | **−6.59MB** |

- 8.00−1.41＝6.59；Menu 的 6.58 是显示取整，逐源账里 `ground` 由 8.00 变 1.41。
- 四态差值一致，说明 Play 图集与官方图集的**生命周期相同**（同一装载点、同一释放路径），
  只是画布小了；temple 三态同值也排除了"重进时额外缓存"。
- `heapGCMB` 三臂逐项同量级（A 11.6／22.2／22.3／18.7／24.0，B 11.7／22.2／22.3／18.6／24.0，
  A′ 11.7／22.2／22.3／18.6／24.0）；`audioMB` 6.82／21.81、`canvasTexMB` 0／10.24／4.96、
  `tree` 账逐项不变——纹理是 GPU 资源，不进 JS 堆，本轮没有连带收益或代价。

## 六、像素等价与失效模式

- **逐帧**：151 个真帧都按官方 `frame` 矩形裁剪、逐字节搬到新画布，测试独立回读两边的 RGBA
  并逐帧断言相等；帧名、顺序、`sourceSize`、`trimmed=false`、`rotated=false` 原样保留。
- **别名**：192 个清零帧共用一个 4×4 全透明块，块外 1px 环带 alpha 0；测试断言所有别名
  `frame` 坐标一致、`rotated=false`、`sourceSize` 与官方相同，且真帧/别名集合由源码字面量
  独立回算（不是从产物反推）。`BeamDust0000`／`BeamDust0001`／`Dust0000` 的零消费断言是无条件的：
  新增消费点必须同时改生成器，否则测试直接报红。
- **采样**：客户端未开 `pixelArt`（LINEAR）。地面消费链全是 1:1 整数像素，`GUT=2` 的帧间隔离
  足以吸收采样外扩；不需要 MenuAssetsMini 的 1px 邻域。
- **失效模式**：坐标搬错 ⇒ 画透明或错位（roomtext/route 像素门禁报红）；别名块被污染 ⇒ 隐藏帧
  重新露出来；少搬一个消费帧 ⇒ 液体/烘焙缺帧。三者都静默，所以静态网必须锁"消费点字面量"
  与"逐帧像素"，运行时再用整关烘焙哈希兜底。
- **运行时等价**：两臂的整关烘焙结果 FNV-1a 均为 **`7440bf84`**；B 源 634×584、344 个纹理键、
  0 缺帧/0 帧元数据不匹配；抽样 5 条液体动画各 15 帧，全部解析在 `ground` 键上。
- **降级方向**：JSON 保留全部 343 个帧名，且**首帧 `BeamDust0000` 就是透明别名**。Phaser 3.90
  的 `Texture.get` 缺帧回落 `firstFrame`（不是 `__BASE`），因此即使某个隐藏消费点被意外激活，
  最差也只是画透明，不会把整张图集当一帧铺满屏。

## 七、末轮门禁

| 项 | 结果 |
|---|---|
| typecheck | 0 错 |
| `asset-versions --check` | 51 条逐字节一致 |
| `shrink-ground-atlas --check` | 两件逐字节（634×584，151 真帧／192 别名） |
| `build-slim-atlas --check` | 四张 Slim 逐字节 |
| `split-char-atlas --check` | 六件逐字节（53+7+182 帧） |
| `split-temple-atlas --check` | 四件逐字节（Core 14＋46 别名／Finish 42 帧） |
| `split-popup-finish --check` | 六件逐字节 |
| `split-mech-atlas --check` | 24 变体逐字节 |
| `shrink-menu-main --check` | 两件逐字节 |
| `shrink-popup-main --check` | 两件逐字节 |
| `reflow-prephase --check` | png／fnt 字节一致 |
| `build-font-blank --check` | 两变体 PASS |
| `build-dom-skin --check` | 字节一致 |
| build | `index-CFDkosYR.js` 109,237B／gzip 36,904B（r39 109,217／36,897B） |
| vitest | **31 文件／330 例**（ground-atlas-shrink 8 例） |
| det `--compare r0-baseline` | 48/48 位级一致 |
| fixtures | 6/6 PASS |
| prephase-canvas | 5/5 PASS（menu/temple/temple-numbers/settings/credits） |
| roomtext forest_01／forest_12 | 6/6／5/5 面逐字节 |
| domskin | 4/4 |
| audiofamily／charsplay | ALL PASS（窗口期良性降级 2 条） |
| treebake | ALL PASS（金标 3262048718／2206923419／1703026984） |
| groundcache | ALL PASS（hash 297589047→297589047，remove 0→0） |
| journey | journey 7/7 · refresh 3/3 · wonrefresh 6/6 · deathretry 4/4 · rejoin 3/3 |
| route forest_01／forest_12 | 各 1 轮 won=true（winAt 39,516／12,991ms） |
| regression（zz_probe walkin-doors） | won=true，errors=0，sync=0，缺帧=0 |
| tilesprite forest_01／forest_24 | Game 1/1＋Temple 1/1 ndiff 0；8/8，私有画布 1×1 |
| finish-anims | 8/8（帧 0008/0011/0014，0 页错，继续 forest_04→forest_05） |

24 份 advance、12 份 load（24 轮）、3 份 resident 快照全部页错 0、真双载 0。

门禁维护：`GameScene.ts` 新增的两行注释使房内字体行钉后移，`scripts/font-subset/room.mjs`
的时钟两钉 1625→1627、1663→1665，`font-roomblank.test.ts` 的 PARAMETERISED 1525→1527
（内容逐行核对未变）；首次 `build-font-blank --check` 因此报红，更新后两变体 PASS。

## 八、结论

- **收益**：地面图集解码 **8.00→1.41MiB（−6.59MiB，−82.4%）**，四态驻留同额下降；
  落定门线上 **−62.9KB**、房内窗口 **−63KB**；slow3g **−1226.5ms**、fast3g **−357.8ms**
  （三闸门全过），4g after-click −539.0ms 只作旁证、里程碑不足判定；off 样本不足、不主张；
  换关时序不主张，advance 链只确认逐次驻留与零页错。
- **兼容**：343 个帧名/顺序、151 个真帧像素/`sourceSize` 全部不变；NPOT 画布合法；
  旧官方两件仍在 `assets/` 作为生成器输入与旧客户端兜底；330 例单测、48 关确定性、
  房内文本像素、真实通关、四段旅程、回归、TileSprite 与结算动画门禁全绿。
- **代价**：客户端 JS +20B raw／+7B gzip；仓库与服务器多保留官方两件 162,845B（新客户端不下载）；
  新增一个生成器与 8 例静态网；JSON 多出 192 条别名（+13.7KB raw，gzip 后仍净省）。
- **下一轮候选**：`chars-play`（10.75MB）与 `font-room`（8.56MB）的按需面收缩；
  `groundTex` 4.96MB 的逐关烘焙画布换关释放口径；Temple Finish 的保留/释放再账；
  4g 档小于 100ms 的收益需更多轮次。素材再编码（任务 #42）仍是用户保留项，未经裁决不动。
