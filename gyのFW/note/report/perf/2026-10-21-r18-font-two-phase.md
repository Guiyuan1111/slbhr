# r18 · 中文位图字两段化：进房前只装 304.5KB 子集（2026-10-21）

> 战役第 18 轮。方向从 r17 的"HTML 解析临路径上的 CSS 背景图"切到 **Boot 关键路径上最大的单一文件**：
> `assets/fonts/chinese/font.png` 一份 1600.3KB（未压缩传输口径），占当时 Menu 段 3799KB 的 42.1%。
> 而进房前的画布真的只需要 **75 个字符**——其中 53 个在 `font.fnt` 里有字形。
> 本轮把这一份文件拆成两代：Boot 装子集（304.5KB），全量延到游戏内文本真正要用之前才装。
> 零协议、零物理、零像素设计；子集是从官方 `font.png` 按字框**逐字节抄写**得到的，其余像素清零。
> 单位口径同 `perf-load`：下文 KB = 1024B。

## 一、量具（五件）

| 量具 | 能力 |
|---|---|
| `scripts/png-raw.mjs` | 自研 PNG 原始样本层：解 IDAT + 反滤波 0–4 得 RGBA **原始字节**（不经色彩管理），重编码走 zlib level 9 + 逐行自适应滤波，并**原样保留非 IDAT/IEND 辅助块**（`font.png` 带 pHYs/iTXt/cHRM）——"像素一个字节没改"这句话必须能自证 |
| `scripts/font-subset/prephase.mjs` + `build-font-prephase.mjs` | 子集生成与逐像素核：`parseFnt` 取字框、`composeSubset` 合成授权区、`auditSubset` 核"保留帧=源字节全等 / 未保留帧=零墨迹 / 非授权区=全零"，`--check` 重跑字节可复现，`--ring N` 只做探测不落盘 |
| `packages/client/src/__tests__/font-prephase.test.ts`（11 例） | 静态防护网：进房前调用点集合、游戏内调用点必须用 `FONT_FULL`、字框清单与 `font-prephase.png` 逐条对账、Boot 结构断言（`preload` 里不得再出现 `font.png`、全量路径字面量全局仅一处）、房内场景自备 `FONT_FULL` 装载声明 |
| `scripts/e2e/prephase-canvas.mjs`（新门禁，五态） | **前场画布逐像素**对拍。判据 SHA-256 逐字节相等、零容差；FAIL 打 `magick compare -metric AE` 并把差图落 `TEMP/`。基线 `benchmark/results/prephase-canvas/`，代次记 `manifest.provenance` |
| `benchmark/font-decode-probe.mjs`（r18 归因件，常驻） | 同一次 Chromium 页内对两张字体图分别计 `fetch`/`createImageBitmap`/`Image.decode()`/绘进同尺寸 canvas+取像素四段，用来把"少下 1.3MB 换来多少时间"和"多挂一张 8.97MB 位图的代价"分开（结论见 §五之二） |

为什么本轮必须新造第四件门禁：现役三道全都看不见这条路径。`domskin` 截屏前 `#game-root{display:none}`（只证 DOM 石板皮）、
`visual-diff` 比的是**游戏内**画布且隐藏 `#hud/#menu`、`journey` 只读 DOM `textContent`。
于是"Menu 的「开始游戏」、选关的 48 枚数字、面板标题"这些**画布里的中文**一旦少一个字框，用户看到的就是字面一个洞，
而三套门禁全绿。子集化恰好是唯一能大面积制造这种洞、又完全不触碰任何既有门禁的改动。

