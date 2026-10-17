# 01 号档 · 行为级复刻方法论与开源先例调研（bpar2 槽）

> 结论先行：**我们没有 bit-exact 通道（原版=另一引擎+可变 dt），行为一致性的现实目标是"输入→结局分布等价"，业界先例（OpenMW / Ruffle / OpenRA）全部走"原版当 oracle 的差分测试+固定 tick 金输出"这条路，而工具缺口恰好只有一块：把 oracle 从"真实时钟"搬到"可控虚拟时钟"。CDP 虚拟时间（Emulation.setVirtualTimePolicy）可以让 oracle 变成一台确定性 60Hz 机器，与字节同源的 vendor 引擎逐帧对拍——这是本次调研性价比最高的发现。**
>
> - 日期：2026-10-17
> - 槽位：bpar2（接替中断的 bpar；其 TEMP/bpar/ruffle 部分克隆已利用并收容摘录，见 `tools/ruffle-excerpts/`）
> - 方法：WebSearch 为主 + gh api 直查 GitHub 仓库/issue + ruffle 源码摘录（blob sha `653ef4f41af283ca2b0b6d9db167ce392c364a51`）
> - 本槽只调研不实现。

## §0 差异源 → 调研映射

| 我们的行为差异源 | 出处 | 对应调研方向 | 关键可用结论 |
|---|---|---|---|
| ① oracle 可变 dt `Step(min(0.04, elapsed/1000))` vs 我方固定 1/60（跨 dt 轨迹差 200px） | 32/36 号档 P2-11/P1-D2、evidence/forest_25/04号档 §11 | D、E、B | Ruffle：逻辑帧=声明帧率的固定 tick，rAF 实时 dt 只做驱动；CDP 虚拟时间可把 oracle 钉到确定性 60Hz；学术界确认变 dt 破坏验证结论可复现（arXiv 2104.06262） |
| ② oracle 全局钟 `game.time.now`（=Date.now 域，bundle 17 处 Date.now / 8 处 game.time.now）驱动风 sin 相位 | 33 号档 wind、36 号档 §8 | D | Playwright clock API / CDP 虚拟时间可对 Date.now 假钟（Blink 确定性模式）；我方按 t0 锚定的虚拟钟公式重建，残差只剩相位量化 ±半帧 |
| ③ 人类输入相位随机（服务端权威+网络），razor 窗 ±1f=±4px 结局翻转 | 36 号档 §8 | B | 这是**领域本性**不是缺陷——oracle 玩家自己重玩也不同结局；先例全部转向"分布/窗口宽度"度量（property-based + fuzz 抖动），不追求轨迹位级 |

## §1 方向 A：decomp 社区的行为一致方法论

### 1.1 sm64 系（bit-exact 路线的天花板样本）

- **n64decomp/sm64**（★8.9k，<https://github.com/n64decomp/sm64>）：C 源码经原编译器（IDO 5.3/7.2）重编译出**与零售 ROM 逐字节一致**的产物——"编译等价 ⇒ 行为等价"是他们的全部验证。我们不可复制：原版是另一引擎+浏览器真实帧率，编译等价通道不存在。
- **ethteck/asm-differ**（<https://github.com/ethteck/asm-differ>）+ **decomp.me**（<https://github.com/decompme/decomp.me>，★632）：逐函数"目标 asm vs 我方 asm"进度看板。**可借鉴的不是工具而是组织方式**：把"行为一致"拆成可计数的小单元、每个单元有独立判定与进度。我们 30-36 号档逐机制审计就是这个模式的对应物，缺的是**行为面的进度总账**（见 §6 推荐三）。
- **tangosdev/sm64ds-decomp**（★202，<https://github.com/tangosdev/sm64ds-decomp>）：双平台字节匹配，思路同上。
- 参考：David Burela 博客确认"原构建参数重编出逐字节 USA ROM"（<https://blog.davidburela.com/2023/10/28/mario-64-decompiled-and-ported-to-pc>）；HN 讨论（<https://news.ycombinator.com/item?id=28814327>）。

### 1.2 re3 / reVC（增量"换模块进原版跑"验证——与我们最同构）

