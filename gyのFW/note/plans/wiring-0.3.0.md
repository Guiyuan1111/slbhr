# 0.3.0 server+client 接线改造精确清单

> **✅ 状态：本施工单已于 0.3.0 执行完毕**（2026-10-05 合并发版）。文中行号/结构对应当时分支现状，
> 仅作决策与依据追溯用；现行代码以后续提交为准。

> 产出日期：2026-10-04。性质：**只读盘点后的施工单**——本文档不给实现代码，只给"改哪个文件、哪个锚点、改成什么形状、为什么"。
> 依据：`note/handoff/2026-10-04-execution-freeze.md`（冻结 12 项）、`note/handoff/2026-10-04-fidelity-rewrite.md`（提取冻结）、`note/research/2026-10-fidelity/02-gap-audit-logic.md`（E1-E20/G/M 缺陷）、`01-original-engine-spec.md`、`03-asset-data-fidelity.md`，以及本轮对参考库 `init.js` 的补充字节级复核（下列"字证"均给出字节偏移，可复验）。
> 行号基准：本轮实读的工作区文件（分支 `feat/fidelity-rewrite` 现状）。行号会随后续提交漂移，**函数名+代码片段为第一锚点，行号仅辅助定位**。

---

## 0. 范围与总原则

1. **本文档只覆盖 server+client 接线**。`packages/shared` 的物理内核重写（box2d）由另一条线执行；本文把对接点的"内核假设"集中列在 §2，内核落地时若字段名不同，**在映射点对齐，不改本文的 schema/客户端结构**。
2. server 是唯一权威：客户端不做任何玩法判定，只消费快照与消息（PLAN §5.3 铁律，E13 是它的未达成项）。
3. 冻结的有意偏离（不再讨论，只记录）：见 §13。
4. 本批次不含：触屏、选关 UI（神庙星图）、存档、传送门。

---

## 1. 现状锚点速查（改造涉及的函数/行号）

| 文件 | 锚点 | 行号 |
|---|---|---|
| client `src/main.ts` | `LEVEL_ID` 常量 | 18 |
| | `fetchLevel()`（直fetch tutorials 路径） | 27-48（28 URL、34 base） |
| | `joinUrl()` | 50-59 |
| | `updateHud()`（phase 文案 + setPaused） | 65-80（79 = `setPaused(phase !== "playing")`） |
| | `enterGame()`（fetchLevel→Phaser 启动） | 82-108（83 fetch、100 `__fwInit` 注入、104 HUD 轮询） |
| | `start()`（Net.connect 传 levelId） | 110-150（119 levelId、121-126 onRole、127-132 onDeath、133-135 onWin） |
| | `bindUi()`（#btn-restart） | 152-159（155-158） |
| client `src/net.ts` | `JoinParams` / `NetCallbacks` | 11-17 / 19-25 |
| | `Net.connect()`（create/join、onMessage 注册） | 42-74（47-50 房间创建、52-57 消息注册、59-72 onLeave 重连） |
| | `sendInput()` / `restart()` | 76-78 / 80-82 |
| client `src/input.ts` | 键组 LEFT/RIGHT/UP | 7-10 |
| | `setPaused()` | 38-44 |
| | `emit()`（变化即发，无 seq/重发） | 46-57（53 `sameInput`） |
| client `src/scenes/BootScene.ts` | 音频加载表 | 41-53（47 sfx_lever、48 sfx_end_pass） |
| | `buildAnims()` | 62-99（73 idle、75 run、76 jump、**77 fall**、78-79 stairs、81 smoke、83-91 liquid、92-94 door） |
| client `src/scenes/GameScene.ts` | `FEET_TO_CENTER` / `GROUP_COLORS` | 27 / 29-31 |
| | `create()`（build* 调用序、BGM） | 101-131（**126 buildDust**、129-130 bgm） |
| | `buildMechs()`（gid 0/2/4 静态贴图） | 262-302 |
| | `buildDoors()`（0000 静帧） | 336-348 |
| | `buildPlayers()` | 354-371 |
| | `buildDecorations()`（mulberry32(0x5eedfa)） | 374-432 |
| | `buildTutorial()`（静态全显） | 435-449 |
| | `buildDust()`（臆造浮尘） | 452-473 |
| | `buildHud()`（**"02:00"占位**） | 475-508（481 时钟文本） |
| | `update()` | 514-634（519-523 时钟、549-556 死亡烟、559-581 动画 switch、583-592 门、596-605 钻石+HUD、607-613 平台、615-619 箱、621-633 通关） |
| | `showFinishBoard()` | 636-703（656-660 三行、680 星级） |
| | `collectedAll()/countGot()/elapsedText()` | 705-724 |
| | `restartLevel()` | 726-729 |
| | `countCollected()`（fbwg 双计） | 732-742 |
| server `src/rooms/state.ts` | `PlayerState` | 14-33 |
| | `RoomState`（phase/levelId/timerMs/players/diamonds/platforms/box） | 66-85 |
| | `defineTypes` 段 | 87-119 |
| server `src/rooms/ForestRoom.ts` | `JoinOptions` | 18-21 |
| | `onCreate()`（levelId、phase=playing、restart 消息、仿真循环） | 35-68（38、40、45、48-57 input、59-65 restart、67） |
| | `onAuth()` | 70-76 |
| | `onJoin()` | 78-92 |
| | `onLeave()` | 94-111（103 恢复硬编码 "playing"） |
| | `tick()` | 117-131 |
| | `handleEvents()` | 133-142 |
| | `syncState()` | 144-183 |
| server `src/levels.ts` | `LEVEL_DIRS` | 16 |
| | `loadLevel()` | 26-49（48 throw 文案） |
| server `src/index.ts` | 静态托管 | 24-26 |
| | 音频无扩展名路由 | 31-44 |
| | `gameServer.define("forest", ForestRoom)` | 48-51 |
| shared `src/types.ts` | `Anim` 联合 | 23 |
| | `WorldEvent` 联合 | 26-31 |
| | `InputState` / `sameInput` | 6-12 / 18-20 |
| shared `src/level.ts` | `TutorialTextDef` | 77-84 |
| | `MechPropDef`（**无 id 字段**） | 69-75 |
| | `LevelData`（115 tutorials） | 86-116 |
| | 教学层收集 / 变体择一 | 271-280 / 284-289 |
| | mechProps push（250-254，无 id） | 247-268 |
| shared `src/params.ts` | `DOOR`（frameRate 25 / frames 21 / finishDelayMs 1600） | 85-93 |
| client `index.html` | `.hint` 键位文案 | ≈150-153 |
| | `#win-panel`（死 DOM，从未显示） | ≈157-166 |

---

## 2. 内核对对接假设（内核批次落地时对齐，双方以此为准）

