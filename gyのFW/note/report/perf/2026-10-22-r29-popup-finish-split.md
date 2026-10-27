# r29：结算板图集延后装载（Popup 结算帧拆成三张按类型子图集）

> 日期：2026-10-22 · 版本线：0.3.43 · 量具：`benchmark/perf-load.mjs`（四档 A/B/A）、`benchmark/load-ab-bands.mjs`（三闸门）、
> `benchmark/perf-resident.mjs`（驻留）、`scripts/split-popup-finish.mjs --check`（复现性）、配套运行时接线探针（TEMP，不入库）。
>
> 结果：进房阻塞图集 `PopupAssetsSlim.png` **255,275→73,027B（−182,248B＝−178.0KB，−71.4%）**；
> 结算帧改由三张按类型图集在房间可玩后预取（general 71,857B／speed 69,036B／puzzle 71,874B）。
> `gameActivePerfMs` Δ＝fast3g **−960.3ms**（最差带 249 的 3.9×，面额兑现 105.4%）、
> slow3g **−2940.0ms**（带 194 的 15.2×，兑现 100.8%）、off −46.5ms（带内不主张）；
> 4g 臂 B 被量具 round2 TTFB 守卫拦下（连跑 4 次），本档不作主张，证据与归因见 §四。
> 驻留代价：Game 态纹理 **+1.96MB**（本关结算图集解码），Menu 段 0（75.45MB 两臂一致）。
> 运行时接线：结算板星碑/箭头/图标确实取自 `popup-finish-general`（29 帧），主图集同名帧已全透明。

## 一、为什么拆：结算板的 173KB 不在进房路径上

`PopupAssetsSlim.png`（r26 原地清零版）在进房阻塞批里，2048² 画布上还留着结算面板的全部内容：
四套星碑（每套 22 帧）、勾叉/成就/钻石/计时图标、两帧箭头。但结算板只在**通关那一刻**打开——
进房、选关、HUD、暂停、失败面板都不画其中任何一帧。

r26 已经把「零消费家族」清零（`FinishStoneDark` 22 帧 + 9 张零消费单帧），本轮再切一刀，
判据换成**这一帧什么时候必须到位**：

| 面 | 消费点 | 必须到位时刻 |
|---|---|---|
| `PauseButton0000`、`PopupBackground0000`、`Confetti0000-0003`（6 帧） | HUD 暂停键、选关大厅三星彩带、结算板底 | 进房/进大厅即上屏 ⇒ 留在主图集 |
| `FinishStone{,Speed,Puzzle}0000-0021`（各 22 帧） | `EndMenu` 星碑动画（三段 1-7/8-14/15-21） | 通关开板时 ⇒ 可延后 |
| 勾叉/成就/钻石/计时/箭头（8 帧，按布局取子集） | `EndMenu` 图标行与箭头 | 通关开板时 ⇒ 可延后 |
| `FinishStoneDark` 22 帧 + 9 张零消费单帧 | 无（森林 48 关不存在第四套星碑） | 永不 ⇒ 保持清零 |

森林只有 general/speed/puzzle 三套星碑，三张子图集各带本类型 22 帧星碑＋实际绘制的图标
（scored 两行布局：勾/叉/成就/钻石/计时＋箭头 2 帧；puzzle 两行：勾/叉/成就/银钻＋箭头 2 帧）。

## 二、实施

| 件 | 内容 |
|---|---|
| 生成器 | `scripts/split-popup-finish.mjs`：从官方 `PopupAssets.png/json` 重打包三张 `PopupFinish{General,Speed,Puzzle}.{png,json}`；GUT=2 隔离带、行宽上限 2048、帧的 `frame/sourceSize/trimmed/rotated` 照抄官方；逐帧回读与官方同帧矩形**逐字节相等**才落盘；`--check` 重建到 TEMP 与在库六件比字节。集合口径单份在 `scripts/atlas-slim/needs.mjs` 的 `popupFinishNeed()`（6/74/31 三分完备，`puzzle-finish.test.ts` 独立回算）。 |
| 主图集 | `PopupAssetsSlim.png` 只留 6 帧（`PauseButton0000`/`PopupBackground0000`/`Confetti0000-0003`），其余 105 帧原地清零（画布 2048²、官方 `PopupAssets.json` 坐标不动）。 |
| 装载 | `BootScene`：`popupFinishKey(type)`/`finishStonePrefix(type)`/`finishStoneAnimKey(type,stars)`/`loadPopupFinish(load,type)`/`buildFinishAnims(scene,type)`。`loadPopupFinish` 只声明本关变体、显式 `textures.remove` 另外两张（一个会话只驻留一张 ~1.9–1.97MiB 解码画布）；`buildFinishAnims` 带 `textures.exists` 守卫。 |
| 预取点 | `GameScene.create` 在 `kickCharsPlay()` 之后、`kickBgmLoop()` 之前调 `kickPopupFinish()`：房间可玩之后取，不占进房阻塞批；类型 `templeType` 在 `init` 已定。`EndMenu.preload` 再声明一次兜底。 |
| 兜底 | 若结算图集仍未到位，`EndMenu.create` 回落到主图集同名帧（r26 后为透明）；动画只在 `EndMenu.create` 注册（`anims.create` 当场解析帧名，早注册会绑成 `__BASE` 花屏）。 |
| 静态网 | `packages/client/src/__tests__/popup-finish.test.ts`（约 15 例）：集合、互斥、几何、逐帧像素、1px 环带、字节预算、装载点与顺序、动画键与帧段、主图集 111 帧账（6 keep／74 finish／31 dead）、Boot 阻塞批不得出现 `PopupFinish`。`atlas-slim.test.ts` 的 FROZEN 台账同步为 popup 111/6/105。 |

