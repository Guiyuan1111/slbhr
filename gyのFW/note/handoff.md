# handoff — AI 会话开工现状源 + 滚动日志

## 文件规范（2026-10-20 起生效）

- **定位**：本文件是 AI 会话开工时的现状速览源 + 滚动日志；只保留近 5 天条目，更早的下沉归档。
- **条目插入规则**：新条目置于文件顶部第 1 行（本规范头之下、条目区首位），全文件保持时间倒序。
- **条目格式（本日起强制）**：新条目必须多行结构化——
  - 首行：`**更新**：日期（主题一句话）`；
  - 随后接编号小节（①②③…），每小节 1-3 行，只留结论、关键数字与指针；
  - 单条目 ≤2000 字符；超长细节（证据链/引文/逐项清单）写入 `note/` 对应档卷，此处只留档卷路径指针。
- **归档规则**：条目老于 5 天，或本文件 >40KB 时，把最旧条目逐字原样迁入 `note/handoff/archive-2026-10.md`（插在该归档头部说明行之后，保持时间倒序）。

## 归档导航

| 范围 / 主题 | 去处 |
| --- | --- |
| 2026-10-05 → 10-14 条目 | `note/handoff/archive-2026-10.md`（前半段） |
| 2026-10-15 → 10-19 条目 | `note/handoff/archive-2026-10.md`（头部第二段，2026-10-20 迁入） |
| 2026-10-04 保真重写开工交接（需求冻结+Box2D 提取侦察） | `note/handoff/2026-10-04-fidelity-rewrite.md` |
| 2026-10-04 执行期需求冻结（三轮问答 12 项全冻结） | `note/handoff/2026-10-04-execution-freeze.md` |
| 2026-10-15 Windows→Ubuntu 移交接管简报（新会话开工指令） | `note/handoff/2026-10-15-ubuntu-takeover.md` |

今日（2026-10-20）起新条目写在文件顶部。

## 条目