内核保持 `World` 公共接口（`step(dt): WorldEvent[]`、players/diamonds/platforms/levers/plates/box/phase/timerMs/inputs/reset()），接线依赖以下**扩展字段**。若最终命名不同，只改 §5.4/§5.5 两处映射点：

| # | 假设 | 用途 |
|---|---|---|
| K1 | `world.levers: {id, state: -1\|1, group, ...}[]`（`state` 取代旧 `on:boolean`；来自 leverA+leverB 全集） | E13 lever 快照 |
| K2 | `world.pushers: {id, state: 0\|1, ...}[]`（0=顶位 1=压下>0.2m；如有连续位移字段 `offset` 则优先用连续值） | E13 pusher 快照 |
| K3 | `world.boxes: {id, x, y, angle}[]` 与 `world.balls: {id, x, y, angle}[]`（id 与 `level.mechProps[].id` 一致）；旧单数 `world.box` 删除 | E13 箱/球快照 |
| K4 | `world.players[role]` 增加 `inLiquid: boolean`（脚部接触已方免疫液面，即原版 isOnLiquid）；`Anim` 联合增加 `"rising"` | 水声 / E19 |
| K5 | 门进度：`world` 暴露每角色门状态 `{atDoor, frame: 0..21, up: boolean}`（内核负责 25fps 扫帧与 isUp，`win` 事件=双 isUp）。若内核只给 `atDoor`，由 ForestRoom 推导（见 §5.5 门回写代码注释中的推导分支） | E10 |
| K6 | `WorldEvent` 扩容后仍含 `death`/`win`/`diamond`/`lever`；新增（名称以内核为准）：platform 启动/换向、pusher 压下。若内核不发这两类事件，ForestRoom 在 syncState 里做状态差分自己发（§5.5 已给差分分支） | M10 音效 |
| K7 | 死亡不再复活：内核删除 respawn 逻辑（E1），`death` 事件后该角色保持 `alive:false` 直到 `reset()` | E1 |
| K8 | `level.mechProps[]` 全部带稳定 `id`（`m0,m1,...` 按解析序），机关对象（lever/pusher/box/ball 等）的 id 与之同源 | E13 key 对齐 |

---

## 3. shared 前置改动（内核线的交接件，接线开工前必须合入）

### 3.1 `packages/shared/src/types.ts`

- **L23 `Anim`**：`"idle" | "run" | "jump" | "fall" | "dead"` → 增加 `"rising"`（字证：`init.js@1862115` `animations.add("rising", generateFrameNames(o+"_head_rising",0,4,"",4), 30, !0)`，双角色同帧域；判定条件 `init.js@1874772` `u.y > 3 → rising`）。
- **L26-31 `WorldEvent`**：按 K6 扩容（platform/pusher 事件）。`lever` 事件建议改为携带 `{ type:"lever"; id: string; group: number; state: -1|1 }`（客户端与服务器 sfx/回写都要 id）。
- **L6-12 `InputState`**：增加可选 `seq?: number`。`sameInput()`（L18-20）保持只比较三个方向键（seq 不参与比较）。

### 3.2 `packages/shared/src/level.ts`

- **`MechPropDef`（L69-75）增加 `id: string`**；push 处（L247-254）赋 `id: \`m${mechProps.length}\``。这是 E13 schema key 与客户端视图 key 的对齐基础（K8）。
- **`TutorialTextDef`（L77-84）改为分组结构**（E20 需要触发矩形，现结构只有文本）：

```ts
export interface TutorialGroup {
  id: string;                 // Tiled 对象 properties.id
  texts: { x:number; y:number; w:number; text:string }[];
  rects: Rect[];              // 同 id 的无文本矩形对象 = 触发区
}
// LevelData.tutorials: TutorialGroup[]（L115 同步改型）
```

- **教学层收集（L271-280）**：文本对象进 `texts`，无 `text` 字段的矩形对象进 `rects`（原版 `setupTutorial` 正是按 `properties.id` 分组、文本/矩形两桶，字证：`init.js@1952600` 区段 `n[h.properties.id].texts / .rects.push(new Phaser.Rectangle(h.x,h.y,h.width,h.height))`）。
- **变体择一（L284-289）**：优先级改为 `Tutorial_dual` > `Tutorial` > 其余。依据：原版按 `settings.controls` 取 `Tutorial_<controls>`，联机双端=双控（`init.js@1952340` `_.findWhere(f.layers,{name:"Tutorial_"+controls}) || _.findWhere(f.layers,{name:"Tutorial"})`）；现实现 keyboard 优先是单机假设。**注意**：`Tutorial_dual` 层的层名匹配要兼容 `Tutorial_dual`（现有 `startsWith("Tutorial_")` L271 已兼容）。

---

## 4. server `src/rooms/state.ts` —— E13 快照 Schema 全量设计

> 铁律（文件头 L7-9 已注释）：**所有字段必须在 constructor 赋值**（useDefineForClassFields:false 下原生 class fields 绕过 setter → encode 崩），新类一律照此写。

### 4.1 新增 Schema 类（插在 `BoxState` 之后、`RoomState` 之前）

```ts
/** 拉杆（leverA/leverB 全集）：state = 杆体朝向 -1|1（原版关节角 ±0.2π 的离散化） */
export class LeverState extends Schema {
  state!: number;
  constructor() { super(); this.state = -1; }
}
/** 踏板（pusher）：0=顶位 1=压下（位移>0.2m，params PUSHER.trigger） */
export class PusherState extends Schema {
  state!: number;
  constructor() { super(); this.state = 0; }
}
/** 动力学刚体（box/boxheavy/ball 共用）：角度供滚动球/翻转箱渲染 */
export class BodyState extends Schema {
  x!: number; y!: number; angle!: number;
  constructor() { super(); this.x = 0; this.y = 0; this.angle = 0; }
}
/** 门进度（每关恒 1 对，单条目 key="pair"）：frame 0..21@25fps，up=frame>=21 */
export class DoorState extends Schema {
  fbAtDoor!: boolean; wgAtDoor!: boolean;
  fbFrame!: number;   wgFrame!: number;
  fbUp!: boolean;     wgUp!: boolean;
  constructor() {
    super();
    this.fbAtDoor = false; this.wgAtDoor = false;
    this.fbFrame = 0; this.wgFrame = 0;
    this.fbUp = false; this.wgUp = false;
  }
}
```

### 4.2 `PlayerState`（L14-33）追加字段

| 字段 | 类型 | 初值 | 用途 |
|---|---|---|---|
| `inLiquid` | boolean | false | 水声 waterSteps 循环开关（M10/K4） |

不增设 `rising`/`animFrame` 独立字段——**决策记录**：`rising` 并入 `anim` 字符串（客户端按名播帧），逐帧 `animFrame` 不同步（动画由客户端本地推进，服务端逐帧同步是浪费带宽；原版同为客户端本地播帧）。若内核未来证明头部倾角需要帧级同步，再议。