- **re3**（镜像 <https://github.com/Cai1Hsu/re3>；报道 <https://arstechnica.com/gaming/2021/05/github-reverses-takedown-of-reverse-engineered-gta-source-code>、<https://www.eurogamer.net/how-a-small-group-of-gta-fanatics-reverse-engineered-gta-3-and-vice-city-without-so-far-getting-shut-down-by-take-two>）：项目起点就是把**逆向出的碰撞/物理模块塞回原版引擎里跑**，用游戏内行为确认正确后再扩展。这和我们"kernel headless 31 次/秒整关回放 + oracle 对拍"是同一招：**用原版本身当差分测试的另一半**。
- **OpenRW**（<https://github.com/rwengine/openrw>、<https://openrw.org>）：**反面教材**——试图连同 RenderWare 一起重写，无持续验证闭环，已停滞多年（状态参考 <https://daily.dev/posts/open-source-gta-iii-engine-re-implementation-avg2bpga4>）。教训：**验证循环先于功能扩张**。

### 1.3 OpenMW / OpenRA（"行为分布等价"路线的成功范本）

- **OpenMW**（<https://github.com/OpenMW/OpenMW>）：目标不是 bit-exact 而是"原版内容跑起来行为一致"。验证手段=**用海量真实 mod 当差分测试语料**（Mod Testing Guidelines：<https://wiki.openmw.org/index.php?title=Mod_Testing_Guidelines>）+ 逐特性 parity 追踪（issue tracker）。花了十几年收敛，但成立。**对我们的映射：oracle+CDP 自动化把"人肉试玩对比"换成"可重复的对拍语料库"**。
- **OpenRA**（★17.6k，<https://github.com/OpenRA/OpenRA>）：replay=种子+逐 tick 指令流，**headless 重放即回归测试**。架构分析见 Delft SWA 章节（<https://delftswa.github.io/chapters/openra>）。未找到 OpenRA 官方"CI 里自动重放历史 replay"的公开文档（诚实记录：搜过无果），但其 replay 格式天然适配该模式。
- 通用文章：Every Bug Report Is a Regression Test——bug 报告自带种子+指令，重放即复现（<https://www.k5n.us/2026/09/11/deterministic-replay-bug-reports-regression-tests>，个人博客，权威性低但模式正确）。

### 1.4 OpenGOAL（重编译 vs 原版内存转储）

- **open-goal/jak-project**（<https://github.com/open-goal/jak-project>）：自写编译器重编译，输出与**原版 PS2 内存转储/目标文件逐函数比对**（<https://opengoal.dev/docs/developing/decompiling/getting_started>）。对应物：我们的 oracle bundle 偏移级审计（30-34 号档）已做到同层级。

### 1.5 模拟器社区（bsnes/higan）

- bsnes/higan 没有官方"逐帧 checksum 回归套件"（诚实：搜索无果）；其精度验证靠社区 test ROM 套件（blargg 等，TASVideos 汇总：<https://tasvideos.org/EmulatorResources/SNESAccuracyTests>；SNESdev wiki：<https://snes.nesdev.org/wiki/Emulator_tests>）+ 硬件测量（bsnes changelog issue #211：<https://github.com/bsnes-emu/bsnes/issues/211>）。**可借鉴：把"对拍语料"固化成 ROM 式的独立 fixtures，而非散落的手工脚本**。

**方向 A 小结**：bit-exact 族（sm64/re3/OpenGOAL）给的是"逐单元判定+进度总账"的组织法；行为等价族（OpenMW/OpenRA）给的是"oracle 差分语料+replay 回归"。我们已具备后者的全部基建，缺 oracle 侧的确定性（→§4）。

## §2 方向 B：差分测试与自动化对拍

- **Trail of Bits DIFFER**（<https://blog.trailofbits.com/2024/01/31/introducing-differ-a-new-tool-for-testing-and-validating-transformed-programs>）：差分+回归+fuzz 三合一的工程形态——输入语料目录喂两个实现，输出比对。模式可整体照搬（oracle/内核 = 被差分的两实现）。
- **浮点/时钟敏感点的剥离**：无游戏物理专用先例；通用做法=位同源（同一浮点库/同一 runtime）优先，否则 atol+rtol 容差逐帧比对（综述见 <https://softwareengineering.stackexchange.com/questions/413235/how-to-properly-ensure-equal-functionality-of-different-implementations>；跨编译器等价性研究 <https://zenodo.org/records/14252188>）。**我们的独特优势：vendor box2d.js 与 oracle 引擎字节同源、且可同跑一个 V8——"位可比"条件天然满足，唯一污染源是 dt 序列与时钟**（→§4 全部在解决这个）。
- **property-based testing**：
  - fast-check（<https://fast-check.dev/docs/introduction/what-is-property-based-testing>）：模型化/状态机测试（model-based testing）是官方主打能力，适合"输入脚本→结局恒定域"性质。
  - 游戏规则实例：rock-paper-scissors 性质测试教程（<https://www.arothuis.nl/posts/property-based-testing-rock-paper-scissors/>）、游戏竞赛条目的性质测试实践（<https://www.worthe-it.co.za/blog/2018-11-08-property-based-testing.html>）。
  - 学术近亲：**棋类引擎的 metamorphic testing**（<https://www.sciencedirect.com/science/article/pii/S0950584923001179>，IST 2023）——变换关系测试；可迁移为"镜像关卡→行为同构"性质。
  - 棋类 perft 模式（节点计数标准答案做黄金基线）：<https://www.chessprogramming.org/Engine_Testing>——与我们的 48 关状态指纹 det 基线同构，证明"计数式黄金基线"是被广泛接受的验证面。
