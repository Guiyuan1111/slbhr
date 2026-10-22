# r32：弹窗主图集画布收缩（6 真帧重打包 1086×696，进房解码 16.00→2.88MiB）

> 日期：2026-10-22 · 版本线：0.3.43 · 量具：`benchmark/perf-load.mjs`（四档 A/B/A）、
> `benchmark/load-ab-bands.mjs`（三闸门）、`benchmark/perf-resident.mjs`（驻留）、
> `scripts/shrink-popup-main.mjs --check`（两件复现性）、`scripts/e2e/prephase-canvas.mjs`（前场画布）、
> 双人实玩冒烟（TEMP，不入库）。
>
> 结果：`PopupAssetsMini.png` **55,477B**、`PopupAssetsMini.json` **17,169B**，画布 **1086×696**；
> 相对 r31 装载的 `PopupAssetsSlim.png`＋官方 JSON（73,027＋23,232B），文件合计 **96,259→72,646B
> （−23,613B，−24.5%）**，过网实测 **73.0→55.5KB（−17.5KB）**。
> 进房纹理解码 **16.00→2.88MiB（−13.12MiB）**，驻留 Menu/temple/Game 三态同减 13.12/13.12/13.11MB；
> 稳定档房内窗 **1630→1612KB／38 条不变**；`gameActivePerfMs` slow3g **−364.8ms**
> （最差带 183 的 2.0×，面额兑现 123.7%），fast3g −72.8ms 带内、4g +22.3ms 带内、off 带内。
> 主图集 111 个帧名一个不少：6 个真帧像素逐字节照抄官方，105 个零消费帧别名到 4×4 透明块。

## 一、为什么切：r29 拆张后只剩 6 帧，画布却还是 2048²

r29 把结算板星碑/图标拆成三张按类型图集之后，主图集 `PopupAssetsSlim.png` 的 111 帧里只剩 6 帧
真帧，其余 105 帧已在原画布上原地清零：

| 帧 | 尺寸 | 用途 |
|---|---:|---|
| `PopupBackground0000` | 1082×642 | 暂停/结算/失败三块弹窗的板底 |
| `PauseButton0000` | 48×48 | HUD 暂停键 |
| `Confetti0000-0003` | 30×28 | 选关大厅三星彩带 |

但画布仍是 2048²：进房装载每次 `TextureManager` 都要建一张 **16.00MiB** 的解码画布，105 个空帧
继续占着 96.1% 的像素面积。r26/r31 的"原地清零"只省线上字节（PNG 从 334.1KB 清到 71.3KB），
对解码面额无能为力——这一轮换口径：**保留帧重打包到新图集，清零帧以透明别名留在 JSON 里**。

## 二、实施：6 真帧重打包 + 105 个透明别名

| 件 | 内容 |
|---|---|
| 口径 | `POPUP_EARLY`（r29 已有）就是 6 个真帧集合；生成器强制 `POPUP_EARLY.size === 6` 且与布局表逐名一致。官方 111 帧全部 `trimmed:false`、`spriteSourceSize` 偏移 0 ⇒ 重打包只换容器坐标，不引入重采样相位差（生成器对任一 trimmed 帧直接报错退出）。 |
| 生成器 | `scripts/shrink-popup-main.mjs`：`GUT=2` 隔离带、板底 (2,2)、暂停键 (2,646)、彩带按 30×28 横排；6 帧用 `cropRaw` 从官方 PNG 逐字节搬运并**回读比对**；其余 105 帧的 `frame` 全部指向 (200,646) 的 4×4 透明块（`mainAlias:true`），`sourceSize` 照抄官方、`trimmed:false` ⇒ Phaser 渲染尺寸就是 4×4，不会把旧像素画出来。别名块 1px 环带逐像素断言 alpha=0。 |
| 产物 | 画布 **1086×696**（W = 板宽 1082＋2×GUT，H 由板底＋按钮行＋别名块确定）；`PopupAssetsMini.png` 55,477B、JSON 17,169B。JSON 紧凑序列化并省略 `trimmed:false` 帧的 `spriteSourceSize`（Phaser 不读），比官方 23,232B 更小。 |
| 装载 | `BootScene`：`ATLAS_POPUP_PNG = "/assets/atlasses/PopupAssetsMini.png"`、新增 `ATLAS_POPUP_JSON = "/assets/atlasses/PopupAssetsMini.json"`；`loadGameAtlases` 与 `CompleteScene.preload` 两处同常量同键装载（混用会让 Mini 是否生效取决于装载序，静态网钉死）。 |
| 降级路径 | `overlays.ts` 的 `uiAtlas = this.textures.exists(finishKey) ? finishKey : ATLAS_POPUP` 不变：结算图集未落地时，按名取 `FinishStone*0000`/`TickIcon`/`CrossIcon`/`popupArrow*` 等仍能拿到透明别名帧，不会落到「缺帧」分支。 |
| 静态网 | 新增 `popup-mini.test.ts` 7 例：111 个帧名与顺序同官方；真帧正好 `POPUP_EARLY`；真帧几何/元数据/像素逐字节同官方裁片；105 个别名同指一块 4×4、环带全透明、`sourceSize` 保留；每个真帧四周 1px 隔离带透明；画布/字节预算与装载点；生成器 `--check` 门禁在库。`atlas-slim.test.ts` 的装载期望改到 Mini 两常量。 |

