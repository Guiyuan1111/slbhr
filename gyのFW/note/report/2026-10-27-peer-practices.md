# 同行实践调研报告：游戏复刻与联机工程的测试、验证与基建

- 日期：2026-10-27
- 调研对象：本项目（森林冰火人网页复刻，`gyのFW`）的五个对标领域
- 方法：全部结论基于本次实际检索并打开来源页面核实；每条关键论断附完整 URL；无法核实的内容不写，或明确标注（未核实）/（搜索级）。
- 证据分级：
  - 【已核实】= 本次通过抓取工具打开了原文并摘取了内容；
  - 【搜索级】= 仅来自搜索结果摘要，未打开原文，采信度较低；
  - Spring RTS 的 desync 机制细节、Mindustry 的 CI 配置本次未能核实到原文，本报告不予采用（宁可少而实）。
- **主验补正（2026-10-27，主 agent 亲验）**：抽验 4 项关键事实——FFF-438「almost 6,000 automated tests」✓、SupCom 文四要点 ✓（Forrest Smith，非 Spring）✓、OpenRCT2 replays 自述与独立 CI ✓（release 实测 97 个，初稿记 86 已就地更正）、本仓 CI 现状为初稿误记：**仓库根 `.github/workflows/ci.yml` 实已存在**（5 作业，详见 §一 与 §2.4 补正，可借鉴清单第 1 条已由「从零建 CI」改写为「扩覆盖面」）。

---

## 一、调研范围与方法

本项目现状（作为对比基线）：npm workspaces monorepo（client/server/shared，TypeScript），Colyseus 房间制联机，60Hz 定步长自建确定性物理内核；通关路线产线（FSM 编排脚本 → 路线 JSON → 内核回放 validate → 纯 node 真服回放 → repeat≥3 全 PASS）；三层门禁（vitest 约 260 例含 Schema↔DTO 契约测试、确定性位级比对基线、视觉差分+动画保真帧级比对）；证据档卷（note/evidence/、验收台账、发版记、细粒度 commit、TEMP 用后必清）。已知短板（**主验补正 2026-10-27：初稿「无 CI」有误**——仓库根 `.github/workflows/ci.yml` 实已配置 5 作业：typecheck/test/build/非阻断 audit + forest/light/ice 三部确定性基线，push/PR 触发）：路线回放与视觉差分未进 CI、无 lint 与覆盖率门禁、CI 对直推 main 仅观察哨语义；另有直接提交 main 无 PR 评审、版本号多处手工同步、每关路线需人工考古数小时。

调研覆盖五个领域：①开源游戏复刻/重制工程；②实时联机游戏测试与确定性 desync 调试；③TAS/自动化通关；④工程基建（CI、版本发布、门禁、评审）；⑤AI/agent 辅助开发工作流。

---

## 二、分领域同行实践

### 2.1 开源游戏复刻/重制工程

**OpenRCT2（过山车大亨2 开源重制）——回放语料仓库化、版本化。**
OpenRCT2 官方 Wiki 描述其回放系统："OpenRCT2 has a replay system that allows you to record and replay game actions... This system can be used to create regression tests"（【已核实】https://raw.githubusercontent.com/wiki/OpenRCT2/OpenRCT2/Replay-System.md ）。更关键的是它把回放语料独立成仓：https://github.com/OpenRCT2/replays ，仓库自述"Repository of replays for OpenRCT2. Used for testing"，自带独立 GitHub Actions 工作流，并且 release 已达 97 个（主验实测 2026-10-27 gh API；初稿记 86）——即回放语料本身按版本发布，与引擎代码仓库解耦（【已核实】https://github.com/OpenRCT2/replays ）。