首版两个口径坑（写进脚本头，是量具的资产）：
1. **世界时钟**：`MenuScene.update` 每帧推 8 道光柱 + 4 支蜡烛的 lissajous，角色 idle 按累积 delta 推帧，
   而主循环是 `setTimeout` 墙钟驱动、delta 还要过 `TimeStep.smoothDelta` 十帧滑动平均——同版本两次跑到"第 N 帧"相位不同，
   `visual-diff` 我方侧只能"三跑取带顶抖动"。本门禁把 Phaser 自驱动彻底掐掉（`raf.start`/`loop.wake`/`loop.step` 三路封死），
   此后世界只按固定 `1000/60`ms 合成步推进 `Game.step`，**相位=步数**，逐拍可复现。装载仍是真实下载（Loader 事件驱动，不污染步数）。
2. **创建期随机**：`MenuScene.create` 用 `Math.random` 取 52 个值定光柱/蜡烛参数（原版即随机，不改产品代码），
   故 `addInitScript` 把 `Math.random` 换成固定种子 mulberry32；`--save` 另做"非空画布"体检（`magick %k` 唯一色数），
   全黑/全白的截图能自洽通过后续对拍，却是假门禁。

**判代不靠 HEAD，靠产物指纹**：像素是 `packages/client/dist` 里那份**已构建产物**的行为。本工具刻意不跑构建
（并发开发期重建 dist 会把别人未完工的代码烧进基线）。每次运行登记入口 chunk 与字体 PNG 的 SHA-256 前缀：
chunk 内查得到 `font-prephase` 引用＝两段化代，查不到＝全量代。

## 二、归因（基线 `load-r18-base-f01.json`，检出 `851f0a2`，forest_01 档）

`font.png` 2191×1024 RGBA 8-bit：传输 1,638,701B、解码后 8,974,336B、墨迹 1,326,019 像素；`font.fnt` 声明
`<char>` 261 行 → 生效字形 260 条（id=32 重复两次，两条都是 0×0 空格，与 Phaser `ParseXMLBitmapFont.js:109`
"后写覆盖"一致，故无像素影响）。它坐在 Boot 的 `preload` 里，是 DCL→Menu 段最大单块。

进房前真正上墙的中文文案，逐文件字面枚举 16 处调用点（`MenuScene.ts:92,138`、`menus.ts:29,62,63,64,80,81,90,124,125,127`、
`TempleScene.ts:208,237`、`transition.ts:26,43`）+ 一处动态数字（`TempleScene.ts:186` 的 `String(lv.id)`，取 0–9 全体）
= **75 个字符**。静态测试把这 16 处钉成防护网：文案改字而清单未同步，测试即红。

勘误 r7f 的旧结论：那轮做"子集化"是**替换**全量字体，实测 −5.2%（保留字形占声明面积 94.79%，图集本就致密），
远低于 20% 停止线而关闭。本轮前提不同——**全量字体照样要下**（游戏内文本要用），只是把它从 Boot 关键路径挪走，
Boot 改下"进房前那 53 个字框 + 滤波环带"。所以收益不在总量，在**形状**。

## 三、实施（三件，独立提交）

**件A `c37f585`｜子集资产与生成器**。授权区 = 保留字形的**帧矩形全体** ∪ 其四周 `padding="4,4,4,4"` 的**原样环带**，
其余 RGBA 全零。`.fnt` 一字未动，所以 260 个字形度量/帧表仍在原位（缺字只是"无墨"，不是"错位"）。
环带的理由是**滤波**而非美观：`packages/client/src` 与 `packages/shared/src` 里没有任何
`pixelArt`/`setFilter`/`antialias` 配置，Phaser 缺省 LINEAR，WebGL 下字边缘一个纹素可能采到帧矩形外一格。
实测该环带只多花 9.8KB（ring=0 时 295.0KB），且 `ringInkInOtherFrames=0`——它从不侵入任何未保留字形的帧矩形，
两条不变量同时成立，故取 ring=4。

生成器硬断言：`padding` 四边相等且等于所取环带、字形帧两两不重叠（`overlaps`）、非授权区全零、辅助块集合与源一致、
重解码样本全等。产物 `assets/fonts/chinese/font-prephase.png`＝311,836B（304.5KB），`sha256 c1309f00e18b2545…`，
`--check` 字节一致 ✓。