产物（与 r31 对照）：

| 产物 | 画布 | PNG | JSON | 合计 |
|---|---:|---:|---:|---:|
| `PopupAssetsSlim.png` + 官方 `PopupAssets.json`（r31 装载） | 2048² | 73,027B | 23,232B | 96,259B |
| `PopupAssetsMini.png` + `PopupAssetsMini.json`（r32 装载） | **1086×696** | **55,477B** | **17,169B** | **72,646B** |

`PopupAssetsSlim.png` 仍留在树里：`build-slim-atlas --check` 仍把它作为四图集产物之一验字节，
`split-popup-finish.mjs` 继续从官方 PNG 生成三张结算图集（不读 Slim）。客户端源码已无 Slim 引用。

## 三、字节账：过网 −17.5KB，房内窗 1630→1612KB／38 条

Resource Timing 实读（fast3g 臂 A/B 同一轮，均为 `phase:"post"`，点击之后、游戏可玩之前）：

| 请求 | 臂 A（r31） | 臂 B（r32） | 差 |
|---|---:|---:|---:|
| 主图集 PNG | `PopupAssetsSlim.png` 71.6KB | `PopupAssetsMini.png` 54.5KB | −17.1KB |
| 图集 JSON | `PopupAssets.json` 1.4KB（gzip） | `PopupAssetsMini.json` 1.0KB（gzip） | −0.4KB |
| 合计 | **73.0KB** | **55.5KB** | **−17.5KB** |

- **Menu 窗不动**：三臂 **1619KB／18 条**逐轮一致——Popup 对是点击后才发（`startMs≈9.5s`），
  本来就不在 Menu 窗内，这正好是"只换字节、不搬窗口"的阴性对照。
- **到落定**：A/C **3249KB／56 条** → B **3231KB／56 条**（−18KB，条数不变）。
- **房内窗**：A/C **1630KB／38 条** → B **1612KB／38 条**（−18KB）。窗口取整 18KB 与过网 17.5KB
  的差来自 Resource Timing 的 0.1KB 取整。
- **4g 的字节窗被 chars-play 竞态污染**：臂 B 第 1 轮 `charsPlayInWindow=before-gate`、到落定
  3674KB／55 条，第 2 轮 3230KB／68 条；两轮均值 3452KB／62 条，与 A/C 的 3249KB／56 条不可比。
  该档的窗口读数不作字节账依据（与 r30/r31 同型）。
- **off 的窗口切分不稳定**：三臂所有轮次都有 chars-play 落入 `before-gate`，到落定 3692–4069KB／56–59 条
  摇摆；只引 Menu 窗（1619KB／18 条恒定）。

解码面额：2048×2048×4 = 16,777,216B → 1086×696×4 = 3,023,424B，**−13,753,792B = −13.12MiB**。

## 四、四档 A/B/A（2 轮/臂；臂 A/C＝`5b59e71`，臂 B＝`98c2fd8`）

`FILES="packages/client/src/scenes/BootScene.ts packages/client/src/scenes/menus.ts"`；资产随臂切换
（A＝Slim＋官方 JSON，B＝Mini 两件）。`load-ab-bands.mjs <tier> r32 menuActiveMs gameActivePerfMs`；
Δ＝B̄−mid(Ā,Ĉ)，三闸门：①Δ 超最差带 ②Δ 超臂 B 散布 ③高漂移档 n≥8。

