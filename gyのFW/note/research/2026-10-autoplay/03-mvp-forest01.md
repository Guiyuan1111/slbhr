# 03 · forest_01 机器自动探索通关 MVP —— 档卷（2026-10-16/17，auto-build2 槽）

## 0. 结论（MVP 三态）

| 态 | 范围 | 依据 |
| --- | --- | --- |
| **全自动（搜索解 + 段级 ±1f 穷举 Fatal=0）** | S0a、S0b、S1、S2、S3（5/9 段） | 各段定稿 `穷举Fatal=0`，seam 全绿；S3 end@f1188（fb20/wg23 原语累积） |
| **半自动（搜索解 met，定稿门未过）** | S4 | 搜索内 wp4/4 met=true、inline rob=0/6（fb[972,317] wg[1031,477]），但 finalize ±1f 穷举仍 fatal≥1（根因见 §3） |
| **未竟（未在新 wrapper 下重搜）** | S5、S6、S7 | 旧配方为旧 wrapper 语义所写，未验证 |

**验收门现状：未达成。** 整关导出件 `scripts/e2e/inputs/routes/forest_01.autosearch.json` 仍为前槽 s7j 产物（runKernel WIN@f1977，但 ±1f 365/614 脆——不符 fatal=0）。本轮未产出新的整关导出（链条止于 S4 定稿门）。

## 1. 本轮断点（auto-build2 → 后续槽）

- 断点文件：`TEMP/autobuild/full18.search.json` 前的谱系——**活跃定稿链 = full7b（S0a/S0b/S1/S2）+ full14 的 S3 终稿**，累积 fb20/wg23 原语、前缀 1188f。后续槽恢复命令：
  ```
  node --import tsx scripts/e2e/routetool/autosearch.mjs \
    --resume <含 S3 新终稿的报告> --segs 5-8 --forcestart 5 \
    --out TEMP/autobuild/<新>.route.json --report TEMP/autobuild/<新>.search.json
  ```
  （注意：`--forcestart N` 的 N 是 chain.segments 数组下标，S4=5、S3=4；resume 种子取报告里【最后一个含 final 的段】，塞给 S4 必须用含 S3 final 的报告。）
- S4 现状：搜索稳定 met（wp4/4、rob 0/6），定稿梯子 seam 多档可过（entry@1367），唯一 remaining fatal 为 S3 尾 walkTo 刹车脉冲 ±1f 经 S4 四跳阶梯（jo→ride→jd40→jd25 落板）放大成 ±10~70px 落点彩票（fb[74] right-up@1204 -1 → fb[1025,317] 停板外压不到 b0；fb[77] left-down@1213 +1 → 阶梯整体崩塌 fb[777]）。
- 下一步建议：S4 fb 阶梯末端加位置反馈收编（板面 walkTo 短程回拉已是词表件，须保其不被泊位剪掉）；或 S3 fb 刹车改单脉冲定时闸；或从绿路线该跨度提取事件样式复刻（绿路线全局 222/222 ±1f 稳，其 S3→S4 手法天然鲁棒）。

## 2. 各段终态数字（活跃谱系）

| 段 | endF | trim（保留原语数） | 穷举±1f | 备注 |
| --- | --- | --- | --- | --- |
| S0a | 354 | fb5/wg3 | 0 | 前槽配方，本轮复核通过 |
| S0b | 558 | fb10/wg10 | 0 | 绿迹同款双 rj 塔出口 + sleep(24) 吸收头 |
| S1 | 934 | fb16/wg14 | 0 | waitPlat(1,586,600) 时序解耦 |
| S2 | 979 | fb18/wg19（full7 谱系保留 settle 尾） | 0 | waitPx+sleep60 解零窗联合 entry；jd24+hold60 墙锚 |
| S3 | 1188 | fb20/wg23（含 sleep20 吸收头） | 0 | wg: rj(1,0,18)+walkTo(1,341,999)；fb: goTo600+walkTo(1,1070,999) 墙锚 |
| S4 | 1367（搜索 met，未定稿） | — | 1（fb[74]/fb[77]） | jo455/475→ride→jd40→jd25 落 352 板 |
| S5-S7 | — | — | 未重搜 | 旧配方 |

搜索代价（本轮实测）：单段 recipe 段 ~200-2300 evals / 160-300s（beam24、samples10、budget6000 默认）。

## 3. 本轮新证机制（续 02 号档机制目录）

