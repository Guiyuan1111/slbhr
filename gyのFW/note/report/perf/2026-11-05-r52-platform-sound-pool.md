# r52 · 平台电机声实例池（2026-11-05）

> 战役总账见 [2026-10-18-campaign-summary.md §四十九](2026-10-18-campaign-summary.md)。
> 前轮：[r51 `updateMechs` 归因重构](2026-11-05-r51-update-mech.md)。
> 本轮角度来自 r51 的顺带发现：`startPlatformSound` 每次起步新建 Phaser 音效实例、
> 限位即 `stop + destroy` 销毁——**实例生命周期从未被量化过**。

## 52.1 量具：`perf-sound-churn.mjs`

包 `scene.sound.add` 与 `BaseSound.destroy/play/stop`，在真实开局页面统计
N 个 started 帧内的实例生命周期事件。**确定性口径**（与 r50 对象实例计数、
r51 exp 计数同一纪律）：不依赖统计判据。

基线（`forest_bonus_2`，300 个真实 started 帧）：

| 事件 | 次数 | 折合 |
|---|---:|---:|
| `sound.add("sfx_platform")` 新建 | **17** | 0.057/帧 |
| `sfx_platform` destroy | **19** | 0.063/帧 |
| play / stop | 17 / 38 | — |
| 同时存活峰值 | 2 | 池上界参照 |

（destroy 19 > add 17 的差值来自探针挂上之前已建的 2 个实例在窗口内被销毁，账目自洽。）

单次 `add+play` 的页内成本（r51 实测）：`sound.add` 0.067ms + `play` 0.025ms；
`stop`/`destroy` ≈ 0。即每次起步事件的 ~0.09ms 里，**新建占 ~75%**。

## 52.2 改动：`platSndPool` 实例池

```ts
private readonly platSndPool: Phaser.Sound.BaseSound[] = [];

private startPlatformSound(_id: string): Phaser.Sound.BaseSound | null {
  if (!getSettings().fx || !this.cache.audio.exists("sfx_platform")) return null;
  const s = this.platSndPool.pop() ?? this.sound.add("sfx_platform");
  s.play();
  return s;
}

private stopPlatformSound(s: Phaser.Sound.BaseSound): void {
  s.stop();
  this.platSndPool.push(s);   // 改造前是 s.destroy()
}
```

### 语义等价论证

1. **听感一致**：Phaser `BaseSound.stop()` 后再 `play()` 从头重播，与新建实例
   的起播行为一致；池中实例都是「已停」状态。
2. **重叠数不变**：每个运动平台各持独立实例（tracker 按 id 管理），同时发声数
   上限 = 峰值并发运动数（实测 2，池不设上限也自然有界——池内实例数 ≤ 历史峰值）。
3. **生命周期安全**：GameScene 重建（换关/重开 `scene.restart`）时本字段随实例
   重建为空池，旧实例由 Phaser 声音管理器随场景销毁，**不会跨场景引用泄漏**；
   `platformSounds.clear()` 的 4 处调用（`GameScene.ts:489/607/1856`）走
   `host.stop` → 池化路径，同样安全。
4. **`fx` 开关路径不变**：`getSettings().fx` 为假时仍返回 `null`，tracker 记
   `sound: null`，不与池交互；全局静音走 `this.sound.mute`（`GameScene.ts:594`），
   对池内实例同样生效。

## 52.3 量化：确定性，新建/销毁归零

池化后同口径复测（重建 bundle 后跑，300 帧）：

| 事件 | 改造前 | 改造后 | Δ |
|---|---:|---:|---:|
| `sound.add` 新建 | 17 | **0** | **−100%** |
| `sfx_platform` destroy | 19 | **0** | **−100%** |
| play / stop（事件数） | 17 / 38 | 14 / 20 | 运动模式随会话浮动，非指标 |

**确定性事实，不依赖统计判据。** 两轮会话的运动事件数不同（17 vs 14 次起步），
但新建/销毁的归零是结构性的：**实例数从「每次起步 1 个新实例」变为
「整个场景生命周期 ≤ 峰值并发数」**。

耗时口径不主张（r51 纪律）：0.09ms/事件 × ~0.06 事件/帧 ≈ 5µs/帧的期望节省
低于本环境噪声底（±5.5–18µs），且事件密度随关卡/玩法浮动。

## 52.4 门禁

| 门禁 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| `npx vitest run` | **512/512** |
| `det --compare r44-full` | **241/241 位级一致** |

## 52.5 遗留

- **`sfx` 帮手与其它循环音**（`sfx_portalLoop`/`sfx_wind`）走 `this.sfx()` 单实例
  路径，无 churn 问题，不适用本池。
- 音效实例的 `WebAudio` 底层节点复用受 Phaser `SoundManager` 封装，池化已在
  Phaser 层止住 `add/destroy`；再往下是 Phaser 内部，不在射程内。
- r51 遗留不变：`updateMechs` 的进一步优化需数据布局级重写；
  计时器粗化需隔离上下文才能解除。
