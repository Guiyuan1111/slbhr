# 路线语料甄别总表（formal corpus registry，2026-10-27）

目的：为"内核全量路线回归脚本"产出正式语料清单。候选集 = `git ls-files scripts/e2e/inputs/routes`
（56 个跟踪 JSON）排除 `*.v[0-9]*.json`、`*.best*.json`、`*.opt.json`、`*.autosearch.json` 后的
全部 16 个文件。甄别方法：**逐文件实跑内核 validate**，未实跑或未跑赢一律不入正式清单。

## 验证口径

- 命令：`timeout 300 node --import tsx scripts/e2e/routetool/validate.mjs --level <level>`（每关 300 秒守护，实跑均秒级完成）。
- 语义：validate.mjs 退出码 0=内核 WIN（输出 `内核 WIN @f<帧>`）、1=FAIL（死亡帧/超时）、2=路线 level 字段与 --level 不符（本批 16 个候选 JSON 内部 `level` 字段均已逐一核对，与文件名全同）。
- 回放方式：`runKernel` 逐帧步进路线全时间线（60Hz、totalFrames 上限），无 offset 参数——offset 属浏览器墙钟路径概念，内核回放原样消费事件表（路线 JSON 已含 +30f settle 对齐，直接回放即可，与 note/light01-route.md"事件偏移注意"一致）。
- 结果纪律：WIN 帧号全部取自本次实际运行 stdout；无一次凭历史记录转抄。

## 全候选总表（16 项，按文件名排序）

| 文件 | validate 结果（2026-10-27 实跑） | 记档出处 | 备注 |
|---|---|---|---|
| forest_01.json | **WIN @f2365** | note/forest01-route.md（v35 内核 WIN @f2365，与本跑同帧）；note/self-acceptance.md §五/§七；note/release/0.3.28.md、0.3.29.md（route.mjs repeat3 ×2 连 ALL PASS）；note/evidence/2026-10-23-recheck/01-e2e-full.md §10（浏览器门禁 PASS） | 0.3.49 前即达 P3 全程门禁标准的老牌绿关；真服口径历史用 --offset -15（README 门禁命令行） |
| forest_02.json | **FAIL 死亡 @f1879**（复跑 2 次同帧） | note/evidence/forest02/02-route-win.md（r02b 旧版内核 WIN @f2595）；note/evidence/forest_02/02号档、03号档；note/handoff/archive-2026-10.md 2026-10-13 条（v8 曾真机 3/3，用户裁决挂起不计绿）；note/handoff.md 2026-10-24 条（"同 02/05 MC 架构墙族"） | 挂起关（用户裁决：v8 入库保持不计绿）。现状：fb 于 x≈414 处自由落体死亡（trace：y 441→446→453→459），`forest_02.json.best.json` 与正式文件内容逐位相同（无更优版本可换）。死亡时点与 archive 2026-10-18 性能条"forest_02 死亡后 2283/4163 帧免费"（4163−2283=1880）互证，即 0.3.31 hanging 轴点修复（波及 02/12 等七关）之后内核已回跑不通——根因归属存疑待核，本表只记录实测 FAIL |
| forest_03.json | **WIN @f874** | note/handoff/archive-2026-10.md 2026-10-12 条（批 1 收口绿单"绿 01/03/06/06_1/12/26"）；note/plans/route-production-playbook.md §2（fb 336/430 门带惯性滑停失败位教训） | 无单关专档；批 1 产线关 |
| forest_04.json | **WIN @f1098** | note/evidence/forest_04/05/06/07 号档；note/release/0.3.31.md（绿关 e2e 复跑 forest_04/12 各 repeat3 ALL PASS）；note/handoff/archive-2026-10.md 2026-10-17 条（真机 repeat3×offset−15 ALL PASS） | 0.3.31 hanging 修复后复跑仍 ALL PASS（本关无 hanging，不受波及） |
| forest_05.json | **WIN @f1738** | note/evidence/forest_05/06号档-r05g2-通关与门禁.md（内核 WIN@f1738 与本跑同帧；MC 30.0/21.7/11.7% 未达、真机 repeat3 六跑零胜）；note/handoff.md 2026-10-23 条（05 剔出缺陷关线转复活预案） | 内核 WIN 成立但真服门禁受阻（±1f razor 窗架构级），与 forest_14 同属"内核 WIN·门禁受阻"族 |
| forest_06.json | **WIN @f1394** | note/plans/route-production-playbook.md 头注（批 1 产线实战通关）；note/handoff/archive-2026-10.md 2026-10-11 条（forest_06 ✓3507b0b）、2026-10-12 条（批 1 收口绿单） | 批 1 首关；无单关专档 |
| forest_06_1.json | **WIN @f1394** | 同上（✓0273ddf 液池互换镜像+连持自愈架构）；note/plans/route-production-playbook.md §1（三次门禁失败根因取证主体） | 独立变体关卡（data/forest/levels/forest_06_1.json 实存），非 06 的路线变体；wg 事件表与 06 不同 |
| forest_07.json | **WIN @f1702** | note/release/0.3.30.md（forest_07 收口 v1：内核 WIN@f1702 与本跑同帧 / MC 150/150 / 真机 repeat3 ALL PASS） | — |
| forest_12.json | **WIN @f776** | note/plans/route-production-playbook.md 头注（批 1 通关）；note/release/0.3.31.md、0.3.38.md、0.3.39.md（多次 e2e repeat PASS）；note/evidence/2026-10-23-recheck/01-e2e-full.md §10（route.mjs --offset -15 PASS） | 对称镜像路线（MC 100%）；hanging 关且 0.3.31 修复后复跑通过 |
| forest_14.json | **WIN @f3026** | note/handoff.md 2026-10-24 条（双关 winF=3026、validate 退出码 0、路线入库）；note/evidence/forest_14/01号档、02号档（winF 3026 与本跑同帧） | "内核 WIN·门禁受阻"挂起族：MC 0.0%×3、真服 e2e 0/7（开环平坦表承载不了闭环时序敏感段）；路线与 14_1 逐位同轨（仅 level 字段异） |
| forest_14_1.json | **WIN @f3026** | 同 forest_14（note/evidence/forest_14/02号档：两关路线文件数值全同） | 同上，挂起族；事件表与 forest_14.json 逐位相同、目标关卡不同（forest_14_1 实存变体关卡） |
| forest_15.json | **WIN @f7935** | note/forest15-route.md（r15d 导出时内核 WIN @f7936、96+86 事件） | 现文件 94+92 事件、WIN @f7935——记档后路线又经微调（.best/v39-v43 演化链在档），差 1f 属正常演化，不构成矛盾 |
| forest_26.json | **WIN @f1497** | note/forest26-route.md（内核 WIN@f1497 与本跑同帧；MC 150/150；route.mjs repeat3 ALL PASS） | 记档写 17+17 事件、现文件 16+16——记档后事件有删减，WIN 帧不变 |
| forest_32.json | **WIN @f5151** | note/research/2026-10-fidelity/24-forest32-crossing-seal.md（2026-10-13 用户裁决：维持 win24 挂起、不计绿不删档）；note/evidence/forest32/01-03 号档；note/release/0.3.30.md（v19 内核 WIN@4005 为旧变体） | 挂起关（wg 西渡 MC 疑似物理不可达，路线保持入库）；现文件为 win24 后续硬化版（archive 2026-10-13：07b23f3 采纳），内核 WIN@f5151 为本跑实测 |
| light_01.json | **WIN @f2943** | note/light01-route.md（WIN@f2943 与本跑同帧；route-node 3/3 PASS）；note/release/0.3.49.md；note/self-acceptance.md §五/§七 | 0.3.49 正式路线；666 事件（fb 568+wg 98）与记档一致 |
| light_02.json | **WIN @f4394** | note/light02-route.md（WIN@f4394 与本跑同帧；route-node 3/3 PASS）；note/release/0.3.49.md；note/self-acceptance.md §五/§七 | 0.3.49 正式路线；364 事件与记档一致；+30f settle 对齐在档 |

