# handoff — AI 会话开工现状源 + 滚动日志

## 文件规范（2026-10-20 起生效）

- **定位**：本文件是 AI 会话开工时的现状速览源 + 滚动日志；只保留近 5 天条目，更早的下沉归档。
- **条目插入规则**：新条目置于文件顶部第 1 行（本规范头之下、条目区首位），全文件保持时间倒序。
- **条目格式（本日起强制）**：新条目必须多行结构化——
  - 首行：`**更新**：日期（主题一句话）`；
  - 随后接编号小节（①②③…），每小节 1-3 行，只留结论、关键数字与指针；
  - 单条目 ≤2000 字符；超长细节（证据链/引文/逐项清单）写入 `note/` 对应档卷，此处只留档卷路径指针。
- **归档规则**：条目老于 5 天，或本文件 >40KB 时，把最旧条目逐字原样迁入 `note/handoff/archive-2026-10.md`（插在该归档头部说明行之后，保持时间倒序）。

**更新**：2026-10-28（1.0 分发线落地——第一部 forest 专属 Linux 服务器包发版，与 main 0.3.x 并行）
① **分支口径**：release/1.0-forest（1.0.x 分发线，main 仍是三部开发主线）——只做打包/剪裁适配：删三部 fixture 测试 3 件+sceneState iceViews 块、CI 去 ice/light determinism 两作业、覆盖率阈值按余量实测重定 69.4/68.7/68.75/64.3、bump 1.0.0；font-census 清单随打包链文案刷新（防护网按设计红一次，本地漏跑复验被 CI 抓回——发版前全门禁必须本地+CI 双绿）。
② **打包链**：scripts/package-deploy.mjs（打包层剪除 light/ice：data 目录、Temples 图集、LevelMusic_dark、dist 内资产重复副本、tutorials 非 forest 首关；预装 npm ci --omit=dev 生产依赖，解包即用）+ DEPLOY.md（AI 接手部署手册：六步验收含 colyseus.js 真房与"仅第一部"边界断言 /api/levels 全 forest、light/ice 404）。
③ **发版**：tag 1.0.0（7f300c1）+ Release 已发（附件 gy-fw-forest-1.0.0.tar.gz 39.2MiB+sha256 由 release-asset workflow 从 tag 构建，正文=AI 部署协议全文）。云端产物下载后真包再验收六步全绿。
④ **踩坑实录**：本机 uploads.github.com 选择性阻断（api/github.com 正常、上传握手必败）→ 附件改 CI 侧构建上传；手动 dispatch 时 GITHUB_REF_NAME=分支名误建同名 release → workflow 加 ref 守卫（只认 1.0.* tag 名）；房间密码强制 4–64 位（DEPLOY 示例用 demo1）。TEMP 验收产物已清零。

**更新**：2026-10-28（并行性能线吸收批三 + 0.3.55 发版——r21+r25 BGM 出落定门/r41 离房交还，带审核）
① **r21+r25（4439dad）**：落定门与 GameScene 阻塞批内只剩 SFX(18 支)；BGM 改门后二段（门落定+1500ms BootScene.thenBgmDefer 取 warm 族 loop+terminal）+ create 后 kickBgmLoop/kickBgmTerminal 兜底（缓存命中零请求；补起三卫防晚到盖曲，终局补起须 won 相位——死亡失败曲时刻绑定不补；SHUTDOWN 摘 load complete 防累积）。门挡字节出门：general 1,647,015B/speed 343,792B/dark 812,753B。
② **r41（同提交）**：leaveToMenu 时 releaseGameBgms 六键（三族并集）先 sound.removeByKey 后 cache.remove 交还 PCM（反序被实例钉住）；重开/进房不交还，重取走 r15 ETag 304；与 0.3.48 #29 正交（场景视图引用 vs 全局音频资产账）。
③ **验证**：audio-families.test 重写 9 例（拆分恒等 loop∪terminal=族包∪失败曲、六键恰三族并集、release 先实例后缓存序）；audiofamily.mjs 新增时序断言（__fwBgmDeferAt 与各曲 startTime 晚于 __fwWarmGateDoneAt+1400ms）3/3 PASS——实测 speed 例门后 3823ms 起请求、门内零 BGM；341 测试绿+typecheck 零错+build 过。
④ **裁定**：用户指示本批后只收尾不开新批——分流表余项（r13/r14 件、r17–r40 资产族、r42/r43）挂账待令；既有 #49/#50、Colyseus 0.18 候选待裁不变。
⑤ **0.3.55 发版**：47 文件 341 测试绿（净+2）、typecheck 0 错、build 过；代码提交 CI run 40538560394 与发版提交 run 40539174844 八作业先后绿，注解 tag 0.3.55（同指 4ae5c68）+Release 已发（Latest，无附件口径）。

**更新**：2026-10-27（并行性能线吸收批二 + 0.3.54 发版——r16 三族移植/r14 件/r12 否决，带审核）
① **审核**：r16 前提核查——qoder 两族（general/speed）建立在"森林无 dark"上，main 的 light 部有 7 dark 关（142 关：general 69/puzzle 41/speed 25/dark 7），前提过时→**扩三族**移植，DARK 终局曲与 general 共用（对齐 finishKey else 分支）。
② **r16 落地（1bb5ca0）**：AUDIO_GAME 拆 SFX(18 恒取)+失败曲+三族；BootScene 暖装族预判（main.ts 深链 ?level= 经 temple.json 单例预判）；GameScene.preload 按 templeEntry.type 兜底；额度 general 关省 646.5KB/speed 1919.2KB/dark 1620.9KB（原每关全装 2,309,067B）。
③ **验证**：单测 7 例（族映射与 bgmKey/finishKey 同式等）+ 新门禁 scripts/e2e/audiofamily.mjs 3/3（speed/dark/缺省深链各只装本族，本地真浏览器实测；dark 例为三庙适配新增）。
④ **r14 件**：levelCache 无界 Map→LRU(4)。**r12 否决**：main 快照对象已复用、剩每帧一个小字面量，收益边际不值改签名——审核否决与移植实录均存档于收容档。
⑤ **0.3.54 发版**：47 文件 339 测试绿（+7）、typecheck 0 错、build 过；CI run 40530437752 八作业绿后注解 tag 0.3.54（同指 32b053e）+Release 已发（Latest，无附件口径）。

**更新**：2026-10-27（并行性能线收容批 + 0.3.53 发版——qoder r12–r43 核查/收容/r15 首移植）
① **核查结论**：用户派出的另一 AI（qoder 工作树）不是审核是开发——209 提交性能战役 r12–r43（10-21~23，基点 0.3.42）：packages 42 文件 +5799/−316、34 报告、20+ 新测试、自收口撞号 0.3.43；patch-id 与 main 全不等价。证据与逐轮分流见 note/report/perf/2026-10-27-qoder-line-salvage.md。
② **收容（d445d97）**：代码固化分支 qoder/r12-r43-perf-campaign（原工作树已撤）；34 报告+总账 §九–§四十 入 note/report/perf；0.3.43 撞号存档 0.3.43-qoder-perf-line.md；快照（607 文件≈169 万行）不入库留分支（整线压缩 25MB）。
③ **r15 首移植（fa338d4）**：staticGz 强 ETag（编码+mtime+size）+If-None-Match 弱比较/IMS 304+压缩缓存失效 mtime→mtime+size；jsonRes 关卡 API 协商压缩+内容寻址 ETag（#45 口径 max-age=300 叠加条件复验）；实测 forest_01 16,995→1,569B（−91%）/ice −85%/light −88%，304 复验全通；#33/#45 防护保留。
④ **分流排队**：r13/r14（地面缓存/选关驻留）、r16（音频族，需扩三庙）、r17–r40（资产重打包族，单独立项+换代取证配套）、r41–r43（离房释放，对照 #29 合并）。
⑤ **0.3.53 发版**：46 文件 332 测试绿（+13）、typecheck 0 错；CI run 40524048530 八作业绿后注解 tag 0.3.53（同指 88ed0bd）+Release 已发（Latest，无附件口径）；qoder 分支已推远端固化。

