# 11 号档 · 网络同步优化与对拍量具收紧（netopt 槽）

> 一句话：**服务器出站 patch 率 20Hz→60Hz（ForestRoom `setPatchRate(1000/60)`，带宽实测 2 人局每客户端 60Hz≈2.0-2.9KB/s，为 20Hz 的 ×2.8-3.0，帧均 34-52B，量级可忽略）；A/B 取证判定：mechTarget（lead25/rate30）在 60Hz patch 下全面改善无需重调（自转段 rms 6.77°→1.55°、冻结 3→1 帧），但 self 角色 dead-reckoning lead50 原为抵消 20Hz 半周期陈旧所设、60Hz 下反成前冲震荡（rms 3.00→5.85px）→ 最小修 lead 50→17ms（=收敛滞后 16.67·(1−k)/k，rate 不动），修后 rms 0.16px；oracle-gold 比对落地采样对齐 alignShift=1（oracle[k+1]≡kernel[k]），实证发现（a）系统性一帧错位项消除（forest_01 位置叶中位 4.8px→0.0001/0/0.027/0，零偏差帧 0→353/2367）、（b）内核 win 帧与 oracle WIN 差 96 帧主要是 oracle 终幕边界（win 后门内收拢动画 96 帧，expected f2368 起恒 tuck=(1056,196)）而非行为性时长偏移、（c）任务前提"对齐后可收紧"在 max 叶被证伪——旧 max 恰处 ±1 采样相位的幸运侧，无偏重定 tolerance 25→30 / 173→177（数值放宽 5/4px，量具语义收紧）。runner 全网 6/6 PASS ×2 逐字一致、v1 四关 maxDev 0 不变、负测试 guard 拒绝。e2e 门禁 forest_01/04/12 repeat3 --offset -15 全过。**
>
> - 日期：2026-10-18（netopt 槽）
> - 前情：10 号档 §5 挂账（后续 1=对齐收紧、后续 2=setPatchRate 网络候选）+ 09 号档 §采样对齐
> - 交付：`packages/server/src/rooms/ForestRoom.ts`（patch 率）+ `packages/client/src/scenes/GameScene.ts`（self lead 单常量）+ `scripts/e2e/oracle/goldcollect.mjs`/`scripts/e2e/routetool/fixture-runner.mjs`（对齐量具）+ 两 oracle-gold case meta/expected tolerance 重定

---

## 0. 结论速览

| 步 | 判定 |
|---|---|
| STEP1 patch 率 60Hz | 落地（`setPatchRate(1000/60)`，FW_PATCH_MS 可回退）；带宽 2 人局 ×2.8-3.0 ≈ +1.3~+1.9KB/s/客户端，无风险 |
| STEP2 60Hz 平滑校验 | mechTarget **无需重调**（全指标改善）；self 角色层**一处最小修**（lead 50→17，rms 5.85→0.16px）；other 角色不调（自行改善） |
| STEP3 对齐收紧 | alignShift=1 落地；**系统性错位项归零 + 终幕边界发现**；tolerance 按同法 max×1.24 重定 25→30 / 173→177（诚实放宽，前提证伪见 §3.3） |
| 门禁 | runner 6/6 PASS ×2、v1 maxDev 0、--update guard 拒绝；route.mjs forest_01/04/12 repeat3 --offset -15 ALL PASS |

## 1. STEP1 · 出站 patch 率 20→60Hz

### 1.1 API 核对（Colyseus 0.16.0）

- `node_modules/@colyseus/core/build/Room.js` L49 `DEFAULT_PATCH_RATE = 1e3/20`、L86 构造默认赋值；L209-223 `patchRate` 访问器：setter 清旧 `#_patchInterval` 后 `setInterval(() => this.broadcastPatch(), ms)` 重建；L357-361 `setPatchRate(ms)` = `this.patchRate = ms` 的 deprecated 薄壳（`__init()` 在 onCreate 前已装好访问器 → onCreate 内调用有效，清 50ms 旧 interval 起 16.67ms 新 interval）。broadcastPatch 无变化不发包。
- Node `setInterval` 对非整数 delay 截断取整（16.6667→16ms 标称 62.5Hz），实际出站率被「有变化才发」钳回 ≈58-59 帧/s（实测 §1.2）；与 60Hz 模拟 tick 的 ±拍频是离散同步的固有现象（§2.2）。
- `FW_PATCH_MS` 环境变量（缺省 1000/60）：取证对照/回退钩子（=50 复现旧 20Hz 出站），沿 FW_* 惯例。

