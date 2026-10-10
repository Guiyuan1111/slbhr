# note/ 文档事实审查报告（2026-10-11）

> 任务：审查 note/ 全部 60 个文档的事实性描述是否与仓库实况相符。
> 方法：本地脚本全量机械扫描（零模型请求，规避限流）+ 主控语义抽样裁决；子 agent 深审因账户限流中断，恢复后补（见 §5）。
> 脚本与证据：TEMP/audit-sweep.mjs / audit-sweep2.mjs（输出 audit-sweep.txt / audit-sweep2.txt）。

## 1. 结论

**未发现硬性失实（0 处）**：43 个 commit 哈希引用全部真实存在且抽样 12/12 主题对题；物理/机关常数抽查全对且带 bundle 偏移佐证；高频数字跨文档自洽；关卡机关清单抽查 5/5 精确。发现 2 处轻微异常与 3 类可解释偏差（见 §3/§4）。

## 2. 全量核验通过项

| 核验项 | 规模 | 结果 |
|---|---|---|
| commit 哈希引用存在性（全 note/） | 43 唯一值 | 43/43 存在于 git |
| 哈希主题与文档描述一致性（抽样） | 12 个（F1-F8、0.3.25×2、产线三件、9e12ea1、a1de1b6） | 12/12 对题 |
| 物理常数 vs params.ts | gravity 31.25 / jumpVelocity 15.5 / runForce 50 / maxSpeed 8.5 | 全对（@params.ts:15/45/47/49） |
| Pusher 行程 0.7m / 阈值 0.2m | params.ts:134 stroke:0.7、trigger:0.2 | 对（载于 params.ts 非 build.ts，level2.ts:108 注释与 research/05 @1746775 佐证一致） |
| 门 sensor 32×4px（1×0.125m） | build.ts:283 | 对（与 forest_26 诊断读数一致） |
| 风 lengthM 默认 10 | level2.ts:521,538 | 对 |
| 关卡机关清单（level-batches §4 抽查） | forest_26/09/03/12/24_1 五行 | 5/5 精确（winds/levers/diamonds/hangings/fullRot/17.406°/rot −90/initState 常开） |
| 高频数字跨文档自洽 | 87.51×5 文档、85/85×3、48/48×7、95.11×3 | 自洽 |
| release 版本连续性 | 32 文件 0.1.0→0.3.29 无缺号 | 对 |
| PLAN.md 树声明抽查 | params.ts、server/src、GameScene.ts、route.mjs | 4/4 存在 |

## 3. 轻微异常（2 处）

1. **tag 对齐**：`note/release/0.1.0.md` 存在但无 `0.1.0` tag——tags 从 0.2.0（2026-10-02）才开始打，属规范确立前的历史空白，非失实；另存在继承自上游原版仓库的历史 tag `V0`（fe2dc76，2026-05-16 "Update link for Game 6"），非本项目发布。
2. **deviation-flip-plan.md 挂账项过时**：该计划记载「GameScene.ts:458 注释仍写『二档化，冻结偏离 #5』——注释已失实，需改」，实测该失实注释**已被修掉**（grep 二档/冻结偏离 #5 无命中）——文档描述的待办已完成但文档未销账（反向滞后，良性）。

## 4. 可解释偏差（非失实）

- **32 条路径不存在**中：约 25 条为 TEMP/* 临时件（按 TEMP 政策即用即清，文档记录的是当时工作现场）；3 条为历史路径后来重构（`packages/shared/src/world.ts`→`kernel/world.ts`、`level.ts`→`level2.ts`、`packages/shared/kernel`，2026-10-04 文档写作时为真）；其余为正则截断伪命中（如 `scripts/baseline/URL`）。
- `note/objections.md`、`note/decisions.md`（PLAN.md 引用）：为**条件性过程约定**（「如有异议写入…」），无异议发生故文件未建；`data/save.json` 为 PLAN 树标注的 **M4 里程碑产物**，尚未到交付期。
- 2026-10-11/12 勘误（research/11 §2A multistart 推翻混沌锁死、level-batches 13 变体无一全等、release/0.3.29 勘误指针）：本次复核确认勘误内容与仓库实况相符（forest_01.json source v38 谱系、routetool/multistart.mjs 存在且冒烟自动复现 v38）。

## 5. 待深审项（限流中断，恢复后补）

以下语义级深审由子 agent 执行时被账户限流中断（三次启动失败），机械等价部分已由 §2 脚本覆盖：
- handoff 横幅的历史行为声明逐条回放（如「6 连 ALL PASS」「L3 六场景」——有 out/ 产物者可对产物，无产物者无法独立复验）；
- research/05 机制常数全表（~100 行）逐行对源码/bundle 偏移（已抽 8 行全对）；
- 外部引用链接内容抽查（research/11 §5 约 20 条等；格式已脚本核验，内容 WebFetch 抽查未做）；
- 0.3.0-0.3.19 各 release 的哈希主题抽样（已抽 0.3.25）。

## 6. 处置

- 无需修档的硬性失实 → 无勘误需要发。
- §3.2 flip-plan 挂账销账：在 deviation-flip-plan.md 该行补「已完成」标注（随本报告同 commit）。
- §3.1 tag 空白与 V0：仅记录，不补打历史 tag（不改写历史）。
