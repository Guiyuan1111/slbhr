# colyseus 0.16 → 0.18 升级迁移面调研档

- 槽位：槽 3（只读调研，未改任何依赖与源码；npm pack 全部在 TEMP/c018 内完成，收尾已清）
- 日期：2026-10-23
- 调研方法：`npm view` 版本谱 + `npm pack` 解包 0.18 真实产物，与我方使用面、已安装 0.16 包（node_modules）逐项源码对照。**包内无 CHANGELOG.md（core 0.18.23 仅 LICENSE/README/package.json），本文全部结论出自解包源码/类型声明行号，未引用任何凭印象的 changelog。**
- 版本锚点（`npm view` 实测）：
  - 我方现状：`colyseus@0.16.0`（→ @colyseus/core 0.16.26 / @colyseus/schema 3.0.76 / @colyseus/ws-transport 0.16.5）、`colyseus.js@0.16.22`
  - 目标线：@colyseus/core 0.18.23（latest）、colyseus 元包 0.18.10（latest）、@colyseus/tools 0.18.10、@colyseus/ws-transport 0.18.4、@colyseus/schema 5.0.42（latest）、**客户端 = @colyseus/sdk 0.18.6**（见 B7）
  - 时间线（npm time 实测）：0.16.26 发布于 2026-09-06；0.17.55 与 0.18.23 同日发布于 2026-10-22。0.16 线仍在维护但 0.18 是活跃主线；core 0.18 要 node ≥22（我方 engines ≥22.12，满足）。

---

## §1 我方使用面清单（API → 我方调用点）

### 1.1 服务端（packages/server）

统一加载口 `packages/server/src/colyseus.cjs.ts`（createRequire 强制 CJS 单实例，规避 ESM/CJS 双实例 schema 元数据分裂——0.15 期已知坑，0.18 仍是 CJS/ESM 双构建，该 shim 模式须原样保留）：

| API | 调用点（文件:行） |
|---|---|
| `nodeRequire("colyseus")` → `Server, Room, ServerError, matchMaker` | colyseus.cjs.ts:15（matchMaker 仅再导出、下游无使用） |
| `nodeRequire("@colyseus/schema")` → `Schema, MapSchema, defineTypes, $filter` | colyseus.cjs.ts:16 |
| `nodeRequire("@colyseus/ws-transport")` → `WebSocketTransport` | colyseus.cjs.ts:17 |
| `new Server({ transport })` | index.ts:79-81；__tests__/forest-room.integration.test.ts:53 |
| `new WebSocketTransport({ server: httpServer })` | index.ts:80；integration.test.ts:53 |
| `installMatchmakeBodyGuard`（http.Server prependListener("request")，依赖 0.16 Server 内部行为） | index.ts:86；matchmakeGuard.ts:23-61 |
| `gameServer.define("forest", ForestRoom)` | index.ts:88；integration.test.ts:54 |
| `gameServer.onShutdown(cb)` | index.ts:94-96（停机信号依赖框架默认 SIGINT/SIGTERM/SIGUSR2 注册，两版一致：0.16 Utils.js:54 / 0.18 Utils.mjs:23） |
| `gameServer.listen(PORT, HOST)` | index.ts:100 |
| `class ForestRoom extends Room<RoomState>` | ForestRoom.ts:92 |
| `maxClients = 2` | ForestRoom.ts:93 |
| `onCreate(options)` | ForestRoom.ts:140 |
| `setState(new RoomState())` | ForestRoom.ts:157 |
| `onMessage(type, cb)` ×5（input/restart/advance/pause/resume） | ForestRoom.ts:162, 180, 200, 225, 233 |
| `broadcast(type, payload)` ×10（pause-changed/ping/finish/death/sfx） | ForestRoom.ts:191, 231, 238, 245, 507, 519, 586, 588, 594, 596, 598 |
| `client.send(type, payload)` ×3（role/finish/pause-changed 补发） | ForestRoom.ts:337, 378, 393 |
| `setSimulationInterval(cb)`（60Hz 驱动） | ForestRoom.ts:276 |
| `setPatchRate(PATCH_MS)`（60Hz 出站 patch，顺序依赖 __init 先于 onCreate） | ForestRoom.ts:279 |
| `allowReconnection(client, seconds)` | ForestRoom.ts:366 |
| `onJoin(client, options?)`（含 `typeof options === "object"` 重连跳过判别） | ForestRoom.ts:319-348 |
| `onLeave(client, consented: boolean)`（**consented 布尔语义**） | ForestRoom.ts:350-397 |
| `onDispose()` | ForestRoom.ts:421 |
| `static onAuth(token, options, context)`（matchmaking 级限流；签名 `onAuth(token, options, authContext)`） | ForestRoom.ts:303-309 |
| 实例 `onAuth(client, options)`（密码校验） | ForestRoom.ts:312-317 |
| `AuthContext` 类型（读 `context.ip ?? context.req?.socket?.remoteAddress`） | ForestRoom.ts:15, 86-90；__tests__/forest-room.unit.test.ts:5, 54-64 |
| `Client` 类型 | ForestRoom.ts:15, 312, 319, 350, 402 |
| `ServerError(code, msg)` ×5（4400/4404/4403/4429/4409） | ForestRoom.ts:146, 150, 306, 314, 329 |
| `client.sessionId` | ForestRoom.ts:163, 226, 326, 403 等 |