### 1.2 带宽实测（2 人局，双 Node 客户端 colyseus.js，WS 层计数）

口径：双客户端进真实服务器房间，started+2s 起 12s 计量窗，双角色按确定时间表左右交替按住（往返跑动，patch 占空比 ≈96%）；计数=ws message payload 字节（permessage-deflate 两端均未启用 → 应用 payload≈线上字节，另注 +8B/帧 ws 帧头估计列）。A/B 各自独立服务器实例（FW_PATCH_MS=50 vs 缺省）。

| 关卡 | patch 率 | 帧/s | KB/s/客户端 | 含帧头 KB/s |
|---|---|---|---|---|
| forest_01 | 60Hz | 58.66 | **1.95** | 2.41 |
| forest_01 | 20Hz | 19.67 | **0.657** | 0.81 |
| forest_12 | 60Hz | 58.25 | **2.86** | 3.31 |
| forest_12 | 20Hz | 19.66 | **1.01** | 1.16 |

- 字数结构：帧均字节 60Hz 与 20Hz 同关近乎相同（forest_01：34.0B vs 34.2B；forest_12：50.3B vs 52.4B——增量字段集合相同，3 tick 聚合只增大数值不增字段；f12 偏大因实体更多）→ 总字节比≈帧数比=×2.8-3.0。
- 客户端解析无错无状态异常：双端解码 colyseus.js schema 全程零异常、终态 phase=started、双端玩家坐标逐字节一致、机制 Map 尺寸正确（探针 sanity 字段）。
- 真机冒烟=e2e 门禁（§4，3 关 ×3 轮真实浏览器+真实服务器全 PASS）。

## 2. STEP2 · 60Hz patch 下客户端平滑校验

### 2.1 量具（ab2 rig，模型显式化）

10 号档 ab-page 的 `patchVal = q[floor(nowMs·60/1000)]` 实为「schema 写入域」（≈60Hz 更新 + float floor 毛刺），非 20Hz patch 发送域——其"旧直贴"数字（rms 0.308°）远好于真 20Hz 域实况（本档 rig 实测 rms 4.11°）。v2 rig（TEMP/netopt/rotcheck/ab2-page.html，已随 TEMP 清理，公式在此存档）：patch 发送=墙钟网格 `g_j=j·(1000/patchHz)`，客户端在 `[g_j, g_{j+1})` 见到最近一次 schema 写入（`t_i≤g_j`，t=实录 dt 累积）的量化值；render 泵=理想 60fps（`nowMs=f·1000/60`）与 10 号档同泵。网格滑帧（floor 毛刺）是双 60Hz 时钟拍频的最小模型——真实系统 16ms patch interval × 16.67ms rAF 同样产生 0/1/2-tick 渲染步，见 §2.2 判据修正。

数据源：mech=final-b.json oracle 实录 θ 流（184 帧，自转段=|真值步幅|>1.5°/帧 连续区间 f75-140 共 66 帧）；char=内核 fixed-60 回放 forest_01/main 路线 2366 帧（running/jump/fall 全程，schema 0.1px 量化入模）。帧本地参照取渲染网格（理想 60fps 重采样）段内峰值步幅 3.734°/帧（rig 存档 truthSpinMaxStepDeg），「至多漏一拍」上界=2×3.734=7.47°；10 号档判据引用的 3.808°/帧 是原始 oracle 流峰值步幅（f82→f83，重采样到渲染网格后为 3.734°）。

### 2.2 mech（mechTarget lead25/rate30）：无需重调

