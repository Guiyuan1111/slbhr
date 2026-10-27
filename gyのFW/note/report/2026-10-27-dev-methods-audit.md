# 开发方式与手段审计报告（报告一）

- 日期：2026-10-27
- 审计对象：`gyのFW`（森林冰火人网页复刻）现行工程实践全貌
- 事实来源：仓库实况（git 901 commits、仓库根 `.github/workflows/ci.yml`、`package.json`/`vitest.config.ts`、`note/` 体系、`note/self-acceptance.md` 验收台账）；姊妹篇：《同行实践调研报告》（[2026-10-27-peer-practices.md](2026-10-27-peer-practices.md)）、《综合对比报告》（[2026-10-27-methods-vs-peers.md](2026-10-27-methods-vs-peers.md)）。

## 一、项目底盘

- 形态：npm workspaces monorepo（client / server / shared），TypeScript 全栈；服务端 Colyseus 房间制联机，客户端 Vite + Phaser。
- 内核：60Hz 定步长自建确定性物理内核（Box2D 系 API），可脱离渲染独立步进，暴露探针 API（`makeWorld` / `step` / `mechSnapshot`）供程序化驱动——整个验证体系的地基。
- 规模：三部共 139 关（forest 48 / light 40 / ice 51，见 CI 作业命名）；版本 0.3.x 已迭代至 0.3.49；累计 901 commits。

## 二、验证与门禁体系（核心资产）

| 层 | 工具 | 内容 |
|---|---|---|
| 单元/契约 | vitest ~260 例（数字出处：note/handoff.md 时效注） | 含 netDto 契约测试：交叉核对服务端 Schema 注册与共享 DTO 字段表，0.3.49 曾当场拦下扩字段漂移（dtoMissing ['f']，真实战例） |
| 确定性 | `benchmark/perf-determinism.mjs` | 三部位级基线 r0-baseline / r0-light / r0-ice，`--filter` 前缀闭合比对；改内核必跑 |
| 保真 | `visual-diff` / `fidelity-anim` / `fidelity-score` / `audio-loudness` | 页内 480×360 灰度差分+平移搜索；帧级动画比对；响度 |
| 度量 | `perf-*` 家族 19 件 | 容量/步进/GC/序列化/负载/内存/工具链等 |
| 联机场景 | `scripts/e2e` journey/regression/touch/lightsmoke | 死亡重试、暂停、重连、角色拆分等组合场景门禁 |

**CI（仓库根 `.github/workflows/ci.yml`，主验确认）**：push/PR 触碰 `gyのFW/**` 即跑 5 个作业——① `npm ci → typecheck → test → build` + 非阻断生产依赖审计；②③④ forest/light/ice 三部确定性基线比对。**局限**：路线回放、视觉差分、动画保真未进 CI；依赖审计非阻断；无 lint 与覆盖率门禁（`vitest.config.ts` 无 coverage 配置，devDependencies 无 eslint）。

## 三、通关路线产线（类 TAS）

每关固定工序：

1. 内核探针逆向机关接线（杠杆/滑块/镜面/平台触发窗逐帧实测）；
2. FSM 编排脚本在 TEMP 迭代至内核 WIN；
3. 压缩为路线 JSON（双角色按键事件流，含 +30f settle 对齐约定）；
4. `route.mjs` 内核回跑 validate=0；
5. `route-node.mjs` 真服回放：colyseus.js 双客户端 + 服务端 stdout 墙钟锚 + node 定时器链，派发抖动 p50≈2ms，**repeat≥3 ALL PASS 才算通关**；
6. 路线入库 + 记档（`note/<level>-route.md`）+ 证据收容（evidence 档卷）。

正式路线记档 8 份（forest 01/08/15/23/26、light 01/02 收官 + forest22 wip）；routes 目录另有探索/版本档，共 56 个跟踪档。浏览器回放已由 node 路线取代（CDP 往返 p50=28ms 对 16.7ms 帧窗不可用；考古全程记档 evidence/2026-10-26-light02-route）。

## 四、工程文化与文档体系

- **证据档卷**：`note/evidence/<日期-主题>/` + README，探针脚本、接线 dump、失败谱系全收容；断点收容惯例（唯一载体先救档卷再清 TEMP，弃置档改名标注属性）。
- **台账与断代**：`self-acceptance.md` 验收台账（门禁数字可自动化检查的不得标 manual/未做）；`handoff.md` 活页交接 + 旧交接文档顶部加「时效注」；`00-INDEX.md` 全局索引。
- **发版纪律**：`note/release/<版本>.md` 每版一记；GitHub Release + tag；版本号四处 package.json + README + lock **手工同步**。
- **续作手册**：`next-games-playbook.md` 把工具链全家桶/数据格式/踩坑沉淀为下一部直接可搬的 SOP。

## 五、协作模式（agent 编制）

- 主 agent 全栈开发；`flash-prep` 子 agent 承接边界清晰、可独立验证的预处理（变体差异解码/蓝图草稿/基准补跑）；`general-purpose` 子 agent 承接调研类任务（报告二即为例证）。
- 纪律：**子 agent/工具自述成功不作完成依据，必须亲验产物或跑测试**；可并发即派子 agent；含密文件严禁入库。
- 单人单仓：所有提交直推 main，无 PR/评审环节；验收靠台账 + 门禁。

## 六、Git 与发布纪律

- 细粒度 commit（901 个）；禁 `git add -A`（只 add 自己的文件）；禁 co-author。
- 官方源码 oracle 严格只读；官方素材私有使用不分发；TEMP 测试环境用后必清（0.3.49 轮清探针 79 个）。

## 七、自审薄弱面清单（供对比报告展开）

1. CI 覆盖面窄：路线回放/视觉差分/保真未进 CI；audit 非阻断。
2. 直推 main：CI 是「观察哨」而非「闸门」，无 branch protection/PR 流。
3. 无 lint/格式/覆盖率门禁。
4. 版本号多处手工同步，无 changesets 类工具。
5. 路线产线人力密集：每关数小时人工考古；正式路线记档 8/139 关。
6. 缺「随机输入+多种子长跑」类确定性 fuzz（现只跑既定路线）。
7. 挂账在 md（issues-2026-10-20、待裁案），未用 issue tracker。
8. agent 工作流约定散在全局配置与 note，未固化为仓库内约定文件。

## 八、数据速览

901 commits；版本 0.3.49；三部 139 关；CI 作业 5 个；vitest ~260 例；benchmark 脚本 19 件；正式路线记档 8 份；routes 跟踪档 56 个；test 相关跟踪文件 32 个。