### 1.2 Schema 状态（packages/server/src/rooms/state.ts）

| API | 调用点 |
|---|---|
| `extends Schema` ×8 | state.ts:17, 52, 61, 75, 91, 107, 119, 138 |
| `new MapSchema()` ×11 | state.ts:160-169 |
| `MapSchemaType<T>` 类型 | state.ts:15, 142-152 |
| `defineTypes(cls, {…})` ×8（原始类型字符串 + `{ map: Class }` + 类引用） | state.ts:174-246 |
| `$filter` 静态导出 + 逐类 own-static 遮蔽（r4 性能补丁：`ctor[$filter] = undefined` 跳过逐字段 filter 调用） | state.ts:14, 260-262 |

### 1.3 客户端（packages/client/src/net.ts，colyseus.js@0.16.22）

| API | 调用点 |
|---|---|
| `new Client(url)` | net.ts:106, 247 |
| `client.create("forest", opts)` | net.ts:111 |
| `client.joinById(code, opts)` | net.ts:112 |
| `client.reconnect(token)`（token=`roomId:reconnectionToken` 复合格式） | net.ts:190, 251 |
| `room.reconnectionToken`（经 cast 读取） | net.ts:173, 215 |
| `room.onMessage(type, cb)` ×6 | net.ts:121-141 |
| `room.onStateChange(cb)` | net.ts:144 |
| `room.onLeave(async (code) => …)`（code=1000/4000 判别） | net.ts:165-209, 72-74 |
| `room.send(type, payload)` ×5 | net.ts:295, 299, 304, 309 |
| `room.leave(true)` | net.ts:193, 258, 322 |
| `room.state`（onStateChange 差分 + waitForLevelId） | net.ts:144-163, 278 |

### 1.4 构建/测试/基准

- `vite.config.ts`：manualChunks `colyseus: ["colyseus.js"]`（客户端分包名）；dev proxy `/matchmake` → 2567。
- 集成测试 `packages/server/src/__tests__/forest-room.integration.test.ts`（13 例）：服务端走 colyseus.cjs.js，客户端 `new Client/create/joinById/reconnect/reconnectionToken`（:23, 53-54, 115-118, 157-171, 227 等）。
- 单测 `forest-room.unit.test.ts:54-64`：直接调 `ForestRoom.onAuth` 静态签名。
- 基准脚本：`benchmark/perf-sync.mjs:32`（`Encoder`）、`benchmark/perf-serialize.mjs:45`（`Encoder, Reflection`，@colyseus/schema）、`benchmark/perf-capacity.mjs:80`（colyseus.js `Client`）。

