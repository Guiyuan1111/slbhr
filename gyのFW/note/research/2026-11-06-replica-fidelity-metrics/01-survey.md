# 01 · 复刻保真度评估：现成标准与指标调研（2026-11-06）

> 问题（用户 2026-11-06）：有没有现有标准可以评估游戏复刻程度，以便确定
> 复刻是否成功——除人类试玩验收之外？
> 方法：六路定向检索（学术复刻/模拟器社区/反编译社区/形式化一致性理论/
> 视觉回归工业界/音频标准/数字保存学），每域只取可复核来源，全部附链接。

## 1. 总结论

1. **没有单一国际标准给"游戏复刻度"打分**。数字保存领域 2025 年最权威的
   综述报告（CLIR pub194）通篇未给出复刻度评分标准，且明说「模拟环境至今
   没有通用描述标准」（"there are still no general standards for how to
   describe emulation environments"，§Staff Resources / §Conclusion）。
   学术检索同样显示：fidelity 在游戏研究里几乎总被当**自变量**（交互保真度
   如何影响体验），极少作为**被测指标**建模。
2. **但六个成熟域各有事实标准（de facto standard）**，组合成分层记分卡
   即工程可用的"标准"——模拟器/反编译社区给行为层，视觉回归工业界给画面层，
   ITU/EBU 给音频层，数字保存学给框架（哪些属性必须保真）。
3. **对本项目最重要的定位修正**：我方 det 位级门禁是**自锚**（防回归），
   oracle-gold 对拍网才是**原版锚**（评复刻度）——评估"复刻是否成功"用的
   必须是后者，而这正是模拟器社区「录像回放 + 状态哈希/容差对照」方法论的
   手工版。项目已 homemade 大半事实标准（见 §3 映射表）。

## 2. 六域现成标准

### 2.1 行为/执行保真（最硬指标——本项目主口径所在域）

| 来源 | 标准/做法 | 链接 |
|---|---|---|
| 反编译社区 | **字节级匹配金标准**：SM64（2019）/OoT（2021）反编译工程以「构建产物 sha1 与原版 ROM 逐字节一致」为完成判据 | <https://github.com/zeldaret/oot>、<https://arstechnica.com/gaming/2021/11/reverse-engineering-team-completes-its-ocarina-of-time-decompilation> |
| 模拟器社区 | **测试套件 + 录像回放哈希回归**：NESdev 官方工作流「跑测试 ROM → 录 movie → 对结果屏截图 → 记录时间与每屏哈希比对」；AccuracyCoin 把 147 个精度测试集成单卡 | <https://www.nesdev.org/wiki/Emulator_tests>、<https://github.com/100thCoin/AccuracyCoin> |
| 测试 ROM 方法论 | Gekkio：不要拿模拟器当验证主平台（模拟器 bug 会掩盖硬件行为）→ **对照锚必须是原版** | <https://gekkio.fi/blog/2016/game-boy-test-rom-dos-and-donts> |
| 形式化理论 | **ioco 输入输出一致性**（Tretmans）：同输入序列下输出轨迹满足实现关系即判一致；ISO/IEC 9646（OSI 一致性测试方法与框架）是其工业前身 | <https://www.semanticscholar.org/paper/Model-Based-Testing-with-Labelled-Transition-Tretmans/4fe258774fb1257d2177e93fab944657af7395d4>、<https://repository.ubn.ru.nl/bitstream/handle/2066/282907/282907.pdf>（Goodbye ioco, 2022）、<https://www.iso.org/standard/17479.html> |
| 确定性重放（工程参照） | QEMU record/replay：录非确定事件，重放保证逐位一致 | <https://www.qemu.org/docs/master/system/replay.html> |
| 同类重实现项目 | OpenRA：单测稀少，**靠真实对局回放做确定性回归**（Delft 架构分析）；ScummVM：逐引擎回归套件 + 寄存器级对照原版 | <https://delftswa.github.io/chapters/openra>、<https://www.openra.net/about>、<https://www.scummvm.org>、<https://moral.net.au/writing/2017/09/23/sierra_bug> |

**要点**：这些社区从不给"复刻度 87%"这种数；它们的判据是二值的
（逐字节一致 / 测试全过 / 回放哈希一致），容差只有当原版本身不确定时才引入。

### 2.2 视觉保真

