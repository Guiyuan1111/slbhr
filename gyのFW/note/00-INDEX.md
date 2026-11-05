# note · 总导航（00-INDEX）

> 开发文档枢纽。**开工顺序**：主 README 版本段（现状）→ [handoff.md](handoff.md) 前置条目（最新动态，条目格式规范见其头部）→ 本页各域索引。
> 维护规则：`note/` 下新建研究域必须自带 `00-INDEX.md` 并在本页登记；新挂账一律进行为复刻 INDEX §3，不散落。

## 快速定位

| 要找什么 | 去哪 |
|---|---|
| **新会话/新 AI 开工指令（当前有效）** | [handoff.md](handoff.md) 置顶条目（完整开工说明书：[handoff/2026-10-20-session-handoff.md](handoff/2026-10-20-session-handoff.md)） |
| 项目现状/当前版本 | [../README.md](../README.md) 版本段 |
| 最新开发动态（开工现状源） | [handoff.md](handoff.md) |
| 当前挂账（待办/待核/待裁决） | [research/2026-10-behavior-parity/00-INDEX.md §3](research/2026-10-behavior-parity/00-INDEX.md) |
| 原版不合理优化提案池（须先审后行） | [research/2026-10-behavior-parity/16-original-improve-proposals.md](research/2026-10-behavior-parity/16-original-improve-proposals.md) |
| 逐版改动 | [release/](release/)（`0.3.X.md`） |
| **续作开发手册（经验总结）** | [next-games-playbook.md](next-games-playbook.md) | 森林神庙收官复盘：可复用底盘/机关谱/工具链地图/方法论八条/踩坑清单/续作 SOP |
| **灯光神庙（第二部）开发档卷** | [evidence/2026-10-25-light-temple/00-INDEX.md](evidence/2026-10-25-light-temple/00-INDEX.md) | 2026-10-25 立项：Phase 0 取证（6 类光新机关）+Phase 1 数据入库/det 分部基线 |
| **冰雪神庙（第三部）开发档卷** | [evidence/2026-10-25-ice-temple/00-INDEX.md](evidence/2026-10-25-ice-temple/00-INDEX.md) | 2026-10-25 立项：Phase 0 取证（timedpusher 唯一新机关）+Phase 1 数据入库/r0-ice 锚 |

## 研究域（详情进各域 00-INDEX）

| 域 | 索引 | 一句话 |
|---|---|---|
| 行为复刻战役（主） | [research/2026-10-behavior-parity/00-INDEX.md](research/2026-10-behavior-parity/00-INDEX.md) | 01–16 号档（含原版优化提案池）+工具链速查+挂账 §3+性能战役速查 §4 |
| 保真修复档卷 | [research/2026-10-fidelity/00-INDEX.md](research/2026-10-fidelity/00-INDEX.md) | 01–40 号档：关卡/表现/物理保真修复、全 48 关视觉审计、量具核查与验收取证 |
| Issue 处置档案（2026-10-20 批次） | [issues-2026-10-20/00-INDEX.md](issues-2026-10-20/00-INDEX.md) | 20 条 GitHub issue 处置收官（17 修+3 证伪），0.3.40 发版 |
| 代码审计（2026-10-21 批次） | [audit/2026-10-21-code-audit/00-INDEX.md](audit/2026-10-21-code-audit/00-INDEX.md) | 独立工程审计：H1–H4 + M1–M13 + 低危/误报纠正 + 修复台账（0.3.41 已修收口；0.3.42 M12 渐进拆分转部分已修，相机/DTO 仍挂账） |
| 机器探索线 | [research/2026-10-autoplay/00-INDEX.md](research/2026-10-autoplay/00-INDEX.md) | 自动通关路线搜索（S1–S5，断点 tools/ 收容） |
| 早期性能剖析 | [research/2026-10-18-perf-hotspot/00-INDEX.md](research/2026-10-18-perf-hotspot/00-INDEX.md) | 性能战役前身的热点剖析 |
| 连接界面调研 | [research/2026-10-19-connect-ui/00-INDEX.md](research/2026-10-19-connect-ui/00-INDEX.md) | 石板大厅方向调研+三份可开 mockup |
| **水晶神庙（第四部）取证档卷** | [evidence/2026-10-30-crystal-temple/00-INDEX.md](evidence/2026-10-30-crystal-temple/00-INDEX.md) | 2026-10-30 立项：portal 五问全解（配对/触发/传送/乒乓/光束穿门）+Ground -1 背衬墙+资产差仅 5 组（01号档+实机探针） |
| **元素合集（第五部）取证档卷** | [evidence/2026-10-30-elements/00-INDEX.md](evidence/2026-10-30-elements/00-INDEX.md) | 2026-10-30 立项：multi 七庙 rows 选关+元素学习门、cover=纯视觉、firstgid 漂移勘误（01号档） |
| **童话神庙（第六部）取证档卷** | [evidence/2026-10-30-fairytales/00-INDEX.md](evidence/2026-10-30-fairytales/00-INDEX.md) | 2026-10-30 立项：引擎同源判定+fairy 三件套+Tiled 1.x 归一化+尺寸全谱（01号档+无头实跑） |