| 指标（自转段 f75-140） | 20Hz patch 直贴 | 20Hz patch mechTarget | 60Hz patch 直贴 | **60Hz patch mechTarget** |
|---|---|---|---|---|
| 渲染角 rms | 6.87° | 6.77° | 2.59° | **1.55°** |
| 冻结帧 | 45 | 3 | 23 | **1** |
| maxStep | 11.12° | 6.38° | 7.33° | 7.13° |
| 全流 rms / bias | 4.11° / −2.32° | 4.05° / −2.42° | 1.55° / −0.77° | **0.93° / −0.03°** |

判据修正（诚实记录）：任务判据 "maxStep ≤ 单真值步幅 3.808°" 在**任何**离散 patch 域都不可能恒达——patch 网格与 rAF 泵是两台不同源的 ~60Hz 钟，滑帧拍频使偶发 0 步帧后必跟一个 2-tick 步（直贴参照在 60Hz 域同样 7.33°≈2×3.734°）。按"至多漏一拍"口径：60Hz+mechTarget maxStep 7.13° ≤ 2×真值步幅 7.47° ✓，且较 20Hz 域 11.12°（3-tick 聚合）大幅改善；rms/冻结全面改善，**lead25/rate30 不动**。残留 1 个冻结帧=单次网格滑帧事件（rig 噪声底，非算法属性）。

### 2.3 char（dead-reckoning）：self 一处最小修

| 指标（x 叶，2372 帧，px） | 20Hz direct | 20Hz self | 20Hz other | 60Hz direct | 60Hz self（修前） | 60Hz other | 60Hz self（修后 lead17） |
|---|---|---|---|---|---|---|---|
| rms | 3.92 | 3.00 | 6.14 | **0.027** | 5.85 | 3.11 | **0.16** |
| bias（渲染−真值） | −0.41 | +0.40 | −0.84 | +0.004 | +0.81 | −0.42 | **−0.01** |
| maxOver / maxUnder | 9.63/9.82 | 8.69/6.26 | 10.94/10.92 | 0.05/0.05 | 9.49/9.33 | 6.01/6.01 | 1.93/1.91 |

- 机制：self lead50ms 原为抵消 20Hz patch 半周期陈旧锯齿；60Hz 下快照零陈旧，50ms 成纯前冲偏置，且 rate40（k=0.487/帧）对拍频 0/2-tick 目标抖动透过率过高 → rms 恶化 ×1.95。other（lead25/rate20，k=0.283）更软，60Hz 下自行改善，**不调**。
- 网格扫描（TEMP/netopt/rotcheck/ab2-run.mjs selfScan，lead∈{0,10,17,20,25,33,50}×rate∈{20,30,40,60}）：60Hz 下 rms 最优三元组 (10,60)=0.092 / (17,40)=0.162 / (25,30)=0.200，共同规律 **lead ≈ 收敛滞后 16.67·(1−k)/k**（偏置归零条件）。
- 最小修（3e72433，仅 1 常量）：self lead 50→**17**（rate 40 保持"本机贴手"响应度；17.6ms=rate40 的滞后抵消值）；对 20Hz 回退口径（FW_PATCH_MS=50）self rms 3.0→3.3px 同级可接受。位置：updatePlayers 死算平滑块（非动画配置区）；与 animcheck 槽同文件并行改动按 hunk 分离提交。

## 3. STEP3 · oracle-gold 采样对齐（alignShift=1）

### 3.1 实现

- `goldcollect.mjs --compare --align-shift N`（缺省 0=原行为）：内核帧 k ↔ oracle 样本 k+N；新增逐叶残差统计（tolerance 定值口径=位置叶 max 显式化）。
- `fixture-runner.mjs meta.alignShift`（缺省 0，v1 零波及）：内核帧 k ↔ expected 帧 k+shift，按帧号 Map 精确配对；头部 shift 帧（oracle Step 前初值样本）无内核对应帧，跳过；尾部 oracle 独有帧由 outcomeWindowF 语义承认（长度差不另报）。
- **终端帧对不比**（对齐模式）：内核终态帧（won/dead）的 expected 对应帧 k+1 已越过 oracle 终幕边界（§3.2），内核不回放该段；终端态本身在 k−1↔s(k) 对中已比对，结局由 outcome 叶（status 精确+窗口）断言。timeout 结局无终幕边界不跳。

### 3.2 终幕边界（新发现，修正 06/09 号档一处归因）

