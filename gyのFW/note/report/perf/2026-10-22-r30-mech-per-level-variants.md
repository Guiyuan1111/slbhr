# r30：机关图集按关变体（MechAssets 48 关归并 24 个子集，风区只给 15 个风关）

> 日期：2026-10-22 · 版本线：0.3.43 · 量具：`benchmark/perf-load.mjs`（四档 A/B/A，延迟自检改为页内墙钟探针）、
> `benchmark/load-ab-bands.mjs`（三闸门）、`benchmark/perf-resident.mjs`（驻留）、
> `scripts/split-mech-atlas.mjs --check`（复现性）、配套运行时接线探针（TEMP，不入库）。
>
> 结果：进房阻塞图集 `MechAssetsSlim.png` 按关换成变体，`forest_01` 实取
> **PNG 153.2KB＋JSON 2.2KB → 34.0KB＋0.8KB（线上 −120.6KB/关）**；全 48 关加权原始字节
> **190,174→64,553B（−122.7KB/关，−66.1%）**。
> `gameActivePerfMs` Δ＝fast3g **−558.0ms**（最差带 241 的 2.3×，面额兑现 90.4%）、
> slow3g **−1918.8ms**（带 141 的 13.6×，兑现 97.1%）、off −168.8ms（带内不主张）；
> 4g 机械闸门过但字节窗被 chars-play 442.7KB 的装载竞态污染，本档**不作主张**（证据见 §四）。
> 驻留：Menu 暖装落定 **75.45→59.45MB（−16.00MB）**、temple 首入 **90.38→74.38MB（−16.00MB）**；
> Game 态 95.35MB 两臂一致（机关画布只在关卡定出后装）。

## 一、为什么按关切：整关共用图集里，单关最多只消费 67 帧

r26 把官方 `MechAssets.png` 的零消费帧原地清零成 `MechAssetsSlim.png`（483,809→156,558B），
但 Slim 是**全部 48 关的并集**：163 帧里保留 67 帧，单关实际消费 9–53 帧。
本关不消费的帧仍占线上的字节与 16MiB 解码画布，而机关图集又跟着进房阻塞批一起过网。

r28 已经证明「按关变体」这条路对字体成立；本轮的判据是**同一张图集里，帧集合由关卡数据唯一决定**：

| 面 | 取值 | 帧数 |
|---|---|---:|
| 机关首帧/事件帧 | 按 `levers/pushers/boxes/balls/platforms/hangings/pulleys/romans/windows` 字段取（`GameScene.buildMechs` 的消费面） | 2–19 |
| 风区动画 | `wind_base0000-0003`＋`wind_effect0000-0029`，只给 15 个有风关 | +34 |
| 零机关关 | `forest_06`／`forest_06_1`，只需一张合法纹理 | 1（占位） |

48 关按帧集合归并成 **24 个变体**（最大一组 5 关，9 个变体各只服务 1 关）；8 个风变体覆盖 15 个风关。
帧集合哈希用 FNV-1a 32 位，生成器与运行时共用同一函数，**不存在清单文件**。

## 二、实施

| 件 | 内容 |
|---|---|
| 生成器 | `scripts/split-mech-atlas.mjs`：从 r26 的 `MechAssetsSlim.png`＋官方 JSON 重打包 24 张 `MechAssets-<id>.{png,json}`。画布仍是 2048²，保留帧的 `frame/sourceSize/trimmed/rotated` 与像素逐字节照抄，其余帧矩形原地清零；逐帧回读取证（保留帧与 Slim 同矩形逐字节相等、非保留帧全 0、占位帧全 0）才落盘。`--check` 重建到 TEMP 与在库 48 件比字节。 |
| 口径 | `packages/shared/src/mech-needs.ts`：`mechNeed()`（首帧/事件帧）、`mechAtlasFrames()`（含风区与占位规则）、`mechVariantId()`（FNV-1a）；生成器、客户端、静态网三方共用。48 关并集必须等于 r26 `keep.mech`（67 帧），其余 96 帧在所有变体里都属清零面。 |
| 装载 | `BootScene.loadMechAtlas(load, level)`：变体 id 由关卡当场算出，URL 直取 `/assets/atlasses/mech/MechAssets-${id}.{png,json}`。换变体前 `textures.remove("mech")` 并移除 `wind_base`/`wind_effect` 动画——Phaser 拒绝同键重载，且 `AnimationFrame` 在注册时已解析成旧纹理的 Frame，不卸干净会继续播旧变体的帧。同变体重入（重开同关）零传输。 |
| 装载点 | `GameScene.preload` 声明本关变体（邀请深链/暖装已落定路径）；`main.ts` 在关卡定出后调 `warmMechFor(currentLevel)`，把变体补进**仍在飞的暖装门**（与 `warmRoomFontFor` 同形，落定后 no-op）。`loadGameAtlases` 不再声明机关图集。 |
| 风动画 | `buildGameAnims(anims, { wind: level.winds.length > 0 && textures.exists("mech") })`：非风关不注册 `wind_base`/`wind_effect`，避免解析到不存在的帧（Phaser 会落到 `__BASE` 花屏）。 |
| 静态网 | `packages/client/src/__tests__/mech-variants.test.ts`（9 例）：24 变体/48 关三方一致、风区只进 15 关、并集＝67 keep、目录无孤儿、逐帧像素与清零面、几何等价前提、装载点与卸载顺序、风动画按关注册；`atlas-slim.test.ts` 台账同步。 |