## 报告与版本

| 内容 | 位置 |
|---|---|
| 性能战役总账（r0–r7 七轮 + §八 r8–r11 + … + §五十一 r54） | [report/perf/2026-10-18-campaign-summary.md](report/perf/2026-10-18-campaign-summary.md) + 同目录各轮报告 |
| **r54 数据布局重写信号预估**（2026-11-05） | [report/perf/2026-11-05-r54-layout-signal.md](report/perf/2026-11-05-r54-layout-signal.md) | r51 最后挂账关闭：四臂括弧量具（含**零 Map 天花板臂**一次封死方向）——槽位直中率 99.8%、位级 0 不一致，但**天花板整帧预估 −4.7µs ≪ 15µs 裁决线**（Map.get 仅 ~5ns/次，大头是属性访问 × 缓存驱逐的物理成本）→ **判负，产线零改动**。客户端射程候选至此全部有裁决 |
| **r53 COOP/COEP 跨源隔离**（2026-11-05） | [report/perf/2026-11-05-r53-coop-coep-timer.md](report/perf/2026-11-05-r53-coop-coep-timer.md) | 两个响应头（Spectre 缓解兼量具解锁）：页内时钟 **100µs→5µs**（确定性，e2e 浸泡零破坏）；r51 页内口径全数补判——**整帧 Δ−10.1µs/帧（−23.5%）与页内 A/B Δ−40.6% 均转可主张**（换臂重建法：exp 断言故意失败确认旧码在跑）；合并判负三度维持；**噪声底真相：消融噪声来自帧调度抖动非时钟** |
| **r52 平台电机声实例池**（2026-11-05） | [report/perf/2026-11-05-r52-platform-sound-pool.md](report/perf/2026-11-05-r52-platform-sound-pool.md) | 角度来自 r51 顺带发现：平台声每次起步 `sound.add` 新建、限位即 `stop+destroy`，实例生命周期从未量化过。新量具 `perf-sound-churn.mjs`（确定性口径）基线 17 新建+19 销毁/300 帧、峰值并发 2；`platSndPool` 池化后 **新建/销毁双归零（−100%，确定性）**，语义等价四点论证（重播/重叠数/生命周期/`fx` 路径）；耗时口径不主张（期望节省低于噪声底，r51 纪律第三次执行） |
| **r51 `updateMechs` 归因重构 + 平滑器优化**（2026-11-05） | [report/perf/2026-11-05-r51-update-mech.md](report/perf/2026-11-05-r51-update-mech.md) | **纠错轮**：实测 `performance.now()` 量化 100µs，**r50 分段表亚百微秒段全部作废**（`updatePlatformSound` 真值 ~7% 非 18.9%）；消融法立为新口径（`updateMechs` 67% / 平滑器 22%）；平滑器 exp 同帧缓存 + 静止快路——**exp 100/帧→1/帧（−99.0%）、快路命中 60.2%（确定性）**，40×120×7 差分逐位等价 0 不一致；合并候选与逐类优化均实测判负；含量具坑三连（**页内量具跑在旧构建上**靠确定性断言当场抓住） |
| **r50 客户端逐帧零分配化**（2026-11-05） | [report/perf/2026-11-05-r50-client-update.md](report/perf/2026-11-05-r50-client-update.md) | 新量具 `perf-update` 首次拆 `GameScene.update` 13 段（`updateMechs` 57.7% + `updatePlatformSound` 18.9% = 76.6%）；两处逐帧分配消除，**28200 次 update 的对象实例 28200 → 1（−100%，确定性）**，耗时带内不主张。含两个量具坑（Phaser `sys.sceneUpdate` 一次性快照使原型包装无效、堆差对短命对象失明）。另 `perf-static` 探测静态资源压缩判**不立项**（一次性成本）。**⚠ r51 已勘误：亚百微秒段受 100µs 计时器粗化影响，占比失真** |
| **r50 r45 stash 处置**（2026-11-05） | [report/perf/2026-11-05-r50-stash-disposition.md](report/perf/2026-11-05-r50-stash-disposition.md) | 结论**丢弃**（已 drop）。勘误 r45 的「+0.68% 带内」：真值 **−1.43%（p=0.0022）**，当年是测量力不足。但结论仍成立——真实工作单元是单关，摊到单关仅 0.019ms，比单轮散布小两个数量级 |
| **r49 选关树烘焙内核**（2026-11-05） | [report/perf/2026-11-05-r49-tree-bake.md](report/perf/2026-11-05-r49-tree-bake.md) | `outlinePass` 三角函数外提 **138.3→53.7ms（−61.8%，区间分离）**，内核合计 −27.8%；但**页面口径 −0.1% 完全带内**——内核收益在 headless 被 87.5% 合成等待淹死。含「合成输入把结论量反」的教训（真实厚层覆盖率 39.8%/29.6% 是稠密）与「合成单测抓不到 1 ULP 缺陷」的量化盲区披露 |
| **r48 选关菜单进度读取**（2026-11-05） | [report/perf/2026-11-05-r48-temple-progress.md](report/perf/2026-11-05-r48-temple-progress.md) | `starsOf` 每次全量 `JSON.parse` 改按原文串记忆：微基准 **22.4ms→37.6µs（−99.8%，区间分离可主张）**，页面端 1147→1061ms 区间重叠不主张；新量具 `perf-step-cpu`（vendor 占 83–97%、自有内核仅 2–16%＝微优化天花板）与 `perf-sleep`（241 关 15 关中招"该睡没睡"，四个修法全被位级门禁否决）；含量具噪声底 ±10% 披露 |
| **r47 服务端每步分配归因**（2026-11-05） | [report/perf/2026-11-05-r47-server-alloc.md](report/perf/2026-11-05-r47-server-alloc.md) | 新量具 `perf-server-alloc` 首次把每步分配归到函数（`character.update` 占自有代码 9.8%）；零分配化后每步分配 **−9.9%**（两臂不重叠），单步 CPU 带内不主张；含「整进程 profile 会被启动期 loader 淹没」的量具坑 |
| **r46 换关链客户端半边**（2026-11-05） | [report/perf/2026-11-05-r46-advance-client.md](report/perf/2026-11-05-r46-advance-client.md) | 新量具 `perf-advance` 首次拆出换关 1.1s 结构（黑幕 65% / 拉关 29% / 重建 5.6%）；黑幕与 fetch 并行使拉关等待 **−67.4%**（两臂不重叠）；顺带修 e2e 与 CSP 不兼容（11 处谓词） |
| **r45 换关链·构建性能轮**（2026-11-05） | [report/perf/2026-11-05-r45-switch-build.md](report/perf/2026-11-05-r45-switch-build.md) | 换关链 **−48.8%**（配对 A/B，超噪声）、World 构建 **−15.4%**、单 world 常驻 **−27.9%**；顺带修复 `reset()` 丢失 `startFrozen` 的复刻性缺陷（10 关），并把 reset 路径补进位级门禁 |
| **r44 六部全库性能轮**（2026-11-05） | [report/perf/2026-11-05-r44-six-temple-round.md](report/perf/2026-11-05-r44-six-temple-round.md) | 首次把 241 关纳入基准与位级锚（此前仅前三部 139 关）；收益诚实判「不可量化」；含 `3a57b13` 漏提勘误 |
| 代码结构分析（2026-10-18 时点快照） | [report/codebase-analysis/](report/codebase-analysis/) |

