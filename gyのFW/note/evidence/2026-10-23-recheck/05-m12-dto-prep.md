# 05 · M12 挂账：共享 DTO 快照类型草案（netDto）——预处理备料

- 日期：2026-10-23
- 执行槽：槽 1（预处理备料；纯新增、未接线，未做任何路线/可达性/门禁裁决）
- 来源挂账：`note/audit/2026-10-21-code-audit/02-medium.md` M12（客户端网络边界大量 any，服务端 schema 字段漂移被静默吞掉；0.3.25 `BodyState.state` 漏注册即此类。0.3.42 已有客户端侧首快照告警 `packages/client/src/snapshotValidation.ts`，本轮补共享 DTO 草案）
- 基线：服务端 schema @ `packages/server/src/rooms/state.ts`，HEAD `9813dc2` 工作区；下文 state.ts :NNN 均指该时点行号
- 纪律：**未修改** `packages/client/src/`、`packages/server/src/` 任何文件（GameScene.ts 归主会话所有，本轮只读）；仅新增两个文件 + index.ts 一行导出 + 本档

## 0. 产出物

| 文件 | 行数 | 说明 |
|---|---|---|
| `packages/shared/src/netDto.ts` | 320 | 8 个快照状态类 DTO 接口 + 字段清单常量 + 派生工具（零 import，不反向依赖 server） |
| `packages/shared/__tests__/netDto.test.ts` | 246 | 21 例单测：运行时读服务端 `ctor[Symbol.metadata]`（defineTypes 落点）与 DTO 清单逐一对照 + 漂移检出演示 |
| `packages/shared/src/index.ts` | +1 | barrel 追加 `export * from "./netDto.js"`（仅此一行） |
| `note/evidence/2026-10-23-recheck/05-m12-dto-prep.md` | 本档 | 对照表 + 漂移演示 + 接线建议 |

验证门禁（本机实跑）：
- `npx vitest run packages/shared/__tests__/netDto.test.ts` → **21/21 绿**
- `npm run typecheck`（tsc -p tsconfig.json）→ **0 错**
- `npx vitest run` 全仓 → **19 文件 / 217 用例全绿**（含本 21 例，无回归）
- 测试文件不在 tsconfig include（`packages/shared/__tests__` 未列入），另跑 `npx tsc --noEmit --strict ...` 单文件核 → **0 错**
- 负向对照（防恒绿自证）：向 `PLAYER_SNAPSHOT_FIELDS` 实际注入 `ghostSpeed` → 4 例红（PlayerState 全等 + 总量锚等）；还原后 21/21 绿

## 1. DTO ↔ 服务端 Schema 对照表

对照源（可编程读取，非人工抄录）：`@colyseus/schema` 3.0.76 的 `defineTypes` 把注册信息落在 `ctor[Symbol.metadata]`（数字索引键 → `{ name, type }`），测试读取该元数据与 netDto 清单逐字段比对名与种类。

| 服务端类（state.ts 类声明 / defineTypes 注册） | DTO 接口 | 字段数 | 字段构成 |
|---|---|---|---|
| `PlayerState`（:17 / :174-189） | `PlayerSnapshotDto` | 14 | 7 数值（x/y/vx/vy/facing/headTilt/doorFrame）+ 1 字符串（anim）+ 6 布尔（inLiquid/dying/dead/isDead/atDoor/doorUp） |
| `DiamondState`（:52 / :191-193） | `DiamondSnapshotDto` | 1 | collected: boolean |
| `LeverState`（:61 / :195-199） | `LeverSnapshotDto` | 3 | group/state/angle 全数值 |
| `PusherState`（:75 / :201-206） | `PusherSnapshotDto` | 4 | group/state/x/y 全数值 |
| `BodyState`（:91 / :208-215） | `BodySnapshotDto` | 4 | x/y/angle/state 全数值（五集合复用） |
| `WindState`（:107 / :217-220） | `WindSnapshotDto` | 2 | group/state 全数值 |
| `DoorState`（:119 / :222-229） | `DoorSnapshotDto` | 6 | fb/wg × AtDoor布尔/Frame数值/Up布尔 |
| `RoomState`（:138 / :231-246） | `RoomSnapshotDto` | 14 | 3 标量（phase:string / levelId:string / timerMs:number）+ 10 MapSchema 集合 + 1 类引用（doors） |
| **合计** | **8 接口** | **48** | 总量锚断言 = 48（2026-10-23 快照） |

RoomState 集合拓扑（`ROOM_COLLECTION_CHILD` / `ROOM_REF_FIELDS` 常量）：

| 房间字段 | 子类 | 备注 |
|---|---|---|
| players | PlayerState | 键 = Role（fireboy/watergirl，types.ts `ROLES`）；席位未加入时键缺席 |
| diamonds | DiamondState | 键 = 钻石 id |
| levers / pushers / winds | LeverState / PusherState / WindState | 键 = 机关 id 字符串 |
| platforms / props / hangings / pulleys / romans | BodyState（复用） | 键 = 机关 id；pulley 两板键 u{id}a / u{id}b |
| doors | DoorState（引用非 Map） | 每关恰一对，单条目 |

## 2. 防漂移机制（三层）

