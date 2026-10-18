# Skill Blueprint: fw-gate-runner（验证门禁编排器）

> 自动生成自 codebase-analyzer
> 分析时间：2026-10-18_102654
> 源模块路径：scripts/e2e/（regression.mjs、route.mjs、route-all.mjs、mc.mjs、routetool/fixture-runner.mjs）；package.json scripts

---

## 1. 基本信息

| 字段 | 值 |
|------|-----|
| **推荐 Skill 名称** | `fw-gate-runner` |
| **用途** | 按改动类型编排并运行本仓验证门禁序列（typecheck → vitest → 金轨迹 fixtures → 真服 e2e），对 FAIL 输出定位到首次发散帧/用例的结构化解读 |
| **AI 替代等级** | 🤖 完全 AI 化（26/30） |
| **实施优先级** | 🥇 Quick Win |
| **源文件数** | 7+（scripts/e2e 主工具族） |
| **源代码行数** | ~1,500（工具族核心） |

## 2. 触发场景与关键词

- "跑门禁" / "过一遍验证" / "改完内核了，验一下"
- "fixtures 红了，帮我看看" / "fixture-runner FAIL 定位"
- "这关路线过不过门禁" / "mc 跑一下"
- "回归跑一遍" / "route repeat 3"

**推荐 description 触发词（用于 SKILL.md frontmatter）：**

```yaml
description: >-
  Orchestrate and interpret the gy-fw verification gate suite (typecheck,
  vitest, golden-trajectory fixtures, real-server e2e routes with Monte-Carlo
  pre-check). Triggered by: "跑门禁", "过验证", "fixtures 定位", "mc 跑一下",
  "回归", "route repeat".
```

## 3. 输入输出契约

### 主要函数接口

| 命令 | 输入 | 输出 | 副作用 | 代码位置 |
|------|------|------|--------|---------|
| `npm run typecheck` | 无 | tsc 错误清单 | 无 | package.json:16 |
| `npm run test` | 无 | 38 用例 PASS/FAIL | 写 os.tmpdir() JSON | package.json:17 |
| `node --import tsx scripts/e2e/routetool/fixture-runner.mjs --filter <level>` | 关卡名 | 逐 case PASS/FAIL + maxDev 叶明细；exit 0/1 | --update 时重录 expected（source=oracle 拒绝） | fixture-runner.mjs:30-36 |
| `node scripts/e2e/mc.mjs --level <L> --trials 150` | 路线（inputs/routes/L.json） | MC 通过率（≥98% 门禁） | 无 | mc.mjs:11-13 |
| `node scripts/e2e/route.mjs --level <L> --repeat 3` | 同上 | 双浏览器真服 ALL PASS/FAILED；exit 0/1 | 截图/采样至 scripts/e2e/out/；起停本地服 | route.mjs:9-15 |
| `node scripts/e2e/route-all.mjs --batch1` | 批次名 | 逐关 PASS/FAIL 表 | 同上（子进程隔离顺序跑） | route-all.mjs:7-15 |

### 数据模型

```typescript
// fixture FAIL 输出的判定叶（fixture-runner.mjs:14-28 语义）
interface FixtureFailLeaf {
  caseId: string;          // "forest_26/oracle-gold"
  frame: number;           // 首次发散帧（f）
  leaf: string;            // "fb.x" | "wg.vy" | "outcome.frame" | "ev" ...
  expected: number | string;
  actual: number | string;
  dev: number;             // |expected-actual|
}
// 解读要点：frame 叶/ev 叶/status 叶=逻辑差异（需人仲裁）；
// x/y 数值叶超容差=行为差异；vy 叶可能只是 ±1 帧落地相位尖峰（compareVelocities=false 可关）
```

### 错误码

| 错误 | 触发条件 | 处置建议 |
|------|---------|---------|
| E2E 端口占用 | PORT 候选被占 | 换 --port（各工具默认 3557/3575/3620+） |
| fixtures 协议错误 | meta.json 非法/序列不足 | 报 caseId+原因，不改 fixture |
| route not found | 服务未起/房间失效 | 检查 npm run build 是否先执行（regression.mjs:6"构建产物由调用方保证"） |
| oracle 金 case --update | source=oracle | 拒绝执行（fixture-runner.mjs:28） |

## 4. 依赖清单

### 外部服务

| 服务 | 用途 | 接口 |
|------|------|------|
| node + tsx | 直跑 TS 源 | `node --import tsx` |
| Playwright chromium | 真服 e2e 双浏览器 | regression.mjs:128（win32 默认 msedge channel） |

