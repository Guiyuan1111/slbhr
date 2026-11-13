# ice_02 I4 收官档卷（2026-11-01，槽 fw-route-ice02b，wave7-wave16 共 60+ 配方实证）

状态：**未解（诚实判负）**。ice_02 链仍 4/5（I0-I3 solved）。I4 双人过闸在「hold-to-reset 正确窗口模型」下逼近到 **2-6f** 的结构刀锋，但所有参数邻域均被三重混沌耦合（池缘擦碰/帐篷卡位/落点漂移）封死，不构成确定性可复放路线。按任务纪律不出造假路线，本档为终态判负档卷。

## 0. 先导勘误（重要，影响后续所有 ice 关卡）

04号档 §2「落板=首次按压注册+~390f 一次性首压」**模型错误**。正确语义（内核源码+行为探针双证）：

- **内核=hold-to-reset**（与 02号档 oracle 实证同构）：`packages/shared/src/kernel/mechanisms.ts:1326-1353` — TimedPusher.checkState：按压期（joint f>0）**每帧 `timerElapsedMs=0`**（原版 timer.stop().start() 注释在源），闸门永不落；完全离开后计时 `timeMs`（4000ms=**240f**@60fps）到时 state 0 → 落闸；再压 re-arm（H3 探针实证）。
- **行为探针**（tools/out/ice02-i4/sem.*.csv，配方 v-semprobe.json）：
  - H1 压住不放：press 1600，至 2463+（850f+）闸门不落（fallF=-1）✓
  - H2 压 100f 后西离：中心过 1136（板顶面 [1152,1184] 与身体 32px 宽的分离线）≈f1776-1790，落闸起始 f2015 → **K=240f（离开→落闸）** ✓
  - H3 离开→回踩→再离：re-arm + 重新压住 ✓
- **通行窗口 = 末次离开 + 264f**（240f 落闸 + 24-32f 闸底压到头顶；operational 用 +24，实测临界 +28-32）。
- 04号档 §2 旧测「+282f」实为「触板(空中擦过)+约42f身体-clearance 滞后→离开+240」的合成；「+390f」= 压板+~150f 走离+240。全部旧观测兼容新模型。

## 1. 机制补实测（wave7-16 新增）

- **站台→内室唯一落点=闸门槽**（x288-420，槽底 feet≈169，低于内室地 160）:所有路线（旧缺口跳/新唇跳）最终都落槽 x302±10，随后 1-3f 内滑过闸面。
- **唇跳机制**：波浪路东臂在 x≈420-421 处断崖（下接槽）；rj(-1,430) 在 425-421 走完 walkTo 后于崖沿起跳（f0 guard ~2f），弧顶 y≈54，飞行 ~34f，漂移 ~118px（含全程左压空控 ~2.8px/f²）。
- **滑过闸面临界**：落槽后以 ~300px/s 西滑，闸底（platY+48，1.1px/f 下行）压到头高（center−35≈99）即封；即**落槽须发生在落闸起始后 ≤~20f（或之前）**。
- **全动词 holdF 为死旋钮**：runJump 的 holdF（跳跃冲量固定）在 7 组对照中逐帧零差异（wave7 C19-30、U1/U7、U2/U3/U10、Y1-Y5）。「上压保持」不影响弹道。
- **冰面材质**：西坡板区属 '2' 斜瓦冰区 → **fb 加速、wg 减速**（角色物理非对称，wg 过坡段 board→graze 114f vs fb 90f，纯角色差异，无动词可调）。
- **内室地板（门板）高摩擦**：步行 ~11-40px/s，门条 fb[64,96]/wg[168,200]@y162-166，需 center∈(48,112)/(152,216) 才有感应重叠。

## 2. 窗口账本（正确模型下的终局数字）

- 预算：末次离开→过闸面（center≤272）≤ **264f**。
- **fb 最优路线（v28 台沿跳出口 Z8/H6/M1 类）：262-266f ≈ 预算 100%±2%**，配 ±3-5f 求解器耦合噪声 → 不确定可赢。
- **wg 路线：314-319f，超 52f**。分解（G3 实测）：clear→board 70f + board→graze **114f**（fb 90f，冰拖物理）+ graze→mound 50f + mound→shaft 82f。任何出口（旧 chute-jump 319f / v28 台沿跳 316f）、任何板驻留（dawdle 平移不变量）都不变。
- **锚架构枚举（穷尽）**：
  1. fb 自锚（wg 先行快过）：fb 自身 route≈budget 边缘（M1/H6 差 2-6f 被闸封）。
  2. wg 锚（板驻留 dawdle，G3/G4 实证架构可行：fall 精确跟随 wg 离开）：**fb 完全穿过**（G3/G4：wp2@2064、wp3@2100、endX 48——已到内室门条边缘！）但 wg 自锚时自身 route 316>264 被 52f 物理墙封死（endX 302 楔死）。
  3. wg 自锚不可行；fb 锚 wg 需 wg_route≤264 不可行。

## 3. 最优配方存档（复现入口）

