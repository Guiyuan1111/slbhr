# r24 · 把房内位图字体换成"房内需求子集"：官方 font.png 不再进房（2026-10-22）

口径与判据沿用 r20/r21/r23/r25：里程碑只有冷启动 `Menu active` 与**点击建房→`Game active`**（页钟绝对值
`gameActivePerfMs`），弱网档这两段都是字节账的函数（每 KB 价签 4g 2.048ms、fast3g 5.12ms、slow3g 16.384ms，
`2026-10-22-r20-network-tiers.md:116`）。臂序 A/B/A（臂C＝臂A 同代复测，框住本机漂移），三臂同档位、同机、
同一时间窗；跨臂 ms 差只有超出同臂最差带、且大于臂B 自身散布才算差异（高漂移档要求 ≥8 轮/臂池化）。

- 臂A＝本轮实施前的现役代次（`bb2334d`，`FONT_FULL` 指官方 `assets/fonts/chinese/font.png`）
- 臂B＝`FONT_FULL` 指生成物 `font-room.png`／`font-room.fnt`（键与全部消费点不动，只换装载 URL）
- 档位 `forest_01`（general 族，唯一带教学文本的两个关卡之一），四档串行，同时只有一个浏览器作业

## 〇、件0：房内到底需要哪些字（勘察与面额，不含任何产品代码）

件0 的量具曾放在 `TEMP/r24/`（`census-room.mjs` 需求推导 + 同口径图集测量、`census-room.json` 结构化账目、
`critical-path.json` 关键路径归因，数据源＝r25 的 12 份 `benchmark/results/load-r25-ab-*.json` 快照，未重跑）；
按项目惯例已随轮次收尾清理，账目固化在本节表格。可复跑的量具留在仓库：`scripts/font-subset/`（口径/生成/核验）
与 `benchmark/font-phase-probe.mjs`。

### 一、需求侧：三类来源，114 个字符，且**没有一个字符今日画不出**

