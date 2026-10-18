# r7a 容量挂账归因报告（perfopt7 槽）：每房边际 CPU 6.4ms/s 的构成拆解 + build 漂移追因

日期：2026-10-18 ｜ git：`7b8e6dd`（纯测量轮，零生产行为改动）｜ 量具：`note/report/perf/tools/perfopt7/`（新增 5 探针+1 脚本，既有量具零改动）
环境：VMware 客机 8 vCPU / Node v22.22.1 / 内核 7.0.0-38-generic；服务器只绑 127.0.0.1；全程独占机器

## 〇、一句话结论

**r6b 的每房边际 6.4ms/s 里，~68% 是"出站 patch 发送面"（C+E：60Hz×2 端的 encode+帧化+loopback 发送内核成本），不是物理也不是 encode 本身；本机 loopback ws 每次发送要花几十 µs 内核时间（微探针 13-120µs，服务器隐含 ~61µs），这是 VMware 客机上的大头。r6b 把 walk 图案的生产斜率去比 idle 输入的 step 微基准（1.04），错配掩盖了"移动物理唤醒 ≈3ms/s"这块本可解释的部分——挂账的两笔都结清：①归因表合计 6.64（vs 锚点 6.44，+3.1%）；②build 5.55 vs 4.69 判为会话级环境漂移（单跑无分布），非代码/配置回归。**

## 一、归因主表（挂账①的核心产出）

口径：32→64 房**两点稳态斜率差**（20s 窗、累计爬载、JIT 已暖，消除 r6b 低档暖机伪影）；A 面用 8/32/64 三点最小二乘（12s 窗 ×2 轮，两轮一致）。量具 `capacity-attrib.mjs` 的 5 种差分模式全部走 ForestRoom 真生命周期（真 ws 客户端、真 66ms 重发上行）。

| 面 | 内容 | 差分 | ms/s/房 | utime | stime | 占比 |
|---|---|---|---|---|---|---|
| A | 房间存在面：房对象+2×60Hz 定时器空转+ws 闲连+1Hz ping+colyseus 基础设施 | lobby 斜率 | **0.65** | 0.37 | 0.28 | 10% |
| B | 模拟面：world.step+syncState 实时驱动（静置物理） | sim-nopatch − A | **0.90** | ~1.0 | ≈0 | 14% |
| C | 出站 patch 面：60Hz encode+帧化+发送内核成本（5B/patch） | sim-patch − B | **1.53** | （见 §四反常） | 3.28 | 23% |
| D | 入站 input 面：15Hz/端 parse+派发+队列排水 | idle − sim-patch | **0.61** | 噪声带 | 噪声带 | 9% |
| E | 移动面：物理唤醒+player 字段写跟踪+patch 5B→25B 增量 | walk − idle | **2.95** | 噪声带 | 3.11 | 44% |
| **合计** | | | **6.64** | 0.88✓ | 5.77✓ | 100% |

- **锚点闭合**：合计 6.64 vs r6b 全梯最小二乘 6.44（+3.1%）；本轮 walk 三种测法（12s 窗五档 LS ×2 轮 = 6.31/6.54；稳态两点 = 6.64）与 r6b 互相咬合，量具可信。
- **恒等闭合**：各面 utime 合计 0.88 = walk utime 斜率 0.88；stime 同理 5.77 ✓。
- **与 r4 微基准核对**：B（0.90，utime 侧 ~1.0）vs r4 step+sync = 1.04+0.44 = 1.48——同量级，微基准含逐 tick `performance.now()` 对与单世界紧循环的测量开销，偏大 ~1.6×；E（2.95）vs r4 serialize 的 scripted−idle step 差（0.0757−0.0173 = 0.0584ms/步 ≈ 3.5ms/s）——同量级；C（1.53）vs r4 encode@60Hz 0.29 + loopback 发送 0.6~1.1（§三）——同量级。
- **@64 房有限差分对照**（非斜率口径，含固定成本摊销）：lobby 1.03 → +1.82 模拟 → +1.42 出站 → +0.23 输入 → +3.66 移动 = 8.2~8.4 = walk@64 每房值 ✓。
- utime/stime 的 B、D 面差分带 jiffy 量化噪声（±0.6ms/s/房），面值以 CPU 总斜率为准；C、E 是大信号，可信。