**更新**：2026-10-27（独立审计修复批 + 0.3.52 发版——note 一致性/发版流程/卫生，游戏行为零改动）
① **审计**：仓库级只读审计三维度 19 发现（P0×0/P1×2/P2×5/P3×12），逐项证据复核；本批修 10 项，分流见⑥。
② **note 一致性（cab78b3/6a10519）**：收容注"按新址替换"真替换（30-parity 六处、04号档§10+复现核验）；34-parity 文末补删除注；route-synthesis 去 TEMP/node 前缀；00-INDEX 35→31；r15f 补 autopsy（13 件）；rcm-l0 补引用档卷；根 README 重复括注+非版本 tag 说明；0.1.0.md 头注。
③ **发版流程（416547a）**：bump-version --desc 必填+版本链入链+同版本拒绝+--verify 拒占位（9a3f287 根因了断）；AGENTS.md/version.test 同步。
④ **安全（85f0d49）**：房间口令时序安全比较（sha256 摘要+timingSafeEqual，passwordEquals 单元+3 单测，onAuth/assertPassword 两处接入，语义不变）。
⑤ **卫生（d6ef55d）**：handoff 口径勘误（issue 清零→该批 16 件全数关闭；TEMP 归零口径=gyのFW/TEMP）；根 TEMP 3 个 md5 残留与根 note/ 空目录树清除；audit/20261026-101919 分支+工作树清除。
⑥ **挂账分流**：Colyseus 0.18（12 漏洞含 1 高危 nanoid，候选待裁档已有）；#49/#50；noUncheckedIndexedAccess 实测 304 错随 #49 推进；staticGz 预压缩可选；~/.qoder detached 工作树含 209 未并入提交（10-23 r42/r43 线，patch-id 与 main 全不等价）去留待用户裁决。
⑦ **0.3.52 发版**：45 文件 319 测试绿（+4）、typecheck 零输出、bump --verify 六处一致；CI run 40511798794 八作业绿后注解 tag 0.3.52（同指 477c484）+Release 已发（Latest，无附件口径）。

**更新**：2026-10-27（GitHub Issues 全量清偿批 + 0.3.51 发版——该批 16 件开放 issue 全数关闭（#49/#50 同日新挂账另立，见⑦）、TEMP 清库归零（口径：gyのFW/TEMP））
① **16 issue 修复关闭附证据**（#32、#34–#48）：ice 雪地碰撞+冰面摩擦移植（det 重锚 r1-ice，4870d55/ec03e06）；won 双断线补发解耦（a7d08e3）；重连 5s 护栏+tryResume 清理（c7a62b0）；冰膜索引同域化+机关视图跨关清空（1a52f66）；客户端低危七件（097a2f7）；占座 DoS 密码前置（6852825）；matchmake GET 放行（afffb28）；bump 脚本跨平台事务化（86b112f）。教训：issue 关闭曾只落一半（8 个开放 0 评论），gh issue list 实查后补齐——"自述不算完成"再次验证。
② **安全面 #45**（791501c/c3bb076）：Origin allowlist（FW_ALLOWED_ORIGINS）+WS verifyClient+CSP（内联 hash 启动提取）+/api 固定窗口限流+levelExists stat 缓存+房间 onUncaughtException 隔离+staticGz 方法闸门；vite ^6.4.5。
③ **卫生 #42/#44**：har 6×~153MB 出库+golden gzip 化（tracked 302.0→123.2MiB，2657c44）；vendor 脚本锚文本+sha256 闸门（c7b3f96）；level2 最小 schema 校验，未知 gid warn 限正 gid（负=Tiled 翻转位，1eed572）。
④ **门禁 #37/#39/#46**：CI 增 coverage/servers-smoke/repo-size（共 8 作业）；覆盖率阈值 ratchet 86.17/85.22/83.39/75.81；干净 checkout 五件（3352efe）；发版口径=CI 绿+本地门禁全绿再 tag（0a26451）。
⑤ **TEMP 清库收官**（3b823f4）：B 组五目录收容 note/**/tools/breakpoint-r15f｜breakpoint-r25d｜breakpoint-main25｜breakpoint-rpa｜breakpoint-rcm-l0（附收容注明，逐字节核验后删原件；forest_15 复活入口已改指新址）；C 组（rb1/parity-fix/散文件/rcm-l0 node_modules 40MB）直接清；TEMP 归零（口径：gyのFW/TEMP）。〔2026-10-27 审计补记〕仓库根 TEMP/ 另存 3 个 md5 对账残留文件（10-20 批次、全库零引用），审计修复批已一并清除。
⑥ **0.3.51 发版**：bump+note/release/0.3.51.md；44 文件 315 测试绿；CI 8 作业绿（run 40486874875）后 tag+Release（无附件）。本条目+注解 tag 为发版四件套补账（原发轻量 tag，已重打注解 tag 同指 c70d0d2）。
⑦ **下一步**：#50（ice 语料入 kregress）→#49（GameScene 抽纯模块）；候选待裁：Colyseus 0.18（nanoid 根治）/forest_15 批量期重设计/git 历史瘦身（filter-repo 破坏性）。

**更新**：2026-10-27（工程基建批 0.3.50——对比报告改进 A+B 全落，零游戏行为改动）
- 背景：当日三报告（自审/同行调研/对比，note/report/2026-10-27-*.md）改进路线图批次 A+B 实施并验收完毕。
- A 批：CI routes-smoke（route-node 采样 forest_01+light_02，light_01 刀锋时序不入样本）；vitest 覆盖率阈值门禁（基线实测 lines85.76/branches74.05/funcs83.05/stmts84.79，autoUpdate 已 ratchet 至当前值）；bump-version.mjs（修 README /m 缺陷后 6 文件试跑验证）；AGENTS.md 约定入仓。
- B 批：det-fuzz（3 种子×30 游戏分钟=108000 帧/900 段双跑哈希全一致，墙钟 7-15s）；语料甄别（flash-prep 实跑 validate：15 WIN / forest_02 挂起 FAIL@f1879 / forest_08·22·23 记档在案缺 JSON；主验抽检全符）+ route-kregress（15/15 ALL GREEN 约 10s + 篡改检出验收）。
- CI 首跑即抓真 bug：routes-smoke 暴露 route-node 写结果文件缺 mkdirSync（干净 checkout ENOENT，本地 out/ 为历史残留被 gitignore 掩盖）——已修。首个全绿 run 以 gh run list 最新为准。
- 发版：0.3.50（tag+Release 已发）。挂账不变：issues 迁移、PR/分支流（内核改动走 feature 分支）、colyseus testing/loadtest、eslint 选型；semantic-release 明确不做。


## 归档导航

| 范围 / 主题 | 去处 |
| --- | --- |
| 2026-10-05 → 10-14 条目 | `note/handoff/archive-2026-10.md`（前半段） |
| 2026-10-15 → 10-19 条目 | `note/handoff/archive-2026-10.md`（头部第二段，2026-10-20 迁入） |
| 2026-10-04 保真重写开工交接（需求冻结+Box2D 提取侦察） | `note/handoff/2026-10-04-fidelity-rewrite.md` |
| 2026-10-04 执行期需求冻结（三轮问答 12 项全冻结） | `note/handoff/2026-10-04-execution-freeze.md` |
| 2026-10-15 Windows→Ubuntu 移交接管简报（新会话开工指令） | `note/handoff/2026-10-15-ubuntu-takeover.md` |
| **2026-10-20 AI 会话交接简报（新开发会话开工指令，当前有效）** | `note/handoff/2026-10-20-session-handoff.md` |

今日（2026-10-20）起新条目写在文件顶部。