**使用面合计：服务端 API 17 项 + Schema API 4 项 + 客户端 API 11 项 ≈ 32 项。**

---

## §2 0.16 → 0.18 变更对照（逐项，全部附解包证据）

证据文件缩写：`[core18]=TEMP/c018/core/package`（@colyseus/core@0.18.23 解包）、`[core16]=node_modules/@colyseus/core`（0.16.26）、`[tr18]=TEMP/c018/transport/package`、`[schema5]=TEMP/c018/schema/package`（5.0.42）、`[sdk]=TEMP/c018/sdk/package`（@colyseus/sdk@0.18.6）、`[meta]=TEMP/c018/meta/package`（colyseus@0.18.10）、`[st]=TEMP/c018/shared-types/package`、`[bc]=TEMP/c018/better-call/package`。

### B1【破坏·结构】matchmake HTTP 路由整体重写：Router（better-call）取代 attachMatchMakingRoutes

- 0.16：`new Server()` 构造内 `attach()` 即调 `attachMatchMakingRoutes(server)`——`removeAllListeners("request")` 后重挂单一监听器拦 `/matchmake`，其余转发原监听器（[core16]/build/Server.js:83-85, 192-203）。
- 0.18：构造只 `bootRuntime()`（attach transport + matchMaker.setup + 停机信号），**不碰 request 监听器**（[core18]/build/Server.mjs:38-54）；路由在 `listen()` 内 `bindRoutes()`（Server.mjs:152-160）→ `bindRouterToTransport`（[core18]/build/router/index.mjs:15-66）：
  - 按 `listener.name === "app" && mountpath === "/"` 扫描识别 express app（index.mjs:20），`removeListener("request", expressApp)` 后包成 next（匹配 router 端点走 better-call，否则 `expressApp.handle`）；
  - 最后 `server.prependListener("request", corsWrapper)`（index.mjs:51）。
  - matchmake 端点 = `createEndpoint("/matchmake/:method/:roomName", POST)`（[core18]/build/router/default_routes.mjs:6-42）。
- **对我方的直接冲击：matchmakeGuard 的安装时序契约反转。** 我方在 `new Server(...)` 之后、listen 之前 `prependListener`（matchmakeGuard.ts:22-27 注释即 0.16 行为）；0.18 下 listen 时 colyseus 再 prepend 一次，最终顺序变为 **[colyseus corsWrapper, 我方 guard]**——guard 从"抢跑"变"殿后"，其"先于 Colyseus 拒绝 413"的语义不成立（详见 B2/R1）。
- `attachMatchMakingRoutes`/`handleMatchMakeRequest`/`registerProcessForDiscovery` 已从 Server.d.ts 消失（对照 [core16]/build/Server.d.ts 尾部 protected 方法）。

### B2【破坏·安全语义】matchmake body 上限：0.18 listen 路径仍无框架级上限，我方 16KB 闸门必须保留但需重设计

- 0.16 body 读取无上限（[core16]/build/Server.js:226-231 `req.on("data")` 累加 concat 后 JSON.parse）——M5 立项根因。
- 0.18 有两套 body 读取：
  - `createNodeMatchmakingMiddleware` 内建 1MB 上限（[core18]/build/router/node.mjs:6 `MAX_BODY_SIZE = 1024*1024`, :13-16）——但该中间件**仅从 [core18]/build/index.mjs:114 导出，listen() 路径并未接线**；
  - listen() 实际路径：`router.handler(getRequest({ base, request: req }))`（[core18]/build/router/index.mjs:42）→ better-call `getRequest` 未传 `bodySizeLimit`（[core18]/sdk 无关；[bc]/dist/adapters/node/request.mjs:59-76，`get_raw_body` 在 `body_size_limit` 为 undefined 时跳过全部检查）→ **仍是无上限全量读取**。
