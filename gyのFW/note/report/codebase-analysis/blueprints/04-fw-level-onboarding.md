# Skill Blueprint: fw-level-onboarding（新关卡接入向导）

> 自动生成自 codebase-analyzer
> 分析时间：2026-10-18_102654
> 源模块路径：packages/shared/src/level2.ts（解析器）；packages/server/src/levels.ts（LEVEL_DIRS）；scripts/e2e/routetool/（验证）；data/（关卡库）

---

## 1. 基本信息

| 字段 | 值 |
|------|-----|
| **推荐 Skill 名称** | `fw-level-onboarding` |
| **用途** | 新官方/自定义关卡接入的验证矩阵执行器：Tiled JSON 就位检查 → 解析器全机制覆盖确认 → 48 关行为冒烟 → det/fixture 门禁 → 路线产线推进 → 档卷登记 |
| **AI 替代等级** | 🧑‍💻 AI 辅助（19/30） |
| **实施优先级** | 🥉 Incremental（Quick Win 子集：零代码接入验证） |
| **源文件数** | 3（level2.ts/levels.ts/route-all.mjs 为主链） |
| **源代码行数** | ~1,000 |

## 2. 触发场景与关键词

- "接入新关卡" / "新关 <id> 放进去了，验一下"
- "这个关为什么解析不出来" / "关卡数据有问题"
- "铺开下一批关卡门禁" / "batch N 跑一下"
- "forest_xx 出生即死"

**推荐 description 触发词（用于 SKILL.md frontmatter）：**

```yaml
description: >-
  Onboard new levels into the gy-fw repo: verify Tiled JSON placement,
  run the full-mechanism parser coverage check, 48-level behavior smoke,
  determinism/fixture gates, and route production batches. Triggered by:
  "接入新关卡", "新关验证", "关卡解析失败", "铺开批次", "出生即死".
```

## 3. 输入输出契约

### 主要函数接口

| 函数/命令 | 输入 | 输出 | 副作用 | 代码位置 |
|-----------|------|------|--------|---------|
| `levelExists(id)` | 关卡 id（正则 `^[A-Za-z0-9_-]+$`） | boolean | 无 | levels.ts:27-38 |
| `loadLevel(id)` | 关卡 id | `LevelBundle {id, json, level}` | tilesetCache 内存缓存 | levels.ts:55-78 |
| `parseLevel(id, json, getTileset)` | Tiled JSON + 图块集 getter | `LevelData` | 无 | level2.ts（全机制） |
| `npm run test -- 48-level-behavior` | data/ 全部关卡 | 出生站稳/浸泡清单（收集制） | tmpdir JSON | 48-level-behavior.test.ts |
| `route-all.mjs --batch<N>` | 批次表 | 逐关 PASS/FAIL | e2e out/ | route-all.mjs:29-35 |

### 数据模型

```typescript
// LEVEL_DIRS 权威序（levels.ts:16）：查找顺序 = forest 先于 tutorials
const LEVEL_DIRS = ["data/forest/levels", "data/tutorials/levels"];
// 解析陷阱（level2.ts:12-23 注释，接入新关最常见问题源）：
// 1) 图块对象(gid)的 y 是底边，矩形/折线对象 y 是顶边
// 2) gid→图块集归属：取 firstgid≤gid 中最大者，firstgid 逐关可变，禁止写死
// 3) 机关默认属性在图块集 tileproperties，关卡对象 properties 覆盖同名默认
```

### 错误码

| 错误 | 触发条件 | 处置 |
|------|---------|------|
| ServerError 4404 | id 非法或双目录均无 | 检查文件名与目录 |
| tileset 取不到 | source 相对路径解析失败/未预取 | 核对图块集就位（客户端侧还需 main.ts:81-88 预取逻辑） |
| 出生即死 | 48 关冒烟清单标记 | 报告关卡数据问题清单（不置红，STRICT=false 收集制） |
| 机关未知 gid | tileTypeOf 失败退化为 0 | 属新机制类型 → 升级人工（转写流程） |

## 4. 依赖清单