## 条目
**更新**：2026-10-26 六（**light 路线批收官 + 0.3.49 发版——前会话五项计划（light 路线→体验定稿→打包轮→ice 立项）全数完成**）
① **light_01 通关路线入库**（9e57372）：箱舞 mount（东推带镜箱≥1045 让缝→穿缝→越箱过东→点喷推回 988-1034 亮窗→1048 静定 {up,left} 飞越 c29 坡链）+ 伺服滑钮（亮窗实测 S∈[455,466]，走推必过冲至 473，1-2f 点喷+滑停入窗）。FSM WIN@f2914×3 逐位一致→路线 JSON 内核回放 WIN@f2943+validate 0+真服 route-node 3/3 PASS。
② **接线考古**（light_01 攻坚最大产出）：lever(g2) 体在基座台顶 (862,385) **走近即翻（sensor，不按键）**→rotMirror(1021,163) 转 90°→黄光上折→g42(1024,32) 亮→p1 沉（+90f）；翻杆不可逆——黄光永离东侧→g41(1208,736) 永灭→p2 永升台口封死⇒**双人须先过台口再翻杆**；fb 候杆驻停必须 ≤810（v34 停 859 压杆 sensor 酿无翻杆翻杆）。档卷 note/evidence/2026-10-26-light01-route/（接线表+l1both35.mjs）+note/light01-route.md。
③ **TEMP 清理**：l1*×71+l2*×8 探针全删（证据先收容）；他会在办产物（invite/parity/r15f 等 14 项）未动。
④ **0.3.49 发版**（537b71d，tag+GitHub Release）：light_01/light_02 路线+route-node+帧号镜像；**netDto 契约补 f 字段**（4277849 漂移被 netDto 测试拦下——DTO+双锚 22→23/63→64 同步，教训=扩字段提交须连跑 netDto 门禁）；版本四处+lock+README+发版记。门禁：typecheck 0/test 260/build/det 零内核触碰。
⑤ 前会话五项计划清账：1 light 路线 ✓（本批）；2+3+4 体验定稿（EndMenu/dust/popup 均已划销，无余债）+打包轮（0.3.49）✓；5 ice 立项 ✓（0.3.47 已落：51 关+TimedPusher 全链+determinism-ice）。下一块大石头=ice 通关路线产线（51 关，工序照 forest/light）；待用户裁决项不变（挂账 #2 S5 续攻/#4 风相位锚/#9 #10 UI 小件）。
**更新**：2026-10-26 六（审计批 0.3.48——GitHub issue #21–#33 十三条全修，13 commits 逐 Issue 独立提交）
① P0/P1：#28 房间密码无条件校验（joinById(roomId,true) 布尔绕过封堵，重连路径回归覆盖）；#21 限流 key 弃可伪造头（FW_TRUST_PROXY 显式采信+isIP）+authWindows 有界化（热路径 O(1)/硬限 4096 桶均摊淘汰）；#29 GameScene 复用归零 darkRt/dust 族 8 引用（resetFxState）+lastBeamPts.clear。
② 其余：#32 matchmake 非 POST 405+server 超时；#30 beamer 熄灭删缓存；#22 clock 视图自治+SHUTDOWN 销毁；#31 bgm_level_dark 全停音路径（stopLevelBgm 三键）；#23 快照校验 ROOM_COLLECTION_CHILD 驱动；#26 $filter 补两新类；#24 body-parser 1.20.9+CI 非阻断 audit；#25 ice 51 关锚（直方图+TimedPusher time 表）；#33 staticGz 穿越回归假绿双层根因（it.each 注册时求值 secretName 空串+16B 低于 1KB 门槛）——运行时构造+padding，删校验即红已实证；#27 部署文档口径统一+fw.service 占位符化+根 README 防漂移。
③ 门禁全绿：typecheck/test 260 例/build；det 三部 48/40/51 对 r0-baseline/r0-light/r0-ice 逐位一致（本轮零内核触碰）。发版记 note/release/0.3.48.md。
**更新**：2026-10-25 四（系列开发批：light 教学解析修复+体验收尾+RotMirror P0 保真修复+ice 立项+light 路线产线开工）
① light 教学层名 Tutorial 无后缀（forest 系 Tutorial_*）——level2 补分支，0.3.45 起 light 关游戏内教学文本不可见已修（4fe47ae，7 条文本复验）。
② 体验收尾（9d1adf8）：光柱浮尘（fillDustLayer/updateDust 逐字：BeamDust×几何掩膜+锚点摆动）；popup 竞态确定性修复（暖装 loader SHUTDOWN 被 reset→in-flight 登记表+清排队键）；存档联调实机 PASS（fw-temple-progress-v1 含 light_01）；EndMenu 类型变体经核早已实现（划销）。
③ RotMirror P0 保真修复（b02069e，light_02 路线子 agent 发现）：漏 oracle rotation 归一化循环+体角烧进 body（referenceAngle≠0）——rot<0 镜 11 面永久卡死、light_02 数学性不可通关。修复后内核镜角 @60f=270/90/90/0 与 oracle 实机探针逐位一致；r0-light 重锚（恰 4 关漂移=rot<0 分布）；kernel.mjs LEVELS_DIRS 三部化；四关修复后对照截图收容 img/rotfix/。
④ ice 第三部立项（564edc4）：51 关入库+LEVEL_DIRS+templeIdOf 三部化+r0-ice 锚+CI determinism-ice；timedpusher×25 唯一新机关（Phase 2）；教训=tutorials 拷贝曾覆盖 B 部 light_01（B/C 同名不同字节），已恢复并入档。
⑤ light 路线产线：两子 agent 并行（light_01/light_02，route.mjs repeat≥3 为验收）；light_02 首轮因 RotMirror 缺陷失败→修复后重派。进度见后续条目。

**更新**：2026-10-25 三（R12 光面性能战役 0.3.46——perf-light 量具+Round A/C 内核同步优化+Round B 黑幕分层；det 双锚位级全程不动）
① r0–r11 未覆盖的三个新面（光机关步进/dark 黑幕/七表同步）立量具 benchmark/perf-light.mjs（idle/scripted 双口径+全字段同构 C 段）；拆解实验定位 beamer raycast 46%/rotmirror 钳位 34%（后者 oracle 逐字语义保真不动）。
② Round A+C（1039a51）：beamer 变换签名门（全动态体变换逐位快照+epoch，全等⇒复用折线重放标记，物理严格等价）+零分配化+packed 打包串缓存——light 中位步进 -27.8%（溢价 136%→70%）、sync -28.7%/encode -33.3%、heap/600 步 -44.7%。
③ Round B（f96914f 子 agent 并行实施，主会话逐项验证采纳）：dark 黑幕静态/动态分层——每帧 erase 22→3、页内 A/B -44%/-38%、API 逐像素等价实证；并发现 0.3.45 真 bug：fetchTempleTime 漏传 levelId→light 黑幕 1s 后失效——已修（dark 四关复拍带内一致）+收容件 serve8787b 根路径五级修正。
④ 报告 note/report/perf/2026-10-25-r12-light.md；门禁终态：tsc 0/vitest 226/build/journey 7/7+4/4/lightsmoke 4/4/det 双锚全绿（Round A 提交前后双跑）。
**更新**：2026-10-25 二（灯光神庙 0.3.45 可玩化里程碑——内核六机关+客户端全链+dark 黑幕+40 关视觉普查中位 90.26）
① Phase 2/3 全记录见档卷 02/03 号档。内核：lightRaycast（transparent 穿透/mirror CrossVS 反射/sensor 标记）+六机关类+MechManager 逐组派发（|| 连续态 verbatim+无源组不重置）+液体冻融（蓝冻红融/角色上推 0.5m/余体转 static/冻面反光/iluminated 不清=原版 quirk）。level2：六类解析+55→水冻砖 remap。
② 客户端：temple 前缀参数化（templeData/BootScene/TempleScene）、bgm_level_dark、六机关视图、schema 七字段（netDto 契约同步总量锚 57——测试拦下 BeamState 漏 defineTypes）、dark 黑幕 RT MULTIPLY+erase（设备光晕 1===state 门控——light_30 65.15→97.24 修正实证）。
③ 普查：40 关加载初态中位 90.26（dark 关全数 94.6+，非 dark 87–92.7 带）；popup 纹理竞态=既有良性（forest 同流程同现）挂观察项。
④ sfx 全链：audio 四键（Freeze/Melt/Slider/LightPusher.mp3）+drainSfx 四 kind+ForestRoom 冻融广播；端到端冒烟 scripts/e2e/lightsmoke.mjs（FORCE_DOORS 既有钩子）：light_01 开局→通关→活房间 advance→light_02→再通 ALL PASS——第二部装载/房间/门/胜利/换关管线全通实证。
⑤ 挂账：light 通关路线产线（route repeat≥3 正式路线，正式路线工序照 forest）、EndMenu 结算板类型变体（puzzle/dark 布局+FinishStone 变体帧）、dust 粒子。门禁：tsc 0/vitest 226/build/journey 7/7+4/4/lightsmoke 4/4/det forest 48/48+light 40/40/netDto 22。