- **诚实记录**：以"游戏物理仿真差分测试"为主题的系统性开源工程**没有找到**。最接近的是自动驾驶仿真领域对游戏引擎确定性的研究（→§4 arXiv 论文）与 TAS 工具（→§5 libTAS）。

## §3 方向 C：netcode 与确定性物理工程

- **Box2D 官方 determinism**（Erin Catto，2024-08：<https://box2d.org/posts/2024/08/determinism/>；FAQ：<https://box2d.org/documentation/md_faq.html>）：v3.1 起跨平台逐位确定；**明确不支持 rollback determinism**；固定步长+同输入序列是确定性的前提。我们 vendor 是老版 box2d.js 移植，不适用 v3.1 结论——但同二进制/同 runtime 内确定这条老规则依然成立。
- **JS 物理引擎跨 runtime 不确定的实锤**：planck.js issue #181（Linux vs Windows 结果不同，<https://github.com/piqnt/planck.js/issues/181>）、#282（<https://github.com/piqnt/planck.js/issues/282>）；维护者在 #271 明确措辞："库代码是确定性的，'同一 binary' 应读作'同一 JS runtime'"（<https://github.com/piqnt/planck.js/issues/271>）。**推论：oracle 对拍必须在同一台机器同一 Chromium/V8 上做**（o25a 现状已满足），任何"客户端浏览器复算"路线都会撞上 Math 跨引擎差异。
- **GGPO/rollback**（<https://github.com/pond3r/GGPO>，★3.6k）：rollback=预测+确定性重模拟，前提恰是"固定 dt+确定性步进"；GDC《8 Frames in 16ms》（Mortal Kombat/Injustice 2）：<https://www.gdcvault.com/play/1025471/8-Frames-in-16ms-Rollback>；原理科普：Ars Technica（<https://arstechnica.com/gaming/2019/10/explaining-how-fighting-games-use-delay-based-and-rollback-netcode>）。**先例一致支持：服务端权威固定 dt 是"可验证行为"的前提，原版单机变 dt 手感与网络权威天然冲突，业界无两全先例（诚实：未找到）**。
- **Factorio lockstep 实践**：FFF-76（输入流 lockstep，<https://www.factorio.com/blog/post/fff-76>）、FFF-315（desync 测试服务器：逐 tick 保存/加载地图比对——**与我们 det 位级基线同构的工业级先例**，<https://www.factorio.com/blog/post/fff-315>）、Alt-F4 #26（<https://alt-f4.blog/ALTF4-26/>）。
- **desync 工程学**：Tundra Games"过夜单机 soak 抓罕见 desync"（<https://www.tundragames.com/minimizing-the-pain-of-lockstep-multiplayer>）；bugnet desync 调试（尽早检测，<https://bugnet.io/blog/how-to-debug-desync-in-deterministic-lockstep-games>）；yal.cc 准备确定性 netcode（状态 dump 对比，<https://yal.cc/preparing-your-game-for-deterministic-netcode>）；Gaffer deterministic lockstep（<https://gafferongames.com/post/deterministic_lockstep>）。

## §4 方向 D：时序对齐（本次核心）

### 4.1 经典与流派

- **Fix Your Timestep**（Gaffer on Games，<https://gafferongames.com/post/fix_your_timestep>）：fixed / variable / semi-fixed+accumulator / 自由物理+插值四象限。HN 长讨（<https://news.ycombinator.com/item?id=23649406>）。
- **"固定步长不插值"流派**（Jakub Tomsu，<https://jakubtomsu.github.io/posts/fixed_timestep_without_interpolation>）——**我们现在的路线**：确定性优先、渲染不插值。保留即可，无需改架构。
- **rAF dt 的真实结构**：Orange Duck《Delta Time is a Frame Behind》（2024-09，<https://theorangeduck.com/page/delta-time-frame-behind>）——实测时间戳滞后一帧、系统性抖动模式。**启示：oracle 吃到的 elapsed 序列不是白噪声，是"显示器周期+滞后一帧+偶发双帧"的准周期序列**；对拍时 dt 谱应以该文的结构为底模，而非均匀采样。
- 显示器频率差异（60/120/144Hz→dt 均值不同）的工程讨论：<https://www.gamedeveloper.com/programming/fixing-your-timestep-the-easy-way-with-the-golden-4-8537-ms->。