- 结论：M5 的威胁模型在 0.18 默认路径下**依旧存在**，matchmakeGuard 不能删，但其"prepend 抢跑"前提被 B1 破坏，须按 0.18 的新时序重设计（候选：Server `express:` 回调把闸门挂进 transport 托管的 express；或自建中间件用官方导出的 `createNodeMatchmakingMiddleware` 思路接管 /matchmake POST）。guard 的 `req.on("data")` 计数与 better-call 的 body 读取会并存，guard `req.destroy()` 后 router 侧读取失败的错误走向（未捕获 rejection 风险，Node 22 默认 throw）需在实现时实测——本档不终裁，留生产槽。

### B3【破坏·行为】`onLeave(client, consented: boolean)` → `onLeave(client, code: number)`（WebSocket close code）

- 0.16 第二参为 boolean consented；0.18 为 close code（[core18]/build/Room.d.ts:372 `onLeave?(client, code?: number)`；Room.mjs:1448-1449 `_onLeave(client, code)`，`code === CloseCode.CONSENTED ? this.onLeave : this.onDrop || this.onLeave`；Seat 超时路径 Room.mjs:1339 `this.onLeave?.({ sessionId }, CloseCode.MAY_TRY_RECONNECT)`）。
- CloseCode 枚举（[st]/build/Protocol.d.ts:257-267）：NORMAL_CLOSURE=1000 / GOING_AWAY=1001 / ABNORMAL_CLOSURE=1006 / **CONSENTED=4000** / SERVER_SHUTDOWN=4001 / WITH_ERROR=4002 / FAILED_TO_RECONNECT=4003 / MAY_TRY_RECONNECT=4010。
- **对我方的直接冲击：`onLeave` 的 `if (consented)`（ForestRoom.ts:356-359）在 0.18 下任何非 0 code（含 1005/1006/4010 等断线路径）都为真值 → 一律走"立即释放席位"分支 → 断线重连窗（60s 冻结等待）彻底失效。** 必须改写为 `code === 1000 || code === 4000`（与客户端 isConsentedClose 同口径，net.ts:72-74）。

### B4【行为·需重验】重连路径不再调用 `onJoin`：新增 `onReconnect` / `onDrop` 钩子

- 0.16：重连走 `_onJoin` 内 `_reserveSeat(sessionId, true, …)` → onJoin 以 `options=true` 被调用（我方 ForestRoom.ts:319-325 注释即此语义，0.16 Room.js:500-620）。
- 0.18：`_onJoin` 的 `isWaitingReconnection` 分支只 resolve `_reconnections` Deferred 并调新钩子 `onReconnect(client)`，**onJoin/onAuth 均不执行**（[core18]/build/Room.mjs:1064-1089）；普通掉线派发 `onDrop`（:1449）。
- 我方 `allowReconnection` 的 await 语义不变（Deferred resolve，[core18]/Room.mjs `allowReconnection` 段与 0.16 Room.js:524 同构，均 resolve 新 client 实例；L-02 补发用的旧 client 引用行为需在 13 例集成测试下重验）。席位保留/`seatReservationTimeout`、`hasReservedSeat`、`checkReconnectionToken` 均在（[core18]/Room.d.ts:250-254, 501-505）。
- 附带：静态 onAuth 的调用点从 0.16 MatchMaker.js:469-470 移到 [core18]/build/MatchMaker.mjs:546-555，**签名不变** `(token, clientOptions, authContext)`、实例级 onAuth 覆盖告警语义不变（:209-211，同 0.16 :255-257）；`authedStatically` 跳过实例 onAuth 的逻辑保留（[core18]/Room.mjs:1102-1103，同 0.16 Room.js:531-535）。我方双 onAuth 结构可原样平移。

### B5【行为·退化】matchmaking 级 AuthContext 丢失 socket.remoteAddress 兜底

