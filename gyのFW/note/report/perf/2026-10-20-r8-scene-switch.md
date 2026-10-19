# r8 · 客户端场景切换链（点击→Game 激活延迟）

> 2026-10-20 · r8 实施轮（r0–r7 七轮战役后续，方法论沿用：测量先行→证伪→杠杆→门禁→一件一 commit）。
> 焦点：点击「创建/加入」→ GameScene 激活的**用户可感延迟**。此面从未单独开轮
> （r5 只覆盖冷启→Menu；r6a 记录了"驻留后点击→Game 409ms"但未剖析）。
> commit 链：`3313403`（量具：perf-scene.mjs+快照+tools/perfopt8）→ 本件（实施：件1–4）。
> 红线贯穿：det 48/48 + fixtures 6/6 + vitest 89/89 + tsc 零输出 + e2e f01 repeat3 ALL PASS
> + visual-diff 同带 + perf-client 冒烟（update p50/setDepth/分配带全维持）。

## 〇、一句话总账

**点击→Game 激活（驻留暖装落定口径，同机同夜配对 5 轮中位）551.1→490.6ms（-11.0%；8 轮复测 510.7，-7.3%）**，
其中连接窗三段机制性改进：**ws+state→level 起 109.7→55.4ms（-49.5%）、level 拉取 43.9→10.3ms（-76.5%）、
level→menu 隐 50.6→3.4ms（-93.3%）**；剩余大头（matchmake 段与 create 段）经三组隔离实验判为
**环境噪声+点击派发管线成本，与改动无关**（§四）。附带产出：暖装驻留判定勘误（量具口径洞）、
换肤性能税归档（幕布 backdrop-filter + floaty 无限动画 = 连接窗 +364ms/55%，pre-skin worktree A/B 实证）、
连接忙期画布冻结方案（sleep/wake 双路兜底，视觉静止观感零变更）。

## 一、剖析（量具先行，三次翻案）

### 1.1 新量具 perf-scene.mjs

页内探针（addInitScript 零产品侵入）：fetch 包装打点、`#menu` MutationObserver（menuHidden）、
`__fw.scene.isActive('Game')` 2ms 轮询（gameActive）、PerformanceObserver resource 时序
（matchmake 用 resource 时序——覆盖 fetch/XHR 双通道）；`--prof` 附 CDP CPU 剖析
（click→gameActive 窗口，500µs 采样）；`--cold` 冷路径档（Menu active 后立即点击，模拟邀请深链/极速建房）；
缺省驻留档等暖装落定（对齐 r5 409ms 口径）。快照 `results/scene-<label>.json`。

### 1.2 首轮归因：换肤性能税（石板大厅幕布）

首跑（驻留判定带洞，见 §四勘误）HEAD=1019.4ms 中位。CPU profile（click→gameActive 窗）：
`(program)` ≈834ms、**texImage2D ≈214ms**、drawImage ≈82ms、GC ≈11ms——原生纹理上传与合成主导。
CSS 注入 A/B（3 轮中位，零产品改动）：

| 形态 | click→Game | 差 |
|---|---|---|
| baseline（HEAD） | 1082.7ms | — |
| 幕布 blur 关 | 826.6ms | **-256ms** |
| logo floaty 关 | 982.3ms | -100ms |
| 双关 | 798.3ms | -284ms |

**pre-skin worktree A/B**（a444d3a 检出独立构建，同机同夜同量具）：**655.8ms vs HEAD 1019.4ms
——换肤净增 ~364ms/+55%**。机理：`#menu` 的 `backdrop-filter: blur(1.5px)` 盖在 60fps 动画的
Phaser 画布上，无 GPU 合成环境（headless SwiftShader/弱机）逐帧重算模糊，拥塞主线程拖慢连接窗内
全部 fetch 派发（服务端本身极快：curl 实测 matchmake 1.3–5.2ms、/api/level 2.6–6.9ms）。
关掉 blur/floaty 后仍剩 ~800ms 的差距 vs r5 409ms 判为跨日环境漂移（战役纪律：时长类跨日不可直比）。

### 1.3 服务端排除

