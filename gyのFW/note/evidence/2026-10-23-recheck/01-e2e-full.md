# 0.3.42 e2e 全量补跑（A 槽，2026-10-23）

范围：0.3.41/0.3.42 提交链（9fc2bb3 / c7dc51b / bd151d8 / 5225d74 等，改客户端 net/input/GameScene/audio 与服务端鉴权）后，0.3.42 交接未复验的浏览器 e2e 场景补跑回归。本档数字全部为本机实测（headless Chromium + Playwright 真实键盘/触摸注入，断言读服务端权威 state），逐场景独立服务进程，原始日志存 `TEMP/flashp_A/*.log`（收尾清理，断言明细另落盘 `scripts/e2e/out/journey-*.json`、`route-results.json` 可复查）。

环境：Linux x64（VM），node v22.22.1，`packages/client/dist` 就绪（未重构建），lib.mjs 默认 `FW_WIND_PHASE=0`。日期显示 2026-10-23。

## 逐场景记录

### 1. journey 全旅程 — PASS 7/7
- 命令：`node scripts/e2e/journey.mjs journey --port 3611`（`FW_DEBUG_FORCE_DOORS=1` 加速通关）
- 断言：7/7，EXIT=0，耗时 11.6s
- 房间 MAso-9k_0；明细：forest_01 通关（phase=won）→ A/B 双端 advance 换关 forest_02（房间码不变 MAso-9k_0→MAso-9k_0）→ 换关不回大厅（menuHidden A=true B=true）→ forest_02 ready→started levelId 正确 → 席位保留（A=火人/B=水女孩）→ 新关活局权威时钟续走（t 283→350）

### 2. pause — PASS 11/11（基线 11/11）
- 命令：`node scripts/e2e/journey.mjs pause --port 3612`
- 断言：11/11，EXIT=0，耗时 13.3s
- 明细：服务端驱动行走 anim=jumping；KeyP 暂停 → fb/wg 位置双冻结（x 205.5→205.5 / 196.5→196.5）、时钟停摆（t 800→800）、anim 停 jumping；phase=started 不占 paused 词；再按 P → fb 恢复 dx=114.10、wg 同步 dx=113.90、时钟续走 800→1217；二次暂停面板重开并可关闭（closing 复位，H1）

### 3. leave — PASS 3/3（基线 3/3）
- 命令：`node scripts/e2e/journey.mjs leave --port 3615`
- 断言：3/3，EXIT=0，耗时 10.4s
- 明细：主动离房 → 返回选关树；4000 关闭码不触发断线/重连横幅（hidden:true text:""）；对端离房 → 余端回 lobby

### 4. refresh — PASS 3/3（基线 3/3）
- 命令：`node scripts/e2e/journey.mjs refresh --port 3616`
- 断言：3/3，EXIT=0，耗时 12.9s
- 明细：第 1/2 次刷新均自动回座 started；回座相机已解冻（camFrozen=false，H2）

### 5. wonrefresh — PASS 6/6（基线 6/6）
- 命令：`node scripts/e2e/journey.mjs wonrefresh --port 3617`（`FW_DEBUG_FORCE_DOORS=1`+`FW_RECONNECT_SECONDS=15`）
- 断言：6/6，EXIT=0，耗时 13.3s
- 明细：FORCE_DOORS 通关 → EndMenu 已开 → 刷新回座 won → Game 与 EndMenu 均活动；结算数据非 0（diamondsTotal=7、timeLimitSec=40、stars=2）；无页面错误（EndMenu 不在字体未就绪时创建）；won HUD 文案由既有 phase 驱动

### 6. rejoin — PASS 3/3（基线 3/3）
- 命令：`node scripts/e2e/journey.mjs rejoin --port 3618`（`FW_RECONNECT_SECONDS=4` 缩窗）
- 断言：3/3，EXIT=0，耗时 18.2s
- 明细：房间 yPtRbgd6h 模拟断线 4s 超时 → 相位回 lobby（phase=lobby）；补位重进 → 整关重开 ready→started（levelId=forest_01，非死房）；补位者获水女孩席位

### 7. deathretry — PASS 4/4（基线 4/4）
- 命令：`node scripts/e2e/journey.mjs deathretry --port 3619`
- 断言：4/4，EXIT=0，耗时 16.3s
- 明细：forest_02 房间 feVjDuY6h，wg 右行 40px 入岩浆 → phase=gameover；静置 3.5s 不自动重开（原版语义）；Retry → 整关重开（耗时 6502ms 含静置）；重开关卡不变（levelId=forest_02）