**更新**：2026-10-25 一（**第二部（灯光神庙）立项开工——Phase 0 取证+Phase 1 数据入库/det 分部基线/CI 拆分，第一部零影响实证**）
① 用户令开发第二部并保第一部结果。对象=output/B（light，40 关+共享 forest_01 教学关，全 39×29）。01号档取证：机关谱普查（解析器同款口径）——6 类新机关全光机制（beamer/lightpusher/boxmirror/rotmirror/infinitemirror/slider），共用 10 类内核已有；A/B Objects.json 字节一致；资产全系列共享（每部仅差 TempleAssets/GameName/TempleHall 三件）；关卡带 per-level time，新增 dark 类型（bgmKey 待加映射）。
② Phase 1 落地：data/light 入库 41 文件+levels.ts LEVEL_DIRS 增目录；冒烟 40/40 解析+建世界+60 步零失败（unknown 谱与普查逐项吻合=记录不阻断语义实证）。det 门禁分部制：--filter 参数+比对段双计数缺陷修复+新锚 det-r0-light（40 关）；forest --compare r0-baseline --filter forest 48/48 ✓=零影响直接证据；CI determinism 拆双作业。level2.test 权威直方图锚收窄 forest_*（light_01 入 tutorials 曾破 48 计数）。
③ 环境注记（已结案）：同机另一会话 ruffle-web 测试（42 webkit 进程，负载峰值 17）致 journey 渲染帧饥饿多次超时——仪表化诊断定谳（按钮几何恒定/零动画/非 busy，rAF 实测 1.7fps vs 空闲 21fps=合成器饿死非代码问题）；同机空闲后复跑 journey 7/7+deathretry 4/4 ALL PASS。教训：同机并行会话重度浏览器负载下 e2e 门禁不可判，先仪表化排除代码因素再等窗口重跑。档卷 note/evidence/2026-10-25-light-temple/（00-INDEX+01号档+tools/smoke.mjs）。
**更新**：2026-10-24 六（勘误续作手册 §2——六部原版快照全在本地，"需 [人工] 获取"系误记）
① 用户指正后实测：`Fireboy-and-Watergirl/output/<A..F>` = forest 48（本作）/ light 41 / ice 53 / crystal 39 / elements 39（七元素小关集）/ fairytales 32，关卡数与各部 temple.json 对账一致；A–E 同构（gameIndex.html+js/init.<hash>.js），F 异构（index.htm+fairy-tales.min.js 单文件，反解钩子先验）。
② 手册 §2 已改为"六部清单表+取证即反解对应快照"，Phase 0 同步勘误。续作选部即开工，无外部依赖。
**更新**：2026-10-24 五（经验总结与续作开发手册建立——note/next-games-playbook.md，供系列后续各部开工）
① 内容：可复用底盘（引擎骨架/机关内核全谱/工具链全家桶/数据格式）、续作工作量地图（oracle 取证为最大前置——本地快照只含 Forest，无锚不实现）、方法论八条（量具先行/程序化验证/单点采样会撒谎/决定性实验/bundle 反解仲裁/基线分叉纪律/门禁全绿/档卷文化）、踩坑清单按域分组（发版五处版本含 lock/量具口径/Node 坑/文档 anchor/渲染引擎/音频生命周期）、续作五阶段 SOP。
② 已登记 00-INDEX 快速定位表。后续各部立项时在该手册追加 §8 取证要点。
**更新**：2026-10-24 四（静态相机 0.3.44——用户裁定固定全图：不跟随不缩放，bonus_2 整图入画；恒定性 (0,0)/99.67% 实证）
① 用户裁定相机固定显示整图（跟随/缩放会藏机关、不利思考）。cameraRig.setupStatic（整关适配钳≤1 钉关卡矩形中心、冻结恒真）+GameScene 摘除动态接线（双角色中点跟随/距离自动适配/滚轮/捏合/拖拽监听/逐帧弹簧步进）；原版 CameraManager 动态语义全保留 rig 内（单测覆盖，可恢复接线）。
② 视图：标准 47 关与原 settled scroll(16,16) 逐位相同（forest_01 96.02/offset(0,0) 同带不变）；bonus_2 由裁切+跟随改整图入画 scale≈0.857（左右黑边 105px/底墙到边 83.6%），与 oracle 取景自此有意偏离（对拍 rate 预期 ~74）——01号档 §6 补记，§4"渲染零缺陷"结论不受影响（差异仅在取景）。
③ 恒定实证：两轮独立房间采样互比 (0,0)/99.67%（残差=boxheavy 箱堆动力学）。门禁：typecheck 0/vitest 222（+setupStatic 3 例）/build/journey 7/7/deathretry 4/4/det 48/48@r0-baseline。代码 commit d7e4b26，证据 note/evidence/2026-10-24-visual-verify-48levels/img/bonus_2-staticcam-*。
④ CI 红一次（40065895641）：发版批漏 package-lock.json（L-06 版本一致性测试查根/三子包+lock 五处），lock 0.3.43→0.3.44 补齐修复——教训：版本 bump 必含 lock，版本测试随发版批复跑。

**更新**：2026-10-24 三（bonus_2"对齐"裁定实施——深挖证伪视口归因，稳态采样 94.54 证明零缺陷，无需修复）
① 用户裁定 bonus_2 视口对齐 oracle。实施核查中逐层证伪：叠加图证静态全对齐（±26px 视差系条带目测误读）、RGB 均值双端一致（色调差误判排除）、黑边差系缘饰藤蔓+时钟带测量噪声（"oracle 铺满"假设不成立）。
② 残差图定位真差异=动力学体（boxheavy 箱群/升降板/链），开屏 1s 演化两端物理微差放大；决定性实验：两端稳态采样（oracle 600 帧/我方 10s）→ rate48 79.3→**94.54**、mad 7.22、offset (0,0)，全 48 关第 5——**渲染零缺陷，无需任何修复**。
③ 量具注记：我方截图物理帧数不可控（握手期物理已跑）、t5 撞转场动画中段；运动关对拍应用稳态窗口。01 号档 §4 已勘误重写（原视口适配论作废）+收容 residual/steady-diff 证据。
**更新**：2026-10-24 二（48 关加载初态双端视觉核实全量完成——零锁链级错位；bonus_2 视口口径待裁）
① 用户令"逐关核实与原版一致、防再现锁链错位"：visual-diff 基建参数化为单关采集器（oracle 跳关+我方入房+480×360 对齐差分），主会话冒烟 forest_01 后 3 子 agent 并发采集 47 关，主会话独立重算全量验真（levels-verify.json 48 行与 agent 报数逐关一致）。
② 结论：**48/48 无结构性渲染错位**——地形/机关（滑轮链/杠杆/按钮/透桥/箱/风机/Roman）/门/钻/出生位全对齐；rate48 79.3-96.5（中位≈90.2），低密带抽查 forest_27/06_1 目检零错位。
③ 共性口径差两项（非缺陷）：顶部时钟石牌带 ~33px（oracle canvas 内画 vs 我方 DOM 采样期隐藏）；动力学体 60 帧初相位微差。
④ 唯一离群 forest_bonus_2=79.3：全 48 关唯一超高关（39×35），oracle 视口更铺满（左右黑边 22 vs 我方 48）致 ±26px 边缘视差；**机关本体零错位**（滑轮链修复在关内复核通过）；对齐与否属相机适配口径决策，呈报待用户裁定。
⑤ 证据档 note/evidence/2026-10-24-visual-verify-48levels/（01 号档+全量 JSON+img 样张+tools）；共享双服已停、TEMP/pvis 已清。
**更新**：2026-10-24（P-03 S 档验收链结算：双关内核 WIN 路线入库；MC/真服受阻转挂起族）
① 整关路线重建完成：统一「循环梯子」架构（岛链→东升→缝降→r17 滑降→风井电梯→runway→r14→mega→roman 双人循环渡板抬升→高台→终跳门），forest_14=forest_14_1 逐位同轨（差异瓦片仅东塔区不经过），双关 winF=3026、15 钻+双门+零死亡、validate 退出码 0；路线入库 scripts/e2e/inputs/routes/ 两份。
② 机制要点：roman 板=中性平衡跷跷板（质心=枢轴，±19° 双停位，任何冲量都摆）；go 岛链在 r18/r19 檐下压顶（滑翔发射窗仅 ±6-9px）；出生嵌地板需空置≥10f 再动；门不校验钻石（验收须另查 15/15）。
③ 门禁结算：optimize 8 轮无净改善（1302/1780 方向致命属架构级）；MC 0.0%×3×2 关；真服 e2e 0/7（含 offset 扫描）——根因=开环平坦表承载不了闭环时序敏感段（岛链滑翔/板态双人编排），同 02/05 MC 架构墙族。
④ 账目处置：14/14_1 自豁免账转「内核 WIN·门禁受阻」挂起族（豁免 15→13、挂起 2→4，终态 25/48 不变，「真可通关」11→13）；det compare 48/48 位级一致；攻坚档案=evidence/forest_14/02号档+tools/p03-route（21 件可复跑）。
⑤ 下窗口选项（02 号档 §8）：抖动感知岛链重排 / autosearch-MC 评分 / 板段单人化重构 / 用户裁定验收口径。