## 记档在案但 JSON 缺失（3 个）

| 关卡 | 记档出处 | 记档内实际 JSON 线索 | 缺失实勘 |
|---|---|---|---|
| forest_08 | note/forest08-route.md | 全文无 routes/forest_08.json 引用；wg 线事件序列仅以文字/帧表在档（"wg 线事件序列保留在档备查"） | 全仓 find（排除 node_modules）无任何 forest_08 路线 JSON，仅关卡数据与 evidence/forest_08、r08e 目录。该关 2026-10-15 用户终裁"保原样豁免"（fb 门带原版引擎结构性不可达，差 59px），不可能有可回跑路线 |
| forest_22 | note/forest22-route-wip.md | 探路 WIP：仅骨架 v7 文字蓝图（"全局骨架 v7（双人时序）"），无 JSON 路径 | 全仓无 forest_22 路线 JSON（仅关卡数据与 evidence/forest_22）。记档状态=分段探针结论，未到装配阶段 |
| forest_23 | note/forest23-route.md | L38 "fb v11 全链装配 → routes/forest_23.json → …" 仅为产线**待办**项；后续增补 3/4 判定 fb+wg 双封印（封链 A-E） | 全仓无 forest_23 路线 JSON（仅关卡数据与 evidence/forest_23）。该 JSON 从未产出；按 19/24 号档豁免流程呈报待终裁 |

## 汇总

- **15 个正式 WIN**（validate 实跑通过，已收入 `scripts/e2e/inputs/routes/formal-corpus.list`）。
- **1 个 FAIL**：forest_02.json（内核死亡 @f1879，确定性复现 2 次；挂起关，不入清单）。
- **3 个记档在案但 JSON 缺失**：forest_08（豁免终裁）、forest_22（WIP 无 JSON）、forest_23（双封印待终裁）。
- 候选集内其余 37 个跟踪 JSON 全部命中排除模式（`.vNN`/`.best*`/`.opt`/`.autosearch`），为探索/版本档，未甄别不入表。
- 口径提醒：本表 WIN=**内核** validate 语义；其中 forest_05/14/14_1/32 属"内核 WIN·真服门禁受阻"挂起族（见备注列），全量路线回归脚本若按"真服 3/3"口径取用，应先与主会话确认是否收窄清单。
