# ice_03 收容档卷：西屋上升系统鲁棒性地板（2026-11-12，槽 fw-route-ice03）

> **【收容档，非路线】** 本档**不是** ice_03 通关路线，也**不构成**任何反事实副本实验；它是 fw-route-ice03 槽的 blocked 收容：全链 kernel WIN 已实证、但西屋上升段鲁棒性钉死在 ~10% 单点位移致命率，未达路线 JSON 门禁（exjob 全零 + route-node 3/3 PASS），故**不出路线**。路线 JSON 从未提交（`scripts/e2e/inputs/routes/ice_03.json` 收尾时删除，见 §7）。所有数字来自本槽实测（evalchild 单进程 BATCH=1 / 真 drive / route-node 真服），探测件全部串行运行。

状态：**blocked（收容）**。G1 门满分；G2 六轮架构迭代后在 7-11% 致命率震荡、无收敛迹象；G3 未在 G2 新种子上重解；真服 route-node 0/3。唯一瓶颈 = **G2 西屋上升系统**，其余全链（推镜三冻、东上链、双门）均已解。

## 0. 结论速览

| 断言 | 判定 | 关键数字 |
|---|---|---|
| ice_03 全链 kernel 可 WIN（三段链） | **成立**（v6 链实证） | endF=4725 双门 atDoor+isUp，毒免疫 holdF=24 |
| G1 盆地西涉+推镜三冻 ±1f 鲁棒 | **成立** | exjob 门 **0/86** PASS，endF=907 |
| G2 西屋上升 ±1f 鲁棒 | **不成立（卡点）** | v14 最优仍 **12/112** fatal（10.7%）；六轮 7-11% 震荡 |
| 致命签名收敛于单一吸引子 | **成立** | 12/12 终态西侧低滞：11× (48,809) + 1× (48,618) |
| v6 全链真服可过 route-node | **不成立** | 2026-11-11 **0/1**；2026-11-12 复测 **0/3**（run3 fb[304,258] wg[696,750] 中途滞留） |
| 服务器滑帧使单事件脆弱即全局脆弱 | **成立**（v7 实测沿用） | 意图跨度 +4ms deadline（ForestRoom.ts:703），60/2060 帧输入错位 |

## 1. 全链状态与门禁判定

链定义：`note/research/2026-10-autoplay/tools/checkpoints-ice_03.json`（segments[0..2] = G1/G2/G3）；运行态：`note/research/2026-10-autoplay/tools/out/ice03/state-ice03.json`。驱动件：`note/research/2026-10-autoplay/tools/drive-ice03.mjs`（复用 `scripts/e2e/routetool/autosearch.mjs` evalchild 协议，只读 import，零改动 routetool/packages）。

| 段 | 判定 | 证据 |
|---|---|---|
| G1 盆地西涉+推镜分级驻留三冻（v8） | **solved + exjob 门 PASS** | 0/86 全存活，endF=907，wg 钉 556 / puck 槽 576.3 |
| G2 wg 西屋上升系统（v14） | **solved（met）但门 FAIL** | metAt=1136 endF=2043 wg[638,540]；exjob 12/112 fatal |
| G3 wg 东上链 + fb 顶路东渡（v5，stale） | **stale——未在 v14 种子上重解** | 旧链 endF=4725 ex 9/1942（fb#114/115@3266±1 → fb 滞 (760,477)） |
| 真服 route-node（v6 全链） | **FAIL** | 2026-11-11 0/1；2026-11-12 `node --import tsx scripts/e2e/route-node.mjs --level ice_03 --repeat 3` → **0/3**，日志 `scripts/e2e/out/route-results-node.json` |

G3 累积制说明：G3 程序 = G2 定稿全程序 + G3 后缀。G2 定稿从 v6 换为 v14 即种子整体失效，G3 必须重解——在 G2 未过门前无意义，故本槽停在被阻塞段。

## 2. G2 致命机制：单一吸引子，双入口