**OpenTTD（运输大亨开源重制）——desync 全量动作日志回放。**
官方文档《debugging desyncs》："As desyncs are hard to make reproducible OpenTTD has the ability to log all actions done by clients so we can replay the whole game in an effort to find the desync"（【已核实】https://raw.githubusercontent.com/OpenTTD/OpenTTD/master/docs/debugging_desyncs.md ）；另有专门的 desync 理论与网络架构文档（【已核实】https://raw.githubusercontent.com/OpenTTD/OpenTTD/master/docs/desync.md ）。CI 方面，OpenTTD 主仓库使用 GitHub Actions（`ci-build.yml`，【已核实】https://github.com/OpenTTD/OpenTTD/blob/master/.github/workflows/ci-build.yml ）。

**sm64 反编译（n64decomp/sm64）——"字节级一致"作为 CI 门禁。**
SM64 完整反编译项目覆盖 jp/us/eu/sh/ique 四个版本，构建产物要求与原版 baserom 逐字节一致（byte-perfect match），并配有 GitHub Actions 在 CI 中验证（【已核实】https://github.com/n64decomp/sm64 ）。这是"与原版一致"所能达到的最强 oracle：不等价即编译失败。

**Shipwright（Ship of Harkinian 主仓库）——格式检查上 CI。**
仓库存在且有持续维护的 README（【已核实】https://github.com/HarbourMasters/Shipwright ），其 `.github/workflows` 目录含 `clang-format.yml` 等多个工作流（【已核实】https://api.github.com/repos/HarbourMasters/Shipwright/contents/.github/workflows ）——即代码风格检查作为 CI 独立门禁。

**Veloren（开源多人体素 RPG）——GitLab CI 三段式。**
其 `.gitlab-ci.yml` 定义 `stages: check / build / publish`，并用 `TAG_REGEX '/^v[0-9]+\.[0-9]+\.[0-9]+$/'` 识别 tag 触发发布（【已核实】https://gitlab.com/veloren/veloren/-/raw/master/.gitlab-ci.yml ）。证明游戏仓库完全可以把"检查→构建→发布"做成标准流水线。OpenMW 主仓库托管在 GitLab 上并以 Merge Request 流程协作（【已核实】https://gitlab.com/OpenMW/openmw/-/merge_requests/1138 ）。

**与我们对比：**
- "回放/确定性验证"层面我们已不差：我们有路线 JSON + 内核回放 validate + 位级比对，比多数项目的"录像回放"更严格。
- 他们更好的两点：① OpenRCT2 的**回放语料独立成仓、按版本 release**——语料可跨引擎版本回归，改内核时立刻知道哪些旧关卡行为漂移；我们的路线 JSON 与代码同仓，缺这种跨版本语料台账。② sm64 的**字节级 oracle**——我们没有官方 JS 源码可直接比对（原版是 Flash），但"每关黄金基线"思路与我们视觉差分同源，他们做到的是机制级而非像素级。

### 2.2 实时联机游戏测试与确定性 desync 调试

**Colyseus 官方测试工具。**
官方单元测试文档给出 `@colyseus/testing`：启动测试用服务器实例、创建房间、连接 simulated clients（模拟客户端），并给出与 Vitest 配合的示例（【已核实】https://docs.colyseus.io/tools/unit-testing ）。另有官方压测工具 `@colyseus/loadtest`（【搜索级】https://docs.colyseus.io/tools/loadtest ，本次未打开原文核实细节）。

**Factorio（Wube）——确定性游戏测试的标杆。**
- 自动化测试体系：FFF-62 描述其自动构建服务器每日做测试发布、"run the automated test suites in all the systems and possible configurations"、"can even track the changes that broke the tests and email the people to fix it automatically"（【已核实】https://www.factorio.com/blog/post/fff-62 ）。
- 确定性专项调试：FFF-63 中 kovarex 提出用 "heavy mode" 复跑问题存档来暴露确定性破坏："I made quite reliable way of testing determinism issues, by running given problematic save in the heavy mode"；并把 desync 根因归结为 "most of the desync problems are caused by 'hidden state', that is not properly initialised or saved"；一个存档曾找出 4 个同步问题（【已核实】https://www.factorio.com/blog/post/fff-63 ）。
- 规模：FFF-438 提到 Wube 已有 "almost 6,000 automated tests"，作者称其为 gold standard，测试以 4×4 并行网格运行（【已核实】https://www.factorio.com/blog/post/fff-438 ）。
- 回放系统：官方 Wiki 说明回放只存"重演所需的最小输入"，游戏/mod 版本一变回放即失效（【已核实】https://wiki.factorio.com/Replay_system ）。
- 社区层面，"TDD from the Factorio Team" 曾登上 Hacker News 讨论（【已核实】https://news.ycombinator.com/item?id=27549143 ）。

