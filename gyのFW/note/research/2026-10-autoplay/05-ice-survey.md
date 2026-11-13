# ice 系关卡盘点（2026-10-28，parseLevel 权威解码 50 关）

状态：**换关选型依据**（#50 需 ice 系 2-3 关全解；ice_02 已 4/5 开卷，见 04 号档）。

## 1. 总体事实

- 关卡库 `data/ice/levels/`：ice_03…ice_36（含 `_1` 变体 13 档）+ `ice_bonus_1/2`，共 **50 档**；tutorials 层仅 ice_02。**不存在 ice_00/ice_01**。
- 全部 39×29（唯一例外 bonus_2 39×35），与 ice_02 同版面规格。
- **整个 ice 世界没有任何液体危险**（liquids 全空：无水/岩浆/绿池）——死亡威胁只来自几何（落坑）与机构。与 ice_02 的绿池观测矛盾？不：ice_02 的绿池在 tutorials 层，是教程特设；主库 ice 关无液。
- 管线已就绪：`LEVELS_DIRS` 含 `data/ice/levels`（`scripts/e2e/routetool/kernel.mjs:19`）；`--level ice_NN` 缺省找 `tools/checkpoints-ice_NN.json`（`autosearch.mjs:57`），段词表/配方在 `SEG`/`SEGI`（`autosearch.mjs:502,668`）。

## 2. 选型短名单（按预期攻坚成本升序）

| 关 | 机构 | 钻石 | 判语 |
|---|---|---|---|
| **ice_27** | 无 | 8 | 零机构纯跑跳，首选 |
| **ice_25** | 无 | 10 | 零机构，次选 |
| **ice_20** | 无 | 18 | 零机构，钻石最多（收集路线长） |
| ice_06 | box×1 | 14 | 单箱子，次轮 |
| ice_23(_1) | pulley×2 | 16 | 滑轮 |
| ice_29 / ice_34 | hanging×4 | 10/12 | 摆动机构 |
| ice_10 | wind×4 | 16 | 风区 |

`_1` 变体与母本机构清单一致（差异在布局细节），解母本后变体可低成本复用链。

## 3. 全量清单（机构×数量；d=钻石数）

```text
ice_03(_1)   d=10  beamer×1 infiniteMirror×2 slider×1
ice_04(_1)   d=10  lever×3 pusher×2 platform×4 beamer×2 rotMirror×2 boxMirror×1（_1: lever×4 platform×5）
ice_05       d=1   pusher×4 box×1 platform×4 roman×1
ice_06       d=14  box×1
ice_07       d=7   lever×1 timedPusher×2 platform×3
ice_07_1     d=7   timedPusher×3 platform×5 beamer×1
ice_08(_1)   d=6   pusher×3 box×2 platform×3 pulley×1 beamer×1（_1 加 lever/ball×2/platform×4）
ice_09(_1)   d=1   lever×1 pusher×5 box×2 platform×6 beamer×1 rotMirror×3 lightPusher×1
ice_10       d=16  wind×4
ice_11       d=12  lever×1 timedPusher×1 platform×1 beamer×2 rotMirror×1 infiniteMirror×1 slider×1
ice_12       d=1   lever×1 pusher×2 timedPusher×1 platform×4 beamer×2
ice_13       d=8   lever×1 platform×2 beamer×2 infiniteMirror×3 lightPusher×1 slider×3
ice_14       d=4   lever×2 pusher×6 ball×2 platform×13 beamer×4
ice_15(_1)   d=8   pusher×3 box×6 platform×8 pulley×1 beamer×2 boxMirror×3 lightPusher×2
ice_16(_1)   d=1   pusher×4 ball×4 platform×4（_1 platform×5）
ice_17       d=10  lever×1 pusher×5 box×3 wind×2 platform×5 beamer×2 rotMirror×1
ice_18(_1)   d=1   pusher×4 box×2 platform×5
ice_19       d=10  lever×1 pusher×3 box×1 wind×3 platform×4 hanging×2
ice_20       d=18  （无机构）
ice_21       d=8   lever×3 pusher×3 timedPusher×5 platform×12
ice_22       d=1   pusher×4 platform×5 beamer×1 infiniteMirror×1 slider×1
ice_23(_1)   d=16  pulley×2
ice_24(_1)   d=1   lever×1 pusher×2 timedPusher×2 platform×5 beamer×1
ice_25       d=10  （无机构）
ice_26       d=8   lever×1 pusher×3 box×1 platform×3 beamer×1 rotMirror×2 infiniteMirror×1 slider×1
ice_27       d=8   （无机构）
ice_28(_1)   d=1   lever×2 pusher×5 box×3 platform×8 pulley×1
ice_29       d=10  hanging×4
ice_30(_1)   d=10  pusher×2 timedPusher×1 box×2 platform×4 pulley×1
ice_31       d=1   lever×1 pusher×2 platform×3 beamer×2 infiniteMirror×2 slider×2
ice_32       d=1   lever×1 pusher×4 box×2 platform×9
ice_33       d=8   lever×3 pusher×1 wind×2 platform×4
ice_34       d=12  hanging×4
ice_35(_1)   d=1   lever×1 pusher×5 box×2 ball×1 platform×7
ice_36(_1)   d=10  lever×1 pusher×2 timedPusher×2 platform×5 beamer×2
ice_bonus_1  d=8   lever×3 pusher×5 timedPusher×1 box×3 ball×4 platform×15 pulley×1
ice_bonus_2  d=10  lever×3 pusher×9 timedPusher×1 ball×12 wind×1 platform×23（39×35）
```

## 4. 数据与方法

- 解码用项目自身 `parseLevel`（`packages/shared/src/level2.ts:421`）经 tsx 直载，与游戏同一实现；一次性盘点脚本已按 TEMP 惯例用后即删，原始计数存于本档 §3（脚本输出直接誊录）。
- 光学系机构在 ice 库出现频度高（beamer 20+ 关、镜面族 10+ 关）。回放实证现状：`slider` 已被 light_01 路线（corpus 在档）覆盖；**beamer / rotMirror / boxMirror / infiniteMirror / lightPusher 无任何路线实证**——首个含这些机构的 ice 关开链前，先做 segcheck 式机构冒烟（构造→step→快照非 NaN/非静止异常），再写链。
- ice_02 的绿池属 tutorials 层特设；主库 ice 关无液，威胁面=几何+机构。
- **ice_27 内核冒烟已过**（2026-10-28）：makeWorld 加载即 playing，空输入 300 帧双方存活（fb 1168,125 / wg 80,125 对角出生）——零机构关可直接开链。
