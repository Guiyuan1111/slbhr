# C 槽：客户端 DOM/连接/HUD 面修复（H-04 / L-05 / L-04 客户端半）

2026-10-20 · flashp-domfix 槽 · 文件域 packages/client（index.html / src/main.ts / src/net.ts）
基线：0.3.38+（会话内树被并行槽推进至 0.3.39，8390fd9；本槽三提交均在其上）

## 逐条处置表

| Issue | 结论 | 修复 commit | 关闭 |
|---|---|---|---|
| #5 [High][H-04] 重连只尝试一次且失败提示被 HUD 覆盖 | 字证+实机复现均坐实 | 24b5fb5 | 已关 |
| #16 [Low][L-05] 邀请链接把房间密码放 URL 查询参数 | 字证坐实（main.ts 拼 `&pw=`） | 6b7f7f4 | 已关 |
| #15 [Low][L-04] 密码无最小长度/输入框明文（客户端半） | 字证坐实（index.html `type="text"`） | f4eec16 | 已关（服务端半=4881343，B-infra 槽） |

## H-04（#5）

**复核**（全部字证命中）：
- `net.ts` onLeave：`reconnect(token)` 仅单次；**`if (token)` 不成立时穿透到 `cb.onDisconnect(true)`**（令牌缺失误报恢复成功）。
- `main.ts` onDisconnect(false) 写 `#hud-status`，而 `updateHud` 每 250ms 无条件覆写同元素（`text[phase] ?? ""`）。
- **修复前实机复现**（TEMP 探针，1 浏览器，杀服采样）：`#hud-status` 值序列 `等待另一位玩家加入… → 连接已断开(+129ms) → 等待另一位玩家加入…(+316ms)`——提示 190ms 即被冲掉，且无任何常驻断线指示。

**修复**（24b5fb5）：
1. 令牌缺失 → `onDisconnect(false)`（按失败处理）；退避重试 4 次（0/1/2/4s，总窗 ~7s+尝试耗时，服务端 60s 席位窗内；`RECONNECT_DELAYS_MS`）。
2. 重连令牌+角色落 `sessionStorage("fw-resume")`（bindRoom/role 消息时写、主动离开/重试耗尽/失效时清）；`Net.tryResume()` 刷新回座——服务端 `allowReconnection` 不重跑 onJoin、不重发 role，角色只能从快照还原（ForestRoom.ts 只读复核佐证）。
3. 断线面独立化：`#net-lost` 常驻横幅（`setNetLost`），置于 #hud 子树（pointer-events:none，量具隐蔽口径同享）；`onReconnecting(attempt,max)` 通报进度；回调抽 `netHandlers()` 供 start/tryResume 共用。
4. 无深链时 boot 走 tryResume：成功免面板直接回座；令牌失效把联机面板带出并给明确提示（否则错误写在隐藏面板里没人看得见）。

**实机验证**（TEMP verify-h04，7/7）：重连文案 4 档推进（1/4→2/4→3/4→终态常驻）；刷新免面板回座（HUD 亮+state 可读+角色快照还原「你扮演：火人」+房间码一致）；服务器重启后刷新→面板弹出+「上次连接已失效」。

## L-05（#16）

**复核**：main.ts 生成侧拼 `&pw=${encodeURIComponent(password)}`；消费侧 `inviteRoom && invitePw` 才回填。
**关键复核结论**：**journey/e2e 对 `?room=&pw=` 深链零依赖**（`scripts/e2e/lib.mjs enterAs` 走 `page.fill` 表单输入，journey.mjs 全文无深链引用）——journey.mjs 无需适配，7/7 实跑佐证。带 pw 深链的真实消费方仅 `benchmark/perf-idle.mjs`（读侧保留兼容即不受影响）。

**修复**（6b7f7f4）：
- 生成侧去掉 `&pw=`：链接只含 `?level=&room=`；按钮 `title` 注明「链接只含房间码不含密码」。
- 读侧 `?pw=` 保留兼容（旧书签/脚本/门禁基准）；仅 `?room=` 深链改为只回填房间码、不自动加入（等手输密码）。

## L-04 客户端半（#15）

**复核**：`index.html` `<input id="password" type="text" maxlength="16">`；main.ts 无长度校验。服务端半（建房 4-64 位门槛）已由 B-infra 槽 4881343 落地。