**desync 的通用调试模式（SupCom 一线经验）。**
Forrest Smith（Gas Powered Games 前员工，《最高指挥官》引擎相关）总结："In SupCom the entire game state is hashed once per second"（整局状态每秒哈希一次做一致性判定）；desync 极难复现："A desync may repro 5% in games lasting more than 60 minutes"；定位靠对状态哈希做二分："Fixing a desync generally involves a binary search of printf-ing the current memory hash as the state is walked"；最常见根因是未初始化变量（【已核实】https://www.forrestthewoods.com/blog/synchronous_rts_engines_and_a_tale_of_desyncs ）。

**与我们对比：**
- 我们自建的"纯 node 真服回放 + repeat≥3"与 Colyseus 官方 `@colyseus/testing` 思路一致，且我们的确定性比对更细（位级）；但官方 simulated clients 的 API 形态和 `@colyseus/loadtest` 压测是我们没用的现成工具。
- 他们更好的两点：① Factorio 的 **heavy mode 随机长跑**——我们主要跑"既定路线"，缺少"随机输入+多种子长时间位级自洽性压测"这一条，恰好是抓 hidden state 的利器；② 6000 例的测试规模（我们约 260 例）说明"测试数量随版本缓慢上涨"是长期文化（FFF-62："The automated test counts are slowly rising"）。

### 2.3 TAS / 自动化通关

**libTAS。**
官方站点自述："libTAS is a software for Linux that provides TAS tools to games, such as frame advance, inputs recording, savestates"（【已核实】https://clementgallet.github.io/libTAS/ ）。即：逐帧推进 + 输入录制回放 + 存档快照，是 TAS 生产的标准三件套。其确定性保障（模拟定时器、固定 1/fps 帧长的模拟 vsync）在官方文档中有述（【搜索级】https://tasvideos.org/EmulatorResources/LibTAS/MenuOptions ，本次未打开原文核实细节）。

**TASVideos 的"验证人"制度。**
公开提交列表中，大量投稿带 "Sync Verified" 标记并有具名验证人（如 feos、nymx、Tegron 等），状态流为 New → Judging Underway → Accepted → Published（【已核实】https://tasvideos.org/Submissions ）。即：TAS 社区把"可复现性"作为发布前必须由第三方核验的硬门槛——验证人要实际重放并确认与提交者声明一致。社区验证流程的完整制度细节本次未核实到一手页面，此处仅采信列表页可见事实。

**与我们对比：**
- 我们的路线产线（FSM 编排脚本 → 路线 JSON → 内核回放 validate → repeat≥3 全 PASS）本质上就是"游戏内的 TAS 管线 + 自动化 Sync Verification"：libTAS 的 frame advance 对应我们的定步长内核，输入录制对应路线 JSON，验证人复核对应我们的自动 repeat 比对。这一点上我们已经把 TAS 社区的人工验证自动化了，**我们已不差甚至更严**。
- 他们更好的地方在于**生态分工**：TAS 路线是社区多年集体优化产物，而我们的每关路线仍需人工考古数小时。libTAS 生态中"对已有输入序列做逐段微调/搜索以压帧"是常规实践，但"输入自动搜索/帧优化算法"的系统性一手资料本次未核实到，具体做法不展开（未核实）。

### 2.4 工程基建

