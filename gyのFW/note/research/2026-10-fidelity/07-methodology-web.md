# 07 · 复刻验证方法论检索（2026-10-05）

> 目的：为本项目"金轨迹对拍"方法论寻找业界佐证与增强方向。检索：输入回放/确定性验证、box2d 确定性实践。

## 检索结论

### 1. 金轨迹对拍 = 业界标准方法论（佐证充分）

- 回放验证的业界共识：**录制输入（+种子）@固定 tick → 复现 → 差分引擎状态快照** 作为等价性/回归测试（[GameDev SE: Replay system](https://gamedev.stackexchange.com/questions/32501/replay-system-record-inputs-or-events)、[k5n.us: Every Bug Report Is a Regression Test](https://www.k5n.us/2026/09/11/deterministic-replay-bug-reports-regression-tests)、[GameTest 框架](https://github.com/luppichristian/GameTest)）。
- 决策要点：录**原始输入**而非事件（事件依赖实现，输入跨实现稳定）——与我们"同一输入脚本喂原版与内核"的做法一致。

### 2. Box2D 确定性边界（对我们方法论的适用性判定）

- Box2D **同机同构建确定**，跨机/跨编译不保证（FMA/重排/x87/SSE、libm 差异）——[ublubu/shapes #28](https://github.com/ublubu/shapes/issues/28)、[gamedev SE: determinism client/server](https://gamedev.stackexchange.com/questions/15426350)。
- **适用判定**：我们的对拍是"原版（本机浏览器 V8）↔ 内核（本机 Node V8）"且用 fixed-dt——同一物理 CPU + 同一 IEEE754 语义 → float 结果一致，**方法论成立**。金轨迹只需本机采集+本机对拍，无跨机问题。
- 前提是固定步长（[Glenn Fiedler "Fix Your Timestep!"](https://gafferongames.com/posts/fix_your_timestep/)）——我们内核 60Hz 定步 ✓；原版可变步长用 `--fixed-dt` 采集模式对齐 ✓。

### 3. 增强技巧（采纳）

- **状态哈希 desync 检测**（lockstep/Factorio 实践，[eev.ee networking tidbits](https://eev.ee/dev/2015/12/21/i-made-a-multiplayer-physics-thread-thing/)）：对全部刚体位姿做哈希/汇总指标，比逐体 maxDrift 更敏感。已加入 diff-kernel 的 RMS 汇总输出。
- 回放陷阱清单（RNG/浮点/时序，[Game Developer](https://www.gamedeveloper.com/design/things-that-can-muddle-your-replay-feature)）：我们的内核无随机数（装饰随机只在客户端渲染层），物理纯确定 ✓。
- 双跑确定性复验（我们已有）+ **周期性状态校验和**（增强项）。

## 对项目的具体改进

1. `scripts/baseline/diff-kernel.mjs` 增加**全刚体 RMS 位姿差**汇总指标（敏感度高于逐体 max）。
2. 方法论确认：**每类机关专项**采样（每类 1-2 关）+ 全关行为冒烟，符合"录制-复现-差分"标准实践。