### 4.3 `RoomState`（L66-85）改动

```ts
this.phase = "lobby"; // lobby | ready | started | paused | won | gameover
// 删除 this.box = new BoxState();（单箱时代结束）
this.levers  = new MapSchema();
this.pushers = new MapSchema();
this.boxes   = new MapSchema();
this.balls   = new MapSchema();
this.doors   = new MapSchema();
```

`defineTypes`（L111-119）同步：

```ts
levers:  { map: LeverState },
pushers: { map: PusherState },
boxes:   { map: BodyState },
balls:   { map: BodyState },
doors:   { map: DoorState },
// 删除 box: BoxState
```

> phase 词汇表（对任务书"ready/started/won/gameover"逐字采纳）：`lobby`=等第二人；`ready`=双人到齐物理冻结倒计时；`started`=运行中；`paused`=断线冻结；`won`=双门 isUp、爬楼演出+结算中；`gameover`=有人死亡、2.5s 后自动重开。旧值 `playing`→`started`、`finished`→`won`，**所有客户端判断点在 §9/§11 一并替换**。

---

## 5. server `src/rooms/ForestRoom.ts`

### 5.1 E14 —— levelId 校验与错误通道（onCreate，锚点 L38/L40）

```ts
const levelId = String(options.levelId ?? "forest_01");
if (!/^[a-z0-9_]{1,64}$/.test(levelId)) {          // 防路径穿越
  throw new ServerError(4404, `非法关卡 ID: ${levelId}`);
}
try {
  this.bundle = loadLevel(levelId);
} catch {
  throw new ServerError(4404, `关卡不存在: ${levelId}`);
}
```

`ServerError` 的 message 会经 MatchMakeError 原样到达创建者，`main.ts start()` 的 catch 已把它显示到 `#menu-error`（L147-149）——这就是"明确错误提示通道"，无需额外消息。**加入方**无需校验（房间已存在=关卡已加载成功）。

`onCreate` 不再设 `phase="playing"`（L45 删除）：初始为 schema 默认 `lobby`。

### 5.2 E15 —— 开局流程（onJoin L78-92 + 新增私有方法）

- `onJoin` 末尾：角色分配后，若 `ROLES` 全部到齐且 `this.state.phase === "lobby"` → 调 `this.startCountdown()`。
- 新增：

```ts
private readyTimer: ReturnType<typeof setTimeout> | null = null;

/** 双人到齐（或整关重开）→ ready 冻结 2.0s → started+开钟。原版字证：
 *  init.js@1943760 区段 startLevel：box2d.paused=true 保持，_.delay(1600)→再 _.delay(400)→
 *  ui.clock.start() + physics.paused=false，合计 2000ms。 */
private startCountdown() {
  if (this.readyTimer) clearTimeout(this.readyTimer);   // 重入保护（重开时先清旧钟）
  this.state.phase = "ready";
  this.syncState();
  this.readyTimer = setTimeout(() => {
    this.readyTimer = null;
    this.state.phase = "started";
    this.syncState();
  }, 2000);
}
```

- `tick()`（L119）：门条件改为 `this.state.phase !== "started"`——ready/won/gameover/paused/lobby 全部不步进物理（物理冻结）；`timerMs` 因内核只在 step 内累计，天然实现"开钟=started"（E15 计时起点修正）。
- **中途加入者同步口径**：
  - 第二人正常加入 → lobby→ready→started（全员看到同一开局倒计时）；
  - 60s 内重连 → Colyseus 全量快照自动重发，phase 保持 `paused`→恢复原 phase（见 5.4）；
  - 超时后角色释放、第三人接管（L106-109 分支）：释放时**追加** `this.world.respawnPlayer?.(role) ?? (() => { /* 若内核无此 API，则记录 TODO：新角色位置由内核 reset 前 syncState 覆盖，行为=从当前世界坐标接管 */ })()`；推荐内核提供单角色重置 API（K 系假设外），否则接受"从世界当前坐标接管该角色"。关卡进度/机关/计时不重置；
  - 双人都走 → 房间自动回收（现状保留）。

### 5.3 E1 —— 死亡 → gameover → 2.5s 整关自动重开（handleEvents，锚点 L133-142）

```ts
private overTimer: ReturnType<typeof setTimeout> | null = null;

private handleEvents(events: WorldEvent[]) {
  for (const ev of events) {
    if (ev.type === "death") {
      this.broadcast("death", { role: ev.role, cause: ev.cause });
      if (this.state.phase !== "gameover") {          // 双杀同帧只走一次
        this.state.phase = "gameover";
        this.overTimer = setTimeout(() => this.restartLevel(), 2500);
      }
    } else if (ev.type === "win") {                    // 内核语义=双门 isUp（E10）
      this.state.phase = "won";
      this.broadcast("finish", this.buildFinishData());
    } else if (ev.type === "lever") {
      this.broadcast("sfx", { name: "lever" });
    }
    // platform/pusher 事件（K6）：如内核发出则同法 broadcast("sfx", {name:"platform"/"pusher"})
  }
}

/** 整关重开（原版 retry 语义：整关重载，init.js:45154-45156）。restart 消息与死亡自动重开共用 */
private restartLevel() {
  if (this.overTimer) { clearTimeout(this.overTimer); this.overTimer = null; }
  this.world.reset();
  this.startCountdown();          // 重开也走 ready→started（E15 口径一致）
}
```

- **restart 消息（锚点 L59-65）改为**：

```ts
this.onMessage("restart", () => {
  // 任意客户端 R 键立即重开：started/won/gameover 皆可（lobby/paused 不允许）
  if (["started", "won", "gameover"].includes(this.state.phase)) this.restartLevel();
});
```

- 删除旧 `win` 分支里 `broadcast("win", ...)`（消息更名 `finish`，见 §7）。

### 5.4 onLeave（锚点 L94-111）

- L100 `phase = "paused"` 前加判断：仅 `ready/started/won/gameover` 才进入 paused；`lobby` 保持 lobby（否则一个人都进不来时状态文案错）。
- 记录 `this.prevPhase`；L103 重连恢复改为 `this.state.phase = this.prevPhase`（现为硬编码 `"playing"`，词汇表更换后必错）。若 prevPhase=`ready`，直接重跑 `startCountdown()`。
- 超时释放角色分支（L106-109）：见 5.2 中途加入口径；同时清理 `state.doors` 中该角色位（由下次 syncState 覆盖即可，无需特判）。

### 5.5 E13 —— syncState 回写（锚点 L144-183）

在现有 players/diamonds/platforms 回写之后追加（`box` 单数回写 L178-181 删除，替换进 boxes 循环）：