**更新**：2026-10-20（**🔍 文档-事实相符性审计（用户令"检查文档描述是否与事实相符"）——三处漂移全修正**：①README 版本段 0.3.34→0.3.35（滤镜版漏记）+战役行 r0–r7→r0–r11 补 r8–r11 续账一句；②00-INDEX §4 补 r8–r11 四行（并行战役 0.3.34 漏更索引）+标题/引言口径扩"七轮+r8–r11 续账"；③总账标题"七轮总账"→"总账（七轮收官+§八 r8–r11 增补）"。其余全查属实：13 个被引 commit 逐个 cat-file 存在、r8–r11 四报告/量具四件（perf-scene/idle/toolchain/gc）/总账 §八/0.3.33-35 发版记齐、templeTreeBake.ts+TempleScene import/menu-fit/setBusy 代码声明属实、connect-ui 与 fidelity 目录在库（fidelity 档卷无索引系既有惯例非漂移）；门禁复现：tsc OK/vitest 95/95/det 48/48@r0-baseline 2.3s/build 4.11s。观察项未动：git tag 止于 0.3.9+V0+checkpoint-20261014（0.3.10 起未打 tag，发版惯例待用户定夺）；00-INDEX §3 挂账口径自带"2026-10-18"日期声明系历史快照，r8-r11 挂账见 §4 与总账 §八。）
**更新**：2026-10-20（**🌳 选关树浮雕质感还原落地 `8e56200`+`fa17e12`（0.3.35 独立成版）——用户令"自己开发滤镜还原"；并行 r8–r11 战役 01:24 已切 0.3.34，滤镜提交落其上故另发 0.3.35**。①**兼修重大保真暗病：edges 按 `_id` 连接**（oracle bundle:45363-45364 实证）——旧 TempleScene byId(lv.id) 错连 47 条中的 41 条，树形长期大面积错接，1 星进度下不可见故未暴露。②新增 templeTreeBake.ts：BevelFilter（t=180/200、dir±1、outer）/OutlineFilter(3,0)/ColorMatrix(1.7×tint) 全链逐操作 fp32 CPU 移植——GLSL 循环展开（t=200→3 采样、t=180 fp32 累积→4 采样）、UV 裸步长怪癖换算（onePixel 声明未用）、半 texel 采样、unorm round-half-up、SAT 加速+分块行任务；create 平色兜底 + 8ms/帧分帧烘焙（全同步 ≈1.07s→分帧成立），完成 addCanvas 三纹理 big/all/done（深度 −7/−6/−5），节点/按钮/彩带未动。③oracle 对拍（同进度 1 星 1280×960）：47 边×3 中线点 49/49 |diff|≤10/通道、±3.2px 法向凹凸方向 50/50、密集区 778,496px 全通道 ≤10 占 97.56%（通道均差 ≤0.94）；层字节 vs oracle RenderTexture 回读 big 94.80%/all 97.02%/done 99.82%；残余偏差四处入档（水平仿射 ~1.5e-3+0.25px＝FilterTexture texel 1037 vs 逻辑 1036.8 假说存疑待核、边缘带 2.4% 亚像素相位、中线 ±2 窗 18 点未中但 ±10 门禁全过、金层近边采样认知修正）。④门禁：tsc ✓/build ✓/vitest 95/95（原 89 族+新 6 断言）/e2e f01 repeat1 PASS（winAt 39472ms）；与 r8 画布冻结改动（main.ts setBusy 面）零交集。⑤档卷 37 §滤镜还原（GLSL verbatim+三层配方 f()+对拍表+残余清单）+compare-temple.py 工具与 PNG 产物收容 tools/temple-tree/；TEMP 清、残留 http.server 8859/8846 已杀。跨会话协同闭环：对方 44be8f1 预记"滤镜槽在飞零接触、其 4 测试失败为其 WIP"——终态 vitest 95/95 全绿。）
**更新**：2026-10-20（**⚡ 性能战役 r8–r11 四轮收账 `3313403`→`a57532e`（0.3.34）——用户令"持续多轮性能优化+基准量化+报告"**。①r8 场景切换链（-11%：551→491ms 驻留配对；件1 连接忙期画布冻结 setBusy→loop.sleep+floaty 暂停/唤醒双路兜底且 wake 定位 bgWarmSettled 前【早醒有"唤醒税"】、件2 waitForLevelId 事件驱动 -49.5%、件3 temple.json 单例+预取 -93.3%、件4 fetchLevel 缓存；**换肤幕布性能税 +364ms/55% 归档**——pre-skin worktree A/B+CSS 注入 A/B，无 GPU 合成环境 blur 逐帧重算拥塞连接窗，连接期已回收、驻留期挂账真 GPU）；②r9 空闲 CPU 负结论（量具 perf-idle 六态：JS 面 script%<2% 地板、task%=软栅环境项、帧率上限弃件【fps.limit 经 smoothStep 在慢机砍帧 67→48/4s=视觉回归红线】）；③r10 工具链（vitest threads -12%、build 直呼 node 去 npm 层 -6.8%【dist md5 逐字节不变】；判负：sync-assets 增量【330ms 是 npm 层非拷贝】）；④r11 r0 §八挂账收口（**GC 份额 0-0.4%、无并发膨胀、166vs14=跨关伪影**；bonus_2 158ms/建=前 60 步固有收敛=vendor 禁区）。门禁：det 48/48+fixtures 6/6+vitest 89+e2e repeat3 静窗 ALL PASS（一次 1/3=并行负载污染自纠归因）+visual-diff 88.66-90.17 同带。量具 4 件入库（perf-scene/idle/toolchain/gc）+工具归档 perfopt{8,9}；报告 note/report/perf/2026-10-20-r{8,9,10,11}-*.md+总账 §八增补；勘误五条入档（驻留判定洞/唤醒税/bg 旗标/actualFps 计 tick/npm 层计时污染/观察者哑火）。挂账：幕布驻留税（前置真 GPU 口径——**本会话 sudo/su 均被禁 xorg9 不可复现**）、matchmake 点击派发管线（两态共有低优先）。注意：并行会话"滤镜槽"在飞（templeTreeBake.*/TempleScene 改动未入库），其 4 测试失败为其自身 WIP 非本战役面，零接触。）
