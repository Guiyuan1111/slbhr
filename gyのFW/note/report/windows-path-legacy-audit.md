# Windows 路径硬编码残留清查（Ubuntu 迁移后）

- 槽位：flash-prep（只读清查 + 记档，未修改任何被扫描文件）
- 扫描时间：2026-10-15，仓库 HEAD = `4d13a934e267f462237d6b14c402cc44ec4f773e`（main）
- 迁移事实：2026-10-15 由 Windows（`D:\01_Guiyuan1111\GitHub\slbhr`）整体迁移至 Ubuntu `/home/gy/桌面/dev/slbhr`

## 0. 方法与复现命令

```bash
cd /home/gy/桌面/dev/slbhr
grep -rInE '[Dd]:[\\/]|[Cc]:[\\/]|\\\\\?\\\\|/d/01_Guiyuan1111|01_Guiyuan1111' \
  --exclude-dir=node_modules --exclude-dir=TEMP --exclude-dir=.git --exclude-dir=dist \
  --exclude-dir=Fireboy-and-Watergirl . 
```

- 共 5 类模式：`D:\`/`D:/`（含大小写）、`C:\`/`C:/`、`\\?\` 前缀、Git Bash 风格 `/d/01_Guiyuan1111`、关键词 `01_Guiyuan1111` 兜底。
- 排除范围核验：仓库内唯一 dist 目录为 `gyのFW/packages/client/dist`（find 核实），排除无误伤；`node_modules`、`TEMP`、`.git`、oracle（`Fireboy-and-Watergirl/`）按任务口径排除。
- 二进制/编码漏扫核验：对扫描范围内全部 .mjs/.py/.js/.ts/.md/.sh/.bat/.json 跑 `file`，无非文本文件，`grep -I` 无漏扫。
- 明细底稿：`gyのFW/TEMP/flash-prep/all-hits.txt`（97 行，收尾清理）。

## 1. 总数对账

| 档 | 范围 | 命中行 | 文件数 |
|---|---|---|---|
| **A 档（一级，活跃代码）** | `gyのFW/scripts/**`、`gyのFW/benchmark/**`、`gyのFW/packages/**`（除 dist）、两根 `*.mjs/*.sh/*.bat` | **1** | **1** |
| **B 档（二级，档卷）** | `note/**`（两侧）、`codebase-analyzer/reports/**`、`报告/**` | **95** | **88** |
| X（非项目，槽位派发配置） | `.zcode/agents/flash-prep.md` | 1 | 1 |
| **合计** | | **97** | **90** |

B 档细分：`gyのFW/note/evidence/**` 77 行/76 文件、仓库根 `note/evidence/**` 2 行/2 文件、`gyのFW/note/` 非 evidence 8 行/4 文件、`codebase-analyzer/reports/**` 5 行/5 文件、`报告/**` 3 行/1 文件。

### 与 handoff"70 处"的对账

- 出处：`gyのFW/note/handoff.md:1` 第⑦点——"遗留低风险项：note/evidence 70 处历史取证脚本硬编码 D:/ 路径"。
- 实测：`note/evidence/**`（两侧合计）= **79 行 / 78 文件**。
- 历史时点回溯（`git grep` 于 commit 树上）：`f804bc3`（迁移准备）、`86cbcef^`（断点收容前）、`86cbcef`（收容后）三时点 evidence 命中均为 **79**，无增减。
- 结论：handoff"70 处"系撰写时约数，**实测多 9 处（79 vs 70）**，非收容遗漏（三时点一致）。本报告以 79 为准。全仓口径 97（含 note 非 evidence 8、分析报告 8、A 档 1、槽位配置 1）。

## 2. A 档（活跃代码）逐条

命中判定范围：`gyのFW/scripts/`、`gyのFW/benchmark/`、`gyのFW/packages/*/src`、仓库根与 `gyのFW` 根的 `*.mjs/*.sh/*.bat`。

### 2.1 唯一残留（标红）

| 文件:行 | 内容 | 影响 | 是否被 009c600 修复 |
|---|---|---|---|
| `gyのFW/scripts/baseline/serve-original.mjs:5` | `* 伺服 D:\01_Guiyuan1111\GitHub\slbhr\Fireboy-and-Watergirl\output\A\（只读参考库，绝不写入）。` | **无运行时影响（仅头注释）**。实际取根为 `const ROOT = path.resolve(__dirname, "../../../Fireboy-and-Watergirl/output/A")`（相对推导，L24-25），目标目录 `Fireboy-and-Watergirl/output/A` 在 Ubuntu 上已验证存在，脚本可直接跑。风险仅为注释陈旧误导后续维护者 | 否（因其为注释、不影响执行，009c600 未覆盖；如需洁癖可随下次顺手改注释） |

### 2.2 009c600 三处修复核实（均确认无残留）

`git show 009c600`（`009c6004ef454aa94d62b9417fe7d2f97e8a59ea`，2026-10-15 10:07 +0800）修了 3 个文件，对三文件现状重跑同款 grep 均为 **0 命中**：

| 文件 | 修复方式（diff 摘录） | 现状 |
|---|---|---|
| `gyのFW/scripts/baseline/render-level.mjs` | `const refRoot = "D:/01_Guiyuan1111/GitHub/slbhr/Fireboy-and-Watergirl/output/A"` → `resolve(dirname(fileURLToPath(import.meta.url)), "../../../Fireboy-and-Watergirl/output/A")` | 0 残留，已核实 |
| `gyのFW/scripts/baseline/capture.mjs` | launchBrowser 补 `FW_BROWSER_CHANNEL` + bundled chromium 兜底 | 0 残留，已核实 |
| `gyのFW/benchmark/fidelity-anim.mjs` | 同上 | 0 残留，已核实 |

### 2.3 A 档 0 命中区域（已扫，清单留痕）

- `gyのFW/benchmark/**`、`gyのFW/packages/**`（除 `packages/client/dist`）：0 命中（显式 grep 复核 = 0）。
- 仓库根 `publish-0.3.0.sh`、`publish-watcher.sh`；`gyのFW` 根 `start.sh`、`start-lan.sh`、`start.bat`、`start-lan.bat`：逐一 grep = 0 命中（`ROOT-SCRIPTS-CLEAN`）。
- `gyのFW/scripts/` 其余（e2e、sync-assets.mjs、vendor-box2d.mjs 等）：仅上述 serve-original.mjs 注释 1 处，无其他。工作树在制的 `scripts/e2e/route.mjs`（他槽 M 状态）无命中。

**一级问题数：0 个运行时会挂的残留；1 处注释级残留（不改变行为）。**

## 3. B 档（档卷）聚合

### 3.1 取证脚本（复现时需改路径）

| 目录 | 行 | 文件 | 典型形式 |
|---|---|---|---|
| `gyのFW/note/evidence/forest_23/tools/` | 54 | 54 | `const ROOT = "D:/01_Guiyuan1111/GitHub/slbhr/gyのFW";`（fb-v11.mjs:5 等） |
| `gyのFW/note/evidence/extract-c-slices/` | 4 | 3 | dump.mjs:2 `const file = "D:/01_Guiyuan1111/.../js/init.eb02fbdab2aa1d24.js"`；dump.mjs:32 `const OUT="D:/01_Guiyuan1111/.../TEMP/extract-c/"`（同文件 2 行） |
| `gyのFW/note/evidence/forest_22/tools/` | 3 | 3 | probe22.ts:7 `const dir = "D:/01_Guiyuan1111/.../data/forest/levels"` |
| `gyのFW/note/evidence/forest_20/tools/` | 3 | 3 | 同 ROOT 常量形式 |
| `gyのFW/note/evidence/forest_05/tools/` | 2 | 2 | scan-f04.mjs:4 `process.argv[2] \|\| "D:/01_Guiyuan1111/.../routes/forest_04.json"`（**默认参数形式，传参可绕过硬编码，不改文件也能跑**） |
| `gyのFW/note/evidence/forest321/tools/` | 2 | 2 | 同 ROOT 常量形式 |
| `gyのFW/note/evidence/forest121/probes/` | 2 | 2 | 同 ROOT 常量形式 |
| `gyのFW/note/evidence/forest_{19,24,25,27,29,30}/tools/dump*.py` | 6 | 6 | `ROOT = r"D:\01_Guiyuan1111\GitHub\slbhr\gyのFW"`（**Windows 反斜杠 + raw string，Linux 复现需整体改写分隔符**，如 dump19.py:5） |
| `gyのFW/note/evidence/r08e/` | 1 | 1 | v8.mjs:16 同 ROOT 常量形式 |
| 仓库根 `note/evidence/forest_05/tools/` | 2 | 2 | scan-f04.mjs:4、ptrace-f04.mjs:4（同上默认参数形式，传参可绕过） |
| **小计** | **79** | **78** | |

### 3.2 档卷文档（记档引用，非脚本）

| 位置 | 行 | 例子 |
|---|---|---|
| `gyのFW/note/PLAN.md` | 4 | L1 `D:\Guiyuan1111\GitHub\slbhr\gyのFW`、L40/L260/L261 `D:\Guiyuan1111\GitHub\Fireboy-and-Watergirl`（**2026-09-30 时代布局，无 `01_` 前缀**，与现行 82 处 `D:/01_Guiyuan1111/...` 是两代路径） |
| `gyのFW/note/handoff/2026-10-04-fidelity-rewrite.md` | 2 | L30/L79 `C:\Users\gy\.zcode\AGENTS.md`、browser-use 插件根 `C:\Users\gy\.zcode\cli\plugins\...`（仅 C 盘 2 处，均在此文件） |
| `gyのFW/note/handoff.md` | 1 | L1 第⑦点"70 处"表述本身 |
| `gyのFW/note/research/2026-10-fidelity/01-original-engine-spec.md` | 1 | L8 分析对象 `D:\01_Guiyuan1111\...\output\A\` |
| `codebase-analyzer/reports/Fireboy-and-Watergirl-2026-09-30_113536/`（5 文件） | 5 | 各文件 L4 `**分析范围**：D:\Guiyuan1111\GitHub\slbhr\Fireboy-and-Watergirl` |
| `报告/森林冰火人1-Steam版-技术分析报告.md` | 3 | L4/L284 `D:\SteamLibrary\steamapps\common\...`、L82 上游构建机路径泄露 `D:\dev\java...`（Steam 安装目录，非本项目布局） |
| **小计** | **16** | |

### 3.3 X（非项目文件，单独注明）

- `.zcode/agents/flash-prep.md:9`：本槽派发描述文件（tracked），内嵌任务背景中的 `D:\01_Guiyuan1111\...` 旧根。属槽位说明而非项目代码/档卷，**不在本任务修改范围**，仅记档。

## 4. 模式细分（行口径，一行可含多模式，总和≥97 仅供参考）

| 模式 | 行数 |
|---|---|
| `D:/` 正斜杠形式 | 74 |
| `D:\` 反斜杠形式 | 21 |
| `C:\` 反斜杠形式 | 2 |
| `\\?\` 前缀 | 0 |
| `/d/01_Guiyuan1111` Git Bash 风格 | 0 |
| `01_Guiyuan1111` 关键词 | 82 |

目标根参考分布（正则抽取，含截断误差）：`D:/01_Guiyuan1111/GitHub/slbhr` 82、`D:/Guiyuan1111/GitHub/slbhr` 6、`D:/Guiyuan1111/GitHub/Fireboy-and-Watergirl` 3、`D:/SteamLibrary` 2、`D:/dev` 1、`C:/Users/gy/.zcode` 2。即**绝大多数为迁移前布局（`01_Guiyuan1111` 代），少量为更早一代（无 `01_`）与 Steam/上游路径的记档引用**。

## 5. 结论与存疑项

1. **活跃工具链干净**：Ubuntu 迁移收尾（f804bc3 环境变量化 24 处浏览器通道 + 009c600 三处）已覆盖全部运行时路径；现存的唯一 scripts 残留是注释行，不影响任何执行路径。
2. **复现取证改路径指引**：B 档 79 处取证脚本中，`.mjs/.ts` 类（71 文件）多为 `ROOT` 常量正斜杠形式，改前缀即可；`dump*.py` 6 文件为 Windows 反斜杠 raw string，需连同分隔符整体改写；仓库根与 gyのFW 侧 `forest_05/tools` 4 文件为 argv 默认值，传参即可绕过、可不改文件。
3. 存疑待核（如实记录，不下终判）：
   - handoff"70 处"与实测 79 的差 9，三历史时点 git grep 均为 79，判定为撰写时约数；如需精确出处需问 handoff 撰写槽当时的统计口径（本次无法回溯其统计命令）。
   - `报告/…技术分析报告.md:82` 的 `D:\dev\java...`（截断展示）为上游 Steam 版构建机路径，属转录内容而非本仓库布局，未逐字复核原报告全文。
4. 本任务未修改任何被扫描文件；`TEMP/flash-prep/` 明细底稿随收尾清理（结论已全部收录本档）。
