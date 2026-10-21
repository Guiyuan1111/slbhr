# r18 · 中文位图字两段化：进房前只装 304.5KB 子集（2026-10-21）

> 战役第 18 轮。方向从 r17 的"HTML 解析临路径上的 CSS 背景图"切到 **Boot 关键路径上最大的单一文件**：
> `assets/fonts/chinese/font.png` 一份 1600.3KB（未压缩传输口径），占当时 Menu 段 3799KB 的 42.1%。
> 而进房前的画布真的只需要 **75 个字符**——其中 53 个在 `font.fnt` 里有字形。
> 本轮把这一份文件拆成两代：Boot 装子集（304.5KB），全量延到游戏内文本真正要用之前才装。
> 零协议、零物理、零像素设计；子集是从官方 `font.png` 按字框**逐字节抄写**得到的，其余像素清零。
> 单位口径同 `perf-load`：下文 KB = 1024B。

## 一、量具（四件）

| 量具 | 能力 |
|---|---|
| `scripts/png-raw.mjs` | 自研 PNG 原始样本层：解 IDAT + 反滤波 0–4 得 RGBA **原始字节**（不经色彩管理），重编码走 zlib level 9 + 逐行自适应滤波，并**原样保留非 IDAT/IEND 辅助块**（`font.png` 带 pHYs/iTXt/cHRM）——"像素一个字节没改"这句话必须能自证 |
| `scripts/font-subset/prephase.mjs` + `build-font-prephase.mjs` | 子集生成与逐像素核：`parseFnt` 取字框、`composeSubset` 合成授权区、`auditSubset` 核"保留帧=源字节全等 / 未保留帧=零墨迹 / 非授权区=全零"，`--check` 重跑字节可复现，`--ring N` 只做探测不落盘 |
| `packages/client/src/__tests__/font-prephase.test.ts`（10 例） | 静态防护网：进房前调用点集合、游戏内调用点必须用 `FONT_FULL`、字框清单与 `font-prephase.png` 逐条对账、Boot 结构断言（`preload` 里不得再出现 `font.png`） |
| `scripts/e2e/prephase-canvas.mjs`（新门禁，五态） | **前场画布逐像素**对拍。判据 SHA-256 逐字节相等、零容差；FAIL 打 `magick compare -metric AE` 并把差图落 `TEMP/`。基线 `benchmark/results/prephase-canvas/`，代次记 `manifest.provenance` |

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
重复声明 `FONT_FULL` 为何安全（`loadGameAtlases()` 可能被 Menu 暖装与 `GameScene.preload` 各喊一次）：
`LoaderPlugin.addFile`（`:532`）先问 `keyExists`（`:568`）→ `File.hasCacheConflict`（`File.js:499`）`cache.exists(key)`，
`bitmapFont` 的 png 落 `textureManager`（`ImageFile.js:66`）、fnt 落 `cache.xml`（`XMLFile.js:56`），
而 `BitmapFontFile` 给两个子文件同一个键（`:70-74`）⇒ 同进同出，第二次声明**静默跳过**：不发请求、不重解析、不触替换。

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
已缓存时 `addFile`→`keyExists` 跳过、队列空则 `start()` 当场 `loadComplete`
（`LoaderPlugin.js` 的 `list.size === 0` 分支），既不重传也不多等一帧；
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
| 点击建房→Game 段传输 | 3031KB | 4632KB | +1600.3KB（全量字体退回真实下载段） |
| **进 Game 累计传输（全链）** | 6830KB | 7135KB | **+304.5KB＝本轮代价** |
| 条件复验探测（47 幂等 URL） | 6816.1KB→0KB | 7120.7KB→0KB | 复验仍全 304 |
| reload 传输 / Menu active | 4KB / 557ms | 4KB / 611.5ms | 带内 |
| 音轨装载 | 18 条 / 1988.6KB | 18 条 / 1988.6KB | 不动（r16 语义未受影响） |
| 冷启动 Menu active | 673ms | 597.5ms | −75.5ms，**在 ±120ms 噪声带内，不作延迟主张** |
| 点击建房→Game | 1231ms | 1328.5ms | +97.5ms，同带内（且与"这一段的字节多了"方向一致） |

**账要说全**：收益是**关键路径的形状**——DCL→Menu 这一段少下 1295KB，首屏上墙要等的最大单块从 1600.3KB 变 304.5KB，
弱网/隧道下这段是玩家唯一在等的东西；代价是**总量多 304.5KB**（子集是多下来的一份，全量仍要在进房前下完）。
本机 LAN 口径 +304.5KB ≈ 0.024s@100Mbps，与 r17 的 +79KB 同类；两者都还没有节流档可实测（挂账见 §八）。

驻留面本轮不动、也不该动：解码后位图仍是 8,974,336B 量级的全量纹理（`FONT_FULL` 照样进缓存），
子集只是让 Boot 阶段先挂一张小的。

## 六、门禁

（待套件结果回填）

## 七、发现（不是本轮回归，但必须摆到桌面）：进房前 75 字里 **22 个字今天就没有字形**

`font.fnt` 未声明这些码位，Phaser 缺字形时静默跳过、advance 为 0（`GetBitmapTextSize.js:231-236`），
所以它们**在当前线上就是空白**：

| 出处 | 文案 | 缺的字 |
|---|---|---|
| `menus.ts:29`（`bitmapText` 标题「设置」） | 设置 | **设 置 全缺**⇒标题整块不显 |
| `menus.ts:62,63`（开关行「音乐」「音效」） | 音乐 / 音效 | 音 乐 效 |
| `menus.ts:80,81`（「制作人员」「本复刻基于原版游戏」） | | 员 / 本 复 刻 基 于 原 版 |
| `menus.ts:124,125`（「恭喜！」「你完成了全部挑战」） | | 恭 喜 / 你 全 挑 战 |
| `transition.ts:26`（`Loading...`） | | **L** 与 **.** |

这解释了一件此前没人说得清的事：设置面板标题与过渡屏的 "Loading..." 在画布里本来就是残缺的，
而 DOM 侧（`#hud`/`#menu`）的同名中文照常显示，于是"看着像 canvas 的锅"。
本轮**刻意不顺手补字**——补字形＝往 `font.png` 生成新墨＝有意改变外观，且必须动 `.fnt`，
与"逐字节无损"的红线不同类。已作为待裁决项登记（候选处置见 §八）。

## 八、下一轮候选

1. **待用户裁决（不变，面额最大）**：二进制再编码 6148.5KB＝冷启动 88.8%（WebP-lossless/AVIF 图集、MP3 重压），
   触及官方素材一致性与老浏览器解码，未擅自动手。
2. **新增待裁决**：§七 的 22 个缺字形——是否要按现有 48 号字风格**生成**缺失字框补进 `font.png`/`.fnt`
   （外观有意变更，需换代流程），还是维持与原版一致的空缺。
3. **perf-load 隧道节流档**（`--rtt`/CDP emulate，r16 起挂账）：r17 的 +79KB、本轮的 +304.5KB 在弱网的
   真实代价至今只能换算，量具缺位。
4. `bakeMs` 两态复测（⑧）、真机 GPU `texMB`/烘焙峰、`prepareGround/buildGround` 命中计数、
   换关链剩余 ≈45ms、服务端 tick、LAN 剪贴板/BGM 听感/真机触屏手测、M12 相机与共享 DTO 拆分。