**件B `90fe319`｜客户端两段化**。`BootScene.ts` 拆两个键：`FONT_MAIN="font"`（Boot 装子集）、
`FONT_FULL="font-full"`（由既有延迟通道 `loadGameAtlases()` 装全量）。
`overlays.ts` 暂停/结算/游戏结束等 6 处游戏内文本、`GameScene.ts:1395` 教学文案与 `:1495` 计时器改指 `FONT_FULL`，
`stoneButton` 增 `fontKey` 形参以覆盖房内按钮重排。

为什么用第二个键而不是就地重载 `font`：`TextureManager.checkKey`（`TextureManager.js:248`）遇同名键
`console.error` 拒绝，`addImage`（`:469`）随即早退——旧纹理与其上已挂的 `BitmapText` 帧引用原样留着，
新纹理根本没建；而想真换只能 `textures.remove`，那会让在场字对象抛错。

重复声明 `FONT_FULL` 为何安全（`loadGameAtlases()` 可能被 Menu 暖装、`GameScene.preload` 与三块弹窗
各自的 `preload` 喊到）——**这一条本轮先写错过一次，现按实源改对**：`loader.bitmapFont` 并不是把
MultiFile 整体入队，而是 `addFile(multifile.files)` 把**两个子文件各自入队**（`BitmapFontFile.js:234`），
于是 `LoaderPlugin.addFile`（`:536`）→`keyExists`（`:572`）→`File.hasCacheConflict`（`File.js:499`）
是**按子文件分别判**的：png 子文件的缓存是 `textureManager`（`ImageFile.js:66`）⇒ 第二次声明整块跳过，
**不重下 1600.3KB、更不触替换**；而 fnt 子文件的缓存是 `cache.xml`（`XMLFile.js:56`），
`BitmapFontFile.addToCache` 只往 `cacheManager.bitmapFont` 写（`:105`）**从不填 cache.xml**
⇒ 元数据子文件**每次声明都会重新请求**。这"每次"在逐 URL 账上看得见：`font.fnt` 一轮里出现 3 次
（438ms 真取 3.8KB / 1230ms 304 / 2447ms 304），后两次 `transferKB=0` 全靠 r15 的 ETag 契约。
四张图集的 `*.json` 从 r5 起就是这个形状（基线 `load-r18-base-f01` 同样两次 304），所以这不是本轮新引入的洞。
也不会重解析：`MultiFile.pending` 按子文件数初始化（`:125`）且只由真正加载完的子文件递减，
png 缺席 ⇒ `isReadyToProcess()`（`:193`）恒假 ⇒ `addToCache` 直接返回；装载完成同样不受影响，
因为被跳过的子文件根本没进队列（队列空则 `start()` 当场 `loadComplete`）。

**件C `20ae670`｜件4 首轮套件抓出来的破口（刷新回座开不出结算板）**。首轮全套跑出
`journey wonrefresh` 两条断言红：`Invalid BitmapText key: font-full`——刷新回座 `won` 时
`EndMenu.create` 当场中断，结算板根本开不出来（其余七模式全绿，说明破口只在这条支路）。
根因不是子集也不是键名，而是件B 留下的一条**隐含假设**：房内文案的纹理"总有人会先装好"。
`enterGame` 用 `fadeSwitch` 换场景，`ops`（含 `sceneMgr.start("Game")`）要等 500ms 淡入才执行
（`transition.ts:54`），而 `resumeWonIfNeeded()`（`main.ts:463`）不等它、`onPhase("gameover")`
（`main.ts:543`）也不等它——面板先起，`Game.preload` 的兜底声明还排在后面。
`font` 键时代全量字体由 Boot 关键路径装好，这条路径本就没有窗口；两段化把"房前必然备好"
换成"只有 Game 备好"，窗口才浮出来。页内重连那条 `resumeWonIfNeeded()`（`main.ts:559`）
Game 已在场，不受影响。