**版本与 changelog 自动化。**
changesets 官方自述："A tool to manage versioning and changelogs with a focus on monorepos"——专为 monorepo 设计的版本管理与 changelog 工具（【已核实】https://github.com/changesets/changesets ）。semantic-release 官方自述："Fully automated version management and package publishing"——基于 commit message 全自动定版本、打 tag、发 release（【已核实】https://semantic-release.gitbook.io/semantic-release/ ）。两者都直接对位我们"版本号多处手工同步"的痛点。

**覆盖率门禁。**
Vitest 官方文档 `coverage.thresholds`："If a threshold is set to a positive number, it will be interpreted as the minimum percentage of coverage required"，支持 lines/functions/branches/statements 四项、可按 glob 针对子目录单独设阈值、支持 `perFile` 逐文件检查与 `autoUpdate` 自动抬升阈值（【已核实】https://vitest.dev/config/coverage ）。我们已用 Vitest，加覆盖率门禁是零迁移成本的纯配置改动。

**CI 与 PR 评审惯例。**
GitHub 官方文档对 PR 的定位："Pull requests let you propose, review, and merge code changes"（【已核实】https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests ）。游戏仓库上 CI 的实例见 2.1（OpenTTD、sm64、Shipwright、Veloren），证明"游戏项目没法制 ving CI"不成立；风格门禁实例见 Shipwright 的 clang-format 检查。

**与我们对比：**
- 我们的验收台账/证据档卷文化比多数开源项目更系统（这是我们的强项，同行普遍没有等价物）。
- 他们更好的地方：**CI 是默认配置**（以上所有项目全部有流水线），而我们的 CI 覆盖面窄（typecheck/test/build+三部 det 基线，无 lint/覆盖率/路线回放抽样，详见 §一 补正）；版本发布链路自动化（Veloren 的 tag 正则触发 publish、changesets/semantic-release），而我们是手工多点同步。短板明确且补齐成本低。

### 2.5 AI / agent 辅助开发

**Anthropic 官方工程实践。**
《Claude Code best practices》给出：在仓库放 CLAUDE.md 记录项目约定与常用命令；用 TDD 闭环驱动 agent（先写测试、确认失败、再实现直至通过，适合视觉可验证的场景）；explore → plan → code → commit 的分阶段工作流（写代码前先读代码、先出计划并确认）；多实例并行（多 Claude 分工不同任务、一个写代码一个复核）（【已核实】https://www.anthropic.com/engineering/claude-code-best-practices ）。《How we built our multi-agent research system》给出 orchestrator-worker 模式：lead agent 负责拆解与汇总，worker agent 并行调研，并强调 token 消耗与任务复杂度的权衡（【已核实】https://www.anthropic.com/engineering/built-multi-agent-research-system ）。

**与我们对比：**
- 我们的证据档卷、验收台账、"自述成功不可作为完成依据、必须亲自验证产物"等纪律，与 Anthropic 的 TDD 闭环、多实例互核精神同构，且我们在"证据留存"上更正式。
- 可补的是**把工作流写成仓库内约定文件**（CLAUDE.md 式的项目级 agent 指令：构建/测试命令、门禁清单、禁止事项），使任何 agent 会话都自动继承同一套验收标准；以及把"并行子 agent"从习惯固化为标准分工模板。

---

## 三、可借鉴清单（按性价比排序）

