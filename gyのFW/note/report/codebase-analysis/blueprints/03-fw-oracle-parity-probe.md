# Skill Blueprint: fw-oracle-parity-probe（oracle 对拍取证器）

> 自动生成自 codebase-analyzer
> 分析时间：2026-10-18_102654
> 源模块路径：scripts/e2e/oracle/{lib,vtrun,vtdiff,windphase,goldcollect,animprobe}.mjs

---

## 1. 基本信息

| 字段 | 值 |
|------|-----|
| **推荐 Skill 名称** | `fw-oracle-parity-probe` |
| **用途** | 半自动运行原版引擎（oracle）虚拟钟对拍实验：采集 ×N 位一致自证、金 fixture 采集、专项探针（风相位/动画态），并起草"表现层 vs 物理面"归因档草稿供人拍板 |
| **AI 替代等级** | 🧑‍💻 AI 辅助（22/30） |
| **实施优先级** | 🥈 Strategic |
| **源文件数** | 6 |
| **源代码行数** | ~1,770（oracle 族） |

## 2. 触发场景与关键词

- "跟原版对拍一下" / "oracle 对拍" / "原版是什么行为"
- "这个表现差异是物理还是渲染" / "归因一下"
- "采个金 fixture" / "goldcollect" / "重录金轨迹"
- "动画态对拍" / "风相位对拍"

**推荐 description 触发词（用于 SKILL.md frontmatter）：**

```yaml
description: >-
  Run virtual-clock oracle parity experiments against the original
  Fireboy-and-Watergirl engine (BITEXACT runs, golden fixture capture,
  wind-phase and animation-state probes) and draft physics-vs-presentation
  verdict documents for human adjudication. Triggered by: "oracle 对拍",
  "原版对拍", "归因", "采金 fixture", "动画对拍", "风相位".
```

## 3. 输入输出契约

### 主要函数接口

| 命令/函数 | 输入 | 输出 | 副作用 | 代码位置 |
|-----------|------|------|--------|---------|
| `node scripts/e2e/oracle/vtrun.mjs --route <name> --runs 3 --out <dir>` | 路线 JSON | vt-<tag>-run{k}.json + verdict（BITEXACT/FIRST-DIFF@帧） | 起 python http.server 只读伺服（自动复用/kill） | vtrun.mjs:8-11 |
| `node scripts/e2e/oracle/goldcollect.mjs --capture → --build-fixture` | 关卡+路线 | 金输出 expected.json + dtschedule.json（实录整数 ms 序列） | 写 fixtures/<level>/oracle-gold/ | goldcollect.mjs（采集链） |
| `node scripts/e2e/oracle/windphase.mjs` | 风关路线 | 逐帧 time.now 读点 + ApplyForce 力矢量取证 | 无 | windphase.mjs |
| `node scripts/e2e/oracle/animprobe.mjs` | 同输入脚本双侧采样 | 角色动画态序列对照 | 无 | animprobe.mjs |
| `runScript`（库函数） | `{serverBase, levelId, levelFile, totalFrames, fbIns, wgIns, onFrame}` | `{frames, ended, marks, samples}` | 无 | oracle/lib.mjs |

### 数据模型

```typescript
// 虚拟钟核心接口（oracle/lib.mjs:32-102 VT_INIT 暴露）
interface VirtualClock {
  arm(dnBase: number): void;   // 切入虚拟模式：Date.now 假钟锚定
  step(n?: number): string[];  // 放行 n 帧：先到期定时器后 rAF；返回错误收集
  readonly frame: number;      // 当前虚拟帧号
}
// 采样对齐口径（fixture-runner.mjs:23-27）：oracle 在物理 Step 前采样
// → oracle sample[k] ≡ kernel frame[k-1]，比对时 alignShift=1
```

### 错误码

| 错误 | 触发条件 | 处置 |
|------|---------|------|
| 伺服端口全占 | 8842/8843/8844 均不可用 | lib.mjs:135 抛错；停止并报告 |
| 页面错误 | oracle 加载 4399 h5api 钩子噪音 | 自动过滤（lib.mjs:143-145）；其余报出 |
| 负 elapsed | arm 后跳变帧 | __vtClampElapsed 已内建钳制（lib.mjs:91-101），FAIL 时检查是否注入成功 |

## 4. 依赖清单

### 外部服务

| 服务 | 用途 | 接口 |
|------|------|------|
| 原版游戏本体 | oracle 真值源 | `/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/A`（lib.mjs:20 **硬编码本机路径，运行前须存在性预检**） |
| python3 http.server | 只读静态伺服 | lib.mjs:118 spawn |
| Playwright chromium | oracle 页面宿主 | headless + LAUNCH_ARGS（禁 WebGL 等，lib.mjs:22） |

