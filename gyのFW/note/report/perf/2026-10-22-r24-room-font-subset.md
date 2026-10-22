# r24 · 把房内位图字体换成"房内需求子集"：官方 font.png 不再进房（2026-10-22）

口径与判据沿用 r20/r21/r23/r25：里程碑只有冷启动 `Menu active` 与**点击建房→`Game active`**（页钟绝对值
`gameActivePerfMs`），弱网档这两段都是字节账的函数（每 KB 价签 4g 2.048ms、fast3g 5.12ms、slow3g 16.384ms，
`2026-10-22-r20-network-tiers.md:116`）。臂序 A/B/A（臂C＝臂A 同代复测，框住本机漂移），三臂同档位、同机、
同一时间窗；跨臂 ms 差只有超出同臂最差带、且大于臂B 自身散布才算差异（高漂移档要求 ≥8 轮/臂池化）。

- 臂A＝本轮实施前的现役代次（`bb2334d`，`FONT_FULL` 指官方 `assets/fonts/chinese/font.png`）
- 臂B＝`FONT_FULL` 指生成物 `font-room.png`／`font-room.fnt`（键与全部消费点不动，只换装载 URL）
- 档位 `forest_01`（general 族，唯一带教学文本的两个关卡之一），四档串行，同时只有一个浏览器作业

## 〇、件0：房内到底需要哪些字（勘察与面额，不含任何产品代码）

量具与产物在 `TEMP/r24/`：`census-room.mjs`（需求推导 + 同口径图集测量）、`census-room.json`（结构化账目）、
`critical-path.json`（关键路径归因，数据源＝r25 的 12 份 `benchmark/results/load-r25-ab-*.json` 快照，未重跑）。

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

**产品代码零改动的验证边界**：件0 只新增 `TEMP/r24/` 的测量脚本，未改 `scripts/`、`packages/`、`assets/` 下任何文件。

## 一、实施（件1）

TODO：生成器 `scripts/font-subset/build-font-room.mjs` + 口径层 `room.mjs`、产物 `assets/fonts/chinese/font-room.{png,fnt}`、
`BootScene.loadFontFull()` 换 URL、静态网 `font-room.test.ts`、`scripts/e2e/roomtext.mjs` 逐像素门禁。

## 二、四档 A/B/A 实测

TODO。

## 三、代价侧与驻留

TODO。

## 四、门禁

TODO。

## 五、剩余面额与下一轮

TODO（`r26` 勘察并行进行中：MechAssets 472.8KB / PopupAssets 334.4KB / TempleAssets 281.1KB / TempleHallForest 417.0KB / MenuAssets 191.5KB）。