1. **扩展现有 CI：路线回放抽样+视觉差分冒烟进流水线**（主验补正 2026-10-27：本仓已有 CI——typecheck/test/build+三部 det 基线 5 作业；此条由初稿「从零建 CI」改写为「扩覆盖面」）。学什么：把 route-node 抽样回放（每部 1-2 关）与 visual-diff 冒烟挂进现有 `.github/workflows/ci.yml`；lint/覆盖率门禁一并补齐（见第 3、11 条）。引入代价：低。预期收益：门禁从「agent 自觉」变「机制保障」。适配前提：真服回放纯 node 模式可在 CI 跑（已具备）。
2. **changesets 管理版本与 changelog**（学 changesets：monorepo 版本管理专注者）。引入代价：低。预期收益：直接消灭"版本号多处手工同步"，发版记自动生成初稿。适配前提：无，workspaces 原生支持。
3. **Vitest 覆盖率门禁 + ratchet**（学 vitest `coverage.thresholds`）。引入代价：低（纯配置）。预期收益：堵住"无覆盖率门禁"短板；先用低阈值起步，靠 `autoUpdate` 逐步抬升，避免一刀切阻塞开发。适配前提：无。
4. **确定性 heavy-mode 压测**（学 Factorio FFF-63）。学什么：随机种子 + 随机/模糊输入让内核自跑 5-30 分钟，周期性做状态哈希比对，专抓 hidden state 类非确定性；desync 根因多为未初始化状态（SupCom 经验同证）。引入代价：中（需写一个模糊输入生成器与哈希采样钩子）。预期收益：在玩家遇到之前发现极低频 desync——这类问题按 SupCom 经验复现率可低到 60 分钟局 5%。适配前提：物理内核可脱离渲染独立跑（已具备）。
5. **PR/分支评审流（GitHub flow）**（学 docs.github.com PR 定位 + OpenMW 的 MR 实践）。引入代价：低，纪律性改动。预期收益：即使小团队/单人，PR diff 视图也是最佳自查界面，且与 CI 门禁天然联动。适配前提：与第 1 条同。
6. **回放语料独立化与版本化**（学 OpenRCT2 replays 仓库 + 97 个 release）。学什么：把"每关路线 JSON + 期望位级基线"抽成语料集并打版本 tag，内核改动跑全量语料回归，产出"哪些关卡行为漂移"清单。引入代价：中。预期收益：改物理参数不再是赌博；与我们的证据档卷文化天然契合。适配前提：语料格式稳定（已具备）。
7. **`@colyseus/testing` 与 `@colyseus/loadtest`**（学 Colyseus 官方工具链）。引入代价：低-中。预期收益：simulated clients 补协议级集成测试；loadtest 给出房间/广播的容量与延迟数据，为联机体验兜底。适配前提：确认与我们 Colyseus 版本兼容（loadtest 细节本次仅搜索级，引入前先核实文档 https://docs.colyseus.io/tools/loadtest ）。
8. **项目级 agent 约定文件 + explore-plan-code-commit**（学 Anthropic Claude Code best practices）。引入代价：低。预期收益：agent 会话自动继承构建/测试/门禁约定，减少重复口头交代；分阶段工作流降低大改动的返工率。适配前提：无。
9. **多 agent 并行模板化**（学 Anthropic orchestrator-worker）。引入代价：低。预期收益：多关卡迁移、语料扩充这类可分解任务并行提速。适配前提：任务可独立验证，且有统一验收口径。
10. **desync 自动取证**（学 OpenTTD 全量动作日志 + SupCom 周期哈希二分）。学什么：检测到状态分歧时，自动 dump 双端输入流 diff 与分歧前若干帧的逐帧哈希，直接产出"首个分歧行为"定位。引入代价：中。预期收益：把 desync 排查从"人肉考古"变成"读日志"。适配前提：回放系统已存在（已具备），补哈希采样与 diff 输出。
11. **风格门禁进 CI**（学 Shipwright clang-format.yml）。引入代价：低。预期收益：格式争议归零。适配前提：选定工具（如 eslint/biome，具体工具选型本文未核实来源，不展开）。
12. **（可选）semantic-release 全自动发版**。比 changesets 更激进（全自动定版），适合单人节奏；若希望保留人工把关则用第 2 条即可。来源：https://semantic-release.gitbook.io/semantic-release/ （已核实）。

---

## 四、来源附录

### A. 已核实原文（本次打开并摘取内容）

