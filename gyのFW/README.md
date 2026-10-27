# 森林冰火人联机版（gyのFW）

服务端权威的《森林冰火人 1：森林神庙》双人对战合作网页游戏。完整开发计划见 [note/PLAN.md](note/PLAN.md)。

> **当前版本**：0.3.53（并行性能线收容批——qoder r12–r43 核查为开发非审核：34 报告+总账收容/分支固化/分流总档；r15 服务端移植 staticGz ETag·304+关卡 API 压缩（实测 −85~91%））上版 0.3.52（独立审计修复批——审计 19 发现修 10：收容注真替换与 note 口径勘误；bump --desc 必填（9a3f287 根因了断）；口令时序安全比较；根 TEMP/audit 分支卫生清理）上版 0.3.51（GitHub Issues 全量清偿批——#32、#34–#48 十六件修复关闭：ice 雪地碰撞+冰面摩擦语义移植（det 重锚 r1-ice）；won 双断线结算补发解耦、重连 5s 护栏、机关视图跨关清空等联机健壮性；暴露面加固（Origin allowlist+WS verifyClient+CSP+/api 限流+占座 DoS 密码前置）；体积止血（har 出库+golden gzip，tracked 302→123.2MiB）；CI 新增 coverage/servers-smoke/repo-size 三作业。上版 0.3.50（工程基建批——对比报告改进批次 A+B 落地：CI routes-smoke 真服冒烟（forest_01+light_02，light_01 刀锋时序不入样本）；vitest 覆盖率阈值门禁 ratchet（基线实测 85.76/74.05/83.05/85.76，autoUpdate 抬升）；bump-version.mjs 版本一键同步；AGENTS.md 仓库约定入仓；det-fuzz 确定性 fuzz（3 种子×30 游戏分钟双跑位级一致）；route-kregress 正式语料全量回归（甄别 15 WIN/1 挂起/3 缺 JSON，15/15 ALL GREEN，篡改检出验收过））。上版 0.3.49（light 路线批——两部灯光神庙正式通关路线入库：light_01 箱舞 mount+伺服滑钮（FSM WIN@f2914×3/真服 3/3 PASS，接线考古：lever 走近即翻→rotMirror 转→p1 沉，翻杆不可逆封台口⇒双人先过 p2）、light_02（WIN@f4394/真服 3/3）；真服回放器 route-node（colyseus.js 双客户端+墙钟锚+node 定时器链，派发 p50=2ms）；服务端状态补内核帧号镜像 f）。上版 0.3.48（审计批 13 修——GitHub issue #21–#33 按优先级全落：#28 P0 房间密码无条件校验（joinById(roomId,true) 绕过封堵）；#21 限流 key 不采信可伪造头（FW_TRUST_PROXY 显式开关）+authWindows 有界化 O(1)；#32 matchmake 非 POST 405+HTTP server 超时兜底；#29 GameScene 复用归零黑幕/浮尘/光束折线引用；#30 beamer 熄灭删 lastBeamPts；#22 clock 音视图自治起停+SHUTDOWN 销毁；#31 bgm_level_dark 纳入全部停音路径；#23 首快照校验改 ROOM_COLLECTION_CHILD 驱动（补 7 新机关组）；#26 $filter 遮蔽补 Beam/TimedPusher；#24 body-parser 1.20.9+CI 非阻断 audit；#25 ice 51 关解析/内核锚；#33 staticGz 穿越回归修复假绿（it.each 求值时序+体积门槛双层根因）；#27 部署文档口径统一+占位符化。上版 0.3.47（ice 立项——第三部冰雪神庙全量入库：data/ice 50 关+ice_02 教学 51 关、temple "ice" 三部注册、CI 三部 determinism；新机关 TimedPusher 全链（25 实例/14 关：Pusher 同体+三段计时仿真钟+rotation 7 种非零角+客户端底座环灯/12 档楔形倒计时表盘/clock 尾音）；三部 det 位级绿 48/40/51 重锚 9f5d132d）。上版 0.3.46（R12 光面性能战役——灯光神庙新增面三段优化：beamer 变换签名门+零分配（light 步进 -27.8%）、同步打包串缓存（sync -28.7%）、dark 黑幕静态/动态分层（每帧 erase 22→3）；修 fetchTempleTime 漏传 levelId（0.3.45 黑幕失效 bug）；det 双锚位级全程不动。上版 0.3.45（灯光神庙（系列第二部）可玩化里程碑——六类光机关内核移植（beamer/rotmirror/boxmirror/infinitemirror/lightpusher/slider+液体冻融，oracle B bundle 逐字节反解）、40 关入库、客户端 temple 参数化+dark BGM+黑幕渲染；forest 48/48 位级零影响，双 det 分部锚。上版 0.3.44（静态相机——固定全图：镜头不再跟随角色/自动缩放，滚轮/捏合/拖拽缩放停用（用户裁定：机关全程可见便于双人思考）；标准关视图与原 settled 逐位相同，超高关 forest_bonus_2 整图入画 0.857 适配（有意偏离 oracle 裁切取景）；cameraRig 增 setupStatic、动态语义保留可恢复）。上版 0.3.43（M12 相机子系统接线 cameraRig——GameScene 2102→1950 行，视觉带 repeat5 中位 92.53 无显著位移；共享 DTO 草案 netDto 48 字段漂移单测；M4 剪贴板抽 clipboard 模块+7 例、M3 速度关 BGM 键 e2e bgm 场景 12/12；CI actions 升 v7；colyseus 0.18 升级调研档+0.3.42 交接复查五槽证据集）。上版 0.3.42（M12 渐进拆分：机关平滑/快照字段校验/平台声音频抽为纯模块并接入；T10 平台电机声逐台实例；A 槽 L-02 重连/刷新回座补开结算；P-01 twoRows 隐藏行静音）。上版 0.3.41：独立工程审计修复批次（H1–H4/M1–M13 客户端与服务端加固）。上版 0.3.40：issue 批 20 条收官（17 修+3 证伪）+P-02 全收集庆典对齐；0.3.38：审计遗留大批实施（38 号档 F1/F3 机构子精灵族+相机 settled scroll 关卡矩形语义 F2、15 号档镜头 Top3（平台灯组色 tint/风机关 400ms 停帧+effect 相位常驻/暂停全画面静帧）、14 号档音效 T2-T6/T8（速度关终局曲/退场停音钩子/fx 总静音/music 即时/fadeOut）；F1 复核修正——冰膜系 oracle 恒不可见隐藏层，38 号档前提判为仪器伪差）。上版 0.3.37：UI 转场动画保真修复。上版 0.3.36：连接界面石板大厅视觉精修。上上版 0.3.35（选关树浮雕质感还原：templeTreeBake 原版滤镜链 CPU 逐操作移植，分帧烘焙三层纹理（底影/全树枝干 3px 描边/通关金枝），oracle 对拍枝干中线 49/49+浮雕方向 50/50+通关层字节 99.82%；兼修树形数据暗病——edges 按 `_id` 连接（旧按 id 错连 47 条中的 41 条））。上版 0.3.34：性能战役 r8–r11 四轮收账：点击→Game 场景切换链 -11%（连接窗三段 -49%/-77%/-93%，temple.json 单例预取+waitForLevelId 事件驱动+关卡缓存+连接忙期画布冻结；换肤幕布连接窗性能税 +364ms 归档并回收）；空闲 CPU 面负结论收口（JS 面 script%<2% 地板、帧率上限因慢机砍帧弃件、幕布驻留税挂账真 GPU 口径）；工具链 vitest threads -12% + build 去 npm 层 -6.8%（dist 逐字节不变）；r0 §八 GC 挂账勘误收口（GC 份额 0-0.4%、无并发膨胀、bonus_2 158ms/建=前 60 步固有收敛）。上版 0.3.33：连接界面方向 A「石板大厅」换肤。上版 0.3.32：性能战役 r6–r7 收账（音频批 Menu 驻留暖装 +941ms、96 房容量拐点、渲染段 JS 面理论地板、font 子集化关闭、det 门禁并行 -44%）。上版 0.3.31：hanging 摆板 revolute 轴点归位 + 常驻服务器管理。行为复刻战役进行中（总索引见 [note/research/2026-10-behavior-parity/00-INDEX.md](note/research/2026-10-behavior-parity/00-INDEX.md)）。0.3.28 自验收体系落地（L0-L4 验收阶梯 note/self-acceptance.md）。此前 0.3.0-0.3.24 完成 box2d 保真重写 + 全 UI 复刻 + 48 关 + 机关全谱 + 物理复刻度 84.31/动画 99.97/视觉 95.20。量化基准见 [benchmark/](benchmark/README.md)，性能战役总账（r0–r7 七轮+r8–r11 四轮）见 [note/report/perf/2026-10-18-campaign-summary.md](note/report/perf/2026-10-18-campaign-summary.md) 与 [2026-10-20-r8-scene-switch.md](note/report/perf/2026-10-20-r8-scene-switch.md) 等 r8–r11 四报告，逐版改动见 [note/release/](note/release/)
>
> **使用边界**：本项目使用官方游戏素材与关卡数据，仅供两名开发者私下联机游玩。禁止公开分发、上线或商用。