v14 exjob 门 12 fatal 全签名（wg 事件 ±1f，`state-ice03.json` segs[1].exWhy）：

```
wg#40@886+  wg#41@907-  wg#44@909-  wg#45@910+   ← 立跳#1 入口（entryF=907 前后）
wg#46@1311+ wg#47@1432- wg#48@1432+ wg#49@1435-  ← 中屋梯入口（峰东跳/下降沿事件群）
wg#50@1439- wg#51@1439- wg#53@1464+ wg#54@1483-
终态：11× fb[80,157] wg[48,809]；1× wg#45 → wg[48,618]
```

- **吸引子 (48,809)**：西屋低处楼梯下台阶（板 x[160,224] 顶 800 西端以西）。凡是立跳#1 起跳相位差 → 楔峰 (96,544) 尖角落点 ±20-45px 失败、或中屋梯任一跳 ±1f 失败，wg 均回落西低地并被楼梯台阶钉死，永不再达 G2 目标窗 (600-640,520-560)。
- **入口 A（立跳#1，f886-910）**：jumpDrift(1,0,24) 自西楔 (150-230,690-790) 起跳。落点为楔峰尖角——几何上无平台宽度可锚（v13 逐级锚定已把前 1600f 压到 ±4px，立跳落点敏感是尖角结构性的，锚定无法消除）。
- **入口 B（中屋梯，f1311-1483）**：峰东跳→480-slope→(224,512) 折角→512-mid 段的事件群。任一 ±1f 失败同样回落西低地。
- 两入口汇入同一吸引子 ⇒ 事件级鲁棒率 ≈ (1−p₁)(1−p₂)… 连乘，只要每跳脆率 ~2-3%（与服务器滑帧率同量级），6+ 跳连乘即 ~10-20%——**架构性，非参数性**。

## 3. 架构迭代谱系（全部 exjob 实测）

| 版本 | 架构 | exjob 门 | 备注 |
|---|---|---|---|
| v8 sweep | park78/hf36 双参 12 cand | 17/102（16.7%） | park90/hf24 18/94 |
| v10 | jumpOnto(1,770) 登板 | — | **证伪**：板西半处于 640檐 x[64,192] 顶 640 下 → prohibitJump 置位 → wrapped-jd 无限上试永滞 (189,764)（真身 drive 复现 idxEnd=25） |
| v11 直上 | 板→runJump 东跳→登 B冰 | — | 18 cand 全钉 (334.5,619) 凹坑：跳弧越不过 (352,576) 墙角 + jumpOnto 被三角下腹 pj 禁跳，架构废弃 |
| v12 | 显式锚 544-mid 立跳越三角 | 18/186（9.7%） | 致命点=斜坡端 (320,544) 滑射出短坠冻池凹坑 |
| v13 | 逐台阶 walkTo 锚定+sleep3 硬零 | 15/206（7.3%） | pr20 对拍实锤：下降 4 连落为噪声放大器，逐级锚后 f1600 处 ±4px |
| v14 | 刃角去险：跳前 sleep 沉降+顶跳 hf36 深落 mid 平段 | 12/112（10.7%） | 7-11% 地板震荡，无收敛迹象 |

exjob 方法：本段新增事件跨度（≥前段 endF−30）每事件 ±1f 双向、8 事件/child 串行、`requireMet` 终态判定，cap 12 fatal。数字均出自 `drive-ice03.mjs --gate 2`。

## 4. 关键机制发现（复活必需）