curl 直打（全新 tsx 服）：POST /matchmake 1.3–5.2ms ×3、GET /api/level 2.6–6.9ms ×2、
temple.json 3.3ms——**浏览器侧测到的 130–330ms 全非服务端成本**。

## 二、实施（件1–4，一件 commit 内四件同门禁）

| 件 | 改动 | 机制 |
|---|---|---|
| 件1 | **连接忙期画布冻结**：setBusy(true)→`phaser.loop.sleep()`+`body.fw-busy`（CSS 暂停 floaty）；唤醒双路兜底（enterGame 在 bgWarmSettled 前 wake + setBusy(false) wake，wake 幂等） | sleep 停 update+render→幕布下画布静止→blur 区域整帧不再重算；DOM spinner 保留活动指示。**wake 位置勘误**：初版 wake 在 enterGame 顶部，实测"唤醒税"（积压合成一次性结账）插进 fetch 段拖慢 level 拉取（130.6→334.1ms），下移到 bgWarmSettled 前后消除——waitForLevelId/fetchLevel 均网络任务驱动不依赖帧循环，而 Loader 队列处理挂场景 UPDATE（Phaser LoaderPlugin.loadComplete 链源码核实），必须 await 前醒 |
| 件2 | net.ts `waitForLevelId` 50ms 轮询→事件驱动（onStateChange 首见 levelId 放行等待者；超时返回 "" 语义不变） | 旧轮询平均 +25ms/最坏 +50ms |
| 件3 | temple.json 页面级单例（新 templeData.ts）：bindUi 预取；enterGame 的 await 恒命中；GameScene.fetchTempleTime 改用单例 | 旧路径同文件三处各自 fetch+parse（enterGame 关键路径 ~30ms + 每次 create 重复一次） |
| 件4 | `fetchLevel` 客户端缓存（Map<id,Promise>，失败逐出可重试） | 同关重进（离房再建/深链重复进出）零重复拉取；LevelData 全场景只读（遍历消费）无共享突变风险 |

视觉契约：件1 只在"连接中"瞬态冻结（spinner 仍在），静止观感零变更；ID/DOM 契约零触碰。

## 三、数字（同机同夜配对，缺省驻留暖装落定口径）

### 3.1 配对 A/B（中位 ms）

| 段 | before2（stash 配对构建） | after（5 轮） | after（8 轮复测） | Δ |
|---|---|---|---|---|
| **click→Game 激活（总）** | **551.1** | **490.6** | **510.7** | **-11.0% / -7.3%** |
| click→matchmake 应答 | 175.2 | 236.0 | 267.2 | 噪声（§四.2） |
| matchmake→level 起（ws+state） | 109.7 | 55.4 | 56.0 | **-49.5%** |
| level 拉取（api+图块集） | 43.9 | 10.3 | 10.8 | **-76.5%** |
| level→menu 隐 | 50.6 | 3.4 | 3.5 | **-93.3%** |
| menu 隐→Game 激活（create） | 157.1 | 175.6 | 185.2 | +11.8%~17.9%（噪声带内，见 §四.3） |

机制性三段合计 204.2→69.1ms（**-66%**）。交错复跑（3 轮 × 2 组）：before 584.7/615.4 vs
after 591.7/524.2——机器噪声带 ±60–90ms（VM 时段负载），总时长读数以 5–8 轮中位 + 分段机制归因为准。

### 3.2 门禁（全绿）

tsc 零输出；vitest 89/89；build PASS；**det 48/48（锚 r0-baseline）+ fixtures 6/6**（物理零触碰，
逐件复跑背书）；e2e f01 repeat1 + repeat3 ALL PASS（winAt 39992ms 带）；visual-diff
after {88.66×2, 90.08} vs before 构建同夜 90.17——同带（idle 相位噪声 ±1.5，历史 91.97 为白昼窗，
交接已有环境漂移存疑记录；sleep 只存在于连接窗，截图帧在开局后，无机制性影响）；
perf-client：canvas 60.6fps、update p50 0.2ms、setDepth=0（r3 不变量维持）、分配 1130KB/s（r3 带 1114–1124）。

