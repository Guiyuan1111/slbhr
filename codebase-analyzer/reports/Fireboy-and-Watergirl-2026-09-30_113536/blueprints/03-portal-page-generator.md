# Skill Blueprint: 门户页生成校对器

> 自动生成自 codebase-analyzer
> 分析时间：2026-09-30_113536
> 源模块路径：`Fireboy-and-Watergirl/index.html`（252 行，游戏卡片 `:187-237`）

---

## 1. 基本信息

| 字段 | 值 |
|------|-----|
| **推荐 Skill 名称** | `fawg-portal-page-generator` |
| **用途** | 扫描 output/ 实际入口文件自动生成/校对 index.html 的六代游戏卡片，根除链接类 bug |
| **AI 替代等级** | 🤖 完全 AI 化（24/30，见 04 报告模块 5） |
| **实施优先级** | 🥇 Quick Win |
| **源文件数** | 1 |
| **源代码行数** | 252 |

## 2. 触发场景与关键词

- "index.html 里游戏链接检查一下"
- "加了第七代游戏，门户页帮我更新"
- "F 代的入口到底是 gameIndex.html 还是 index.htm"

**推荐 description 触发词：**

```yaml
description: >-
  Generate and verify the game portal cards in index.html from the actual
  entry files under output/. Triggered by: "门户页", "portal", "游戏链接",
  "index.html 更新".
```

## 3. 输入输出契约

### 现有结构（事实来源）

| 对象 | 值 | 代码位置 |
|------|-----|---------|
| 卡片区 | 6 张游戏卡片（A~E 指向 `gameIndex.html`，F 指向 `index.htm`） | `index.html:187-237` |
| 入口约定 | A~E：`output/<G>/gameIndex.html`；F：`output/F/index.htm`（+ `version.js`，CDN 路线） | 目录实测（01 报告） |

### 数据模型

```typescript
interface GameCard {
  code: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  title: string;        // 展示名，如 "森林神庙"
  theme: string;        // 实测主题：forest/light/ice/crystal/elements/fairytales
  entryFile: string;    // 实际存在的入口文件相对路径
  thumb?: string;       // 卡片缩略图（若存在）
}
```

### 错误码

| 错误码 | 触发条件 | 处理 |
|--------|---------|------|
| `ENTRY_MISSING` | output/<G>/ 下找不到任何已知入口文件名 | 报告该代不可链接，不生成死链 |
| `AMBIGUOUS_ENTRY` | 同时存在 gameIndex.html 与 index.htm | 以实际可加载 RequireJS 垫片者为准，标注人工确认 |
| `TITLE_UNVERIFIED` | 无权威标题来源 | 沿用现有卡片标题，不臆造 |

## 4. 依赖清单

| 类型 | 名称 | 用途 | 接口 |
|------|------|------|------|
| 文件系统 | `output/{A..F}/` | 入口与缩略图事实来源 | 目录枚举 |
| 主题映射 | `output/<G>/data/<主题>/` | 推断主题名（forest/light/ice/crystal/elements/fairytales） | 目录名 |
| 既有页面 | `index.html:1-186` | 样式与页头页脚必须原样保留 | — |

## 5. Skill 工作流设计

````markdown
## Workflow / Steps

### Step 1: 解析输入
枚举 output/ 下一级目录，确认 A~F 齐全（或报告缺失代）。

### Step 2: 验证输入
对每代探测入口文件存在性（gameIndex.html → index.htm 顺序），提取主题目录名。

### Step 3: 执行校对/生成
- 校对模式：现有卡片逐项核对 href 与实际文件（含大小写、扩展名——git 历史上
  e2536b8/0e587ea 两个 commit 就是修这两类错）
- 生成模式：复用 index.html 既有卡片 DOM 模板追加新卡片，样式类名不变

### Step 4: 处理结果
输出差异表（卡片 ↔ 实际），或新卡片 HTML 片段；不重排既有卡片顺序。

### Step 5: 错误处理
按错误码表降级；宁可不生成，不生成死链。
````

### 建议的 Constraints

````markdown
## Constraints
- Always 保留 index.html:1-186 的页头/样式/脚本原样不动
- Always 链接用相对路径（GitHub Pages 部署在项目子路径下，绝对路径 /xx 会 404
  ——multiplayer.js 的教训，见 output/A/gameIndex.html:121）
- Never 改动卡片视觉设计（颜色/布局），只动数据字段
- Never 在未验证文件存在时输出链接
````

## 6. 所需工具权限

| 工具 | 用途 | 必需性 |
|------|------|--------|
| `Read` | 读 index.html 与 output/ 结构 | 必需 |
| `Edit` | 修正/追加卡片 | 必需 |
| `Bash` | 探测入口文件存在性 | 必需 |

**建议 allowed-tools：** `Read Edit Bash`

## 7. 使用示例

### ✅ Do This

```text
用户："检查门户页链接"
输出：6 卡片全部核对：A~E → gameIndex.html ✓，F → index.htm ✓；
警告：F 代依赖 jsdelivr CDN（离线不可用），建议卡片加"需联网"角标（人工决定）
```

### ❌ Not This

```text
用户："更新门户页"
错误输出：把 F 代链接"统一规范"成 gameIndex.html（该文件在 F 代不存在 → 制造死链）；
或使用绝对路径 /Fireboy-and-Watergirl/output/F/index.htm（部署路径耦合）
```

## 8. 参考材料

- 源文件：`index.html:187-237`（卡片区）
- 结构分叉依据：[01-architecture.md](../01-architecture.md)（F 代 index.htm + version.js CDN 路线）
- 链接事故史：git `0e587ea`（扩展名）、`e2536b8`（大小写）、`fe2dc76`（指向）