### 4.2 可变 dt 原版的复刻端策略

- **学术定性**：《On Determinism of Game Engines used for Simulation-Based Autonomous Vehicle Verification》（arXiv:<https://arxiv.org/abs/2104.06262>）——变 dt 使同一测试场景**结论不可复现**，必须钳制 dt 才能做验证。这正面支撑我们的固定 dt 决策，并给"行为差异"一个学术表述：oracle 行为本身是 dt 序列的函数，固定 dt 复刻不可能也不需要在"任意 dt 谱"上等价，只需在"目标 dt 谱"上等价。
- **未找到的**（诚实）：没有找到任何项目公开做过"按原版实测 dt 分布加权采样做统计对拍"的直接先例。最接近的工程近似是 §4.3 的虚拟时间（把 dt 谱钉成一个可控值）与 Ruffle 的 accumulator（把实时 dt 归一到声明帧率）。**dt-分布加权扫描若做，属于我们首创**（成本可控，见 §6 推荐二）。
- **Ruffle 的答案（E 方向实证，直接可抄）**：逻辑帧时长=SWF 声明帧率（`frame_duration = 1000/frame_rate`），rAF 实时 dt 进 `frame_accumulator`，攒够就跑一帧；`MAX_FRAMES_PER_TICK=5` 防追赶死亡螺旋；`update_timers(dt)` 单独吃真实 dt（AS 定时器与逻辑帧解耦）。摘录：`tools/ruffle-excerpts/player-tick.model.rs`、`web-raf-tick.model.rs`。**Flash 世界的"可变时序"被 emulator 归一到声明帧率的固定 tick——与本档推荐方向完全一致**。

### 4.3 全局钟依赖（game.time.now 驱动风 sin）的可复现重建

- oracle 事实：bundle 内 17 处 `Date.now`、8 处 `game.time.now`（本槽只读 grep 复核），Phaser 2 的 `game.time.now` 即 Date.now 域。
- **Playwright Clock API**（≥1.45，<https://playwright.dev/docs/clock>、API <https://playwright.dev/docs/api/class-clock>）：`page.clock.install()` 假钟接管 Date/performance.now/timer，`fastForward` 逐毫秒推进——**oracle 侧风相位可变成"虚拟钟 t 的确定函数"**。
- **CDP 虚拟时间**（§4.4）是更强的版本：整个渲染管线（rAF/timer/时间源）确定性化。
- 我方重建公式：以进关瞬间为 t0 锚，wind 相位=f(t−t0)，t=frame/60·1000；与 oracle（虚拟钟）对拍时残差只剩"oracle 在哪半帧内采样 sin"的量化差（±半帧→sin 相位差有界可算）。
- 真实玩家在线上跑时相位不可知（差异源③的一部分）——诚实结论：**这项只能"分布对齐"（风相位谱一致），不可能逐位对齐**。
- 学术先例：DIECAST（精确时钟模型的确定性重放，<https://dl.acm.org/doi/pdf/10.1145/1963559.1963560>）——"时钟本身是可注入模型"的最早系统论述之一。

### 4.4 CDP 虚拟时间（本次调研最有落地价值的工具发现）

