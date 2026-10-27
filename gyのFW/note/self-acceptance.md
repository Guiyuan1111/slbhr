# 自验收制度：如何让我在交给你之前先「替你玩过」

> 缘起（2026-10-10，用户问）：「你一直在开发，如何实现自我验收，而不是我自己游玩一次才能发现问题？」
> 0.3.27 门扫帧 bug 是标本：单测全绿、e2e 通关全绿、确定性基线全绿——实玩必挂。本文档定义分层验收阶梯，
> 使每一版交付前都有一层「用真实输入、走真实服务端、复现用户旅程」的行为门。

## 一、历史上的 bug 为什么全部漏到我手里

| 逃逸 bug | 当时门禁表现 | 漏网根因 |
|---|---|---|
| 0.3.25 拉杆碰撞体/贴图不一致 | 单测/确定性全绿 | 数值层验证物理，无人验证「交互位置的碰撞与画面对齐」 |
| 0.3.25 平台灯罩换帧（BodyState.state） | 单测/确定性全绿 | 服务端漏注册 defineTypes，字段不上 wire——没有任何一层看**客户端实际收到什么** |
| 0.3.27 门扫帧卡摆（永不通关） | 单测/确定性/e2e 通关全绿 | ① 测试与实现共享同一盲区：传送实验与 `FW_DEBUG_FORCE_DOORS` 都是**双门同帧锁步**，恰好喂进单步脉冲的巧合；② e2e 用调试钩子替代了真实输入，从未真实走位入门 |
| 0.3.27 暂停吞末次输入 / 重连丢 Room / 断线超时死房 | 无对应场景用例 | 全是「旅程级」缺陷：暂停、断线、补位没有任何在体用例 |

三条教训：
1. **测试与实现共享假设时，测试只是实现的复读机**——必须存在与实现不同源的用例（原版字证、属性化随机、真实输入回放）。
2. **调试钩子（FW_DEBUG_*）只允许作为加速器存在，其覆盖面必须有非钩子等价用例**。
3. **凡是用户旅程特性（暂停/断线/继续/重开），必须有一条在体旅程用例**，否则默认没人验过。

## 二、验收阶梯（L0-L4）

| 层 | 门 | 内容 | 拦截哪类问题 | 历史对应 |
|---|---|---|---|---|
| L0 静态 | typecheck · build | 类型/打包 | 低级断裂 | — |
| L1 内核行为 | vitest（含**属性化**用例） | 内核语义 + 随机错峰/随机位置 | 状态机时序、边界巧合 | 0.3.27 门卡摆（修复后属性化 20 组错峰+带内随机停靠位，锁步巧合免疫） |
| L2 数值基准 | det 48 关位级对比 · fidelity-score · 金轨迹 | 物理数值漂移 | 积分/碰撞数值回归 | 0.3.26 rotation（det 漂移恰好圈出两关） |
| L3 行为在体 | **真实服务端 + 双 headless 浏览器**，真实键盘输入，读权威 state 断言 | 用户旅程复现 | 全链路集成、网络同步、相位机、输入管道 | 0.3.27 全部四类附带缺陷的回归场景（见 §三） |
| L4 视觉 | 实机截图 · visual-diff 基准 · 视觉终审（图形授权内） | 贴图/布局/UI | 渲染层错位、缺失 | 0.3.25 拉杆贴图、0.3.26 斜台截图比对 |

## 三、L3 在体场景清单（scripts/e2e/）

| 场景 | 命令 | 断言要点 | 拦截过/拦截什么 |
|---|---|---|---|
| soak 浸泡 | `regression.mjs`（无脚本） | 30s 零页面错误 + 存活 | 物理崩溃/异常外泄 |
| 强制通关 | `FW_DEBUG_FORCE_DOORS=1 regression.mjs --script movements.json --expect-win` | win→phase→HUD 通关！全链 | 相位机/结算链回归（**加速器**，覆盖面由下一行兜底） |
| **真实走位通关** | `regression.mjs --level zz_probe --script inputs/walkin-doors.json --expect-win` | 真实接触→开门→win，无任何钩子 | 0.3.27 门卡摆本体；未来任何门感应回归 |
| **全旅程续关** | `journey.mjs journey` | 通关→继续→活房间 advance 同房换关 forest_02（0.3.12 语义：房间码不变、席位保留、面板不弹出、EndMenu 关/Game 重建）→ready→started→权威时钟续走 | 0.3.12 活房间 advance + 0.3.37 黑幕包络状态轮询口径（2026-10-20 改写，旧「弹面板预选」断言随语义退役） |
| **暂停全场冻结** | `journey.mjs pause` | 双方各按行进键→一端 KeyP：双端位置/timerMs 位级停摆（anim 停在 jumping 非全松回 idle）；phase 仍 started；再按 P 恢复推进（暂停期按住的键生效=原版键掩码语义）（F3 翻转后口径） | F3 翻转（服务端权威 userPaused）；未来暂停/输入闸回归 |
| **断线超时补位** | `journey.mjs rejoin`（FW_RECONNECT_SECONDS=4 缩窗） | 超时后 phase 回 lobby；补位→整关重开→started；补位者获水女孩席位 | 0.3.27 onLeave 死房修复；未来重连/补位回归 |
| **sync 字段探针** | 内嵌于 regression 所有模式 | 页面内直读权威 state：全部机关映射的 state 字段、doors 六字段、levelId 必须真实到达 | 0.3.25 defineTypes 漏注册类缺陷——**客户端视角**的字段存在性 |
| **全程通关门禁（P3）** | `route.mjs --level <id> --repeat 3` | routetool 产线路线 → 双浏览器真实键盘全程回放 → phase=won；repeat≥3 ALL PASS；0 调试钩子 | 0.3.27 门卡摆的真实全程版；未来任何物理/机关/输入管道回归（forest_01 已达此标准，余关见 §五） |