```ts
// 机关状态（E13：任何影响玩法的状态必须进快照，PLAN §5.3）
for (const lv of this.world.levers as Array<{ id: string; state: number }>) {
  let s = this.state.levers.get(lv.id);
  if (!s) { s = new LeverState(); this.state.levers.set(lv.id, s); }
  s.state = lv.state;
}
for (const p of this.world.pushers as Array<{ id: string; state: number }>) {
  let s = this.state.pushers.get(p.id);
  if (!s) { s = new PusherState(); this.state.pushers.set(p.id, s); }
  s.state = p.state;
}
const writeBody = (map: MapSchemaType<BodyState>, b: { id: string; x: number; y: number; angle?: number }) => {
  let s = map.get(b.id);
  if (!s) { s = new BodyState(); map.set(b.id, s); }
  s.x = Math.round(b.x * 10) / 10;
  s.y = Math.round(b.y * 10) / 10;
  s.angle = Math.round((b.angle ?? 0) * 1000) / 1000;
};
for (const b of (this.world as any).boxes ?? []) writeBody(this.state.boxes, b);
for (const b of (this.world as any).balls ?? []) writeBody(this.state.balls, b);

// 门进度（E10）：优先内核值（K5）；内核只给 atDoor 时按 25fps 推导
const door = this.state.doors.get("pair") ?? new DoorState();
if (!this.state.doors.has("pair")) this.state.doors.set("pair", door);
const dt = STEP_MS / 1000;
const drive = (cur: number, at: boolean) =>
  Math.max(0, Math.min(DOOR.frames, Math.round(cur + (at ? 1 : -1) * DOOR.frameRate * dt)));
const fb = this.world.players.fireboy, wg = this.world.players.watergirl;
const kDoor = (this.world as any).doors;   // K5：内核门进度（可缺省）
door.fbAtDoor = fb.atDoor; door.wgAtDoor = wg.atDoor;
door.fbFrame = kDoor?.fireboy?.frame ?? drive(door.fbFrame, fb.atDoor);
door.wgFrame = kDoor?.watergirl?.frame ?? drive(door.wgFrame, wg.atDoor);
door.fbUp = kDoor?.fireboy?.up ?? door.fbFrame >= DOOR.frames;
door.wgUp = kDoor?.watergirl?.up ?? door.wgFrame >= DOOR.frames;

// 玩家 liquid 标记（水声）
ps.inLiquid = (sim as any).inLiquid === true;   // 加进上面 players 循环内
```

文件头 import 追加 `DOOR`（`@fw/shared`）与新 Schema 类。

- **音效差分兜底（K6 缺事件时）**：在 syncState 里对 `lever.state`、`pusher.state`、平台 `target`/位移方向做 prev 快照差分，变化即 `this.broadcast("sfx", { name: "lever" | "pusher" | "platform" })`。与 handleEvents 的事件通道二选一，勿双发（建议：内核有事件用事件，没有用差分）。

---

## 6. server E14 —— `src/levels.ts` + `src/index.ts` 增 `GET /api/level/:id`

### 6.1 `levels.ts`（锚点 L16/L26）

新增目录探测助手（`loadLevel` 复用它，行为不变）：

```ts
export function findLevelFile(id: string): { dir: string; file: string } | null {
  if (!/^[a-z0-9_]{1,64}$/.test(id)) return null;
  for (const dir of LEVEL_DIRS) {
    const file = join(ROOT, dir, `${id}.json`);
    if (existsSync(file)) return { dir, file };   // import { existsSync } from "node:fs"
  }
  return null;
}
```

### 6.2 `index.ts`（插入点：L26 静态托管之后、L31 音频路由之前）

```ts
// 关卡获取统一入口（修 E14：客户端不再直 fetch 具体目录，两端以 LEVEL_DIRS 为唯一事实）
app.get("/api/level/:id", (req, res) => {
  const hit = findLevelFile(String(req.params.id ?? ""));
  if (!hit) { res.status(404).json({ error: `关卡不存在: ${req.params.id}` }); return; }
  try {
    const json = JSON.parse(readFileSync(hit.file, "utf8"));
    // base = 该关所在目录的 URL 形式，客户端用它解析 tileset 相对引用
    res.json({ id: req.params.id, base: `/${hit.dir}/`, json });
  } catch (e) {
    res.status(500).json({ error: `关卡解析失败: ${String(e)}` });
  }
});
```

（`readFileSync` 需在 index.ts 顶部 import；或改为在 levels.ts 暴露 `readLevelJson(id)`，二选一，倾向后者保持 index.ts 瘦。）

---

## 7. client `src/net.ts` —— 新消息接入点

1. **`NetCallbacks`（L19-25）**：

```ts
export interface FinishData {
  got: number; total: number;        // 红蓝合并（不含银钻）收集数/总数
  red: number; blue: number; silver: number;
  timeMs: number; timeLimitSec: number | null;
  stars: 1 | 2 | 3;                  // 服务器按原版公式算好（见 §5.3 finish 消息；客户端也可自算，二选一，本文采服务器算）
}
onFinish: (p: FinishData) => void;
onSfx?: (p: { name: string }) => void;
onPhase?: (phase: string, prev: string) => void;
// 删除 onWin（win 消息废止）
```

2. **消息注册（锚点 L56-57）**：删除 `onMessage("win", ...)`；追加：

```ts
net.room.onMessage("finish", (p: FinishData) => cb.onFinish(p));
net.room.onMessage("sfx", (p: { name: string }) => cb.onSfx?.(p));
net.room.onMessage("levelError", (p: { message: string }) => cb.onLevelError?.(p.message));
// phase 迁移：onStateChange 差分（比 250ms 轮询及时，且带 prev）
let prevPhase = "";
net.room.onStateChange((state) => {
  if (state.phase !== prevPhase) { const p = prevPhase; prevPhase = state.phase; cb.onPhase?.(state.phase, p); }
});
```

（`levelError` 为保留通道：当前 create 校验走 MatchMakeError，join 后若未来出现服务端关卡异常再启用；接入成本一行，先注册。）

3. **输入（L76-78）**：`sendInput` 不变（seq 由 input.ts 塞进 InputState）。
4. **JoinParams（L11-17）**：`levelId` 注释更新为"仅 create 生效；join 以房间 state.levelId 为准"。

---

## 8. client `src/main.ts` —— E14 URL 选关 + E15/E1 状态文案 + R 键

1. **L18**：`const LEVEL_ID = "forest_01"` → 删除硬编码用法，改为：

```ts
const DEFAULT_LEVEL_ID = "forest_01";
const urlLevel = new URLSearchParams(location.search).get("level"); // 冻结需求 #12
```

2. **`fetchLevel()`（L27-48）改走 API**（废除 tutorials 直取）：

