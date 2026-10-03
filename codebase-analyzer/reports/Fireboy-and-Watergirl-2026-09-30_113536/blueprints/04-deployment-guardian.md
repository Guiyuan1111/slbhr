# Skill Blueprint: 部署巡检守护器

> 自动生成自 codebase-analyzer
> 分析时间：2026-09-30_113536
> 源模块路径：`Fireboy-and-Watergirl/`（部署面：GitHub Pages、README.md:32、`output/A/gameIndex.html:121`、README.md:49）

---

## 1. 基本信息

| 字段 | 值 |
|------|-----|
| **推荐 Skill 名称** | `fawg-deployment-guardian` |
| **用途** | 巡检 GitHub Pages 构建状态、线上链接 404、README 引用一致性与线上/HEAD 版本漂移，输出巡检报告（含文档一致性核对） |
| **AI 替代等级** | 🤖 完全 AI 化（27/30，见 04 报告模块 6 + 模块 8） |
| **实施优先级** | 🥇 Quick Win |
| **源文件数** | 3（README.md、output/A/gameIndex.html、部署目标站点） |
| **源代码行数** | ~340（涉及面） |

## 2. 触发场景与关键词

- "网站是不是挂了 / Pages 构建状态看一下"
- "线上为什么没有 multiplayer 效果"
- "检查一下 README 里的链接和目录引用还对不对"
- "push 之后部署成功了吗"

**推荐 description 触发词：**

```yaml
description: >-
  Inspect GitHub Pages build status, scan live site for 404s, verify README
  references and detect deployed/HEAD version drift. Triggered by: "部署巡检",
  "Pages 挂了", "deployment check", "404".
```

## 3. 输入输出契约

### 巡检项与判定基准（本次分析实测出的事故即验收用例）

| 巡检项 | 判定方法 | 已知事故基线 |
|--------|---------|------------|
| Pages 构建状态 | `gh api repos/{owner}/{repo}/pages/builds/latest` | errored 自 2026-07-05，无人察觉 |
| 线上/HEAD 漂移 | 线上可访问资源指纹 ↔ git HEAD 对应文件 | 线上停留 `3ead9e0`，落后 2 commit |
| 线上 404 扫描 | 对门户页引用的全部资源 curl 抽样（HEAD 请求） | `/multiplayer.js` 在项目站子路径下 404 |
| README 引用核对 | README 提及的目录/文件 ↔ 仓库实际 | README.md:49 `tiled-atlasses/` 不存在 |
| 入口可达性 | 6 代入口页 curl 状态码 | F 代依赖 jsdelivr CDN（离线场景需标注） |

### 数据模型

```typescript
interface GuardianReport {
  buildStatus: 'success' | 'building' | 'errored' | 'unknown';
  buildAgeDays: number;          // 最新构建距今
  driftCommits: string[];        // 线上落后的 commit
  brokenLinks: { url: string; referrer: string; httpStatus: number }[];
  readmeStaleRefs: string[];     // README 引用但仓库不存在的路径
  entries: { game: 'A'..'F'; url: string; ok: boolean }[];
}
```

### 错误码

| 错误码 | 触发条件 | 处理 |
|--------|---------|------|
| `GH_UNAUTHORIZED` | gh 未登录/无权限 | 降级为纯 curl 巡检，跳过构建状态项 |
| `SITE_UNREACHABLE` | Pages 站点整体不可达 | 立即升级为最高优先级报告 |
| `RATE_LIMIT` | curl 目标过多 | 只抽样入口页 + 首屏资源，全量清单交给 BP01 |

## 4. 依赖清单

| 类型 | 名称 | 用途 | 接口 |
|------|------|------|------|
| 外部工具 | GitHub CLI (`gh`) | Pages 构建状态查询 | `gh api repos/1224HuangJin/Fireboy-and-Watergirl/pages/builds/latest` |
| 外部服务 | GitHub Pages 站点 | 线上探测 | README.md:32 地址 |
| 内部模块 | `index.html:187-237` | 入口清单事实来源 | 卡片 href |
| 内部模块 | README.md | 文档一致性核对对象 | 全文引用提取 |
| 网络代理 | 本地代理（若配置） | gh 访问 GitHub | 用户全局规则要求优先走本地代理 |

## 5. Skill 工作流设计

````markdown
## Workflow / Steps

### Step 1: 解析输入
确定仓库（origin remote）与 Pages 地址（README.md:32）。

### Step 2: 验证输入
gh 可用性探测；不可用则记录降级模式。

### Step 3: 执行巡检
按"巡检项"表逐项执行：构建状态 → 漂移比对 → 404 扫描 → README 核对 → 入口可达。

### Step 4: 处理结果
输出 GuardianReport：每项 ✓/✗ + 证据（HTTP 状态码、构建时间戳、commit hash）。
分级：SITE_UNREACHABLE/build errored = P0；404 = P1；文档过期 = P2。

### Step 5: 错误处理
只报告不修复。修复建议可附带 diff 提案，但应用必须人工批准
（历史教训：8ce1047 的"修复"被 8568034 回退过一次）。
````

### 建议的 Constraints

````markdown
## Constraints
- Always 只读巡检 + 报告；Never 自动 push/自动改文件
- Always 附证据（状态码/时间戳/hash），禁止"看起来没问题"式结论
- Always 走用户配置的本地代理访问 GitHub（若存在）
- Never 把修复直接落地——输出修复提案 diff 供人工批准
````

## 6. 所需工具权限

| 工具 | 用途 | 必需性 |
|------|------|--------|
| `Bash` | gh api / curl 探测 | 必需 |
| `Read` | 读 README.md、index.html | 必需 |
| `Grep` | 提取 README 引用路径 | 可选 |

**建议 allowed-tools：** `Bash Read Grep`

## 7. 使用示例

### ✅ Do This

```text
用户："巡检一下部署"
输出：P0 ×1：Pages 最新构建 errored（2026-07-05，距今 87 天）；
P1 ×1：output/A/gameIndex.html 引用 /multiplayer.js → HTTP 404（子路径部署下根绝对路径失效）；
P2 ×1：README.md:49 引用 tiled-atlasses/ 不存在。
修复提案：将 script src 改为相对路径并同步文件位置（diff 附后，待批准）。
```

### ❌ Not This

```text
用户："巡检部署"
错误输出：发现 404 后直接 commit + push "fix multiplayer path"（未经批准的部署变更）；
或仅报告"网站正常"而无状态码证据（构建其实 errored）。
```

## 8. 参考材料

- 事故基线：[03-workflow.md](../03-workflow.md) 部署游玩工作流一节（Pages errored 实测）
- 路径缺陷：`output/A/gameIndex.html:121`、回退历史 git `8568034`
- 文档失真：README.md:49 ↔ `output/<代>/assets/atlasses/` 实际位置
