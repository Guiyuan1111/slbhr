# Skill Blueprint: fw-evidence-doc-writer（档卷证据写作器）

> 自动生成自 codebase-analyzer
> 分析时间：2026-10-18_102654
> 源模块路径：note/research/、note/release/、note/handoff.md（文体源）；git/工具输出（数据源）

---

## 1. 基本信息

| 字段 | 值 |
|------|-----|
| **推荐 Skill 名称** | `fw-evidence-doc-writer` |
| **用途** | 从 git log/diff/验证工具输出起草符合本仓档卷文体（引文带行号、量化指标、裁定/挂账术语）的证据文档 |
| **AI 替代等级** | 🤖 完全 AI 化（28/30） |
| **实施优先级** | 🥇 Quick Win |
| **源文件数** | 0（文档工序；文体样本 = note/research/ 现存 30+ 档） |
| **源代码行数** | ~0（消费 git/CLI 输出） |

## 2. 触发场景与关键词

用户在什么情况下会触发该 Skill：

- "把这次排查写成档" / "落档" / "写 N 号档"
- "更新 handoff" / "handoff 加条目"
- "写 release notes" / "出 0.3.x 版本档"
- "把这次对拍结果整理成 research 档"

**推荐 description 触发词（用于 SKILL.md frontmatter）：**

```yaml
description: >-
  Draft evidence-based research/release/handoff documents for the gy-fw repo
  in the house dossier style (line-number citations, quantified A/B metrics,
  verdict/pending terminology). Triggered by: "落档", "写档", "N 号档",
  "handoff 加条目", "release notes", "把对拍结果整理成档".
```

## 3. 输入输出契约

### 主要函数接口

本 Skill 是文档工序，无函数接口；其"接口"是输入证据流到输出文档的映射：

| 输入 | 类型 | 输出 | 副作用 | 来源 |
|------|------|------|--------|------|
| git log/diff | 文本 | 档卷"改动清单"节 | 无 | `git log --oneline`、`git diff` |
| 门禁工具输出 | 文本（PASS/FAIL + 数值叶） | 量化结论行 | 无 | vitest/fixture-runner/route.mjs stdout |
| oracle 对拍数据 | JSON（vt-*-run*.json / verdict） | 位级/容差判定段 | 无 | scripts/e2e/out/ |
| 旧档索引 | 文本 | 交叉引用（"另槽/挂账"链接） | 无 | note/research/*/index |

### 数据模型

```typescript
// 档卷骨架（从 note/research 现存档归纳）
interface ResearchDoc {
  title: string;            // "NN-主题.md"，NN 为序号
  citations: Array<{ file: string; line: number; quote: string }>; // 引文必须带行号
  abTests: Array<{ scenario: string; before: number|string; after: number|string; metric: string }>;
  verdict: string;          // 裁定结论（表现层/物理面分账）
  pending?: string[];       // 挂账项（未决问题）
  reproduce: string[];      // 复跑命令行
}
```

### 错误码

| 错误 | 触发条件 | 处置 |
|------|---------|------|
| 引用校验失败 | grep 不到所引行号/原文 | 禁止写入该引用；改为"待人工定位"标记 |
| 数据缺失 | 工具输出无量化数值 | 该结论降级为"定性"，注明待补数据 |

## 4. 依赖清单

### 外部服务

| 服务 | 用途 | 接口 |
|------|------|------|
| git | 提交/差异取证 | `git log` / `git diff` / `git show` |

### 内部模块

| 模块 | 用途 | 关键接口 |
|------|------|---------|
| note/research/ 现存档 | 文体范本 | 文件系统只读 |
| note/handoff.md | 条目格式范本 | 文件系统读写（仅追加条目） |

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| 档卷编号 | number | 上一档+1 | 从 note/research/<主题>/ 目录推断 |
| STRICT_CITATION | boolean | true | 引文行号必须 grep 复核存在 |

## 5. Skill 工作流设计

### 建议的 Workflow 步骤

````markdown
## Workflow / Steps

### Step 1: 收集证据
运行约定的取证命令集（git log 范围、相关工具输出、旧档交叉引用），建立证据池。

### Step 2: 验证引用
对每条拟引用的"文件:行号"，用 Read/Grep 复核原文存在且语义相符；
不复核通过的一律不得进入草稿（项目第一原则：禁止编造）。

### Step 3: 起草
按档卷骨架（背景 → 取证 → 归因分账 → 裁定 → 挂账 → 复跑指南）成文；
量化数据原样转录，保留工具原话的关键数值（如 "48/48 位级一致"、
"rms 0.308°→0.232°"）。

### Step 4: 交叉引用
挂账项链接到既有档编号；handoff 条目格式对齐既有行。

### Step 5: 交付与边界
只写 note/ 下目标文件；不碰 benchmark/、note/report/perf/（其他槽位属地）；
TEMP 产物按清理纪律删除。
````

### 建议的 Constraints

````markdown
## Constraints
- Always 引文必须先经 Read/Grep 复核行号与原文后才可写入
- Always 量化结论必须原样转录工具输出数值，禁止四舍五入美化
- Always 表现层/物理面归因分账（本项目裁定文体）
- Never 修改 packages/ 源码与 fixtures/ 金文件
- Never 触碰 benchmark/、note/handoff.md 之外其他槽位属地（handoff 仅追加条目）
- Never 编造未运行的测试结果或未执行的对拍数据
````

## 6. 所需工具权限

| 工具 | 用途 | 必需性 |
|------|------|--------|
| `Read` | 读旧档/复核引用 | 必需 |
| `Grep` | 引文复核 | 必需 |
| `Bash` | git 取证、读工具输出文件 | 必需 |
| `Write`/`Edit` | 写档卷 | 必需 |

**建议 allowed-tools：** `Read Write Edit Grep Bash`

## 7. 使用示例

### ✅ Do This

```text
输入：把 11 号档的网络 A/B 结果落档（git log 取 9ff9c1d..HEAD，读 scripts/e2e/out/ 下
      route A/B verdict JSON）
输出：note/research/2026-10-behavior-parity/11-netopt.md，含"60Hz 平滑 A/B 表
      （self lead 50→17，rms 5.85→0.16px）"量化行、逐条引文（ForestRoom.ts:33、
      GameScene.ts:1367）、挂账（20Hz 回退口径参数另扫）
```

### ❌ Not This

```text
错误做法：直接凭记忆写"经测试平滑后手感明显提升"——无引文、无数据、
无法复跑 → 违反档卷纪律，Skill 必须拒绝输出此类句子
```

## 8. 参考材料

- 文体范本：`note/research/2026-10-behavior-parity/10-rotation-system.md`（git log f660a41 所引）
- 量化句式范本：git log 中 docs(note) 类 commit message
- 术语来源：`note/handoff.md`（槽位/挂账/收容用语）
