# 机器自动探索通关 MVP·实现级设计（02 号档）

> 2026-10-15 · auto-design 槽 · 上游：01 号档（可行性调研，混合路线定调）· 下游：auto-build 实施槽（照 §8 施工清单照单施工）。
> 性质：实现级设计 + forest_01 微原型验证。**本档不含全量实现**；实验脚本与结果收容同目录 `tools/`，全部数字为本机实测（内核 tsx 直载，口径同 01 号档 §2）。

## 0. 结论摘要（一句话版）

原语级分段 beam 搜索的三个核心假设全部过检：**①检查点评分函数有区分度**（E3：S0a 段 12 层 best 分数 −1996→+392 单调爬升，wg 子目标 d8 解锁后评分跳变 +1074 并收敛，机器自走位 96→1200 上 800 台；fb 子目标差一个 ~5 原语深组合未及命中——已精确定位为层深/跳线参数问题而非评分缺陷，§4.1/§9-1）；**②检查点断言全部可计算**（E1：9 段 ×146 条断言逐条给出取数路径且在已绿路线上按"组内同帧联合满足"语义全部命中，S0a@378 → S7@2365(WIN) 缝差 ≤1f）；**③鲁棒口径有内核侧基线**（E2：v38 绿路线 ±1f fatal **0/222**、±2f fatal **13/222**——较路线落盘时记录的 12 多 1，归因 10-15 保真审计平台链微修，±1f 验收线不受影响）。实施槽可照 §8 清单直接施工，待决项 6 条见 §9。

---

## 1. 模块划分与文件布局

### 1.1 布局

```
scripts/e2e/routetool/
  botcore.mjs            ← bot-revive 槽已入库（159afa5；导出面 NONE/S/S2/drive/toRouteDoc 实测与 §1.3 期望一致，验收命令已过）
  autosearch.mjs         ← auto-build 槽新增：搜索主程序（§1.2）
  checkpoints/
    forest_01.json       ← 检查点链（本档 §3 已验证版拷贝；其余关后续按同 schema 增补）
note/research/2026-10-autoplay/
  02-design-mvp.md       ← 本档
  tools/                 ← 设计期实验脚本 + 结果 JSON（§7），实施槽复用为验收工具
```

依赖方向：`autosearch.mjs → kernel.mjs（makeWorld）+ botcore.mjs（S 原语工厂、toRouteDoc）+ pool.mjs（ScanPool，鲁棒验收）`。不依赖 lib.mjs（那是真机 e2e 层）。

### 1.2 autosearch.mjs 输入/输出

```
node --import tsx scripts/e2e/routetool/autosearch.mjs \
  --level forest_01 --chain scripts/e2e/routetool/checkpoints/forest_01.json \
  --beam 24 --budget 8000 --segs 0-8 \
  --out scripts/e2e/inputs/routes/forest_01.auto.json
```

- **输入**：关卡 id；检查点链 JSON（§3 schema）；搜索参数（beam 宽/层深/evals 预算/段范围）。
- **输出 1（产线入口）**：routes JSON，`toRouteDoc` 同构 `{level, source, tickHz:60, totalFrames, fb:[{f,dir,type}], wg:[…]}`——直接进现有 optimize/validate/scan/route.mjs 链，零转换。
- **输出 2（搜索报告）**：`<out>.search.json`：每段层数/evals/逐层 best-score 曲线/路标解锁时间线/seam 校验结果/鲁棒项计数（inline 扰动 fatal、±1f 全量 fatal、±2f 计数）+ 失败语义工件（§6）。

### 1.3 对 botcore.mjs 的接口期望（bot-revive 槽交付物，本槽只消费）

```js
export const NONE;                          // {up:false,left:false,right:false}
export const S = {
  settle, wait, sleep, hold, goTo, jump, jumpDrift, jumpOnto, runJump, stand,
  // S2（bot4 实战件，按原样收编）：brakedHop, edgeDrop
};  // 每项为工厂: (…args) => ({ name, run(ctx)->input|null, done(ctx)->bool })
   // ctx = { stepF, me:{x,y,vx,vy,grounded}, other:{…同构}, w }（与 r05d 版本一致）
export function toRouteDoc(level, events, totalFrames, source);  // 事件表 → routes JSON
export function drive(w, programs, totalFrames, opts);           // 保留签名（定稿重放收集事件表用）
```