- 机制：`Emulation.setVirtualTimePolicy` 把页面时间源换成合成钟；budget 驱动推进；rAF/timer 确定性触发；`maxVirtualTimeTaskStarvationCount` 防 rAF 循环饿死 budget（cdproto emulation 参数文档：<https://pkg.go.dev/github.com/chromedp/cdproto/emulation>；协议总纲 <https://chromedevtools.github.io/devtools-protocol/>）。
- 设计文档：**Deterministic page loading for Blink**（<https://github.com/rstudio/pagedown/issues/22>）——确定性模式的目标就是"同页同跑序"。
- CLI 简化版：`--virtual-time-budget`（官方 CLI 参考 <https://developer.chrome.com/docs/automation-and-testing/headless-cli>；语义讨论 <https://stackoverflow.com/questions/53548438/what-does-the-argument-virtual-time-budget-of-chrome-cli-really-mean>）。
- **注意点（需冒烟）**：rAF/timer 在虚拟时间下必确定性；`Date.now` 是否被虚拟化"取决于确定性模式配置"（Blink 设计文档口径）——oracle 的 game.time.now 依赖 Date.now，故方案落地前必须先做一个 5 分钟冒烟（虚拟钟下 game.time.now 是否随 budget 推进）。o25a 已有 Playwright+CDP 基建，接入成本低。
- 组合拳：`setVirtualTimePolicy(budget=16.667ms)` × 每预算步 CDP 键盘注入（o25a 已有）× 状态采样（o25a 已有）= **一台"确定性 60Hz oracle 机"**。此时 oracle 与我方内核：同引擎字节、同 V8、同 dt 序列 ⇒ 逐位可比（planck #271 同 runtime 确定性论断 + 36 号档定义面零差异）。

## §5 方向 E：JS/Phaser 生态与 Ruffle

### 5.1 Ruffle（本机源码+检索双重取证）

- **帧率模型**：见 §4.2——真实 dt 驱动 accumulator、逻辑帧=声明帧率固定 tick、追赶钳制 5 帧。TASVideos 侧证："Ruffle 按 SWF 声明帧率实时 pacing"（<https://tasvideos.org/EmulatorResources/Ruffle>，并警告帧率设低会加速游戏=timing 敏感）。
- **时钟模型**：AS 定时器吃真实 dt（`tools/ruffle-excerpts/timer.model.rs`）；`Date`/`getTimer` 走真实钟；治理非确定源的例子：PR #24478 "Replace the 'deterministic' feature with LocaleBackend"（<https://github.com/ruffle-rs/ruffle/pull/24478>）、PR #24915 重写 timers 机制（<https://github.com/ruffle-rs/ruffle/pull/24915>）。
- **行为回归测试（最值得抄的协议）**：`tests/swfs/<用例>/`={test.swf, test.toml, output.txt}，`cargo test` 跑 SWF 比对 trace 金输出（README：<https://github.com/ruffle-rs/ruffle/blob/master/tests/README.md>，本槽全文收容 `tools/ruffle-excerpts/tests-README.md`）。**test.toml 的 `num_ticks`/`tick_rate`（默认=SWF 声明帧率）/`sleep_to_meet_frame_rate`（真实时间开关）证明：其回归套件默认用"固定 tick"而非真实时间**——正是 §4.2 的工程落地。配套生态：浏览器跑测试包 PR #15243（<https://github.com/ruffle-rs/ruffle/pull/15243>）、flaky 用例显式挂账 PR #24128（<https://github.com/ruffle-rs/ruffle/pull/24128>）；渲染测试框架 issue #523 已关闭（<https://github.com/ruffle-rs/ruffle/issues/523>，像素 diff 未成为其主力方案——状态层采样比像素更稳，与我们既有判断一致）。

### 5.2 headless Phaser/物理与像素 diff

- Phaser 官方 HEADLESS 渲染模式（文档自述"为单测而生"）：<https://docs.phaser.io/api-documentation/namespace/phaser>；服务器跑 Phaser 的补丁包 phaser-on-nodejs（★110，支持到 3.87）：<https://github.com/geckosio/phaser-on-nodejs>；实跑文章：<https://medium.com/@16patsle/running-phaser-3-on-the-server-4c0d09ffd5e6>。我们内核已独立于 Phaser，此路线仅在"想 headless 跑 oracle 场景层"时有意义——已被 CDP 方案覆盖，**不用**。
- 像素 diff 工具面：pixelmatch（★7.0k，<https://github.com/mapbox/pixelmatch>）、Playwright `toHaveScreenshot(maxDiffPixels)`（<https://argos-ci.com/blog/playwright-visual-regression-testing-ci>）、BackstopJS（<https://www.drizz.dev/post/best-visual-regression-testing-tools>）。评估：**状态采样已强于像素级**，像素 diff 只值得做"呈现层兜底抽查"（低优先）。

### 5.3 TAS 工具（跨引擎参考）

