# Skill Blueprint: 资源清单完整性审计器

> 自动生成自 codebase-analyzer
> 分析时间：2026-09-30_113536
> 源模块路径：`Fireboy-and-Watergirl/data/{A..F}/resource-list.json` 及审计工作流（README.md:78 的人工目检步骤）

---

## 1. 基本信息

| 字段 | 值 |
|------|-----|
| **推荐 Skill 名称** | `fawg-resource-list-auditor` |
| **用途** | 交叉比对 HAR 条目、resource-list 清单与 output/ 落盘文件，自动发现资源缺口，替代 README.md:78 的人工目检 |
| **AI 替代等级** | 🤖 完全 AI 化（26/30，见 04 报告模块 3） |
| **实施优先级** | 🥇 Quick Win |
| **源文件数** | 2 类（6 份 resource-list.json + 6 个 HAR 索引） |
| **源代码行数** | ~0（新增能力；被替代的人工步骤位于 README.md:78） |

## 2. 触发场景与关键词

- "跑完 1.unpack_har.py 之后帮我检查清单有没有缺东西"
- "为什么游戏 A 加载时缺 manifest / 图标？"
- "对比一下 har 包里到底有多少资源，清单里有多少"
- "重新抓取前先审计一下 data 目录"

**推荐 description 触发词：**

```yaml
description: >-
  Audit Fireboy-and-Watergirl resource lists against HAR captures and output/
  files; report missing or orphan assets. Triggered by: "清单审计", "资源缺口",
  "resource list audit", "缺了哪些文件".
```

## 3. 输入输出契约

### 主要函数接口（本 Skill 为 AI 执行流程，以下为等效逻辑接口）

| 函数 | 输入 | 输出 | 副作用 | 代码位置 |
|------|------|------|--------|---------|
| `audit(game: 'A'..'F')` | 游戏代号 | 差异报告 | 无（只读） | — |
| `har_urls(har_path)` | HAR 文件路径 | 过滤后 URL 集合 | 无 | 逻辑同 `1.unpack_har.py:29-48` |
| `list_entries(list_path)` | resource-list.json 路径 | `{resources: str[], levels: str[]}` | 无 | 结构见下 |
| `disk_files(output_dir)` | `output/<G>/` 路径 | 相对路径集合 | 无 | — |

### 数据模型

```typescript
// data/<G>/resource-list.json 的结构（由 1.unpack_har.py:53-58 生成）
interface ResourceList {
  resources: string[]; // 抓取的 URL 相对路径（不含 ?query）
  levels: string[];    // "data/<主题>/levels/<名称>.json" 形式的关卡路径
}

// Skill 输出
interface AuditReport {
  game: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  harCount: number;        // HAR 中匹配前缀的条目数
  listCount: number;       // 清单条目数
  diskCount: number;       // output/ 实际文件数
  missingOnDisk: string[]; // 清单有、磁盘无 → 需重跑 2.grab_files.py
  notInList: string[];     // 磁盘有、清单无 → 可疑残留
  harNotInList: string[];  // HAR 有、清单无 → 解析器过滤规则漏收
  levelIndexMismatch: string[]; // temple.json 声明但 levels 缺失的关卡
}
```

### 错误码

| 错误码 / 异常 | 触发条件 | 处理 |
|--------|---------|------------|
| `HAR_TOO_LARGE` | HAR 文件超过 30MB | 用流式/jq 抽取 URL 字段，禁止整读进上下文 |
| `LIST_MALFORMED` | resource-list.json 缺字段 | 报告并建议重跑 `1.unpack_har.py`（注意 `:59` 裸 except 会掩盖 temple.json 错误） |
| `OUTPUT_DIR_MISSING` | `output/<G>/` 不存在 | 标记该代"未下载"，跳过磁盘比对 |

## 4. 依赖清单

| 类型 | 名称 | 用途 | 接口 |
|------|------|------|------|
| 内部模块 | `common.py` | 清单路径与 URL 前缀 | `get_resource_list_path(gc)`（`common.py:13`）、URL 模板（`common.py:4`） |
| 内部模块 | `1.unpack_har.py` 的过滤规则 | 保证审计口径与生成口径一致 | 前缀匹配 `:40`、去重 `:42-46`、`/levels/` 分流 `:47-48` |
| 配置项 | `games = ['A'..'F']` | 审计循环范围 | 双处定义：`1.unpack_har.py:8`、`2.grab_files.py:9` |
| 外部数据 | `output/<G>/data/<主题>/temple.json` | 关卡数核对基准 | 由 HAR 响应体 base64 重建（`1.unpack_har.py:53-58`） |

## 5. Skill 工作流设计

````markdown
## Workflow / Steps

### Step 1: 解析输入
接受游戏代号（A~F 或 "all"），从 `common.py:4` 读取 URL 前缀模板。

### Step 2: 验证输入
确认 `data/<G>/resource-list.json` 与 `har/<G>.har`（实际文件名以 har/ 目录为准）存在。

### Step 3: 执行审计
1. 从 HAR 抽取 URL（大文件用 `python -c` 流式提取，禁止整读）
2. 复现 unpack 的三重过滤（前缀/去重/levels 分流），得到期望集合
3. `ls -R output/<G>/`（或 `git ls-files`）得到实际集合
4. 解析 temple.json 的关卡 filename 列表核对 levels 数组

### Step 4: 处理结果
输出 AuditReport 表格：三类差异 + 数量对账（HAR ↔ 清单 ↔ 磁盘）。
已知基线：当前 6 代全部缺 manifest.json 与图标（02 报告缺陷①），首次审计应复现此结论。

### Step 5: 错误处理
缺目录/坏 JSON 按"错误码"表降级处理；任何一步失败都保留已完成部分的报告。
````

### 建议的 Constraints

````markdown
## Constraints
- Always 只读：不修改 data/、output/、har/ 下任何文件
- Always 用流式工具处理 HAR（>30MB），Never 将 HAR 内容整读进上下文
- Always 复现 1.unpack_har.py 的过滤口径再做比对（否则产生假差异）
- Never 自动触发重新下载——只报告，下载决策留给人工或 BP02
````

## 6. 所需工具权限

| 工具 | 用途 | 必需性 |
|------|------|--------|
| `Read` | 读 resource-list.json / temple.json | 必需 |
| `Bash` | 流式抽取 HAR URL、枚举 output/ 文件 | 必需 |
| `Write` | 写审计报告（note/ 或 stdout） | 可选 |

**建议 allowed-tools：** `Read Bash Grep`

## 7. 使用示例

### ✅ Do This

```text
用户："审计一下 A 代资源清单"
输出：A 代对账表：HAR 期望 114 项 / 清单 114 项 / 磁盘 112 项；
missingOnDisk=[manifest.json, icon-192.png] → 建议重跑 2.grab_files.py（断点续传会跳过已存在文件，仅补 2 个）
```

### ❌ Not This

```text
用户："审计 A 代"
错误输出：直接把 160MB 的 har/A.har 读进上下文导致会话崩溃；
或发现缺口后自动执行下载（越权——下载属于 BP02 的人工决策范围）
```

## 8. 参考材料

- 源文件：`1.unpack_har.py`（过滤逻辑 `:29-58`）、`2.grab_files.py:36-38`（exists-skip 语义）
- 结构参考：`data/A/resource-list.json`（resources 66 项 + levels 48 项）
- 已知缺陷基线：[02-operation-principles.md](../02-operation-principles.md) 第 5 节
