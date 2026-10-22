# r31：菜单图集原地清零（MenuAssets 60 帧留 29，线上 191.2→82.3KB）

> 日期：2026-10-22 · 版本线：0.3.43 · 量具：`benchmark/perf-load.mjs`（四档 A/B/A）、
> `benchmark/load-ab-bands.mjs`（三闸门）、`benchmark/perf-resident.mjs`（驻留）、
> `scripts/atlas-slim/build-slim-atlas.mjs --check`（四图复现性）、配套运行时接线探针（TEMP，不入库）。
>
> 结果：`MenuAssetsSlim.png` **195,797→84,297B（−111,500B＝−108.9KB，−56.9%）**，60 帧留 29、清零 31
> （478,985 个不透明像素）；官方 JSON 与全部帧坐标不动。
> Boot 阻塞批 `forest_01` 的 Menu 窗 **1728→1619KB／18 条不变**（解码体 3196→3087KB），
> 到落定 **3357→3249KB／56 条**；稳定档房内窗 **1630KB／38 条三臂一致**（本轮的字节全部在门内）。
> `menuActiveMs` Δ＝fast3g **−598.0ms**（最差带 214 的 2.8×，面额兑现 107.3%）、
> slow3g **−1717.3ms**（带 99 的 17.3×，96.3%）、4g **−235.0ms**（带 176 的 1.3×，105.4%）；
> `gameActivePerfMs`（页钟绝对里程碑，天然继承 Menu 段收益）fast3g −534.0ms、slow3g −1756.8ms；
> 4g 该指标臂 B 散布 799ms ⇒ 不作主张，off 全带内。
> 驻留六态两臂逐项相同（Menu 59.45／temple 74.38／Game 95.35MB）：解码画布不变，省的是线上字节。

## 一、为什么切菜单图集：60 帧里只有 29 帧会上屏

`MenuAssets` 是 Boot 阻塞批里唯一还没清零的图集：60 帧、1024²、官方 PNG 191.2KB。
消费面分布在四个场景，但真正会画的帧只有 29 个：

| 场景 | 用法 | 帧 |
|---|---|---:|
| MenuScene | 开始界面蜡烛、设置齿轮 | `Navy0000`、`SettingsButton0002` |
| SettingsScene | 音乐/音效开关、确定 | `MusicButton0000/0001`、`FxButton0000/0001`、`StoneButton0000` |
| TempleScene | 关卡星碑/底座、锁、新标记、返回 | 三种类型 `Diamond*0000-0003`（12）、四张 `*_Bkg_Mask0000`、`Lock0000`、`NewSign0000`、`BackButton0000/0001` |
| overlays / GameScene | 弹窗按钮、死亡粒子 | `StoneButton0000/0001`、`Navy0000` |

清零的 31 帧按族归并：

| 族 | 帧数 | 判据 |
|---|---:|---|
| `ToggleSingleScreen0000-0011` | 12 | 旧设置面板的单屏开关，现行设置只有 Music/Fx 两行 |
| `ToggleControlButtonDual/Single0000-0001` | 4 | 旧触屏控制开关，现行触屏走 `TouchControls` DOM |
| `BackButtonFull0000-0001` | 2 | 旧整宽返回按钮，现行只用 `BackButton0000-0001` |
| `MuteButton0000-0001`、`VibrateButton0000-0001` | 4 | 旧静音/振动按钮，设置已改 Music/Fx |
| `SettingsButton0000-0001` | 2 | 旧设置齿轮，现行用 `SettingsButton0002/0003` |
| `GoldLock0000`、`UnlockButton0000` | 2 | 金币锁/解锁按钮，现行无此 UI |
| `DiamondDark0000-0003` | 4 | 森林 48 关只有 general/speed/puzzle（`inspect` 有断言），dark 星碑永不绘制 |
| `_default0000` | 1 | 图集默认占位帧，代码零引用 |