修法取**消费方自备声明**，与 `BootScene.ts` 文件头既有约定同构（"消费方照常声明装载……
任何进入路径都保证纹理就绪"）：抽出 `loadFontFull()`（全量 `font.png` 的路径字面量全局只此一处），
`loadGameAtlases()` 与 `PauseMenu`/`EndMenu`/`GameOverMenu` 各自 `preload()` 调它。
已缓存时 png 子文件跳过（不重传 1600.3KB）、只有 `.fnt` 元数据再走一次 304（0 字节），
队列空则 `start()` 当场 `loadComplete`（`LoaderPlugin.js` 的 `list.size === 0` 分支），
所以既不重下也不多等一帧；机制与逐 URL 实证见上一段。
`GameScene.preload` 一直在吃这条语义（重进同关全量命中缓存），生产路径早已验证过它不挂。

防护网补一条静态断言（`font-prephase.test.ts` 第 11 例）：凡 `create` 用到 `FONT_FULL` 的场景
必须在自己的 `preload()` 里声明装载，且声明方名单固定为四个（`GameScene` + 三块面板），漏一处即红；
阴性对照已验证——把 `EndMenu` 的 `preload` 剥掉，谓词由 `true` 翻 `false`。

## 四、等价性（四层，各自表态）

1. **像素层（生成时自证）**：53 个保留字形逐行 `Buffer.compare` 与源**全等**；未保留字形的帧矩形 `alpha` 全零；
   非授权区 RGBA 全零（`outsideNonZero=0`）；分账——帧像素 266,074、授权像素 320,328（全图的 14.3%）、
   墨迹 191,387（帧内）+ 4,289（环带）= 195,676 / 1,326,019，清零 1,130,343。
   辅助块集合与源一致、重解码样本全等 ⇒ "同一张图裁出来的，不是重画的"。
2. **静态层**：`font-prephase.test.ts` 11 例（进房前/房内调用点分类、无字形集合、Boot 结构、
   房内场景自备 FONT_FULL 装载声明）。四次阴性变异全部转红后逐一回滚（量具必须咬人，不是只过就行）。
3. **画布层（跨产物代）**：五态基线先由**全量代产物** `index-CJqW9TNF.js=b8f19d5a06d02ca3` 产出
   （其 client 面与 `851f0a2` 逐字节同：`git diff 851f0a2 90fe319~1 -- packages/client` 为空）；
   `90fe319` 重新构建为**两段化代** `index-rlLaY6Dc.js=665b79bcf5440636`（chunk 内含 `font-prephase` 引用、
   字体目录多出 `font-prephase.png`）后重跑同一编舞——
   **menu / temple / temple-numbers / settings / credits 五态 SHA 一字不变**。
   这条并列证据写在 `manifest.bundlesVerified` 里，就是本轮的核心断言：拆字在前场画布上无损。
   阴性对照：把基线换成扰动图，门禁 `FAIL`、`AE=1.179e+06 (0.959476)`、差图落 `TEMP/`、退出码 1。
4. **行为层**：`det` 48/48 位级一致（本轮不动物理/协议）＋ `journey` 八模式 ＋ `route f01` ＋ `visual-diff`（见 §六）。
   这一层是本轮真正抓到东西的地方：`wonrefresh` 模式揪出了 §三 件C 的回座断板，
   像素层与静态层当时都是绿的——"前场画布逐字节一样"并不等于"任何进入路径都还能开局"。

## 五、收益与代价（perf-load，同机同口径，`r18-base-f01` → `r18-after-f01`）