- **libTAS**（<https://clementgallet.github.io/libTAS>；repo <https://github.com/clementgallet/libTAS>）：帧步进/输入录制回放/存档态/非确定源探测（hook 时间与 RNG）；其 Wine 下输入非确定 bug（issue #249，<https://github.com/clementgallet/libTAS/issues/249>）说明"输入注入确定性"本身是 TAS 工具的核心战场。**概念上 o25a=CDP 版 libTAS，缺的一块就是时间接管**（§4.4 补齐）。
- Flash 域直接先例：**Zwinub/The-Impossible-Game-Flash-Decomp**（<https://github.com/Zwinub/The-Impossible-Game-Flash-Decomp>，Flash 游戏反编译仓库，无验证方法学）；同域仓库 w193241125/FireboyAndWatergirl（"脱壳得出的森林冰火人1源码"，<https://github.com/w193241125/FireboyAndWatergirl>）——**只有资产价值，无方法学可借鉴**（诚实记录）。
- 诚实记录：未找到"网页游戏行为对拍"的成熟公开先例/框架；本档 §6 的组合（CDP 虚拟时间+双引擎差分）在可检索范围内无现成轮子。

## §6 可落地推荐（按投入产出比排序）

### 推荐一（首选）：CDP 虚拟时间 oracle 确定性化 + 双引擎逐帧差分基线

- **解决**：差异源①的"测量面"+差异源②的验证面——把 oracle 从吃真实帧率变成确定性 60Hz 机器，oracle/内核进入同 V8 同引擎字节同 dt 序列的**逐位可比区间**（36 号档定义面零差异在此条件下可直接兑现为行为面零差异）。
- **要建**：o25a/lib.mjs 增加 `setVirtualTimePolicy` 控制器（budget=16.667ms/步）+ 每虚拟帧状态采样钩子 + Date.now 虚拟化冒烟探针（若 Date.now 不虚拟化则退 `page.clock.install()` 组合）。工具增量估 **≤150 行**。
- **工作量档**：低（1–2 个工作日，含冒烟）。
- **验收**：同一输入脚本 ×3 次虚拟钟运行，oracle 状态流逐位一致；随后与我方内核 det 轨迹逐帧比对输出最小差分对清单。
- 依据链：§4.4 CDP 文档+设计文档、§2 同 runtime 确定性、§1.2 re3"原版当差分另一半"。

### 推荐二：dt-分布加权扫描（dt-sweep 敏感度谱）

- **解决**：差异源①的"本质面"——量化"固定 1/60 距 oracle 行为面到底差多少、差在哪类场景"，把 200px 单点数字变成 48 关敏感度谱；若谱显示只有长悬挂/长坡类敏感（36 号档 P1-D2 预判），则只需对敏感关做定点处理，避免全局架构翻动。
- **要建**：内核 replay 基建（已有，31 次/秒）+ dt 序列注入器（输入 dt 流替代固定 1/60，估 **<100 行**）+ oracle 真实钟模式采集 elapsed 谱（60/120/144Hz、掉帧尖峰；o25a 改造）+ 谱对拍报告器（终点/事件时序分布 vs 金轨迹）。
- **工作量档**：中（2–3 个工作日）。
- **验收**：48 关 dt-sweep 报告一页谱图+敏感关清单；对 04 号档 §11 的 200px 给出分布化解释。
- **诚实**：此模式未找到直接先例（§4.2），属首创做法；学术定性支撑为 arXiv 2104.06262。

### 推荐三：Ruffle 式金轨迹 fixture 回归（行为面进度总账）

- **解决**：差异源②的工程化+长期防回归——oracle（虚拟钟）与我方内核各跑同一"输入脚本目录"，状态流存 fixture 做金输出比对；风相位按 t0 锚定虚拟钟公式重建并入 fixture；输入相位随机（差异源③）用 fast-check/fuzz 风格 ±N 帧抖动做"结局恒定域"性质测试，把 razor 窗从 boolean 翻转变成长度谱。
- **要建**：fixture 协议（目录=输入脚本+期望状态流+tolerance 声明，仿 Ruffle test.toml）+ vitest runner + 差分报告；**从 forest_01 单关起步**。工具估 300–500 行。
- **工作量档**：中高（约一周到可日常使用；但推荐一落地后边际成本低——fixture 采集器直接复用）。
- **验收**：CI 内 48 关（或首批 10 关）fixture 全绿；任何内核改动的行为面漂移自动出清单（与 det 位级基线互补：det 管"我方内部漂移"，fixture 管"对 oracle 的行为漂移"）。
- 依据链：§5.1 Ruffle 回归协议、§1.1 逐单元进度总账、§2 fast-check 模型化。

**超出复刻能力边界的诚实结论**：差异源③（人类输入相位随机）在 razor 窗下的结局翻转，oracle 真人在真机重玩同样会翻转——能做的是把"翻转窗口宽度"变成指标并压差异源①②，不存在"对齐到人类相位"的方案。