### 内部模块

| 模块 | 用途 | 关键接口 |
|------|------|---------|
| scripts/e2e/inputs/routes/*.json | 对拍输入脚本 | `{level, tickHz:60, totalFrames, fb[], wg[]}` |
| routetool/fixture-runner.mjs | 金 fixture 消费端 | meta 旗标语义（§3 数据模型注） |
| packages/shared kernel | 我方侧同输入回放 | kernel.mjs makeWorld（同源 TS 直载） |

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| ORACLE_ROOT | path | 本机硬编码 | 换机需检查 |
| runs | number | 3 | BITEXACT 验收次数 |
| alignShift | number | 1 | oracle↔kernel 采样对齐（netopt 11 号档定案） |

## 5. Skill 工作流设计

### 建议的 Workflow 步骤

````markdown
## Workflow / Steps

### Step 1: 实验设计（人机分界点 1）
读取疑点描述，选择探针类型：
行为轨迹疑点 → vtrun + 内核双侧同输入；风相关 → windphase；
动画表现 → animprobe；需长期基线 → goldcollect 采金 fixture。
实验设计（路线/帧数/采样密度）起草后须人确认再跑。

### Step 2: 环境预检
ORACLE_ROOT 存在性；端口可用性；输入路线存在于 inputs/routes/。

### Step 3: 采集与自证
vtrun --runs ≥2 先做 ×N BITEXACT 自证（oracle 自身确定性不成立则结论无效）；
再跑双侧对拍，导出 JSON。

### Step 4: 数值分账
按档卷惯例分账：位级一致（Δ=0）/ 容差内（max|Δ| 量化）/ 行为性时长偏移
（outcomeWindowF 承认）/ 相位恒定偏移（如风 16.333ms 可锚定案）。

### Step 5: 归因草稿（人机分界点 2）
起草"表现层 vs 物理面 vs 数据面"归因档：位级同源 → 表现层（参照 10 号档先例）；
物理面发散 → 列首个发散帧与候选机制，交人仲裁转写。**拍板由人完成。**

### Step 6: 若需金 fixture
goldcollect 采集 → fixture-runner 以 compareEvents=false/comparePhase=false/
compareVelocities=false/outcomeWindowF/alignShift 旗标消费 → meta notes 记录
每个旗标的定值依据。
````

### 建议的 Constraints

````markdown
## Constraints
- Always oracle 真值不可覆盖：source=oracle 的金 fixture 禁 --update
- Always 先 ×N BITEXACT 自证再对拍（不自证的结论无效）
- Always 归因草稿只给证据与候选，判定/容差定值留人工拍板
- Never 修改 Fireboy-and-Watergirl/ 下任何文件（只读 oracle）
- Never 虚拟钟参数（STEP=1000/60、elapsed 钳制）魔改后直接出结论——
  口径变化须在档中显式披露
- Never 未经对拍就写"与原版一致"结论
````

## 6. 所需工具权限

| 工具 | 用途 | 必需性 |
|------|------|--------|
| `Bash` | 起 oracle/跑工具 | 必需 |
| `Read` | 读采样 JSON/原版区段引文 | 必需 |
| `Grep` | bundle 区段定位 | 可选 |
| `Write`/`Edit` | 写归因档草稿 | 必需 |

**建议 allowed-tools：** `Bash Read Write Edit Grep`

## 7. 使用示例

### ✅ Do This

```text
输入：用户反馈"旋转机关没原版顺滑"，归因一下
动作：vtrun --route forest_final-b --runs 2（BITEXACT 自证过）→ oracle vs kernel
      同输入逐帧 θ 流：max|Δθ|=0.000186° → 草稿判定"物理面位级同源，
      疑点归表现层"，建议检查 patch 率（参照 10 号档 20Hz 阶梯先例）
      → 人拍板后落档
```

### ❌ Not This

```text
错误做法：跑了一次 vtrun（--runs 1）就下"与原版一致"结论——
无自证；或把 Δ 数据四舍五入成"基本一致"——违反量化分账文体
```

## 8. 参考材料

- 虚拟钟原理：`scripts/e2e/oracle/lib.mjs:1-16`（头注全文）+ 02-vt-oracle.md 档
- 旗标语义：`scripts/e2e/routetool/fixture-runner.mjs:14-28`
- 归因先例：note/research/2026-10-behavior-parity/10-rotation-system.md（git log f660a41）
- 金 fixture 首例：forest_01/oracle-gold（git log cdb038e，tolerance 定值依据全文在 commit message）