| 口径 | 前 | 后 | 差 |
|---|---|---|---|
| **冷启动 Menu 段传输** | 3799KB | **2504KB** | **−1295KB（−34.1%）** |
| 冷启动 Menu 段请求数 | 19 | 19 | 0（子集换掉同一个坑位） |
| 点击建房→Game 段传输 | 3031KB | 4632KB | +1600.6KB（全量字体退回真实下载段） |
| **进 Game 累计传输（全链）** | 6830KB | 7135KB | **+304.8KB＝本轮代价**（子集那份多出来的传输） |
| 条件复验探测（46→47 幂等 URL） | 6816.1KB→0KB | 7120.7KB→0KB | 复验仍全 304 |
| reload 传输 / Menu active | 4KB / 557ms | 4KB / 623.5ms | 带内 |
| 音轨装载 | 18 条 / 1988.6KB | 17 条 / 1988.6KB | 条数是同一曲目重复计数的老伪差（r17 已披露），总量逐字不动 |
| 冷启动 Menu active | 673ms（753/593） | 781ms（866/696） | **+108ms：见 §五之一，同场 A/B 后判为测不出来** |
| 点击建房→Game | 1231ms（1301/1161） | 1600.5ms（1683/1518） | **+369.5ms：见 §五之一，落在同产物 446ms 漂移带内，撤回** |

**账要说全**：收益是**关键路径的形状**——DCL→Menu 这一段少下 1295KB，首屏上墙要等的最大单块从 1600.3KB 变 304.5KB，
弱网/隧道下这段是玩家唯一在等的东西；代价是**总量多 304.5KB**（子集是多下来的一份，全量仍要在进房前下完）。
本机 LAN 口径 +304.5KB ≈ 0.024s@100Mbps，与 r17 的 +79KB 同类；两者都还没有节流档可实测（挂账见 §八）。

### 五之一、同场 A/B：上表那两个 ms 差**都不作数**（本轮最重要的勘误）

上表拿"早间基线 `r18-base-f01`"和"晚间复测"比，点击→Game 差 +369.5ms、两轮同号——
按纪律这已经算"带外代价"。但把两条臂在同一台机器、同一时间窗里交替跑三次（`TEMP/r18-ab.sh`，
产物指纹逐臂登记）之后，画面完全变了：

| 臂 | 入口 chunk（判代） | Menu active | 点击→Game | Menu 段 KB | 点击段 KB |
|---|---|---|---|---|---|
| 全量代 ① | `index-CJqW9TNF.js` | 754（879/629） | **1716.5**（1632/1801） | 3799 | 3031 |
| 两段化代 | `index-BEyFZ836.js` | 812.5（858/767） | **1542.5**（1663/1422） | 2504 | 4632 |
| 全量代 ② | `index-CJqW9TNF.js` | 747（705/789） | **1270.5**（1312/1229） | 3799 | 3031 |

**同一份全量代产物，两次跑相差 446ms**（1716.5 → 1270.5，且第二次反而比"退化前"的基线更快），
而跨代差只有 370ms ⇒ 该里程碑的本机漂移带 ≈±450ms，比战役一直使用的 ±120ms 带宽得多
（那条带是在 DCL/menuActive/reload 上标定的，不适用于含 ≈30 个请求、4.6MB 载荷的点击段）。
故**撤回**"本轮给进房加了 ≈370ms 代价"与"Menu active +108ms"两条——两段在本机都**测不出来**，
能主张的只剩字节账（Menu 段 −1295KB / 全链 +304.8KB）与下面的位图账。
快照 `load-r18-ab-{full,split,full2}.json` 与 `load-r18-{base,after}-f01.json` 一并入库，
供今后标定这条带宽。**方法论收获**：跨快照（相隔数小时、且中间跑过整套门禁）的 ms 比较一律不算证据，
本轮起凡要主张 ms 级差异必须同场交替（A/B/A）。

### 五之二、位图账（本轮真正的隐性代价，此前没进过账）