**更新**：2026-10-23 晚（P-03 S 档数据分叉落地+内核探针双关全过；剩余路线/MC/真服验收链）
① 本窗口缺陷五连修全推 CI 绿：爬梯双影 af9567a、换关幽灵 c392a76、顶栏压钟自动收起 527ba59、滑轮链渲染 bab4c02（oracle bundle 反解+双端截图对验）、裁定销账 b51338e。
② S 档定案 cb32（丙删楔四瓦+乙门台整行下移+门随移，8px 不可行改整行 32px）已提交 865a0fb；落地前程序化校验抓出并自纠"西墙列 r8c0 被误清"豁口 bug。
③ 内核探针（真实数据）：14/14_1 × 起跳窗 {272,292,312} 全过 phase=won；V0/V-c/V-b32 失败复现 17 号档封印（rise 38.5 截停/apex 差 3.8px）。工具收容 note/evidence/forest_14/tools/p03-s/。
④ det-r0 基线重锚 c2b5fde：仅 14/14_1 两行变，余 46 行位级不变，--compare 48/48；直方图守卫随分叉更新（SLOPE_A 760/WEDGE_D 624）；门禁全绿（vitest 219/build/journey 7/7/deathretry 4/4）。
⑤ 勘误三条入档：14 与 14_1 Ground 实有 r10-r12 东缘差异；f1945 路线未入库已失传（工序③须整关路线重建）；蓝图楔面瓦位误写。分叉建档 note/evidence/forest_14/01号档；根 README 账目已注"暂留豁免账待验收链完成"。
⑥ 下窗口：整关路线重建（内核初排→optimize→validate）→ MC≥98%×3 → 真服 route e2e → README 转计绿。

**更新**：2026-10-23 下午（P-03 S 档试点开工：蓝图落地，数据改待下窗口；全程无子 agent）
① 用户裁决落地："按照你的建议进行开发"=P-03 S 档试点（14/14_1）获批 + forest_05 剔出缺陷关线转复活预案；colyseus 升级两路与 48 关量具仍未裁不动。
② S 档实施蓝图已落 17 号档 §6：门台/双楔/高台对象在 forest_14.json Ground 层逐格定位；三案推演结论=任何单案不足（升量缺口 3.8-7px 与楔面过顶相互咬合），最小可行组合预计乙±丙；验证工序六步（内核探针→路线续攻 f1945→MC≥98%→route e2e→分叉建档）。**数据改与探针实测须成对**，本窗口时间不足未动数据。
③ forest_05 口径勘误：根 README"判死路呈证待审"→复活预案线（05 号档 oracle ORACLE_SOLVED/06 号档 WIN@f1738）。
④ M12 全线收口（cb4a21c，停工线前完成）：snapshotValidation 接共享 DTO 全量清单；真局探针实证修掉两处既有隐患——"角色缺席≠schema 漂移"（首快照早于对端入座+L-01 席位释放均合法缺角，原校验混入非 schema 语义，e2e 从不捕获 console 故从未暴露）与 doors 实为单条目 Schema 非集合；探针归零+219 用例/det48/journey 全绿。M12 剩余仅消费面 st:any 换生成类型（低优先）。
⑤ 14:00 高峰期停工令执行：cb4a21c 提交后停，工作树净，TEMP 已清。

**更新**：2026-10-23（0.3.43 发版：M12 相机接线+交接复查批+四槽开发）
① 交接审查：0.3.41/0.3.42 交接 AI 成果合格（核心门禁亲核+四高风险 diff 逐 hunk 无实质缺陷），唯一失配 DEPLOY.md Node 版本已修（233e3d3）；盲区补验 e2e 11 跑 11 PASS/视觉带 91.11-92.45 无位移/H4 内存有界证实——证据 [evidence/2026-10-23-recheck/](evidence/2026-10-23-recheck/) 01-04。
② M12 相机子系统接线落地（ec3e057）：GameScene 2102→1950 行，视觉带 repeat5 中位 92.53 无显著位移，M12 剩共享 DTO 接线（草案 9eaf451 已备：8 类 48 字段+21 例漂移单测）。
③ 验收自动化：M4 clipboard 抽模块+7 例（e6a47e8）；M3 journey bgm 场景 12/12（c287bc3）；CI actions v4→v7（9813dc2）。
④ 待用户裁决四件：P-03 范围（17 号档：S=2/M=8/L=15-18 关，双口径警示真可通关仅 11/48）；forest_05 口径张力（oracle 实机已解 vs README 待审）；colyseus 0.18 立项（调研档 8b218cf：L 级 2.5-3 槽，B3 onLeave 语义坑+无中间态；Plan B=nanoid overrides 0.5 槽）；48 关视觉量具扩种。
⑤ 发版：0.3.43 门禁全绿（217 用例/det48/e2e 十场景/route f01+f12/audit 0 critical），release note [release/0.3.43.md](release/0.3.43.md)。

**更新**：2026-10-21（**🚢 0.3.42 发版：M12 渐进拆分 + T10 平台电机声 + A 槽 L-02/L-01 + P-01 静音**。①M12 按用户裁定走渐进拆分：机关平滑 `scenes/mechSmoothing.ts`、快照字段校验 `snapshotValidation.ts`、平台声 `scenes/platformSound.ts` 抽为纯模块并接入，新增 14 例单测；相机子系统与共享 DTO 仍挂账（见 `note/audit/2026-10-21-code-audit/02-medium.md`）。②T10 平台电机声由全局单发改为逐台实例（起步/限位停/反向重启），SHUTDOWN 与整轮复位统一释放。③A 槽：L-02 won 相位刷新/重连回座补开结算（`openEndMenu`+`endMenuShown` 幂等），L-01 终局爬梯幽灵隐藏；L-01 因共享工作树卷入 `5225d74`，未改写历史，归属见 `note/issues-2026-10-20/A-server-room.md`。④P-01 按用户裁定：twoRows 隐藏钻石行保留空拍但静音。⑤门禁：16 文件/172 用例、build、det 48/48 位级一致、e2e pause 11/11·leave 3/3·refresh 3/3·wonrefresh 6/6·rejoin 3/3；f12 repeat3 ALL PASS（winAt 12989/13477/12967ms，判定墙钟抖动，0.3.39 ~268ms 存疑按环境漂移结案）。⑥版本四处+lock+README 统一 0.3.42，发行说明 `note/release/0.3.42.md`；遗留：M12 相机/DTO、LAN 剪贴板手测、速度关 BGM 听感、烘焙内存峰值、真机触屏/弱网。）

