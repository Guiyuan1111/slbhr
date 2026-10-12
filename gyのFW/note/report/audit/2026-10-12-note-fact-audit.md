# note/ 文档与事实相符性审查（2026-10-12）

**性质**：主会话本体执行的机械核验（未派子 agent——当时并发已达 6 流：本会话 3 生产 agent + 另一会话 2 agent + 本体）。
**方法**：文件清单/git 历史/远端 Release/routes 结构校验/代码现状抽查，逐项与 note/ 声明对表。

## 一、核实为真（抽查+机械核对通过）

| # | note/ 声明 | 核验方式 | 结果 |
|---|---|---|---|
| 1 | research 档号 00-22 连续 | ls 逐号 | ✅ 无重复无缺号；21=forest_28、22=forest_09 与仲裁 commit d182ab7 一致 |
| 2 | 缺陷八判（03_1/09/09_1/11/12_1/14/14_1/21/28） | evidence/ 目录对表 | ✅ forest031/09/11/121/14/21/28 目录齐全，封档档号齐 |
| 3 | TEMP 状态（r09/r28 已清、r02/r16/r32 在用、visfix+decode-level.mjs+node 保留） | ls TEMP/ | ✅ 与 handoff 顶部三条目声明一致 |
| 4 | PLAN.md 为历史文档、D4 已推翻、现行事实以 handoff 为准 | 读头部横幅 | ✅ 横幅在且指向正确（handoff/2026-10-04-fidelity-rewrite.md 存在） |
| 5 | release 档 0.1.0-0.3.29 连续齐全 | ls note/release/ | ✅ 31 档无缺 |
| 6 | GitHub Release 与发版档一致 | `gh release list` | ✅ 远端 Release 到 0.3.29（Latest），标题与档名吻合 |
| 7 | 0.3.29 发版说明 F1-F8 有 commit 依据 | git log 抽查 | ✅ c6cf4b2(F1)/d7f52df(F3)/29931ad(视觉修) 等实在列；client/src 在 0.3.28 后确有 7 commit |
| 8 | 20 号档视觉三修与代码现状一致 | 本会话直读 GameScene.ts/overlays.ts | ✅ buildTutorial +PAD、setBounds 已删改弹簧钳制、EndMenu 原版几何重排（含 popupArrow、无时间值文本） |
| 9 | routes/ 结构合法 | node 逐文件解析 | ✅ 7 条（01/02/03/06/06_1/12/26）level/tickHz/totalFrames/fb/wg 字段齐全 |
| 10 | 00-overview 自称"纯只读调研存档" | 头部性质声明 | ✅ 与档内内容相符 |

## 二、不符/漂移（3 项，均已定性）

### A. 包版本漂移（唯一实质问题）
- root package.json=**0.3.29**，但 packages/client=**0.3.28**（其后 client/src 有 7 个 commit：F1/F3/F4 + 视觉三连修 29931ad 等）、packages/shared=packages/server=**0.3.20**（其间内核有 F6 windClockS/F7 stepEvents 等改动，0.3.29 发版说明自证）。
- 0.3.29 发版 commit（9e12ea1）只 bump 了 root。
- **处置建议**：0.3.30 发版时统一 bump root+client+shared+server（届时均有改动），不回溯改 0.3.29。

### B. handoff"6 绿"口径过时（进展非错误）
- r02b 已把 forest_02 路线文件 + .best.json 落进 routes/（结构合法，8 相方案 fb=274/wg=322 事件）。
- 02 的完整验收（mc≥98% + 真服 repeat≥3）状态以 r02b 终报为准；handoff 下一条目需把口径改为"7 条路线文件、02 门禁待终报"。

### C. 本地 git tag 停在 0.3.9（无实质影响）
- 远端 Release/tag 齐全（gh 实证），本地仅未 fetch。下次随手 `git fetch --tags` 即可。

## 三、结论
note/ 体系的**结构声明（档号、缺陷清单、TEMP 状态、历史横幅、发版对应）全部与事实相符**；唯一实质漂移是包版本号滞后（A），已给处置路径。文档可信度高，可继续作为产线事实源。
