# 下一步改进分析（基于对比报告，2026-10-27）

- 输入：[对比报告](../report/2026-10-27-methods-vs-peers.md) 改进路线图八条；本仓实况复核（route-all / route-node / perf-determinism / CI 配置已逐个核实）。
- 结论先行：**批次 A（约 1 天，四件纯增量小事）先行**——它直接服务下一个大里程碑（ice 51 关路线产线）；批次 B（约 2-4 天）与 ice 首批路线并行；两项挂账、两项明确不做。

## 一、排序原则

1. 风险优先：先补「闸门」（让门禁从 agent 自觉变机制保障），再补「深度」（fuzz）。
2. 服务里程碑：改进不挤占 ice 路线产线，选件都为 51 关量产护航。
3. 适配单人 agent 直推流的现实：同行方案里为 PR 协作设计的（changesets、全量 PR 评审）不硬搬，取最小等价物。
4. 不碰内核逻辑：批次内全部是基建/配置/脚本，物理代码零改动。

## 二、批次 A：立即执行（约 1 天）

### A1. CI 增 routes-smoke 作业（对比报告 #1）
- 现状核实：`route-node.mjs` 自 spawn 服务端（`serverChild = spawn(process.execPath,...)`）、双 colyseus.js 客户端、无浏览器——CI 可直接跑；现有 `route-all.mjs` 是浏览器重负载，**不**进 CI。
- 动作：ci.yml 新增作业 `routes-smoke`：`node --import tsx scripts/e2e/route-node.mjs --level forest_01 --repeat 1` 与 `--level light_01 --repeat 1` 两步（每关约 1 分钟，三部各取 1 关代表）；正式门禁仍为本地 repeat≥3，CI 冒烟只管回归告警。
- 验收：CI 全绿含新作业；人为破坏一处路线事件能被它抓红。
- 工作量：约 2 小时（含试跑）。

### A2. Vitest 覆盖率门禁（#2）
- 现状核实：`vitest.config.ts` 无 coverage 配置，devDependencies 无 `@vitest/coverage-v8`。
- 动作：装 `@vitest/coverage-v8`；先跑一次基线报告看真实覆盖率，`coverage.thresholds` 设「基线−3%」起步并开 `autoUpdate`；新增 `test:coverage` script（`npm test` 保持轻量不变）。
- 验收：`npm run test:coverage` 出报告；阈值达标线生效，覆盖率只升不降。
- 工作量：1-2 小时。

### A3. 版本号同步脚本（#3，对对比报告的修正）
- 修正理由：changesets 为 PR/changeset 文件流设计，我们直推 main 且 `note/release/<版>.md` 手写发版记质量更高——真实痛点只有「版本号四处 + README + lock 手工同步」。取 20 行脚本替代引入整套工作流。
- 动作：`scripts/bump-version.mjs <版本>`：写 4 处 package.json + README 版本行，然后 `npm install --package-lock-only` 校验 lock 同步。
- 验收：`node scripts/bump-version.mjs 0.3.50 && git diff` 仅版本行变化且六处一致。
- 工作量：约 1 小时。

### A4. 仓库内 agent 约定文件（#4）
- 动作：`gyのFW/AGENTS.md`：常用命令表（typecheck/test/路线门禁/det 比对/bump）、档卷与发版惯例、禁令清单（oracle 只读、禁 add -A、禁 co-author、敏感信息、TEMP 必清、子 agent 产物须亲验）。
- 验收：新会话零口头交接即可按约定干活。
- 工作量：30-60 分钟。

## 三、批次 B：与 ice 首批路线并行（约 2-4 天）

### B1. 确定性 fuzz 长跑（#5）
- 现状核实：`perf-determinism.mjs` 已有 sha256 全体缓冲区状态哈希机制（85-99 行），双跑比对框架现成。
- 动作：`benchmark/det-fuzz.mjs`：种子化随机双角色输入，同种子双跑逐 N 帧哈希比对（抓非确定）+ 30 分钟单跑崩溃/出界巡检（抓 hidden state）；跑法本地手动 + 可选 CI cron 夜跑。
- 验收：3 个种子 × 30 分钟双跑位级一致；发现一例即记档（这正是价值）。
- 工作量：1-2 天。

### B2. 语料回归与漂移清单（#6）
- 现状核实：routes 目录 56 个跟踪档中混有探索/版本档，**先甄别出「正式可回跑」清单**（与 route-production-playbook 衔接）；内核侧回跑件已有（route.mjs validate 模式），缺全量编排与漂移报表。
- 动作：①甄别正式语料清单入库（清单文件）；②`route-kregress.mjs`：纯内核全量回跑正式语料，输出每关 WIN/FAIL/漂移帧表；③发版时对语料打 tag（沿用版本 tag 即可）。
- 验收：人为改一个物理参数（如摩擦系数），脚本列出受影响关卡清单。
- 工作量：1-2 天（甄别占大头）。

## 四、挂账与明确不做（#7/#8 的分析结论）

- **挂账待裁**：①挂账迁 GitHub Issues——收益真实（可追溯）但属工作流变更，待用户裁决；②PR/分支流——单人流全量 PR 是负收益（纯仪式），轻量替代：**内核改动走 feature 分支 + 自审 diff 再合 main**，其余直推。
- **观察项**（触发条件再评估）：@colyseus/testing、@colyseus/loadtest（触发：联机容量/协议问题出现）；eslint/biome（触发：多人协作或格式争议实际发生）。
- **明确不做**：semantic-release（全自动定版会削弱手写发版记的判断质量）；浏览器回放路线复活（node 路线已是终局，考古记档在 evidence/2026-10-26-light02-route）。

## 五、与里程碑的衔接

- 大 rock 不变：**ice 51 关通关路线产线**是下一个主战场。
- 批次 A 在 ice 产线开工前完成（半天到一天），理由：A1 的 CI 回归保护在路线批量入库时价值最大；A4 让每个新会话自带全套约定，量产期会话切换频繁。
- 批次 B 与 ice 首批路线并行/随后接入：B1 fuzz 越早跑越早排雷；B2 依赖 ice 路线入库后语料才有意义，不抢跑。
- 总账：批次 A ≈ 1 天、批次 B ≈ 2-4 天，全部不碰内核逻辑，风险可控。