| 档 | 指标 | Ā/B̄/Ĉ | Δ | 最差带 | 臂B散布 | Δ/带 | 判定 | 面额 | 兑现率 |
|---|---|---|---:|---:|---:|---:|---|---:|---:|
| fast3g | Menu active | 9271/9277/9294 | −5.8ms | 150 | 203 | 0.0× | 带内 | — | — |
| fast3g | gameActive | 18950/18841/18877 | −72.8ms | 198 | 125 | 0.4× | 带内 ⇒ 不主张 | 89.6ms | 81.3% |
| slow3g | Menu active | 28573/28599/28620 | +2.0ms | 177 | 55 | 0.0× | 带内 | — | — |
| slow3g | gameActive | 57477/57177/57607 | **−364.8ms** | 183 | 62 | 2.0× | ①②过 ⇒ 可主张 | 286.7ms | 127.2% |
| 4g | Menu active | 3980/3934/3932 | −22.0ms | 181 | 60 | 0.1× | 带内 | — | — |
| 4g | gameActive | 8775/8747/8674 | +22.3ms | 192 | 1167 | 0.1× | 带内 ⇒ 不主张 | 35.8ms | — |
| off | Menu active | 551/610/476 | +96.8ms | 127 | 106 | 0.8× | 带内（n=2<8） | — | — |
| off | gameActive | 2060/2114/2198 | −15.3ms | 415 | 293 | 0.0× | 带内（n=2<8） | — | — |

- 面额按过网 17.5KB 计（×2.048／5.12／16.384）。按窗口取整 18KB 计则为 36.9／92.2／294.9ms；
  slow3g 的 −364.8ms 对两种口径分别是 127.2%／123.7%，取保守值报 123.7%。
- `menuActiveMs` 四档全带内是设计使然：本次字节全部落在点击后的暖装窗，Menu 段请求面没变。
- 4g 臂 B 两轮 gameActive 9330/8163（散布 1167ms），+22.3ms 完全被自身散布吞掉；同档字节窗又被
  chars-play 竞态污染，故该档不作任何主张（与 r31 同型）。
- off 属高漂移档，2 轮/臂不足 8 轮，且两指标 Δ 均已在最差带内，不构成差异。

## 五、驻留 A/B（`perf-resident`，forest_01，各一次）

臂 A 用 `5b59e71` 源码重建（`index-CC0imxf6.js`），臂 B 用现役 `98c2fd8`（`index-7O30D-Ju.js`）。

| 状态 | 臂 A 纹理／堆 | 臂 B 纹理／堆 | 纹理差 |
|---|---|---|---|
| Menu 暖装落定 | 59.45MB／11.6MB | **46.33MB**／11.6MB | **−13.12MB** |
| temple 首入 | 74.38MB／26.9MB | **61.26MB**／26.9MB | **−13.12MB** |
| temple 重进／三进 | 74.38MB／26.9/27.0MB | 61.26MB／26.9/27.0MB | −13.12MB |
| Game 开局 | 95.35MB／23.0MB | **82.24MB**／23.2MB | **−13.11MB** |
| temple 离房后 | 100.90MB／28.7MB | **87.79MB**／28.9MB | **−13.11MB** |

- 纹理差与解码面额 13.12MiB 逐项吻合（Menu 段就已装载 Popup，故四个状态一致减 13.1MB）。
- 堆差 +0.2MB（Game／离房后）在两臂自身噪声内；churn 22.4→21.9MB（离房后冷烘）、Game 0.6→0.8MB
  同为噪声。音频、地面、树结果、DOM 对象数逐项相同。
- 结论：这一轮把"线上 −17.5KB"和"驻留 −13.12MB"一起拿到，代价是图集 JSON 多出 105 条别名声明
  （已含在 17,169B 内，gzip 后 1.0KB）。

## 六、像素与运行时接线

- **双人实玩冒烟（TEMP，不入库）**：forest_01 创建/加入、真实键盘进关，页面上下文读纹理：
  主图集源 **1086×696**、111 帧；`PopupBackground0000` 1082×642、`PauseButton0000` 48×48 可见；
  降级帧 `TickIcon0000`/`FinishStone0000` 为 4×4；页面与 console 零错误。
  冒烟同时确认 HUD 暂停键在真实进房后可用；结算板的完整开板路径由 `walkin-doors` 回归与
  `journey wonrefresh` 覆盖。