件A 刻意**不动 `.fnt`**（260 条字形度量/帧表留在原位，缺字只是无墨），所以子集图与全量图**同尺寸**
2191×1024 RGBA ⇒ 两段化之后页面生命周期里挂着**两张 8,974,336B 的解码位图**（全量代只有一张）。
传输少了 1295KB，纹理驻留却翻倍——这条与 r14 的驻留轴同源，是本轮的代价面，如实记下。
探针实测（`benchmark/font-decode-probe.mjs`，同一次 Chromium 页面内）：
`font.png` createImageBitmap 110.9ms / `img.decode` 43.6ms，子集 `font-prephase.png` 37.0 / 48.0ms，
绘进同尺寸 canvas 再取像素 24.9 / 18.9ms；而 1600.3KB 的传输在批内只占 **36ms**（1229→1265）——
这既说明本机"少下 1.3MB"换不来时间，也说明重排带来的解码差比驻留差小。
**r19 首位候选因此换靶**：把字形帧紧凑重排（生成配套 `.fnt`，帧坐标改写、`xoffset/yoffset/xadvance` 逐字不动），
让两张位图都从 8.97MB 降到 ≈1–2MB 量级，无损性仍由本轮的 prephase-canvas 五态零容差门禁作证。

驻留面本轮不动也不该动：见上，本轮**增加**了一份同尺寸位图，已列入 r19 目标。

## 六、门禁

**首轮套件就把件C 的破口抓出来了**：vitest 201 例里 1 红、
`journey wonrefresh` RC=1（`Invalid BitmapText key: font-full`），其余全绿——即 §三 件C 那条支路。
`20ae670` 修好后重跑，末轮套件（全部 RC=0）：

| 件 | 结果 |
|---|---|
| typecheck / build | 0 错；产物入口 `index-BEyFZ836.js` |
| vitest | 19 文件 **202/202**（`font-prephase.test.ts` 11 例，第 11 例即件C 防护网） |
| det（`perf-determinism --compare r32`） | **48/48 位级一致** |
| **prephase-canvas** | **5/5 逐字节**（menu 803825B / temple 279822B / temple-numbers 448944B / settings 327029B / credits 378094B）；对拍在**第三代产物**上复现全量代首捕像素，`--save` 已把该指纹（`index-BEyFZ836.js=5a044a03cafbd0df`）登进 `manifest.bundlesVerified`（三代互验：全量代首捕 / 两段化首批 `rlLaY6Dc` / 本批） |
| treebake / groundcache | 9/9（三层金样 3784598315·64705792·1703026984）/ 6/6（地面像素 hash 297589047 不变） |
| audiofamily / domskin | 14/14 / 4/4 |
| journey 八模式 | journey 7/7、pause 11/11、leave 3/3、refresh 3/3、**wonrefresh 6/6**、rejoin 3/3、deathretry 4/4、rolesplit 6/6 |
| route forest_01 | 3/3 全通（winAt 39494·39514·39505，基线带内） |
| visual-diff | **90.63%**（容差 48），最优平移 (0,0)，带 90.55–92.86 内 |
| perf-client | canvas 60.3fps / 帧内 998KB·s⁻¹（webgl 12.1fps 系软件光栅口径） |
| perf-advance | 5/5 零网络·烘焙均值 28.5ms·换关→可玩均值 1090.5ms（与 r13/r17 同带） |
| perf-load | 见 §五；同场 A/B/A 三快照 `load-r18-ab-{full,split,full2}.json`（其 `meta.git` 记检出 HEAD `0969558`，非各代内容提交——A/B 是靠回退工作树重建做的，口径同 r16 勘误） |

快照文件（`benchmark/results/`）：`load-r18-base-f01.json`、`load-r18-after-f01.json`、
`load-r18-ab-{full,split,full2}.json`、`client-r18-f01.json`、`advance-r18.json`。

## 七、发现（不是本轮回归，但必须摆到桌面）：进房前 75 字里 **22 个字今天就没有字形**

`font.fnt` 未声明这些码位，Phaser 缺字形时静默跳过、advance 为 0（`GetBitmapTextSize.js:231-236`），
所以它们**在当前线上就是空白**：