- **M1（fb 差 4-6f 最优链）** v-wave16.json `M1-ml645-w425-d116`：
  - fb `[sleep,90],[walkTo,1,940,999],[runJump,1,1000,25],[walkTo,-1,1136,20],[runJump,-1,1134,28],[runJump,-1,645,25],[walkTo,-1,425,999],[runJump,-1,430,25],[hold,-1,55],[walkTo,-1,116,60],[sleep,40]`
  - wg `[sleep,0],[walkTo,1,940,999],[runJump,1,1000,19],[walkTo,-1,1095,90],[runJump,-1,1095,25],[runJump,-1,645,25],[walkTo,-1,425,999],[runJump,-1,430,25],[walkTo,-1,184,60],[sleep,40]`（**wg 侧已完全解**：shaft 1866、门条 182、在其窗内余 90f）
  - 实测：fb graze 650（池缘 +25px 安全）、mound 484、落槽 1952-54 vs 落闸封头 1948-1956 → 楔 302。
- **G3（fb 过闸实证架构）** v-wave13.json `G3-wgD200`：wg 板驻留 sleep 200 + v28 出口，fall=2066 精确锚定 wg 离开；fb 落槽 2062、穿闸面 ~2064-2085、wp3(100-240)@2100、endX 48。唯 wg 自身 2142>2090 楔死。
- 逐帧证据：tools/out/ice02-i4/{sem.*,w13.G3-wgD200,w16.M1-*}.csv；全 115 跑汇总 sweep-results-all-115runs.csv。

## 4. 混沌耦合地图（为什么调参不可达）

| 上游 ±1 拨动 | 下游响应 | 实证 |
|---|---|---|
| 出口走速/线 ±2-6px（board 落点 ±5px） | **池缘擦碰 ±35px 非单调** | H6 board913→rim650 活 / H3 board917→rim596 死 / K1 board918→rim615 死 |
| mound-jump 线 645→655（+10） | mound 落点 484→507（+23px）→ 帐篷卡位(496,269) | M1 vs M2-M6 |
| 出口 crawl 缩短（-12f） | mound 落点 +21px 东（+13-18f 爬行）全数奉还 | Z8 vs H6 |
| approach 线 1000→980 | rim 650→615-624 全灭 | H6 vs K1-K5 |

生还带：池缘擦碰 rim∈[~624,655]、mound∈[~455,480]、闸缝 ±2-6f——三带交集为空集（在已扫 60+ 配方内）。

## 5. 已证伪路线类（不再重试）

1. **超级弧**（rj-860 板上大弧越池）：发射速度被板着陆杀灭（着陆 vx≈15px/s），R 波 496-503 全短；wg v29 566 死。
2. **梁→row-9 跳板捷径**（跳过塔/板）：row-9 实体底 320 封头顶（jump rise 不可用）。
3. **holdF 系参数**：死旋钮（见 §1）。
4. **出口 crawl 回收**：被 mound 耦合精确奉还（§4）。
5. **锚架构互换**：wg 52f 角色物理墙（§2）。
6. **二段压板回窗**：站台→内室单向拓扑，过闸后无回路。

## 6. 复现命令

```
# 单配方评测（带逐帧 AS_DBG）
SWEEP_FRAMES=<dir> node --import tsx note/research/2026-10-autoplay/tools/sweep-ice02-i4.mjs <variants.json> --csv out.csv
# 变体库
note/research/2026-10-autoplay/tools/out/ice02-i4/v-*.json
# 前缀：note/research/2026-10-autoplay/tools/checkpoints-ice_02.json segments[4]；search 前缀见 tools/out/ice_02.autosearch.search.json segs[3]（I3 endF=1369）
```

## 7. 复攻入口（按性价比）

1. **机制参数面**（04号档 §6.3 同款）：oracle 副本实验证 `timeMs` 缩放→窗口迁移（4000→5600ms 即 +96f，两端角色同时解）。若上游 chain 允许机制 override，此为唯一低成本解锁；原件保真链内无解。
2. **新路线类**：需要「wg 坡段提速」或「fb 槽前提前 ≥8f」的未知机制（14 波未发现）。
3. **换关**：ice_02 保持 4/5，能力位 6（帧级链）转 ice_03+（管线 LEVELS_DIRS 已含 data/ice/levels/）。

## 8. 关键文件

- 本档卷证据：`tools/out/ice02-i4/`（探针帧 CSV ×5 + 115 跑汇总 + 变体库 ×3）
- 批评测驱动：`tools/sweep-ice02-i4.mjs`（自 TEMP/fw-ri2-1/sweep1.mjs 收容；evalchild 子进程隔离 + AS_DBG=I4 AS_DBG_MOD=2 逐帧解析 + 事件检测 TSV/CSV）
- 前档卷：04-ice02-i4-gate.md（其 §2 窗口律以本档 §0 勘误为准）
- oracle 侧：note/evidence/2026-10-25-ice-temple/02号档-oracle-ice_02.md（B2 槽，hold-to-reset 语义对表一致）
- 内核源：packages/shared/src/kernel/mechanisms.ts:1264-1354（只读）