## 规划·方法·逆向·证据

| 内容 | 位置 |
|---|---|
| 立项计划书（**历史文档**，勿据其开工） | [PLAN.md](PLAN.md)（进度见其横幅补记） |
| 方法论/批次规划 | plans/（deviation-flip、fidelity-audit-method、level-batches、route-production-playbook、route-synthesis、wiring-0.3.0） |
| **版本线与双线并行管理方案** | [plans/2026-10-28-version-lines.md](plans/2026-10-28-version-lines.md) | 1.x=forest / 2.x=light / 3.x=ice；分支模型、跨线回灌流程、机器护栏（drift-check）、每部开工清单 |
| **1.0.0「能起服不能开局」需求侧复盘** | [research/2026-10-28-why-1.0.0-shipped-broken.md](research/2026-10-28-why-1.0.0-shipped-broken.md) | 要求没说错，但三处关键约束是隐含前提；给了以后提这类要求该显式写的三句 |
| **S302 装了 GitHub 仍慢的实测归因** | [research/2026-10-28-s302-github-slowness.md](research/2026-10-28-s302-github-slowness.md) | S302 是绕路器不是加速器；现场数据（国内 30MB/s、出境 100KB/s、经 S302 31KB/s）；镜像证书错乱与 uploads 只劫持不服务 |
| oracle bundle 逆向工作台 | reverse/oracle-a/（beautified init.js + MODULES.md + 模块拆解） |
| 关卡证据库（31 目录，按关组织） | evidence/forest*/ |
| 2026-10-23 复查与开发证据（九槽次） | [evidence/2026-10-23-recheck/](evidence/2026-10-23-recheck/)（01 e2e 全量 11/11、02 视觉带+audit、03 H4 内存有界、04 M12 相机拆分草案、05 netDto 草案、06 M4/M3 验收、07 CI actions 升级）；另 [plans/colyseus-018-upgrade-research.md](plans/colyseus-018-upgrade-research.md) 升级调研 |
| 自验收阶梯（L0–L4） | [self-acceptance.md](self-acceptance.md) |
| 联机架构说明 | [multiplayer-architecture.md](multiplayer-architecture.md) |
| Ubuntu 服务器档案 | [ubuntu-server-profile.md](ubuntu-server-profile.md) |
| 关卡通关路线（顶层散件） | forest01/08/15/23/26-route.md、forest22-route-wip.md、light01-route.md、light02-route.md |
| 开发日志归档（10-05 起逐日） | [handoff/](handoff/)（archive-2026-10.md + 主题档） |