```ts
async function fetchLevel(id: string): Promise<LevelData> {
  const res = await fetch(`/api/level/${encodeURIComponent(id)}`);
  if (!res.ok) {
    let msg = `关卡下载失败 (${res.status})`;
    try { msg = (await res.json()).error ?? msg; } catch { /* keep */ }
    throw new Error(msg);
  }
  const { base, json } = await res.json();
  // tileset 预取逻辑 L33-47 原样保留，仅 base 由参数传入（原 L34 的硬编码 base 删除）
}
```

3. **`start()`（L110-150）**：L119 `levelId: LEVEL_ID` → `levelId: urlLevel ?? DEFAULT_LEVEL_ID`（join 模式也传，服务端 join 不读它，无害）。
4. **`enterGame()`（L82-108）**：L83 `fetchLevel(LEVEL_ID)` →

```ts
const levelId = (net!.room.state.levelId as string) || urlLevel || DEFAULT_LEVEL_ID;
level = await fetchLevel(levelId);   // join 方从此拿到房间的真实关卡（修 E14 双端路径分裂的最后一环）
```

失败路径：`enterGame` 抛错 → `start()` catch 已 show 到菜单；追加 `net?.leave()` 后返回菜单。
5. **`updateHud()`（L65-80）**：状态映射替换为新 phase 词汇：

```ts
const text = {
  lobby: "等待另一位玩家加入…", ready: "双人就绪，即将开始…", started: "",
  paused: "对方断线，等待重连…", won: "通关！", gameover: "有人化烟了！即将重开（R 立即重开）",
}[phase] ?? "";
```

L79：`keyboard?.setPaused(phase !== "started")`。
6. **`onDeath`（L127-132）**：保留 toast；文案加"整关即将重开"。
7. **R 键（E1）**：`bindUi()` 追加全局键：

```ts
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyR") net?.restart();   // 服务端按 phase 把关（started/won/gameover）
});
```

同时**删除 L155-158 `#btn-restart` 绑定与 index.html 的 `#win-panel` 死 DOM**（§12）。
8. **`onRole` 文案（L122）**：方向键/WASD 的说法与实现不符（E16 双键组通吃），改为 `"你扮演：火人"` / `"你扮演：水女孩"`。

---

## 9. client `src/input.ts` —— seq + ≥15Hz 重发（PLAN §5.2）

锚点：L13 `last`、L16-33 构造器、L46-57 `emit`。

```ts
private seq = 0;
private resendTimer: number | null = null;

constructor(target: Window, private onInput: (input: InputState) => void) {
  // ...现有键盘监听保留...
  // PLAN §5.2：变化即发之外，≥15Hz 重发最后状态（防丢包）；seq 单调递增
  this.resendTimer = window.setInterval(() => this.emit(true), 66);
}

private emit(force = false): void {
  if (this.paused) return;
  const next: InputState = { /* 同 L48-52 */ };
  if (!force && sameInput(next, this.last)) return;
  this.last = next;
  this.onInput({ ...next, seq: ++this.seq });
}
```

- server 侧（ForestRoom L48-57）：追加乱序/重放保护——`private lastSeq = new Map<Role, number>()`，`if (typeof data?.seq === "number" && data.seq <= (this.lastSeq.get(role) ?? 0)) return;` 再写 `world.inputs`。
- `setPaused(true)` 时同时挂起重发（现实现已清键并 emit 一帧空输入，保持；重发计时器继续跑但 emit 被 paused 挡住，无需额外处理）。

**E16 记录（冻结偏离，不改代码）**：两组键（方向键/WASD）在任一客户端都控制本机角色，不按角色分键。原版按角色分键是同屏单机逻辑，联机每机单角色，偏离合理；`index.html` 文案同步修正（§12）。
> **〔已翻转 2026-10-11，F1〕**：本条偏离已按原版语义翻转——`input.ts` 按角色分键（fb=↑←→、wg=W/A/D，bundle @1856520/@1856587），触屏键经取证（@1850480-1856662）本就绑定本机角色，维持通用。见 `deviation-flip-plan.md` 待核实 h 结案记录。

---

## 10. client `src/scenes/BootScene.ts` —— 素材与动画接线

1. **音频表（L41-53）追加**（文件均在 `assets/audio/`，经无扩展名路由）：

```ts
["sfx_water_steps", "WaterSteps.mp3"],   // 液面行走循环（M10）
["sfx_platform", "Platform.mp3"],        // 移动平台电机（M10）
["sfx_pusher", "Pusher.mp3"],            // 踏板压下（M10）
// 可选（本轮不强制）：EndDiamond / EndFail / LevelMusicOver（死亡/结算附加音）
```

2. **water falling 帧域修正（E19，L77）**：`0, role === "fire" ? 4 : 10` → **双角色一律 `0, 4`**。字证（本轮字节复核 `init.js@1861937`）：`animations.add("falling", generateFrameNames(o+"_head_falling", 0, 4, "", 4), 30, !0)` —— falling 对两角色都只取 0..4；water 图集虽有 11 帧表（`water_head_falling`×11），原版注册子区间仍是 0..4。02-E19 的"取子区间"即此，已核实，无需再查。
3. **新增 rising 注册（E19，插在 L77 后）**：

```ts
seq(`${role}_rising`, ATLAS_CHARS, `${role}_head_rising`, 0, 4, 30, -1);
```

字证：`init.js@1862115`（0..4、30fps、循环）；water 图集 `water_head_rising`×11 同样只注册 0..4。
4. **stairs（L78-79）保留**（0..29@25fps one-shot），本批在 GameScene 首次真正播放（M9）。
5. **门动画（L92-94 `door_fb_open/door_wg_open`）删除**：E10 改为按快照帧号逐帧 `setFrame`，动画键不再使用（避免与帧驱动打架）。

---

## 11. client `src/scenes/GameScene.ts` —— 消费端大改造

> import 追加：`DOOR`（`@fw/shared` params，frameRate/frames/finishDelayMs 全有，L85-93）、`FinishData` 类型由 net.ts 转出。

### 11.1 字段与生命周期

- 新视图表（替换 L71 `boxView` 单数）：

```ts
private leverViews = new Map<string, { stick: Image; light: Image }>();
private pusherViews = new Map<string, { block: Image; baseY: number }>();
private bodyViews = new Map<string, Image>();      // boxes + balls 共用（key 不冲突：m 编号唯一）
private stairsSprites = new Map<Role, Phaser.GameObjects.Sprite>();
private finishData: FinishData | null = null;
private stairsPlayed = false;
```

- `init()`（L86-99）：清空上述新表；`finishData = null; stairsPlayed = false;`。

### 11.2 create()（锚点 L101-131）

- **L126 删除 `this.buildDust(level)` 调用；L452-473 删除 `buildDust` 方法**（G13：森林 48 关 beamer=0，原版从不出现 BeamDust/Dust——03 报告 §5 字证）。
- 在原 buildDust 位置改调 `this.buildNavies(level)`（配方见 11.8）。
- L129-130 BGM 保持（won 时停）。

