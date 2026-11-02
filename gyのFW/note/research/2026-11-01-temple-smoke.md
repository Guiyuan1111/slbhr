# 三部 journey 冒烟 e2e（templesmoke）——选关 / 断言面 / 跑绿数字 / CI 取舍

- 槽位：fw-journey-3temples（2026-11-01，release/1.0-forest）
- 产物：`scripts/e2e/templesmoke.mjs`（新件）+ `.github/workflows/ci.yml`（追加 temple-smoke 作业）
- 定位：三部（C=crystal / E=elements / F=fairytales）游玩验收前的真浏览器管线扫盲——
  装载（`?level=` 深链）→ A 建房选火 / B 房码加入选水 → started → FORCE_DOORS 通关（won）
  → 活房间 advance → 下一关 started，三部各一轮，每轮 11 断言共 33。

## 1. 选关与理由（任务书「crystal_01」不存在，如实改选）

| 部 | 首关 | advance 后继 | 理由 |
| --- | --- | --- | --- |
| C | crystal_04 | crystal_14 | **crystal_01/02 不存在**（data/crystal/levels 仅 04–38；全仓 grep 零命中），任务书给的 crystal_01 无法执行；crystal_03 已终审 oracle 固有死关（05号档，wg 门双侧同构不可达）——避开；crystal_04 为自有最低编号实关卡，advance 后继按 data/crystal/temple.json 数组序即 crystal_14 |
| E | e_tutorial_water | ewater_1 | 同族教学关 e_tutorial_fire 已终审死关、门物理不可达（02号档：双门与出生区零物理通路，跳升 118.9 vs 需 160）——避开；water 庙教学关为同位替代（templeData.ts 2026-10-31 勘误路径 `e_tutorial_* → elements/<元素>` 同被覆盖）。**注意：e_tutorial_water 物理可通关性未经终审**，本冒烟只证 FORCE_DOORS 下 win/换关管线，物理通关归路线搜索线 |
| F | fairies_000 | fairies-12-dark | fairies-01 已终审死关（04号档 oracle 裁决：上层四道封顶+杆柱循环自锁）——避开；fairies_000（下划线，tutorials 目录）为 F 部教学关，与死关 fairies-01（连字符）不同文件；advance 后继按 fairytales temple.json 数组序自然落到 dark 关，顺带覆盖 dark 装载 |

选关几何探针（spawn/门位，kernel parseLevel 实测，探针件已删）：crystal_04 门在出生点下方
~550px（下行）；e_tutorial_water 门在右远端（fb 门高 192px，需平台链）；fairies_000 门高
928px（F 部杯/仙女机制攀升）——三者均为正规关卡结构，无出生即死区。

## 2. FORCE_DOORS 断言面

- 钩子语义（ForestRoom.ts:389–396，既有服务端测试钩子）：每 500ms 置双门 `isOpen=true`
  （模拟双角色站门内），驱动真实 25fps 扫帧 → frac≥21 → isUp → checkEnd win——区别于
  AUTO_WIN 直接注入 win 事件，win 判定路径全真。**角色坐标不参与**（物理 sensor 只在
  begin/end contact 改写 isOpen，角色不在门旁时钩子置位持续有效），故死关在钩子下也能通
  ——这正是选关仍避开已终审死关的原因：冒烟样本应代表验收实玩路径。
- 断言收口到 wire（页面内直读权威 state）：
  - 相位链：`phase started→won`（45s 闸）；
  - 站门/门到位字段：`players.fireboy.atDoor / watergirl.atDoor / doors.fbUp / doors.wgUp`
    全 true（defineTypes 漏注册类缺陷在此暴露，syncProbe 同族口径）；
  - 换关：双端 `__fwNextLevel` → levelId 回声 → started；房间码不变（席位保留）；
    权威时钟在新关已走字（timerMs>0）；
  - 全程 pageerror=0（browser-room 口径）。
- **started 为 ~1s 瞬态**（restartLevel：ready 2.0s → started → FORCE_DOORS ~1s 内再推
  won，tick 早退时钟冻结）：断言一律走相位链语义——started 或 won（won 只能从 started
  迁移而来，ForestRoom 相位机唯一通路）+ timerMs>0 证明 ready→started→活局链真实发生。
  断言全走权威 state 轮询（journey 语义），不写死 sleep。

## 3. 本地跑绿数字（禁编造，如实记）

- **最终版（相位链闸）：11/11 连续全绿**——全量 10 连跑 + CI 口径模拟（外部服 `--port 3699`
  + healthz 探活，照 ci.yml 步骤逐字）1 跑，均 ALL PASS 33/33。
- 修正前 v2（单点 started 断言）13 全量跑：10 绿 3 抖——①1 次本脚本活局断言与钩子自动
  通关竞态（fairies-12-dark 时钟冻结，设计缺陷已改）；②2 次 `TypeError: ... reading
  'duration'` pageerror（crystal 轮，**未定位**：栈捕获上线后 26+ 连跑零复现，客户端源码
  无 `.duration` 读点，嫌疑 Phaser 内部，JSON 留 800 字符栈待再发取证）；另有 1 次 20s
  started 闸超时（B 端 patch 停顿整窗错过 1s started 瞬态，即②所述瞬时语义修正动因）。
- 结果 JSON + 截图落 `scripts/e2e/out/`（gitignore 内）。

## 4. 发现（顺手记档）

- **CSP 打断 Playwright 字符串表达式门**：0.3.51 起 index.html `script-src 'self'` 无
  unsafe-eval，Playwright `waitForFunction/evaluate` 的【字符串表达式】走页面 eval，实测
  `EvalError: ...violates ... CSP`——journey.mjs 的字符串 stateGate 与 lib.mjs
  waitForStarted/roomState 在当前构建下已不可直接复用（0.3.51 前所写，此后未见复跑记录）。
  templesmoke.mjs 全函数化（值走 arg 传参）绕开，脚本头注已记。后续若复用 journey 场景需
  同样改造。

## 5. CI 取舍：**入 ci.yml**（temple-smoke 作业）

- 严格照 browser-room 既有模式：checkout→setup-node 22→npm ci→`playwright install
  --with-deps chromium`→build→后台起服（`FW_DEBUG_FORCE_DOORS=1`）+ healthz 探活→
  `node scripts/e2e/templesmoke.mjs --port 2567`。node 直跑、headless、零显示依赖。
- 加的理由：browser-room 只罩 forest_01 单关装载，三部新客户端视图/网络链（E 部条带选关、
  F 部仙女拖拽）此前无任何真浏览器门禁——0.3.51–0.3.55 浏览器全断潜伏五版的前车之鉴；
  FORCE_DOORS 通关为确定性机制（~1s 量级），非随机物理。
- 风险与对策：唯一已知偶发为上节② duration pageerror（≤2/28 全量跑，终版 11 连跑零复现）；
  真复现时结果 JSON 含栈，CI 产物可取证。取舍=保留 pageerror=0 硬闸不放松，假阳时按栈追。
- 提交纪律：本件只动 `scripts/e2e/templesmoke.mjs` / `.github/workflows/ci.yml` /
  本档卷三路径；测完停服、TEMP 探针件已清（servers 由脚本 OWN_SERVER 自杀服，外部服模拟
  路径手工杀干净并 ss 复核）。