边界约定（为什么 autosearch 不用 drive 跑搜索内循环）：beam 需要逐帧做断言检查与路标解锁判定，drive 的日志/短路语义不便内插；搜索内循环自带 30 行 drive（E3 的 `evaluate()` 即蓝本，botcore 同序 run→done→step）。**事件表（按键沿）只有一处事实源**：候选定稿后用 botcore.drive 对定稿程序重放一次收集 events，再 toRouteDoc——搜索内循环不做沿检测，避免两套实现漂移。对 S 的依赖收敛为"工厂函数集合 + toRouteDoc"，接口面足够窄：若复活延期，autosearch 可先以本档 `tools/beam-seg.mjs` 里的最小 PRIMS（goTo/jump/runJump/jumpOnto/idle，已实测）内联过渡，不阻塞（R7）。

### 1.4 世界池选择论证：beam=进程内重放，鲁棒验收=ScanPool

| 方案 | 用于 | 论证（实测数字） |
|---|---|---|
| 进程内每候选全量重放 | beam 内循环 | 内核无状态克隆（world.ts 无 serialize，reset=重建 9.7ms 无优势，01 号档 §2.3-3）；确定性使"程序重放"绝对正确。E3 实测 S0a 12 层 1482 evals 单核 35s（重放 ≤700f），**不构成瓶颈**。live-worlds（每候选持独立 World 只进不退）可省前缀重放，但 beam 的候选淘汰使 World 不可回收、且程序可变性（子代=父代+1 原语）使"只进不退"需每子代 fork=重放前缀，省不了多少——**MVP 不做，列为实施槽可选优化** |
| ScanPool(7) 子进程池 | ±Nf 鲁棒验收、整关终验 | 天然任务并行（每扰动=一次独立整关回放），pool.mjs 现成。E2 实测 444 回跑 18s（**24.6 回跑/s**，与 01 号档 31/s 同量级）；子进程崩溃自动重启重派一次，鲁棒性已产线验证 |
| 自建 live-worlds 池 | 不做 | 见上行论证；01 号档实测 50 世界并行零惩罚、2.9MB/World 的数字保留给三阶段批量期（E3 检查点自动提取时的 GA 群体评估）再启用 |

多核 beam 分片（每核独立 beam、定期合并 top-K）留实施槽可选；MVP 单进程 + ScanPool 验收已满足 ≤1 核小时/关预算（§6）。

---

## 2. 总体架构（一层循环 + 两个判定器）

```
检查点链（人给，§3）
   │ 逐段
   ▼
beam 搜索器（进程内）          评分器 scoreOf()
  每层：对 beam 每节点，        = 路标解锁·1000 + 目标 5000+早达奖励
  平衡轮转选角色，               − shaping(下一未达路标, 权1; target, 权0.3)
  追加 1 条原语 → 重放评估 ───→  − 0.3·冻结帧 − 原语数 − 死亡·1e6
  精英保留 top-B + 程序签名去重
   │ 段目标达成 → 定稿 top-3
   ▼
seam 校验器（入场断言，不合格换种子/回滚）
   │ 全链通过
   ▼
定稿重放（botcore.drive）→ toRouteDoc → routes JSON
   ▼
鲁棒验收器（ScanPool）：inline 8 采样(段级) → ±1f 全量(整关, 门=fatal 0) → ±2f 计数(报告)
   │ 过门
   ▼
交付：routes JSON + 搜索报告（进现有产线 optimize/scan/route.mjs）
```

---

## 3. 检查点 schema 与 forest_01 全链

### 3.1 schema（`checkpoints/<level>.json`）

```jsonc
{
  "level": "forest_01",
  "assertKinds": { "<kind>": "<取数路径说明>" },   // 文档性，供人审
  "segments": [{
    "id": "S0a", "title": "底层东行大跳",
    "entry":    [ <assert>, … ],       // 入场状态断言：全组同帧为真才开始计段
    "waypoints": [ [ <assert>, … ], … ], // 稀疏路标（评分塑形用）：允许乱序满足，逐帧判联合满足取首帧
    "target":   [ <assert>, … ],       // 段目标：全组同帧为真 → 段过（早停）
    "horizonF": 700,                   // 段最长帧（超时=本候选冻结计分）
    "maxDepth": 16,                    // 本段层深上限（按段给，§4.2：跳跃型 16/机关型 8-12；E3 教训后新增字段）
    "primArgs": {                      // 可用原语子集 + 参数离散集（实施槽从 E3 VOCAB 落盘）
      "fb": { "goTo": [180,430,1180,250], "runJump": [[1,360],[-1,1170]], … },
      "wg": { … }
    },
    "robust": { "inlineSamples": 8, "scanD": 1, "fatalMax": 0 }
  }, …]
}
```