`DiamondDark_Bkg_Mask0000` **保留**：`templeTreeBake` 的 masks 映射静态读取四个前缀，底座参与烘焙取样；
清零它会让树烘焙金样变化。星碑本体（`DiamondDark0000-0003`）与底座分离，因此可以清。

## 二、实施

| 件 | 内容 |
|---|---|
| 口径 | `scripts/atlas-slim/needs.mjs` 增加 `ATLAS_SPECS.menu`、`MENU_FIXED`（29 帧）、`MENU_STAR_PREFIXES`/`MENU_MASK_PREFIXES`、`DEAD_RULES.menu`（31 帧），并为 MenuScene/SettingsScene/TempleScene/overlays/GameScene 补字面量 PINS。`inspect()` 的 keep 增加 menu。 |
| 生成器 | 复用 r26 的原地清零 `build-slim-atlas.mjs`，现覆盖四张图集。菜单只改 PNG 像素：保留帧矩形逐字节照抄、清零帧矩形整块置 0、坐标与官方 JSON 不动；逐帧回读校验后才落盘，`--check` 重建四张与在库产物比字节。 |
| 装载 | `BootScene` 新增 `ATLAS_MENU_PNG = "/assets/atlasses/MenuAssetsSlim.png"`，`this.load.atlas(ATLAS_MENU, ATLAS_MENU_PNG, "/assets/atlasses/MenuAssets.json")`。装载点、批内顺序、请求数都没变，只换 URL。 |
| 静态网 | `atlas-slim.test.ts` 的 FROZEN 增加 `menu: { declared: 60, keep: 29, blank: 31 }`；新增「菜单图集：选关星碑/底座与按钮留在 keep，原版未用 UI 族与 dark 星碑清零」，逐项断言 12＋13＋4＋2 帧与四张底座；官方 PNG 扫描与静态字面量映射扩到四图。 |

产物（与官方同像素、同坐标）：

| 产物 | 件数 | 画布 | 字节 |
|---|---:|---|---:|
| `MenuAssets.png`（官方，本轮起不再进 Boot 批） | 1 | 1024² | 195,797B |
| `MenuAssetsSlim.png` | 1 | 1024² | **84,297B** |
| `MenuAssets.json`（官方，未改） | 1 | — | 不动 |

四张 Slim 合计（PNG）：官方 **1,309,333B（1278.6KB）→ 548,903B（536.0KB）**，**−760,430B（−742.6KB，−58.1%）**。

## 三、字节账：Menu 窗 −109KB／18 条，请求数不变

- **Menu 窗**（四档一致，两轮均值）：A/C **1728KB／18 条** → B **1619KB／18 条**，**−109KB**；
  Resource Timing 解码体 3196→3087KB（PNG 的 `decodedBodySize` 与传输同尺寸，同减 109KB）。
  18 条请求一条没少——这不是"搬窗口"，是"同一批请求里字节变少"。
- **到落定**（fast3g/slow3g）：A/C 3357KB／56 条 → B **3249KB／56 条**（−108KB，条数不变）。
- **房内窗**（fast3g/slow3g）：A/B/C 三臂 **1630KB／38 条**逐轮一致；菜单图集省下的字节在落定前就已到齐，
  房内路径零变化。
- **4g 的到落定/房内窗混入 chars-play 442.7KB**：B 的第 2 轮 `CharAssetsPlay.png` 在门后到达
  （`endMs=7955`），该轮 `到落定` 3691KB／55 条、房内窗 2072KB／37 条；第 1 轮 3249KB／56 条、
  1630KB／38 条与稳定档一致。两轮均值因此 +113KB／+221KB，**与菜单图集无关**（r30 同型竞态），
  故 4g 的字节窗只引 Menu 窗，不引房内窗。
- **off 的窗口切分本身不稳定**：无节流时预取落点由调度决定，A/C 两轮的到落定分别在 3801/5410KB、
  3801/4125KB，B 在 5301/3762KB，条数 56–59 摇摆；Menu 窗仍稳定为 1728→1619KB／18 条。
  该档的房内窗读数不作为字节账依据。