**更新**：2026-10-20（**📋 交接简报就位（用户令"写好文档，交给另一个 AI 开发"）**——`note/handoff/2026-10-20-session-handoff.md`：使命与立身原则（完全复刻默认+原版优化须先审后行）/八条铁律/架构与门禁全家桶数字（vitest 126·det 48/48·新口径带 90.55-92.86）/0.3.40 收盘状态/待用户裁决六项/下一波队列（A 槽客户端余量三项+T10+f12 复测）/八条血泪教训（审计误报四例·仪器伪差·tag 字典序·深链兼容等）/文件速查/开工三步。归档导航已登记，总导航快速定位已挂。后续会话以该简报为开工第一读物，动态仍看本文件置顶条目。）

**更新**：2026-10-20（**🚢 0.3.40 发版：issue 批 20 条收官（17 修+3 证伪）+P-02 全收集庆典+L-06 版本收口——协调方统一发版**。①issue 总账：17 修（B-01 时基漂移 Blocker/H-01/H-02/M-01/M-06/L-01/L-02 房间七件；M-02 路径穿越/M-04 孤儿/M-05 生产链/I-01 healthz/I-02 vitest 5.0.5/L-04 密码门槛 基建六件；H-04 重连/L-05 邀请链接/L-04 客户端半 DOM 三件；M-03 STRICT+13 房间测试/L-07 调试定时器/L-03 注释对齐 门禁真实化三件）+3 证伪关闭（#4/#10 子项/#20 余量）；总表与逐条 hash 见 `note/release/0.3.40.md`+`note/issues-2026-10-20/`。②**P-02 落地含字节真相修正**：oracle firstComplete=全 48 关 3 星 100% 首次达成庆典（非单关首通，提案前提有误已按字节改）；星门保留在置位侧；fw-gamecomplete-v1+firstComplete 双旗；呈现 launch=oracle bare start clearWorld=!1 等价；semcheck 11/11（evidence/p02-complete）。③门禁总态 vitest 126/126/det 48/48/f01+f12/journey 全套/touch 6/6/visual-diff 92.54 带内/audit 生产树 0 critical。④L-06 收口：根/三子包/lock/README 统一 0.3.40，#17 关。⑤f12 winAt 确定性右移 ~268ms 存疑挂账（det 位级一致+服务端零触碰，P-02 档卷 §存疑）。⑥用户审批流新例：P-02 按批准字面实施但字节真相与提案前提有出入——后续此类"批准后字节修正"一律如本条方式显式回呈。）

**更新**：2026-10-20（**⚖️ 新工作线开启+首裁：原版不合理优化线（用户令"关音乐就该全静…优化之前原版不合理的地方，必须经过我的审核"）**。①方针：此类优化正式立线，**任何一项必须先经用户审核批准才可实施**；流程=提案卡（证据/改法/影响/成本）→用户审→批准派槽→回验收；基线关系=保真为默认、优化为例外且逐条裁定。②首裁 **T7**：关音乐即全静，保留我方 music 门覆盖胜负短曲，不做 oracle 免门忠实向（14 号档 §未实施 已改"已裁保留偏差"）。③提案池开张：`note/research/2026-10-behavior-parity/16-original-improve-proposals.md`——P-01 twoRows 隐藏行照发音（S）/P-02 CompleteScene 触发语义（原 #34 并入，S）/P-03 缺陷关批量重设计（15 豁免+02/32 挂起，L×N 须裁范围）/P-04 征集机制（issue 带 original-optimize 即入池）；全部待审未动码。④issue 批进度：L-07 关（17/20）→M-03 关（18/20；STRICT=true 置红+allowlist 空【48/48 收集零异常，"假绿"机制成立但无真异常藏匿】+房间集成测试 13 例，vitest 119/119）；开放仅余 L-03（待 0.3.39 槽交还 GameScene）/L-06（0.3.40 发版时协调方收口）。）

**更新**：2026-10-20（**🧩 13 号档遗留八项收尾（0.3.39）——四修两划销，两划销系复核证伪**）。
①**复核证伪划销**（用户批复照准，证据链全文见 13 号档 §实施记录(flashp1)）：**#22 MuteButton=oracle 死代码**——全 bundle 0 实例化（UIState/LevelUI 两处 import 均被 IIFE 形参遮蔽，this.muteButton 3 处纯读零赋值），oracle 实际从不渲染静音钮，补件=背离 oracle；**#17 TempleSelector=multi 形态专属**——仅 MultiHall/MultiMenu 实例化（:1956494/:1961502），单机形态 startTemple 直 fade("levelMenu")（:1941847），我方单神庙形态本就该无此件。
②#13 NewSign（985914a）：TempleScene 节点静态贴片（+40/−20 布局尺无 tween）+progress played 集（fw-played-v1）+进关 markPlayed（oracle setPlayed :1935016 同语义，联机时点注记在案）。
③#41 LoaderBar（2ae3a9b）：BootScene buildLoaderBar 逐参复刻 :2164711（crop 200×20/Holder/Title anchor.47，进度≡onFileComplete 百分比同源，COMPLETE 销毁）；PreloaderAssets 两侧字节一致，+1 文件 ≈4KB。
④#9 板缩放自适应（c16e77e）：buildBoard 按 fixToCamera :1851667 公式 s=min(1,min(W/帧宽,H/帧高))；现视口 s=1 与旧值逐位恒等（零视觉差口径），行程恒等式不变形。
⑤R 键黑幕（9d1fdb5+92eb6de）：restartWithFade 模块级信封，__fwRestart/KeyR 键鼠同路归一（oracle 键盘仅 P 无 R，R 属我方 E1 扩展、retry 本走 fade）。
⑥门禁：tsc 0/build 3.98s/vitest 106/106（基线 95→106 系并行 B-infra 2e74e54 vitest 升级）/e2e f01=39468+f12=13075 PASS（f12 首跑 FAIL=末段 CDP 抖动，复跑+干净 worktree 复证非回归）/visual-diff 92.11 最优平移 (0,0) 同带/det 零物理交集。
⑦并行槽冲突两起处置入档（985914a 前身误入他槽 main.ts WIP 已拆分重做；update-index 相对路径教训）；#35/#34 范围外原样保留。

**更新**：2026-10-20（**🔨 审计遗留大批实施（0.3.38）——38/15/14 三档 10 commit，F1 前提复核被推翻系对拍器伪差**）。
①F1 冰膜复核修正：oracle iceGraphics 建时 visible=false（@1666560）、仅 55 型瓦片/光束冻结可点亮，森林 58 图 0 用例 ⇒ 恒不可见；38 号档「423 精灵缺失致像素差」判为对拍器未合成祖先组可见性的仪器伪差（与 F5 同族）——按字节语义落隐藏覆盖层，像素零影响，水体关分数上行预期作废。
②F3 四件逐 commit：hanging_base 同位第二精灵/wind_base_light 灯层(组色 tint)/pulley_base 改挂双板位(forest_04 实证 762px 错位)/lever_stick_light 换帧（「不随杆旋转」亦系对拍器局部角伪语义，旋转行为保持）。
③F2 相机 settled scroll 改 oracle 关卡矩形语义（checkBounds @1845100）：W·h<realW 钉关卡中心——44/48 关 ±16px 系统差归零，visual-diff 最优平移 (5,−6)→(0,0)、零偏移项 80.7→92.0。
④15 号档 Top3：平台灯组色 tint（221 台面五色）/风机关 base 400ms 延迟停帧+effect 相位常驻（oracle 400ms 窗 quirk 原样保留）/暂停全画面静帧（scene.pause("Game")+SHUTDOWN 钩子 resume，journey pause 9/9）。
⑤14 号档：T1/T9 复核划销（0.3.36/0.3.37 已覆盖）；落地 T2+T3（finishKey 选 bgm_finish_speed+终局补停 _speed）、T4（GameScene SHUTDOWN 统一停音收泄漏）、T5（fx=总静音三处同步）、T6（music Game 态即时，oracle 叠播 quirk 不移植记偏差）、T8（menuMusic fadeOut 500）；T7 待用户、T10 随机制批。
⑥门禁逐批全绿：tsc 0/vitest 95/95/det 48/48@r0-baseline/census 18446 PASS（F1/F3 纯精灵层物理零交集）/e2e f01+f12 PASS/journey pause 9/9/visual-diff 90.77→92.84→92.01→92.03 带内。
⑦commit 链：fa27b8b→8ad63f6→4cc9886→e6111e5→64b099d→04005a5→6884ba8→3477519→83a8bef→884457a+文档发版；档卷 38/15/14 各 §实施记录；TEMP/auditfix 已清。