**断言 kind 全集与取数路径**（E1 已逐条验证可计算，`tools/chain-verify.json` 为证）：

| kind | 取数路径（`w`=World 实例） | 用于 |
|---|---|---|
| px / py / vx | `w.snapshotPlayer(role).{x,y,vx}` ∈ [min,max] | 位置窗（体心 px） |
| grounded | `w.players[role].feetContacts.length > 0` | 驻留/落地门 |
| alive | `!snapshotPlayer("fireboy").dying && !dead && watergirl 同` | 每段必带 |
| leverState | `w.mechSnapshot().levers[id].state === v` | 拉杆门控 |
| platY / platState | `w.mechSnapshot().platforms[id].{y,state}` | 平台位形（P0/P1） |
| pusherState | `w.mechSnapshot().pushers[id].state === v` | 按钮门控 |
| propX / propY | `w.mechSnapshot().props[id].{x,y}` | 箱位（推箱段） |
| atDoor / doorUp | `w.snapshotPlayer(role).atDoor` / `w.doors[<role 全名>].isUp` | 末段门控 |
| phaseWon | `w.phase === "won"` | 终局 |
| （可选）diamonds | step() 事件流 `type==="diamond"` 计数 | 加分项，不设门 |

三条语义规则（微原型踩坑后固定）：
1. **组内断言 = 同帧 AND**。逐断言独立首满足帧取 max ≠ 联合首满足帧（E1 实测 S4 wp1 偏差 282f），必须逐帧联合判定。
2. **waypoint 允许乱序满足**（绿路线 S2 实测 wp2 早于 wp1），评分取"已解锁个数"，不强制有序。
3. **waypoint/target 只在段入场后计数**（入场前满足的窗口不算解锁，防 platY 这类开局即真 的门控白送分数）。

### 3.2 forest_01 全链（已绿路线反推 + E1 验证版）

关卡解析事实（内核 `level.levers/pushers/platforms/boxes`，E1a 实测）：杠杆 l0@(304,640) group4 → 平台 id1@x96（P1，UP 顶 480/DOWN 顶 576）；按钮 b1@(352,480)、b0@(992,352) 均 group5 → 平台 id0@x1152（P0，UP 顶 384/DOWN 顶 480）；箱 x0 起于 (736,256)；门 fb(1056,192)/wg(1168,192)；出生 fb(96,896)/wg(96,768)；绿泥 3 条 liquidRuns。平台地形（瓦片解析）：640 廊 x0-544（东缘泥）、704 台 x544-1120（东段 x992-1120，其下 x800-992 为泥池）、672 檐 x544-608、800 台 x1152-1240、底层 896 全宽。**单跳净高实测 ~100-106px**（绿路线 fb f230 y861 → f260 y755）——800 台只能从底层接地满速起跳、净空 ~10px，属"跳线精敏"位。**绿路线 v38 全时间线**：f557 fb 过杆翻转（唯一 1 次杠杆事件）→ P1 沉底双乘 → 双竖井跳上 480 台 → wg 压 b1（f913-1140）P0 降 → fb 乘 P0 上（f~1050-1300）→ fb 跳西 352 板压 b0（f1343-1590）→ P0 降载 wg 上（f~1550-1700）→ wg 跳西 → 推箱西行落 352 层（f~1700-2000）→ 登西塔上顶层 → fb 门 f2319 → wg 门 f2365 WIN。开局（S0a）：fb 底层东行 f175 跳一（跨泥池上空）f230 落底层 x~1039 → f240 接地跳上 800 台西缘 f~265 → f~320 西跳落 704 台东段 f378 就位；wg 底层东行 f~340 起跳 f380 上 800 台。pusher 全事件 9 次（含两次无关脉冲 f839/f861、f1716/f1732——**过路误触不致死不免门，佐证评分不需要脉冲惩罚**）。