### 11.3 buildMechs()（锚点 L262-302）—— E13 视图化

- **lever 分支（L279-283）**：key 用 `m.id`（§3.2 前置）。杆角度按快照初值（`st.levers.get(m.id)?.state ?? -1`）摆 `angle = 31 * state`（0.2π=36° 限位，现有 31° 目测值保留）；新增**亮灯层**：MechAssets 有 `lever_base_light_on/off`、`lever_stick_light_on/off×4`（03 报告 §1 unused 清单），叠加 `lever_base_light_${state===1?"on":"off"}` 于 base 之上、tint 组色（现 L277 的 tint 逻辑迁移到灯层）。`leverViews.set(m.id, {stick, light})`。
- **pusher 分支（L271-278）**：底图+灯层保留，`pusherViews.set(m.id, { block, baseY: c.y })`；灯帧同理换 `light_on/off`（如仅有一帧则用 tint/alpha 表达压下，照 MechAssets 实际帧名微调）。
- **box 分支（L284-286）**：`bodyViews.set(m.id, img)`；gid13（boxheavy）、gid10（ball，帧名 `ball0000`）同法建视图（内核给 balls/boxes 全集后贴图自然全量）。
- **gid 白名单注释（L269-270）更新**：`0=pusher、1/2=lever、4=box、10=ball、13=boxheavy`（与 Objects.json tiles.type 语义一致，终结 03 报告 §7.3 的两套互斥注释）。
- 平台段（L289-301）不变（platforms 快照已有）。

### 11.4 buildDoors()（锚点 L336-348）

保留静帧 0000 创建；`doorOpen` Map 删除，改为记录 `frame`：

```ts
private doorFrames = new Map<Role, number>();
```

### 11.5 update()（锚点 L514-634）

**(a) phase 词汇**：L622 `st.phase === "finished"` → `"won"`；时钟守卫 L520 `if (!this.finished)` → `if (st.phase === "started" || st.phase === "ready")`（gameover/won 时 timerMs 已冻结，自然停摆）。

**(b) 视图瞬移（E15/E1）**：`onPhase("ready")`（经 net.onPhase 转发进场景，或 update 里检测 phase 变化）时，对每角色 `view.cx = tx; view.cy = ty` 直接贴位（跨图平滑会把角色从门口滑回出生点）。

**(c) 动画 switch（L559-581）**：新增分支

```ts
case "rising":
  view.legs.play(`${p}_legs_idle`);
  view.head.play(`${role}_rising`);
  break;
```

（原版 rising 还带头部倾角 `init.js@1874150-1874220`，属可选打磨，本轮不做，记录。）

**(d) 门逐帧扫（E10，替换 L583-592）**：

```ts
const wantAt = role === "fireboy" ? st.doors?.get?.("pair")?.fbAtDoor : st.doors?.get?.("pair")?.wgAtDoor;
const frame = (role === "fireboy" ? st.doors?.get?.("pair")?.fbFrame : st.doors?.get?.("pair")?.wgFrame) ?? 0;
const prev = this.doorFrames.get(role) ?? 0;
if (frame !== prev) {
  const spr = this.doorSprites.get(role)!;
  spr.setFrame(`${role === "fireboy" ? "FinishBoy" : "FinishGirl"}${String(frame).padStart(4, "0")}`);
  if (prev === 0 && frame > 0) this.sfx("sfx_door", { volume: 0.45 });  // 原版开门即播（@1681104 区段 sound.playInstance）
}
this.doorFrames.set(role, frame);
```

（快照 20Hz 采到 25fps 帧号会有 1-2 帧跳变，原版观感可接受；如需丝滑可在客户端按 `DOOR.frameRate` 本地插帧，标记为可选。）

**(e) 水声（M10）**：player 循环内

```ts
if (role === this.myRole) {
  const moving = input 左右键本机按下;   // 从 keyboard 状态取，或用 ps.anim === "run"
  const want = ps.inLiquid === true && moving;
  if (want && !this.waterPlaying) { this.waterPlaying = true; this.sfx("sfx_water_steps", { loop: true, volume: 0.5 }); }
  else if (!want && this.waterPlaying) { this.waterPlaying = false; this.sound.stopByKey("sfx_water_steps"); }
}
```

原版条件=按住左右且 isOnLiquid、loop、volume 0.5（字证 `init.js@1868200` 区段，本轮复核）。

**(f) 机关快照消费（E13，加在平台/箱跟随段 L607-619 附近）**：

```ts
st.levers?.forEach?.((s: { state: number }, id: string) => {
  const v = this.leverViews.get(id);
  if (!v || v.state === s.state) return;
  v.state = s.state;
  v.stick.setAngle(31 * s.state);
  v.light.setFrame(`lever_base_light_${s.state === 1 ? "on" : "off"}`);
});
st.pushers?.forEach?.((s: { state: number }, id: string) => {
  const v = this.pusherViews.get(id);
  if (!v || v.state === s.state) return;
  v.state = s.state;
  // 压下位移：快照只有 0|1，取 PUSHER.trigger=0.2m≈6px 的两档位（原版行程 0.7m 连续，二档化记录为简化）
  v.block.y = v.baseY + (s.state === 1 ? 6 : 0);
});
st.boxes?.forEach?.((b: { x: number; y: number; angle: number }, id: string) => {
  const v = this.bodyViews.get(id);
  if (v) { /* 左上角→中心换算同 L617；v.setAngle(-b.angle * 180 / Math.PI)（屏幕系 y 翻转取负） */ }
});
st.balls?.forEach?.(/* 同上，球必转，angle 必须吃 */);
```

（`leverViews`/`pusherViews` 需在视图对象上存 `state` 初值。）

**(g) 钻石复位（E1，L596-603）**：`if (ds.collected && img.visible)` → 双向：

```ts
img.setVisible(!!ds.collected === false);   // collected=false 时重新可见（整关重开复位）
if (ds.collected && !wasVisible) this.sfx("sfx_diamond", { volume: 0.5 });
```

**(h) HUD 计数（E17，L604-605 + L732-742）**：`countCollected` 删除 `|| def.kind === "fbwg"` 双计——红栏只数 `kind==="red"`、蓝栏只数 `kind==="blue"`（银钻/fbwg 不进红蓝栏）；buildHud 里若 `level.diamonds.some(d => d.kind === "silver")` 则加第三枚银钻计数器（x≈266，帧 `diamond_silver0000`，单独统计）。

**(i) 通关演出（E10/M9，替换 L621-633）**：

