# Skill Blueprint: 多人补丁稳定器

> 自动生成自 codebase-analyzer
> 分析时间：2026-09-30_113536
> 源模块路径：`Fireboy-and-Watergirl/multiplayer.js`（220 行，PeerJS 1.5.1）与 `output/multiplayer.js`（约 170 行，@poki/netlib，孤儿文件）

---

## 1. 基本信息

| 字段 | 值 |
|------|-----|
| **推荐 Skill 名称** | `fawg-multiplayer-stabilizer` |
| **用途** | 修复注入路径 404、分析并合并双实现、消除时序缺陷，恢复线上双人功能（含人工验证关卡） |
| **AI 替代等级** | 🧑‍💻 AI 辅助（17/30，见 04 报告模块 7——全仓库安全风险最高模块） |
| **实施优先级** | 🥇 路径修复 Quick Win + 🥈 合并重构 Strategic |
| **源文件数** | 2 |
| **源代码行数** | ~390 |

## 2. 触发场景与关键词

- "多人模式没反应 / 房间码连不上"
- "multiplayer.js 404 怎么修"
- "两份 multiplayer.js 要留哪个"
- "键盘同步时灵时不灵"

**推荐 description 触发词：**

```yaml
description: >-
  Diagnose and stabilize the Fireboy-and-Watergirl multiplayer patch: fix
  injection path, diff the two implementations (root PeerJS vs output netlib),
  propose merge. Triggered by: "多人失效", "multiplayer", "房间码", "P2P".
```

## 3. 输入输出契约

### 双实现函数对照（AI 分析对象）

| 职责 | 根版（PeerJS） | netlib 版（output/） | 分叉差异 |
|------|---------------|---------------------|---------|
| 加载信令库 | `loadPeerJS()` `multiplayer.js:7`（unpkg CDN） | 模块内 init `output/multiplayer.js:14` | 栈不同：PeerJS 1.5.1 vs @poki/netlib |
| 建房 | `createRoom()` `:63` | `createRoom()` `:54` | 对称 |
| 入房 | `joinRoom(code)` `:102` | `joinRoom()` `:82` | 对称 |
| 输入采集 | `startHostSync()` `:135`（方向键）/ `startGuestSync()` `:161`（WASD） | `startGameSync()` `:108` | — |
| 发送 | `sendKeys()` `:154` | `sendKeys()` `:125` | — |
| 对端回放 | `simulateKeys(ko)` `:180-204`（合成 KeyboardEvent） | `simulateKeys()` `:132` | netlib 版主机侧不再模拟按键（不对称） |
| 键盘拦截守卫 | `:211-220` **解析期无条件安装（isHost 时序缺陷）** | `:157` isSyncing 门控（已修复） | 根版缺陷 |

### 已确认缺陷清单（修复验收标准）

| # | 缺陷 | 位置 | 修复方向 |
|---|------|------|---------|
| 1 | 注入路径 `/multiplayer.js` 在 Pages 子路径下 404 | `output/A/gameIndex.html:121` | 改相对路径 + 文件放对位置 |
| 2 | 守卫在解析期执行，isHost 尚为 false | `multiplayer.js:211` | 参照 netlib 版 isSyncing 门控 |
| 3 | netlib 版无任何页面引用（死代码） | `output/multiplayer.js` 全文件 | 合并后删除或接线 |
| 4 | P2P 断线无重连 | `multiplayer.js:89-91` | 人工决策是否引入 |

### 错误场景

| 场景 | 触发 | 现状行为 | 期望行为 |
|------|------|---------|---------|
| PeerJS 云信令不可用 | unpkg/信令服务器故障 | 静默无反馈 | UI 提示 + 重试按钮 |
| 房间码错误 | join 失败 | 控制台错误 | 界面提示 |
| 断线 | peer close | 仅 console（`:89-91`） | 提示 + 可选重连 |

## 4. 依赖清单

| 类型 | 名称 | 用途 | 接口 |
|------|------|------|------|
| 外部服务 | PeerJS 云信令（unpkg.com/peerjs@1.5.1） | 房间码 ↔ Peer ID 映射 | `multiplayer.js:9` |
| 外部服务 | @poki/netlib | 另一实现的传输层 | `output/multiplayer.js:14` |
| 宿主页面 | `output/A/gameIndex.html:121` | 补丁注入点 | script 标签 |
| 游戏输入系统 | Phaser 2 键盘输入 | 合成事件的实际消费者 | 经 `simulateKeys` 派发 KeyboardEvent |
| 键位白名单 | 方向键（`:137`）/ WASD（`:162`） | 采集过滤 | 常量 |

## 5. Skill 工作流设计

````markdown
## Workflow / Steps

### Step 1: 诊断
确认线上实际加载的是哪份实现（当前答案：都没有——404）；核对 script 注入点。

### Step 2: 快速修复（Quick Win 部分）
缺陷 #1：路径改相对 + 文件位置修正。产出单行 diff，人工批准。

### Step 3: 差异分析（Strategic 部分）
逐函数对照两版（见契约表），输出行为差异矩阵与合并建议
（建议：留 netlib 版为主体——它修复了 #2，且不依赖 unpkg 单点）。

### Step 4: 人工验证关卡（不可跳过）
双人真机测试矩阵：
- 主机方向键 ↔ 客机画面火人移动
- 客机 WASD ↔ 主机画面水女孩移动
- 本地键盘不被客机误吞（守卫行为）
- 断网恢复行为

### Step 5: 错误处理
验证失败回滚到修复前 commit；#4（重连）单独立项不强塞进本次。
````

### 建议的 Constraints

````markdown
## Constraints
- Always 先真机双人验证再合并——合成 KeyboardEvent 能否被 Phaser 2 消费无法静态保证
- Always 保持"游戏本体零改动"原则（补丁的既有边界，output/*/js/init.*.js 禁动）
- Never 同时保留两份可被加载的实现（现状的漂移根源）
- Never 在未验证情况下改动键位白名单（:137/:162 与游戏默认双人键位强耦合）
````

## 6. 所需工具权限

| 工具 | 用途 | 必需性 |
|------|------|--------|
| `Read` | 读两份 multiplayer.js 与注入点 | 必需 |
| `Edit` | 应用批准后的修复 diff | 必需 |
| `Bash` | git diff / 回滚操作 | 必需 |
| 浏览器 | 双人真机验证（人工执行） | 人工环节 |

**建议 allowed-tools：** `Read Edit Bash`

## 7. 使用示例

### ✅ Do This

```text
用户："多人怎么没反应"
输出：诊断：output/A/gameIndex.html:121 引用 /multiplayer.js → Pages 子路径下 404，
补丁从未加载。修复提案（1 行 diff）：src="multiplayer.js" + 将选定实现放到 output/A/。
→ 批准 → 应用 → 请求人工双人验证清单（4 项）。
```

### ❌ Not This

```text
用户："修一下多人"
错误输出：直接重写一份"更好的"netcode 并 push，跳过双人真机验证
（合成事件是否被引擎消费未证实，最坏结果游戏不可玩）。
```

## 8. 参考材料

- 源文件：`multiplayer.js` 全文、`output/multiplayer.js` 全文
- 时序缺陷分析：[01-architecture.md](../01-architecture.md) 架构报告"猴子补丁"一节
- 演进历史：git `14f6562`/`3ead9e0`/`8ce1047`（"AI 叫我这样可以添加多人的"）→ `8568034` 回退