| 段 | 内容 | entry 要点 | target 要点 | horizonF | 绿路验证帧（entry→wp…→target） |
|---|---|---|---|---|---|
| S0a | 底层东行大跳：fb 底层→800 台→西跳上 704 台东段；wg 底层东行→跳上 800 台 | t=0 alive | fb[950-1120,648-690] grounded；wg[1150-1240,745-778] grounded | 700 | 0 → wp 370,378 → **378**（greenRef 310） |
| S0b | 西跳链回廊：双角色经 800→704→672→640 廊西行就位 | S0a.target | fb[260-560,598-618] wg[400-700,598-618] 双 grounded | 500 | 378 → wp 455,531 → **569**（greenRef 610） |
| S1 | fb 过杆翻转 l0 → P1 沉底 → fb 登 P1 贴西墙 | S0b.target | lever=1, plat1.y∈[586,600], fb[24-72,534-556] grounded, wg[140-280,598-618] | 300 | 569 → wp 569,616 → **685** |
| S2 | fb 竖井跳 480 台，wg 接位 P1 西墙 | S1.target | fb[160-360,435-465] grounded, wg[24-80,534-556] grounded, plat1 沉底 | 300 | 684 → wp 777,811,761 → **814** |
| S3 | wg 竖井跳 480 台并压 b1（P0 下行），fb 东行 512 廊候乘 | S2.target | wg[336-368,430-458] grounded, pusher1=1, fb[1000-1120,466-492] | 340 | 811 → wp 848,882,922 → **990** |
| S4 | P0 下行 fb 登乘升顶 → 跳西 352 板压 b0（P0 再降候 wg） | S3.target | fb[955-1012,306-326] grounded, pusher0=1, wg[1030-1120,466-492] | 420 | 990 → wp 993,1064,1219,1342 → **1343** |
| S5 | P0 载 wg 升顶 → wg 跳西，双上 288 板西行 | S4.target | fb[550-760,245-265] wg[750-900,245-265] 双 grounded | 420 | 1342 → wp 1534,1342,1678 → **1770** |
| S6 | 推箱西行落 352 层，登西塔上顶层 | S5.target | box[200-250,310-335], fb[180-360,60-185], wg[180-360,60-250] | 340 | 1770 → wp 1907,1829,1954 → **1997** |
| S7 | 顶层东行 → fb 门 → wg 门 → WIN | S6.target | `phaseWon` | 500 | 1997 → wp 2260,2268,2319 → **2365** |

机器可读全文：`tools/checkpoints-forest_01.json`（断言逐条带实测窗口）；E1 验证结论：**146/146 断言可计算、9/9 段在绿路线上按联合语义命中、相邻段缝差 ≤1f（如 S4 target 1343 / S5 entry 1342）**。窗口全部 ≥40px 宽（≥±1f 位移 ~5px 的 8 倍裕量），段缝天然抗 ±1f。

**数据纠偏（对 note/forest01-route.md）**：该笔记"拉杆 0.6s 冷却、冷却到期再翻转、W 额外两次空翻复位"描述的是旧复刻浏览器层行为；当前内核拉杆为原版直译（mechanisms.ts Lever.checkState 过零翻转，无冷却），绿路线实证：fb 过杆一次翻转后 state 恒 1，wg 反向穿越 x304（f~640）不再翻转、无空翻复位。**检查点链一律以内核回放为准，不以该笔记为准。**

---

## 4. 评分函数、beam 参数与鲁棒性项

### 4.1 段内评分（E3 已实测区分度）

```
score(候选程序对) =
  + 1000 × |已解锁 waypoint 数|                     // 逐帧联合判定，取首满足帧；乱序兼容
  + 目标达成 ? 5000 + 0.5×(horizonF − f_met) : 0    // 早停 + 早达奖励
  − shaping(下一未达 waypoint，权 1.0)               // Σ 断言 |v−窗口中心|；px 权 1，py 权 2
  − shaping(target，权 0.3)                          // 恒定弱牵引：无路标梯度的角色也有方向（防原地/反向）
  − 0.3 × f_freeze                                   // 时长惩罚（重放冻结帧）
  − 1 × (|fb 程序| + |wg 程序|)                      // 简洁性 tiebreak（事件少→扰动面小）
  − 1e6 × [死亡]                                     // 硬剪枝（全灭层软回退除外）
```