## 四、每版发版前的强制门禁清单

- [ ] L0：`npm run typecheck` + `npm run build`
- [ ] L1：`npx vitest run` 全绿；动过内核语义时，新增/更新属性化用例（随机时序、随机参数，禁止只写固定值用例）
- [ ] L2：`node --import tsx benchmark/perf-determinism.mjs --compare <当前基线>` 48 关位级一致（物理改动则先评估漂移面，再切新基线）
- [ ] L3：§三全部场景 PASS（soak / 强制通关 / 真实走位 / journey / pause / rejoin；sync 探针随 regression 自动跑）
- [ ] L4：关键画面实机截图留档；UI/贴图类改动过 visual-diff；有疑问处用视觉终审
- [ ] 新增用户旅程特性 ⇒ 同一提交内新增对应 L3 用例
- [ ] release notes 记录本版跑过的门禁结果

## 五、当前已知缺口（按优先级）

1. **P3 全自动通关 bot（forest_01 已落地，产线已工具化）**：routetool 产线
   （`scripts/e2e/routetool/`：内核 harness/validate/optimize）+ 门禁 runner（`route.mjs`，
   服务端 [phase] 锚定 + 输入队列排水）→ forest_01 repeat≥3 ALL PASS。**剩余工作**：
   其余 47 关按「原语库+内核初排 → optimize ±1f 硬化 → validate → 门禁」批量生产
   （批次计划见 note/plans/level-batches.md）；产出后将「48 关全部可真实通关」整体纳入 L3 必过清单。
   **light 部进度（2026-10-26）**：light_01/light_02 正式路线已入库（route-node 真服各 3/3 PASS，0.3.49），余 38 关未产线；light_01 接线考古与编排见 note/light01-route.md。
2. 其余关卡的机关级旅程用例（拉杆/推箱/风区/摆绳在体交互）目前依赖 L1+L2，未逐一在体。
3. 音频层（播放与否/音量）无自动化断言，仅实玩抽检。
4. 触屏（Touch* 虚拟键）`touch.mjs` 已覆盖三键/ tap/按住/桌面豁免（自动化侧）；真机多点与 iOS Safari 实机手感仍靠人工抽检。

## 六、配套基建（2026-10-10 落地）

- `scripts/e2e/lib.mjs`：起服/入场/键盘注入/started 闸/sync 探针公共库。
- `scripts/e2e/journey.mjs`：L3 三场景（journey/pause/rejoin）。
- `regression.mjs`：接入 lib + sync 探针计入 PASS 判定。
- 服务端 `FW_RECONNECT_SECONDS` 旋钮（默认 60s 不变）：rejoin 场景无需等满一分钟。
- kernel2「双门异时到位」+「属性化 20 组随机错峰」用例。

## 七、路线产线（2026-10-11 落地，P3 主体）

- `scripts/e2e/routetool/kernel.mjs`：内核 harness（tsx 直载 TS，与真实服务端同一份内核；双关卡库）。已做编译产物↔TS 直载位级等价取证（700 帧 0 分歧）。
- `scripts/e2e/routetool/validate.mjs`：内核复核 CLI（WIN/FAIL 退出码 + 逐帧 trace）。
- `scripts/e2e/routetool/optimize.mjs`：±1f 容忍硬化器（成组平移坐标下降 + 最优快照回滚）。
- `scripts/e2e/route.mjs`：真实门禁 runner——服务端 `[phase]` 墙钟锚定、mono↔wall 桥接、双页合并时间轴精准派发、0 钩子断言 phase=won。
- `scripts/e2e/route-node.mjs`（0.3.49）：纯 node 真服回放器——colyseus.js 双客户端建/进房 + 服务端 stdout 墙钟锚（ready+2000）+ node 定时器链（±1ms，派发 p50=2ms）；回放断言全在服务端、浏览器不参与判定。light_01/light_02 首批以此验收（各 repeat3 3/3 PASS，offset=-10）。
- 服务端输入队列（335b5e7）：消息按到达墙钟戳入队、每步按意图跨度排水——真实服务端逐事件精确复现内核时序的前提。
- 观测纪律：FW_DUMP 等诊断逐帧落盘必须缓冲（30 行/写、分段），禁止逐帧同步 IO 扰动节拍；门禁本体 0 钩子。
