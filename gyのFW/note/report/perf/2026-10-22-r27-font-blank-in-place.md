# r27 · 官方 font.png 未用字形原地清零：房内字体 1600.3→777.0KB，六面逐字节（2026-10-22）

> 目标：把 r24 判负的那笔 1600.3KB 拿回来，同时不触碰 26/36px 的降采样相位。
> 做法：不搬家、不缩放、不改 fnt——114 个房内字形的帧矩形照抄官方 x/y，四周 4px（= fnt padding）环带
> 逐字节照抄，其余像素清零；画布 2191×1024、chunks、`font.fnt` 全部不动。
> 结果：线上 **−823.3KB**（1600.3→777.0KB），房内窗 **2752→1928KB／39 条不变**；
> `gameActivePerfMs` Δ＝4g **−1783.0ms**（最差带 143 的 12.5×）、fast3g **−4242.3ms**（带 216 的 19.6×）、
> slow3g **−13778.5ms**（带 263 的 52.4×），兑现 105.7／100.6／102.1%；off 带内不主张；
> roomtext 六面（18/24/26/36px）**逐字节 PASS**——r24 的 26/36px 相位问题按构造消失；驻留 Δ0。

## 〇、与 r24 的关系：同一个需求集，相反的像素策略

r24 已证明「图集帧字节等价不蕴含位图字上屏等价」：把 114 个字形搬到新坐标后，
18/24px 面级逐字节相同，26px 差 66–81/114 个字形、36px 差 0–54/114，
`gameover` 面 407px、`pause` 面 52px 不同（[2026-10-22-r24-room-font-subset.md](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/note/report/perf/2026-10-22-r24-room-font-subset.md) §四）。
根因是 Canvas 位图字按**绝对源矩形** `drawImage`，Chromium 的降采样核相位依赖该坐标。

r27 反过来做：

| 项 | r24 货架重排（已回退 `966e7a5`） | r27 原地清零（本件） |
| --- | --- | --- |
| 字形坐标 | 全部重排 | **一个不动**（照抄官方 x/y） |
| 画布 | 871×1179 | **2191×1024 不变** |
| fnt | 重写 x/y/scaleW/scaleH（30.2KB） | **官方 font.fnt 原样复用** |
| 线上 | 691.3KB png ＋ 30.2KB fnt（−909.6KB） | **777.0KB png**（−823.3KB，fnt Δ0） |
| 26/36px | 判负 | **六面逐字节** |

少省的 85.7KB（r24 的 png 691.3KB 对 r27 的 777.0KB）就是"不搬家"的保险费：
保住了每个字形的源矩形与滤波邻域，任何字号的采样结果按构造与官方相同。

## 一、实施（件1，`85253c2`）

需求集不变：`scripts/font-subset/room.mjs` 的 114 字符（48 关教学文本选中层 ∪ 行钉字面量 ∪ 数字点），
声明的 258 个字形里保留 114 个。

生成器 [scripts/font-subset/build-font-blank.mjs](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/scripts/font-subset/build-font-blank.mjs)：

1. 解析官方 fnt，`ring = padding[0]`；四边不等则直接失败（本件口径依赖等边环带）。
2. `keepMask` ＝每个保留字形帧矩形 ∪ 四周 ring=4 环带；环带即使属于邻帧也原样保留。
3. 其余像素 RGBA 全 0；重编码后**自检**：画布尺寸、块序、保留面逐字节、清零面全零，
   任一不符即抛错。`--check` 与在库产物逐字节（sha256 见下）。
4. 只写一个 PNG；产品不生成自己的 fnt，客户端继续装官方 `font.fnt`。

| 项 | 官方 | 产物 | Δ |
| --- | --- | --- | --- |
| 线上 PNG | 1,638,701B（1600.3KB） | **795,671B（777.0KB）** | **−843,030B（−823.3KB，−51.4%）** |
| fnt | 31,576B（30.8KB） | 同左（复用） | 0 |
| 画布 / chunks | 2191×1024 | 同左 | 0 |
| 声明字形 | 258 | 258（fnt 不动） | 0 |
| 房内保留字形 | — | 114 / 258 | — |
| 保留面 texel | — | 884,444 | — |
| 保留墨点 / 清零墨点 | — | 578,199 / 1,321,113 | — |
| 解码驻留 | 2191·1024·4＝8,974,336B（8.56MiB） | 同左 | **0** |

