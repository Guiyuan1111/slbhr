# B 槽（服务端基建/安全/部署）复核与处置记录 — 2026-10-20

范围：M-02 / M-04 / M-05 / I-01 / I-02 / L-04（服务端半）。逐条：复核 → 修复/证伪 → 证据。
门禁：typecheck 通过；`npm run build` 通过（3.91s）；vitest **106/106**（95 基线 + 11 新增回归）；e2e `route.mjs --level forest_01 --repeat 1` **ALL PASS**（真实服务器链路冒烟）。
det 交集声明：**零交集**——未动 packages/shared、内核/物理/tick/输入时序/wind 时基与任何常量（STEP_MS/PATCH_MS/READY_MS/RECONNECT_SECONDS 原样）；改动全部在 HTTP 静态层、房间生命周期入口校验、脚本与部署配置。

---

## M-02 staticGz 路径穿越（#7）— 复核属实，已修

- 复核：HEAD 实现 `join(root, urlPath)` 无根前缀校验。用 git HEAD 的 staticGz **逐字复刻**跑探针：`GET /..%2f<兄弟文件>.json`（≥1KB、带 gzip 头）→ **200 且返回文件内容**（泄漏实证）。`node_modules/@colyseus/core` 之外，`package.json`(1059B)/`package-lock.json`(143KB) 均满足扩展名+大小条件，可被读。
- 修复（c63b1bf）：抽独立模块 `packages/server/src/staticGz.ts`；`resolve` 归一化后校验 `fpAbs === rootAbs || fpAbs.startsWith(rootAbs + sep)`，越界走 fallback（404）；`GZ_EXT` 锚定 `\.(...)$`。Windows `..%5c` 变体同被 resolve+前缀检查拦截。
- 回归：`packages/server/src/__tests__/staticGz.test.ts` 11 例（原始路径发送等价 `curl --path-as-is`；单层/双层/先入子目录回穿/点号编码/前缀挂载下穿越/反斜杠变体全部 404；根内正常 gzip、`/dist/../dist/data.json` 不出根不误伤、<1KB fallback）。

## M-04 dev 脚本孤儿进程（#9）— 复核属实，已修

- 复现：`servers.sh start play` 后进程链 4 层——`npm exec tsx`(163625，pidfile 记它) → `sh -c` → `.bin/tsx` → **真服务 node(163649，监听 3700)**；`stop` 杀 163625 后 **163649 存活且 3700 仍 LISTEN**（孤儿实锤）。
- 修复（f2a348a）：play 启动改 `node --import tsx`（与 e2e/lib.mjs 同法，单进程无孙进程）；stop 等 pid 退出（10s 超时 SIGKILL 兜底）+ 等端口释放（防 restart 撞 EADDRINUSE）；残留监听检测补 Git Bash `netstat -ano` 回退。
- 复验：连续 3 轮 restart，pidfile pid == 端口监听 pid，终态 stop 后 3700 无监听、status 未在跑。

## M-05 生产启动链（#10）— 大部属实已修；「缺 SIGTERM」子项证伪

- 复核属实并修（ead0867）：
  - `tsx` 从 devDependencies 移入 dependencies：`npm ls --omit=dev tsx` 在产物树（`npm ci --omit=dev` 后 `npm start` 可跑）；`npm start` 实测启动成功。lock 变更仅 tsx 链 dev 标记 + 自持版本字段去陈旧（0.2.0→0.3.38/0.3.31，即 L-06 记录的陈旧面），**0 个第三方版本变动**（resolved/integrity 零 diff）。
  - `engines.node >= 20.6`（`--import` 门槛）+ `.nvmrc`(22)。
  - `start-lan.bat` 补 `cd /d "%~dp0"`（GBK 字节级 perl 编辑，中文完好）；四个 start 脚本 `npx tsx` → `node --import tsx`。
- 子项证伪：「没有 SIGTERM 处理」不成立——colyseus 0.16 `Server` 默认 `gracefullyShutdown: true`，`registerGracefulShutdown` 注册 SIGINT/SIGTERM/SIGUSR2 → `matchMaker.gracefullyShutdown()`（回收房间/触发 onDispose）→ `transport.shutdown()`（wss+httpServer close）→ `process.exit`。**实测**：起服 3721 → `kill -TERM` → 进程退出、端口释放（3s 内）。故不重复注册信号处理器，仅挂 `gameServer.onShutdown` 日志钩子供 journald 观测（a619675）。

## I-01 部署运维配置（#19）— 属实，按「可选按需」补齐

