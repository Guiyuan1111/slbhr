# A 槽：服务端房间域 8 条处置报告（2026-10-20）

负责：#1 B-01、#2 H-01、#3 H-02、#4 H-03、#6 M-01、#11 M-06、#12 L-01、#13 L-02（全部 packages/server 域）。
纪律：每条先复核（代码字证 + headless 双客户端探针实录）后动手；探针在 TEMP/roomfix/probe.mjs（colyseus.js Node 客户端，零浏览器，断言全读权威 state/广播消息，每场景独立起服）。
commit 全部只触 `packages/server/src/rooms/ForestRoom.ts`，逐条独立提交。

## 逐条处置表

| issue | 结论 | 修复 commit | 探针（修复前 → 修复后） |
| --- | --- | --- | --- |
| #1 B-01 暂停/断线后输入时基永久漂移（Blocker） | **成立，已修** | `53db8be` | 暂停3s→right 1.2s Δx **0.0px**；暂停0.5s **0.0px**；断线2s重连 **0.0px** → **255.3 / 162.7 / 260.0px**（判据>30）PASS |
| #2 H-01 主动退出冻结对方 60s | **成立，已修** | `98b4ed9` | consent leave 后 A 视角 +2.5s/+3.5s phase=**paused**（冻满重连窗）→ 2.5s 内 **lobby**；「A 暂停中 B 退出」收 paused=false **false** → **true** PASS |
| #3 H-02 ready 定时不校验相位/人数 | **成立，已修** | `6e6270b` | ready 期断线 +2.5s phase=**started**（缺人开跑实录）→ **paused**；超时后 +5.5s=lobby PASS |
| #4 H-03 双断线一方超时另一方重连卡 lobby | **证伪关闭**（机制不可达，残局=设计） | 无代码改动 | 见 §H-03 三重证据 |
| #6 M-01 超时清暂停不广播 | **成立，已修** | `9946b3f`（广播半随 `98b4ed9` releaseSeat） | 超时后 paused=false 广播 **false**、resume 回声 **false** → 双 **true** PASS |
| #11 M-06 暂停菜单「再试一次」被忽略 | **成立，已修** | `4dc3b91` | 暂停中 restart：readySeen/startedAgain/解除广播全 **false**、timerMs 1483→1500 续走 → 全 **true**、timerMs 1517→**300** 重置 PASS |
| #12 L-01 超时后补建幽灵角色 | **成立，已修** | `ebc2a24` | 超时后 players=[fireboy,**watergirl**(x=96.0 冻结幽灵)] → **[fireboy]** PASS |
| #13 L-02 finish 不落 state、重连丢结算/0 秒最佳 | **成立，已修** | `ae961d0` | won 相位重连补收 finish **0 条** → **1 条** PASS |

## 关键机制注记

- **B-01**：两种冻结（userPaused 与断线 phase=paused）可叠加，共享 `freezeStartWall` 锚点，`syncFreezeClock()` 按最外层进出把冻结时长加回 `startedWall`；tick 内卡顿重锚定（步进钟落后 >200ms 时重锚，健康运行 ≤~25ms 不触发，正常路径 deadline 公式逐字未动——route 回放零漂移佐证）。
- **H-01/M-01**：`releaseSeat(client, role)` 为超时 catch 与 consented leave 共用；离场者可能是暂停发起者，解除必须广播 `paused:false`；resume 幂等化（!userPaused 也回 paused:false）接住错过广播的陈旧面板。
- **H-02**：守卫 `phase==="ready" && roles.size===2`——ready 期断线后 phase 已被 onLeave 置 paused，守卫以相位为主判据（断线者席位在超时前未释放，人数判不掉该形态）；重连恢复 prevPhase=ready 时重排 beginReady（自带 clearTimeout 不叠加）。
- **L-02 排序陷阱**：`allowReconnection` resolve 发生在 core `Room._onJoin` 内部、早于 JOIN_ROOM 载荷（Room.js:576）——resolve 后立即 `client.send("finish")` 会先于载荷到达、被尚未重绑的客户端 Room 丢弃。故采用「先补发 finish、延迟 120ms 恢复相位」，保证客户端 `onPhase("won")` 读 lastFinish 时已就位（相位先到会用 0 兜底算星级→0 秒写最佳）。
- **复核方法论教训**：跨进程日志按管道到达序拼接会严重误导（consent leave 的"瞬时回 lobby"假象实为客户端 `leave(true)` promise 被服务端 hook 挂到超时才 resolve 的采样偏移）——时序结论必须以单侧墙钟采样或服务端插桩为准。