### 外部服务

| 服务 | 用途 | 接口 |
|------|------|------|
| data/forest/temple.json | 关卡序/限时/类型/选关树 | `GET /data/forest/temple.json`；id 映射按 filename 后缀匹配 |

### 内部模块

| 模块 | 用途 | 关键接口 |
|------|------|---------|
| level2.ts | 全机制解析 | GROUND_TYPE/parseLevel |
| levels.ts | 服务端加载 | LEVEL_DIRS/loadLevel |
| route-all.mjs | 批次门禁 | BATCHES 表（batch1-5+tutorial） |
| 48-level-behavior.test.ts | 行为冒烟 | 出生站稳 ≤2s + 浸泡 10s |

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| LEVEL_DIRS | string[] | forest→tutorials | 服务端权威查找序 |
| route repeat | number | 3 | 门禁要求 |
| mc trials | number | 150 | 抖动预检 |

## 5. Skill 工作流设计

### 建议的 Workflow 步骤

````markdown
## Workflow / Steps

### Step 1: 就位检查
新 JSON 在 LEVEL_DIRS 之一；外部 tileset source 相对路径可达；
id 合法（正则）；不与既有 48 关 id 冲突。

### Step 2: 解析冒烟
node --import tsx 直接调 parseLevel 打印解析结果
（各机制计数、groundType 分布、spawn/doors/liquidRuns）；空机制段落属正常
（森林 48 关机关面差异大），但 spawn/doors 缺失即阻断。

### Step 3: 行为冒烟
vitest 48-level 行为用例：出生站稳与 10s 浸泡；
"出生即死"清单输出 → 属关卡数据问题，报告而非修代码。

### Step 4: 确定性/金轨迹
det 基线（若该槽可用结果则引用，不重复跑）；既有 fixtures 是否被波及
（改动仅新增文件时全绿）。

### Step 5: 路线产线（人工分界点）
零代码接入即完成；要进门禁需路线：botcore 初排或 autosearch 搜索 →
optimize → validate → mc ≥98% → route repeat≥3（顺序执行）。
检查点链设计由人提供，Skill 负责跑批与解读。

### Step 6: 登记
note/release 或 handoff 条目记录新关接入结论；
 TempleScene 选关树与 temple.json 序一致。
````

### 建议的 Constraints

````markdown
## Constraints
- Always 新关验证只加数据文件，发现解析器缺口时报告并升级人工（禁自行改 level2.ts）
- Always 出生即死/浸泡异常先归因为关卡数据（48 关冒烟的既定口径）
- Never 修改官方 data/ 既有 48 关 JSON
- Never 跳过 mc 预检直接上真服 route 门禁
````

## 6. 所需工具权限

| 工具 | 用途 | 必需性 |
|------|------|--------|
| `Bash` | 跑解析/测试/产线 | 必需 |
| `Read` | 读关卡 JSON/temple.json | 必需 |
| `Write` | 写登记条目 | 可选 |

**建议 allowed-tools：** `Bash Read Write`

## 7. 使用示例

### ✅ Do This

```text
输入：data/forest/levels/forest_33.json 新放入，验一下
动作：levelExists 过 → parseLevel 计数（levers=2 platforms=3 winds=1 spawn/doors 齐）
→ 48 关冒烟：forest_33 出现在"出生站稳"异常清单 → 报告"出生点距毒液半格，
      属关卡数据形态，需对照原版该关出生表现后定夺" → 不改代码
```

### ❌ Not This

```text
错误做法：冒烟发现 lever 解析为 0，直接改 level2.ts 加分支——解析器改动属
保真工序（须走证据转写流程），Skill 只应报告"gid 29 未归属任何已知图块集"
```

## 8. 参考材料

- 解析规则全文：`packages/shared/src/level2.ts:1-60`
- 冒烟口径：`packages/shared/src/__tests__/48-level-behavior.test.ts:1-30`
- 批次表：`scripts/e2e/route-all.mjs:29-35`
- 路线产线：`scripts/e2e/routetool/kernel.mjs:1-13`（五步流水头注）
