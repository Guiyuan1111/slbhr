# gy-fw AI 工作流替代方案报告

> 分析时间：2026-10-18_102654 ｜ 分析根：`/home/gy/桌面/dev/slbhr/gyのFW`
> 评估基线：本仓**已经在使用 AI 子 agent 槽位工作流**（note/handoff.md 交接账本、多槽并行、档卷纪律）。因此本报告不问"哪些能用 AI"的通用问题，而问：**哪些工作单元可以固化成可复用 Skill，使槽位工作从"每次人肉派单"变成"一键触发"**。

## 1. 评估维度与分级标准

6 维评分（1-5，见各卡片）：确定性 / 输入结构化 / 安全风险 / 领域复杂度 / 上下文窗口需求 / 重复性。总分分级：24-30 🤖 完全 AI 化；15-23 🧑‍💻 AI 辅助；6-14 👤 人工主导。

本项目的特殊性权重：**oracle 仲裁纪律**（禁止猜测、分歧必须落到字节偏移引文或 A/B 数据、金 fixture 不可覆盖）是所有"AI 写档/AI 判定"类任务的硬约束——AI 产出引用必须真实可溯，否则违反项目第一原则。

## 2. 模块级评估卡片

### 2.1 档卷写作（note/research、note/release、handoff 条目）— 🤖 完全 AI 化（28/30）

| 维度 | 分 | 依据 |
|------|----|------|
| 确定性 | 5 | 输出=证据引文+量化数据+裁定结论的结构化文档，格式有 30+ 现存档卷可效仿 |
| 输入结构化 | 5 | 输入=git log/diff/工具 stdout（全文本化、行号可引） |
| 安全风险 | 5 | 纯文档，零运行时影响 |
| 领域复杂度 | 3 | 需理解档卷文体（引文带行号、A/B 表、裁定语气），非通用写作 |
| 上下文需求 | 4 | 单档上下文=本档工具输出+相关旧档，局部可闭合 |
| 重复性 | 5 | 每个排查主题/版本都写（git log 中 40%+ commit 是 docs(note)） |

**当前状态**：已部分由 docsync 类槽位承担，但触发、文体校验靠人工。
**AI 替代方式**：Skill 固化文体规范（引文行号强制、量化指标强制、"挂账/收编"术语表）+ 从 git log/diff/工具输出自动起草。
**风险与限制**：编造引用是最大风险——Skill 必须内置"引用前先 grep 验证行号存在"步骤。
**对应 Blueprint**：[blueprints/01-fw-evidence-doc-writer.md](blueprints/01-fw-evidence-doc-writer.md)

### 2.2 验证门禁运行与解读（typecheck/vitest/fixtures/route/mc）— 🤖 完全 AI 化（26/30）

| 维度 | 分 | 依据 |
|------|----|------|
| 确定性 | 5 | 每工具退码即判定；输出全结构化（PASS/FAIL 行、逐帧 diff 叶） |
| 输入结构化 | 5 | CLI 参数明确（--level/--filter/--repeat）；协议文档在文件头注释 |
| 安全风险 | 4 | 只读运行 + e2e 起本地服务；唯一注意=端口冲突与 TEMP 残留清理 |
| 领域复杂度 | 3 | 需懂容差语义（alignShift/outcomeWindowF）才能解读 FAIL |
| 上下文需求 | 5 | 单命令单判定，无需全库上下文 |
| 重复性 | 5 | 每次内核改动后全跑（三重门禁是既定纪律） |

**当前状态**：命令齐备但靠人记得跑、人解读。
**AI 替代方式**：Skill 编排"改内核后必跑序列"（typecheck → vitest → fixture-runner --filter → 按需 route/mc），FAIL 时按工具输出的 maxDev/diff 叶自动定位到首次发散帧并给出候选归因（物理面 vs 表现层的分账框架）。
**风险与限制**：mc/route 是重负载（双浏览器），并发挤压调度抖动是已知问题（route-all.mjs:8 注释）——必须顺序执行。
**对应 Blueprint**：[blueprints/02-fw-gate-runner.md](blueprints/02-fw-gate-runner.md)

### 2.3 oracle 对拍取证（vtrun/goldcollect/windphase/animprobe 运行 + 仲裁档起草）— 🧑‍💻 AI 辅助（22/30）