## H-03 证伪证据（#4，已关）

1. **字证不可达**：`phase="lobby"` 仅两处写入——onCreate 与超时释放路径，后者必先 `roles.delete` 恰一席再判 `size>0`；`roles` 只在 onJoin 增员且 size===2 时**同步** beginReady/restartLevel（timer 当场存在）。因此「roles.size===2 + 双方在线 + 卡 lobby 无钟」需要一次不删席位的 lobby 写入，不存在。maxClients=2 + 席位预留亦挡死第三人趁窗入座（实测 joinById 被 4409/locked 拒）。
2. **行为实证**（FW_RECONNECT_SECONDS 缩窗探针）：同时断线双方窗内重连 → prevPhase 正常恢复 started；交错断线（一方超时后另一方迟到重连）→ 重连端落 phase=lobby+单席位等待页，即 0.3.27 断线超时**设计语义**（对方已永久离场，双人关无法单人中局）；超时方把活局翻回 lobby 亦是同一设计转换。补位重进实测 **+21ms 即 ready→started** 整关重开（journey rejoin 3/3 门禁同证），与 issue 自己给出的恢复路径一致。
3. **随邻条改善**：迟到重连端不再见幽灵（players=[fireboy]，L-01）、时基无漂移（B-01）。原 issue 的两条验证项：「同时断网 5s 分别恢复应能重开」修复前后均 PASS（非缺陷）；「一方超时后恢复另一方不应卡 lobby」的可观测残局即设计等待页，非可修缺陷。

## 门禁（全批完成后一次跑齐）

| 门 | 结果 |
| --- | --- |
| tsc `npm run typecheck` | exit 0 |
| vitest | **106/106**（基线已随并行 B-infra 槽由 95 升至 106） |
| det 48 关位级对比 | **48/48 @r0-baseline**（本次 2.9s；房间层零物理交集实测背书） |
| census 碰撞普查 | **PASS=18446 FAIL=0**（与门禁基线数字一致） |
| e2e route forest_01 repeat1 | PASS，winAt=**39613ms**（历史带 39471-39613ms，零漂移） |
| e2e route forest_12 repeat1 | PASS，winAt=**13003ms** |
| journey journey | **7/7** ALL PASS |
| journey pause / rejoin / deathretry / rolesplit | **9/9 / 3/3 / 4/4 / 6/6** ALL PASS（pause/rejoin 直接覆盖本次服务器改动面） |
| touch 触屏 e2e | **6/6**（tap Δy=34.2px、按住 Δx=331.1px，经改造后输入管道全真路径） |
| TEMP/roomfix 探针套件 | **8/8 PASS + 2 OBSERVE**（h03 两场景为观测记录） |

e2e/journey/touch 首跑各出现过一次「#password 定位 30s 超时」瞬态（与取证槽并行浏览器争 4 核相关；同命令复跑即绿，route 同路径从未复现），非本次改动面，记录备考。

## 事故记录（已自愈）

- L-01 提交时 `git add <file> && git commit` 卷入了并行槽暂存在共享 index 的客户端 WIP（index.html/main.ts/net.ts）。当即 `reset --soft` + `restore --staged packages/client` 后以 `git commit -- <path>` 重提交（`ebc2a24`，仅 ForestRoom.ts），对方改动原样还原回工作树。后续本槽提交全部采用 pathspec 限定。

## 客户端余量（需协调方排后续波次，本次协议均兼容）

1. **L-02**：reconnect 后 `prevPhase` 已是 "won" 的端不会重触发 onPhase（EndMenu 不重开；lastFinish 已由补发回填）。需客户端在重连成功路径主动检查 `state.phase==="won" && lastFinish`。
2. **L-01**：客户端本地渲染图仍可能保留离场角色（schema 已不再下发幽灵条目），是否隐藏由渲染层决定。
3. **H-01/M-01**：余端回 lobby 后 HUD 文案由既有 phase 驱动，无需改动；已验证协议兼容。
