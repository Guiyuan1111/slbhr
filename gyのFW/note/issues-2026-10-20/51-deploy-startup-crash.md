# #51 事故复盘：1.0.0 分发包「能起服、不能开局」

> 日期：2026-10-28 ｜ 影响版本：1.0.0（唯一分发包）｜ 修复版本：1.0.1 ｜ issue：#51
> 关联：#45（CSP 禁 eval）、0.3.56 seedrandom P0、0.3.58 TimedPusher 派发

## 一、现象

云端服务器按 DEPLOY.md §5 六步验收**全绿**（含第 ⑥ 步 colyseus.js 建房），玩家实际建房后：

1. 房码/密码校验正常显示（顶部黄框）；
2. 随即**永久停在 `loading` 界面**；
3. 服务端日志 10 秒左右出现：
   ```
   [fw] uncaughtException: TypeError: Cannot read properties of undefined (reading 'Symbol(Symbol.metadata)')
       at encodeValue (@colyseus/schema/src/encoder/EncodeOperation.ts:37:20)
       at SchemaSerializer.applyPatches …
       at ForestRoom.broadcastPatch (@colyseus/core/build/Room.js:463:41)
   ```
4. 单房间异常带崩整进程 → systemd 重启 → 房间全清 → 玩家永久卡 loading。

## 二、根因

### 2.1 直接原因：编译链丢了 `useDefineForClassFields: false`

Colyseus 的变更追踪不是靠原型上的 setter，而是 `Schema.initialize` 在**实例上**
`Object.defineProperties(instance, metadata[$descriptors])` 装访问器。所以状态类的
字段一旦以**数据属性**形式先落地，`this.x = 0` 就绕过访问器，变更不进 ChangeTree，
首次 delta 编码读不到类型元数据 → `encodeValue` 崩。

而 1.0.0 分发包发的是 TS 源码 + 让目标机 `node --import tsx packages/server/src/index.ts`
跑。实测（本地复现，见 §四）：

- **包内缺 tsconfig**（`package-deploy.mjs` 复制清单漏项）；
- **即便补上 tsconfig 也无效**：tsx 4.23.15 的 `useDefineForClassFields` 归一化只存在于
  CJS require 钩子，`node --import tsx` 走的 **ESM loader 完全不读**该字段。

于是 esbuild 按 ES2022 默认 define 语义把 `x!: number` 编成原生 class field `x;`，
在 `super()` 之后以数据属性落位，覆盖 schema 访问器。

### 2.2 为什么六步验收全绿

第 ⑥ 步只 `create → leave(true)`——**房间状态从未广播过一次增量**。lobby 相位下单人
房间没有状态变化，`broadcastPatch` 不产出编码工作，崩溃路径完全没被触及。这是典型的
「验收只验了能起服，没验能不能开局」。

### 2.3 叠加因素：分发线停在 0.3.55 基点

`release/1.0-forest` 从 0.3.55 分出后未再跟进 main，而 main 在同期落了 26 个提交，
其中两个直接作用于同一链路：

- **0.3.56（91394f2）**：CSP（#45）禁 eval 后 seedrandom 仍用 `new Function` 加载 →
  浏览器建房进 Game 必炸、场景永停 CREATING。**这是「卡 loading」的另一半原因**——
  即使服务端不崩，客户端也进不去 Game。
- **0.3.58（82300bf）**：TimedPusher 组派发保真（ice_02 闸门）。

1.0.1 已合并 main 全部内容（见 §五）。

## 三、修复

### 3.1 语言层：字段改 `declare`（根治）

`state.ts` 全部 64 个字段由 `x!: number` 改为 `declare x: number`。`declare` 是纯类型
标注，**任何转译器都不产出运行时字段**，因此不论 tsconfig 是否随包、tsx 走哪条 loader，
schema 访问器都不会被覆盖。

单测 `schemaFieldErasure.test.ts` 钉死：用**最坏环境 tsconfig**
（`useDefineForClassFields: true`，正是 tsx 缺 tsconfig 时的实际行为）单独 bundle
`state.ts`，断言产物无裸 class field、实例字段仍是访问器。把 `declare` 改回 `x!: T`
时两条断言立即变红（已实测）。

### 3.2 运行层：预转译 JS，去掉 tsx 运行时依赖

`package-deploy.mjs` 改为构建期用 esbuild **逐文件转译**（`bundle: false`）：