## §7 完整链接列表

GitHub 项目：n64decomp/sm64 <https://github.com/n64decomp/sm64> · ethteck/asm-differ <https://github.com/ethteck/asm-differ> · decompme/decomp.me <https://github.com/decompme/decomp.me> · tangosdev/sm64ds-decomp <https://github.com/tangosdev/sm64ds-decomp> · Cai1Hsu/re3（镜像）<https://github.com/Cai1Hsu/re3> · rwengine/openrw <https://github.com/rwengine/openrw> · OpenMW/OpenMW <https://github.com/OpenMW/OpenMW> · OpenRA/OpenRA <https://github.com/OpenRA/OpenRA> · open-goal/jak-project <https://github.com/open-goal/jak-project> · pond3r/ggpo <https://github.com/pond3r/GGPO> · ruffle-rs/ruffle <https://github.com/ruffle-rs/ruffle>（tests README <https://github.com/ruffle-rs/ruffle/blob/master/tests/README.md>；PR #24478 <https://github.com/ruffle-rs/ruffle/pull/24478>；PR #24915 <https://github.com/ruffle-rs/ruffle/pull/24915>；PR #15243 <https://github.com/ruffle-rs/ruffle/pull/15243>；PR #24128 <https://github.com/ruffle-rs/ruffle/pull/24128>；issue #523 <https://github.com/ruffle-rs/ruffle/issues/523>）· clementgallet/libTAS <https://github.com/clementgallet/libTAS>（issue #249 <https://github.com/clementgallet/libTAS/issues/249>）· mapbox/pixelmatch <https://github.com/mapbox/pixelmatch> · geckosio/phaser-on-nodejs <https://github.com/geckosio/phaser-on-nodejs> · piqnt/planck.js issues #181 <https://github.com/piqnt/planck.js/issues/181> / #271 <https://github.com/piqnt/planck.js/issues/271> / #282 <https://github.com/piqnt/planck.js/issues/282> · Zwinub/The-Impossible-Game-Flash-Decomp <https://github.com/Zwinub/The-Impossible-Game-Flash-Decomp> · bsnes-emu/bsnes issue #211 <https://github.com/bsnes-emu/bsnes/issues/211>

Box2D/物理确定性：Erin Catto determinism <https://box2d.org/posts/2024/08/determinism/> · Box2D FAQ <https://box2d.org/documentation/md_faq.html> · SE Radio 739 Erin Catto <https://se-radio.net/2026/09/se-radio-739-erin-catto-on-video-game-physics-engines>

netcode/确定性工程：Factorio FFF-76 <https://www.factorio.com/blog/post/fff-76> · FFF-315 <https://www.factorio.com/blog/post/fff-315> · Alt-F4 #26 <https://alt-f4.blog/ALTF4-26/> · GDC 8 Frames in 16ms <https://www.gdcvault.com/play/1025471/8-Frames-in-16ms-Rollback> · Ars Technica rollback <https://arstechnica.com/gaming/2019/10/explaining-how-fighting-games-use-delay-based-and-rollback-netcode> · Tundra soak <https://www.tundragames.com/minimizing-the-pain-of-lockstep-multiplayer> · bugnet desync <https://bugnet.io/blog/how-to-debug-desync-in-deterministic-lockstep-games> · yal.cc <https://yal.cc/preparing-your-game-for-deterministic-netcode> · Gaffer lockstep <https://gafferongames.com/post/deterministic_lockstep>

时序：Fix Your Timestep <https://gafferongames.com/post/fix_your_timestep> · HN 讨论 <https://news.ycombinator.com/item?id=23649406> · 无插值固定步长 <https://jakubtomsu.github.io/posts/fixed_timestep_without_interpolation> · Delta Time is a Frame Behind <https://theorangeduck.com/page/delta-time-frame-behind> · golden 4⅙ms <https://www.gamedeveloper.com/programming/fixing-your-timestep-the-easy-way-with-the-golden-4-8537-ms-> · Playwright Clock 指南 <https://playwright.dev/docs/clock> / API <https://playwright.dev/docs/api/class-clock> · CDP 总纲 <https://chromedevtools.github.io/devtools-protocol/> · cdproto emulation <https://pkg.go.dev/github.com/chromedp/cdproto/emulation> · Blink 确定性设计文档 <https://github.com/rstudio/pagedown/issues/22> · headless CLI <https://developer.chrome.com/docs/automation-and-testing/headless-cli> · virtual-time-budget 语义 <https://stackoverflow.com/questions/53548438/what-does-the-argument-virtual-time-budget-of-chrome-cli-really-mean> · DIECAST <https://dl.acm.org/doi/pdf/10.1145/1963559.1963560> · AV 引擎确定性论文 <https://arxiv.org/abs/2104.06262>