## 四、四档 A/B/A（2 轮/臂；臂 A/C＝`dc21ca9`，臂 B＝`6f22338`）

`FILES="packages/client/src/scenes/BootScene.ts"`；`FILES` 另含 84,297B 的 `MenuAssetsSlim.png` 与静态网、
口径文件（已提交，换臂只切 BootScene）。`load-ab-bands.mjs <tier> r31 menuActivePerfMs gameActivePerfMs`；
Δ＝B̄−mid(Ā,Ĉ)，三闸门：①Δ 超最差带 ②Δ 超臂 B 散布 ③高漂移档 n≥8。

| 档 | 指标 | Ā/B̄/Ĉ | Δ | 最差带 | 臂B散布 | Δ/带 | 判定 | 面额 | 兑现率 |
|---|---|---|---:|---:|---:|---:|---|---:|---:|
| fast3g | Menu active | 9901/9255/9806 | **−598.0ms** | 214 | 6 | 2.8× | ①②过 ⇒ 可主张 | 557.5ms | 107.3% |
| fast3g | gameActive | 19547/18962/19445 | **−534.0ms** | 244 | 63 | 2.2× | ①②过 ⇒ 可主张 | 557.5ms | 95.8% |
| slow3g | Menu active | 30347/28631/30350 | **−1717.3ms** | 99 | 90 | 17.3× | ①②过 ⇒ 可主张 | 1783.9ms | 96.3% |
| slow3g | gameActive | 59308/57549/59303 | **−1756.8ms** | 86 | 69 | 20.4× | ①②过 ⇒ 可主张 | 1783.9ms | 98.5% |
| 4g | Menu active | 4218/4003/4259 | **−235.0ms** | 176 | 42 | 1.3× | ①②过 ⇒ 可主张 | 223.0ms | 105.4% |
| 4g | gameActive | 8827/8996/8921 | +121.5ms | 170 | 799 | 0.7× | 带内 ⇒ 不算差异 | — | — |
| off | Menu active | 561/577/549 | +21.8ms | 133 | 115 | 0.2× | 带内（且 n=2<8） | — | — |
| off | gameActive | 1968/2163/2073 | +142.8ms | 572 | 258 | 0.2× | 带内（且 n=2<8） | — | — |

- 面额按 108.9KB×5.12／16.384／2.048 计。菜单图集在 Boot 批内，直接目标是 `menuActiveMs`；
  `gameActivePerfMs` 是页钟绝对时刻（`clickPerfMs + gameActiveAfterClickMs`），必然继承 Menu 段的全部收益，
  因此两行同报、不重复计价。
- 4g 的 `gameActive` 臂 B 两轮 8596/9395（散布 799ms），Menu 段收益被淹没；同档 `menuActive`
  臂 B 散布仅 42ms，故只主张 Menu 段。这也印证"档位越弱、门内字节越值钱"的既有口径。
- off 档按三闸门规则属高漂移档，需每臂 ≥8 轮才可判；本轮 2 轮/臂且 Δ 已在带内，不构成差异。

## 五、驻留与运行时接线（`perf-resident`，forest_01，A/B 各一次）

| 状态 | 臂 A（官方 PNG） | 臂 B（Slim） | 差 |
|---|---|---|---|
| Menu 暖装落定 | 11.60MB 堆／59.45MB 纹 | 11.60MB／59.45MB | 0 |
| temple 首入 | 26.90MB／74.38MB（画布 14.93） | 26.90MB／74.38MB（14.93） | 0 |
| temple 重进/三进 | 26.90/27.00MB／74.38MB | 26.90/27.00MB／74.38MB | 0 |
| Game 开局 | 23.00MB／95.35MB（画布 9.38） | 23.00MB／95.35MB（9.38） | 0 |
| temple 离房后 | 28.70MB／100.90MB | 28.70MB／100.90MB | 0 |

原地清零只改 PNG 线上字节，1024² 解码画布不变，故驻留六态逐项相同——这是符合预期的零回归，
不是"没测出收益"：r28/r30 的 −16MB 来自"关卡定出后才装"，本轮没有改装载时机。

