# r6 轮 c 槽：工具链加速（det 并行化）报告

日期：2026-10-18 ｜ 槽：r6c（工具链加速）｜ 前置：前任宿主机重启殉档，det 并行化 diff 已写完但未验证未提交——本槽完成审查、修复、双验证、报告与提交
基线（快基线实测在案）：typecheck 2.31s / vitest 3.19s / build 5.55s / det 串行 4.05s / fixture-runner 1.43s / sync-assets 0.46s
环境：Node v22.22.1，availableParallelism()=8（4C/8T 呈现），tsx 4.23.15（devDependencies 声明 ^4.19.4），TypeScript 5.8.3

## 1. det 并行化（主件）

### 1.1 前任 diff 审查结论（逐项）

| 审查点 | 结论 | 证据 |
|---|---|---|
| runLevel 纯函数性 | ✅ 每关两个独立 World，哈希只依赖 关卡数据×输入脚本×步数，线程/进程间零共享态 | 脚本 `runLevel()` 实现 |
| 线程独立模块注册表声明 | ✅ 实质成立（措辞修正）：ESM 模块注册表按 worker 线程隔离 → `packages/shared/src/kernel/b2.ts:16` 与 `packages/shared/src/box2d/load.ts:36` 的模块级 `cached` box2d 单例每线程一份独立实例；load.ts 是 `new Function` 求值内嵌 JS bundle（非 WebAssembly、无 SharedArrayBuffer），无跨线程共享内存。头注原文"bundleCache/wasm"非代码内实名，已改精确口径 | 源码行号如上 |
| worker 内 tsx 加载可行性 | ❌ 原样不可行 → ✅ 修复后可行，见 1.2 修复B | 探针实证 |
| DET_WORKERS=0/1 回退 | ✅ 字面走旧路径：`WORKERS<=1` 分支即旧内联循环，pushRow 剥离 ms 后 rows 键序（id,steps,idle,scripted）与旧版逐字节一致 | 三方 rows 全等对照（1.4） |
| 错误传播 | ✅ fail-loud：worker error / exit≠0 → Promise.all reject → 顶层 await 非零退出；派发游标有界不越界；worker 队列空后 null 收工 clean close，无悬挂 | 代码审查 |
| --exit 码语义 | ✅ `process.exitCode = diff===0 ? 0 : 1` 原样保留在主线程 compare 路径 | 代码审查 |

### 1.2 审查修复（三处）

- **修复A（红线级，必须）**：`Math.max(0, Number(env))` 遇非数字 → NaN → `Array.from({length:NaN})` = 零 worker 零行 → `--compare` 报"全部 0 关位级一致"且 exit 0，**静默放行空门禁**（门禁本体不可容忍）。修：非法值（非有限/负）显式抛错。实测 `DET_WORKERS=abc` / `-3` 均 exit=1 并给出明确报错。
- **修复B（可行性，必须）**：worker 线程内 tsx **不会自动注册**模块解析钩子。tsx `dist/esm/index.mjs` 自动注册条件为
  `isFeatureSupported([[22,22,3],[24,11,1],[25,1,0],[26,0,0]]) && !isInternalThread || isFeatureSupported([[18,19,0],[20,6,0]]) && isMainThread`；
  本机 Node 22.22.1 落在第一特性门之外（<22.22.3），第二支锁死 isMainThread——**worker 内两支皆 false，与 execArgv 继承无关**（探针实证：worker 的 execArgv 确含 `--import tsx`，显式 `execArgv:['--import','tsx']` 同样 ERR_MODULE_NOT_FOUND levels.js）。修：worker 分支先 `import { register } from "tsx/esm/api"` 显式 `register()`（该 API 出口无 isMainThread 门，探针实证 worker 内可用），再动态 import levels/kernel；主线程沿用 `--import tsx`。
- **修复C（勘误）**：头注 "DETW ORKERS" 错字；"JSON 产物逐字不变"改精确口径——rows/综合链逐字不变，meta 仅新增 `workers` 字段（`--compare` 不读取，快照对比不受影响）。

### 1.3 判据一致性证明（三方对照）

| 运行 | 模式 | combined sha256（全文） | rows vs 快照 |
|---|---|---|---|
| det-r0-baseline.json（在案快照） | 旧串行（提交版脚本） | `34425e393ba1fa69b360af4ab75e91c91d3687afd7c65af0e743cf74ae0bf90e` | — |
| det-r6c-serial.json（本槽） | DET_WORKERS=0 串行回退 | `34425e393ba1fa69b360af4ab75e91c91d3687afd7c65af0e743cf74ae0bf90e` | **逐字节相同** |
| det-r6c-par.json（本槽） | 缺省 ×4 worker 池 | `34425e393ba1fa69b360af4ab75e91c91d3687afd7c65af0e743cf74ae0bf90e` | **逐字节相同** |