1. **finalizer 泊位剪的跨段反噬**：metIdx 剪按 met 帧消费数保留，会剪掉【met 之后才完成】的停驻原语（S3 fb 的 goTo(1060) 在 met@1188 后才收敛）——被剪程序连本段 target 重放都不再满足。深保留档（+1..+3、全长）就是解药，但须配 seam 逐档打点才可见。
2. **resume 种子取【最后一个含 final 的段】**：陈旧 final（哪怕 seam 失败的）会当种子被继承（full8 实证：S3 陈旧 final 18/21/1173f 被当 S2 种子）。清理断点报告时置 `final=null, solved=false`。
3. **`--forcestart` 下标 = chain.segments 数组下标**（S0a=0…S3=4、S4=5），不是段序号减一。
4. **slick 面刹车振荡的两级危害**：(a) 本段门检不可见（振荡环绕目标反复过窗，±1f 只改相位）；(b) 下段队列排干被推迟（goTo 永不 done → not-drained idx 卡 x/y）或阶梯启动整体平移。cure = walkTo(线,999) 过线反刹 + 立面墙锚收滑（fb 1076 / S3 wg 板面 341 实证 0/52、0/68）。
5. **walkTo vMax 限速脉冲步进是脆弱性发生器**（80 脉冲事件 136 败），vMax=999 单程直压+主动刹车才是正解。
6. **吸收头模式**：配方首部 sleep(15~30) 吸收 finalizer 对种子尾段 settle 的修剪（full8 S2 trim 17/18 砍 sleep(15) → S3 rj 提前 15f 发射落井底）。
7. **角色墙锚位移会打破下段 waitPx 契约**（fb 锚 1076 后 waitPx(fb,1080,1214) 永不燃）——改配方时须连带审查所有跨角色 waitPx 窗。
8. **窗界人工边界 vs 语义门**：S4 fb 目标窗 [955,1012] 东缘距搜索停位仅 2px，而真语义门是 `pushers[0].state===1`（压板 ⟺ 在板上）；窗放宽到 [940,1030] 去掉人工边界（checkpoints 已改）。
9. **S4 四跳阶梯（jo→ride→jd40→jd25 落板）无位置反馈**：上游 ±1f 相位差被放大成 ±10~70px 落点差——当前唯一未过门根因。板面回拉词表件（goTo970/992）在泊位剪下常被剪掉，保它进定稿是下轮关键。

## 4. 工具与产物路径

- 搜索器：`scripts/e2e/routetool/autosearch.mjs`（本轮新增：`--forcestart`、walkTo 原语、seam 失败原因打点、finalize 逐档打点、扰动失败组 ev/why 详情）
- ±1f 整关扫描器（验收门工具，ScanPool 口径）：`note/research/2026-10-autoplay/tools/scan1f.mjs`
  `node --import tsx note/research/2026-10-autoplay/tools/scan1f.mjs <routes.json> [--d 1] [--jobs 9]`
- S3/S4 段件取证台：`note/research/2026-10-autoplay/tools/dbg29.mjs`（TGT=s3|s4、RPT=<报告>、trace/seam 模式）
- 链谱系断点：`note/research/2026-10-autoplay/tools/full7b.search.json`（S0a-S2 定稿，S3 final 已清）、`full14b.search.json`（+S3 wall-anchor 终稿）
- 检查点定义：`note/research/2026-10-autoplay/tools/checkpoints-forest_01.json`（本轮放宽 S4.target/S5.entry fb px → [940,1030]）
- 人工路线（对照基准，未动）：`scripts/e2e/inputs/routes/forest_01.json`（WIN@f2365，fb56/wg55 事件，totalFrames 2500，全局 ±1f 222/222 稳）
- 前槽整关导出（脆弱，待替换）：`scripts/e2e/inputs/routes/forest_01.autosearch.json`（WIN@f1977，±1f 365/614 fatal）

## 5. 残留风险

- S4 定稿门未过 → S5-S7 无法在本谱系上继续链式穷举；若下轮仍卡 S4，fallback = 从绿路线提取 S3 尾+S4 跨度事件样式做成 raw 事件原语（保 222/222 鲁棒性血缘），代价是"全自动"降级"绿迹引导半自动"。
- S5 推箱段、S6、S7 的旧配方从未在新 wrapper（锁存语义/seam v4）下验证。
- TEMP/autobuild 已清理（见 git 记录）；dbg 系列探针仅保留 dbg29（其余删除）。