- 目标机直跑 `node packages/server/src/index.js`，不需要 tsx、不需要任何构建工具；
- 逐文件而非打包，`import.meta.url` 的路径锚点（`ROOT` / `vendor/box2d.js` / `TEMP`）
  全部天然正确，不需要任何路径 hack，目录布局与源码期一致；
- `tsconfigRaw: { useDefineForClassFields: false }` 显式兜底；tsconfig.json 也随包
  （作为约定载体与「自行重建」说明）；
- 转译后删除包内 TS 源码，并在 CI 断言包里不含 `.ts` / `__tests__`。

### 3.3 启动层：schema 形态自检（fail-fast）

新增 `packages/server/src/schemaSelfCheck.ts`，在 `index.ts` 监听端口**之前**逐类逐字段
校验实例描述符必须是访问器且可读可写。形态不对立刻退出并打印成因——把「建房十秒后
崩、玩家卡 loading」提前到启动第一秒。启动日志首行即：

```
[fw] schema 自检通过（10 类字段访问器完好）
```

实测对坏产物报出 64 项。

### 3.4 验收层：第 ⑥ 步改真开局

DEPLOY.md §5 第 ⑥ 步由 `create→leave` 改为**双人进 started + 断言 patch 持续增长**
（预期 8 秒内 >100 次，实测 59.4/s）。

### 3.5 门禁层：deploy-smoke 三处复用

`scripts/e2e/deploy-smoke.mjs`：起服（自动识别预转译 `.js` / 源码 `.ts` 两种布局）→
双人建房进 started → 断言 patch 持续 → 服务端无 schema 编码崩溃 → 进程存活 →
浏览器建房进 Game 且 pageerror=0。

复用点：① `package-deploy.mjs` 打包后对**包本身**跑；② release-asset CI 解包到独立
tmp 目录后跑；③ ci.yml 新增 `deploy-smoke` 作业对源码树跑。

## 四、本地复现记录

包内无 tsconfig 环境的实测（`node --import tsx`，实测于本机 Node 22.22.1 / tsx 4.23.15
/ esbuild 0.28.2）：

```
# 修复前（x!: number）
own x: { get: undefined, writable: true }        ← 数据属性，访问器被覆盖
own names: [ '~changes', 'x', '_x', 'y', '_y', … ]

# 修复后（declare x: number）
own x: { get: 'function', writable: undefined }  ← 访问器完好
```

Schema 形态自检对坏产物的输出：

```
ok= false failures= 64 checked= 10
RoomState.phase: 描述符非访问器（get=undefined set=undefined）——class field 覆盖了 schema 访问器
…（共 64 项）
```

## 五、1.0.1 交付内容

- 合入 main 0.3.56–0.3.58 全部修复（CSP seedrandom P0 / TimedPusher 派发 / r13 地面
  缓存 LRU / r20 弱网量具 / #49 gameGuards），冲突仅分发剪裁差异（版本号、CI 的
  ice/light determinism 作业、README 版本行）；
- 加载条填充条锚点修正（见 §六）；
- 打包链重做 + 真开局冒烟 + 三项门禁；
- 版本 1.0.1，`bump-version --verify` 六处一致。

## 六、附带修复：加载条填充条错位

用户实机截图显示进度条填充色块甩在金色边框**左上外侧**。根因：oracle 的
`LoaderBar`（B bundle @52766）是 Phaser2 `Sprite`，anchor 缺省 `(0,0)`；我方 Phaser3
`Image` 缺省中心锚 `(0.5,0.5)`，而 `setCrop` 恒定自贴图左上角起裁 → 填充条整体左移
100px（半宽）、上移 10px（半高）。修法：`setOrigin(0, 0)`。真浏览器节流抓帧复核，
填充条已正确居框内自左生长。

## 七、教训

1. **「能起服」不是验收终点**。任何带状态广播的服务，验收必须触及增量编码路径。
2. **编译链假设要显式钉死**。源码正确 ≠ 产物正确；`declare` 这类「不产运行时」
   的写法比依赖 tsconfig 开关更可靠。
3. **长生命周期分支要定期合入**。分发线停在 0.3.55 导致 1.0.0 带着两个已修 P0 出厂。
4. **门禁要跑在产物上**。CI 跑源码绿，不代表解包后的产物能跑——release-asset 现在
   解包到独立 tmp 目录复验并跑真开局冒烟，全在 upload 之前。
