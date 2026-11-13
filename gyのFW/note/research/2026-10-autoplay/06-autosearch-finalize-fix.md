# 06 · autosearch 定稿管线三修（fw-autosearch-fix 槽）

- 日期：2026-11-01；分支 `release/1.0-forest`；文件域：`scripts/e2e/routetool/autosearch.mjs` + 配套单测
- 任务源：[02号档-e_tutorial_fire.md §5](../../evidence/2026-10-31-route-samples/02号档-e_tutorial_fire.md) 移交项 a/b/c（工具债三笔）
- 结论：**a/c 实修完成并经 E0 实战回归验收——E0/E1 定稿 seam 双双首次通过（12 轮假败史终结）；b 系链侧 v5.1 已解**。残留失败=配方族头部 ±1f 物理脆性（穷举Fatal=1），明确非三修范围，如实记档。

## 1. a/b/c 现状审计（动手前判定）

| 项 | 判定 | 证据 |
|---|---|---|
| a) trim 应保留带刹车 done 的驻留件（goTo/walkTo） | **未解** | finalizeSegment 修剪阶梯纯按 metIdx 构建（原 1573-1579 行），无驻留件感知；R3 换种子回退同样裸剪（原 1807 行）。crystal_03 线的 3fbbb6a/989ac21/e17e5b2 均为逐段词表侧代偿（尾件换 goTo/walkTo），非通用修复；0a0f227 的 finPass 直传与 6c6b803 的 beam 摊平是定稿池问题，不覆盖修剪本身 |
| b) 动态平台载荷缓沉需行程窗断言 | **已解（链侧 v5.1）** | 37c87b8（2026-10-26）：checkpoints-e_tutorial_fire.json E0/E1 的 platY id0 窗=[884,956]（含缓沉底态，实测行程 848→944）；SEGE E1 recipe waitPlat(0,900,956)。工具侧 compileGroup platY（autosearch.mjs:96）与 waitPlat（:232）本就吃 min/max 窗，无需改 |
| c) --evalchild 进程隔离应覆盖 beam 内环 | **主体已解（10-29 批）** | 95c8393（逐 eval 子进程）→ 3b7cd6e（批量分块 EVAL_BATCH，autosearch.mjs:1213/1455-1457 beam 内环）→ 4d6ddc9（robjob）→ fa38b72（v12d seam/穷举 childSeamEval/childExhaustive）。02号档成文（10-26）早于该批，移交时点成立、现已过时。**残留缺口**：finalizeSegment 的 drive 重放 replayEvents 仍在父进程——本次 E0 回归实测 12 met 层×8 节点×4 级 ≈380 父进程世界 ≫ 泄漏阈值 ~20，事件表在泄漏区产出后再喂 exjob 干净子进程=基线漂移（本次收口，见 §2-③） |

## 2. 实修内容（autosearch.mjs，行号为修后）

1. **驻留件地板 dwellFloorOf**（:1552-1567，纯函数+导出）：程序末个 goTo/walkTo（done 自带刹车+grounded=零出力泊位）之后即修剪下界；holdLev 状态门件不计入（完成后锁存方向键恰是 e17e5b2 病灶）。应用于 finalizeSegment 修剪阶梯（:1612-1619，首剪=[max(mi,lo)]，无驻留件时 max() 无感、浅→深阶梯与去重语义不变）与 R3 换种子回退（:1861）。
2. **PRIM_TABLE.goTo 完成帧零出力包装**（:142-153）：S.goTo 内部 cur 有 3 帧更新门，done 判据满足帧 run 仍可能回行进方向键——队列恰在该帧排干即被锁存，slick 面滑行出泊位窗。包装=本帧将 done 先行判定直接回 NONE（done 只读 ctx 快照；evaluate 与 drive 同走本表零漂移）。**回归暴露**：首跑 try[5,1] 已全保留 goTo 仍 `end-state-evaporated fb[730]→[642,802]`——只修 trim 不修完成帧锁存，驻留语义不闭合。
3. **finalize drive 重放下沉 finjob 子进程**（childFinReplay :1266-1276、finalize 调用 :1626-1629、child 分支 :1729-1735）：evalchild 下 finalize 重试父进程世界数超阈值的 (c) 残留面收口；下沉后搜索+定稿全程父进程零 makeWorld，导出终验重放成为父进程仅存世界（~1-2 个）。batchEvalChild 注记同步勘正。
4. **主循环 CLI 直跑判据**（:1770-1773）：argv[1] 指向本文件才执行搜索主循环；import 侧只装载词表/纯函数供单测（top-level 主循环不再裸跑）。