### 8. rolesplit — PASS 6/6（基线 6/6）
- 命令：`node scripts/e2e/journey.mjs rolesplit --port 3620`
- 断言：6/6，EXIT=0，耗时 9.9s
- 明细：房间 A2Wq4_7vd；A=火人/B=水女孩；fb 忽略 WASD（KeyD dx=0.00）、方向键右移 dx=51.10；wg 忽略方向键（ArrowLeft dx=0.00）、WASD 右移 dx=60.00——跨组键免疫（F1）

### 9. touch 触屏虚拟按键 — PASS 6/6（基线 6/6）
- 命令：`node scripts/e2e/touch.mjs --port 3621`（头注缺省 3558，本跑显式指定）
- 断言：6/6，EXIT=0，耗时 19.2s（TOUCH E2E PASS）
- 明细：iPhone 13 描述符入房 HY3sv00fQ 三键可见（n=3）；CDP 真实触摸 tap（90ms 按压）跳跃 Δy=33.3px（>30 阈值）；按住右键 1.5s Δx=321.4px（>100 阈值）；抬起后高亮消除；桌面 context 不创建按钮；全程零页面错误

### 10. route 全自动通关 — 2/2 关 PASS
- f01：`node scripts/e2e/route.mjs --level forest_01 --port 3622`（offset 缺省 -10，头注默认口径）
  - PASS：won=true winAt=39478ms died=- final=won fb=(1079,157) wg=(1183,157)，耗时 63.3s
- f12：`node scripts/e2e/route.mjs --level forest_12 --port 3623 --offset -15`（历史标定口径：f12 本机用 -15）
  - PASS：won=true winAt=13426ms died=- final=won fb=(85,861) wg=(1150,861)，耗时 41.7s
- 两关均零死亡、零派发异常，trace 明细 `scripts/e2e/out/route-results.json`

## 异常与判读

- **限流（0.3.41 matchmaking 60 次/60s 每 IP）**：未触发。各场景为独立服务进程不累积，全部日志 grep `4429|尝试过于频繁` 零命中；无加入失败。
- **Colyseus 启动横幅 `❌ "forest"'s onAuth() defined at the instance level will be ignored.`**：每次起服 stderr 均出现，属既有框架噪声（历史基线跑同样存在），非本次改动引入，不影响任何断言。
- **进程残留**：11 个用例端口（3611/3612/3615-3623）跑后 `ss -tlnp` 复查全部无监听残留。系统内另有 tsx server 监听 3640——属其他槽进程（3640/3650 非本槽端口），未触碰。
- **断言口径**：journey 系断言数以各场景 `results.checks` 为准（落盘 JSON 与控制台 `N/N 项` 一致）；route.mjs 以 `won=true && 无 diedAt && 无 dispatchError` 为单轮 PASS 判据（每关 repeat=1）。

## 总表

| # | 场景 | 命令 | 端口 | 断言 | 基线 | 结果 | 耗时 |
|---|------|------|------|------|------|------|------|
| 1 | journey 全旅程 | `journey.mjs journey` | 3611 | 7/7 | — | PASS | 11.6s |
| 2 | pause 暂停冻结 | `journey.mjs pause` | 3612 | 11/11 | 11/11 | PASS | 13.3s |
| 3 | leave 主动离房 | `journey.mjs leave` | 3615 | 3/3 | 3/3 | PASS | 10.4s |
| 4 | refresh 刷新回座 | `journey.mjs refresh` | 3616 | 3/3 | 3/3 | PASS | 12.9s |
| 5 | wonrefresh won 相位刷新回座 | `journey.mjs wonrefresh` | 3617 | 6/6 | 6/6 | PASS | 13.3s |
| 6 | rejoin 补位重进 | `journey.mjs rejoin` | 3618 | 3/3 | 3/3 | PASS | 18.2s |
| 7 | deathretry 死亡重开 | `journey.mjs deathretry` | 3619 | 4/4 | 4/4 | PASS | 16.3s |
| 8 | rolesplit 按角色分键 | `journey.mjs rolesplit` | 3620 | 6/6 | 6/6 | PASS | 9.9s |
| 9 | touch 触屏虚拟按键 | `touch.mjs --port 3621` | 3621 | 6/6 | 6/6 | PASS | 19.2s |
| 10a | route forest_01 | `route.mjs --level forest_01` | 3622 | won@39478ms | 通关 | PASS | 63.3s |
| 10b | route forest_12（offset -15） | `route.mjs --level forest_12 --offset -15` | 3623 | won@13426ms | 通关 | PASS | 41.7s |

**总计：11 跑 11 PASS，journey+touch 显式断言 49/49，route 2/2 关零失败，零限流，零进程残留。0.3.42 未复验项全部补验通过。**