产物（与官方同像素）：

| 产物 | 帧数 | 画布 | PNG | JSON | 解码 |
|---|---:|---|---:|---:|---:|
| `PopupAssetsSlim.png`（主） | 6/111 | 2048² | 73,027B | 23,232B（官方） | 16.00MiB |
| `PopupFinishGeneral.png` | 29 | 1954×264 | 71,857B | 8,637B | 1.97MiB |
| `PopupFinishSpeed.png` | 29 | 1954×264 | 69,036B | 8,745B | 1.97MiB |
| `PopupFinishPuzzle.png` | 28 | 2044×244 | 71,874B | 8,481B | 1.90MiB |

## 三、字节账：房内窗 −178.0KB，单会话净 −99.4KB

- **进房可玩窗**（本轮 A/B/A 的直接面额）：主图集 PNG 255,275→73,027B ＝ **−182,248B（−178.0KB）**。
- **单会话净字节**（把延后取的三张也算上，按本关类型一张）：general
  255,275＋23,232 → 73,027＋23,232＋71,857＋8,637 ＝ 278,507→176,753B ＝ **−101,754B（−99.4KB）**；
  speed −102.0KB；puzzle −99.5KB。延后的 70–80KB 发生在可玩之后，不占 `gameActivePerfMs`。
- 稳定档逐请求窗口（fast3g/slow3g，两轮均值）：`到落定` 3655→3477KB／57 条不变；**房内窗 1928→1750KB／39 条不变**；
  解码 5560→5383KB。off 档窗口 4903→4153KB／58→59 条（房内窗 3176→2426KB／40→41 条）——
  off 下 B 臂的结算图集在 Game active 前已下完并计入窗口，且更多可选资源提前完成，快照边界效应放大，
  故字节账以稳定档逐请求差为准（r28 同一注记）。
- 真双载＝0、页面错误＝0（全部快照）。

## 四、四档 A/B/A（2 轮/臂；臂 A/C＝`2a03717`，臂 B＝`2c3a170`）

`FILES` 含四个改动面（`BootScene.ts`、`GameScene.ts`、`overlays.ts`、`PopupAssetsSlim.png`），
臂 A/C 用旧 255,275B 主图集、臂 B 用新 73,027B；`load-ab-bands.mjs <tier> r29 gameActivePerfMs menuActiveMs`。
Δ＝B̄−mid(Ā,Ĉ)，三闸门：①Δ 超最差带 ②Δ 超臂 B 散布 ③高漂移档 n≥8。

| 档 | gameActive Ā/B̄/Ĉ | Δ | 最差带 | 臂B散布 | Δ/带 | 判定 | 面额 | 兑现率 |
|---|---|---:|---:|---:|---:|---|---:|---:|
| fast3g | 21033/20118/21123 | **−960.3ms** | 249 | 25 | 3.9× | ①②过 ⇒ 可主张 | 911.3ms | 105.4% |
| slow3g | 64276/61316/64237 | **−2940.0ms** | 194 | 110 | 15.2× | ①②过 ⇒ 可主张 | 2916.1ms | 100.8% |
| off | 2154/2264/2467 | −46.5ms | 495 | 407 | 0.1× | 带内 ⇒ 不算差异 | 364.5ms | — |
| 4g | 4968·5093 / — / 5098·4957 | — | — | — | — | 臂 B 守卫未过 ⇒ 不主张 | 364.5ms | — |

- `Menu activeMs`：fast3g −46.0（带 85／臂B 140）、slow3g +20.0（带 186／臂B 6）、off +63.0（带 191／臂B 100），
  全部落在带内；Menu 窗 1727KB/18 条三臂一致，自带对照证明改动只在房内路径。