## 四、勘误与口径（本轮两次自纠）

### 4.1 量具驻留判定洞（首跑 1019.4ms 的口径污染）

首版驻留判定 = "300ms 无新资源完成"。洞：暖装启动（MenuScene create+120ms delayedCall）后、
**首个暖装资源完成前**的静默窗会被误判为落定（GroundAssets.png 1.3MB 本地传输+解码期间
PerformanceObserver 零新条目）——warm-net.mjs 实证暖装确实在跑（2.5s 窗内 14 暖装类请求），
warm-debug.mjs 实证误判窗存在。后果：click 落在暖装中途，bgWarmSettled 把暖装尾巴计入
menuHidden→gameActive 段（631.7ms 假读数）。**修正**：驻留判定加 `__fw.textures.exists("ground")`
（暖装四图集首键）+300ms 静默双条件；修正后 before 重测 551.1（stash 配对构建）。
教训入方法论：**"无事件"≠"已落定"，驻留判定必须锚定目标批次完成证据**。

### 4.2 matchmake 段噪声归因（三组隔离实验）

- 全新服务器×单次建房（mm-isolate.mjs）：POST ttfb 48–70ms（queue/dns/tcp ≈0）——非连接复用/派发排队；
- 同页手动 fetch POST（sleep-fetch.mjs，绕开点击与产品逻辑）：**awake 中位 3.5ms（含一次 203.8ms 离群）/ asleep 中位 3.6ms（2.2–4.0 紧带）——sleep 无副作用且消离群**；
- 结论：量具测得的 click→matchmake 130–330ms 双峰（{124–153 | 246–326}）= Playwright 点击派发/
  Chromium 输入管线（含 blur 合成下 hit-test）+ 基准进程内房间累积（每轮留 60s 重连等待房）+ VM 时段噪声；
  该段 before 基线波动带 63–232ms 同样宽，**非改动回归**。真实用户侧点击→handler 的管线成本为
  两态共有（sleep 在 handler 内才发生），不进配对差分。

### 4.3 create 段 +12%~18%

menuHidden→gameActive 157→176/185ms：该段含 wake 后的一次性合成补账（幕布移除+场景首帧），
与场景切换本就要付的合成同窗发生；波动幅度（±30ms）在机器噪声带内，无机制性恶化证据
（CPU profile 段内结构不变：texImage2D 主导）。挂账：若后续轮次复测持续 >200ms 再剖析。

### 4.4 换肤性能税归档（未在本轮修复的部分）

幕布 blur+floaty 的静态成本仍存在于**非连接窗**（Menu 驻留期 idle 合成、Temple 选关期）——
这正是 r9（空闲 CPU/功耗面）的剖析对象。连接窗的冻结只回收连接期部分；驻留期归属 r9 处置。

## 五、剩余候选（r9 起）

- **r9：空闲 CPU/功耗面**——Menu/Temple 驻留期 blur+floaty 的逐帧合成、后台标签 forceSetTimeOut
  保活循环的功耗、GameScene 静止期渲染（r7r 已判 JS 面地板，合成面待量）；
- matchmake 段的输入管线成本（两态共有）：CDP 输入注入 vs 真人点击的等价性未验，低优先；
- create 段 buildGround 首次合成（CPU profile 中 drawImage ≈82ms 窗口内）——暖装期预合成候选，r9 一并量。

## 六、复现

```bash
node --import tsx benchmark/perf-scene.mjs --runs 5 --save <label>        # 驻留档（缺省）
node --import tsx benchmark/perf-scene.mjs --cold --runs 5                # 冷路径档（深链/极速）
node --import tsx benchmark/perf-scene.mjs --no-build --compare r8-before2
node --import tsx benchmark/perf-determinism.mjs --compare r0-baseline    # 48/48
node --import tsx scripts/e2e/routetool/fixture-runner.mjs               # 6/6
node scripts/e2e/route.mjs --level forest_01 --repeat 3 --offset -15
# 剖析工具归档：note/report/perf/tools/perfopt8/{css-ab,mm-isolate,sleep-fetch,warm-net}.mjs
```