## 快速开始

```bash
npm install
npm run dev:server    # 终端 1：游戏服务器 http://127.0.0.1:2567
npm run dev:client    # 终端 2：开发前端 http://localhost:5173
```

生产形态（开服）：

```bash
start.bat             # 构建 + 起服务器，配合樱花穿透使用（见计划附录 B）
```

部署安全（公网/隧道场景）：优先同源部署（页面与 `/matchmake`、WebSocket 同域），由
Nginx/Caddy 等反代层终止 HTTPS、限制请求速率与并发，并把 `FW_HOST` 保持在 `127.0.0.1`
仅让反代回源；不要直接把服务绑到 `0.0.0.0` 暴露公网。服务端已内置 `/matchmake` 16KB
请求体上限与每 IP 60 次/分钟的鉴权尝试限流，但不替代反代层的 TLS/限流。

## 命令

| 命令 | 作用 |
|---|---|
| `npm run dev:client` | Vite 开发前端（自动同步 assets/data 到 public） |
| `npm run dev:server` | tsx watch 游戏服务器 |
| `npm run build` | 构建客户端到 packages/client/dist |
| `npm run start` | 生产模式起服务器（同源托管静态页 + WebSocket） |
| `npm run typecheck` | TypeScript 全量检查 |
| `npm run test` | vitest 单元/集成测试 |