forest_01 expected 帧流 f2368 起恒为 tuck=(1056,196)（fb 门内收拢位；wg 同帧起 (1168,196)）：oracle WIN mark @f2463 前 96 帧是「双角色进门后的收拢动画+门序」，物理已定格（实测 f2367=末个静立帧 fb=(1078.32,156.54)，f2368 起全为 tuck）。内核终前帧 f2366 对齐对应 s2367（进门静立），残差处全片中位量级（≈0.05px）——两引擎物理面在通关时刻几乎逐位同相；内核 won 终帧 f2367 对齐后对应 s2368（tuck 首帧），该终端对不比（内核不回放终幕动画）。**故 96 帧差主要是 oracle 终幕延迟，非"跑速/门序行为性时长偏移 ≈4%"**（06/09 号档归因修正；两关 |Δ| 恒 96：f01 2463−2367、f26 1593−1497，=终幕段长即证）。outcomeWindowF=128 数值照旧成立（status 精确、|96|≤128）。

### 3.3 残差重算与 tolerance 重定（前提部分证伪，诚实记录）

对齐把比对搬到「同步数状态」上：forest_01 位置叶中位 4.8px→**0.0001/0/0.027/0**（fb.x/y, wg.x/y）、全分量中位 16.0→0.0497px、零偏差帧 0→**353/2367**；forest_26 全分量中位 16.6→9.72px。但 tolerance 受 max 叶支配，而 max 帧（瞬态行为散差峰）处 ±1 采样相位翻转贡献 ±1 tick 相对运动：

| 关卡 | shift0 max（旧口径定值） | 对齐 max（新口径） | ×1.24 → 新 tolerance | 旧 tolerance |
|---|---|---|---|---|
| forest_01/oracle-gold | 20.171（wg.x@f1890） | **24.536**（wg.x@f1890） | round(24.536×1.24)=**30** | 25 |
| forest_26/oracle-gold | 138.351（wg.x@f1224，09 号档复现 ✓） | **142.688**（wg.x@f1225） | round(142.688×1.24)=**177** | 173 |

- **"对齐后可收紧"在 max 叶被证伪**：旧 shift0 峰值恰采到相位幸运侧（wg 在 f1890 向 −x 跑，朴素对齐少算一个 tick 的 4.4px；forest_26 同理 4.3px）；对齐口径的无偏 max 反而略大。诚实处置=按任务同法 max×1.24 重定（25→30 / 173→177，数值放宽 5/4px），meta.notes 记录新旧数值与依据；**量具语义实为收紧**（系统性错位项归零、中位归零级、353 帧逐位命中），tolerance 数值不再被采样相位噪声撑大。
- 余量公式统一为 ×1.24（任务口径；09 号档曾用 ×1.25）。
- 复算输入：gold 重建自 fixture expected+dtschedule（`--build-fixture` 机写链无舍入，所需区间逐位保真；shift0 复现 06/09 号档 max 逐位吻合=重建保真验证）。风相位恒定偏移与状态采样对齐正交（力读点口径不受影响，runner 仍 PHASE=0）。

### 3.4 验证

- runner 全量 **6/6 PASS** ×2 输出逐字一致：v1 四关 maxDev **0** 不变；oracle-gold maxDev 24.5357（tol 30）/ 142.6879（tol 177）。
- 负测试 `--filter oracle-gold --update` guard 拒绝 exit 1；expected.json sha256 前后不变（tolerance 字段精准文本替换，其余字节未动）。

## 4. e2e 门禁（服务器行为变更后的绿关）

route.mjs 真实服务器+双浏览器，`--repeat 3 --offset -15`（每轮独立服务器+浏览器实例），三门禁顺序在空闲机器上完成：

| 关卡 | 结果 |
|---|---|
| forest_01 | 3/3 PASS（winAt 39968/39473/39768ms） |
| forest_04 | 3/3 PASS（winAt 18473/18469/18463ms） |
| forest_12 | 3/3 PASS（winAt 13474/12998/13473ms） |