1. **drive() 每帧每角色只推进一个原语**（`scripts/e2e/routetool/botcore.mjs` ~251 行：`const step = prog[idx[role]]; if (!step) continue; ... if (d) idx[role]++`）——无 done 链连进。手工探测件若 done 即连进必与真身分歧；**evalchild 与真 drive 是唯一真值**。
2. **wrapTap 毒化共享 NONE**（v5 破案，沿用于全链）：autosearch wrapTap 对返回共享 NONE 的原语写 `inp.up=true` 会毒化 botcore 模块级 NONE ⇒ 毒免疫纪律：jumpDrift holdF 只用 24 或 ≥900。
3. **expandFlat 语义**（`scripts/e2e/routetool/kernel.mjs` :102）：边沿事件 → 电平保持输入，同帧 up 先于 down；route 消费端同式——±1f 实验必须走 expandFlat，不得逐帧孤立键。
4. **prohibitJump 顶限**：raycast 轨迹天花板检查，阈值介于 57px（板陷阱 pj=1）与 82px（楼梯 pin pj=1）净空之间；jd 被禁 ⇒ jumped 置位一次、air 永假 ⇒ 永滞。
5. **ice_03 零机关**：`node --import tsx scripts/e2e/routetool/geom.mjs --level ice_03 --mech` → `"winds": []`，无平台/箱/球/机构；风机械存在于 `packages/shared/src/kernel/mechanisms.ts` :697 但本关未用。跳跃满弹道升程 ~123px（v²/2g≈3.84m，jumpVelocity=15.5，g=31.25）。
6. **服务器滑帧**：意图跨度 +4ms deadline（ForestRoom.ts:703），~2-3% 事件/run 随机 +1f 滑帧 ⇒ route-node 需全事件 ±1f 鲁棒，单点 ~2-3% 脆率的全链必挂（v7 实测 60/2060 帧错位）。

## 5. 复活点

唯一瓶颈是 G2。复活路径（纪律不变：BATCH=1、probe 串行、`--maxminutes 30`、逐件 wip commit、禁 co-author、禁 push）：

1. **G2 重构方向**（未探）：西柱 x[0,32] 顶 704→384 直上链；立跳#1 拆两级矮跳；sleep 对齐楔峰落点窗口后重新 exjob。已证伪勿重试：jumpOnto 登板（pj 永滞）、板顶直跳 B冰（墙角+pj 双堵）、544-mid 显式锚（滑射凹坑）。
2. `node --import tsx note/research/2026-10-autoplay/tools/drive-ice03.mjs --solve 2`（换新架构 cands，见 checkpoints segments[1]）；exjob 0 fatal 后 `--solve 3`（种子自动取 state.segs[1].final）。
3. `--gate 1 --gate 2 --gate 3` 全 0 fatal → `--finalize` → `node --import tsx scripts/e2e/route-node.mjs --level ice_03 --repeat 3` 全 PASS，才准提交 `scripts/e2e/inputs/routes/ice_03.json`。
4. 全部判定数字以当时实测为准，禁止预写门禁结论（drive-ice03.mjs finalize 描述串已按此修订，commit 504da03）。

## 6. 处置记录（收尾自查）

- `scripts/e2e/inputs/routes/ice_03.json`：untracked，内容 = 旧 v6 全链（totalFrames=4728，fb 680/wg 1380 事件）——**未过门禁，收尾删除**，不按有效姿态留存；复活后 `--finalize` 可再生。
- 已提交（perf/r44，无 co-author，禁 push）：checkpoints v8→v14 全轮 wip + 收容 archive 块（29c211c）、finalize 描述串修复（504da03）、`tools/out/ice03/state-ice03.json`（G1/G2/G3 运行态含全 exjob 签名）。
- 本槽探测件与运行垃圾清于 `TEMP/fw-route-ice03/`（TEMP/ gitignore 内）、`/tmp/drive-ice03-*.json`、`/tmp/pr20-fin-*.json`、`TEMP/server-dump-1.jsonl`、`TEMP/fw-route-ice03/kernel-trace.json`。
- 本档引用文件全路径：`note/research/2026-10-autoplay/tools/checkpoints-ice_03.json`、`note/research/2026-10-autoplay/tools/out/ice03/state-ice03.json`、`note/research/2026-10-autoplay/tools/drive-ice03.mjs`、`scripts/e2e/out/route-results-node.json`、`scripts/e2e/routetool/{botcore,kernel,autosearch,geom}.mjs`、`packages/shared/src/kernel/mechanisms.ts`。
