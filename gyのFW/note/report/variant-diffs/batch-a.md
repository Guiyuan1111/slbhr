# 变体关卡差异解码 · A 组批次报告

- 批次: A 组（flashA）
- 负责对: forest_13_1↔forest_13、forest_17_1↔forest_17、forest_19_1↔forest_19、forest_24_1↔forest_24
- 数据源: `gyのFW/data/forest/levels/`
- 方法: Node 结构化 diff 脚本 `TEMP/flashA/leveldiff.js`（逐层逐对象：objectgroup 按 `id` 匹配、失配者按几何邻近 ≤64px 且 gid/type 相同回退匹配，仍失配计增/删；tilelayer 逐格对比 gid）。对比覆盖 JSON 全部 layer（Ground / Chars / Objects 及其它），另附顶层元数据与 tilesets 差异。
- 计数规则: 差异对象总数 = 增 + 删 + 改对象 + tilelayer 变化格数（逐格计）。
- 铁律: 仅记录脚本实际输出，不推测；无法匹配项如实入存疑。

## forest_13_1 vs forest_13

- 文件: `forest_13_1.json` ↔ `forest_13.json`
- ①差异对象总数: **41**（增 0 + 删 0 + 改对象 13 + tilelayer 变化格 28，tilelayer 变化按格计，合并 run 展示）
- 原始逐条数据: `TEMP/flashA/forest_13_1_vs_forest_13.raw.json`

### ② 逐条差异（共 35 条记录）

| # | 类型 | 层 | 位置 | 内容 |
|---|------|----|------|------|
| 1 | 元数据 | (top-level) | nextobjectid | 31 → 25 |
| 2 | 元数据 | (tilesets) | tilesets | tileset 列表不同: [,,] → [,,] |
| 3 | 改 | Ground | cell(14,3) | gid: 1 → 3 |
| 4 | 改 | Ground | cells(18..23,3) x6 | gid: 1 → 0 |
| 5 | 改 | Ground | cell(24,3) | gid: 1 → 2 |
| 6 | 改 | Ground | cell(13,4) | gid: 0 → 4 |
| 7 | 改 | Ground | cell(14,4) | gid: 0 → 1 |
| 8 | 改 | Ground | cell(19,4) | gid: 0 → 2 |
| 9 | 改 | Ground | cells(20..24,4) x5 | gid: 0 → 1 |
| 10 | 改 | Ground | cell(25,4) | gid: 0 → 5 |
| 11 | 改 | Ground | cell(14,5) | gid: 0 → 4 |
| 12 | 改 | Ground | cells(18..20,5) x3 | gid: 0 → 1 |
| 13 | 改 | Ground | cell(23,5) | gid: 0 → 1 |
| 14 | 改 | Ground | cells(15..17,6) x3 | gid: 1 → 0 |
| 15 | 改 | Ground | cells(15..17,8) x3 | gid: 0 → 1 |
| 16 | 改 | Chars | obj id=24 @(736,96) | x: 736 → 688 |
| 17 | 改 | Chars | obj id=24 @(736,96) | y: 96 → 112 |
| 18 | 改 | Objects | obj id=5 @(64,928) | gid: 26 → 25 |
| 19 | 改 | Objects | obj id=6 @(320,928) | gid: 26 → 25 |
| 20 | 改 | Objects | obj id=7 @(832,928) | gid: 26 → 25 |
| 21 | 改 | Objects | obj id=8 @(1120,928) | gid: 26 → 25 |
| 22 | 改 | Objects | obj id=9 @(464,800) | gid: 26 → 25 |
| 23 | 改 | Objects | obj id=10 @(768,800) | gid: 24 → 23 |
| 24 | 改 | Objects | obj id=11 @(496,224) | gid: 24 → 23 |
| 25 | 改 | Objects | obj id=11 @(496,224) | y: 224 → 288 |
| 26 | 改 | Objects | obj id=12 @(1121,93) | gid: 28 → 27 |
| 27 | 改 | Objects | obj id=21 @(480,96) | y: 96 → 160 |
| 28 | 改 | Objects | obj id=28 [id 28↔14 几何匹配] @(352,96) | gid: 28 → 27 |
| 29 | 改 | Objects | obj id=28 [id 28↔14 几何匹配] @(352,96) | id: 28 → 14 |
| 30 | 改 | Objects | obj id=29 [id 29↔13 几何匹配] @(832,96) | gid: 28 → 27 |
| 31 | 改 | Objects | obj id=29 [id 29↔13 几何匹配] @(832,96) | id: 29 → 13 |
| 32 | 改 | Objects | obj id=29 [id 29↔13 几何匹配] @(832,96) | x: 832 → 830 |
| 33 | 改 | Objects | obj id=29 [id 29↔13 几何匹配] @(832,96) | y: 96 → 93 |
| 34 | 改 | Objects | obj id=30 [id 30↔15 几何匹配] @(64,96) | gid: 28 → 27 |
| 35 | 改 | Objects | obj id=30 [id 30↔15 几何匹配] @(64,96) | id: 30 → 15 |