## 二、模式设计（为什么这些差分成立）

| 模式 | 房间状态 | 每房在跑的东西 | server env |
|---|---|---|---|
| lobby | 1 客户端/房，phase=lobby | tick 早退+1Hz ping+patch interval 空转+闲连 | 缺省 |
| sim-nopatch | 双人 started，零输入 | step+syncState+schema 写，**无出站** | `FW_PATCH_MS=10000`（既有取证旋钮） |
| sim-patch | 双人 started，零输入 | +60Hz encode+2 端发送（timerMs-only 5B） | 缺省 |
| idle | 双人 started | +15Hz/端全 false 输入 | 缺省 |
| walk | 双人 started | +持续走动（r6b 同款图案） | 缺省 |

模式间**每房工作量严格递增**（lobby ⊂ sim-nopatch ⊂ sim-patch ⊂ idle ⊂ walk），差分即面成本。sim-nopatch 的 patch 到达 0.08/s（10s 大包）与时漂 n/a 是口径预期（客户端视图粗粒化），非异常；死亡/重开全程 0。

## 三、stime 深挖：45% 的系统时间从哪来（排除法证据链）

walk@64 的 /proc 拆分 **u=5.1~8.0% / s=44.5~47.2%**，主线程线程拆账（/proc/<pid>/task/*/stat 窗内采样）：主线程 ut≈7% + st≈45.6%，V8/libuv 平台线程窗内增量≈0——热点全在主线程且内核态主导。逐一排查：

1. **GC 排除**：`--trace-gc` 三模式 20s 窗内 pause 合计 39.9/14.9/37.3ms = **0.075~0.2% 核**（证据 `tools/perfopt7/gc-*.log`）。且 nopatch 的 GC 次数反而最多（97 次 vs patch 25 次）——GC 连 nopatch 的 utime 反常都解释不了（方向就反了）。
2. **缺页排除**：窗内 minflt walk@64 **178/s**、sim-patch@64 93/s、sim-nopatch@64 3/s ≈ **0.02-0.04% 核**。
3. **纯定时器排除**：`timer-flood.mjs`（256 房 ×2 interval@60Hz 原生 setInterval）斜率 **0.047ms/s/房**——A 面的主体是房间/ws/colyseus 基础设施，不是定时器调度。
4. **网络 syscall 计数**：`strace -c -f`（walk@64 全程，ptrace 有扰动，patch 57→34.5/s，只取计数）：writev 72502 / read 33863 / futex 7495 / epoll_pwait 4446；writev 占 trace 时间仅 2.83%（24µs/call 还含 ptrace 放大）——**网络 syscall 面按计数×微探钢单价最多 ~7-9%，撑不起 45%**。
5. **loopback 发送微探针（钉死）**：`loopback-send.mjs --fanout`（sender 进程单独量 /proc）：本机 loopback ws 发送的内核成本 **740/s 时 ~100µs/发；~4.5k/s 批量后 13-20µs/发；连接数 1/128、对端忙碌与否都不敏感**。服务器 walk@64 隐含 **~61µs/发**（45% ÷ 7424 发/s）——同一数量级带。**stime 的主体就是 loopback ws 发送的内核成本**，量级是典型裸机（~2-5µs/发）的 10-30×，判读为 VMware 客机内核路径放大；具体内核函数定位挂账（perf_event_paranoid=4 阻断 perf；strace 时序被 ptrace 污染不可用）。
6. **V8 cpu-prof 失效取证**：四模式火焰全部 99.3-99.6% "(idle)"且 hits/wall 恒定 0.645；busy-spin 对照正常命中（94.4%）——采样器对 syscall 重线程失效（r6b 已记录过 SIGPROF 异常，本槽坐实）。火焰桶维度挂账，raw `.cpuprofile` ×4 收容 `tools/perfopt7/prof/`，解析桶见 `benchmark/results/attrib-r7-prof-*.json`。

## 四、反常如实记录：sim-nopatch 的 utime

sim-nopatch（严格更少工作：不出站）64 房 utime 12.85-15.75%，是 sim-patch（0.42-2.95%）的 3-8×。已排除：GC（§三.1，方向相反）、patch 工作量（纯增量）、缺页。嫌疑：无 `discardChanges` 路径上 schema 变更树不清理导致的用户态放大（重复标记/分支劣化），**机制未定论，挂账**。影响面：C 面的 utime 差分因此为负（表内已标注）；CPU 总量、stime 口径与全部部署结论不受影响。含 patch 的各模式互比不受此反常污染（它们都走 discard 路径）。

## 五、挂账②：build 5.55 vs 4.69 漂移追因

`npm run build`（=sync-assets+vite build）×10 连跑、两组（`build-dist.sh`，产物指纹逐跑校验）：

| 组 | 5 跑 real（s） | 中位 | 产物指纹 |
|---|---|---|---|
| 热缓存 | 4.99 / 4.80 / 4.74 / 4.86 / 4.84 | **4.84** | abcfa6a9d4df344d（5 跑全同） |
| `rm -rf node_modules/.vite` 后 | 4.88 / 4.71 / 4.79 / 4.77 / 4.81 | **4.79** | 同上（10 跑全同） |

**结论：判为会话级环境漂移（单跑无分布），非代码/配置回归。** 依据：(a) 今日带 4.71-4.99s、同日 run-to-run σ≈0.08s，r6c 的 4.69 落在带缘（−0.02s）；(b) 快基线 5.55 高出今日中位 0.71s（15%）——超出单日噪声但快基线是**单跑**且在更早会话，页缓存/宿主争用/频次状态不可复现；(c) 非代码因素排除法：package-lock（vite 6.3.5/esbuild 0.28.2）自 v0.3.0 后未动，r6c 之后代码零改动（今日 HEAD=r6c 终态+纯文档），r6c 只动过 perf-determinism.mjs 与 typecheck 一行（不触 vite build）；(d) `node_modules/.vite` 仅 16K 且只含 vitest 子目录，两组分布无差——**vite build 与该缓存无关**（vite build 走 rollup 无持久缓存）。**复现口径**：空机、git clean、暖跑 1 次弃用、连跑 5 次取中位（本机现时点预期带 4.7-5.0s）；单跑数字今后不再作对比锚点。

## 六、对部署选型的影响：每实例预算怎么修

1. **预算公式从"每房常数"改为"存在+收发字节加权"**：每房边际 ≈ **A 0.65 + B 0.9 + D 0.61 + C(字节)**；C 以 5B/patch 实测 1.53ms/s/房（120 发/s 的固定发送面 ~2.5ms/s/房@64 摊销前、字节增量斜率 ~1.4ms/s/房 per KB/s/房，两点拟合指示值，低置信）。**E 表明字节是大头：patch 5B→25B 就多了 ~3.1ms/s/房**。
2. **关卡混布权重**：全 forest_01 群（walk 25B/patch）实测 6.4-6.6；r4 口径 forest_bonus_2@60Hz 为 91B/patch（3.6×字节）→ 同房数出站面 ~3.6×，**重关卡集群的实例容量要按 ~1/2~1/3 下调**（拐点判据仍是 patch 率，CPU 只提前碰墙）。
3. **"≤64 房/实例"建议维持**（判据=patch 率 54/s 拐点，r6b 实测），本表不改拐点、只改"为什么"：拐点的主因是主线程内核态发送路径的串行化，确认"纵向加核无益、横向分片线性"的既有判断。
4. **绝对数是本 VM 口径**：61µs/发的内核发送成本若为 VMware 放大，裸金属/云主机目标机上按同款量具（`capacity-attrib.mjs`+`loopback-send.mjs`）复测后，单实例预算可能显著上调；选型时把"loopback/本机发送内核成本"作为机型评测项。

## 七、产物清单

- 量具（可复用探针）：`note/report/perf/tools/perfopt7/`——`capacity-attrib.mjs`（5 模式差分+utime/stime+minflt+线程窗口标记+strace/trace-gc 注入）、`timer-flood.mjs`、`loopback-send.mjs`、`parse-cpuprofile.mjs`、`prof-exit.cjs`、`build-dist.sh`
- 快照：`benchmark/results/attrib-r7-{lobby,sim-nopatch,sim-patch,idle,walk}.json`（12s 窗 ×2 轮全量 tiers）、`attrib-r7s20-*.json`（稳态两点）、`attrib-r7-timerflood.json`、`attrib-r7-prof-*.json`（profiler 失效取证+桶）、`attrib-r7-summary.json`（本表机器可读版）
- 证据收容：`tools/perfopt7/gc-*.log`（trace-gc 三模式原始输出）、`tools/perfopt7/strace-*.txt`（三模式 syscall 计数）、`tools/perfopt7/prof/*.cpuprofile`（火焰原件）

## 八、复现

```bash
# 主归因（~15min）：五模式×2 轮，12s 窗
node note/report/perf/tools/perfopt7/capacity-attrib.mjs --modes lobby,sim-nopatch,sim-patch,idle,walk \
     --rooms 8,32,64 --secs 12 --repeat 2 --port 3697 --save r7
# 稳态两点（~6min）：32→64、20s 窗
node note/report/perf/tools/perfopt7/capacity-attrib.mjs --modes sim-nopatch,sim-patch,idle,walk \
     --rooms 32,64 --secs 20 --walkRooms 32,64 --repeat 1 --port 3697 --save r7s20
# 面证据
node note/report/perf/tools/perfopt7/timer-flood.mjs --rooms 0,64,128,192,256 --secs 10 --save r7
node note/report/perf/tools/perfopt7/loopback-send.mjs --fanout --rate 7424 --size 25 --secs 6 --port 3699
node note/report/perf/tools/perfopt7/capacity-attrib.mjs --modes walk --rooms 64 --walkRooms 64 --secs 20 --traceGc --save none
node note/report/perf/tools/perfopt7/parse-cpuprofile.mjs --in <cpuprofile> --out <label>
# build 分布
bash note/report/perf/tools/perfopt7/build-dist.sh warm
```

## 九、存疑与披露

1. **B、D 面的 utime/stime 差分带噪声**（±0.6ms/s/房：jiffy 量化+JIT 会话差）；面合计以 CPU 总斜率闭合为准（6.64 vs 6.44，+3.1%，容差内）。B/D 的拆分置信度中，A/C/E 高。
2. **nopatch utime 反常未定论**（§四，已排除 GC/工作量/缺页）。
3. **火焰维度挂账**：V8 cpu-prof 对 syscall 重线程失效（§三.6），已用四路替代证据（线程拆账/trace-gc/strace/微探针）。
4. **内核函数级定位挂账**：perf_event_paranoid=4 且 strace 时序受 ptrace 污染；loopback 每发几十 µs 的内核成本落在哪个函数（tcp_sendmsg/loopback 收发/调度唤醒/虚拟化逸出）本槽无法定位。
5. **loopback 微探针首版伪影自曝**：`setInterval` 亚毫秒钳制使速率虚低 10×（首读"9µs/发"实为 ~100µs/发@740/s）；已在版内改批量 pacer 并重测，最终数字以 4.4-4.9k/s 批量版（13-20µs/发）与服务器隐含值（~61µs/发）呈现，同数量级带。
6. **低档暖机**：12s 窗 4-8 房档受 JIT 暖机污染（出站面斜率 0.47 vs @64 差分 1.42 的分歧即来自此）——主表因此以稳态两点斜率为主口径，五档 LS 作锚点复现。
7. walk 图案仍是"持续走动"的近似（r6b 披露沿用）；真人操作分布（跳跃/机关交互）会改 E 面权重。
8. minflt 三模式均已单测（walk 178 / sim-patch 93 / sim-nopatch 3 次每秒），缺页面全量排除。