1. **编译期（netDto.ts 内部）**：子类清单常量标注 `WireSpecOf<XxxDto>`（由接口字段类型机械推出 `"number"/"string"/"boolean"`），接口改类型而常量忘改即编译错；房间清单 `as const satisfies Record<keyof RoomSnapshotDto, RoomFieldSpec>` 双向锁死键集（少键/多键均红）。
2. **测试期（与服务端对照）**：`netDto.test.ts` 运行时读服务端类 own `Symbol.metadata`（漏 defineTypes 的类无 own 元数据，读取器直接抛错——0.3.25 式漏注册无所遁形），与 DTO 清单走同一把 `diffSpec` 梳子比对，输出 `dtoMissing / serverMissing / typeMismatch` 三桶。
3. **总量锚**：两侧字段总数相等且 = 48。扩字段时须同步 DTO 并更新锚，强迫人工过目。

## 3. 漂移检出演示（vitest 实跑）

三例均篡改「服务端注册元数据的副本」喂给与全等断言**同一把** diff 梳子（非独立断言路径），另有第四例类型漂移：

| 漂移 | 模拟 | 检出 |
|---|---|---|
| 少字段 | defineTypes 漏注册 `anim`（0.3.25 `BodyState.state` 同型） | `serverMissing: ["anim"]` |
| 多字段 | 服务端新增 `ghostSpeed: "number"`，DTO 未跟 | `dtoMissing: ["ghostSpeed"]` |
| 改名 | `doorFrame` → `doorframe` | `serverMissing: ["doorFrame"]` 且 `dtoMissing: ["doorframe"]` 同时报出 |
| 改类型（加演） | `anim` 注册成 `number` | `typeMismatch: ["anim"]` |

另做了**真实改动负向对照**：直接往 `PLAYER_SNAPSHOT_FIELDS` 注入 `ghostSpeed` 后实跑套件 → 4 例红（PlayerState 全等断言、48 总量锚等）；还原后 21/21 绿。证明对照环对真实编辑有效，非合成数据自证。

## 4. 两点事实澄清（只记录，不裁）

- **`paused` 并非已注册字段**：`RoomState` 14 个字段中没有 `paused`。暂停经两条既有通路表达——phase 词表值 `"paused"`（state.ts :11：lobby|ready|started|paused|won|gameover，断线冻结用）与 `"pause-changed"` 消息（玩家 F3，载荷 `{paused, by}`，见 client `net.ts` `PauseChangedMessage`）。netDto 以 `ROOM_PHASE_VALUES` 常量收编词表，单测含负断言（注册面无 `paused` 字段）。
- **已注册但客户端当前无消费点的字段**（grep `packages/client/src` 全量核实，仅记录现状，裁剪与否归主会话）：`PlayerState.dead` / `atDoor` / `doorUp` 三字段，以及整个 `DoorState`（六字段；客户端门开合走 `PlayerState.doorFrame`，GameScene 未读 `state.doors`）。

## 5. 客户端快照消费面清单（只读 GameScene.ts 所得）

消费入口：`GameScene.update()` → `updatePlayers(st)` / `updateDiamonds(st)` / `updateMechs(st)` / `updatePlatformSound(st)`（行号随主会话改动漂移，故只记方法名）。逐字段：`st.phase/levelId/timerMs`（update + net.ts onStateChange 差分）、`players.get(role)` 全部 14 字段中 11 个有读点（x/y/vx/vy/facing/anim/headTilt/inLiquid/dying/isDead/doorFrame）；`diamonds.forEach`（collected）；八集合 forEach 传 `cbXxx` 回调（levers.state/angle、pushers.state/x/y、platforms/props/hangings/pulleys/romans 的 x/y/angle、platforms 与 winds 另读 state）。

## 6. 后续接线建议（本轮未接线）

1. **snapshotValidation 改吃共享清单**（最小接线）：`packages/client/src/snapshotValidation.ts` 现内嵌 `PLAYER_NUMERIC`（仅 x/y/vx/vy/facing 五项）与 `NUMERIC_GROUPS`（八组、部分仅列子集，如 winds 只查 state 不查 group）。路径：改为 `import { numericFieldNames, ROOM_COLLECTION_CHILD } from "@fw/shared"` 派生——PlayerState 数值全集为 7 项（现查 5 项，headTilt/doorFrame 未查），winds 数值全集 2 项（现查 1 项），接线时校验面会**变宽**，属期望行为但需过一遍首快照告警实测再合入。
2. **类型收编 any**：`Net.room: Room<any>` 与 GameScene `updatePlayers(st: any)` 等，可逐步改为 `Room<RoomSnapshotDto>` / `st: RoomSnapshotDto`（MapSchema 运行时非普通 Record，接口侧已用 `Readonly<Record<string, T>>` 近似，接线时可能需窄化适配层）。
3. **测试进 include**（可选）：`packages/shared/__tests__` 未列入根 tsconfig include，本测试文件靠 vitest esbuild 转译运行（已另跑单文件 tsc 0 错兜底）；若后续测试文件增多，建议 include 加 `packages/shared/__tests`。
4. DTO 命名保留 `SnapshotDto` 后缀，避免与 `@fw/shared/kernel` 已有 `PlayerSnapshot`（内核侧世界快照，语义不同）冲突。

## 7. 残留与清理

- `TEMP/slot1/`（探测脚本 probe.ts + 负向对照备份）已清理。
- 本轮未触碰其他槽的工作区改动（GameScene.ts / cameraRig.ts / clipboard.ts 均为主会话既有改动，未 add）。
