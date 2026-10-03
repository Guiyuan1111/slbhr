# Skill Blueprint: 下载器加固器

> 自动生成自 codebase-analyzer
> 分析时间：2026-09-30_113536
> 源模块路径：`Fireboy-and-Watergirl/2.grab_files.py`（62 行）

---

## 1. 基本信息

| 字段 | 值 |
|------|-----|
| **推荐 Skill 名称** | `fawg-downloader-hardening` |
| **用途** | 为现有裸下载器补齐超时、重试、失败清单、完整性校验与温和并发，消除 12 项容错缺陷中最关键的 5 项 |
| **AI 替代等级** | 🧑‍💻 AI 辅助（22/30，见 04 报告模块 4） |
| **实施优先级** | 🥈 Strategic |
| **源文件数** | 1 |
| **源代码行数** | 62 |

## 2. 触发场景与关键词

- "2.grab_files.py 下载到一半断了，怎么办"
- "给下载脚本加上重试和超时"
- "重跑抓取但不要全量重新下载"
- "为什么脚本说完成了但文件是坏的"

**推荐 description 触发词：**

```yaml
description: >-
  Harden the Fireboy-and-Watergirl batch downloader: add timeout, retry with
  backoff, failure manifest, size/integrity checks and gentle concurrency.
  Triggered by: "下载失败", "断点续传", "downloader retry", "重试".
```

## 3. 输入输出契约

### 现有函数接口（加固对象）

| 函数 | 输入 | 输出 | 副作用 | 代码位置 |
|------|------|------|--------|---------|
| `grab_game_resources(gc)` | 游戏代号 'A'..'F' | 控制台进度输出 | 网络 IO + 写 `output/<G>/` | `2.grab_files.py:11` |
| `grab_file(ru)`（闭包） | 清单中的相对 URL | 写文件或 print 失败 | 同上 | `2.grab_files.py:27` |

### 现有语义（必须保留的契约）

```typescript
// 输入：data/<G>/resource-list.json
interface ResourceList { resources: string[]; levels: string[] }

// 路径映射规则（2.grab_files.py:30）：URL 路径部分 1:1 镜像
//   <grab_url>/<相对路径>  →  output/<G>/<相对路径>
// 断点续传语义（:36-38）：目标文件已存在 → 跳过（幂等）
//   加固点：存在 ≠ 完整，需引入尺寸/内容校验后才可安全跳过
```

### 加固后的错误码

| 错误码 / 异常 | 触发条件 | 处理策略 |
|--------|---------|------------|
| `TIMEOUT` | 单文件超过 N 秒（默认 30s，当前 `:40` urlopen 无 timeout） | 重试 ≤3 次，指数退避 1s/2s/4s |
| `HTTP_4XX` | 404/403 等 | 不重试，记入失败清单（多为人工导航未覆盖） |
| `HTTP_5XX` | 源站故障 | 重试 ≤3 次后退避放弃，记入失败清单 |
| `TRUNCATED` | 落盘尺寸与 Content-Length 不符 | 删除半截文件并重试（当前缺陷：半截文件被当已完成） |
| `FINAL_REPORT` | 循环结束 | 输出成功/跳过/失败三计数 + `failed-<G>.txt`；**任一失败时非零退出码**（当前 `:63` 恒报"完成"） |

## 4. 依赖清单

| 类型 | 名称 | 用途 | 接口 |
|------|------|------|------|
| 内部模块 | `common.py` | URL 基址与清单路径 | `get_grab_url(gc)`（`common.py:17`）、`get_resource_list_path(gc)`（`common.py:13`） |
| 标准库 | `urllib.request` | 下载（保持零第三方依赖的既有约定） | `urlopen(req, timeout=...)` |
| 配置项 | `TIMEOUT_S` | 单文件超时 | 默认 30 |
| 配置项 | `MAX_RETRIES` | 最大重试次数 | 默认 3 |
| 配置项 | `CONCURRENCY` | 并发数 | 默认 1（保守；源站为第三方，见 README 免责声明） |

## 5. Skill 工作流设计

````markdown
## Workflow / Steps

### Step 1: 解析输入
确认游戏代号与清单存在；统计待下载数（扣除已存在文件）。

### Step 2: 验证输入
对"已存在"文件抽样核对尺寸（有 Content-Length 记录时），发现半截文件列入重下队列。

### Step 3: 生成加固补丁
按"错误码"表修改 grab_file：timeout 参数、重试循环、失败收集。
保持 62 行小脚本风格——不引入框架、不加类层级，diff 最小化。

### Step 4: 处理结果
补丁以 diff 形式呈现，人工重点审查：重试间隔、并发值、退出码语义。

### Step 5: 错误处理
人工批准后应用补丁；跑单代（如 C 作，文件最少）冒烟，核对失败清单为空。
````

### 建议的 Constraints

````markdown
## Constraints
- Always 保持零第三方依赖（现有 3 个脚本均为纯标准库）
- Always 并发默认 1，任何提升需人工显式批准（对第三方源站保持礼貌）
- Never 修改路径映射规则（output 镜像结构是 GitHub Pages 可用的根基）
- Never 吞异常——现有 :43-46 的 try/except print 模式必须改为结构化失败记录
````

## 6. 所需工具权限

| 工具 | 用途 | 必需性 |
|------|------|--------|
| `Read` | 读 `2.grab_files.py` / `common.py` | 必需 |
| `Edit` | 应用加固补丁（人工批准后） | 必需 |
| `Bash` | 冒烟运行单代下载 | 可选 |

**建议 allowed-tools：** `Read Edit Bash`

## 7. 使用示例

### ✅ Do This

```text
用户："上次下载中断了，帮我加固脚本再续传"
输出：diff（timeout=30、重试3次、失败清单、非零退出码）→ 人工批准 →
跑 C 代冒烟：50 skipped / 3 downloaded / 0 failed，failed-C.txt 为空
```

### ❌ Not This

```text
用户："加固下载器"
错误输出：重写为 aiohttp 异步框架版（引入第三方依赖+行为漂移）；
或并发开到 16 对源站压测式抓取（违反非营利保守原则）
```

## 8. 参考材料

- 源文件：`2.grab_files.py` 全文（重点 `:27-46` grab_file、`:36-38` exists-skip、`:63` 恒成功输出）
- 缺陷清单：[02-operation-principles.md](../02-operation-principles.md) 第 5 节（12 项）
- 配套审计：[01-resource-list-auditor.md](01-resource-list-auditor.md)（加固后的验收基准）