| 维度 | 分 | 依据 |
|------|----|------|
| 确定性 | 5 | ×N BITEXACT / Δ 数值全机器判定 |
| 输入结构化 | 4 | route JSON + CLI；但"设计什么对拍实验"需要判断 |
| 安全风险 | 4 | oracle 只读伺服；virtual clock 不改原版文件 |
| 领域复杂度 | 2 | 仲裁结论需要"表现层 vs 物理面"分账直觉（10 号档式归因） |
| 上下文需求 | 3 | 需要原版 bundle 结构知识 + 历史档卷结论 |
| 重复性 | 4 | 每个行为疑点一次（频度中等） |

**人工介入点**：归因裁定（"位级同源 → 判表现层"这类决策）与容差定值（tolerance=25px 这类依据撰写）建议人审；采集与数值比对全自动。
**对应 Blueprint**：[blueprints/03-fw-oracle-parity-probe.md](blueprints/03-fw-oracle-parity-probe.md)

### 2.4 路线产线操作（botcore/autosearch/optimize/validate → routes JSON）— 🧑‍💻 AI 辅助（20/30）

| 维度 | 分 | 依据 |
|------|----|------|
| 确定性 | 4 | 搜索有随机性但预算/beam 可控，产物可复核 |
| 输入结构化 | 4 | 检查点链 JSON 是人写的（这是主要门槛） |
| 安全风险 | 5 | 纯离线内核回放 |
| 领域复杂度 | 2 | 检查点设计要懂关卡拓扑与机关语义 |
| 上下文需求 | 3 | 单关数据 + autosearch 评分语义 |
| 重复性 | 4 | 48 关逐关推进（route-all 批次表已列 5 批+tutorial） |

**人工介入点**：检查点链设计与搜索失败时的人工初排；hardening 后验收读数。
**收益**：48 关门禁铺开是既定预案（03-workflow §6），当前卡在人工成本——这是 ROI 最高的半自动化点。

### 2.5 新关卡接入流水线 — 🧑‍💻 AI 辅助（19/30）

新关 = Tiled JSON 入 data/ → level2 解析覆盖确认 → 48 关 det 扫 → 路线产线 → 档卷落档。解析器已全机制化（level2.ts:4"全机制数据驱动"），多数新关"零代码接入"；AI 可自动跑完验证矩阵并报告首个异常类型（新机制 gid？firstgid 越界？出生即死？）。**人工介入点**：新机制类型出现时的转写决策（那属于 2.7）。
**对应 Blueprint**：[blueprints/04-fw-level-onboarding.md](blueprints/04-fw-level-onboarding.md)

### 2.6 表现层调参（mechTarget/dead-reckoning 的 lead/rate、相机弹簧）— 👤→🧑‍💻 AI 辅助（17/30）

| 维度 | 分 | 依据 |
|------|----|------|
| 确定性 | 3 | A/B 网格扫描产出客观数据（rms/maxStep），但"哪个手感好"含主观成分 |
| 输入结构化 | 4 | 扫描脚本化（11 号档已做过 lead 50→17 网格扫描） |
| 安全风险 | 5 | 纯表现层，"零物理/det 影响"有围栏 |
| 领域复杂度 | 3 | 需懂 patch 率与参数的耦合关系（02 报告 §2.2） |
| 上下文需求 | 3 | 单参数族 + A/B 工具 |
| 重复性 | 3 | 参数改动才触发 |

**结论**：扫描执行与数据表格 AI 化；参数拍板（含"对方留 25ms 少量跟随滞后防超车感"这类观感判断）人工。

### 2.7 内核物理转写与保真修复 — 👤 人工主导（12/30）

这是项目的灵魂工序，**不建议 AI 主导**：

| 维度 | 分 | 依据 |
|------|----|------|
| 确定性 | 2 | 每次转写都是对原版语义的考古推断（fixture 顺序、双取负口径都曾误读） |
| 输入结构化 | 3 | bundle 混淆代码 + 偏移引文 |
| 安全风险 | 2 | 错误转写污染 det 基线（重录金 fixture 成本高） |
| 领域复杂度 | 1 | Box2DFlash 语义 + 原版工程惯例（mpx 双负）双重专家知识 |
| 上下文需求 | 2 | 需要 evidence 区段 + 历史误读清单 + oracle dump 三方对照 |
| 重复性 | 3 | 每个新机关类型一次 |