装载只换 URL：`loadFontFull` 由 `/assets/fonts/chinese/font.png` 改为 `font-roomblank.png`
（[BootScene.ts:106](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/BootScene.ts#L106)）。
生成器 `--check` 通过：

```
font.png 1600.3KB → font-roomblank.png 777.0KB（−823.3KB，为原体积的 48.6%）
--check PASS sha256=6434548a97d0c02093eb7b3d1a7a1a9551f5671cb1376d1546b8f26517586470
```

静态网 [font-roomblank.test.ts](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/__tests__/font-roomblank.test.ts)
**9 例全过**，独立回算（不调用生成器装配代码）：

- 需求面 6 例：114 字符、48 关教学选中层、磁盘关卡集合、FONT_FULL 调用点分类、stoneButton 六处显式 FONT_FULL；
- 产物面 3 例（:240）：保留面（帧 ∪ ring）逐字节等于官方原坐标＋清零面全 0；幅面/chunks 与官方一致且产品不带自己的 fnt；
  冻结体积 795,671B、258 个声明字形、装载 URL 为 roomblank＋官方 fnt，且 FONT_FULL 不再指向 `font.png`。

r24 的生成器、独立核验脚本与产物（`build-font-room.mjs`、`verify-room.mjs`、`font-room.{png,fnt}`）随本件移除，
roomtext 的指纹/诊断同步换代；r24 报告作为历史留档不动。

## 二、房内像素门禁 `roomtext --compare`：6/6 逐字节

量具＝[scripts/e2e/roomtext.mjs](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/scripts/e2e/roomtext.mjs)
（双页真联机、Canvas 渲染、forest_01、冻屏＋合成步进；判据是同页**同轮双键**：产品现役 `font-full`
对同坐标官方复制体 `font-cmp`，整面截图像素逐字节比）。构建换代后连续三次 ALL PASS，最后一次的记录：

| 面 | 字号面 | ink | bbox | 对象 | 键对拍 |
| --- | --- | --- | --- | --- | --- |
| clock-live | 24 | 2913 | 100×36@(590,63) | 1 | **逐字节相同** |
| clock-initial | 24 | 2913 | 100×36@(590,63) | 1 | **逐字节相同** |
| tutorial-forest01 | 18＋面板 | 80243 | 999×801@(79,98) | 9 | **逐字节相同** |
| gameover | 36＋26 | 23612 | 510×251@(386,185) | 3 | **逐字节相同** |
| end | 面板串 | 5028 | 325×153@(359,531) | 2 | **逐字节相同** |
| pause | 36＋26 | 21006 | 452×238@(415,185) | 4 | **逐字节相同** |

`roomtext[compare]: ALL PASS（6 面产品侧对官方参照逐字节相同）`。
Part B 的 22 条串级探针仍只作诊断（0/22 同像素）——r24 已定案：探针的系统性偏差与图集无关，不判红。

**门禁件自身的启动竞态（量具侧，非产品）**：全套首跑时 roomtext 偶发失败，现场为
`renderer=Canvas / isRunning=true / texPending=0 / scenes=[] / _pending=[]`——Game 已就绪但场景管理器是空的。
读码定位：`Game.step` 没有 `isRunning` 闸，而量具的合成泵在 `__fw` 赋值后立刻开始步进；若此时
Phaser 的 3 张内置 base64 图尚未 onload（`SceneManager.bootQueue` 未跑、`isBooted=false`），
`SceneManager.update → processQueue → add()` 会把 11 个场景原样压回 `_pending`，下一行又把 `_pending` 清零——
场景整批丢失，随后 `bootQueue` 拿到空队列。修复：驱动 `pp.step` 在 `!game.isRunning || !scene.isBooted` 时直接返回；
修复后连续 **6 次** `ALL PASS`。产品侧不经过这条路径（TimeStep 只在 `Game.start()` 之后、即 `bootQueue` 之后才驱动 `Game.step`），
但这是"量具自己会把被测对象弄死"的教训，与 r23 的早入场换屏钉死同属一类。

为什么这次能过：`keepMask` 覆盖了每个保留字形的**完整滤波邻域**（帧＋4px ring），
且所有绝对坐标不变，所以 `drawImage` 的源矩形与降采样核相位与官方逐字节相同；
r24 换坐标后才出现相位差。这不是"面级碰巧相同"，是构造等价。

## 三、四档 A/B/A：面额兑现 100.6%～105.7%

臂 A/C＝`7c481c2`（官方 `font.png`），臂 B＝HEAD（r27）；`FILES=packages/client/src/scenes/BootScene.ts`，
2 轮/臂。快照 `benchmark/results/load-r27-ab-*`（12 份），分析
`node benchmark/load-ab-bands.mjs <档> r27 gameActivePerfMs menuActiveMs`。

| 档 | 臂A→臂B `gameActivePerfMs` | Δ（B̄−mid(Ā,Ĉ)） | 最差带 | 臂B 散布 | 三闸门 | 面额 | 兑现 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4g | 11008 → 9258ms | **−1783.0ms** | 143 | 192 | ①②过 ⇒ 可主张（12.5×带） | −1686.1ms | 105.7% |
| fast3g | 25121 → 20952ms | **−4242.3ms** | 216 | 22 | ①②过 ⇒ 可主张（19.6×带） | −4215.3ms | 100.6% |
| slow3g | 77937 → 64117ms | **−13778.5ms** | 263 | 36 | ①②过 ⇒ 可主张（52.4×带） | −13488.9ms | 102.1% |
| off | 2218 → 1913ms | −123.8ms | 445 | 455 | ①②不过 ⇒ **不主张**（高漂移档 n=2 <8，③亦不过） | — | — |

- 面额＝823.3KB × r20 价签（[2026-10-22-r20-network-tiers.md:116](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/note/report/perf/2026-10-22-r20-network-tiers.md#L116)：
  4g 2.048／fast3g 5.12／slow3g 16.384 ms/KB）。三档误差 +5.7%／+0.6%／+2.1%，第七次复现同一单价表。
- 4g 的 105.7% 高于 100% 不反常：门内仍有部分字节与其他请求并行，本轮省下的 823KB 恰好覆盖了
  原窗口里一段排队尾巴（r24 的 100.6–103.0% 同型）。
- `Menu activeMs` 四档全部落在带内（4g −28.5／fast3g +13.3／slow3g +66.5／off −69.0ms；最差带 94/160/156/232）——
  Menu 阻塞批（1727KB／18 条）两臂恒定，这是本轮自带的对照组。

字节窗口（三档节流读数一致）：

| 项 | 臂A/C | 臂B | Δ |
| --- | --- | --- | --- |
| Menu 窗（阻塞批） | 1727KB / 18条 | 1727KB / 18条 | **0KB / 0条** |
| 房内窗（点击→落定） | 2752KB / 39条 | **1928KB / 39条** | **−823KB / 0条** |
| 到落定累计 | 4478KB / 57条 | **3655KB / 57条** | **−823KB / 0条** |
| 解码字节（Content-Length 之和） | 6383KB | 5559KB | −824KB（取整） |

- 请求数不变（57→57、39→39），省下的是纯字节，不是减少往返。
- **跨轮连续性**：r26 出货后的房内窗就是 2752KB/39、产物入口 `index-CL_bTxBJ`；本轮臂 A/C 逐项复现了这组数
  （同一 bundle），臂 B 换代后 `index-BHsTUBOe`。两轮的窗口账可以直接相接。
- off 档的房内窗总量在 4804／3980／4642KB 之间摆动（臂 A/B/C 各两轮均值）、请求 41–43 条——
  不节流时门后延迟批的一部分会在点击前落完，落点抖动历轮同款（r25 §三注、r24 §三）；
  **off 的窗口总量不作主张**，字节缩减本身与档位无关。

## 四、驻留与代价侧：Δ0

量具＝`benchmark/perf-resident.mjs`（臂A＝`7c481c2` 装载源码＋重建，臂B＝HEAD＋重建；
快照 `benchmark/results/resident-r27-a/b.json`）。

| 状态 | 纹理 MB（A/B） | 音频 MB（A/B） | heapGC MB（A/B） |
| --- | --- | --- | --- |
| menu | 84 / 84 | 6.82 / 6.82 | 12 / 12 |
| temple 首入 | 98.94 / 98.94 | 6.82 / 6.82 | 27.2 / 27.2 |
| temple 重进 | 98.94 / 98.94 | 6.82 / 6.82 | 27.2 / 27.2 |
| game | 93.39 / 93.39 | 21.81 / 21.81 | 23.1 / 23.3 |
| temple 离房后 | 98.94 / 98.94 | 21.81 / 21.81 | 28.7 / 29 |

- 两张图集画布同为 2191×1024，纹理逐源 `w·h·4` 两臂逐项相同（8.56MB）；heapGC 的 ≤0.3MB 差是同臂噪声，
  不构成"驻留变化"。
- 无新增请求、无新增常驻对象、无新增解码。官方 `font.png` 仍留在 `public/` 与 dist（生成器需要它），
  运行时没有任何 URL 指向它。
- 行为面零改动：清零字形从不被绘制；若未来出现新的房内消费者，静态网的调用点分类与需求集回算会先失败，
  不会静默画空白。

## 五、门禁（末轮套件）

串行执行（浏览器类步骤互斥，vitest 不与 regression 抢 `zz_probe` 夹具），22 步全 **exit=0**，本机约 7 分钟：

| 步骤 | 读数 |
| --- | --- |
| typecheck | 0 错 |
| `build-slim-atlas --check` | 三张 Slim PNG 与重建逐字节（152.9／229.5／249.3KB） |
| `split-char-atlas --check` | 六件逐字节（53 帧 152.1KB ＋ 7 帧 28.3KB ＋ 182 帧 442.4KB） |
| `reflow-prephase --check` | png 字节一致 ✓ fnt 字节一致 ✓ |
| `build-font-blank --check` | PASS sha256=6434548a…（795,671B／保留 114/258／ring 4） |
| build | ✓ built in 4.59s；`index-BHsTUBOe.js` 101.41KB（gzip 34.57KB） |
| vitest | **22 文件／240 用例**全过（r26 241 − r24 的 font-room 10 ＋ 本轮 9） |
| det（`perf-determinism --compare r32`） | **48/48** 关位级一致（合计 2.6s） |
| `roomtext --compare` | **6/6 面逐字节**（clock-live／clock-initial／tutorial-forest01／gameover／end／pause）；换护栏后连续 6 次 ALL PASS |
| `prephase-canvas` | **5/5 态逐字节**（menu 803758B／temple 279816B／temple-numbers 448929B／settings 327020B／credits 378072B）；产物换代到 `index-BHsTUBOe` 后像素不变 |
| `domskin` | 4/4 逐字节（232567／240320／235029／153209B） |
| `audiofamily`（off） | **22 项 ✓** |
| `charsplay`（off） | 21 项 ✓（含停答阴性对照） |
| `treebake` | 9/9 金样一致 |
| `groundcache` | 6/6 |
| `journey` refresh／wonrefresh／deathretry／rejoin | 3/3 · **6/6** · **4/4** · 3/3 |
| `route` forest_01／forest_12 | won=true，winAt 39517／13459ms（r26 为 39520／13061ms，玩法时点未动） |
| `regression`（zz_probe walkin-doors，`--expect-win`） | won=true errors=0 sync=0 缺帧警告=0 |

- `roomtext` 首轮曾以 `scenes: []` 超时判红，归因为量具泵与 Phaser 启动链的竞速（§二末段），
  修好后独立压测 6 次全 PASS，末轮套件里再 PASS；产品代码无涉。
- 像素面是"坐标不动＋滤波邻域原样"构造兑现的：canvas 五态与 domskin 四态都是**逐字节**，det 48 关是**位级**。
- 这条改动的失效模式（某字形被误清零而仍被绘制）在冷启动里只表现为"某处空白"，不会报错；
  真正的护栏是 §一的静态网与需求集回算，门禁只是第二道。

## 六、剩余面额与下一轮

r27 之后房内窗的大件构成（off 档快照，单项相加与窗口总量不必逐字节相等，同 r26 注）：

| 字节 | 条目 | 状态 / 归属 |
| --- | --- | --- |
| 777.0KB | `/assets/fonts/chinese/font-roomblank.png` | r27 已 ship；仍是房内第一笔 |
| 442.7KB | `CharAssetsPlay.png` | r23 已出门，仍在房内窗 |
| 249.3KB | `PopupAssetsSlim.png` | r26 已清零 |
| 229.5KB | `TempleAssetsSlim.png` | r26 已清零 |
| 153.2KB | `MechAssetsSlim.png` | r26 已清零 |
| 93.0KB | `GroundAssets.png` | — |

下一轮候选（按可做性排序）：

1. **字体按关清零**：r24 的逐关表已经给出需求差——46/48 关只有 27 个字符（行钉＋数字），
   教学层只在 forest_01 与 forest_bonus_1 两关出现（114 字符）。用同一原地清零口径，
   给 46 关再造一张只保留 27 字的变体（PNG 预计 1/3 量级），按关选装载 URL。
   代价：多一张产物、多一个按关选择的分支（消费方已在关卡上下文里）；**量具必须把
   `perf-load` 的 level 切到非教学关**才能看到这笔（现口径 forest_01 是教学关，看不到）。
2. **Popup 结算板拆张**：249.3KB，结算发生在房内后期，与 r23 chars-play 同型（按消费点延后装载）。
3. **MenuAssets 同类清零**：191.5KB，菜单段最后一笔非必要图集；`Button` 名是动态拼接，
   先把消费口径钉死再做。
4. **MechAssets 按关装载**：清零后只剩 153.2KB，上限变小；48 关 24 种子集，需要"关卡确定后装载"的新机制。
5. `font-roomblank` 再压：只剩重排/降采样两条路，均被 r24 的相位结论挡住；除非 `font-phase-probe` 过关，
   否则不再动坐标/尺寸。

素材再编码（任务 #42）仍是用户保留项，未经裁决不动。