**更新**：2026-10-20（**🔧 journey/touch 工具两件三查清账——挂账 §3-6 销账（`3caa1cf`+`ac1ee09`），新基线 journey 7/7、touch 6/6**）。
①journey「联机面板弹出并预选下一关」×2：按 0.3.12 活房间 advance 语义改写场景 1——旧断言随语义退役（继续=net.advance 同房换关，不再回大厅弹面板），新 7 项：phase=won 权威闸/双端 levelId 回声同房留场（房间码不变）/面板不弹出+EndMenu 关+Game 重建（0.3.37 黑幕 500ms×2 包络，全程状态轮询零写死 sleep）/ready→started/席位保留×2/权威时钟续走；修复前=1/3 后 Crash（menu 填充超时），修复后双跑 7/7 ALL PASS；self-acceptance §三 L3 行同步改写。
②touch「tap 跳跃 Δy=0」：定谳非内核开关/坐标换算——Playwright 1.63 `touchscreen.tap` 并发齐发 touchStart/End（coreBundle.js Promise.all），按钮同帧 down/up→两条 input WS 1ms 内到达→服务端 tick 意图跨度排水同一步消费对消（ForestRoom.ts:348-353；FW_DUMP 字证 `step=50 at=821ms up=true / at=822ms up=false` 同步对消，物理步采样 up=false）；纯页三路径+应用三层隔离+CDP hold 0-150ms 扫描全过佐证；探针改 CDP Input.dispatchTouchEvent 顺序注入+人手量级 90ms 按压（同款原语、touch 合成路径全真），Δy 0.0→30.7/32.5px 双跑 6/6 PASS。
③账面：parity INDEX §3-6 已迁销账区（编号保留防引用断裂）；connect-ui README §门禁数字/§既有问题两行注收口；挂账三件（journey×2+touch×1）全清。取证脚本与 dump 属临时件已清，字节证据已固化进 touch.mjs 头注+INDEX 销账行。

**更新**：2026-10-20（**🎬 UI 转场动画保真修复落地（0.3.37）——13 号档五批 25 项，等 38 号档完工信号后实施**）。
①换屏黑幕 state.fade（缺失 Top1）：新增 transition.ts FadeScene 顶景（500ms Linear 入/出+Loading 字 800ms/300ms 点循环+重入丢弃门，bundle 字节复刻），接线六换屏点，面板钮去即时 stop 由黑幕统一停；EndMenu/GameOver 出现保持裸切（oracle 同构非遗漏）。
②面板弹簧滑入（Top2）：buildBoard 去 Back.easeOut 改逐帧弹簧（2.3/0.7/1.5H/dt 钳 0.04）+黑幕跟板动态，六面同享；关闭滑出+Complete +1000ms 收尾+暂停解除 requestClose。
③按钮按压包（Top3）：StoneButton hover→按压语义+label 0.95+pusher 音（fx 门控），Menu Play/?/齿轮/菱形节点/BackButton/显示关卡数同族；DOM CSS hover 未动。
④结算面五件（Top4）：拍链 oracle 实参精确配对（twoRows 700/1400/1400/2100）、星碑分段 to_N 激活死代码键、popupArrow 末拍恒亮、Continue 同拍启用、时限 alpha 0.7；顺带修正 13 号档未察的 twoRows 隐藏行少一拍音偏差。
⑤MenuScene idle（Top5，**字节真相超审计记录**）：oracle 光柱 8 根 x 全 0=屏心堆叠扇（旧「柱间均布」2026-10-06 校准无 bundle 支持，已废重写），蜡烛 ×4 组挂屏心 lissajous（旧 yoyo 废），glow 归 1，头注勘误——布局变更已档卷注明，建议后续实机并排目验。
⑥门禁：tsc 0/build 3.80s/vitest 95/95/e2e f01+12 repeat1 PASS（winAt 39471/13461ms，f01 基线带零位移——黑幕不触服务端锚定时间线）/visual-diff 92.80 同带/det/fixtures 零物理交集。遗留 8 项（#13/#22/#35/#34/#41/#17/#9/R 键）逐项原因见 13 号档 §实施记录。
⑦commit 链：ef68c96(B)→283d976(D)→6e395b0(C)→fe3353c(E)→057cf4c(A)+档卷/发版；TEMP/uitrans-fix 已清理。

