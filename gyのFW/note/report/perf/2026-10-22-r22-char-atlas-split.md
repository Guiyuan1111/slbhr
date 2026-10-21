# r22 · 把角色图集按消费点拆两张（2026-10-22）

本轮动的是 Boot 阻塞批里最大的一笔：**官方 `CharAssets.png` 714.9KB / 239 帧 / 2048²**，
开始界面真正画出来的只有两个角色的 53 帧。拆成
`CharAssetsMenu.png`（53 帧 152.1KB，留阻塞批）+ `CharAssetsGame.png`（186 帧 461.9KB，走
`loadGameAtlases` 延迟通道），阻塞批前缀线上少付 **565KB**，`Menu active` 在
4g/fast3g/slow3g 分别提前 **1.18s / 3.00s / 9.22s**，落定门（进房）在 fast3g/slow3g
提前 **0.46s / 1.66s**，驻留纹理六态各降 **0.13~0.14MB**，全链总会话字节还净减 **80.3KB**。
off 档两处读数都在噪声带内——包括一条被 10 轮池化推翻的假代价（§六）。

- 代 A（基线）= `7a9e289`：两张产物已在盘上、但 Boot 仍装整张；代 B = 工作树接线后。
- 提交：`536fadc` 素材侧拆张 · `7a9e289` 打包器补末行/右缘隔离带 · `24684b3` 客户端接线 · `9bedda1` regression 缺帧取证。
- 量具：`benchmark/load-ab-era.sh` 三臂链（本轮驱动脚本 `ab-chain-v3.sh`／`ab-repeat.sh`／`mem-chain.sh` 写在 `TEMP/r22`，按项目规矩收口时清理，命令与档位见本节与 §五）；
  判据复算用本轮升入库的 `benchmark/load-ab-bands.mjs`（三条闸门，见 §三/§六）。

## 一、动的是哪一段：阻塞批里最大的一笔像素

件0 勘察（53 帧口径、急切解析、线上/文件两口径）的结论全部抄入本节与 §二，生成器侧口径另记在
`scripts/split-char-atlas.mjs` 头注；那份 TEMP 勘察稿随收口清理。

| 事实 | 读数 | 依据 |
| --- | --- | --- |
| 开始界面绘制/播放的角色帧 | 53 帧，帧面积 1,096,212px = 2048² 画布的 **26.1%** | `MenuScene.ts:80-87` 双角色 `glow0000`+`legs_idle0000`+`head_idle` 播放；`BootScene.buildMenuAnims()` 的 `head_idle` 区间 fire 0..18 / water 0..29 |
| 其余 186 帧 | 跑步/跳跃/坠落/上升/楼梯/死亡烟雾/钻石/机关帧，全部只在房内用 | `GameScene.ts:725`（diamond）、`:1094-1097`、`:1680` |
| 急切解析陷阱 | `anims.create` 在 **Menu 首帧之前** 就把 8 组序列共 216 帧的帧名解析掉 | `Animation.getFrames → textureManager.getFrame`（`Animation.js:454`）；这条决定了"只 defer 135.1KB"的中间方案只值 53 帧方案的 1/4 |
| 拆而非子集副本 | 整张 0.201 B/px，两张合计 0.173 B/px（同一批 239 帧，只差容器） ⇒ **两张相加仍比原图小** | `scripts/split-char-atlas.mjs` 头部回算 + 本次实测文件字节 |

面额三口径（`node scripts/split-char-atlas.mjs --check` 与磁盘字节）：

| 口径 | 代 A | 代 B | Δ |
| --- | --- | --- | --- |
| Boot 窗文件字节 | `CharAssets.png` 714.9 + `.json` 48.7 = 763.6KB | `CharAssetsMenu.png` 152.1 + `.json` 15.5 = 167.6KB | **−595.9KB**（−562.8 png −33.1 json） |
| Boot 窗线上字节 | png identity（`staticGz.ts:30` 只压文本扩展名）＋ json 走 br：715.2（r21 headers 实测 `enc:"-"`，比文件多的是响应头）+ 2.2 = 717.4KB | 152.1 + 0.5 = 152.6KB | **−564.8KB** |
| 全链会话文件字节 | 763.6KB | Menu 167.6 + Game 515.7 = 683.3KB | **−80.3KB**（png −100.9，json +20.6） |

实测窗口少付 **564~565KB**（量具对同一窗口有两处各自取整的存储，见 §七），与 br 取证推出的 564.8KB 相合——线上口径这一栏是自洽的。

