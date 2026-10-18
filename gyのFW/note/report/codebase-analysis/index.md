# gy-fw（森林冰火人联机版）代码分析报告

> **档卷归属**：本目录由 codebase-analyzer skill 产出（2026-10-18 从 `codebase-analyzer/reports/` 迁入 note 体系）。**承接关系**：上一轮同 skill 分析（2026-09-30，commit 4c99b59）对象是 Fireboy-and-Watergirl **原版 oracle**，其知识已融入 `note/research/2026-10-fidelity/01-original-engine-spec.md` 等档卷（物理文件已清理）；本轮分析对象是**我方复刻工程 gyのFW 本体**——两轮互补：旧轮答"原版怎么做"，本轮答"我们怎么做的"。

**分析时间**：2026-10-18_102654
**分析范围**：`/home/gy/桌面/dev/slbhr/gyのFW`（排除 Fireboy-and-Watergirl/、TEMP/、dist/、node_modules/、codebase-analyzer/、.git/；note/ 作架构背景参考）
**分析模式**：完整分析（65 个源码文件，核心文件全量深读）
**代码规模**：65 个文件 / ~26,084 行（packages 31 + scripts 34）
**技术栈**：TypeScript 5.8 monorepo（npm workspaces）— Phaser 3.90 客户端 / Colyseus 0.16 权威服务端 / vendored Box2DFlash 2.1a 确定性共享内核 / Vite 6 / Vitest 3 / Playwright 1.63

## 报告目录

| 报告 | 内容概要 | 篇幅 |
|------|---------|------|
| [项目架构](01-architecture.md) | 分层结构、模块依赖、技术栈、架构模式判定、函数级调用链（tick 链/手感链/渲染链/加载链） | 长篇 |
| [运行原理](02-operation-principles.md) | 启动序列、核心数据流（变量级变换表）、6 组状态机、生命周期钩子、错误处理链路 | 长篇 |
| [工作流分析](03-workflow.md) | 开发循环、测试矩阵、业务决策树、路线产线与 oracle 仲裁工作流、异常恢复路径 | 长篇 |
| [AI 替代方案](04-ai-substitution.md) | 10 模块 6 维评估、函数级契约、ROI 矩阵、改造路线图 | 中篇 |
| [Skill Blueprint 索引](blueprints/index.md) | 4 个可 AI 替代组件的完整 Skill 设计规格 | 4 Blueprint |

## 核心发现

1. **"确定性边界"即架构边界**：本仓分层不按通用教条，而按可复现性切分——shared/kernel 内一切位级确定（无 Math.random、固定 Step(1/60,8,3)、可注入时基），server 房间层处理墙钟与抖动（意图跨度排水），client 表现层专管平滑（mechTarget 速度外推 + 指数收敛、dead-reckoning lead 17/25ms）。
2. **原版引擎被工程化为测试仪器**：oracle 族（scripts/e2e/oracle/）用 rAF 劫持 + 假钟 init-script 把 269MB 的原版商业游戏变成确定性 60Hz 仲裁机（×N BITEXACT 自证），所有"与原版不一致"的分歧都以它为真值源裁决——这是项目最独特的基础设施。
3. **逐字节保真纪律可执行化**：kernel 每条常数带 bundle 字节偏移证据注释；金轨迹 fixture 双协议（v1 位级 tolerance=0 / oracle 金输出带 alignShift、outcomeWindowF 等旗标）；修复必须通过"物理面 vs 表现层"分账归因，禁止无证据猜测。
4. **无 CI 是哲学不是缺陷（但有人效风险）**：全部门禁为本地可复现脚本（位级确定性使"本机绿≈处处绿"成立），但依赖单人自觉执行——mc ≥98% 预检 → route repeat≥3 真服门的序列可被 Skill 固化（见 Blueprint 02）。
5. **AI 协作已在发生**：档卷体系（note/ 30+ 研究档 + handoff 交接账本）+ 槽位并行工作流构成本仓的既有"AI 工作单元"形态；本报告 4 个 Blueprint 是把其中高频工序固化为可触发 Skill 的设计规格。

## 关键建议

1. **立即落地两个 Quick Win Skill**（档卷写作器 + 门禁编排器）：前者每个排查主题节省 1-2 小时起草时间，后者消除"忘跑门禁"这一最大质量风险敞口。
2. **48 关路线门禁铺开**：批次表（route-all BATCHES）与 mc 预检纪律均已就绪，卡点是纯人工成本——用 Blueprint 02/04 的编排能力按批推进。
3. **oracle 硬编码路径参数化**：oracle/lib.mjs:20 的 ORACLE_ROOT 绑定单机，建议提为环境变量（小改，便于换机复现仲裁）。
4. **保持"内核转写人工主导"红线**：历史证据（fixture 顺序误读、静态解读与运行时实证冲突案）表明该工序的仲裁不可外包给 AI；AI 只应承担检索、读数与档卷起草。
5. **补一个本地 pre-push 门禁钩子**：以最小成本（shell 钩子触发 typecheck+vitest+fixtures）在不引入外部 CI 的前提下守住主干。

> Blueprint 文件可直接用于 `skill-for-skills` 创建对应 Skill；04 报告含每个模块的函数级接口契约与依赖清单。