**更新**：2026-10-20（**🏗 文档结构优化（用户令"优化项目结构与 note 内容"）+ tag 缺口收敛始末**）。
①新增 `note/00-INDEX.md` 总导航（`38f8ffe`）：快速定位/五研究域/报告版本/规划方法逆向证据/归档导航；立规则——新研究域必带 00-INDEX 并登记、新挂账一律进行为复刻 INDEX §3。
②四研究域索引补齐（A 槽 `d5befc9`）：fidelity（35 档+tools 速查；27-29 缺号已注记）、autoplay（03 号档断点保留）、perf-hotspot、connect-ui 各得 00-INDEX；⚠ 已警示：fidelity 05 与 30-37 两期所用 bundle 版本不同（2,273,196B vs 2,218,873B），字节偏移不可互查。
③handoff 结构债清偿（B 槽 `2bea6ec`）：10-15→10-19 共 31 条逐字迁 archive-2026-10.md，本文件 77KB/最长行 4397 字符→6.8KB/29 行；零丢失双校验 PASS（条目数 34=31+3、字符数恒等、排序 md5 一致）；新格式规范头生效（多行结构化、单条 ≤2000 字符、5 天或 >40KB 归档）。
④§3 挂账 2026-10-20 重提取（C 槽 `29febc8`+本槽 `7900ab5` 后修正）：挂账 10 条+销账 3 条，旧六条逐条核最近证据不照抄；待核小件并册（journey/touch 三件、visual-diff 漂移、滤镜仿射四处、连接面板遗留两件）。
⑤tag 缺口收敛（**更正 2026-10-20 审计条目的错误观察**）：前条"tag 止于 0.3.9"系字典序+tail -5 抽样误读——0.3.10-0.3.31 一直有 tag；缺口仅 0.3.32-35 且远端已在（并行工作流所打），本地重打冲突后删重复+fetch 收敛；现 0.3.1-0.3.35 全覆盖 36 tag、本地=远端逐标签一致、四标签锚定正确发版提交；惯例=今后每版随手打注解 tag。§3 原 #11 已移销账区。
⑥根 README 对齐（`02183c0`）：0.3.35、vitest 应 95/95、det 锚 r0-baseline（旧 r32）、文档入口增总导航。遗留核毕（2026-10-20）：账目 25/48 对 handoff 归档 10-15 终裁条目核对属实（豁免 15=原 12+08/23/24 三案用户终裁保原样），README 已补豁免全名单并增 forest_05 待审项。
**更新**：2026-10-20（**🔍 文档-事实相符性审计（用户令"检查文档描述是否与事实相符"）——三处漂移全修正**：①README 版本段 0.3.34→0.3.35（滤镜版漏记）+战役行 r0–r7→r0–r11 补 r8–r11 续账一句；②00-INDEX §4 补 r8–r11 四行（并行战役 0.3.34 漏更索引）+标题/引言口径扩"七轮+r8–r11 续账"；③总账标题"七轮总账"→"总账（七轮收官+§八 r8–r11 增补）"。其余全查属实：13 个被引 commit 逐个 cat-file 存在、r8–r11 四报告/量具四件（perf-scene/idle/toolchain/gc）/总账 §八/0.3.33-35 发版记齐、templeTreeBake.ts+TempleScene import/menu-fit/setBusy 代码声明属实、connect-ui 与 fidelity 目录在库（fidelity 档卷无索引系既有惯例非漂移）；门禁复现：tsc OK/vitest 95/95/det 48/48@r0-baseline 2.3s/build 4.11s。观察项未动：git tag 止于 0.3.9+V0+checkpoint-20261014（0.3.10 起未打 tag，发版惯例待用户定夺）；00-INDEX §3 挂账口径自带"2026-10-18"日期声明系历史快照，r8-r11 挂账见 §4 与总账 §八。）
**更新**：2026-10-20（**🌳 选关树浮雕质感还原落地 `8e56200`+`fa17e12`（0.3.35 独立成版）——用户令"自己开发滤镜还原"；并行 r8–r11 战役 01:24 已切 0.3.34，滤镜提交落其上故另发 0.3.35**。①**兼修重大保真暗病：edges 按 `_id` 连接**（oracle bundle:45363-45364 实证）——旧 TempleScene byId(lv.id) 错连 47 条中的 41 条，树形长期大面积错接，1 星进度下不可见故未暴露。②新增 templeTreeBake.ts：BevelFilter（t=180/200、dir±1、outer）/OutlineFilter(3,0)/ColorMatrix(1.7×tint) 全链逐操作 fp32 CPU 移植——GLSL 循环展开（t=200→3 采样、t=180 fp32 累积→4 采样）、UV 裸步长怪癖换算（onePixel 声明未用）、半 texel 采样、unorm round-half-up、SAT 加速+分块行任务；create 平色兜底 + 8ms/帧分帧烘焙（全同步 ≈1.07s→分帧成立），完成 addCanvas 三纹理 big/all/done（深度 −7/−6/−5），节点/按钮/彩带未动。③oracle 对拍（同进度 1 星 1280×960）：47 边×3 中线点 49/49 |diff|≤10/通道、±3.2px 法向凹凸方向 50/50、密集区 778,496px 全通道 ≤10 占 97.56%（通道均差 ≤0.94）；层字节 vs oracle RenderTexture 回读 big 94.80%/all 97.02%/done 99.82%；残余偏差四处入档（水平仿射 ~1.5e-3+0.25px＝FilterTexture texel 1037 vs 逻辑 1036.8 假说存疑待核、边缘带 2.4% 亚像素相位、中线 ±2 窗 18 点未中但 ±10 门禁全过、金层近边采样认知修正）。④门禁：tsc ✓/build ✓/vitest 95/95（原 89 族+新 6 断言）/e2e f01 repeat1 PASS（winAt 39472ms）；与 r8 画布冻结改动（main.ts setBusy 面）零交集。⑤档卷 37 §滤镜还原（GLSL verbatim+三层配方 f()+对拍表+残余清单）+compare-temple.py 工具与 PNG 产物收容 tools/temple-tree/；TEMP 清、残留 http.server 8859/8846 已杀。跨会话协同闭环：对方 44be8f1 预记"滤镜槽在飞零接触、其 4 测试失败为其 WIP"——终态 vitest 95/95 全绿。）
**更新**：2026-10-20（**⚡ 性能战役 r8–r11 四轮收账 `3313403`→`a57532e`（0.3.34）——用户令"持续多轮性能优化+基准量化+报告"**。①r8 场景切换链（-11%：551→491ms 驻留配对；件1 连接忙期画布冻结 setBusy→loop.sleep+floaty 暂停/唤醒双路兜底且 wake 定位 bgWarmSettled 前【早醒有"唤醒税"】、件2 waitForLevelId 事件驱动 -49.5%、件3 temple.json 单例+预取 -93.3%、件4 fetchLevel 缓存；**换肤幕布性能税 +364ms/55% 归档**——pre-skin worktree A/B+CSS 注入 A/B，无 GPU 合成环境 blur 逐帧重算拥塞连接窗，连接期已回收、驻留期挂账真 GPU）；②r9 空闲 CPU 负结论（量具 perf-idle 六态：JS 面 script%<2% 地板、task%=软栅环境项、帧率上限弃件【fps.limit 经 smoothStep 在慢机砍帧 67→48/4s=视觉回归红线】）；③r10 工具链（vitest threads -12%、build 直呼 node 去 npm 层 -6.8%【dist md5 逐字节不变】；判负：sync-assets 增量【330ms 是 npm 层非拷贝】）；④r11 r0 §八挂账收口（**GC 份额 0-0.4%、无并发膨胀、166vs14=跨关伪影**；bonus_2 158ms/建=前 60 步固有收敛=vendor 禁区）。门禁：det 48/48+fixtures 6/6+vitest 89+e2e repeat3 静窗 ALL PASS（一次 1/3=并行负载污染自纠归因）+visual-diff 88.66-90.17 同带。量具 4 件入库（perf-scene/idle/toolchain/gc）+工具归档 perfopt{8,9}；报告 note/report/perf/2026-10-20-r{8,9,10,11}-*.md+总账 §八增补；勘误五条入档（驻留判定洞/唤醒税/bg 旗标/actualFps 计 tick/npm 层计时污染/观察者哑火）。挂账：幕布驻留税（前置真 GPU 口径——**本会话 sudo/su 均被禁 xorg9 不可复现**）、matchmake 点击派发管线（两态共有低优先）。注意：并行会话"滤镜槽"在飞（templeTreeBake.*/TempleScene 改动未入库），其 4 测试失败为其自身 WIP 非本战役面，零接触。）

**更新**：2026-10-26（**🧊 ice 立项收官（0.3.47）——第三部冰雪神庙全量入库+TimedPusher 全链 `efda7b3`**）。
①Phase 0/1（`ea418af`/`981617b`）：oracle C 部取证入档（evidence/2026-10-25-ice-temple/，50 关+temple+ice_02 教学层）；data/ice 50 关+ice_02 入库，temple "ice" 三部注册（templeData/BootScene 三部映射+教学层裸 Tutorial 双分支修复）；r0-ice 51 关 det 锚建立。
②Phase 2 TimedPusher（ice 唯一新机关，25 实例/14 关）：内核 Pusher 同体（梯形 w=1 h=0.6/密度 0.1/mask 61695/prismatic 0.7/motor -15/力 5，逐项对照 C bundle Pusher 反解）+checkState 三段（downState 边沿/按压保持/到时回弹）走仿真钟（按压期每帧重启=oracle timer.stop().start() 逐帧语义）；rotation 全链（Objects.json tiletype 7 种非零角，SetAngle 烧体=oracle 原样）；服务端同步 state/frac/downState；客户端头随体+静止底座（def.y+16px）环灯+12 档量化楔形表盘几何遮罩（c=ceil(12·frac)/12，h=-2πc-π/2）+clock 尾音 seek((22796−time)/1000)（downState===0 门，边沿停）。
③**方法学勘误**：机关实例普查须按 Objects.json tileset tile type（机关以 tile 形式放置），只看 object.type 两轮皆漏——先误判"25 个"后又误勘"零实例"，最终 parseLevel 口径+体表显微镜（30 vs 29）定谳 25 实例/14 关。
④门禁：三部 det 位级绿 forest 48/light 40/ice 51（timedpusher 14 关漂移与实例分布精确吻合，有意变更重锚 9f5d132d）/vitest 227（netDto 契约锚 57→63）/ice 冒烟 51 关 0 失败（unknown 仅原版空对象噪声）/tsc 0/build 绿。