区分度实测（E3 最终版，S0a 段 beam24，层 best 分数）：−1996(d1)→−1339(d3)→−1187(d4)→−1114(d6)→−890(d7)→**+184(d8, wg 子目标解锁，评分跳变 +1074)**→+376(d9)→+392(d11)——12 层 evals 1482、单核 35s，无塌缩无投机乱跳；wg 侧完整走完"塑形逼近→解锁跳变→收敛"全循环（96→1200 上 800 台）。fb 子目标未及：最优谱系终态 fb=[1117,797]（空中冻结于 800 台西侧），差"底层 x~1040 接地满速起跳上 800 台（净空仅 ~10px，§3.2）→ 西跳 704 东段"的 ~5 原语深组合——全局层深上限 12 内未命中，**定性为层深/跳线参数问题（§9-1），非评分函数缺陷**（评分在 wg 侧已完整自证）。对照 microsearch（01 号档）5 层 163→1103 的纯距离塑形，路标解锁型评分在长段（700f）上不塌缩。踩坑记录：①时长惩罚会在早期层压过 shaping（d2 −1997 比 d1 −1996 低 1 分），属预期——单调性看"层 best 是否收敛向 0 上方"，不看逐层递增；②group 内逐断言独立判解锁会虚高（§3.1 规则 1）。

死亡层软回退：整层候选皆死时，保留死因最晚的 3 个候选（分量 −1e5+deathF）供 beam 绕行，并输出死因诊断（谁/死点/死帧）。E3 最终版全程无全灭层（死亡候选被 −1e6 自然淘汰即可），软回退保留为保险机制。

### 4.2 beam 参数

| 参数 | 取值 | 依据 |
|---|---|---|
| 宽度 B | 24（预算富余时 32） | microsearch 同宽已验；E3 24 宽 S0a 12 层 1482 evals ≈ 35s 单核 |
| 层深 | **按段给**（跳跃型段 ≤16，机关型段 8-12），或 target 达成早停 | E3 教训：全局 12 层截断了 S0a fb 的 ~5 原语深组合（§4.1/§9-1）；机关段实测 4-6 原语/角色 + 交替 = 8-12 层足够 |
| 分支 | 词表大小（8-12/角色） | primArgs 离散集（§3.1）；实测 10/角色 |
| 剪枝 | 死亡硬剪 + 程序签名去重 + 每角色深度上限（按层深比例给，如 fb 9/wg 8） | E3：去重省 ~50% 重复 evals；深度上限防单角色独大 |
| 扩展 | 平衡轮转（depth 差选角色）+ 精英保留（父代子代同池） | E3 踩坑：整层换血会把好父代挤掉 |
| 评估 | 每候选从 f0 全量重放（确定性），双角色队列并行 drive（botcore 同序 run→done→step） | §1.4 论证 |

### 4.3 鲁棒性项：±Nf 扰动 fatal 计数作为接受判据（具体算法）

目标函数含鲁棒项的原因（01 号档 §4.1）：内核 WIN ≠ 真机 PASS（CDP 0-5ms 抖动 + 1/315 的 40ms 离群 ≈ +2.4f 迟到）。**两阶段制**：

```
阶段一·段级 inline（轻量，搜索内完成）：
  段目标达成后，对 beam top-3 各取定稿程序，
  每个做 R=8 组随机扰动（每组：随机选 1 事件平移 ±1f），
  重放计 fatal 组数 k → 定稿分 score′ = score − 500k，取 score′ 最高者为段定稿。
  成本：3 候选 × 8 组 × 段长重放 ≈ 24 次短重放 ≈ 1-2s。

阶段二·整关 final（ScanPool 并行，产线口径）：
  全链定稿程序 → botcore.drive 重放收集事件表 → toRouteDoc → routes JSON；
  ① runKernel 基线复验 WIN（1 回放）；
  ② ±1f 全量扫描：每事件双方向各 1 次（N 事件=2N 回放；forest_01 111 事件=222 回放，7 核 ~9s）
     → 门：fatal == 0（MVP 验收线，v38 同口径；E2 实测 v38 恰为 0/222）；
  ③ ±2f 全量扫描 → 不设门，计数入报告（E2 基线 13/222=5.9%）。
  失败回炉：fatal>0 → 对 fatal 事件所属段以"score′ 再减 500×fatal"重搜（种子复用，预算减半）；
  两轮仍 >0 → 降级交付：接受 fatal ≤3 并在报告标注（v38 先例：±2f 残余 12-13 处为杠杆混沌区
  确定性死锁，不可全消——门设在 ±1f 正因如此）。
```