差分/PBT：DIFFER <https://blog.trailofbits.com/2024/01/31/introducing-differ-a-new-tool-for-testing-and-validating-transformed-programs> · 跨构建等价研究 <https://zenodo.org/records/14252188> · 浮点容差讨论 <https://softwareengineering.stackexchange.com/questions/413235/how-to-properly-ensure-equal-functionality-of-different-implementations> · fast-check <https://fast-check.dev/docs/introduction/what-is-property-based-testing> · RPS 性质测试 <https://www.arothuis.nl/posts/property-based-testing-rock-paper-scissors/> · 游戏竞赛 PBT <https://www.worthe-it.co.za/blog/2018-11-08-property-based-testing.html> · 棋引擎 metamorphic <https://www.sciencedirect.com/science/article/pii/S0950584923001179> · perft <https://www.chessprogramming.org/Engine_Testing> · 确定性重放回归 <https://www.k5n.us/2026/09/11/deterministic-replay-bug-reports-regression-tests>

decomp/模拟器背景：OpenGOAL 文档 <https://opengoal.dev/docs/developing/decompiling/getting_started> · Burela 博客 <https://blog.davidburela.com/2023/10/28/mario-64-decompiled-and-ported-to-pc> · HN 28814327 <https://news.ycombinator.com/item?id=28814327> · Ars re3 <https://arstechnica.com/gaming/2021/05/github-reverses-takedown-of-reverse-engineered-gta-source-code> · Eurogamer re3 <https://www.eurogamer.net/how-a-small-group-of-gta-fanatics-reverse-engineered-gta-3-and-vice-city-without-so-far-getting-shut-down-by-take-two> · OpenMW mod 测试 <https://wiki.openmw.org/index.php?title=Mod_Testing_Guidelines> · Delft SWA OpenRA <https://delftswa.github.io/chapters/openra> · TASVideos Ruffle <https://tasvideos.org/EmulatorResources/Ruffle> · TASVideos SNES 测试 ROM <https://tasvideos.org/EmulatorResources/SNESAccuracyTests> · SNESdev wiki <https://snes.nesdev.org/wiki/Emulator_tests> · openrw.org <https://openrw.org>

Phaser/像素：Phaser HEADLESS <https://docs.phaser.io/api-documentation/namespace/phaser> · phaser-on-nodejs 文章 <https://medium.com/@16patsle/running-phaser-3-on-the-server-4c0d09ffd5e6> · Argos/Playwright 视觉回归 <https://argos-ci.com/blog/playwright-visual-regression-testing-ci> · 视觉回归工具综述 <https://www.drizz.dev/post/best-visual-regression-testing-tools>

## §8 边界与未找到（诚实清单）

1. "游戏物理仿真差分测试"的系统性开源工程：未找到（最接近=AV 验证论文+TAS 工具）。
2. "按原版 dt 分布加权采样对拍"的直接先例：未找到。
3. bsnes/higan 官方逐帧 checksum 回归套件：未找到（其精度验证走 test ROM+硬件测量）。
4. OpenRA 官方 CI 自动重放历史 replay 的公开文档：未找到（replay 格式适配该模式，属合理推断）。
5. Ruffle 渲染测试框架（issue #523）最终结论未深挖（已关闭；从 tests 结构看像素 diff 未成主力）。
6. CDP 虚拟时间对 `Date.now` 的虚拟化程度"视确定性模式配置而定"（Blink 设计文档口径）——**推荐一落地前必须冒烟**，这是本档唯一标注的前置不确定性。
7. 本机无代理：WebFetch 直连不稳，全程改用 WebSearch + gh api + git blob:none 部分克隆（ruffle 摘录已收容 `tools/ruffle-excerpts/`，blob sha 见各文件头）。

## §9 产物与纪律

- 本档卷：`01-survey.md`（本文）+ `tools/ruffle-excerpts/`（player-tick.model.rs / web-raf-tick.model.rs / timer.model.rs / tests-README.md / RUFFLE_COMMIT.txt）。
- TEMP/bpar2 与前任 TEMP/bpar（ruffle 部分克隆）已在收容后删除。
- 前序档：35（简化根因）、36（碰撞矩阵总账）——本档为其 §残余风险的方法论应答。