## 二、实施：按消费点拆两张 + 注册时机跟着搬

1. **生成器** `scripts/split-char-atlas.mjs`：帧集合的唯一依据是消费点（上表第一/二行），
   shelf 重排、2px 透明隔离带（`GUT`，与 dom-skin 同规格——缩放采样核在帧边界只看透明，与邻帧内容彻底解耦），
   无损证明走**原始样本**回读（`png-raw.mjs` 的 decodePng/cropRaw 逐位相比官方同帧矩形），不做 magick 对拍。
   `--check` 为复现性门禁，本轮 RC=0：**"53帧 152.1KB + 186帧 461.9KB"四件与生成器逐字节一致**。
2. **隔离带修复** `7a9e289`：首版末行/右缘缺隔离带，两张产物重出。这是拆张成案的必要条件——
   整张 2048² 时帧间隔由官方排布给出，换成两张自排图后边缘采样必须自备透明余量。
3. **接线** `24684b3`：
   - `BootScene` 阻塞批 `this.load.atlas(ATLAS_CHARS, "/assets/atlasses/CharAssetsMenu.{png,json}")`（`BootScene.ts:207`）；
   - `loadGameAtlases()` 新增 `ATLAS_CHARS_GAME = "chars-game"` 键（`BootScene.ts:80`），与地面/机关/神殿/弹窗/`FONT_FULL` 同批走延迟通道，已缓存键照旧静默跳过；
   - `buildMenuAnims()` 缩到双角色 `{role}_idle` / `{role}_legs_idle` 两式（`BootScene.ts:269`），房内十一式拆成 `buildCharAnims()`（`BootScene.ts:290`）由 `GameScene.create` 在延迟批落定后注册——**注册时机必须晚于纹理到位**，否则 `Texture.get` 缺帧只 `console.warn` 并回退 `firstFrame`（整张子图集当一帧），且 `buildSeq` 的 `a.exists` 幂等卫会阻止重建（`FINDINGS.md` §5a）。
   - 跨纹理键配动画是安全的：`AnimationState.setCurrentFrame` 逐帧做 `gameObject.texture = frame.texture`（`AnimationState.js:1583`）。
4. **钉死两处对齐**：`packages/client/src/__tests__/char-atlas-split.test.ts` 按调用点分类 + 逐像素回算（期望值由官方 png/json 与两张产物 json 声明的坐标**独立**回算，不共用生成器代码路径），并断言 `BootScene` 源码里那行 `load.atlas(...CharAssetsMenu...)` 字面存在；`9bedda1` 给 `regression.mjs` 加纹理缺帧取证，把"只 warn 的花屏"变成硬失败。
   同 r18/r19 字体两段化那张网。

## 三、`Menu active` 四档实测：与 r20 单价表对得上（误差 ≤4%）