实施槽注意：ScanPool 的 job 就是 `(level, routeDoc)`（pool.mjs 现成接口），扰动生成复用 scan.mjs 的 clone+shift 逻辑（10 行），不改 scripts/ 现有文件。

---

## 5. 双角色处理：交替扩展为主，联合基因为备

**选择：交替扩展（每层给一个角色追加一条原语，另一角色并行执行其既有队列，队列空则待机）。**

论证（forest_01 实测耦合度，E1a 全时间线）：

| 段 | 跨角色关系 | 类型 |
|---|---|---|
| S0a-S1 | fb 过杆 → P1 沉底 → fb 登乘；wg 走位跟进 | 生产者-消费者（时序） |
| S2-S3 | fb 先过竖井，wg 接位 P1 再过；wg 压 b1 → P0 降 → fb 乘 | 时序 |
| S4-S5 | fb 压 b0 → P0 再降 → wg 乘 | 时序（互为对方按钮） |
| S6-S7 | 推箱/登塔/进门，角色各自动作无互锁 | 无耦合 |

**全链 0 处真同时耦合**（"A 必须在时刻 t 恰好做 X 同时 B 做 Y"）：绿路线里双角色看似并行的行走（如 f819-1013 fb 东行 ∥ wg 竖井跳）只是为省时间的交织，串行化后各段代价 +~100f，对鲁棒性无害（原语闭环按状态收敛，不依赖帧号）。交替扩展把分支因子从联合基因的 |F|×|W|（~100）压到 |F|+|W|（~10-20），E3 实测该模式下 wg 侧子目标完整解锁收敛、fb 侧推进到差一跳组合（§4.1）——耦合时序全部由"对方状态断言"表达，不需要帧级同步。

**备选（自动升级路径）**：交替模式在某段两轮预算内失败（层 best 不再改进）且死因诊断指向同步窗口（如"角色到位时平台已过位"），实施槽启用两个增强，按序尝试：
1. **wait 谓词原语**：`wait(pred)` 以跨角色/机关状态为完成条件（botcore 已有此形态：`wait(p3East)`），把它加进词表即表达"等机关/等队友到位"——大部分"伪同时"够用；
2. **联合基因模式**：每层追加 (fbPrim, wgPrim) 对，分支 |F|×|W|，beam 宽度减半补偿——只在段 spec 显式标记 `"joint": true` 时启用（首版不实现，列入 §9 待决）。

---

## 6. 停止判据与算力预算

| 层级 | 上限 | 失败语义（都是交付） |
|---|---|---|
| 单候选评估 | horizonF（300-700f） | 冻结计分，超时即低分自然淘汰 |
| 单段搜索 | evals ≤ 6000 或层深上限（按段，§4.2）无 target | "机器穷尽报告"：最高解锁路标、卡点断言（哪个窗口永假/远）、逐层曲线、死亡热区、耗散 evals——人工只看这一页就知道该加密路标还是扩词表/调层深（对应 §8 清单 7 的反馈回路） |
| 整关搜索 | 单核 ≤ 1h（01 号档 MVP 预算） | 已完成段的前缀 + 失败段报告落盘 `<out>.search.json`，下轮 `--segs k-8` 续搜 |
| 整关验收 | ±1f fatal=0 门 + 两轮回炉 | 降级交付：fatal≤3 + 标注；或负结果附录（"机器穷尽 X evals 仍 ±1f fatal>0"） |

实测预算锚点（本机）：E2 444 回跑/18s（7 核）；E3 S0a 单段 12 层 1482 evals/35s（单核，重放 ≤700f，42 evals/s）→ 全关 9 段粗估 1.2-2 万 evals ≈ 15-30 min 单核（后段前缀重放变长，单位 eval 变贵 2-4 倍已计入），**预算内余量 ≥2 倍**。

## 7. 微原型实验证据链（tools/）