```ts
if (st.phase === "won" && !this.stairsPlayed) {
  this.stairsPlayed = true;
  this.sound.stopByKey("bgm_level");
  this.sfx("bgm_finish", { volume: 0.4 });            // 原版 animateFinish：停 BGM→levelMusicFinish（@1950841 区段）
  for (const role of ROLES) {
    const view = this.views.get(role)!;
    view.legs.visible = view.head.visible = view.glow.visible = false;   // 原版 animateStairs 隐 head/legs
    const door = this.d.level.doors[role];
    const s = this.add.sprite(door.x + door.w / 2 + PAD, door.y + door.h + 4 + PAD, ATLAS_CHARS, `${role === "fireboy" ? "fire" : "water"}_stairs0000`)
      .setOrigin(0.5, 1).setScale(PLAYER_SCALE).setDepth(5);              // 原版 anchor(0.5,1)、teleport 到门口
    this.tweens.add({ targets: s, scale: 0.8, duration: 360 });          // 原版 0.95→0.8/360ms（@1874740 区段字证）
    s.play(`${role}_stairs`);
    this.stairsSprites.set(role, s);
  }
  this.time.delayedCall(DOOR.finishDelayMs, () => this.finishData && this.showFinishBoard(this.finishData)); // 1600ms
}
```

### 11.6 showFinishBoard(data: FinishData)（锚点 L636-703）

- 三行按任务书冻结规格（原版行构成字证：FinishIcon/DiamondsIcon/TimeIcon，`init.js@1918500` 区段；银钻行仅 puzzle 型，联机版按冻结要求**有银钻就单列一行**）：
  1. `FinishIcon0000`，✓（原版恒 ✓，`g.setAchieved(!0)` @1921420）；
  2. `DiamondsIcon0000`，文本 `${data.got}/${data.total}`，ok = `data.got >= data.total`（原版 `g.setAchieved(h >= i)` @1921400，total 不含银钻 @1948500 字证 02-E17）；
  3. （有银钻时）`SilverIcon0000` 行，文本 `${data.silver}/1`（PopupAssets `SilverIcon0000` 单帧）；
  4. `TimeIcon0000`，文本 MM:SS，ok = `data.timeLimitSec == null || data.timeMs/1000 <= data.timeLimitSec`（原版 `m.setAchieved(n <= o)` @1921460；limit 来自 temple.json 的 time 字段）。
- 星级（L680 替换）：原版公式 `d=1; 钻石全收 d++; 限时内 d++`（字证 `init.js@2205243`：`(d=1), b>=c && d++, e<=f && d++`；puzzle/dark 变体不在森林范围）→ `const stars = 1 + (got>=total ? 1 : 0) + (limit!=null && time<=limit ? 1 : 0)`。服务器算好放 `finishData.stars`（§7）也行，客户端算也行——**采服务器算**，客户端直接用，避免两端公式漂移。
- 继续按钮 → `restartLevel()`（L726-729 现逻辑保留：net.restart + scene.restart）。
- `collectedAll()/countGot()`（L705-717）删除（数据全由 finishData 提供）。

### 11.7 buildTutorial()（锚点 L435-449）—— E20 渐显

```ts
private tutorialGroups: { text: Phaser.GameObjects.Text; rects: Rect[]; shown: boolean }[] = [];

private buildTutorial(level: LevelData): void {
  for (const g of level.tutorials) {           // TutorialGroup[]（§3.2 新结构）
    for (const t of g.texts) {
      const obj = this.add.text(t.x + PAD, t.y + PAD, t.text, { /* 样式同现 L438-445；原版为 font 字号 18 位图字，系统衬线为既有替代 */ })
        .setOrigin(0, 0).setDepth(0.8).setVisible(false).setAlpha(0);
      this.tutorialGroups.push({ text: obj, rects: g.rects, shown: false });
    }
  }
}

// update() 末尾（原版 updateTutorial @1952970 区段字证：rect.contains(pers1/pers2) → shown 淡入 400ms Linear）
private updateTutorial(myFeet: { x: number; y: number }): void {
  for (const g of this.tutorialGroups) {
    const inside = g.rects.some((r) => myFeet.x >= r.x && myFeet.x <= r.x + r.w && myFeet.y >= r.y && myFeet.y <= r.y + r.h);
    if (inside && !g.shown) {
      g.shown = true; g.text.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: g.text, alpha: 1, duration: 400 });
    } else if (!inside && g.shown) {
      g.shown = false;
      this.tweens.add({ targets: g.text, alpha: 0, duration: 400, onComplete: () => g.text.setVisible(false) });
    }
  }
}
```

调用：update() 里用**本机角色**快照坐标（`ps.x+13+PAD, ps.y+56+PAD`，与视图换算同式）调用。**偏离记录**：原版判定"任一角色进矩形"（pers1||pers2，字证 @1952970），冻结任务书要求"按本机角色"——两者在联机下各有道理，按任务书执行；若要回归原版行为，把 `myFeet` 换成双角色坐标数组即可（结构已支持）。

### 11.8 buildNavies()（替换 buildDust，G13→原版 Navies）

字证（本轮字节复核）：
- 触发：`useDust` 默认开（fps<40 才关，`init.js@1930471/@1942749`；我们 60fps 恒开）；
- 采样 `getNaviesPoints`（`init.js@1836320` 区段）：4 个种子点（单位=格）：`(⌊rows/4⌋,⌊rows/4⌋)、(⌊3·rows/4⌋,⌊rows/4⌋)、(⌊rows/4⌋,⌊3·rows/4⌋)、(⌊3·rows/4⌋,⌊rows/4⌋)`——**第 4 点与第 2 点重复是原版代码原样**（`{x:3d/4, y:d/4}` 出现两次，疑为笔误但为保真按原样复刻，记录）；从种子点出发按 `±1,±1` 对角步进（方向取 `Math.random` 符号），走到第一格 `properties.type` 为空（即 `groundTypes === EMPTY_TYPE(-99)`）的空点记为 valid；点坐标 ×32px；
- 每个 valid 点建一组 `Navies`（`init.js@1116900` 区段）：精灵数 = `Math.floor(1 + 3 * Math.random())` + 1（原版循环 `h<=f` 含端点，实为 f+1 个，即 2..4 个/组）；每个精灵 MenuAssets `Navy0000`、anchor 0.5、scale `0.3 + 0.7·rand`；组级漂移参数 `offsetCart{±100,±25}`、`offset.r=400·rand`、`speed.r=7e-4+5e-4·rand`、`speed.theta=3e-4+5e-4·(rand-0.5)`、`pos.r=rand`、`pos.theta=rand·2π`；每帧 `pos.r=offset.r·sin(rprime); rprime+=speed.r; pos.theta+=speed.theta; x=offsetCart.x+pos.r·cos(pos.theta); y=offsetCart.y+pos.r·sin(pos.theta)`；
- 层级：原版挂 overGround（拉杆层）→ 我们取 depth 3.5。

