# note · 总导航（00-INDEX）

> 开发文档枢纽。**开工顺序**：主 README 版本段（现状）→ [handoff.md](handoff.md) 前置条目（最新动态，条目格式规范见其头部）→ 本页各域索引。
> 维护规则：`note/` 下新建研究域必须自带 `00-INDEX.md` 并在本页登记；新挂账一律进行为复刻 INDEX §3，不散落。

## 快速定位

| 要找什么 | 去哪 |
|---|---|
| **新会话/新 AI 开工指令（当前有效）** | [handoff/2026-10-20-session-handoff.md](handoff/2026-10-20-session-handoff.md) |
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

## 报告与版本

| 内容 | 位置 |
|---|---|
| 性能战役总账（r0–r7 七轮 + §八 r8–r11） | [report/perf/2026-10-18-campaign-summary.md](report/perf/2026-10-18-campaign-summary.md) + 同目录各轮报告 |
| 代码结构分析（2026-10-18 时点快照） | [report/codebase-analysis/](report/codebase-analysis/) |

## 规划·方法·逆向·证据

| 内容 | 位置 |
|---|---|
| 立项计划书（**历史文档**，勿据其开工） | [PLAN.md](PLAN.md)（进度见其横幅补记） |
| 方法论/批次规划 | plans/（deviation-flip、fidelity-audit-method、level-batches、route-production-playbook、route-synthesis、wiring-0.3.0） |
| oracle bundle 逆向工作台 | reverse/oracle-a/（beautified init.js + MODULES.md + 模块拆解） |
| 关卡证据库（35 目录，按关组织） | evidence/forest*/ |
| 2026-10-23 复查与开发证据（九槽次） | [evidence/2026-10-23-recheck/](evidence/2026-10-23-recheck/)（01 e2e 全量 11/11、02 视觉带+audit、03 H4 内存有界、04 M12 相机拆分草案、05 netDto 草案、06 M4/M3 验收、07 CI actions 升级）；另 [plans/colyseus-018-upgrade-research.md](plans/colyseus-018-upgrade-research.md) 升级调研 |
| 自验收阶梯（L0–L4） | [self-acceptance.md](self-acceptance.md) |
| 联机架构说明 | [multiplayer-architecture.md](multiplayer-architecture.md) |
| Ubuntu 服务器档案 | [ubuntu-server-profile.md](ubuntu-server-profile.md) |
| 关卡通关路线（顶层散件） | forest01/08/15/23/26-route.md、forest22-route-wip.md、light01-route.md、light02-route.md |
| 开发日志归档（10-05 起逐日） | [handoff/](handoff/)（archive-2026-10.md + 主题档） |
