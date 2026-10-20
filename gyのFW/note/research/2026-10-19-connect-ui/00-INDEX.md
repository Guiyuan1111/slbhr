# 00 · 总索引——连接界面重设计调研与实施（connect-ui）

> 维护：noteidx 槽 2026-10-20 首建。口径：每件一行+mockups/ 逐件列定位；一切结论以档卷原文与 git log 为准，本索引只做导航。
> 定位：`packages/client/index.html` DOM 联机面板（`#menu`）与其连接流的重设计全程——痛点调研+ID 契约红线+三方向 mockup（UI 设计调研槽）+方向 A 落地实施记录（实施槽，2026-10-19）。未触画布渲染路径。
> 关系：总挂账挂 behavior-parity [00-INDEX §3](../2026-10-behavior-parity/00-INDEX.md)（§3 第 6 条 r8–r11 增补：幕布驻留税真 GPU 口径待复测，与本目录的半透幕布方案同域）；连接期性能优化见其 §4 r8 行。
> 状态图例：✅ 已收口｜🔄 活档｜⏸ 挂起。

## §1 件卷一览

| 件 | 一句话主题与关键产出/结论 | 状态 |
|---|---|---|
| [README.md](README.md) 调研+实施总档 | 痛点八条逐条 file:line 取证（P1 视觉与画布内官方弹窗两套系统/P2 幕布遮死 MenuScene 大厅美术/P3 无忙态可双击并发两次 connect/P4 错误进度同元素/P5 房间码抄送弱等）；硬约束=九 ID 兼容契约表（perf-client/perf-load/visual-diff/e2e lib/journey/touch 六脚本逐行依赖，"换皮不换骨"三铁律）；视觉词汇全现成（PopupBackground0000 1082×642 圆角 r≈40 雕边 ≈55px 程序化实测、StoneButton 252×117 hover 换帧，DOM 只引裁片小图禁喂 342KB 整图）；三方向对比：A 石板大厅（DOM 换肤 0.5–1 天，推荐）/B 画布原生化（3–5 天，高风险挂起）/C 神庙双门（1–2 天，二期可选项）。§实施记录=方向 A 已落地（commit 477cec0 实现+3808338 census 清单，0.3.32→0.3.33）：九 ID 原名原语义自证（探针 12/12）、装饰全走伪元素 textContent 零污染、生产直引图集零新增资产（帧坐标百分比换算，整图 border-image 不可行已证）；门禁 tsc/build/vitest 89/89/e2e route ALL PASS，journey✗2/touch✗1 判既有问题（基线 477cec0^ 同点同文复现，非本次回归）；遗留=小屏回流皮石纹边拉伸（可换方向 C 布局）、连接失败横幅 raw 错误串（0.3.32 同款非本次引入） | ✅ 已收口（方向 A 落地） |

## §2 mockups/ 速查（三份自包含单文件 HTML，浏览器 file:// 直开，1280×960 自适应缩放；图集帧 base64 内嵌；页面内保留全部契约 ID，Playwright 无头验证三份全绿）

| 件 | 定位 | 状态 |
|---|---|---|
| a-stone-hall.html | 方向 A「石板大厅」视觉仿真：半透幕布透出身后大厅+PopupBackground border-image 面板+StoneButton hover 换帧+错误区三态；右下 DEMO 控制台可切连接中/错误/建房成功 | ✅ 已随方向 A 落地转生产（与生产差异八条见 README §实施记录：生产用原生 1082×642 整帧几何、双钮并排等） |
| b-canvas-native.html | 方向 B「画布原生化」视觉仿真：连接面板搬进 Phaser 与游戏内弹窗逐像素同源，DOM 只留透明契约壳（幽灵热区，蓝色虚线示意可切真实视图）；另有弹入重播 | ⏸ 挂起（触发条件：基准脚本先迁移 window.__fw 显式 API 后再议） |
| c-twin-gates.html | 方向 C「神庙双门」视觉仿真：横排火水分流（中央口令小石牌+左火门创建/右水门加入，MenuScene 同心叠放法立绘压门楣），<1020px 回落单列 | 🔄 二期布局演进可选项（同一套裁帧资产可直接复用） |