`assets/fonts/chinese/font.png` 是 2191×1024／1,638,701B（线上 transferSize 1600.6KB），配 `font.fnt` 31,576B
（声明 260 条 `<char>`，其中 258 条有帧；`padding="4,4,4,4"`），纹理解码驻留 2191×1024×4 = 8,973,824B = **8.56MB**。
它由 `BootScene.loadFontFull()`（[packages/client/src/scenes/BootScene.ts:79-81](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/BootScene.ts#L79)）
以 `FONT_FULL` 键装载，消费点在 `GameScene`（教学文本 + 时钟）与三块面板（暂停/结算/失败），
静态网已经把"房内一律 FONT_FULL、房前一律 FONT_MAIN"钉死（[packages/client/src/__tests__/font-prephase.test.ts:39](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/__tests__/font-prephase.test.ts#L39)）。
把这三类来源逐一取尽，结果：

| 来源 | 怎么取的 | 字符数 |
| --- | --- | --- |
| 关卡教学文本（`GameScene.ts:1472`） | 用**客户端同一个** `parseLevel`（[packages/shared/src/level2.ts:326](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/shared/src/level2.ts#L326)）遍历 `data/forest/temple.json` 的 48 关；取层规则照抄 [:566-595](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/shared/src/level2.ts#L566)（`Tutorial_keyboard ?? Tutorial_dual ?? Tutorial_single ?? 首个`） | 91 |
| 面板/时钟字面量（9 处调用点） | **行钉**：逐条断言该文案仍在那一行（`overlays.ts:186/193/204/210/332/356/363/374`、`GameScene.ts:1572`） | 27 |
| 动态数字点（2 处） | 行钉 `GameScene.ts:1610` `mmss(clockSec)` 与 `overlays.ts:298` `limitStr` ⇒ `0123456789:` | （已含在上一行） |
| **并集** | | **114**（教学∩字面量 4） |

三条必须记下来的事实：

1. **48 关里只有 2 关有教学文本**：`tutorials/levels/forest_01.json`（temple id=1，11 条文本对象）与
   `forest/levels/forest_bonus_1.json`（id=64）。其余 46 关的房内位图字只有时钟 + 面板 ⇒ 只需 27 字符。
   48 关去重后**只有 3 种图集**。`data/` 磁盘上的关卡文件与 temple.json 的 `levels[].filename` 一一对应（各 48，无孤儿）——
   这条要钉进静态网，因为"按关有没有漏字"完全依赖它。
2. **114 个字符在官方 `font.fnt` 里全都有帧**，0 个"今日也画不出"的漏字。所以换子集不会产生任何新的空白面；
   子集与全量在"房内会画到的字"上逐像素同源（见下面的守恒断言）。
   对照：进房前子集那代有 23 个字符 fnt 里没字形（`NO_GLYPH_TODAY`，[font-prephase.test.ts:48](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/__tests__/font-prephase.test.ts#L48)），
   房内这一侧没有这种历史包袱。
3. **教学层的"选中一层"口径省了 4 字符**：48 关里 `Tutorial_dual`/`Tutorial_single`/`Tutorial_keyboard` 三种层名都出现过，
   但客户端每关只取一层。r23 草稿把**所有** `Tutorial_*` 层并进来（118 字符），按那个口径出的图集要多付 32.1KB。
   草稿还把 `temple.json` 的 `filename`/`type` 当需求源，带进 `/f_.jz` 等 6 个根本不渲染的字符——件0 把这类噪声清掉了。

### 二、面额：同一套 r19 打包口径下，房内图集是官方图集的 44.2%

测量口径与 `scripts/font-subset/reflow-prephase.mjs` 完全一致（区域＝帧矩形 ∪ ring=4 环带、货架打包 spacing=2、
未保留声明共用一块透明块、拒绝宽高同为 2 的幂的幅面、逐区域回抄源字节、`.fnt` 只改 `x`/`y`/`scaleW`/`scaleH`）。

| 字形集 | 有帧字形 | 幅面 | png | fnt | 合计线上 | 解码驻留 | 帧密度 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **房内需求 114 字符** | 114 | 871×1179 | 691.3KB | 30.2KB | **721.6KB** | **3.92MB** | 74.94% |
| 房内 ∪ 房前（167 字符，单图集兼两用） | 144 | 1787×685 | 797.5KB | 30.4KB | 827.9KB | 4.67MB | 74.57% |
| r23 草稿口径（全部 `Tutorial_*` 层，118 字符） | 118 | 586×1827 | 723.5KB | 30.3KB | 753.7KB | 4.08MB | 74.71% |
| 现役 `font-prephase`（同口径复现，对照） | 52 | 1006×378 | **242.4KB** | 30.0KB | 272.4KB | 1.45MB | 69.97% |
| 官方 `font.png`（现役 FONT_FULL） | 258 | 2191×1024 | 1600.3KB | 30.8KB | **1631.1KB** | **8.56MB** | 94.79% |
| 逐关：46 关（只 27 字符） | 27 | 487×489 | 164.6KB | 29.9KB | 194.5KB | 0.91MB | 66.88% |
| 逐关：forest_01（id=1） | 112 | 2025×499 | 666.1KB | 30.2KB | 696.3KB | 3.85MB | 74.69% |
| 逐关：forest_bonus_1（id=64） | 39 | 871×392 | 232.3KB | 29.9KB | 262.2KB | 1.30MB | 74.94% |

**口径自证**（这条比任何解释都硬）：把现役房前子集的字形集喂进同一套测量，得到的 png 字节 **248,196B 与在库
`assets/fonts/chinese/font-prephase.png` 逐字节相等**、幅面同为 1006×378。所以本表的"官方 → 房内"差额不是两套算法之差，
是同一把尺上的两端。

面额（方案 A，见下节）：**线上 1631.1KB → 721.6KB（−909.6KB，−55.8%）**、**驻留 8.56MB → 3.92MB（−4.64MB）**。
按 r20 价签换算的名义进房收益：4g **−1862.9ms**、fast3g **−4657.2ms**、slow3g **−14904.1ms**。

### 三、关键路径归因：它不是"最后到的那一条"，它是这条管道半壁的忙时

件0 之前我先按"最后一笔"去核，核出来是**反的**，这里如实写。r25 臂B 的房内窗（点击→落定，4g r1）实测：
39 条 / 3207.3KB，其中

| 字节 | 条目 | 过网时刻（页钟） | 比落定门早 |
| --- | --- | --- | --- |
| **1600.6KB** | `font.png` | 4374 → 11103ms | 781ms |
| 472.8KB | `MechAssets.png` | 4374 → 8678ms | 3206ms |
| 334.4KB | `PopupAssets.png` | 4374 → 8237ms | 3647ms |
| 281.1KB | `TempleAssets.png` | 4374 → 7712ms | 4172ms |
| 0.3KB | `CharAssetsPlay.json` | → 11880ms | **4ms**（真正最后到的一条） |

`gameActivePerfMs`＝11884ms。四档臂B 的同一形状：`font.png` 落地时刻比落定门早 781／755／856／943ms（4g/fast3g/slow3g/off），
最后一笔始终是 `CharAssetsPlay.json` 那条 0.3KB 的清单。但 `font.png` 占房内窗**字节的 49.9%**（4g/fast3g/slow3g）、
起点就在点击后几毫秒、单条就铺满大半个窗口（4g 6.7s、fast3g 16.8s、slow3g 54.0s），而落定门等的是**整批**。
所以本轮的判据不是"搬掉最后一个"，而是"砍掉这条管道忙时的一半"——这与 r25 那句"他们不是最后一个到的，但落定门等的是整批"
是同一条归因律，只是方向相反：r25 搬走的是**不占关键路径字节主体的尾巴**（所以兑现 94%～101%），
本轮动的是**字节主体本身**，兑现率要等实测才能写，不许先引用价签当结论。

### 四、三个候选方案，选 A

| 方案 | 形状 | 主测关 forest_01 | forest_12 | 会话累计 | 房内驻留 | 新增机制 |
| --- | --- | --- | --- | --- | --- | --- |
| **A（选）** | 一张房内并集聚集，`FONT_FULL` 换 URL | 721.6KB | 721.6KB（同源，缓存内复用） | 721.6KB | 3.92MB | 仅生成器 + 静态网 |
| B | 按关出图（46 关 194.5KB / 2 关自持） | 696.3KB | 194.5KB | 890.8KB | 最坏 4.76MB | 关卡→图集表、换关可能再取一份 |
| D | 面板 27 字符拆出、只留时钟+教学在房内批 | ≈610KB | ≈110KB | 更少 | 更小 | 面板自备装载 ⇒ 面板文字延后上屏 |

选 **A** 的数字理由：B 在主测关只比 A 少 **25.3KB**（4g 51.8ms，落在历轮同臂最差带之内；r25 4g 带 127ms），
却在会话累计上更贵（890.8KB > 721.6KB）、驻留翻倍路径存在（3.85+0.91MB），还要多一张"关卡→图集"映射表与一次换关装载；
D 更省，但代价落在**行为面**——面板文字要等自己的装载，按 194.5KB 换算就是暂停/失败/结算面板晚 398ms（4g）／996ms（fast3g）／
3186ms（slow3g）才出字，第一次死亡那一刻听得到也看得到，这一类本轮不碰（与 P-01、L-02 一样必须先经用户裁定）。

### 五、护栏必须挡住的两类失效（历轮同族，本轮更严）

1. **缺字形 → 画空白，不抛不警告**。房内文案只要有一个字符不在子集里，那个字当场消失，而冷启动、像素、det、regression
   全部照常绿。这与 r25 `GameScene.sfx()` 的 `cache.audio.exists` 卫（[GameScene.ts:581](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/GameScene.ts#L581)）
   是同一类"静默降级"，护栏只能是**静态网 + 专用 e2e**：静态网用同一个 `parseLevel` 口径把 48 关教学文本与全部行钉字面量
   重新推一遍并逐字符断言在集合内（改文案、改关卡、加 `Tutorial_*` 层都会把它打红），
   e2e 则把每一面上屏后按像素对拍。
2. **缺键 → `Invalid BitmapText key` 抛错，场景钉死**。r23 附带修复（`959db74`）已经实锤过一次：弱网早入场时 `FadeScene.create`
   在字体未落定时建位图字会抛并永久钉在 CREATING。本轮不改装载时机（房内批照旧声明、键不变），所以这条风险不新增，
   但 e2e 必须覆盖"面板先于 Game 起步"的刷新回座路径（r18 件C 立的那三条自备装载点）。

**产品代码零改动的验证边界**：件0 只新增 `TEMP/r24/` 的测量脚本（已随收尾清理），未改 `scripts/`、`packages/`、`assets/` 下任何文件。

## 一、实施（件1）

两件 commit：`5a2bf1f`（生成器＋产物＋静态网，产品代码零改动）与 `c4bc9d5`（客户端换装载 URL）。

**口径层 `scripts/font-subset/room.mjs`**：需求＝48 关 `parseLevel` 选中教学层文本 ∪ 9 处行钉字面量 ∪ 2 处动态点
（时钟 `mmss(clockSec)`、结算板 `padStart(2,"0")` ⇒ `0123456789:`）。行钉在读取时逐行断言，文案一改就抛；
关卡侧另钉一条不变式——`data/forest/temple.json` 列表与磁盘 `data/*/levels/*.json` 必须一一对应（孤儿关=按关出图会漏）。
求得 **114 字符，有帧 114／无帧 0**，与件0 的独立量具（`TEMP/r24/census-room.mjs`，已清理）互为对照：两份代码各算一遍，
集合差集为空（`agent-not-in-census=""`、`census-not-in-agent=""`），需求侧不存在"生成器自己说了算"。

**生成器 `scripts/font-subset/build-font-room.mjs`** 照抄 r19 装配断言（区域＝帧矩形 ∪ `ring=4` 环带逐字节、
未保留声明共指透明块、`pack(spacing=2)` 拒绝 POT 对、占用位图防重叠、逐区域墨迹守恒、fnt 掩掉 x/y/scaleW/scaleH
后逐行等值＋重解析度量不变）。产物账目与件0 预测逐位相符：

| 项 | 值 | 件0 预测 |
|---|---|---|
| 幅面 | 871×1179 | 871×1179 |
| PNG | 707,913B（691.3KB） | 707,913B |
| fnt | 30,959B | 30,959B |
| 墨迹 | 914,743 | 914,743 |
| 帧密度 | 74.94% | 74.94% |
| 解码驻留 | 3.92MiB | 4,107,636B |

搬运 925,472 texel，透明块 98×101 承载 146 条未保留声明；260 条 id（261 个 `<char>` 标签，id=32 双条照旧）一条不少，
`<info>` 逐字相等，PNG 辅助块与块序列与源一致（`IHDR,pHYs,iTXt,cHRM,IEND`）⇒ "像素没变"这句话仍然成立。
**面额：线上 1631.1KB → 721.6KB（−909.6KB，−55.8%）／驻留 8.56MiB → 3.92MiB（−4.64MiB）**。

**独立核验**（`scripts/font-subset/verify-room.mjs`，不调用生成器任何装配代码）：需求内 114 字帧与 ring 环带逐字节相符、
需求外 144 字全零、授权区重叠像素 0、区外不透明像素 0、260 条声明除 x/y 外逐属性不变 ⇒ 全绿。

**客户端只改一行**：`BootScene.loadFontFull()` 的 URL 换成 `font-room.png/.fnt`（键 `font-full`、全部 `FONT_FULL`
消费点与三块面板自备装载全不动）。静态网 `font-prephase.test.ts` 的断言随之换向——官方 `font.png`／`font.fnt` 字面量在客户端源码
里由"各恰好 1 处"改成**必须 0 处**，并新增 `font-room.png`／`font-room.fnt` 各恰好 1 处且成对（只换一边＝用旧坐标读新图的鬼影）。
`font-room.test.ts`（10 例）钉产物语义与行钉，`split-char-atlas --check`、`reflow-prephase --check`、
`build-font-room --check` 三处复现门禁均"字节一致 ✓"，`npm run typecheck` 通过，`vitest` 全量 **21 文件／230 例**通过。

房内文本的逐像素门禁 `scripts/e2e/roomtext.mjs` 见 §四。

## 二、四档 A/B/A 实测

臂序 A/B/A，每臂 2 轮有效（`perf-load.mjs --save r24-ab-<tier>-<arm>`，落盘 `benchmark/results/load-r24-ab-*.json`），
判据用 `benchmark/load-ab-bands.mjs <tier> r24 gameActivePerfMs menuActiveMs`。**本轮数字必须按"未 ship"读**：
臂B 的收益是真实的，但 §四 的像素门禁判负、实施已回退（`966e7a5`），下面的 ms 是"若该件成立本可兑现"的面额，不是线上现状。

| 档位 | 臂A | 臂B | 臂C | Δ=B−A | 最差带 / 臂B散布 | Δ/带 | 判定 |
|---|---|---|---|---|---|---|---|
| 4g | 11963 | **10090** | 11964 | **−1873.5ms** | 107 / 171 | 17.5× | 三闸门全过 |
| fast3g | 27528 | **22873** | 27596 | **−4688.8ms** | 174 / 128 | 26.9× | 三闸门全过 |
| slow3g | 85496 | **70077** | 85371 | **−15356.0ms** | 342 / 54 | 44.9× | 三闸门全过 |
| off | 1915 | 1903 | 2228 | −168.3ms | 704 / 372 | 0.2× | 带内，不算差异 |

- 漂移控制：A/C 两臂在 throttled 三档上的差为 1ms（4g）、68ms（fast3g）、125ms（slow3g），全部小于各自最差带；
  臂B 每档两轮散布 171/128/54ms，Δ 分别是它的 11.0×/36.6×/284×。
- 兑现率：按 r20 价签的名义进房收益 4g −1862.9ms、fast3g −4657.2ms、slow3g −14904.1ms，实测为名义的
  **100.6% / 100.7% / 103.0%**——与 r25 的"搬尾巴兑现 94%～101%"不同，本轮砍的是房内窗字节主体（`font.png` 占 49.9%），
  实测没有额外折扣，慢档甚至略超名义（同为字节账）。
- `Menu active` 四档 Δ 为 −49.3／+29.0／+5.0／−100.3ms，全部落在最差带内（4g 的 −49.3ms 也小于臂B 自身散布 155ms）
  ⇒ **房前里程碑无变化**，本轮没有把成本挪到菜单段。
- off 档 Δ 落在带内符合预期：无限速时 909KB 的传输账只有几十毫秒量级，噪声（臂A 自身两轮 2196/1633ms）远大于它。

## 三、代价侧与驻留

**房内窗字节**（点击建房→`Game active`，两轮均值；三个 throttled 档字节相同，只有时刻不同）：

| 档位 | 臂A 房内窗 | 臂B 房内窗 | 差额 | 条目数 |
|---|---|---|---|---|
| 4g / fast3g / slow3g | 3207KB（解码 6838KB） | **2298KB（解码 5928KB）** | −909KB（−28.3%） | 39 → 39 |
| off | 5259KB（解码 8863KB） | 4350KB（解码 7926KB） | −909KB | 43 → 42 |

条目数没有增加（`font.png`/`font.fnt` 两条换成 `font-room.png`/`font-room.fnt` 两条），`真双载=0`、`页错=0`
⇒ 没有"官方图与子集图同时进房"的中间态，也没有把字节挪到别的窗口。

**驻留**（`perf-resident.mjs --save r24-{a,b}`，同一浏览器会话依次取 Menu、进房、重进、选关）：

| 采样点 | 臂A texMB | 臂B texMB | 差额 | heapGCMB（A→B） |
|---|---|---|---|---|
| Menu 首帧 | 84 | **79.36** | −4.64 | 11.9 → 12.0 |
| forest_01 进房 | 98.94 | **94.29** | −4.65 | 27.2 → 27.2 |
| 重进后 | 98.94 | **94.29** | −4.65 | 27.3 → 27.3 |
| 选关树（离房后） | 93.39 | **88.75** | −4.64 | 23.1 → 23.0 |
| 再次进房 | 98.94 | **94.29** | −4.65 | 28.8 → 28.7 |

纹理解码驻留的差额与图集账 8.56−3.92=**4.64MiB** 逐位相符，且**离房后仍保留**（选关树 −4.64MB）——
子集图与官方图在同一个纹理键上，不存在"换图后旧图滞留"。堆内存四档采样差 ≤0.1MB，属于噪声。
代价侧没有可测的负项：请求数不变、菜单段不变、无新增长任务；唯一新增的是仓库里多一对 721.6KB 的产物与一条静态网，
以及**未定位的渲染等价性风险**（见 §四，它正是回退原因）。

## 四、门禁：像素等价性判负——实施已回退

### 一、房内文本像素门禁 `scripts/e2e/roomtext.mjs`：判负

判据分两半，只有一半有效：

- **同轮面级双键**（同一页面同时装官方图与子集图，同一目标坐标各画一次，整面截图逐字节比）：
  `clock-live`／`clock-initial`（24px）**PASS 逐字节相同**、`tutorial-forest01`（18px）**PASS 逐字节相同**、
  `end` **PASS**；`gameover`（36px 标题＋26px 按钮）**FAIL，407 px 不同**（bbox 584,187,61,60，正落在"游戏结束"标题上）、
  `pause`（36px＋26px）**FAIL，52 px 不同**（bbox 454,243,118,45，落在"暫停"标题上）。
- **跨轮探针串**（22 条文案由当轮渲染、参照来自上一轮存档）：prod 侧 22/22 全部比 ref 少墨 0.57%～2.05%。
  但这半边**作废**：同一 head（`998b9be`）、同一 bundle（`index-JB-IqNoP.js`，sha 前缀 `fec140859f8d797e`）
  的两次运行，参照侧 22 条里有 **21 条 ref sha 不同**，且 21 条全部是后跑少墨（−16～−169 个墨点，唯一不变的 p00 是 24px）。
  参照侧自己都不可逐字节复现，跨轮差值不能归因给图集。
- 更直接的矛盾在同一轮里：24px 的「00:00」在面级对拍中**逐字节相同**（`clock-live`/`clock-initial` PASS），
  探针却报 **−1.97% 墨迹**。同一图集、同一字号、同一串，两个口径一个说同、一个说差 ⇒ 探针的两次抓取之间
  存在与图集无关的系统性差异，串级结果整体不作判据。量具已按此修正（面级仍为硬判据，探针降级为诊断并去掉
  "跨跑可复现"的错误头注）；本轮的负结论只用面级证据。
- **回退后的官方↔官方对照**（新跑，产品键 `font-full` 与参照键 `font-cmp` 装的是同一张官方 `font.png`）：
  **6/6 面逐字节相同**，但 22 条探针串仍 **22/22 不同**，prod 侧少 1.1%～2.0% 墨迹
  （`00:00` 2937→2879、`暫停` 4013→3960、`游戏结束` 7188→7086、`再试一次` 4089→4046）。
  两张图集内容完全相同、字形绝对坐标也相同，"少墨"却照旧出现 ⇒ 串级探针的系统性偏差与图集无关，
  "−1–2% 墨迹"不能作为子集图的罪证；同一对照下面级 6/6 相同，反证面级口径可复现。

所以判据只取同轮双键面：**18/24px 逐字节相同，26/36px 不同**。缺字形会画空白且不抛错，这条路一旦漏字就是静默坏面，
属于红线；没有定论前不能接线。**件1b 已回退**（`966e7a5`），`FONT_FULL` 指回官方 `font.png`。

### 二、根因：重排改了字形在图集里的绝对坐标，而 Chromium 的降采样核相位依赖这个坐标

Phaser 的 Canvas 位图字渲染路径（`node_modules/phaser/src/gameobjects/bitmaptext/static/BitmapTextCanvasRenderer.js`）：

```
glyphX = textureFrame.cutX + glyph.x          // 源矩形左上角 = 帧在图集内的绝对坐标
ctx.translate(x, y); ctx.scale(scale, scale); // scale = fontSize / fnt.info.size(=48)
ctx.drawImage(image, glyphX, glyphY, glyphW, glyphH, 0, 0, glyphW, glyphH)
```

图集重排只改 `x`/`y`，帧矩形尺寸与像素内容逐字节不变；fnt 的 `xadvance`/`xoffset`/`yoffset` 也逐属性不变
（§一 的三重核验）。但 `drawImage` 在 `scale≠1` 时要做降采样滤波，**滤波核的相位由源矩形的绝对坐标决定**——
同一个字形搬到图集另一处，同一目标像素位置，采样结果会变。独立实验 `benchmark/font-phase-probe.mjs`
（无游戏、无服务器，两图同画布、逐字号 × 逐目标相位）给出确定的边界：

| 字号（scale=size/48） | 114 字形中上屏不同的个数 |
|---|---|
| 18（0.375） | **0/114**（三种目标相位全同） |
| 24（0.5） | **0/114**（全同） |
| 48（1） | **0/114**（全同） |
| 26（≈0.5417） | **66～81/114**（三种目标相位；五相位矩阵最高到 96） |
| 36（0.75） | **0～54/114**（随目标相位变；(11,10) 相位全同，1 像素相位差即出现 14 个） |

即：**缩放比例为 1、1/2、3/8 时采样与源矩形位置无关，其余比例有关**。这与面级门禁一一对上——
18px 教学、24px 时钟逐字节同，26px 按钮、36px 标题不同；官方图集自己没问题，是因为参照与产品用同一张图、
同一绝对坐标，"没重排"天然等价。r19 的进房前子集没有暴露这个问题，是因为它在菜单里的实际用量（由
`prephase-canvas` 的逐字节基线守着）落在安全比例上，而不是因为"重排本身无损"。

这就是本轮的负结论：**图集帧字节等价不蕴含位图字上屏等价**。像素保守性必须按"实际字号 × 目标相位"验，
不能只验图集。探针已作为常驻量具入库（`benchmark/font-phase-probe.mjs`），下一轮任何图集重排方案先过这张表。

### 三、回退内容与保留物

- `966e7a5`：`loadFontFull()` 换回官方 `font.png`／`font.fnt`；`font-prephase.test.ts` 断言反转
  （官方两条各恰好 1 处且成对，`font-room.*` 装载引用恰好 0 处），并保留"产物在库但无装载引用"的注释说明；
  `npm run typecheck` 通过、定向 vitest **22/22**、build 通过。
- 保留：生成器 `scripts/font-subset/build-font-room.mjs` 与口径 `room.mjs`、产物 `font-room.{png,fnt}`、
  独立核验 `scripts/font-subset/verify-room.mjs`、相位探针 `benchmark/font-phase-probe.mjs`、静态网 `font-room.test.ts`。
  这些是下一轮重新设计的输入，不是线上负担（无任何装载声明引用产物）。
- 若下一轮再动房内字体，先要在**行为/像素面**解决 26px 与 36px：可选方向（均未实施、未取证）——
  让面板文字改用安全比例（24/48 的等价字号）、或让子集图集保留每帧的官方绝对坐标（省不了空间）、
  或把面板标题预渲染成图片。取舍需用户裁定后才可动。

### 四、套件结果（回退后的现役代码，串行单实例）

本轮门禁以 `static`／`browser` 两组串行执行（轮内脚本 `TEMP/r24/gates.sh` 已随收尾清理；各门命令见下表门名对应的仓库脚本），
**FAIL=0**。产物 `index-CxewXNds.js`（sha 前缀 `51fd59b7b3080ae7`），
字体指纹含官方 `font.png=24800f35d619d57a`（房内子集产物在库但无装载引用）。

| 门 | 结果 |
|---|---|
| typecheck | 0 错 |
| `split-char-atlas --check` | 六件逐字节一致（53 帧 152.1KB＋7 帧 28.3KB＋182 帧 442.4KB） |
| `reflow-prephase --check` | 产物 PNG/fnt 逐字节一致 |
| `build-font-room --check` | 产物 PNG/fnt 逐字节一致（871×1179，707,913B） |
| `verify-room`（`scripts/font-subset/verify-room.mjs`） | 独立回算全绿（114 字帧＋环带、区外全零、260 条声明度量不变） |
| vitest | **21 文件 / 230 用例**全过（含 `font-room.test.ts` 10 例与反转后的 `font-prephase.test.ts`） |
| prephase-canvas | **5/5 面**逐字节（menu/temple/temple-numbers/settings/credits，1280×960） |
| domskin | **4/4** 逐字节 |
| charsplay（off） | **21 项** ALL PASS（含停答阴性对照） |
| treebake | **9/9**（三金样＋阳性对照） |
| groundcache | **6/6** |
| audiofamily（off） | **22 项** ALL PASS |
| det48 | **48/48** 位级一致（本次 3.0s） |
| journey | pause **11/11**、leave **3/3**、refresh **3/3**、wonrefresh **6/6** |
| route | forest_01 **won** 40018ms（trace 入库） |
| regression | **PASS** won=false errors=0 sync=0 缺帧警告=0 |

回退后的产品代码与 `bb2334d`（臂A）的行为面等价：房内用官方 `font.png`，装载声明与消费点均未改。
唯一新增的是常驻量具与产物，均无装载引用。

## 五、剩余面额与下一轮

回退后的房内窗回到 3207KB，`font.png` 仍是单笔最大（1600.6KB，49.9%），但它**暂时不可动**——26/36px 等价性没解决。
按 r25 快照的房内窗拆账，去掉字体后的第二梯队：

| 条目 | 房内窗字节 | 占比 | 可动的方向 | 前置条件 |
|---|---|---|---|---|
| `MechAssets.png` | 472.8KB | 14.7% | 按关只装用到的机关帧（与 r22/r23 的角色图集同法） | 需关卡→机关帧的静态口径＋漏帧会画空白，需与字体同级的静态网/e2e |
| `TempleHallForest` | 417.0KB | 13.0% | 按关拆庙宇/森林背景 | 改关卡→图集映射，换关可能二次装载 |
| `PopupAssets.png` | 334.4KB | 10.4% | 面板拆张：暂停/结算/失败三块各自装载 | 面板文字/图片延后上屏，属行为面，需用户裁定 |
| `TempleAssets.png` | 281.1KB | 8.8% | 按关装载 | 同上 |
| `MenuAssets.png` | 191.5KB | 6.0% | 房内只需 `StoneButton` 两帧，菜单背景不进房 | 需确认房内无其他 Menu 帧消费点 |

两条纪律带到下一轮：

1. **图集重排的像素等价性要按"实际绘制 scale × 目标相位"验，不能只验帧字节**（§四）。这条律不限于字体；
   任何改变帧在图集中绝对坐标的重排（包括已 ship 的角色图集拆张）都适用。本轮没有发现后者的像素证据——
   `charsplay` 只断言"无花屏/无缺帧警告"，不做逐字节——若 r26 要动机关图集，先把同类逐字节取证补上再谈收益。
2. **先量兑现率再谈面额**：r24 的 −909KB 在 4g/fast3g/slow3g 兑现 100.6%/100.7%/103.0%，
   再次确认"房内窗字节主体"就是 `gameActivePerfMs` 的分母；第二梯队任何一件都要走同一套 A/B/A 四档＋三闸门。

本轮的总账口径：**件1b 未 ship**（回退在 `966e7a5`），A/B/A 的 −1.87s／−4.69s／−15.36s 与驻留 −4.64MiB
是"若像素等价成立本可兑现"的面额，不计入线上成绩；件0/件1a 的生成器、产物、静态网、独立核验与相位探针留在树里，
供下一轮在解决 26/36px 等价性后直接复用。