**修复**（f4eec16）：
- `type="password"` + `minlength="4"`（与服务端 4-64 同口径）+ `autocomplete="off"`；行内明文切换小钮 `#pw-toggle`（「显示/隐藏」文案走 ::before 伪元素，不进 textContent，ID 契约零污染；aria-label/aria-pressed 同步；石板同族透明底暖灰字样式）。
- `start()` 本地拦截 `<4` 位：`密码至少 4 位（与对方约定一致即可）`。
- e2e 口径核实：`PASSWORD=e2e-pw`(lib/touch/journey)、`idle-pw`(perf-idle)、`vw-pw`(visual-diff)、`perf-pw`(perf-capacity) 全部 ≥4 位不受拦；perfopt3 归档工具的 `"pw"` 在 note/ 历史档（非门禁）。

## 门禁（最终 HEAD=8390fd9 树上复验）

| 项 | 结果 |
|---|---|
| tsc（typecheck） | PASS |
| vite build（仓库根） | PASS（4.2s） |
| vitest 全量 | **106/106 PASS**（vitest 已被 B-infra 升 5.0.5；106=0.3.39 树实数，较派发口径 95/95 的差额为并行槽新增测试，非本槽引入） |
| ID 契约探针 | **14/14 PASS ×2 轮**（按 connect-ui README §T1-T12 口径重建：T1 八 ID+元素类型附记 hud-room=span 既有事实/T2 精确串/T3 scale0.75/T4 hover 换帧/T5-T7 三视口流/T8 深链回落/T9 busy/T10 横幅解锁/T11 可编辑/T12 零 console 错；+本槽附加 2 项：邀请链接无 pw、无 pw 深链只回填） |
| e2e f01 repeat1 | **ALL PASS，winAt=39467ms**（`route.mjs` 口径，0.3.38 基线带 39466-39477 内） |
| journey | **7/7 ALL PASS** |
| touch | **6/6 PASS** |
| visual-diff | **92.90 / 92.62 双跑**（新口径带 90.55-92.86 内~带顶噪声；#net-lost 在 #hud 子树随量具隐蔽口径，实证不入镜） |
| census | used-chars.json 随文案提交刷新（保留集 247→248；自 10-19 起各槽漂移一并落盘，0.3.33 先例） |

**终树复验**（并行槽服务端修复 H-02/M-01/M-06/L-01/L-02 落地后的 HEAD=115999a）：tsc PASS、build 3.95s、vitest 106/106、journey 7/7 ALL PASS、route f01 repeat1 ALL PASS（winAt=39644ms，跑间漂移带内）。

## 取证与归因记录（非本槽缺陷，如实记录）

1. **e2e 误用归因**：`regression.mjs --level forest_01 --script inputs/walkin-doors.json` 必 FAIL（won=false，errors=0）——walkin 时间线仅 4 事件（右行 667ms），而 forest_01 门带在 (1024-1200, 192) 高台，该时间线为 regression.mjs 头注的 `zz_probe` fixture 设计。f01 门禁正确口径=**route.mjs**（回放整关路线）。本槽在此误用上耗两跑后定位，基线 A/B（checkout 92eb6de 三文件重建）同败，证实非本槽回归。
2. **探针环境伪影**：多 context 长持多 Phaser 页时 headless chromium 渲染进程随机死亡（服务端 PROBE-LEAVE consented=false）+ `waitForFunction` 默认 rAF 轮询被后台页节流——重建探针改「每组用完即关（≤3 活页）+ polling:120ms + --disable-dev-shm-usage」后稳定。`Texture key already in use: mech|popup` console.error 仅在多页长持高压下偶发，单流程隔离复测（裸深链/无 pw 深链/错 pw 深链/join 成功）全净，判环境伪影。
3. **TS18047 插曲**：HEAD 9d1fdb5（flashp1 restartWithFade）自带 tsc 错误，flashp1 槽自行修复（92eb6de，const game 中转），本槽未代修。

## 产出

- 提交：24b5fb5（H-04 #5）、6b7f7f4（L-05 #16）、f4eec16（L-04 #15 客户端半）
- 文件：`packages/client/src/net.ts`、`packages/client/src/main.ts`、`packages/client/index.html`、`scripts/font-subset/used-chars.json`（census）
- TEMP/flashp-domfix（verify-h04 / probe-id12 / repro+dbg 脚本）即用即清；探针断言逻辑以本档 §门禁 为准（同 0.3.33 先例）
