# 18 号档 · oracle-gold 铺开前置普查：复刻侧路线 9 关全 C 类（2026-11-11）

> 铺开预案（[06号档 §7.1](06-oracle-gold-fixtures.md)）要求普查先行：每关 1× capture，
> oracle 在路线帧长内 WIN→A 类（建 fixture）；结局达但轨迹远→B 类（挂账等内核保真）；
> 超时/路线死→C 类（路线须 oracle 侧重造）。本档 = 首批 9 关普查的实证记录，
> 回答挂账 §3 #1「oracle-gold 48 关铺开待路线」的供给问题。

## §1 方法

- 量具：`node --import tsx scripts/e2e/oracle/goldcollect.mjs --capture --route <level> --runs 2`
  （虚拟钟 oracle 重放复刻侧 route JSON，实录整数 ms dt 序列 + 双角色采样流；
  ×2 采样流逐位 BITEXACT **9/9 全部成立**——采集链自身确定性无疑点）。
- 路线选择：`scripts/e2e/inputs/routes/` 下非 opt/best/v* 的净版 forest 路线，
  排除已入册 4 关（01/04/12/26）与风关（预案 §7.3：风关新 fixture 冻结）。
- 单关成本 ≈45s（capture ×2）；oracle 引擎重放速率实测 ~10.6ms/帧
  （forest_02 run1 wall 21226ms / 2000 帧）。

## §2 普查结果（2026-11-11）

| 关 | route totalFrames | oracle 结局 | 类别 | 终点/末样本 (fb, wg) |
|---|---|---|---|---|
| forest_02 | 4163 | **lose @1969** | C（路线死） | (413.4, 458.9) / (220.2, 444.5) |
| forest_05 | 1741 | 超时无结局 | C（超时） | — |
| forest_06 | 1480 | **lose @702** | C（路线死） | (514.1, 201.1) / (1004.8, 710.6) |
| forest_06_1 | 1560 | 超时无结局 | C（超时） | — |
| forest_07 | 1780 | 超时无结局 | C（超时） | — |
| forest_14 | 3031 | 超时无结局 | C（超时） | — |
| forest_14_1 | 3031 | 超时无结局 | C（超时） | — |
| forest_15 | 8500 | 超时无结局 | C（超时） | — |
| forest_32 | 5255 | **lose @1408** | C（路线死） | (529.9, 842.9) / (481.1, 842.9) |

- lose 三案双跑同帧同位（BITEXACT），结局翻不是噪声：oracle 侧真死（02: wg 悬停
  池区上方、fb 池缘；06: fb 201 高空坠点；32: 双双落 (530/481, 843) 底厅）。
- **0 A / 0 B / 9 C。**

## §3 定论

1. [06号档 §5](06-oracle-gold-fixtures.md) 的假设「内核优化路线天然带 0.8% 跑速偏置、
   跨引擎不可移植」**首次系统实证，且比假设更硬**：不是「轨迹漂远」（B 类=0），
   而是**结局直接翻**（9/9）。复刻侧 route JSON（旧产线 §0 门禁通过后入库者）对
   oracle-gold 无供给价值——分歧随关卡复杂度增长，唯 forest_01（教学级）与已入册的
   forest_26（风相位锚定特例）曾可移植。
2. oracle-lose 死亡路径锁（预案 §7.4）亦不适用：三 lose 关在内核侧全链 WIN
   （同路线两侧结局相反），expected=lose 会被内核回放直接证伪。
3. **oracle-gold 48 关铺开的唯一有效供给 = oracle 原生路线**：由 oracle 引擎
   背书搜索/逐段校验的路线产线。粗算可行性：oracle 重放 ~10.6ms/帧 × 千级
   eval × 数千帧 = 单关时-天级，现 autosearch 产线（内核 ms 级/千帧）不可承受，
   须另行立项设计（分段 oracle 校验、预算约束搜索等），**登记待裁候选
   §3.1 #12，未立项不擅自开工**。
4. 复刻侧路线产线的价值不受影响：它供给 route.mjs 真服门禁、det 层与玩家侧
   可玩性（02-significant-properties.md #9 行）——两层供给各归各位。

## §4 复现

```bash
node --import tsx scripts/e2e/oracle/goldcollect.mjs --capture --route forest_02 --runs 2
# 产物 TEMP/goldfix/gold-forest_02-r{1,2}.json（gitignored；本档表即全部结论，已清理，
# 重跑即复现——采集链 BITEXACT 9/9）
```

## §5 面积与剩余

- 已入册 4 关 6 case（01/04/12/26 各 main+oracle-gold）不动；本次 9 关 C 类
  不建 fixture 不占 tolerance；森林 48 关其余 34 关无净版路线（无普查对象；
  forest_03 为风关，按预案 §7.3 冻结不普查）。
- 后续若产出新的复刻侧路线，普查价廉（~45s/关），随批次追加即可；但依 §3.1，
  在 oracle 原生路线产线立项前，复刻侧路线不必再进 oracle 普查（结论已足够硬）。