- 三方 `JSON.stringify(rows)` 全等（48 行 × {id,steps,idle,scripted} 逐字节）。
- 判定：串行回退 `--compare r0-baseline` ✅ 48/48 位级一致 exit 0；并行缺省 `--compare r0-baseline` ✅ 48/48 位级一致 exit 0（合计运行内 2.0s）。
- 中间验证共 11 次 compare 全绿（串行 2 轮 + 并行 W=7/4/4/4/2/3/5/6 各档 + 终态双跑），无一漂移。
- 行为门禁联动：fixture-runner 6 PASS / 0 FAIL（tolerance=0 自基线 ×4 + oracle 金 ×2），exit 0。

### 1.4 耗时

| 模式 | 合计（脚本内 48 关） | 进程 real | 说明 |
|---|---|---|---|
| 旧串行（前任基线） | — | 4.05s | 快基线在案 |
| 串行回退（本槽复测） | 3.4s | 3.72s | DET_WORKERS=0 |
| 并行 ×7（前任缺省设计） | 2.9s | 3.20s | 过订阅，见下 |
| **并行 ×4（本槽定版缺省）** | **2.0s** | **2.27s** | user 13.4s |

W 扫描（逆序派发后，48 关合计秒）：W=2 → 2.5 / W=3 → 2.1 / **W=4 → 2.0、2.2、2.1** / W=5 → 2.3 / W=6 → 2.5 / W=7 → 2.8。碗底 W=4，与 4C/8T 吻合——每 worker 需独立 tsx+esbuild+box2d 启动（DET_STEPS=1 隔离实测：×7 全启动 0.98s real / 3.93s user），过订阅纯亏。缺省由前任 `min(8, CPU-1)` 改为 `min(4, max(1, CPU-1))`，DET_WORKERS 可覆盖。

两项并行侧微优（判据零变化）：
- **逆序派发**：forest_bonus_* 重关（bonus_2 ≈0.9s vs 其余 ≈0.05s）原排 sort 序末尾最后上车、独占收尾 ~1.0s 尾延迟；改为按 sort 逆序派发让重关先上车，行序仍由 `rows.sort()` 归一。
- 派发保持一关一发动态负载均衡（前任设计，保留）。

净收益：**det 门禁 real 4.05s → 2.27s（−44%）**；同机串行对照 3.72s → 2.27s（−39%）。

## 2. 其余工具项（先测后改）

| 项 | 基线 | 试验 | 结论 |
|---|---|---|---|
| typecheck | 2.31s | `--incremental --tsBuildInfoFile node_modules/.cache/tsconfig.tsbuildinfo`：首跑 2.30s（+0.07 写 info），稳态 1.41s，touch params.ts 后 1.45s；诊断输出与基线 diff 逐字一致 | **采纳**（package.json 一行）。稳态 **2.31s → 1.42s（−38%）**。tsbuildinfo 放 node_modules/.cache（tsc 自建目录、随 node_modules 忽略、不污染工作树）；并发写最坏=缓存失效回全量检查，fail-safe |
| vitest | 2.89s real（本轮复测；快基线 3.19s） | `--pool=threads` 2.82s；`--pool=threads maxThreads=2` 2.82s；`--no-file-parallelism` 4.66s | **不采纳**：仅 4 个测试文件，墙钟被 vite-node 固定启动（transform/collect/prepare ~1.1s）吃掉，池型调整收益 ≤2%，不值得配置churn |
| build | 4.69s real 本轮（快基线 5.55s） | 分析：vite build 无增量模式；可调杠杆（minify/treeshake/manualChunks/禁 code-split）全部改变产物字节流 | **不采纳**：产物中性是战役贯穿口径，无 artifact-neutral 空间，仅记录 |

## 3. 产物与提交

- `benchmark/perf-determinism.mjs`：审查修复 + 逆序派发 + cap 4 缺省（wip 提交 `4a6eb60` + 终态提交见文末）
- `package.json`：typecheck 增量一行
- `benchmark/results/det-r6c-serial.json` / `det-r6c-par.json`：三方对照证据快照（results 目录入库存档惯例）
- 验证序列：串行回退双跑（重构前后）→ NaN 守卫冒烟 → tsx worker 探针 2 发（失败基线 + register() 修复实证）→ 并行 W 扫描 8 次 compare 全绿 → 终态串行/并行存证双跑 → fixture 6/6。

## 4. 存疑与移交

- **本机 Node 22.22.1 < tsx 第一特性门（22.22.3）**是 worker 自动注册失效的根因；若日后 Node 升到 ≥22.22.3 / ≥24.11.1，tsx 会自动注册，显式 `register()` 变为冗余但无害（幂等 per-thread）。无需回改。
- det 并行收益上限受 per-worker 启动（~0.5s CPU/worker）与最重单关（forest_bonus_2 ≈0.9s）钳制；再往上需改加载管线（如 worker 预编译 TS），会引入"加载管线与串行不一致"的判据风险，**不建议**——门禁本体的位级可信度优先于秒表。
- 快基线 build 5.55s 与本轮 4.69s 存在 ~0.9s 漂移（同为热缓存单跑），未追因（非本槽改动面）。
- TEMP/perfopt6c/ 探针与日志残留已清理（保留前任 base/ 未动）。