| 文件 | 内容 | 结果 |
|---|---|---|
| `tools/checkpoints-forest_01.json` | 9 段检查点链（机器可读全文，S0a/S0b/S1-S7） | 本档 §3.2 的数据源 |
| `tools/verify-chain.mjs` → `chain-verify.json` | E1：绿路线逐帧联合求值全部断言 | 146/146 可计算，9/9 段命中，缝差 ≤1f，S7@2365=WIN |
| `tools/perturb.mjs` → `perturb-result.json` | E2：v38 ±1f/±2f 全量扰动（ScanPool 7 核 18s） | ±1f **0/222**；±2f **13/222**（fatalList 含 deathF 定位） |
| `tools/beam-seg.mjs` → `beam-seg-result.json` | E3：分段 beam（宽 24，交替扩展，评分 §4.1） | S0a 12 层 1482 evals/35s，层曲线见 §4.1；结果 JSON 含逐层 evals/分数/解锁数 |
| `tools/explore.mjs` → `tools/out/explore-trace.json` | E1a：绿路线回放时间线（位置/机关采样 + 事件表） | 本档 §3.2 走线事实的出处 |
| `tools/geom.mjs` | E1a：内核解析关卡实体坐标速查 | 本档 §3.2 机关/出生/门坐标与 §3 纠偏的出处 |

复现：`node --import tsx note/research/2026-10-autoplay/tools/<script>.mjs`（脚本以"向上找 package.json"定位仓库根，仓库内任意 cwd 可跑；E1 ≤20s、E2 18s、E3 35s）。

## 8. auto-build 施工清单（依赖序，照单施工）

| # | 任务 | 依赖 | 验收命令/判据 |
|---|---|---|---|
| 1 | ~~botcore.mjs 复活入库~~ **已由 bot-revive 槽完成（159afa5，2026-10-15 本档实测验收通过）** | — | `node --import tsx -e "import('./scripts/e2e/routetool/botcore.mjs').then(m=>console.log(!!m.S&&!!m.toRouteDoc))"` 真；S 含 §1.3 工厂集 ✓；对 r05d 版本 diff 仅去 TEMP 相对路径 ✓ |
| 2 | `checkpoints/forest_01.json` 落盘 | 1 无关，可先行 | 拷 `tools/checkpoints-forest_01.json` → routetool/checkpoints/；`node --import tsx tools/verify-chain.mjs <新路径>` 输出 9/9 OK |
| 3 | autosearch.mjs 骨架：chain 加载 + evaluate/scoreOf + 单段 beam（层深按段） | 1,2 | `node --import tsx scripts/e2e/routetool/autosearch.mjs --level forest_01 --segs 0 --beam 24`：S0a target 达成，evals ≤ 本档 E3×1.5（≈2200；若层深 12 仍不达，按 §9-1 加深至 16 并校准跳线参数） |
| 4 | 全链模式：种子传递 + seam 入场校验 + 失败段报告 | 3 | `--segs 0-8`：runKernel 复验 WIN；`<out>.search.json` 含 9 段曲线 |
| 5 | 定稿重放导出：botcore.drive 收事件表 → toRouteDoc → routes JSON | 4 | routes JSON 经 `scripts/e2e/routetool/validate.mjs --level forest_01` WIN；与搜索内循环终态同帧（确定性保证） |
| 6 | 鲁棒验收器：inline 8 采样（段级）+ ScanPool ±1f 全量（整关）+ 回炉一轮 | 5 | `scan.mjs <out> 1` fatal=0；±2f 计数入报告；回炉路径至少演练一次（人为放宽门） |
| 7 | 收尾：MVP 验收记录 + tools 两个验收脚本入册 | 6 | 验收（01 号档口径）：**forest_01 零人工重搜出 WIN 路线且过 scan ±1f fatal ≤ 个位数**；≤1 核小时 |

估算：3-6 共 ~1.5-2 人日（与 01 号档 §5 一致）；#1 已完成、无外部阻塞，#2 可先行。

## 9. 实施槽待决项（本槽不确定、明示不带过）