| 来源 | 标准/做法 | 链接 |
|---|---|---|
| 学术标准指标 | **SSIM**（Wang 等，IEEE TIP 2004，结构相似性）与 PSNR 是图像质量比对的标准双指标，SSIM 与人眼感知相关性更高 | 论文 DOI <https://doi.org/10.1109/TIP.2003.819861>；入门综述 <https://chenweilog.com/psnr-vs-ssim-a-field-guide-to-image-quality-metrics> |
| 工业界事实标准 | **阈值化像素差**：Playwright 内置 pixelmatch、jest-image-snapshot、BackstopJS 全是"逐像素 + 容差 + 忽略区域"工作流 | <https://github.com/americanexpress/jest-image-snapshot>、算法横评 <https://wopee.io/blog/screenshot-comparison-algorithms-visual-testing> |
| 主观协议（需人，但协议化） | ITU-R BT.500 系列把"人看打分"标准化成可复现实验 | 见 CLIR 报告引用链 |

### 2.3 音频保真

| 来源 | 标准/做法 | 链接 |
|---|---|---|
| ITU/EBU | **BS.1770**（K 加权响度测量算法，现行 -5 版）+ **EBU R128**（−23 LUFS 归一实践）是音频对齐的工业标准 | <https://www.itu.int/rec/R-REC-BS.1770>、<https://tech.ebu.ch/docs/r/r128.pdf> |
| 注意 | BS.1770 量的是**响度**不是**等价性**；复刻场景更强的口径是源级参数对照（本项目 F4 逐键音量表即此） | — |

### 2.4 内容/数据保真

- 关卡/资源数据逐字段对照（Tiled/JSON diff）——本项目证据库 31 目录已做。
- 数字保存学的 **significant properties（显著属性）**框架：先枚举「哪些属性
  必须保真才能保证真实性与可信性」再谈评估——这是学术上对"复刻成功"的
  定义方式（Hedstrom 等 2006 一脉，见 CLIR 报告综述节）。

### 2.5 交互/时序保真

- **分歧时间（divergence time）**：同输入脚本下两实现状态轨迹首次分歧的
  帧号——模拟器社区 sync 距离的镜像指标。
- tick 率/物理常数/输入延迟数值对照（本项目 oracle 逆向已提取常量）。

### 2.6 分类学框架（怎么组织以上指标）

- **CLIR pub194（2025，Kaltman 等）**：保存级用户需要高 **execution fidelity**
  （准确复现技术操作）+ 高 **experiential fidelity**（体验尽可能接近原版），
  二分法源自 Rosenthal 2015。报告全文：
  <https://www.clir.org/wp-content/uploads/sites/6/2025/07/An_Overview_of_Emulation_as_a_Preservation_Method_CLIRpub194.pdf>；
  Rosenthal 原文：
  <https://digital.library.unt.edu/ark:/67531/metadc799755/m2/1/high_res_d/rosenthal-emulation-2015.pdf>
- Acker（2021）三类用户（保存/档案/展示）对应不同保真优先级——本项目目标
  = 保存级（两维都最高）。
- 可引用的相邻成果：Playable Quotes（Game Boy 可嵌入可重放引用，
  Franušić 等 2023，<https://doi.org/10.1145/3582437.3582479>）。

## 3. 映射到本项目：已 homemade 的 vs 缺口

| 事实标准（§2） | 本项目对应物 | 锚 | 判定 |
|---|---|---|---|
| 录像回放+状态对照（NESdev/ioco 精神） | **oracle-gold 对拍网**：录实 dt 序列、tolerance 30px、outcomeWindowF=128；风相位 1010 笔 float64 闭环 max 3.55e-14；旋转对拍 max\|Δθ\|≤1.9e-4° | **原版** | ✅ 方法论齐，**覆盖仅 6/48 关**（§3.1 挂账 1，卡在 oracle 路线供给） |
| 确定性重放自门禁（QEMU replay 精神） | det **241/241 位级一致** vs r44-full | 自锚 | ✅（这是回归保护层，不是复刻度指标——两层不能混） |
| 视觉阈值像素差（pixelmatch 家族） | **visual-diff**：480×360 灰度 + ±48px 对齐搜索 + 容差 24/48 匹配率，带 90.55–92.86（fidelity 39 号档） | 原版截图 | ✅ 已自动化；**SSIM 分量缺**（可外部对标引用） |
| 音频源级参数对照 | **F4 逐键音量对表**（master 0.1 + 逐键覆写 vs bundle 逆向） | 原版 bundle | ✅ 比 BS.1770 更贴复刻；LUFS 总响度对照缺（可选） |
| 动画状态一致性 | 12 号档**状态级对拍**（注册面 0 差异、序列同构、30fps 同步） | 原版 | ✅ |
| 内容数据对照 | 证据库 31 目录 + 关卡 JSON 字段级 diff | 原版 | ✅ |
| significant properties 框架 | 未显式建档——但门禁清单（det/oracle-gold/visual-diff/F4）事实上就是显著属性清单 | — | ⚠️ 可补一份显式「显著属性 → 量具 → 阈值」总表（纯文档工作） |