| 出处 | 文案 | 缺的字 |
|---|---|---|
| `menus.ts:29`（`bitmapText` 标题「设置」） | 设置 | **设 置 全缺**⇒标题整块不显 |
| `menus.ts:62,63`（开关行「音乐」「音效」） | 音乐 / 音效 | 音 乐 效 |
| `menus.ts:80,81`（「制作人员」「本复刻基于原版游戏」） | | 员 / 本 复 刻 基 于 原 版 |
| `menus.ts:124,125`（「恭喜！」「你完成了全部挑战」） | | 恭 喜 / 你 全 挑 战（**「恭喜！」与官方字典字面逐字相同，原版同样缺**，见 §九） |
| `transition.ts:26`（`Loading...`） | | **L** 与 **.** |

这解释了一件此前没人说得清的事：设置面板标题与过渡屏的 "Loading..." 在画布里本来就是残缺的。
**但这 22 个字不是一整块**——收尾取证（§九）把它切成两群，两群的归属相反：
「设置/音乐/音效/制作人员/致谢行/Loading…」是**我方自创文案**（官方 bundle 全树零命中，原版这些位置是图集图标或纯 sprite），
属我方呈现层缺口；而「恭喜！」是**官方中文包自带的字面**（`utils/lang/ch` 的 `congratulations`），
官方自己也是走同一张 260 字形图集的 canvas 位图字，于是原版同样只显一个「！」——这一处**忠实原版**。
本轮**刻意不顺手补字**——补字形＝往官方图生成新墨＝有意改变外观。已按两群登记为待裁决（处置见 §九 与 41 号档 §六）。

## 八、下一轮候选

1. **r19 首位（本轮自主锁定）**：字体图集重排——子集与全量两张 2191×1024 位图各解 8,974,336B，
   本轮把"两张"换成了代价（§五之二）。把字形帧紧凑重排＋生成配套 `.fnt`（帧坐标改写、
   `xoffset/yoffset/xadvance` 逐字不动）可同时压掉驻留与那 304.8KB 传输代价，无损性由
   prephase-canvas 五态零容差门禁作证。
2. **待用户裁决（不变，面额最大）**：二进制再编码（WebP-lossless/AVIF 图集、MP3 重压）。
   按本轮终态重算：≥64KB 的未压缩二进制响应 **15 条 6357.1KB＝全链 7120.7KB 的 89.3%**（r15 旧记 6148.5KB/88.8% 作废），
   其中两份字体副本 1905.4KB（≈26.8%）也在这本账里。触及官方素材一致性与老浏览器解码，未擅自动手。
3. **新增待裁决（分两群，措辞已按 §九 本地复算定稿）**：§七 的缺字形里
   **G1 六串文案（设置、音乐、音效、制作人员、致谢行、Loading…）是我方自创文本**——原版对应位置是图集图标或纯 sprite，任何官方图集（含 `output/E` 的 315 字版）都补不出；
   **G2 一处（「恭喜！」）与原版同形**——官方中文包自带该字面且同样走这张 260 字形图集，原版 A/B/C/D 也只显「！」；
   另有 **G2′ 一处（「你完成了全部挑战」）**：官方原串「你完成了比赛」缺 3 字，我方改写后缺 5 字，洞是我方挖大的。
   处置按群分别裁（四条见 41 号档 §六）：G2 可维持或从官方 `output/E` 的 315 字图集逐字节抄两帧；
   G2′ 把文案改回官方原串即可零成本从 5 字洞降回 3 字洞；
   G1 三条——改文案到 260 字集内（推荐）／合成缺失字框（有意改素材，需换代流程）／退回非 canvas 呈现。
4. **perf-load 隧道节流档**（`--rtt`/CDP emulate，r16 起挂账）：r17 的 +79KB、本轮的 +304.8KB 在弱网的
   真实代价至今只能换算，量具缺位。