偶发取证（如实记录）：forest_01 首跑 round3 曾 FAIL——当时 animcheck 槽并行跑 playwright A/B（机器 5min load 4.52），输入抖动致 fb 卡在 (624.4,316.5) 中途未进门前（won=false；同跑 round1/2 正常 39586/39988ms）。空闲重跑（load ≈1.8）3/3 全过如上。判定为资源竞争性路线抖动而非 patch 率回归：同代码下 round1/2 全过、fb 卡点是跳跃时机未命中的典型路线失败形，且 60Hz patch 不改变输入→tick 语义。

## 5. 诚实边界

1. 带宽口径：2 人局 running 场景（patch 占空比 96%）；未测机关全激活（风车/转臂满速）场景——每激活实体再多 2-3 个变化字段，量级仍为字节级/帧，不改变结论；未测 10 人房（本项目 maxClients=2）。
2. ab2 rig 的网格滑帧是拍频的最小确定性模型（float floor 毛刺），真实系统为 16ms interval 截断+rAF 抖动+网络抖动，谱形同相但逐帧不同；1 帧级指标（冻结 0 vs 1）属 rig 噪声底。
3. self lead17 由 forest_01 路线扫描选定（单路线单角色 x 叶）；y 叶/其它关未单独扫描（同一滤波器数学，y 速度谱更小）。
4. oracle 终幕 tuck 段（96 帧）在 fixture 里是「物理定格的终幕动画」，对齐模式下不比对；若未来内核实现终幕动画，需重录 fixture 并另行定口径。
5. tolerance 25→30 / 173→177 为放宽：跑老内核版本的机器上该网仍绿（余量公式未变），但"25/173"数字不可再引用（对齐口径不可比）。
6. animcheck 槽与本项目并行改 GameScene.ts（dying 即藏身 hunk）：其改动未入本槽提交（hunk 分离），本槽 3e72433 仅含 lead hunk。
7. 取证工具（bw.mjs / ab2 rig / goldrebuild / tailinspect / recompute）在 TEMP/netopt/，收尾清理；全部公式与关键表已录本档。

## 6. 复现

> 以下命令引用的 `TEMP/netopt/*` 探针已按槽规随收尾清理（临时取证环境不复用、不入库）；公式与关键数字已全部录于上文 §1-§3 与 §2.1 rig 模型，本节留作方法结构备忘。tools/rotcheck 属 rotcheck 槽文件区，本槽未写入。

```bash
cd gyのFW
# STEP1 带宽 A/B（FW_PATCH_MS=50 vs 缺省；两客户端 Node 探针，公式 §1.2）
node TEMP/netopt/bw.mjs --patch-ms 16.6667 --level forest_01 --port 3591 --seconds 12
# STEP2 A/B（rig 公式 §2.1；输入 note/.../tools/rotcheck/final-b.json + 内核回放真值）
node --import tsx TEMP/netopt/rotcheck/chartruth.mjs && node TEMP/netopt/rotcheck/ab2-run.mjs
# STEP3 残差重算（gold 重建 + 对齐比对 + runner 三件套）
node TEMP/netopt/goldrebuild.mjs scripts/e2e/fixtures/forest_01/oracle-gold TEMP/netopt/gold-fixture-forest_01.json
node --import tsx scripts/e2e/oracle/goldcollect.mjs --compare --gold TEMP/netopt/gold-fixture-forest_01.json --align-shift 1
node --import tsx scripts/e2e/routetool/fixture-runner.mjs
node --import tsx scripts/e2e/routetool/fixture-runner.mjs --filter oracle-gold --update   # 必须拒绝
# 门禁
node scripts/e2e/route.mjs --level forest_01 --repeat 3 --offset -15 --port 3576
```

## 提交链

- 4ba8478 feat(server)：patch 率 60Hz（ForestRoom setPatchRate + FW_PATCH_MS）
- 9ff9c1d test(e2e)：oracle-gold 采样对齐 alignShift=1 + tolerance 25→30/173→177 + runner/goldcompare 扩展
- 3e72433 fix(client)：self dead-reckoning lead 50→17（hunk 与 animcheck 槽分离）
- 本档+handoff：见 git log

> 引用约定：文件行号以当前工作树为准；Colyseus 行号为 node_modules/colyseus@0.16.0 静态行号。