### 内部模块

| 模块 | 用途 | 关键接口 |
|------|------|---------|
| routetool/kernel.mjs | headless 回放 | `runKernel(level, routeDoc, opts)` kernel.mjs:82 |
| fixtures/ | 金轨迹数据 | `<level>/<case>/{route,meta,expected}.json` |
| scripts/e2e/lib.mjs | 起服/入场/started 闸 | `startServer/enterAs/waitForStarted/syncProbe` |

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| FW_PATCH_MS | number | 1000/60 | 出站 patch 率（回退取证 50=旧 20Hz） |
| FW_WIND_PHASE | number | 未设 | 固定风相位（e2e 口径，0=sim 时基） |
| FW_RECONNECT_SECONDS | number | 60 | e2e 缩窗用 |
| route repeat | number | 3 | 门禁要求 repeat≥3 ALL PASS |

## 5. Skill 工作流设计

### 建议的 Workflow 步骤

````markdown
## Workflow / Steps

### Step 1: 改动面识别
git status/diff 判定改动类型：
- 只碰 client/ → typecheck + vitest + regression soak（+ 专项 route 若触动画/平滑）
- 碰 shared/kernel → 全量四重（typecheck + vitest + fixture-runner 全 case + route 抽关）
- 碰 server → typecheck + vitest + journey 全场景 + route repeat
- 碰 fixtures/ 金文件 → 停下要求人工说明（金文件是基线，禁随手重录）

### Step 2: 顺序执行（禁止并行重负载）
typecheck → vitest → fixture-runner（--filter 收窄或全量）→ mc（若动了路线/输入链）
→ route/route-all。mc 与 route 是双浏览器重负载，route-all.mjs:8 明示并行会挤压调度抖动。

### Step 3: FAIL 解读
- vitest FAIL：读断言差值，映射到对应档卷主题
- fixture FAIL：解析首发散帧+叶类型（见数据模型），给出"物理面 vs 表现层 vs 数据面"
  归因候选与建议探针（dtsweep/windphase/animprobe）
- route FAIL：读 scripts/e2e/out/ 采样坐标与截图时间线，区分输入时序问题
  （offset-b 补偿）与行为问题

### Step 4: 收尾纪律
e2e 自带清理（regression.mjs:144-147 finally 移除 fixtures 关卡、杀服务）；
Skill 须复核无残留进程（ps 查 node/tsx）与 TEMP 残留。

### Step 5: 报告
结构化输出：每门禁一行（命令/exit/关键数值），FAIL 附定位证据；不擅自改代码修 FAIL。
````

### 建议的 Constraints

````markdown
## Constraints
- Always 顺序执行重负载门禁（mc/route/route-all 禁并发）
- Always 真服门禁 repeat ≥3；mc 预检 ≥98% 才上真服（mc.mjs:10 纪律）
- Always fixtures FAIL 时先归因再谈修复；oracle 金 case 禁 --update
- Never 在门禁运行中修改 packages/ 源码
- Never 并行多端口跑同关 route（互相挤压调度抖动，见 route-all.mjs:8）
- Never 留下孤儿服务进程/浏览器进程/TEMP 残留
````

## 6. 所需工具权限

| 工具 | 用途 | 必需性 |
|------|------|--------|
| `Bash` | 运行全部门禁命令 | 必需 |
| `Read` | 读 out/ 结果 JSON、FAIL 明细 | 必需 |
| `Grep` | FAIL 定位到源码行 | 可选 |

**建议 allowed-tools：** `Bash Read Grep`

## 7. 使用示例

### ✅ Do This

```text
输入：改了 mechanisms.ts 的 Lever 马达参数，跑门禁
动作：typecheck（绿）→ vitest 38/38 → fixture-runner 全量：
      forest_01/main FAIL @f1593 leaf=fb.x dev=18.7px → 报告"物理面位级漂移，
      建议对拍 oracle lever 沉降角（参照 10 号档流程）"→ 不改代码，交人仲裁
```

### ❌ Not This

```text
错误做法：fixtures 红了直接 --update 重录 expected 变绿——金基线被覆盖，
后续真回归将无人报错（fixture-runner 对 v1 case 允许但纪律要求人工审 diff 摘要）
```

## 8. 参考材料

- 工具协议：`scripts/e2e/routetool/fixture-runner.mjs:1-36`（容差/旗标语义全文）
- 门禁纪律：`scripts/e2e/mc.mjs:5-10`、`scripts/e2e/route-all.mjs:1-15`
- 复跑指南范本：note/research/ 各档末尾"复跑指南"节