> **注意**：任务书写的"×round(3r+3.5)"实为该区段定义的步进助手 `z()`（`m = () => Math.round(3*rng+3.5)`），字节证据显示它**未参与** Navies 采样/数量（数量=floor(1+3·rand)+1）；`decorate`（前景装饰）才用同款 z() 步进。本文按字节证据执行；如需与任务书字面一致再议。
> 另：buildDecorations（L374-432）现用 `mulberry32(0x5eedfa)` + 纯随机 O 变体（G12），原版为 `seedrandom("ASDFA")` + `w%2+1` 奇偶——**不在本批范围**（需引入 seedrandom 依赖，留 0.3.1），仅在此登记。

### 11.9 buildHud()（锚点 L475-508）

- L481 时钟初始文本 `"02:00"` → `"00:00"`（G14：原版只显示真实经过秒，无占位）。
- 银钻计数器（见 11.8(h)）。

---

## 12. client `index.html`

1. `.hint`（≈L150-153）键位文案改为与实现一致：`"每台电脑：方向键或 WASD 均可控制本机角色（双人各用一台电脑）。"`，并补一行 `"创建房间时可在 URL 加 ?level=forest_02 选择关卡（默认 forest_01）。"`
2. 删除 `#win-panel` 区块（≈L157-166，从未被显示的死 DOM）及对应 main.ts 绑定（§8.7）。

---

## 13. 冻结的有意偏离（记录，不施工）

| # | 偏离 | 依据 |
|---|---|---|
| 1 | ~~输入双键组通吃，不按角色分键（E16）~~ **已翻转（2026-10-11 F1）：按角色分键 fb=↑←→ / wg=W/A/D** | 冻结任务书 §8：联机每机单角色，可接受，记录即可 |
| 2 | ~~相机固定全景，不做原版双人包围盒动态变焦（M11/CameraManager）~~ **已翻转（2026-10-11 F4）：CameraManager 动态缩放移植** | 冻结任务书 §9 |
| 3 | ~~死亡后 2.5s 自动整关重开 + R 键手动重开~~ **已翻转（2026-10-11 F2）：gameover 静置等 Retry（R 键保留为 restart 快捷映射）** | 原版为单机页面导航；联机以最少交互达成同一惩罚语义 |
| 4 | 教学渐显判定用本机角色（原版=任一角色进矩形） | 冻结任务书 §6（结构上留了双角色扩展位，见 §11.7） |
| 5 | pusher 贴图压下为二档（快照只有 0\|1），原版为 0.7m 连续行程 | 快照带宽权衡；内核若给连续 offset 字段可升级 |
| 6 | 时钟/结算/教学用系统衬线文本，非原版中文位图字体 font.fnt（M11 素材链） | 本批不做字体管线，既有替代 |
| 7 | `animFrame` 不进快照、rising 头部倾角不渲染 | 客户端本地播帧已够；带宽与工作量权衡 |

---

## 14. 施工顺序建议（并行关系与依赖）

```
批次 P0（前置，随内核线合入）
  shared/types.ts（Anim+WorldEvent+InputState.seq）      ── 一切消息/schema 的类型前提
  shared/level.ts（mechProps.id + TutorialGroup 结构）    ── E13 key 与 E20 数据前提

批次 S1（server，依赖 P0 的类型 + 内核字段就位程度）
  state.ts schema 扩容（§4）          ← 可最先动（纯增量，旧内核下编译仍绿：新字段空转）
  ForestRoom E14 校验 / E15 倒计时 / E1 重开（§5.1-5.4）   ← 依赖 state.ts 新 phase 词汇
  ForestRoom E13 syncState 回写（§5.5）                    ← 依赖内核 K1-K5 字段（可先写映射点+兜底分支）
  levels.ts findLevelFile + index.ts /api/level（§6）      ← 完全独立，可并行

批次 C1（client，与 S1 并行度高的部分）
  BootScene 素材批次（§10）            ← 零依赖，立即可做
  input.ts seq+15Hz（§9）              ← 零依赖（server 端 lastSeq 小改随 S1）
  net.ts 消息面（§7）                  ← 依赖 §5.3/§5.5 的消息名定稿（finish/sfx/levelError）
  main.ts（§8）                        ← 依赖 §6 API + §7 回调面
  index.html（§12）                    ← 随时可做

批次 C2（client 大头，依赖 S1 schema 定稿）
  GameScene 全部（§11）               ← E13 消费/E10 门与演出/E17/E20/Navies/水声，一次成批次改

回归门（冻结 #10）
  server 接新内核后 / client 接线后 / 发版前：双浏览器自动通关 forest_01（数值+截图抽查）
```

关键路径：`P0 → S1(state+ForestRoom) → C2(GameScene)`。`S1 的 /api/level`、`C1 的 BootScene/input/index.html` 是旁路，随时可插。E15 倒计时的 2000ms 与 E1 的 2500ms 用 `setTimeout` 时注意房间生命周期（推荐 Colyseus `this.clock.setTimeout`，房间销毁自动清理）。

---

## 附：本轮补充字证索引（参考库只读复核，字节偏移可复验）

| 事实 | 位置（`output/A/js/init.eb02fbdab2aa1d24.js`） |
|---|---|
| falling 双角色帧域 0..4 | @1861937 `generateFrameNames(o+"_head_falling", 0, 4, "", 4)` |
| rising 注册 0..4@30fps 循环 | @1862115 |
| rising/falling 判定（u.y>3 / u.y<-3）与头部倾角 | @1874772 / @1874150-1874220 |
| Navies 采样（4 象限种子、±1 对角步进、空格 valid、第 4 点重复） | @1836320 区段 `getNaviesPoints` |
| Navies 精灵组（f+1 个、Navy0000、scale/极坐标参数、overGround 层） | @1116900 区段 `States/Common/Navies` + @1940080 区段 spawn |
| 门：传感器 64×8、逐帧 25fps 扫至 21 isUp、反向关门、开门即播音 | @1681104 区段 `Devices/Door` |
| animateStairs（隐 head/legs、stairs 0..30@25fps、anchor(0.5,1)、0.95→0.8/360ms、body 传送门口） | @1874740 区段 |
| animateFinish（停 BGM→levelMusicFinish→双 stairs→1600ms→gameFinish） | @1950841 引述 + @1943600 区段 |
| gameFinish 结算数据（钻石合并、银钻合计、elapsedSeconds） | @1943700 区段 |
| EndMenu 行构成与 ✓/✗（恒✓ / got>=total / time<=limit）与星级公式 | @1918500、@1921390-1921500、@2205243 |
| 开局延时（1600+400ms 后 clock.start+解冻物理） | @1943760 区段 `startLevel` |
| waterSteps 触发（左右键+isOnLiquid，loop，volume 0.5） | @1868200 区段 |
| setupTutorial 分组（properties.id → texts/rects，初始 invisible）与 updateTutorial（contains→400ms 淡入） | @1952600、@1952970 区段 |
