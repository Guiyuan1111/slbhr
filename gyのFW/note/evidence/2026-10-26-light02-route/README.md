# light_02 路线攻坚证据档（2026-10-26）

## 产物

- 入库路线：`scripts/e2e/inputs/routes/light_02.json`（364 事件，totalFrames 4395）
- 最终派生脚本：`route-v51.mjs`（botcore 条件门步骤链 → 逐帧输入记录 → toRouteDoc）
- 诊断工具：`diff-dump.mjs`（FW_DUMP 服务器逐 tick 转储 vs 内核 trace 逐帧对齐，找首个分歧帧+前后输入/消费时刻）

## 验收

- 内核：validate.mjs exit 0，WIN@f4394
- 真服：`route-node.mjs --repeat 3` **3/3 PASS**（offset=-10，node 派发 p50=2ms）
- 浏览器路径（route.mjs）最终形态同轮 FAIL（见下），已由 node 路径取代回放职责

## 派发架构考古（run1-run13 全谱数据）

浏览器路径四层死因（层层剥开）：

1. **CDP evaluate 往返 fwd 段 p50=28ms、p95=52、max=84**（run8 页内自计时全谱）——对 16.7ms 帧窗不可用，任何静态 offset 都罩不住 ±25ms 抖动。
2. **页主线程 setTimeout 被 Chromium 策略推迟**：裸测链式 setTimeout(17) 实发 p50=41-52ms、p90=83；同环境 about:blank 页完美 17.5ms——与补丁率无关（FW_PATCH_MS 50 无改善）、与 rAF 心跳无关（33ms 心跳更差）、真 rAF 也 39ms。客户端页面本身触发该策略。
3. **DedicatedWorker 定时器不受此策略管束**：裸测 17ms 实发 p50≈21.7ms（含 postMessage 回主线程一跳）；但真实房间内回跳膨胀到 p50=+26ms（补丁唤醒节拍耦合，均匀分布在 patch 间隔上）。
4. **锚定演进**：相位补丁滞后（p50+48）→ state.f 自校锚（补丁稀疏 min-staleness 不收敛，+54ms）→ **同机时钟直映射**（页 Date.now 与 node 墙钟同源，T0=ready+2000，服务端 setTimeout 漂移 +0..5ms）✓。

终局：**纯 node 回放**（`scripts/e2e/route-node.mjs`）——colyseus.js 双客户端直连，node 定时器链派发，到达抖动 ±2-3ms（done−t p50=2/max=23），全窗落位。胜负断言全在服务端，浏览器本就非必需。

## 服务端配套

- `ForestRoom` 状态补 `f`（内核帧号镜像，uint16，syncState 每 tick 同步）——补丁流自描述时序，锚定/诊断可用，客户端忽略。

## 首个滑帧死法（浏览器时代样本）

f=11 火娃起跳 +22ms 越过 deadline（187.3ms）滑入 f12 → 全链 1f 错位 → 活塞相位锁死致死于 (883,764)。服务端意图跨度 (k·16.67, k·16.67+16.67]、deadline=+4ms 的语义下，目标 offset=-10（到达 ≈-8ms）留 ±(4.7,14)ms 余量。

## 收容：±1f 硬化弃置档（light_02.opt.abandoned.json）

optimizer ±1f 硬化尝试档（原 `scripts/e2e/inputs/routes/light_02.opt.json`，2026-10-27 收容）：
事件帧 ±1~3f 微调（fb 105/204、wg 94/160 处不同），totalFrames 4395 与正档一致。
fatal=0 未达成——31% 事件天生帧临界（坐标下降邻域无解，平台 226/728），弃置；
**未通过任何回放验证，不等于正档**，正式路线以 `scripts/e2e/inputs/routes/light_02.json` 为准。