### ③ 差异性质初判

**结构改造（局部地形重构 + firstgid 重编号表示差）**，非镜像、非换液：

1. **真实地形差异**：Ground 层 28 格变化全部集中在 x=13..25、y=3..8（上半区中央），系一处空中平台/地块的形状重构（`cell(14,3) gid 1→3`、`cells(18..23,3) 1→0`、`cells(15..17,6) 1→0`、`cells(15..17,8) 0→1` 等）。Ground 两文件 firstgid 均为 1，gid 语义一致，属真实差异。
2. **firstgid 重编号（表示差，非玩法差）**：`Objects.json` 的 firstgid 在 _1 侧为 24、在非 _1 侧为 23（tilesets 数组实比：`{"firstgid":24,...Objects.json}` ↔ `{"firstgid":23,...Objects.json}`）。Objects 层全部 gid 变化（26→25=lever 索引2、24→23=pusher 索引0、28→27=box 索引4）均为同一贴图索引的重编号，扣除后 Objects 层仅剩真实差异：obj id=11 (pusher) y 224→288、obj id=21 y 96→160、obj id=29/13 (box) 位置 (832,96)→(830,93)。
3. **角色位移**：Chars obj id=24 (736,96)→(688,112)。
4. 元数据差：nextobjectid 31→25、Objects firstgid 24→23，均为编号表示层，不影响玩法。

### ④ 存疑项（2）

- 顶层字段 nextobjectid: 31 → 25 —— 编号表示差，已核实不影响玩法。
- tilesets 定义存在差异: [,,] → [,,] —— 已查明为 Objects.json firstgid 24→23（脚本显示 `[,,]` 因 tileset name 字段为空），由此产生的 Objects 层 gid 整体 -1 偏移已在上文 ③.2 逐条扣除。
- Chars obj id=24 的对象类型未在 diff 中展开（Chars 层 gid 未变，仅坐标变），移动对象身份按 id=24 直接对应，无存疑。


## forest_17_1 vs forest_17

- 文件: `forest_17_1.json` ↔ `forest_17.json`
- ①差异对象总数: **8**（增 0 + 删 1 + 改对象 7 + tilelayer 变化格 0，tilelayer 变化按格计，合并 run 展示）
- 原始逐条数据: `TEMP/flashA/forest_17_1_vs_forest_17.raw.json`

### ② 逐条差异（共 21 条记录）