产物（与 r26 Slim 同像素、同坐标）：

| 产物 | 件数 | 画布 | 原始字节 |
|---|---:|---|---:|
| `MechAssetsSlim.png`（r26，本轮起不再进房） | 1 | 2048² | 156,558B |
| `MechAssets-*.png`（按关变体） | 24 | 2048² | 1,519,479B（合计） |
| `MechAssets-*.json` | 24 | — | 110,607B（合计） |

变体经济性：最小 16,704B（零机关占位）、最大 138,033B；48 关**加权原始均值 64,553B/关**
（按各变体服务的关数加权，总 3,098,563B）对 Slim 的 190,174B/关（=156,558＋33,616）——
**每关 −125,621B（−122.7KB，−66.1%）**。`forest_01` 的 `cf05af57` 为 37,291B（PNG 34,525＋JSON 2,766）。

## 三、字节账：房内窗 −120.6KB/关，逐请求少一条

- **线上字节**（`forest_01`，稳定档两轮均值）：臂 A 取 `MechAssetsSlim.png` 153.2KB＋`MechAssets.json` 2.2KB
  （重进房 0KB）；臂 B 取 `MechAssets-cf05af57.png` 34.0KB＋JSON 0.8KB ⇒ **−120.6KB/关**。
- **稳定档逐请求窗口**（fast3g/slow3g，两轮均值）：Menu 窗 1727→1728KB／18 条（新增构建 JS 的哈希差，自带对照）；
  `到落定` 3477→3357KB／**57→56 条**；**房内窗 1750→1630KB／39→38 条**；解码 5383→5203KB。真双载＝0、页错＝0。
- **单会话净字节**：变体就是本关全部机关字节，没有「延后再取」的尾巴，也没有跨关叠加——
  换关时旧纹理先卸、再声明新变体（一个会话最多驻留一张 16MiB 解码画布）。
- 4g 的字节窗差 −563KB 是本轮唯一不能用字节账解释的读数：其中只有 −120.6KB 是机关，
  另有 chars-play 442.7KB 的装载竞态（见 §四），故 4g 不作主张。

## 四、四档 A/B/A（2 轮/臂；臂 A/C＝`2c3a170`，臂 B＝`55ba2cb`；量具修复＝`bfad472`）

`FILES` 含四个运行时改动面（`BootScene.ts`、`GameScene.ts`、`main.ts`、`packages/shared/package.json`）
与 48 件变体产物；`load-ab-bands.mjs <tier> r30 gameActivePerfMs menuActiveMs`。
Δ＝B̄−mid(Ā,Ĉ)，三闸门：①Δ 超最差带 ②Δ 超臂 B 散布 ③高漂移档 n≥8。

| 档 | gameActive Ā/B̄/Ĉ | Δ | 最差带 | 臂B散布 | Δ/带 | 判定 | 面额 | 兑现率 |
|---|---|---:|---:|---:|---:|---|---:|---:|
| fast3g | 20110/19520/20045 | **−558.0ms** | 241 | 41 | 2.3× | ①②过 ⇒ 可主张 | 617.5ms | 90.4% |
| slow3g | 61172/59269/61204 | **−1918.8ms** | 141 | 66 | 13.6× | ①②过 ⇒ 可主张 | 1976.0ms | 97.1% |
| 4g | 9527/8732/9617 | −840.5ms | 617 | 131 | 1.4× | 机械闸门过，但字节窗混入 chars-play 442.7KB ⇒ 不作主张 | 247.0ms | — |
| off | 2477/2036/1932 | −168.8ms | 934 | 605 | 0.2× | 带内 ⇒ 不算差异 | — | — |

- `Menu activeMs`：fast3g −19.0（带 153／臂B 64）、slow3g +44.0（带 178／臂B 115）、
  4g −32.8（带 135／臂B 185）、off −34.8（带 312／臂B 162），全部落在带内；
  Menu 窗 1727/1728KB／18 条三臂一致，自带对照证明改动只在房内路径。