**AI 的正确角色**：辅助检索 bundle 区段、起草对照表、跑对拍取证——**判定与转写由人完成**。历史证据支持这一定位：character.ts:85-87 记载 fixture 顺序曾误读（森林_04 滑轮板亚像素敏感）；mechanisms.ts:114-117 记载"bundle 静态解读反而偏 2.54px，金轨迹证据优先"——即**静态解读与运行时实证会冲突，仲裁靠人**。

### 2.8 联机房间规则（ForestRoom 相位机/重连/暂停）— 👤 人工主导（14/30）

错误影响双人对局体验且场景组合爆炸（断线×暂停×换关×补位），journey.mjs 5 场景只覆盖主干。设计决策（如"断线一律冻结 60s"）是产品语义而非技术推导。AI 可做：新场景的 journey 用例编写、相位迁移表与代码的一致性审计。

### 2.9 渲染复刻（GameScene 视觉配方）— 👤 人工主导（13/30）

每个视觉配方（门 anchor(0.5,0.99)、板心居中 99/159、字号 ×1.6 推翻案）都靠 oracle 实拍+像素差分热图逐个校准，属"测量驱动"而非"规则驱动"。AI 可做差分热图读数汇总，不可替代定配方。

### 2.10 服务端基础设施（index.ts 压缩/缓存/API）— 🤖 完全 AI 化（25/30，低优先级）

标准 express 中间件逻辑、改动频率低、有清晰回退语义。AI 可直接生成/审查此类代码，但因变更稀少，替代收益小——列为 Incremental。

## 3. 函数级替代粒度（抽选"完全 AI 化"模块的函数清单）

档卷写作与门禁运行两个 🤖 模块的接口契约提炼：

| 函数/单元 | 签名 | 位置 | 行数 | AI 替代潜力 |
|-----------|------|------|------|------------|
| `runKernel` | `(level, routeDoc, opts) → {won, deathF, winF}` | scripts/e2e/routetool/kernel.mjs:82 | 13 | 完全 AI 化（调用+读数） |
| `replay` | `(level, routeDoc, meta, caseDir) → {frames, outcome}` | fixture-runner.mjs:84 | 33 | 完全 AI 化 |
| `makeDtFn` | `(dtSchedule, caseDir) → (f)=>dt` | fixture-runner.mjs:59 | 14 | 完全 AI 化 |
| `runScript`（oracle） | `({serverBase, levelId, levelFile, totalFrames, fbIns, wgIns, onFrame}) → {frames, ended, marks}` | oracle/lib.mjs（lib 内部） | ~100 | 完全 AI 化（调用） |
| `canon`（位比较） | `(samples) → string` | vtrun.mjs:54 | 1 | 完全 AI 化 |
| `saveBest` | `(filename: string, stars: number, timeSec: number) → void` | progress.ts:28 | ~10 | 完全 AI 化（低频） |
| `loadLevel` | `(id: string) → LevelBundle` | levels.ts:55 | 24 | 完全 AI 化 |
| `installFixtures`/清理 | `() → installed[]` | regression.mjs:32 | 15 | 完全 AI 化（含清理纪律） |
| `mmss`/`argOf`/`log` 等工具 | — | 多处 | <10 | 完全 AI 化 |

需要人工审查点的典型（AI 辅助模块）：