- 0.16：handleMatchMakeRequest 构造 authContext 带 `ip: x-real-ip ?? x-forwarded-for ?? req.socket.remoteAddress` 与原 req（[core16]/build/Server.js:233-243）。
- 0.18：`createAuthContext({ headers, req: ctx.request })`（[core18]/build/router/default_routes.mjs:19）——`ip = x-real-ip ?? x-forwarded-for ?? x-client-ip ?? remoteAddress`（[core18]/build/Transport.mjs:36-51），而此处 **remoteAddress 未传、req 是 better-call 的 Request 包装（无 .socket）**。
- 对我方：静态 onAuth 的 IP 固定窗口限流（ForestRoom.ts:86-90 authIp + checkAuthRateLimit）在**无代理直连**场景（LAN/127.0.0.1）拿不到 socket 兜底 → 全部落入 "unknown" 桶（共享 60 次/分）。隧道场景（樱花穿透注入 x-real-ip/xff）不受影响。升级时需评估：接受退化、或改在 B1 新时序里自取。upgrade 侧（ws-transport）仍传 `remoteAddress: req.socket.remoteAddress`（[tr18]/build/WebSocketTransport.mjs:35-38），房间内实例 onAuth 不受影响。

### B6【破坏·线协议】Schema 3 → 5（core 0.18 peer `@colyseus/schema ^5.0.8`），JOIN_ROOM 布局变更，旧客户端不可混用

- 依赖证据：[core18]/package.json peerDependencies `@colyseus/schema: ^5.0.8`（[core16] 为 `^3.0.0`）；schema latest 5.0.42，v3 终版 3.0.76（我方现装）。
- 我方 Schema 用法平移面：
  - `Schema`/`MapSchema`/`defineTypes`/`$filter` 在 5.0.42 全部仍在导出（[schema5]/build/index.mjs:11580 导出表；CJS `build/index.cjs` 仍在，我方 CJS shim 可用）；
  - `defineTypes` 仍支持原始字符串 + `{ map: Class }`（[schema5]/build/index.mjs:7452-7460 + makeAutoDefaultFactory 对 `rawType.map` 的处理），**但首次调用起 console.warn 宣告弃用**，官方推荐 `schema()` + `t.*` builder；
  - r4 的 `$filter = undefined` 手工遮蔽（state.ts:260-262）：schema 5 编码器已内建同型优化——`const filter = (isSchema && !hasAnyView) ? undefined : ctor[$filter]`（[schema5]/build/index.mjs:1849-1857），我方补丁变为冗余（不致错，升级后应删除并重跑字节等价 A/B 验证）；
  - state.ts"字段必须在 constructor 赋值"的 prototype-setter 拦截纪律是否仍适用于 v5，需在迁移分支实测（v5 支持 `type()`/builder 声明式路径，语义可能不同）。
- 线协议证据：0.18 JOIN_ROOM 布局 `[10][rt-len][rt][sid-len][sid][stateReflectionLen varint][stateReflection][…sections]`（[core18]/build/Protocol.mjs:24-60，注释明确 varint 前缀与 trailing sections）；0.16 为 `[10][rt-len][rt][sid-len][sid][handshake 直附]`（[core16]/build/Protocol.js:68-80）。opcode 表 10-17 两版一致（[st]/build/Protocol.mjs:4-12 对照 [core16]/Protocol.js:29-35）。
- **旧客户端不可用判据**：colyseus.js@0.16.22 的 join 处理把剩余字节直接交给 schema3 `Reflection.decode`（node_modules/colyseus.js/build/cjs/Room.js:159-176 → serializer/SchemaSerializer.js:38-52），schema3 的 decode 从 it.offset 起按操作码读、**无长度前缀概念** → 0.18 服务端 handshake 会被 v3 解码器错位解析。且 colyseus.js 全系绑定 schema 3.0.76（npm ls 实测）。⇒ 服务端升 0.18 的同时客户端**必须**换 @colyseus/sdk（B7），不存在"只升服务端"的中间态。

### B7【破坏·客户端生态】colyseus.js 停更于 0.16.22，0.18 客户端 = @colyseus/sdk（独立新包）