每臂取均值，`Δ = B̄ − mid(Ā, Ĉ)`，判定带取三者最大：**均值带 |Ā−Ĉ|**、**配对带 max_r|A_r−C_r|**、**最差带 max_{r,r'}|A_r−C_r'|**；
主张收益要求 `|Δ| > 最差带` **且** `|Δ| >` 臂B 自身散布。4g/off 用 5 条链 × 2 轮 = **10 轮/臂**，fast3g/slow3g 各 2 轮/臂。

| 档 | n/臂 | Ā | B̄ | Ĉ | Δ | 最差带 | Δ/带 | 臂B 散布 | 判定 | 单价表面额 | 误差 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4g | 10 | 5436 | 4258 | 5446 | **−1182.6ms** | 191 | 6.2× | 229 | 可主张 | −1157 | +2.2% |
| fast3g | 2 | 12871 | 9835 | 12808 | **−3004.3ms** | 148 | 20.3× | 6 | 可主张 | −2892 | +3.9% |
| slow3g | 2 | 39699 | 30468 | 39678 | **−9221.0ms** | 31 | 297.5× | 109 | 可主张 | −9254 | −0.4% |
| off | 10 | 750 | 663 | 635 | −29.6ms | 365 | 0.1× | 340 | **带内 ⇒ 不算差异** | —（非字节绑定档） | — |

面额 = 线上少付 564.8KB × r20 §四单价（4g 2.048 / fast3g 5.12 / slow3g 16.384 ms/KB），
即 `FINDINGS.md` §4 "加上 JSON 换入换出净差"那一行。三档实测与面额同量级（误差 0.4%~3.9%，都落在各自最差带的同数量级内），
本轮没有"少付字节却不见收益"的反例。

## 四、落定门（进房）：fast3g/slow3g 真提前，4g 与 off 带内

落定门只看**页钟绝对时刻** `gameActivePerfMs`。跨度列（`clickPerfMs`、`gameActiveAfterClickMs`）是旁证：
量具的点击锚在 Menu 里程碑上，Menu 提前 ⇒ 点击本身提前 ⇒ "点击到落定"的跨度必然被拉长，不能读成代价。

| 档 | n/臂 | `gameActivePerfMs` Δ | 最差带 | Δ/带 | 臂B 散布 | 判定 | 全链少付 100KB 的面额 | 误差 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4g | 10 | −188.4ms | 309 | 0.6× | 499 | **带内 ⇒ 不算差异** | −205 | — |
| fast3g | 2 | **−460.8ms** | 248 | 1.9× | 47 | 可主张 | −512 | −10.0% |
| slow3g | 2 | **−1655.5ms** | 228 | 7.3× | 84 | 可主张 | −1638 | +1.0% |
| off | 10 | −32.7ms | 866 | 0.0× | 695 | **带内 ⇒ 不算差异** | — | — |

跨度旁证（同一批快照，逐臂均值差）：`clickPerfMs` Δ = −1254.9 / −2923.0 / −9142.3 / −41.2ms，
`gameActiveAfterClickMs` Δ = **+1066.5 / +2462.3 / +7486.8 / +8.5ms**——三个节流档的正跨度与 Menu 里程碑的提前量同量级、符号相反，
正是点击锚定伪影的形状；off 档两处跨度都带内。

**off 档为什么没有收益**（机制，不是运气）：462.2KB 的房内一半加解码没有消失，只是从"点击之前"（Boot 阻塞批）
搬进了"点击→进房"窗口（房内窗条目 37→40，off 档 4786→5250KB）。off 的落定门不受字节数约束（管线绑定：按条目数与解码段数付固定开销），
搬运只是换了窗口；§六 的 10 轮池化证明它也没有可测的代价。

## 五、驻留内存 A/B/A：−0.1378MB 的面额兑现，且堆完全不动

`benchmark/perf-resident.mjs` 走同一套三臂换源码链（与 `load-ab-era.sh` 同式的臂交换＋路径保真还原），臂 A/C = `7a9e289`：

| 状态 | 臂A `texMB` | 臂B `texMB` | Δ | 臂C | `heapGCMB` A/B/C |
| --- | --- | --- | --- | --- | --- |
| menu（暖装落定） | 83.84 | **83.71** | −0.13 | 83.84 | 11.9 / 11.9 / 11.9 |
| temple 首入（冷烘） | 98.77 | **98.64** | −0.13 | 98.77 | 27.2 / 27.2 / 27.2 |
| temple 重进（命中） | 98.77 | **98.64** | −0.13 | 98.77 | 27.2 / 27.2 / 27.2 |
| temple 三进（命中） | 98.77 | **98.64** | −0.13 | 98.77 | 27.3 / 27.3 / 27.3 |
| game（开局静止） | 93.23 | **93.09** | −0.14 | 93.23 | 23 / 23 / 23 |
| temple 离房后 | 98.77 | **98.64** | −0.13 | 98.77 | 28.7 / 28.7 / 28.7 |

- 画布算术：2048² 整张 = 16.0000MB，两张之和 1984×670（5.0708）+ 2044×1384（10.7914）= 15.8622MB ⇒ 应降 **0.1378MB**；
  量具读数是两位小数，六态落在 −0.13~−0.14MB，方向与幅度都对得上。
- `texTop` 由 `chars=16` 变成 `chars-game=10.79`——不是 `CharAssetsMenu` 没驻留，而是 5.07MB 排不进榜单前六。
- **臂 A 与臂 C 逐值相同**：这条轴零漂移，所以 −0.13MB 不是带内抖动。
- `heapGCMB` 六个状态在三臂间逐字节相同 ⇒ 拆张只动纹理显存，不引入堆上的额外持有。

## 六、一条被 10 轮池化推翻的假代价（判据第三条的实例）

2 轮链（r22c）上 off 档的 `gameActivePerfMs` 读数是 **Δ=+287.3ms**，最差带 196ms、臂B 自身散布 88ms——
两道闸门都过，按 §三 的判据当时"可主张"，即"拆张让本地档的进房贵了 0.29s"。

把 5 条链（`r22c` + 复采 `r22d..g`）的逐轮样本池化到 **10 轮/臂** 之后：
**Δ=−32.7ms，最差带 866ms，臂A 散布 526、臂B 散布 695** ⇒ 完全带内，那条代价不存在。

登记进判据（可复跑：`node benchmark/load-ab-bands.mjs off r22c,r22d,r22e,r22f,r22g`）：
> 两条噪声闸门之外，**高漂移档（off 这类管线绑定、臂间散布可达数百 ms 的档）的结论要求 ≥8 轮/臂池化**；
> 2 轮链在 off 档上连"带"本身都框不住——均值带、配对带、最差带都还是未收敛的估计量。
> 反例已入库两次：件1b 的 "+564ms"（`verdict.mjs` 只读 `rounds[0]`）与本轮的 "+287ms"（轮数不足）。

## 七、字节守恒与请求面：搬窗口，不是造字节

| 指标（冷启动，逐轮均值；A/B/C） | 4g / fast3g / slow3g | off |
| --- | --- | --- |
| Menu 窗条数 | 18 / 18 / 18 | 18 / 18 / 18 |
| Menu 窗过网 KB | **2291 / 1727 / 2291**（Δ −564） | 2291 / 1727 / 2291 |
| Menu 窗解码 KB | 3787 / 3191 / 3787 | 3787 / 3191 / 3787 |
| 房内窗过网 KB | 3500 / **3964** | 4786 / **5250** |
| 房内窗条数 | 36 → **39** | 37 → **40** |
| 到落定过网 KB | **5791 / 5691 / 5791**（Δ −100） | 7077 / 6977 / 7077 |
| 到落定解码 KB | 7618 / 7592 / 7618 | 8904 / 8877 / 8904 |

量具对同一个窗口有两处各自取整的存储（`resources.menuKB` 逐条求和后取整、`resources.totalTransferKB` 未取整合计后再取整），
所以 Menu 窗少付读作 **564~565KB**、off 档到落定总量读作 7076~7077KB；本报告一律按 `menuKB`/`gamePhaseKB` 那组列窗口，
律预测用 §一 的 564.8KB，两者在同一个 ±1KB 舍入噪声内，不影响任何判定。

- **条目数守恒形状符合预期**：Menu 窗仍是 18 条（换成子图集，png+json 各一条，不增减请求），
  房内窗 +3 条 = `CharAssetsGame.png` + `.json` + `CharAssetsGame.json` 的一条条件复验。
- 全 12 份快照、48 个相位样本（12 快照 × 2 轮 × cold/warm）：**页面错误 0，真双载 0**。
  唯一新增的重复条目 `CharAssetsGame.json`（第二次 0.0KB 过网，`doubleDownload=false`）与臂A 已有的 5 条 json 复验
  （`GroundAssets/MechAssets/TempleAssets/PopupAssets.json`、`font.fnt`）同一性质——`max-age=0` 是 `staticGz` 有意策略，不是缺陷。
- 静态引用面（无需浏览器即成立）：`grep -rn "CharAssets" packages/client/src/` 只出现
  `CharAssetsMenu.{png,json}`（`BootScene.ts:207`）与 `CharAssetsGame.{png,json}`（`BootScene.ts:80`）两个装载点；
  官方 `CharAssets.{png,json}` 仅存在于测试与生成器的输入侧，**没有任何 `load.*` 引用它**。

## 八、门禁（末轮套件，串行；全部 RC=0 / ALL PASS）

浏览器门禁与 route/journey 的 winAt 读数要求干净 CPU，所以整条套件**串行**跑（本轮驱动脚本在 `TEMP/r22`，随收口清理；
命令逐条列在下面的表里，日志摘要进本节）；vitest 在此之前单独跑完，避免与 `regression` 的 `zz_probe` 夹具抢
`data/tutorials/levels`。

| 门禁 | 结果 |
| --- | --- |
| `npm run typecheck` | RC=0，0 错 |
| `npm run test`（vitest） | RC=0，**20 文件 / 213 用例**全过（58.08s）——含 `char-atlas-split.test.ts` 那张分类＋逐像素回算网 |
| `npm run build` | RC=0，4.54s，入口 `packages/client/dist/assets/index-BZ9iZU0M.js`（sha256 前缀 `041e2a8cb4a09f79`）——**与 A/B/A 臂B 被实测的那份产物同名同哈希**；注释更正后重建仍是 `index-BZ9iZU0M.js`/`041e2a8c…`（minify 剥注释，字节不变） |
| 确定性门禁 `perf-determinism --compare r32` | ✓ **48/48 关位级一致**（48 关合计 3.1s；物理/协议面本轮零改动，仍照跑） |
| 生成器复现性 `split-char-atlas.mjs --check` | ✓ 四件与生成器逐字节一致（53 帧 152.1KB + 186 帧 461.9KB） |
| **canvas 换代入账** `prephase-canvas --save --reason` | ✓ 基线 5 态重写；与上一批的差异经 `pixel-forensics.mjs` 取证＝**合计 23 像素**（menu 13 / settings 5 / credits 5），占 1280×960 的 0.0011%/0.0004%/0.0004%，**逐通道最大级差 1/1/1**，平均绝对差 0.359/0.4，**100% 落在抗锯齿渐变区、平坦区 0 个**，menu 那 13 个集中在 `x[295,993] y[839,889]`（正是双角色脚下那条渐变带）。机制＝POT 2048² 整张换成 NPOT 两幅后的采样/UV 取整变化，非素材像素改动。`temple`/`temple-numbers` 两态逐字节相同 ⇒ 隔离出改动只影响画角色的三态。 |
| `prephase-canvas` 对拍（不带 `--save`） | ✓ **5/5 逐字节**（menu 803758B / temple 279816B / temple-numbers 448929B / settings 327020B / credits 378072B），连续两次全等 ⇒ 新基线可复现 |
| domskin | ✓ **4/4 逐字节**（wide-idle/wide-hover/wide-error/narrow-idle）——DOM 皮肤那张从官方 `CharAssets` 裁 `head_idle0000`，本轮拆张没动它的源 |
| audiofamily | ✓ **14/14**：forest_01 `playing=bgm_level`、forest_12 `playing=bgm_level_speed`，另一族两支零缓存＋零请求，页面零错误 |
| journey | refresh **3/3** · wonrefresh **6/6** · deathretry **4/4** · rejoin **3/3** |
| route（全自动通关） | forest_01 **won**（winAt 39550ms，r21 三次为 39538/39520/39533，带内）· forest_12 **won**（winAt 13014ms） |
| treebake / groundcache | ✓ treebake **9/9**（三张金样逐位一致 3784598315 / 64705792 / 1703026984，阳性对照"改一像素即变指纹"照旧成立）· groundcache **6/6**（地面 1312×992、重开后逐位一致 `297589047→297589047`、零重传） |
| regression（双浏览器真实联机） | ✓ ALL PASS，`errors=0 sync=0` **缺帧警告=0**——`9bedda1` 新加的纹理缺帧取证在本轮首次作为硬门禁跑通，正是拆张最怕的那条静默花屏 |
| 传输面 | 12 份快照 48 个相位样本 **页面错误 0、真双载 0**；三臂 `doubleDownloads` 全空 |

## 九、剩余面额与下一轮

已兑现：阻塞批前缀 −565KB（`Menu active` 提前 1.18s/3.00s/9.22s）、落定门 −100KB（fast3g/slow3g 提前 0.46s/1.66s）、
驻留纹理 −0.138MB、全链会话 −80.3KB。

下一轮候选（面额最大的那条）：**把 `chars-game` 也移出落定门**，手法照 r21 挪循环 BGM——
- 线上面额：`CharAssetsGame.png` 461.9KB 文件（identity，线上约 462.2）+ `.json` 53.8KB 文件 br 后约 0.5~2.7KB
  （该张 br 尺寸未实测，取 Menu 张 0.5KB 与官方张 2.2KB 之间作区间）⇒ 约 **463~465KB**
  ⇒ **4g −948~−952ms / fast3g −2371~−2381ms / slow3g −7586~−7619ms**（落定门口径）。
- 代价形状：`buildCharAnims()` 的注册必须继续推迟到纹理到位（现在它在 `GameScene.create` 内、延迟批之后），
  否则就是本轮 §2.3 那条急切解析陷阱的翻版——角色定格、把整张图集当一帧贴满屏。
  已有的 `char-atlas-split.test.ts` + regression 缺帧取证正是这条路径的护栏。
- 落定门内还有一条要求：延迟批必须进 `bgWarmSettled` 那类落定登记，否则快路径进房缺 diamond/legs/head 帧（`FINDINGS.md` §5a3）。

其他未兑现项（不排队，等裁决）：素材再编码 `scripts/png-opt.mjs --apply` 面额 147.6KB ⇒ 4g −303 / fast3g −756 / slow3g −2421ms（任务 #42，用户保留）；
官方 mp3 重编；`font.png` 子集 ↔ 22 个无字形文案。