- 面额按 120.6KB×5.12＝617.5ms（fast3g）、×16.384＝1976.0ms（slow3g）计；与 r25–r29 同型，
  机关字节原本就在门内排队，兑现率接近上界（90.4%／97.1%）。

### 量具修复：RT TTFB 测不到 CDP 延迟，字节更少的臂会假阴性

本轮首次跑 fast3g 臂 B 时，`perf-load` 的旧延迟自检连拦两次（TTFB 中位数 38.6／42.4ms ＜0.5×rtt＝75ms）。
隔离实验（TEMP，非改量具）：

- 页内 `fetch` 连续请求 12 次 1KB，**墙钟 155.8–161.4ms**，而 Resource Timing 的
  `responseStart−requestStart` 只有 0.8–2.1ms；导航条目 `ttfb=6.4ms`。
- 原因：CDP `Network.emulateNetworkConditions` 的 latency 施加在 Resource Timing
  `fetchStart` 之前，TTFB 量到的是**带宽排队**而不是 RTT——短请求几乎没有排队，
  长请求（A/C 的 153.2KB Slim）才有。于是「字节更少」的臂 TTFB 反而更小，被旧判据读成节流失效。

修复（`bfad472`）：冷启动段改为页内墙钟探针 `probeLatencyWall`（1KB fetch 的 `performance.now()` 差），
要求 ≥0.5×rtt；带宽判据保留；旧 TTFB 只作排队旁注。阴性对照 `FW_NET_NOOP=1`
（探针绕过节流）读数为壁钟 6.9ms、响应体 3ms，必定失败——证明新判据可红。

修复后的读数（最终快照）：

| 档 | 楼层 | 臂 A/C 墙钟 | 臂 B 墙钟 | 旧 TTFB（B） |
|---|---:|---|---|---:|
| fast3g | 75ms | 221.9/236.7／219.4/196.7 | 199.6/225.5 | 39.2/16.1（旧判据会误杀） |
| slow3g | 200ms | 544.8/569.0／582.2/577.6 | 541.9/540.8 | 40.2/37.0（旧判据会误杀） |
| 4g | 40ms | 94.9/93.1／100.6/93.7 | 114.3/116.6 | 40.9/4.8 |

A/C 的 TTFB（fast3g 106–126ms、slow3g 339–387ms）高于 B，正是带宽排队差异的直接证据。
该修复对 A/B/A 的臂间比较只增不减：它解除了「字节少反而被判节流失效」的偏置。

### 4g 混杂：chars-play 442.7KB 在 A/C 的窗内、B 的窗外

4g 的三臂字节窗：`到落定` A/C 3920KB／56 条、B 3357KB／56 条（−563KB）。逐 URL 差：

| URL | A | B | C |
|---|---:|---:|---:|
| `MechAssetsSlim.png` | 153.2KB | 0 | 153.2KB |
| `MechAssets-cf05af57.png` | 0 | 34.0KB | 0 |
| `CharAssetsPlay.png` | 442.7KB | 0 | 442.7KB |
| 构建 JS（旧/新哈希） | 32.9KB | 33.5KB | 32.9KB |

`charsPlayInWindow` 三态读数：fast3g/slow3g **三臂全 none**；4g **A/C 为 before-gate（到达 −1400/−1401、
−1438/−1590ms），B 为 none**；off 三臂均 before-gate（该档本身就不可判）。

为什么不能归因于机关字节：chars-play 在**暖装门 `complete` 之后**才入队，且只在 Menu 仍 active 时入队；
它出现在窗内，说明该臂的门在 enterGame 之前就已落定、这张图在 Menu 驻留期完成预取。A 从暖装起步就声明了
153.2KB 的 Slim；B 的 34.0KB 变体只在关卡定出后补入（门若已落定则不补，改由 `GameScene.preload` 取）——
无论哪种情形，B 的门负担都不重于 A。若机关字节是决定因素，B 的门只会更早或同样早落定，
chars-play 更该在窗内；观测到的是相反顺序。故这次翻转记录的是 enterGame 落在门落定之前/之后，
是 r23/r28 已登记的装载竞态，不是本轮的字节收益。按「不作主张」处理，4g 的面额 247.0ms 只作上界。

## 五、驻留对账（`perf-resident`，forest_01，A/B 各一次）