- `npm view colyseus.js versions` 终版 0.16.22（latest tag 即它）；`@colyseus/client` 不存在（E404 实测）；0.18 元包 README 官方指路 `npm install @colyseus/sdk`（[meta]/package/README.md:28）。
- @colyseus/sdk@0.18.6 依赖 @colyseus/schema ^5.0.8 + msgpackr + better-call（[sdk]/package.json）。
- API 平移面（我方 net.ts 逐项对照 [sdk]/build/*.d.ts）：
  - `Client` = `ColyseusSDK` 别名（[sdk]/build/Client.mjs:304-306），`create/joinById/joinOrCreate/reconnect(token)` 均在（[sdk]/build/Client.d.ts:78-98）；`reconnect` 只收 token（[sdk]/build/Client.mjs:127-135），token 复合格式 `roomId:token` 与 0.16.22 客户端一致（colyseus.js Room.js:178 同拼接）→ 我方 sessionStorage 快照格式兼容；
  - `room.reconnectionToken/sessionId/roomId/state` 平铺属性（[sdk]/build/Room.d.ts:15-17）；`onMessage` 返回退订函数、新增 send 回调/`sendUnreliable`/请求-响应重载（:100-124）；`onLeave(cb(code, reason))`（:34-40，code 数字口径与 B3 修订后的服务端判别一致）；`leave(consented?)` → Promise<number>（:99）；MatchMakeError 保留（[sdk]/build/errors/Errors.mjs:31-38，服务端 error.message→MatchMakeError 链路在 [sdk]/build/Client.mjs:233-249）；
  - 新增内建自动重连（`room.reconnection: ReconnectionOptions`，[sdk]/build/Reconnection.d.ts）——我方 net.ts 的手写退避重试/tryResume 有机会简化，但 H-04 语义（有限次+令牌缺失判失败）需逐条对照后再动。
- 连带改动：vite manualChunks 改 `["@colyseus/sdk"]`；集成测试 13 例的客户端半边全部随迁；`benchmark/perf-capacity.mjs:80` 同迁。

### B8【弃用·别名保留】Server/Room 弃用入口（语义未变，建议随迁改名）

- `setState` → `.state =`（[core18]/build/Room.mjs setPatchRate 段紧邻注释 "Use .state = instead"）；`setPatchRate` → `.patchRate =`（Room.d.ts:615-617 deprecated 标注；setter 清旧 interval 重建的语义与 0.16 相同，Room.mjs:239-255，我方 ForestRoom.ts:277-279 的顺序注释仍成立）；`setSimulationInterval` → `setTimestep`（Room.d.ts:521-524 "kept for backwards compatibility — forwards"；实现同为 setInterval + `clock.deltaTime` 实测墙钟差值，[core18]/Room.mjs setTimestep 段，**我方 60Hz tick 的 dt 语义不变**；DEFAULT_SIMULATION_INTERVAL 两版同为 1e3/60：0.16 Room.js:50 / 0.18 Room.mjs:38；DEFAULT_PATCH_RATE 两版同为 1e3/20：0.16 Room.js / 0.18 Room.mjs:37）。
- `maxMessagesPerSecond`（默认 Infinity，[core18]/Room.d.ts:224-229）：0.18 新增逐客户端消息速率上限，默认关闭，我方 60Hz input 不受影响；可作为 M5 之外的纵深防御选项。

### B9【依赖面】元包与依赖树显著扩大

- `colyseus@0.18.10` dependencies 新增 @colyseus/tools、@colyseus/monitor、@colyseus/playground、@colyseus/auth（0.16 元包仅 auth/core/redis-driver/ws-transport/redis-presence，`npm view colyseus@0.16.0 dependencies` 实测对照）。
- core 0.18 新增直接依赖 `msgpackr`（取代 @colyseus/msgpackr）、`@colyseus/better-call`、`@colyseus/shared-types`；peer 新增 `zod ^4`（可选）与 express `^4.16 || ^5`（我方 express 4 满足）；engines node ≥22（我方 ≥22.12）。
- 部署面影响：私用单进程同端口架构（express 静态 + colyseus WS 同 httpServer）不变；WebSocketTransport 仍收 `{ server: httpServer }`（[tr18]/build/WebSocketTransport.ts:119-123）。

### B10【安全驱动】现装 0.16 全树挂 npm audit moderate（nanoid 链），官方修复路径即 0.18

- 我方既有证据 note/evidence/2026-10-23-recheck/02-npm-audit-omit-dev.json：@colyseus/auth、@colyseus/core、@colyseus/redis-driver、@colyseus/redis-presence、@colyseus/ws-transport、colyseus 全部 moderate，via 均为 `nanoid`（另 nanoid 自身 high：不可预测生成/负尺寸死循环）；@colyseus/core 受影响 range `<=0.16.26`；`fixAvailable: colyseus@0.18.10 (isSemVerMajor: true)`。
- 根因对照：core 0.16.26 依赖 `nanoid ^2.0.0`，core 0.18.23 升至 `nanoid ^3.3.11`（两者 package.json 实测）。
- 替代路径（供裁决，非本档推荐）：npm `overrides` 强制 core 0.16.26 走 nanoid ^3——两版 generateId 均为 `nanoid(length)` 单参调用（0.16 Utils.js:43-49 / 0.18 Utils.mjs:9-18），API 兼容；属供应商覆盖，需自担回归验证义务。

---

## §3 迁移风险与工作量

| # | 改动项 | 类型 | 涉及我方文件 | 预估 | 回归门禁 |
|---|---|---|---|---|---|
| R1 | matchmakeGuard 按 0.18 路由时序重设计（含 guard 与 better-call body 读取并存的 destroy/错误路径实测） | 重设计 | packages/server/src/matchmakeGuard.ts、index.ts:79-88 | 0.5-1 槽 | 16KB 拒绝 413、正常 join/create/subscribe 全通、攻击面手测（超大 body/chunked/无 content-length）；e2e journey |
| R2 | `onLeave` 第二参 boolean→code（`consented`→`code===1000\|\|4000`），断线冻结/席位释放全链复核 | 小改+重验 | ForestRoom.ts:350-397 | 同槽顺带 | **13 例房间集成测试全过**（其中重连/超时/补位例直接覆盖）；e2e rejoin/refresh 强相关 |
| R3 | 重连不调 onJoin、新 onDrop/onReconnect：L-02 finish 补发、pause-changed 补发、角色保留、H-01/H-02 时序在 0.18 下重验 | 重验（可能零改动） | ForestRoom.ts:319-397 | 同槽 | 13 例集成 + e2e refresh3/rejoin 路径；FW_RECONNECT_SECONDS=2 短窗注入路径 |
| R4 | 静态 onAuth IP 兜底退化（B5）：直连场景限流语义变化 | 评估+小改 | ForestRoom.ts:86-90, 303-309 | 同槽 | 单测 forest-room.unit.test.ts:41-64（注入 context 构造需随 AuthContext 形状更新）；手测 LAN 直连限流 |
| R5 | 弃用 API 更名（state=/patchRate=/setTimestep）+ $filter 遮蔽删除（v5 内建同型优化） | 机械改+字节验证 | ForestRoom.ts:157, 276-279；state.ts:260-262 | 同槽顺带 | **det 48 全过 + 字节等价 A/B（patch+encodeAll）**：r4 同口径复跑，出站字节必须逐字不变 |
| R6 | 服务端整体：CJS shim 0.18 可用性（colyseus/@colyseus/schema/@colyseus/ws-transport 三包 CJS 入口单实例）验证；元包重导出面（tools/monitor/playground 进树） | 验证 | colyseus.cjs.ts | 0.5 槽内 | 启动烟测 + typecheck；双实例症状（seat reservation expired / Symbol.metadata）零复现 |
| R7 | 客户端迁 @colyseus/sdk：net.ts 全量迁移 + vite 分包名 + sessionStorage 令牌格式 + MatchMakeError 提示链路 | 迁移 | packages/client/src/net.ts、vite.config.ts、benchmark/perf-capacity.mjs | 1 槽 | e2e 全带（pause/refresh/journey）；密码错误/房间不存在文案直达（ServerError→MatchMakeError→UI） |
| R8 | 集成测试客户端半边迁移（13 例 colyseus.js→@colyseus/sdk）+ 单测 AuthContext 构造更新 | 迁移 | packages/server/src/__tests__/* | 并入 R7 槽 | **13/13 全过为硬门禁** |
| R9 | 全量回归窗口：det 48 + fixtures 6 + vitest 119 + e2e + benchmark 脚本跑通（perf-sync/perf-serialize 用 schema5 Encoder/Reflection 重跑，数值不对比仅可用性） | 门禁 | benchmark/* | 0.5 槽 | 全绿才可合；出站带宽/p50 补一层 perf-capacity 对照防 schema5 编码面变化 |
| R10 | package.json/lock 变更（colyseus 0.18.10、@colyseus/sdk 0.18.6、删 colyseus.js）+ overrides 备选 | 依赖 | package.json、package-lock.json | — | npm audit 清零 nanoid 链（02 号证据复跑对照） |

**合计：约 2.5-3 槽（L 级变更）**，且升级窗口内双线（0.16 稳定线/0.18 分支）并行维护成本另计。全部门禁以"det 48 与 13 例房间集成测试必须全过、e2e rejoin/refresh 强相关"为底线（派发要求原文）。

---

## §4 立项建议（初步，终裁归用户）

**建议：有条件立项，倾向"值得升"，但按 L 级独立分支排期，不与任何玩法线并行。**

- 支持升级的硬理由：
  1. **安全债是真实挂账**：现装 0.16 全树 moderate（nanoid^2 链，另有 nanoid 自身 high），官方唯一修复路径即 0.18（B10，audit 实测 fixAvailable=0.18.10 major）。不升则需长期背着 overrides 或忽略项。
  2. 0.18 是活跃主线（0.18.23 与 0.17.55 同日 2026-10-22 发版），0.16 线最新补丁停在 2026-09-06，长期只会越拉越远。
  3. schema 5 把我方 r4 手工 $filter 补丁内建化（B6），升级后可删 vendor 依赖面代码；@colyseus/sdk 内建自动重连可考虑替换手写退避（H-04 语义核对后）。
- 反对/缓升的理由：
  1. 三处高危行为面同时被触碰：matchmakeGuard 时序反转（B1/B2，安全闸门重设计）、onLeave 语义反转（B3，改错即断线重连全灭）、客户端 SDK 全迁（B7，net.ts+e2e 全带重验）。私用 2 人场景下，这些风险换来的日常功能收益趋近于零。
  2. defineTypes 弃用告警、schema5 状态声明范式（constructor 赋值纪律是否仍必要）等存在未实测项（本档标注于 B6），迁移中可能追加发现。
- 若用户裁决"不立项"的替代：npm overrides 把 core 0.16.26 的 nanoid 钉到 ^3（B10 替代路径，generateId 单参调用两版兼容），以最小改动清掉 audit 挂账；代价是自担供应商覆盖的回归验证（约 0.5 槽）。
- 若立项，建议顺序：R6（shim 验证）→ R2/R3/R4/R5（服务端行为面）→ R1（guard 重设计）→ R7/R8（客户端+测试迁移）→ R9（全门禁窗口）；分支名建议 `upgrade/colyseus-0.18`。

## 附：本档证据可复现命令

```
npm view @colyseus/core versions --json          # 版本谱（0.16.26 → 0.17.55 → 0.18.23）
npm view colyseus.js versions --json             # 终版 0.16.22
npm view @colyseus/sdk version                   # 0.18.6（0.18 客户端）
cd TEMP/c018 && npm pack @colyseus/core@0.18.23 @colyseus/schema@5.0.42 \
  @colyseus/ws-transport@0.18.4 colyseus@0.18.10 @colyseus/tools@0.18.10 \
  @colyseus/sdk@0.18.6 @colyseus/shared-types@0.18.2 @colyseus/better-call@1.3.1
# 对照已安装 0.16：node_modules/@colyseus/core、node_modules/colyseus.js、node_modules/@colyseus/schema
# 关键行号见 §2 各条 B1-B10
```
