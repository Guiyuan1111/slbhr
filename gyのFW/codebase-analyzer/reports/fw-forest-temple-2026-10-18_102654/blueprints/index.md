# Skill Blueprint 索引

> 分析时间：2026-10-18_102654 ｜ 项目：gy-fw（fw-forest-temple）
> 评估详情见 [../04-ai-substitution.md](../04-ai-substitution.md)

| # | Blueprint | 组件 | AI 等级 | 优先级 | 文件 |
|---|-----------|------|---------|--------|------|
| 1 | fw-evidence-doc-writer | 档卷证据写作（research/release/handoff） | 🤖 完全 AI 化（28/30） | 🥇 Quick Win | [01-fw-evidence-doc-writer.md](01-fw-evidence-doc-writer.md) |
| 2 | fw-gate-runner | 验证门禁编排与 FAIL 定位 | 🤖 完全 AI 化（26/30） | 🥇 Quick Win | [02-fw-gate-runner.md](02-fw-gate-runner.md) |
| 3 | fw-oracle-parity-probe | 原版 oracle 对拍取证与归因草稿 | 🧑‍💻 AI 辅助（22/30） | 🥈 Strategic | [03-fw-oracle-parity-probe.md](03-fw-oracle-parity-probe.md) |
| 4 | fw-level-onboarding | 新关卡接入验证矩阵 | 🧑‍💻 AI 辅助（19/30） | 🥉 Incremental | [04-fw-level-onboarding.md](04-fw-level-onboarding.md) |

## 实施路线图

### 立即实施（Quick Win）

1. **档卷证据写作器**（01）——完全 AI 化：输入 git/工具输出，输出合规档卷草稿；核心护栏 = 引文必须先 grep 复核。
2. **验证门禁编排器**（02）——完全 AI 化：固化"改内核必跑"序列与 FAIL 解读框架；核心护栏 = oracle 金 case 禁 --update、重负载禁并发。

### 规划实施（Strategic）

3. **oracle 对拍取证器**（03）——采集/比对全自动，归因档草稿 AI 起草、裁定与容差定值人工拍板（oracle 仲裁纪律的人机分界）。

### 逐步推进（Incremental）

4. **新关卡接入向导**（04）——零代码接入的验证矩阵自动化；解析器缺口升级人工转写流程。

### 明确不建（人工主导，见 04 报告 §2.7-2.9）

- 内核物理转写、联机房间规则设计、渲染视觉配方——均为测量驱动/仲裁驱动工序，AI 仅可承担检索与读数辅助。

---

> 每个 Blueprint 文件包含创建对应 Skill 所需的完整设计规格。
> 使用 `skill-for-skills` 加载对应 Blueprint 文件即可生成标准 SKILL.md。