| 状态 | 臂 A（Slim 进暖装门） | 臂 B（按关变体） | Δ |
|---|---:|---:|---:|
| Menu（暖装落定）纹理 | 75.45MB | **59.45MB** | **−16.00MB** |
| temple 首入（冷烘）纹理 | 90.38MB | **74.38MB** | **−16.00MB** |
| temple 重进/三进纹理 | 90.38MB | 74.38MB | −16.00MB |
| Game（开局静止）纹理 | 95.35MB | 95.35MB | 0 |
| Game canvas 纹理 | 9.38MB | 9.38MB | 0 |
| Game 堆（强制 GC） | 23.1MB | 23.0MB | −0.1MB（噪声） |
| temple 离房后纹理 | 100.9MB | 100.9MB | 0 |

−16.00MB 就是机关图集的 2048² 解码画布（16,777,216B）：A 在 Menu 暖装时就装它，
B 只在关卡定出后装。Game 态两臂一致，因为变体画布同样 16MiB——**本轮省的是线上的字节与
「关卡未定就占着 16MiB」的时间窗，不是 Game 期驻留**。离房后两臂一致，说明变体没有被额外复制。

## 六、运行时接线探针（TEMP，不入库）

`TEMP/r30-probe.mjs`（off 档）：

- `forest_03`（有风）：纹理 `84cba11e` **36 帧＋`__BASE`**，与变体 JSON 完全一致；`wind_base`/`wind_effect` 已注册；
  网络只取本关变体两张，**不取 `MechAssetsSlim`**。
- 同会话换到 `forest_01`（无风）：纹理切到 `cf05af57` **14 帧＋`__BASE`**；`wind_base`/`wind_effect` 已从 AnimationManager 移除；
  两变体各两张、无重复下载；仍不取 Slim。
- `forest_06`（零机关）：纹理仅 `mech_empty0000`＋`__BASE`，无风动画，只取 dummy 变体。
- 全程页面错误 0。

## 七、门禁（末轮套件）

串行执行（浏览器类步骤互斥，vitest 不与 regression 抢 `zz_probe` 夹具）；生成器步骤按头注用 `node --import tsx`。

| 步骤 | 读数 |
| --- | --- |
| typecheck | 0 错 |
| `build-slim-atlas --check` | 三张 Slim 与重建逐字节 |
| `split-char-atlas --check` | 六件逐字节（53/7/182 帧） |
| `reflow-prephase --check` | png/fnt 字节一致 |
| `build-font-blank --check` | 两变体 PASS |
| `split-popup-finish --check` | 六件逐字节（29/29/28 帧） |
| `split-mech-atlas --check` | 24 件逐字节（48 关→24 子集；PNG 1,483.9KB＋JSON 108KB） |
| build | `index-tJp2omno.js` 104.83KB／gzip 35.72KB |
| vitest | **24 文件／268 例**全过 |
| det（`--compare r32`） | 48/48 位级一致 |
| roomtext forest_01／forest_12 | 6/6／5/5 面逐字节 |
| prephase-canvas | 5/5 画布逐字节 |
| domskin | 4/4（wide×3＋narrow） |
| audiofamily（off） | 22 项 |
| charsplay（off） | 21 项 |
| treebake | 9/9 |
| groundcache | 6/6 |
| journey refresh／wonrefresh／deathretry／rejoin | 3/3 · 6/6 · 4/4 · 3/3 |
| route forest_01／forest_12 | 各 1 轮 won=true |
| regression（zz_probe walkin-doors） | won=true，errors=0，缺帧=0 |

末轮 25 项命令全部 EXIT=0（`GATES-A DONE fail=0`／`GATES-B DONE fail=0`）。

## 八、结论与下一轮候选

- **可主张**：fast3g −558.0ms（2.3×带）、slow3g −1918.8ms（13.6×带），兑现 90.4%–97.1%；
  线上 −120.6KB/关、48 关加权原始 −122.7KB/关；Menu 暖装与 temple 首入驻留 **−16.00MB**；
  机关像素、风动画、跨变体换关与零机关关接线全部通过。
- **代价**：Game 态驻留不变（变体画布同为 16MiB）；跨变体换关（结算「继续」）会重解码一张 16MiB 画布
  （同变体重开零传输）——本轮未单测换关链，收益/代价只覆盖进房路径。
- **不作主张**：4g（chars-play 442.7KB 装载竞态污染字节窗，机械闸门过也不读作收益）、
  off（带内、n=2）。量具修复（`bfad472`）解除的是「字节少反而被判节流失效」的假阴性，不改变臂间字节账。
- **下一轮候选**：MenuAssets 同类原地清零（191.5KB）、Popup 主图集 2048² 画布随 6 帧缩小（驻留侧）、
  机关图集画布随变体帧数缩小（本轮驻留代价的另一半，需与 r26 坐标口径一并裁决）、
  换关链（advance）的 16MiB 重解码代价入账。
- 素材再编码（任务 #42）仍是用户保留项，未经裁决不动。