| # | 类型 | 层 | 位置 | 内容 |
|---|------|----|------|------|
| 1 | 元数据 | (top-level) | nextobjectid | 28 → 27 |
| 2 | 元数据 | (tilesets) | tilesets | tileset 列表不同: [,,] → [,,] |
| 3 | 改 | Chars | obj id=2 @(32,896) | x: 32 → 96 |
| 4 | 改 | Objects | obj id=6 @(576,224) | gid: 26 → 25 |
| 5 | 改 | Objects | obj id=7 @(288,288) | gid: 26 → 25 |
| 6 | 改 | Objects | obj id=7 @(288,288) | x: 288 → 704 |
| 7 | 改 | Objects | obj id=7 @(288,288) | y: 288 → 192 |
| 8 | 改 | Objects | obj id=8 @(864,224) | gid: 26 → 25 |
| 9 | 改 | Objects | obj id=9 @(704,192) | gid: 26 → 25 |
| 10 | 改 | Objects | obj id=9 @(704,192) | x: 704 → 288 |
| 11 | 改 | Objects | obj id=9 @(704,192) | y: 192 → 288 |
| 12 | 改 | Objects | obj id=10 @(1120,672) | gid: 25 → 24 |
| 13 | 改 | Objects | obj id=16 @(96,800) | height: 96 → 32 |
| 14 | 改 | Objects | obj id=16 @(96,800) | properties.dx: 0 → 3 |
| 15 | 改 | Objects | obj id=16 @(96,800) | properties.dy: 4 → <absent> |
| 16 | 改 | Objects | obj id=16 @(96,800) | propertytypes.dx: float → int |
| 17 | 改 | Objects | obj id=16 @(96,800) | propertytypes.dy: float → <absent> |
| 18 | 改 | Objects | obj id=16 @(96,800) | width: 32 → 96 |
| 19 | 改 | Objects | obj id=16 @(96,800) | x: 96 → 1120 |
| 20 | 改 | Objects | obj id=16 @(96,800) | y: 800 → 256 |
| 21 | 删 | Objects | obj id=27 @(1024,224) | 对象在 B 中无对应 (type=platform name= gid=-) |

### ③ 差异性质初判

**机关差（双杠杆换位）+ 平台布局改造（删 1 垂直平台 + 1 平台移位反向）+ firstgid 重编号**；Ground 层零差异（0 格变化），非镜像、非换液：

1. **双杠杆换位（真实机关差）**：A 中 id=7 (group=2)@(288,288) 与 id=9 (group=3)@(704,192)，在 B 中两者位置互换（id=7→(704,192)、id=9→(288,288)），group 属性未变。脚本按 id 匹配呈现为两条位移记录，语义上是一对杠杆（Objects tile 索引 2 = lever）位置对调。
2. **平台布局改造（真实结构差，已取证）**：A 共 12 个 platform 对象，B 共 11 个。A 的 id=16 垂直平台 @(96,800) 32×96、属性 dx:0/dy:4（左下角）在 B 中**无任何对应**（B 侧 platform 清单已全量比对）；A 的 id=27 水平平台 @(1024,224) 96×32、dx:-3 在 B 中以 id=16 呈现 @(1120,256) 96×32、dx:3——移位约 101px 且移动方向取反。脚本按 id 匹配把 id=16 的全部字段变化逐条列出、并把 id=27 记为删除，两记录合起来的语义即上述"删一梯 + 移一平台"。
3. **角色出生点位移**：Chars obj id=2 x: 32→96（右移 2 格）。
4. **firstgid 重编号（表示差，非玩法差）**：与 13 对同理，Objects.json firstgid A=24、B=23，Objects 层 gid 变化（26→25、25→24）均为同贴图索引重编号（索引 2=lever、索引 1=lever），已扣除。
5. 元数据差：nextobjectid 28→27。

### ④ 存疑项（3）

- 顶层字段 nextobjectid: 28 → 27 —— 编号表示差，不影响玩法。
- tilesets 定义存在差异: [,,] → [,,] —— 已查明为 Objects.json firstgid 24→23，gid 整体 -1 偏移已在上文 ③.4 逐条扣除。
- Objects 层对象 id=27 在 A 中无法按 id 或几何(<=64px)匹配到 B 侧对象，按删除计 —— **已澄清**：实为 A id=27 平台移位 101px 后成为 B id=16（超出 64px 回退阈值），"删除 id=27"与"id=16 全字段修改"两条记录为同一处逻辑改造，diffCount 按计数规则记 8（删 1 + 改 7），逻辑差异数为 7 处对象级变化（2 杠杆换位 + 1 角色位移 + 1 平台删除 + 1 平台移位反向）。