不改动：SEGC/SEGE/SEGI/SEG/SEGF 配方块一字未动（SEGC 静态核验 0 个 goTo，纯 sleep/hold/holdLev/jd/rj/walkTo）；checkpoints-*.json、routes/**、kernel.mjs/botcore.mjs 均只读。

## 3. 验收数字

- **单测**：`node --import tsx --test scripts/e2e/routetool/autosearch.test.mjs` → 4/4 pass（dwellFloorOf 三语义 + goTo 完成帧零出力）。vitest include 只收 packages/**（本件不入该门禁）；`npx vitest run` → **64 文件 479 例全绿**（修前修后各跑一遍同值）。
- **E0 实战回归**（`--level e_tutorial_fire --chain checkpoints-e_tutorial_fire.json --beam 24 --budget 6000 --segs 0-1 --samples 10 --maxminutes 30 --evalchild`，out/report 重定向 TEMP 不触存档）：
  - 修前首跑（仅地板，无 goTo 包装/finjob）：12 层全 met（metAt=382，fb 驻留 730,797）但定稿全灭——try[5,1]（地板已保 goTo）仍 `end-state-evaporated fb[642,802]`，R3 回退耗尽，0/2 段，evals=1589，wall=220s。
  - 修后终跑：**E0 定稿 trim=[5,2] seamEntry@382 seam ok=true（grace 0）**；**E1 定稿 trim=[5,7] seamEntry@520 seam ok=true**（E1 d1 recipe 即 met，wg 终 [842,804]）；2/2 段解，evals=5893，wall=1759s。定稿重放「未胜」属预期（4 段链只搜前 2 段，不入库 route）。
  - 历史症状「E0 段内 met=true 但定稿 trim/seam 必败（12 轮全灭）」**不复现**：定稿管线不再因 trim 裁驻留件/进程漂移假败。
- **crystal_03 冒烟**（`--segs 0-1 --beam 8 --budget 400 --samples 4`，重定向 TEMP）：C0 定稿 trim=[7,7] 穷举Fatal=0 seam→C1 entry@230；C1 定稿 trim=[9,9] 穷举Fatal=0 seam→C2 entry@47；2/2 段解，evals=90，wall=60s——机械无回归（finjob 为纯下沉同函数，SEGC 无 goTo）。

## 4. 残留（诚实记档，非三修范围）

- E0/E1 定稿穷举Fatal=1：E0 头部 ±1f 分岔（fb#0 sleep(3) f3→f2 或 fb#1 jd up f208→f207 即 no-met fb[581,957]——西行坠崖/楔坡自动攀爬的混沌瓶颈）；E1 wg jd80/jd65 双跳落点 ±1f 脆。修后 finjob 干净子进程下复现同值（fb[581,957] ≈ 修前泄漏区产出的 fb[580,956]），证其为**真实物理脆性**而非进程漂移伪判。属 SEGE 配方/词表层设计问题，归链侧槽（robsample 6 组随机未命中 vs 穷举全事件命中，层内 rob 折分对头部脆性无区分度，可作为后续工具议题）。
- runChildJob 每次调用向系统 /tmp 写 `as-child-dbg-*.txt`（约 4-6KB×数百/跑）——既有行为，未动。

## 5. 提交链

- `ded4ef3` 驻留件地板 dwellFloorOf + 陈旧注记勘正 + CLI 直跑判据
- `00a2b9c` 纯函数单测首批 3 例（node:test）
- `53bb772` goTo 完成帧零出力包装 + finjob 下沉 + 单测第 4 例

## 6. 复现

```bash
cd gyのFW
node --import tsx --test scripts/e2e/routetool/autosearch.test.mjs
node --import tsx scripts/e2e/routetool/autosearch.mjs --level e_tutorial_fire \
  --chain note/research/2026-10-autoplay/tools/checkpoints-e_tutorial_fire.json \
  --beam 24 --budget 6000 --segs 0-1 --samples 10 --maxminutes 30 --evalchild \
  --out TEMP/fw-asfix-1/e_tutorial_fire.autosearch.json \
  --report TEMP/fw-asfix-1/e_tutorial_fire.autosearch.search.json
```
