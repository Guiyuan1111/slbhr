# Fireboy-and-Watergirl 代码分析报告

**分析时间**：2026-09-30_113536
**分析范围**：`D:\Guiyuan1111\GitHub\slbhr\Fireboy-and-Watergirl`
**分析模式**：自有源码完整分析（5 文件 ~620 行 100% 覆盖）+ 产出目录采样分析（output/ 六代客户端、har/ 六包）
**代码规模**：全仓库 706 个文件（358 json / 198 mp3 / 96 png / 15 js / 3 py 等）；自有源码 5 个文件约 620 行；另有孤儿补丁 `output/multiplayer.js` 约 170 行
**技术栈**：Python 3（纯标准库）· HTML/CSS/JS · PeerJS 1.5.1 与 @poki/netlib（多人补丁）· Phaser 2 / PIXI / Box2D（游戏本体，A~E 内联压缩，F 走 jsDelivr CDN）· RequireJS(AMD) · GitHub Pages

## 报告目录

| 报告 | 内容概要 |
|------|---------|
| [项目架构](01-architecture.md) | "小工具+大产物"五层结构、两阶段 ETL 流水线、函数级调用链（100% 覆盖自有源码）、Phaser 2 引擎判定、A~F 六代主题（forest/light/ice/crystal/elements/fairytales） |
| [运行原理](02-operation-principles.md) | HAR 三重过滤与清单重建、exists-skip 断点续传、多人补丁键盘事件劫持原理、游戏启动链（gameIndex→requirejs→game.json→temple.json→关卡）、localStorage 持久化、12 项容错缺陷清单 |
| [工作流分析](03-workflow.md) | 四类工作流（抓取/关卡编辑/部署游玩/多人补丁）、13 条 Python 决策分支、23 项硬编码常量、异常恢复缺陷、12 commit 演进叙事 |
| [AI 替代方案](04-ai-substitution.md) | 10 个模块六维评分、ROI 优先级矩阵、三阶段改造路线图、5 份 Skill Blueprint 交叉引用 |
| [Skill Blueprint 索引](blueprints/index.md) | 5 个可 AI 替代组件的完整设计规格（4 个 Quick Win + 2 个 Strategic） |

## 核心发现

1. **两阶段 ETL 流水线**：`1.unpack_har.py` 解析 HAR 网络日志生成资源清单（前缀过滤+去重+temple.json 重建关卡），`2.grab_files.py` 按 URL 镜像 1:1 下载到 `output/`，游戏因此零改写即可离线运行；`common.py` 是 17 行配置中心。
2. **多人补丁在线上完全失效**：仅 `output/A/gameIndex.html:121` 注入 `/multiplayer.js`，该根绝对路径在 GitHub Pages 项目子路径下 404；仓库还并存另一套 @poki/netlib 实现（`output/multiplayer.js`），无任何页面引用，且已修复根版的 isHost 时序缺陷（`multiplayer.js:211`）——双实现行为分叉。
3. **部署已失联 87 天**：GitHub Pages 构建自 2026-07-05 起 errored 卡死，线上快照停留在 `3ead9e0`，最后 2 个 commit 从未上线且无人察觉。
4. **质量关卡形同虚设**：整条流水线唯一质检是"人工目检清单"（README.md:78），实测 6 代全部缺失 manifest.json 与图标；下载器无超时/无重试/无完整性校验，半截文件被当已完成，终态恒报"完成"。
5. **游戏本体为 Phaser 2 引擎**：A~E 将引擎压缩内联进单个 init.*.js（2.3MB/5.4 万行），F 代改走 jsDelivr CDN（离线不可启动）；进度以 `"fb-"+gameConfig.id` 命名空间存 localStorage。

## 关键建议

1. **立即修复两处线上事故**：`/multiplayer.js` 改相对路径（一行 diff，见 Blueprint 05）；排查 Pages errored 构建恢复自动部署（见 Blueprint 04）。
2. **用机器审计替代人工目检**（Blueprint 01，Quick Win）：资源缺口从"玩家发现"提前到"提交前发现"。
3. **下载器加固**（Blueprint 02）：超时+重试+失败清单+非零退出码，保持零第三方依赖与 output 镜像结构不变。
4. **合并双 multiplayer 实现**：建议以 netlib 版为主体（已修复时序缺陷、不依赖 unpkg 单点），合并后必须双人真机验证。
5. **保持"游戏本体零改动"边界**：5.4 万行压缩引擎（模块 9，13/30 分）属人工主导区，AI 仅做只读侦察；修改并再分发游戏本体涉及 README 免责声明边界，由人判断。

## 校验状态

本目录全部 Markdown 已通过 `validate-markdown.py` 校验（详见分析总结中的校验结果章节）。