- 复核：`/healthz` 不存在（实测 404）；无 systemd/engines/.nvmrc；默认 127.0.0.1 绑定与 AGENTS.md 私用定位一致。
- 处置（a619675）：`/healthz` → 200 `{"ok":true,"uptime":N}`（零依赖零鉴权，实测）；`deploy/fw.service` + `deploy/README.md` 样例（Restart=always、SIGTERM 优雅停机、journald 日志轮转说明、LAN/公网暴露注意事项），**均标注可选按需部署**——不夸大基建，PM2/K8s 明确不上。
- 实测：healthz 200；SIGTERM 后 `[fw] 优雅停机完成` 日志 + 端口释放。

## I-02 npm audit（#20）— critical 已清；余项全部论证不可达后关闭

- 基线复跑：15 项（critical 2 / high 1 / moderate 10 / low 2），与 issue 一致。
- 修复（2e74e54）：`vitest ^3.1.4 → ^5.0.5`（devDep，major）——critical `vitest`/`tinypool`（RCE 链）与 moderate `@vitest/mocker`（路径穿越）清零；升级后 vitest **106/106** 全绿、build/typecheck 通过。lock 变动限定 vitest 子树。
- 余 12 项（`npm audit --omit=dev` 与全树相同：0 critical / 1 high / 9 moderate / 2 low）全在 colyseus 传递链，逐条可达性论证：
  - `nanoid`(high)：经 `@colyseus/core` 的 `generateId`。全部调用点 `IPC.js:31`、`MatchMaker.js:117/327/435`、`Room.js:502` **均为无参调用（默认整数 9）**，项目代码 0 处调用 generateId——公告触 发条件（非整数/负数/零 size）不可达。
  - `@colyseus/auth`/`grant`/`jwk-to-pem`/`request-oauth`/`uuid`/`elliptic`（moderate/low）：OAuth/auth 链，项目 0 引用（`grep -rl '@colyseus/auth' packages/ scripts/ benchmark/` = 空）、未挂载任何 auth 端点。
  - `@colyseus/redis-driver`/`redis-presence`：仅因依赖带 flag 的 `@colyseus/core` 被连带标记；项目用默认 LocalPresence。
  - 升级 colyseus 0.16→0.18 系破坏性大版本（Schema/transport 行为面），不属本批，另行立项。
- 关闭理由：当前运行链无可利用点 + devDep critical 已实修；audit 随 registry 漂移，部署前按 deploy/README 复跑。

## L-04 密码校验（#15）— 服务端半已修；客户端半归另一槽，issue 不由本槽关闭

- 修复（4881343）：`ForestRoom.onCreate` 建房密码 **4-64 位**（note/PLAN.md「4 位以上」落地；上限仅防异常巨串，不做复杂度策略——私用场景），`ServerError(4400)` message 经 MatchMakeError 直达客户端提示；加入侧 `onAuth` 相等比较不变，短密码天然 4403。
- 实测：3 位「abc」拒、空密码拒、4 位放行、错误短密码加入→4403「房间密码错误」、正确密码加入放行。
- 随动修正被新门槛打到的两处工具：`benchmark/perf-capacity.mjs` 空密码→`perf-pw`；`benchmark/visual-diff.mjs` 2 位 `vw`→`vw-pw`。
- 尝试限制（同 IP 失败退避）按派发指示不做——私用场景勿过度设计。客户端 `type="password"`/最短提示由另一槽处理。

---

## 提交清单（仓库根 slbhr，main）

| commit | 内容 |
| --- | --- |
| c63b1bf | M-02 (#7) staticGz 根前缀校验 + 独立模块 + 11 例回归 |
| f2a348a | M-04 (#9) servers.sh 单进程化 + stop 等待/端口释放 + netstat 回退 |
| ead0867 | M-05 (#10) tsx→dependencies + engines/.nvmrc + start-lan.bat cd /d + start 脚本链 |
| a619675 | I-01 (#19) /healthz + onShutdown 钩子 + deploy/ 样例（可选） |
| 4881343 | L-04 服务端半 (#15) 建房密码 4-64 位 + 两处工具随动 |
| 2e74e54 | I-02 (#20) vitest 5.0.5 升级消 critical |

## 存疑/移交

- L-04 客户端半（`type="password"`、输入长度提示）未动（归另一槽）；#15 保持 OPEN 待其完成后由该槽关闭。
- colyseus 0.18 / 后续依赖升级需独立分支 + 全门禁（I-02 关闭评论已注明前提）。
- 期间发现 lock 内自持版本字段陈旧（0.2.0 vs 0.3.38/0.3.31），系 #17（L-06）记录面，本次随 npm install 顺带同步，版本号字段未另行改动。