**结论**：按六域事实标准衡量，本项目的评估体系已是同类项目（OpenRA/ScummVM
量级）之上的配置——真正缺的不是方法论，是 **oracle-gold 覆盖率**（6/48，
已挂账）与两个可引用的标准分量（SSIM/LUFS）。

## 4. 待裁候选（登记 §3.1 #11，未立项）

1. **visual-diff 补 SSIM 分量**：现有容差匹配率是自造数，加 SSIM（同一张
   对齐后灰度图上顺带算，约 30 行）即可引用 IEEE TIP 标准指标，外部可比。
   预估半小时级，判据沿用分数带纪律（先跑基线定带）。
2. **F4 补 LUFS 总响度对照**：需真实渲染音频捕获，成本高于收益，
   默认不做（F4 源级对表已强于响度等价判据）。
3. **Ruffle 无头跑原版 SWF**：oracle capture 基建已用原版直跑（8787 静态服
   + 物理步计数钩子），无需引入 Ruffle；其跨跑确定性亦无官方声明。**不做**。

## 5. 引用清单（全链接）

- CLIR pub194 报告全文 <https://www.clir.org/wp-content/uploads/sites/6/2025/07/An_Overview_of_Emulation_as_a_Preservation_Method_CLIRpub194.pdf>
- Rosenthal 2015（execution/experiential fidelity 出处）<https://digital.library.unt.edu/ark:/67531/metadc799755/m2/1/high_res_d/rosenthal-emulation-2015.pdf>
- NESdev Emulator tests <https://www.nesdev.org/wiki/Emulator_tests>
- AccuracyCoin <https://github.com/100thCoin/AccuracyCoin>
- Gekkio test ROM 方法论 <https://gekkio.fi/blog/2016/game-boy-test-rom-dos-and-donts>
- zeldaret/oot（字节级匹配）<https://github.com/zeldaret/oot>；Ars Technica 报道 <https://arstechnica.com/gaming/2021/11/reverse-engineering-team-completes-its-ocarina-of-time-decompilation>
- QEMU record/replay <https://www.qemu.org/docs/master/system/replay.html>
- Tretmans ioco 教程 <https://www.semanticscholar.org/paper/Model-Based-Testing-with-Labelled-Transition-Tretmans/4fe258774fb1257d2177e93fab944657af7395d4>；Goodbye ioco（2022）<https://repository.ubn.ru.nl/bitstream/handle/2066/282907/282907.pdf>
- ISO/IEC 9646-4 <https://www.iso.org/standard/17479.html>
- OpenRA <https://www.openra.net/about>；Delft 架构分析（回放回归实践）<https://delftswa.github.io/chapters/openra>
- ScummVM <https://www.scummvm.org>；Sierra bug 寄存器级对照 <https://moral.net.au/writing/2017/09/23/sierra_bug>
- SSIM 原论文 <https://doi.org/10.1109/TIP.2003.819861>；PSNR vs SSIM 指南 <https://chenweilog.com/psnr-vs-ssim-a-field-guide-to-image-quality-metrics>；截图比对算法横评 <https://wopee.io/blog/screenshot-comparison-algorithms-visual-testing>；jest-image-snapshot <https://github.com/americanexpress/jest-image-snapshot>
- ITU-R BS.1770 <https://www.itu.int/rec/R-REC-BS.1770>；EBU R128 <https://tech.ebu.ch/docs/r/r128.pdf>
- Playable Quotes（FDG 2023）<https://doi.org/10.1145/3582437.3582479>