- **前场画布门禁（`prephase-canvas`）出现一次基线换代**，按门禁规则取证后才刷新：
  - 首次对拍：menu/temple/temple-numbers 三态逐字节 PASS；settings/credits 两态 FAIL，
    差异 **AE=447／390 px（0.0364%，门禁打印的分数 0.000364）、最大通道差 1**，bbox 恰好覆盖弹窗板面。
  - 归因：**臂 A（`5b59e71` 源码＋Slim）5/5 逐字节 PASS，臂 B（r32）只此两态变化** ⇒ 差异由
    Popup 图集重打包引入。板底 1082×642 以原尺寸绘制，6 帧像素逐字节相同；唯一变化是图集幅面
    2048²→1086×696，线性采样在 float32 UV 上的落点偏 1 LSB。不是缺帧/错帧，也不是内容改动。
  - 处置：`--save --reason` 刷新 settings/credits 两态基线，理由写进 `manifest.provenance`
    （含臂 A/B 归因与 AE/通道差）；刷新后**连跑两次 5/5 ALL PASS**。其余三态基线字节未动。
- 真实路径证据：`prephase-canvas` 的 settings/credits 两态就是 `buildBoard` 画出的真实弹窗板
  （本次仅有 1 LSB 采样差）；`journey wonrefresh` 与 `regression walkin-doors` 走真实通关开板；
  冒烟覆盖 HUD 暂停键。三者合起来覆盖暂停键、板底、结算开板三条消费路径。

## 七、末轮门禁

| 项 | 结果 |
|---|---|
| typecheck | 0 错 |
| `build-slim-atlas --check` | 四张 Slim 与重建逐字节（mech 152.9／temple 229.5／popup 71.3／menu 82.3KB） |
| `split-char-atlas --check` | 六件逐字节（53+7+182 帧） |
| `split-popup-finish --check` | 六件逐字节（29/29/28 帧） |
| `split-mech-atlas --check` | 24 变体逐字节（PNG 合计 1483.9KB＋JSON 108KB） |
| `shrink-popup-main --check` | 两件与重建逐字节（1086×696，6 真帧／105 别名，PNG 55,477B＋JSON 17,169B） |
| `reflow-prephase --check` | png／fnt 字节一致 |
| `build-font-blank --check` | 两变体 PASS（`6434548a…`／`ebcb004d…`） |
| build | `index-7O30D-Ju.js` 104,817B（104.82KB）／gzip 35,785B（35.79KB） |
| vitest | **25 文件／276 例**（新增 popup-mini 7 例） |
| det `--compare r32` | 48/48 位级一致 |
| roomtext forest_01／forest_12 | 6/6／5/5 面逐字节 |
| prephase-canvas | 5/5 连跑两次（settings/credits 基线按 §六 换代理） |
| domskin | 4/4（wide×3＋narrow） |
| audiofamily（off） | ALL PASS |
| charsplay（off） | ALL PASS |
| treebake | 9/9（含 dark 底座参与的三层金样） |
| groundcache | 6/6 |
| journey refresh／wonrefresh／deathretry／rejoin | 3/3 · 6/6 · 4/4 · 3/3 |
| route forest_01／forest_12 | 各 1 轮 won=true（winAt 39,475／13,477ms） |
| regression（zz_probe walkin-doors） | won=true，errors=0，sync=0，缺帧=0 |

## 八、结论

- **收益**：进房解码 **16.00→2.88MiB（−13.12MiB）**，驻留 Menu/temple/Game 同步下降；
  过网 **−17.5KB**，房内窗 1630→1612KB／38 条不变；稳定档 `gameActivePerfMs` slow3g **−364.8ms**
  （兑现 123.7%），其余档带内不主张。
- **兼容**：111 个帧名与官方顺序完全保留，6 真帧像素逐字节同官方；结算图集的降级路径继续按名可用；
  清零帧被旧代码误画时只会得到 4×4 透明（不会花屏、不会抛错）。
- **代价**：settings/credits 前场画布出现 **1 LSB**（AE 447/390 px）的板底采样差，已在门禁里取证、
  写理由并换基线；视觉不可辨，其余三态基线零变化。
- **下一轮候选**：删除/降级已被 Mini 取代的 `PopupAssetsSlim.png`（现仅生成器与测试引用，不再过网）、
  机关图集画布随变体帧数缩小（驻留侧）、换关链（advance）的 16MiB 重解码代价入账、
  MenuAssets 1024² 画布随 29 帧缩小（驻留侧，先做 bitmap 字相位核验）。
- 素材再编码（任务 #42）仍是用户保留项，未经裁决不动。