1. **S0a fb 子目标收尾（E3 遗留，已定位非评分缺陷）**：最优谱系停在差"底层 x~1040 接地满速跳上 800 台（净空仅 ~10px）→ 西跳 704 东段"的 ~5 原语深组合。实施槽按序试：层深按段加深（S0a →16，角色上限 fb9/wg8）→ 跳线参数加密（runJump line 以 20px 步进扫 980-1100；jumpOnto 的 aboveY 语义校准为"预计落点台面 py"）→ 仍不通则把绿路线该两跳的 (line,dir) 直接写进 primArgs（退半步，仍省其余编排）。
2. **S6-S7 的词表与路标密度**：E3 只实搜了 S0a；S6（推箱）/S7（进门）断言已验证可计算，但推箱原语（push 方向持续接触）不在 botcore S/S2 里，实施槽需按 bot-f02 谓词风格补一个 `push(dir, untilPropX)` 或用 hold+goTo 组合实测。
3. **段缝的精确定格语义**：微原型 seam 校验用"种子程序演化中出现过入场态"的宽松口径；实施槽应改为"段定稿时持有终态（S,M）直接断言 entry"，若 top-3 全不过则回滚上一段换种子——回滚深度（3→5？）待实测。
4. **live-worlds 前缀复用**是否值得做（§1.4 暂缓）：若全关 evals 实测超预算 2 倍再启用，预期省前缀重放 ~40%。
5. **联合基因模式的触发阈**（§5 备选 2）：建议"同段两轮预算失败 + 死因指向同步窗口"才启用；阈值本身待真遇到再定。
6. **±2f 的 13 处 fatal 是否回炉**：E2 已定位到事件级（fb#6@f315 双向、fb#15@f640+2、wg#15@f706+2 等，见 perturb-result.json fatalList）；v38 时代记录 12 处且判"确定性死锁不可全消"，多出的 1 处（疑 10-15 保真审计平台链微修所致）实施槽可顺带核一眼是否新可修。

## 10. 风险与回退

| # | 风险 | 征兆 | 回退路径 |
|---|---|---|---|
| R1 | 评分局部极值（卡墙绕圈，microsearch 已观察过投机跳跃） | 层 best 长期不解锁、位置徘徊 | waypoint 加密/段分裂（链细化）；shaping 权重再平衡；时长惩罚降权 |
| R2 | 词表不完备（某段物理上可达但词表组合不可达） | "全灭/超时层"死因集中且死点固定；或最优谱系终态距目标窗口恒定一小段（E3 S0a fb 即此弱形式：差一跳组合，§4.1） | 先核机制再扩词表（教训：曾疑"原版二段跳新机制"，轨迹复核后证伪——f240 为接地跳，实为净空 ~10px 的跳线精敏）；primArgs 扩参（goTo 目标加密、runJump line 扫描、jumpOnto 语义校准）；收编 botcore S2（brakedHop/edgeDrop）；仍不通→该段人工给一条种子程序（退半步，仍省帧级编排） |
| R3 | 段缝漂移（上段定稿态在下段不可延续） | seam 校验失败率上升 | 换种子（top-3→top-5）→ 上段加鲁棒重搜 → 链窗口放宽 ±20px |
| R4 | 时长惩罚与鲁棒冲突（越短事件越密越脆） | inline 扰动 fatal 集中在最短候选 | score′ 的 500/fatal 权重上调；或对短候选加事件密度惩罚 |
| R5 | 算力超预算 | 段 evals 撞 6000 上限 | 硬停+负结果交付（§6）；beam 分片多核（可选）；live-worlds（§9-3） |
| R6 | 内核再修致基线漂移（本次实测 ±2f 12→13 即实例） | scan 门突然不过 | tools/perturb.mjs 随时可复测；验收线锚 ±1f=0（当前成立）；内核修复以 det 门禁为准不回退 |
| R7 | botcore 接口不符（已入库，残留风险仅"后续改动破坏 §1.3 面"） | #1 验收转不过 | autosearch 先内联 tools/beam-seg.mjs 的最小 PRIMS（接口窄，§1.3）；toRouteDoc 用 r05d 版本直接拷（17 行） |
| R8 | 搜索产出与产线格式微妙不兼容 | validate/scan 对 auto 路线报格式错 | 事件表唯一事实源=定稿 botcore.drive 重放（§1.3），杜绝手拼事件表；对照 v38 diff tickHz/totalFrames 字段 |

---

## 附：本档实测数字口径

环境同 01 号档 §2（i5-13400F 8 vCPU VM、node v22.22.1、tsx 直载内核、仓库根 cwd）。所有 evals/s、fatal 计数、层曲线出自 `tools/` 六个脚本当次运行输出，结果 JSON 随档收容可复核；脚本以"向上找 package.json"定位仓库根，仓库内任意 cwd 可跑（收容时已在 `tools/` 位置实测：verify-chain/explore/geom 全部复跑通过）。数字不确定项：E3 层曲线对 beam 宽度/权重/层深敏感（同配置可复现，改配置需重测）；E2 的 ±2f 13 与路线 source 记录 12 的差 1 已归因未实证（内核今日 907ba54/72c2bd0/7024dd5 三修动平台/hanging/箱旋转链，forest_01 仅平台链相关）。