## 验证与量具

| 层 | 工具 | 说明 |
|---|---|---|
| 通关门禁 | `node --import tsx scripts/e2e/route-node.mjs --level forest_01 --repeat 3 --offset -15` | 真实服务器 + 纯 Node 双客户端回放，CI 同款（`--offset -15` 为本机标定基线；浏览器变体 `route.mjs` 需 `npx playwright install chromium`，Windows 缺省 msedge 通道） |
| 覆盖率门禁 | `npm run test:coverage` | v8 阈值门禁（CI coverage 作业只读同款；本地 autoUpdate 抬升 ratchet，#39） |
| 平台口径 | route-node 正式门禁仅承诺 Linux（CI 与本地稳态机 `--repeat 3`） | Windows 本机 setTimeout 粒度 p50≈7ms，`--repeat 1` 不保证通过（#39）；判定以 Linux repeat≥3 为准 |
| 位级确定性 | `node --import tsx benchmark/perf-determinism.mjs --compare r0-baseline`（并行缺省，`DET_WORKERS=0` 回退串行） | 全 48 关 det 位级基线（perf 战役现役锚 r0-baseline，与行为战役史锚 r32 同源互证；并行/串行/快照三方逐字节同） |
| 行为回归网 | `node --import tsx scripts/e2e/routetool/fixture-runner.mjs` | 金轨迹 fixture 6 case：v1 内核自基线 ×4（tolerance=0）+ oracle 金 ×2（forest_01/forest_26） |
| oracle 对拍 | `scripts/e2e/oracle/`（lib/vtrun/vtdiff/goldcollect/windphase/animprobe） | 原版虚拟钟机族：确定性 60Hz 逐帧对拍、金输出采集、风相位/动画审计 |
| dt 敏感度 | `node --import tsx scripts/e2e/routetool/dtsweep.mjs` | 同输入跨 dt 调度谱扫描（默认写 TEMP，写档案须显式 --outDir） |
| 量化基准 | `benchmark/`（fidelity-score / visual-diff / anim / audio / determinism / step / load / sync / serialize / routeio / mem / client / capacity） | 复刻度指数与性能快照（`--save`/`--compare`） |
| 性能优化战役 | [note/report/perf/2026-10-18-campaign-summary.md](note/report/perf/2026-10-18-campaign-summary.md)（总账）+ 同目录 r0–r11 各轮报告 | 2026-10-18/19 七轮 22 件全位级中性：步进 -15~-22%、世界构建 10.5×、客户端 update 分配 -97%、冷启 -32%、音频就绪点提前至 Menu 驻留、容量拐点 96 房/≤64 房实例；r7 负结论双件（渲染段理论地板/font 子集化无空间）实测防重复立项；2026-10-20 r8–r11 续账：点击→Game -11%（连接忙期画布冻结回收换肤幕布税）、空闲 CPU/帧率上限负结论、vitest -12%+build -6.8%、GC 拆账收口（总账 §八）（各轮 `--compare` 锚与快照索引见 [benchmark/README.md](benchmark/README.md)） |

行为复刻战役全档索引、工具用法速查与挂账清单：[note/research/2026-10-behavior-parity/00-INDEX.md](note/research/2026-10-behavior-parity/00-INDEX.md)。全库函数级代码分析报告（架构/运行原理/工作流/AI 替代，2026-10-18 codebase-analyzer 产出）：[note/report/codebase-analysis/](note/report/codebase-analysis/index.md)。

## 技术栈

TypeScript 全栈 · Phaser 3（客户端渲染） · Colyseus（房间/状态同步） · 自研 2D 内核（`packages/shared`，两端复用） · 官方 Tiled 关卡 JSON 直接装载。

## 联机架构

客户端只渲染 + 发输入，全部判定（物理、死亡、钻石、拉杆、移动平台、开门）在 Colyseus 服务器 60Hz 权威 tick 上计算——这是**原生在线联机**。作为对照：原版网页客户端是 2.27MB 混淆黑盒改无可改，[Steam 官方发行版](https://store.steampowered.com/app/5084260/) 也只有本地双人同屏 + Remote Play Together 串流（官方分类无 Online Co-op）。决策依据与实证详见 [note/multiplayer-architecture.md](note/multiplayer-architecture.md)。
