# gyのFW 仓库约定（agent 会话自动继承）

## 分支口径（2026-10-28 起）
- `main`：全三部（forest/light/ice）开发主线，版本线 0.3.x，本文档其余部分以 main 为准。
- `release/1.0-forest`：**1.0 分发分支（仅第一部 forest）**。只做打包/剪裁适配（测试剪 light/ice 依赖、CI 去 light/ice 作业、覆盖率阈值按余量实测、版本 1.0.x），**不承接三部共用代码的删减**——light/ice 数据与引擎仍在分支历史中，分发内容由 scripts/package-deploy.mjs 在打包层剪除（data/light|ice、Temples/light|ice、LevelMusic_dark、dist 内资产重复副本）。改动先落 main 再择时同步本分支；发版打 1.0.x tag 于本分支。

## 常用命令
- 类型/测试：`npm run typecheck`；`npm test`；`npm run test:coverage`（覆盖率阈值门禁）
- 版本：`node scripts/bump-version.mjs <x.y.z> --desc "一句话描述"`（同步四处 package.json + lock；README 版本链新版本带描述入链头、原当前版降“上版”；事务化，lock 失败自动回滚；`--verify` 只读校验六处一致+当前版本行描述在场。发版记手写 note/release/<版>.md）
- 确定性门禁（改内核必跑）：`node --import tsx benchmark/perf-determinism.mjs --compare <锚>`（锚：r0-baseline/r0-light/r1-ice——r1-ice 为 0.3.51 #34/#35 冰面物理后的 ice 锚，--filter forest|light|ice）
- 路线门禁（每关）：`node --import tsx scripts/e2e/routetool/validate.mjs --level <lv>`（内核）→ `node --import tsx scripts/e2e/route-node.mjs --level <lv> --repeat 3`（真服，light 系 --offset -10）→ ALL PASS 才算通关
- 语料全量回归：`node --import tsx scripts/e2e/route-kregress.mjs`（正式语料=formal-corpus.list，内核口径）
- 路线门禁平台口径（#39）：route-node 的 ±1ms node 定时器假设只在 Linux 成立（CI/本地稳态机）；Windows 本机 setTimeout 粒度实测 p50≈7ms/p99≈16ms，`--repeat 1` 不保证通过，正式判定以 Linux `--repeat 3` 为准
- 发布门禁组合（0.3.51 起）：CI 全绿（typecheck/test/build/coverage/det×3/routes-smoke/servers-smoke）+ 本地 `npm run test:coverage` + det 三部（forest/light/ice）+ 语料 kregress
- 确定性 fuzz：`node --import tsx benchmark/det-fuzz.mjs --level <lv> --seed <n> --minutes <m>`

## 工程纪律（硬性）
- oracle（官方源码/素材）原件严格只读；可复制副本做修改实验（2026-10-29 用户澄清）——私有使用不分发，副本不入库/外发，实验副本按 TEMP 惯例用后即清
- 凡含账号/密码/token/真实姓名的文件严禁入库或外发
- commit 细粒度；禁 `git add -A`（只 add 自己的文件）；禁 co-author
- TEMP/ 测试环境用后必清；非复用缓存必清；唯一载体（断点/探针/切片）先收容 note/**/tools/breakpoint-*（附收容注明+引用档卷）并 commit 后再清（2026-10-27 惯例）
- 版本号只经 bump 脚本改，禁止手改散点

## 文档惯例
- 要点入 note/：档卷 note/evidence/<日期-主题>/、验收台账 self-acceptance.md、交接 handoff.md（旧交接加时效注）、发版 note/release/<版>.md、全局索引 00-INDEX.md
- 通关路线记档 note/<level>-route.md；续作 SOP 见 note/next-games-playbook.md

## 协作
- 子 agent/工具自述成功不作完成依据，必须亲验产物或跑测试；可并发即派子 agent
- 改动语义不明时先问，不猜测
