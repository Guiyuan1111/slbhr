# 综合对比报告：我们的开发方式 vs 同行实践（报告三）

- 日期：2026-10-27
- 输入：报告一（自审，[2026-10-27-dev-methods-audit.md](2026-10-27-dev-methods-audit.md)）+ 报告二（同行调研，[2026-10-27-peer-practices.md](2026-10-27-peer-practices.md)；24 条已核实原文来源，主 agent 抽验 4 项关键事实全部或基本属实，2 处事实误差已就地更正）。

**一句话结论：验证深度上我们处于同行第一梯队——路线验证相当于把 TAS 社区的人工 Sync Verification 全自动化，确定性比对比多数重制项目更细；工程基建的广度（CI 覆盖面、fuzz、语料版本化、版本自动化）落后于一线开源游戏项目，且落后项恰好都是补齐成本低的成熟方案。**

## 一、我们做得好的（在同行参照下成立）

1. **确定性验证深度**：三部位级基线 + 内核可独立步进。对标 Factorio 的确定性文化（FFF-63 heavy mode、FFF-438「almost 6,000 automated tests」，均已核实原文），我们规模小（~260 例 vs ~6000 例）但机制同源、单例验证更细（位级 vs 行为级）。
2. **路线产线 = 自动化的 TAS Sync Verification**：TASVideos 发布靠具名验证人人工重放复核（已核实提交列表）；我们的 FSM→路线 JSON→内核 validate→真服 repeat≥3 全自动完成同构验证，派发抖动 p50≈2ms 全窗落位。**此领域我们已不差甚至更严。**
3. **契约测试拦真实漂移**：netDto 双侧交叉核对在 0.3.49 实际拦下扩字段漂移；调研所见的同行项目均无等价的 Schema↔DTO 契约层。
4. **证据档案文化**：evidence 档卷 + 验收台账 + handoff 断代 + 时效注，比调研所见任何开源游戏仓的文档纪律更系统；与 Anthropic 官方 agent 工作流的「验证闭环」同构且形态更制度化（已核实其两篇工程博客）。
5. **合规卫生**：oracle 严格只读、官方素材不分发、敏感信息隔离——优于常见的侵权灰色 clone 项目。
6. **CI 非零起点**：仓库根 CI 已有 5 作业（typecheck/test/build + 三部 det 基线）。注：报告一、二初稿均误记「无 CI」，主验时以 `.github/workflows/ci.yml` 实况更正——真实差距是覆盖面而非有无。

## 二、我们做得不好的（按风险排序）

1. **闸门缺失（最大单点）**：CI 只覆盖 typecheck/test/build/det；路线回放、视觉差分、保真未进 CI；直推 main 无 branch protection——坏提交能否被拦住取决于 agent 是否自觉在本地跑门禁。同行的关键门禁全部上 CI（OpenTTD/sm64/Shipwright/Veloren，均已核实），OpenRCT2 给回放语料仓单配 CI。
2. **确定性 fuzz 缺腿**：只跑既定路线=只验证「已知的对」。Factorio heavy mode 与 SupCom 一线经验（均已核实原文）共同指向：hidden state 类非确定性靠随机/长跑暴露，未初始化状态是头号根因，复现率可低至 60 分钟局 5%。内核自建，此风险真实。
3. **回放语料与代码同生命周期**：改物理参数无法回答「旧关卡行为漂移了吗」。OpenRCT2 用独立 replays 仓（97 release，主验实测）+ 版本化语料回答这个问题。
4. **版本/变更管理手工**：版本号四处 + lock 手工同步、发版记手写；changesets/semantic-release 是成熟解（均已核实），Veloren 连 publish 都由 tag 正则自动触发（已核实其 .gitlab-ci.yml）。
5. **无 lint/覆盖率门禁**：vitest `coverage.thresholds` 官方支持低阈值起步 + autoUpdate 抬升（已核实），对我们是零迁移成本纯配置；lint 配置文件为零。
6. **路线覆盖率与人力密集**：正式路线记档 8/139 关，每关数小时人工考古；缺输入搜索/自动压帧工具（TAS 生态常规手段的一手算法资料未核实到，不妄评做法，仅记差距）。
7. **挂账与协作流程**：待裁案记在 md 不在 issue tracker；无 PR 评审（单人 agent 开发下「台账+门禁」部分替代，但 PR diff 的自查价值被放弃）。
8. **agent 约定未入仓**：工作流约定散在全局配置与 note，新会话需口头重交；Anthropic 建议 CLAUDE.md 式仓库内约定文件（已核实）。

## 三、改进路线图（按性价比重排，吸收调研清单）

| # | 改进 | 学谁 | 代价 | 收益 |
|---|---|---|---|---|
| 1 | CI 扩展：route-node 抽样回放（每部 1-2 关）+ visual-diff 冒烟进现有 ci.yml | OpenTTD/OpenRCT2 | 低 | 门禁从「自觉」变「机制」 |
| 2 | vitest coverage.thresholds 低阈值起步 + autoUpdate | vitest 官方 | 极低（纯配置） | 覆盖率可见且只升不降 |
| 3 | changesets 接管版本号与 changelog 初稿 | changesets | 低 | 灭多处手工同步 |
| 4 | 仓库内 agent 约定文件（构建/测试/门禁/禁令清单） | Anthropic | 极低 | 新会话零口头交接 |
| 5 | 确定性 fuzz：随机输入 + 多种子 5-30 分钟长跑 + 周期哈希比对 | Factorio FFF-63 / SupCom | 中 | 在玩家之前抓 hidden state desync |
| 6 | 语料版本化：每发版对 routes 打 tag；改内核全量回归出「漂移关卡清单」 | OpenRCT2 replays | 低-中 | 改物理不再是赌博 |
| 7 | 挂账迁 GitHub Issues；评估分支/PR 流 | GitHub docs / OpenMW | 低 | 可追溯 + 自查界面 |
| 8 | （观察项）@colyseus/testing、loadtest 评估；eslint/biome 选型 | Colyseus / Shipwright | 中 | 协议级集成测试与容量数据 |

优先级建议：先做 1/2/3/4（合计约一天工作量，纯增量不碰内核），再做 5/6（各 1-2 天），7/8 挂账观察。

## 四、结语

我们的模式本质是「**以验证为中心的单人 agent 工程流**」：深度指标（位级确定性、契约测试、自动化路线验证、证据档案）已达到或超过同行第一梯队；短板集中在广度（CI 覆盖面、fuzz、语料版本化、版本自动化），全部有成熟低成本解，且与现有档卷文化天然兼容——补齐不需要改变开发方式，只需要把「自觉」升级为「机制」。
