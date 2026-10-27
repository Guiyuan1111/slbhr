# gyのFW 仓库约定（agent 会话自动继承）

## 常用命令
- 类型/测试：`npm run typecheck`；`npm test`；`npm run test:coverage`（覆盖率阈值门禁）
- 版本：`node scripts/bump-version.mjs <x.y.z>`（同步四处 package.json + README 版本行 + lock，发版记手写 note/release/<版>.md）
- 确定性门禁（改内核必跑）：`node --import tsx benchmark/perf-determinism.mjs --compare <锚>`（锚：r0-baseline/r0-light/r0-ice，--filter forest|light|ice）
- 路线门禁（每关）：`node --import tsx scripts/e2e/routetool/validate.mjs --level <lv>`（内核）→ `node --import tsx scripts/e2e/route-node.mjs --level <lv> --repeat 3`（真服，light 系 --offset -10）→ ALL PASS 才算通关
- 语料全量回归：`node --import tsx scripts/e2e/route-kregress.mjs`（正式语料=formal-corpus.list，内核口径）
- 确定性 fuzz：`node --import tsx benchmark/det-fuzz.mjs --level <lv> --seed <n> --minutes <m>`

## 工程纪律（硬性）
- oracle（官方源码）严格只读；官方素材私有使用不分发
- 凡含账号/密码/token/真实姓名的文件严禁入库或外发
- commit 细粒度；禁 `git add -A`（只 add 自己的文件）；禁 co-author
- TEMP/ 测试环境用后必清；非复用缓存必清
- 版本号只经 bump 脚本改，禁止手改散点

## 文档惯例
- 要点入 note/：档卷 note/evidence/<日期-主题>/、验收台账 self-acceptance.md、交接 handoff.md（旧交接加时效注）、发版 note/release/<版>.md、全局索引 00-INDEX.md
- 通关路线记档 note/<level>-route.md；续作 SOP 见 note/next-games-playbook.md

## 协作
- 子 agent/工具自述成功不作完成依据，必须亲验产物或跑测试；可并发即派子 agent
- 改动语义不明时先问，不猜测