运行时探针（TEMP，不入库）在真实 Menu → Settings → Temple 路径上遍历 display list：

- 三场景实际引用 `menu` 图集 11 帧（Menu 2、Settings 3、Temple 6），**全部落在 29 帧保留集内**；
- 逐帧 drawImage 回读 alpha：11 帧非空（如 `StoneButton0000` 18,592/29,484 px、
  `Diamond_Bkg_Mask0000` 8,567/14,400 px）；
- 抽样四个清零帧 `_default0000`／`ToggleSingleScreen0000`／`DiamondDark0000`／`VibrateButton0000`：
  不透明像素**全为 0**；
- 未被三场景画到的保留帧是按压态（`*0001`）、有星存档才画的 `Diamond*0001-0003`、dark 底座，
  由静态网与 treebake 金样覆盖。

探针首版曾把 `Frame.x/y` 当图集坐标，读数出现"清零帧仍有像素"的假阳性；这版 Phaser 的图集源坐标在
`Frame.cutX/cutY`（`x/y` 是 trim 偏移，未裁帧恒 0）。改用 `cutX/cutY` 后与落盘 PNG 的逐帧 alpha 计数一致。
探针属 TEMP 取证，不入库，不影响任何生产路径。

## 六、末轮门禁

| 项 | 结果 |
|---|---|
| typecheck | 0 错 |
| `build-slim-atlas --check` | 四张 Slim 与重建逐字节（mech 152.9／temple 229.5／popup 71.3／menu 82.3KB） |
| `split-char-atlas --check` | 六件逐字节（53+7+182 帧） |
| `split-popup-finish --check` | 六件逐字节（29/29/28 帧） |
| `split-mech-atlas --check` | 24 变体逐字节（PNG 合计 1483.9KB＋JSON 108KB） |
| `reflow-prephase --check` | png／fnt 字节一致 |
| `build-font-blank --check` | 两变体 PASS（`6434548a…`／`ebcb004d…`） |
| build | `index-CC0imxf6.js` 104.84KB／gzip 35.73KB |
| vitest | 24 文件／269 例 |
| det `--compare r32` | 48/48 位级一致 |
| roomtext forest_01／forest_12 | 6/6／5/5 面逐字节 |
| prephase-canvas | 5/5（含 settings／credits 画布逐字节） |
| domskin | 4/4（wide×3＋narrow） |
| audiofamily（off） | 22 项 |
| charsplay（off） | 21 项 |
| treebake | 9/9（含 dark 底座参与的三层金样） |
| groundcache | 6/6 |
| journey refresh／wonrefresh／deathretry／rejoin | 3/3 · 6/6 · 4/4 · 3/3 |
| route forest_01／forest_12 | 各 1 轮 won=true |
| regression（zz_probe walkin-doors） | won=true，errors=0，缺帧=0 |

## 七、结论

- **收益**：菜单图集线上 −108.9KB/次冷启，Boot 批请求数不变；`menuActiveMs` fast3g −598.0ms、
  slow3g −1717.3ms、4g −235.0ms，兑现率 96–107%；`gameActive` 在稳定档继承 −534.0／−1756.8ms。
- **代价**：零驻留代价（解码画布 1024² 不变）；官方 JSON 不换，帧名/坐标全保留，任何按名取帧的旧路径仍可用；
  清零帧若被未来 UI 误用，静态网会在字面量层报红。
- **四图合计**：PNG 1278.6→536.0KB（−742.6KB，−58.1%），至此 Boot/进房/选关三条路径上的图集都走同一套
  原地清零口径。
- **下一轮候选**：Popup 主图集 2048² 画布随 6 帧缩小（驻留侧，需与 r26 坐标口径一并裁决）、
  机关图集画布随变体帧数缩小、换关链（advance）的 16MiB 重解码代价入账、MenuAssets 1024² 画布
  随 29 帧缩小（驻留侧，先做 bitmap 字相位核验）。
- 素材再编码（任务 #42）仍是用户保留项，未经裁决不动。