- **4g 的臂 B 被节流守卫拦下（连跑 4 次）**：round2 冷启动段 TTFB 中位数 9.4／12.3／5.9／14.4ms
  ＜0.5×rtt=40ms，而**同一轮带宽判据通过**（最大单笔 `font-roomblank.png` 777.3KB 响应体 1826.6ms，
  下限 777ms）。诊断副本（TEMP，未改量具）显示 51 条过网条目里 26 条 TTFB 在 1–5ms（多为整份传输的
  PNG/JSON），呈缓存命中双峰；A/C 两臂的中位数也只有 48.9/51.5ms，距 40ms 线仅 1.2–1.3×。
  这与 r28 报告 §量具判读注记 记录的 round2 缓存命中污染一致：**节流仍在，是延迟判据的边界效应**。
  按 r28 先例重跑该臂 4 次仍未过，本档**不作主张**；4g 的面额换算（178.0KB×2.048＝364.5ms）只作上界。
  附注（诊断读数，不入判定）：三次 B 臂 round1 为 4980／5074／4856ms，A/C 为 4968·5093／5098·4957ms，
  落在 A/C 自身散布内——4g 下这 178KB 基本不在 Game active 的关键路径上，与 r28 的 43% 兑现率同向。

## 五、驻留对账（`perf-resident`，forest_01，A/B 各一次）

| 状态 | 臂 A（255,275B 主图集） | 臂 B（拆张） | Δ |
|---|---:|---:|---:|
| Menu（暖装落定）纹理 | 75.45MB | 75.45MB | 0 |
| Game（开局静止）纹理 | 93.39MB | **95.35MB** | **+1.96MB** |
| Game canvas 纹理 | 9.38MB | 9.38MB | 0 |
| Game 堆（强制 GC） | 23.3MB | 23.1MB | −0.2MB（噪声） |

+1.96MB 就是本关结算图集的解码画布（general 1.97MiB），只在 Game/结算期驻留；Menu 段不预装。
主图集 16MB 解码两臂相同（r26 保留 2048² 画布的口径未变）。这是本轮用**线上字节**换**结算期驻留**的代价，
与 r28「驻留不变、线上字节少」相反，需在后续「主图集画布是否可缩」的轮次里一并裁决。

## 六、运行时接线探针（TEMP，不入库）

`TEMP/r29-popup/finish-probe.mjs` 在 forest_01 建房（off 档）后读状态：

- `popup-finish-general` 存在、**29 帧**；`popup-finish-speed/puzzle` 不存在（跨变体卸键生效）。
- `EndMenu` 显示列表里星碑 `FinishStone0000`、箭头 `popupArrow0000`、图标 `FinishIcon0000`/`DiamondsIcon0000`/`TimeIcon0000`
  的纹理键全部是 `popup-finish-general`，板底仍是主图集 `PopupBackground0000`。
- 像素：结算图集 `FinishStone0000` 不透明像素 15,876、箭头 11,700、图标 2,619；
  **主图集同名 `FinishStone0000` 不透明像素 0**（已清零）。
- 页面错误 0。

## 七、门禁（末轮套件）

串行执行（浏览器类步骤互斥，vitest 不与 regression 抢 `zz_probe` 夹具）；生成器步骤按头注用 `node --import tsx`。

| 步骤 | 读数 |
| --- | --- |
| typecheck | 0 错 |
| `build-slim-atlas --check` | 三张 Slim 与重建逐字节 |
| `split-char-atlas --check` | 六件逐字节 |
| `reflow-prephase --check` | png/fnt 字节一致 |
| `build-font-blank --check` | 两变体 PASS |
| `split-popup-finish --check` | 六件逐字节（29/29/28 帧） |
| build | `index-B5L1TkT4.js` 102.79KB／gzip 35.08KB，4.70s |
| vitest | 23 文件／258 例全过（58.34s） |
| det（`--compare r32`） | 48/48 位级一致 |
| roomtext forest_01／forest_12 | 6/6／5/5 面逐字节 |
| prephase-canvas | 5/5 画布逐字节 |
| domskin | 4/4（wide×3＋narrow） |
| audiofamily（off） | 22 项（两族各 11） |
| charsplay（off） | 21 项 |
| treebake | 9/9 |
| groundcache | 6/6 |
| journey refresh／wonrefresh／deathretry／rejoin | 3/3 · 6/6 · 4/4 · 3/3 |
| route forest_01／forest_12 | 各 1 轮 won=true |
| regression（zz_probe walkin-doors） | won=true，errors=0，缺帧=0 |

末轮 24 项命令全部 EXIT=0（`GATES DONE fail=0`）。

## 八、结论与下一轮候选

- **可主张**：fast3g −960.3ms（3.9×带）、slow3g −2940.0ms（15.2×带），兑现 100.8%–105.4%；
  房内窗 −178.0KB，单会话净 −99.4KB；结算板像素与官方逐字节等价、运行时接线通过。
- **代价**：Game 态驻留 +1.96MB（仅本关结算图集）；延后取的 ~70–80KB 落在可玩之后。
- **不作主张**：4g（量具 round2 延迟判据边界效应，连跑 4 次未过；带宽判据与 r28 先例证明节流仍在）、off（带内、n=2）。
- **下一轮候选**：MechAssets 按关装载（152.9KB，可复用 r28 的暖装门通道）、MenuAssets 同类原地清零（191.5KB）、
  主图集 2048² 画布能否随 6 帧缩小（本轮驻留代价的另一半，需与 r26 的坐标口径一起裁决）。
- 素材再编码（任务 #42）仍是用户保留项，未经裁决不动。