5. `bakeMs` 两态复测（⑧）、真机 GPU `texMB`/烘焙峰、`prepareGround/buildGround` 命中计数、
   换关链剩余 ≈45ms、服务端 tick、LAN 剪贴板/BGM 听感/真机触屏手测、M12 相机与共享 DTO 拆分。

## 九、§七 那 22 个字的归属定谳（本地复算，两群相反；两份委托取证各错一半）

`font.png` 与官方 `Fireboy-and-Watergirl/output/A/assets/fonts/chinese/font.png` **`cmp` 无差**，
`font.fnt` 与官方逐条相同（唯一差异是行尾 CRLF→LF）⇒ 字形天花板由官方资产决定，我方没削减过任何东西。
官方那份 `.fnt` 声明 260 个码位＝**217 汉字 + 43 ASCII**，ASCII 侧连 `L` 与 `.` 都没有——它是**按该中文版实际用到的文本
反推生成的图集**，不是全量字库（连官方自己的 `Unlock all levels!` 在这张图上都缺 `U` `k` `!`）。

**关键前提（这条决定归属判据）**：原版中文包**不走 DOM**。`utils/lang/ch`（`modules/utils_lang_ch.js`，
`init.beautified.js:77980-78008`）是内置中文字典，`utils_lang_Lang.js` 挂成 `game.lang.locale()`，
取到的中文**送进 canvas 位图字**（`States_Complete_GameCompleteMenu.js:17,20`、`States_Credits_CreditsMenu.js:22-23`）——
用的正是这张 260 字形图集（官方把它注册成四个键，`init.beautified.js:77922-77925`）。
于是**原版自己的界面就带空白洞**：`congratulations:"恭喜！"` 只显「！」、`you_completed:"你完成了比赛"` 缺「你比赛」、
`credits_to:"所有学分都会去"` 缺「所学去」。

归属判据因此是**"官方 bundle 里搜不搜得到同字面"**（`grep -rl` 变体 A 全树命中数）：

| 群 | 我方文案 | A 全树命中 | 判定 |
|---|---|---|---|
| G1 | 设置 / 音乐 / 音效 / 制作人员 | **0** | 原版 SettingsMenu 只有 `"or"` 字面＋`MusicButton/FxButton` **图集图标**（无文字标签），CreditsMenu 标题不是这串字 ⇒ **我方自创，我方缺口**；官方 LoaderBar 是 `PreloaderAssets` **纯 sprite**（`:19,25,28`），`Loading...` 整串是我方造的 |
| G2 | 恭喜！ | 1（lang 字典） | **与官方字面逐字相同、走同一图集 ⇒ 原版同样缺**，属忠实呈现 |
| G2′ | 你完成了全部挑战 | 0（原串为「你完成了比赛」） | 我方改写把缺字从 3 放大到 5，**洞是我方挖大的** |

官方变体不等：`output/E/assets/fonts/chinese/font.fnt` **315 码位**，多出 恭/喜/你/比/赛/学/所/去 等 55 字，
能补齐 G2；但 E **仍缺** 设置音乐效员基于暂重，且反过来丢了 A 有的 `c`、`g` ⇒ 换图集只救 G2 那一类，救不了 G1。

两份委托取证**方向相反、各错一半**，本档一律以本地复算为准：第一份的 assets 文件名与哈希逐条不存在（虚构），
其"官方用 DOM/`Microsoft YaHei` 渲染中文"亦无据（`grep -rl YaHei` 官方 A 全树 0 命中，该字面只在我方 `index.html` 的 DOM 皮肤 CSS）；
第二份"原版自己也空白"成立，但它暗示换 E 能顺带解决设置/音效一类，核验为假。
证据链、可复跑核法与勘误全文见 [41 号档](../research/2026-10-fidelity/41-chinese-font-glyph-coverage.md)。
处置四条（G2 维持或抄 E 两帧／G2′ 改回官方原串／G1 改文案·合成字框·退 DOM·维持空白）——**待用户裁决**，本轮未动码。