1. OpenRCT2 回放语料仓库：https://github.com/OpenRCT2/replays
2. OpenRCT2 回放系统 Wiki：https://raw.githubusercontent.com/wiki/OpenRCT2/OpenRCT2/Replay-System.md
3. OpenTTD desync 调试文档：https://raw.githubusercontent.com/OpenTTD/OpenTTD/master/docs/debugging_desyncs.md
4. OpenTTD desync 理论文档：https://raw.githubusercontent.com/OpenTTD/OpenTTD/master/docs/desync.md
5. OpenTTD CI 工作流：https://github.com/OpenTTD/OpenTTD/blob/master/.github/workflows/ci-build.yml
6. sm64 反编译仓库：https://github.com/n64decomp/sm64
7. Shipwright 主仓库：https://github.com/HarbourMasters/Shipwright ；其 CI 工作流清单：https://api.github.com/repos/HarbourMasters/Shipwright/contents/.github/workflows
8. Veloren GitLab CI：https://gitlab.com/veloren/veloren/-/raw/master/.gitlab-ci.yml
9. OpenMW GitLab MR 示例：https://gitlab.com/OpenMW/openmw/-/merge_requests/1138
10. Colyseus 单元测试文档：https://docs.colyseus.io/tools/unit-testing
11. Factorio 回放系统 Wiki：https://wiki.factorio.com/Replay_system
12. Factorio FFF-62（自动化测试服务器）：https://www.factorio.com/blog/post/fff-62
13. Factorio FFF-63（heavy mode 确定性测试）：https://www.factorio.com/blog/post/fff-63
14. Factorio FFF-438（近 6000 自动化测试）：https://www.factorio.com/blog/post/fff-438
15. Hacker News "TDD from the Factorio Team"：https://news.ycombinator.com/item?id=27549143
16. SupCom desync 经验文（Forrest Smith）：https://www.forrestthewoods.com/blog/synchronous_rts_engines_and_a_tale_of_desyncs
17. libTAS 官方站点：https://clementgallet.github.io/libTAS/
18. TASVideos 提交列表（Sync Verified、验证人、状态流）：https://tasvideos.org/Submissions
19. changesets：https://github.com/changesets/changesets
20. semantic-release：https://semantic-release.gitbook.io/semantic-release/
21. Vitest 覆盖率阈值文档：https://vitest.dev/config/coverage
22. GitHub 官方 About pull requests：https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests
23. Anthropic《Claude Code best practices》：https://www.anthropic.com/engineering/claude-code-best-practices
24. Anthropic《How we built our multi-agent research system》：https://www.anthropic.com/engineering/built-multi-agent-research-system

### B. 搜索级来源（未打开原文，仅供参考）

25. Colyseus loadtest：https://docs.colyseus.io/tools/loadtest
26. libTAS 菜单（模拟 vsync/固定帧长，TASVideos 页）：http://tasvideos.org/EmulatorResources/LibTAS/MenuOptions
27. 确定性锁步通识（Gaffer on Games）：https://gafferongames.com/post/deterministic_lockstep
28. desync 调试通识（bugnet.io）：https://bugnet.io/blog/how-to-debug-desync-in-deterministic-lockstep-games
29. bevy_ggrs desync 检测实践：https://johanhelsing.studio/posts/extreme-bevy-desync-detection

### C. 本次未能核实、报告未采用的说法

- Spring RTS 引擎 desync 检测的具体机制（最近 N 帧校验和 dump 等）：未核实到一手来源，未采用。
- Mindustry 的 CI 工作流细节：未核实（raw 路径 404、API 访问失败），未采用。
- TAS 社区"输入自动搜索/帧优化算法"的系统性资料：未核实到一手来源，仅作背景提及。
- Factorio FFF-358：经核实内容与测试无关（实为装饰物与污染水），不作为证据。

---

*本报告为一次性调研快照（2026-10-27），仅写入本文件，未做任何 git 操作，未改动其他文件。*