| 函数 | 位置 | 审查点 |
|------|------|--------|
| `makeSchedules`（dt 谱） | dtsweep.mjs:49 | 谱设计是否覆盖疑点场景 |
| `mechTarget` 参数族 | GameScene.ts:1501 | 手感拍板 |
| `Lever.checkState` 转写 | mechanisms.ts:138 | 静态解读 vs 运行时实证冲突时仲裁 |
| tolerance 定值 | fixtures/*/meta.json | 依据撰写（人审） |

### 接口契约示例：runKernel（完全 AI 化样本）

**前置条件**：node --import tsx 可用；LEVELS_DIRS 下存在 `<level>.json` 及其 tileset 引用。
**后置条件**：只读——不写任何文件（traceTo 数组由调用方提供）。
**不变式**：同一 routeDoc + 同一 dt 网格 → 逐位一致输出（确定性内核属性）。
**错误场景**：关卡缺失 → throw `关卡 X.json 未找到`；routeDoc.tickHz≠60 → fixture-runner 层报错。

## 4. 依赖与上下文需求（Skill 建设视角）

| 依赖类型 | 具体内容 | 来源位置 | Skill 所需 Context |
|---------|---------|---------|-------------------|
| 协议常量 | ROLES/EMPTY_INPUT/InputState | packages/shared/src/{types,index}.ts | 类型定义全文（<50 行） |
| 工具协议 | route JSON 格式、fixture 三件套 | kernel.mjs:10-13; fixture-runner.mjs:5-36 | 文件头注释（自包含） |
| 判定口径 | tolerance/alignShift/outcomeWindowF 语义 | fixture-runner.mjs:14-28 | 同上 |
| 环境变量 | FW_PATCH_MS/FW_WIND_PHASE/FW_DUMP/FW_RECONNECT_SECONDS/FW_DEBUG_* | ForestRoom.ts:29-35,161-185 | 名称+语义表 |
| 档卷文体 | 引文行号制、A/B 表、裁定/挂账术语 | note/research/ 现存 30+ 档 | 2-3 个范例档全文 |
| oracle 路径 | ORACLE_ROOT 硬编码本机路径 | oracle/lib.mjs:20 | 路径常量+存在性预检 |
| 术语表 | det（确定性门禁）/金轨迹/对拍/档/槽位/收容/挂账 | note/handoff.md + research 档 | 词汇表（Skill 内嵌） |
| 清理纪律 | TEMP 残留、installedFixtures 移除 | regression.mjs:144-147 | 必须写入 Constraints |

## 5. ROI 优先级矩阵

```
高收益 + 低难度 → 🥇 立即实施
  ① fw-evidence-doc-writer（档卷起草）——每主题档 1-2h → 分钟级起草+人审
  ② fw-gate-runner（三重门禁编排+FAIL 定位）——防"忘跑门禁"质量事故
高收益 + 高难度 → 🥈 规划实施
  ③ fw-oracle-parity-probe（对拍取证+仲裁档草稿）——保真工序的核心辅助
  ④ 48 关路线铺开（autosearch+mc+route-all 批次推进）——预案已备、成本在人工
低收益 + 低难度 → 🥉 逐步推进
  ⑤ fw-level-onboarding（新关接入向导）——多数关零代码接入，触发稀疏
  ⑥ release notes/version bump 自动化——已有约定俗成格式
低收益 + 高难度 → 📋 暂时搁置
  ⑦ 内核转写 AI 主导（明确不做，维持人工主导 + AI 辅助检索）
  ⑧ 渲染配方自动考古（测量驱动，AI 无优势）
```

## 6. AI 改造路线图

### Phase 1 — Quick Wins（本月）

1. **fw-evidence-doc-writer** — 档卷起草全流程（含引用验证步骤），预期单档写作时间 −70%。
2. **fw-gate-runner** — "改内核必跑"序列固化，预期门禁遗漏归零。

### Phase 2 — Strategic（本季度）

3. **fw-oracle-parity-probe** — 对拍实验半自动：采集/比对全自动，归因档草稿 AI 起草、人拍板。
4. **48 关路线铺开推进器** — 基于 route-all 批次表逐批推进，mc≥98% 预检纪律内嵌。

### Phase 3 — Transformative（本年度）

5. **fw-level-onboarding** — 新关卡（含官方后续主题关）零代码接入验证矩阵。
6. **门禁 watcher**（本地 pre-push/文件监听自动触发 gate-runner）——补 CI 缺位且不违背"本地可复现"哲学。

### 明确不做

- 内核物理转写 AI 主导（2.7 论证：静态解读与运行时实证冲突时仲裁靠人，且污染 det 基线代价高）。
- 未经证据验证的任何"AI 判定"进入档卷（违反 oracle 仲裁纪律第一原则：禁止编造/猜测）。

相关报告：[项目架构](01-architecture.md) ｜ [运行原理](02-operation-principles.md) ｜ [工作流分析](03-workflow.md) ｜ [Blueprint 索引](blueprints/index.md)
