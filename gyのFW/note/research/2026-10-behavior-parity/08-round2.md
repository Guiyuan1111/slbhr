# 08 号档 · 行为复刻二轮综合（windsem + goldfix；windphase 进行中）

> 一句话：**风阻尼"缺陷"裁定为真偏离并已修（oracle 原文 dt 加权，连开发者注释都直证），但修处在 fixed 1/60 下位级中性——det r32 与 v1 基线零漂，预想的重录流程空转；oracle 金 fixture 首例落册（tolerance 25px），并把"行为差 vs dt 差"彻底分账：+4.1% 时长漂移是行为差（oracle 跑速慢 0.8%），dt 整数量化只贡献残差的一半。**
>
> - 日期：2026-10-18
> - 前序：05 号档行动清单 → windsem（07 号档）+ goldfix（06 号档）两槽并行实施 → 本档整合。windphase 槽（行动项 3）进行中，其结论另行追记。

## §1 二轮结果一览

| 项 | 裁定/交付 | 关键数字 |
|---|---|---|
| 风阻尼语义（07 号档） | **分支 B**：oracle 原文 `0.975 ** (elapsed/(1000/60))`（bundle L59569 字节直证，elapsed=当 tick dt 毫秒 L14704）→ 内核旧 `×0.975/步` 属真偏离 → 修复 `4198ef3`；附带推力去 `max(0,·)` 钳制 `99ed9fc`（oracle 无钳，dist>length 负因子=柱顶吸回） | **位级中性实证**：fixed 1/60 下 `1/60·60===1` float 精确 → 指数恰 ≡1 → det r32 **48/48 位级全同**、fixtures v1 **4/4 maxDev 0**（预想 r33 重录+人审空转）；dtsweep 复扫 forest_26 风区漂移收窄 2–37%（286.92→224.39 @144hz 等），结局集合不变 |
| oracle 金 fixture（06 号档） | `forest_01/oracle-gold` 落册（WIN@f2463 ×2 BITEXACT 采集）；fixture-runner 最小扩展（全可选 flag，v1 零波及） | 同 dt 序列比对：逐位**不成立**（f0 静态偏置 0.0135px+行为差主导），位置残差 max 40.9→20.2px（**减半**）；tolerance=25px（20.17×1.24 跨机余量）+outcomeWindowF=128（win 帧 |2367−2463|=96 恒在）；runner 终态 **5/5 PASS ×2** |

## §2 关键判定

1. **"+4.1% 时长漂移"完成分账**：内核按 oracle 同款整数 ms dt 序列跑得 WIN@f2367 ≈ fixed-60 的 f2365——dt 差几乎不贡献时长漂移；oracle 恒 f2463 → **行为差主导**（oracle 跑速 ~241 vs 内核 ~243px/s ≈0.8%，±1 帧落地相位）。dt 整数量化只贡献位置残差的一半（中位 7.11→4.80px）。
2. **内核优化路线不可移植给 oracle**：forest_04 内核路线 oracle 跑满超时；forest_12 结局可移植（WIN@f872 vs 776）但轨迹中位差 357px。⇒ **行为网的路线供给方应是 oracle 自搜路线**——机器探索线从"可选"变"行为复刻必需品"（第三次联动信号，决策仍在用户）。
3. **03 号档一处归因证伪（已勘误）**：forest_03 全 12 谱行位级不动——其翻转死亡（墙时 3.5–4.8s）先于首风接触（6.97s），**非阻尼驱动**；初轮"风关敏感"归因收回（勘误注记见 03 号档 §9，原文未动）。风阻尼修复的真实收益=forest_26 类"风区内长时间作用"的关（收窄 2–37%）。
4. **e2e 排除回归**：修复后真机 repeat3 forest_04/12 ALL PASS；forest_01 2/3×3——修复前 A/B 同样 2/3、失败散布不同 run/形态、该关风柱数=0 → 环境性相位彩票非回归（与 07 号档彩票定律一致）。

## §3 整合期事件（主会话）

- **goldfix 越权审查**：fixture-runner.mjs 不在其文件区，但 04 号档"零改动接入"预案实测不成立；槽位请示无门后做 4 项最小扩展（全可选 flag、缺省=原行为）并全量披露（06 号档 §4）。主会话审 diff 判定：**接受**——向后兼容成立、v1 零波及复验 ×2、`source:"oracle"` 禁 `--update` 保护金输出。若后续判需回滚可 revert a431e07 单文件，fixture 随之降级、goldcollect --compare 仍为等效量具。
- 附带修复入库：vtrun 系 levelId=1 硬编码会在非 forest_01 关静默载错关（b5854d2，改按 filename 查 oracle temple.json 只读解析）。
- 主会话独立复验：fixture-runner 全网 **5/5 PASS**（v1 四关 maxDev 0 + oracle-gold maxDev 20.17<25）。
- 纪律：两槽均无 co-author、未 git add -A、oracle 目录与内核审计面只读（windsem 的 mechanisms.ts 修改属分支 B 授权范围）、TEMP 清零、浏览器进程无残留。

## §4 状态板（05 号档 §4 行动清单）

| # | 项 | 状态 |
|---|---|---|
| 1 | 风阻尼定点处置 | ✅ 收官（分支 B 修复+位级中性+03 勘误） |
| 2 | oracle 金输出接入 | ✅ 首例落册（forest_01）；48 关铺开待路线供给 |
| 3 | 风相位对拍 | ✅ 收官（09 号档）：判定**恒定偏移（可锚定修正）**——oracle 风钟=`game.time.now`=本帧 rAF ts 取整（非 Date.now 域，L14653/L25938/L24247 引文），与内核 simTimeS 恒差 16.333ms（读点区间端点约定差+首 dt 钳残差），去中位残差 ≤ 整数 ms 量化下界；力公式 1010 笔 ApplyForce float64 闭环（max 3.55e-14）。**未采纳内核锚定改时**（动风钟将漂 det 基线，收益仅 oracle-gold 容差收紧 173→~120px，生产固定 dt 下玩家不可见——留作可逆后续项） |
| 4 | 路线库补全 | ⏸ 与机器探索线决策联动（现为必需品关系） |
| — | forest_26/oracle-gold | ✅ 落册（49185bc，tolerance=173px，capture ×2 BITEXACT；全网 **6/6 PASS** 主会话复验） |
