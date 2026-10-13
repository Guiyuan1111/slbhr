# variant-diffs · B 组批次报告（flashB）

批次：`forest_25_1 ↔ forest_25`、`forest_27_1 ↔ forest_27`
数据源：`gyのFW/data/forest/levels/*.json`（Tiled 1.x 导出，39×29 格，tile 32px，三层：Ground(tilelayer) / Chars(objectgroup) / Objects(objectgroup)）

## 方法与复现

- 结构化 diff 脚本：`note/report/variant-diffs/tools/flashB-diff_levels.cjs`（工作副本在 `gyのFW/TEMP/flashB/diff_levels.cjs`，TEMP 被 gitignore 故提交报告目录副本）。
- 方向约定：**base（无后缀）→ variant（`_1`）**，即下列所有"旧值 → 新值"中旧值取自 base、新值取自 `_1`。
- 规则（脚本头注释同源，可复现）：
  1. 三层全部对比，不比对文本：Ground 逐格比 1131 个 gid；Chars/Objects 逐对象比字段。
  2. **gid 归一化**：各图按自身 tilesets 的 firstgid 把 gid 解析为 `(tileset, localId, tileType)` 后再比，避免 firstgid 漂移造成假差异（本批次 forest_27 的 LargeObjects firstgid=23 / Objects=26，forest_27_1 为 24 / 27，同一 tile 的 raw gid 差 +1，属重排非差异）。
  3. 对象匹配：Pass0 两侧 id 唯一且相等直接配对 → Pass1 同归一化 key 贪心最近邻（≤4096px）→ Pass2 剩余按位置 <96px 跨 key 配对；其余计增/删。
  4. 计数口径：Ground 每个变更格计 1 条；对象层每对象计 1 条（一个对象多处字段变化仍计 1）。地图级元数据（version/tiledversion/nextobjectid/tilesets）单列，**不计入** gameplay 差异数。
- 复现命令（在 `gyのFW/` 下）：
  ```
  node TEMP/flashB/diff_levels.cjs data/forest/levels/forest_25.json data/forest/levels/forest_25_1.json
  node TEMP/flashB/diff_levels.cjs data/forest/levels/forest_27.json data/forest/levels/forest_27_1.json
  ```
- tile 类型语义来源：`gyのFW/assets/tilemaps/tilesets/{Ground,Chars,LargeObjects,Objects}.json` 的 `tiles[].type` / `tileproperties`（如 Chars#4=`diamond char=fb`、#5=`char=wg`、#6=`char=silver`；Objects#0=`pusher`；LargeObjects#2=`wind`）。吊板机制语义来源：`packages/shared/src/level2.ts:446-467`（`type:"hanging"` → `hangings[]`，读 `pts/fullRotation/barWidth`）与 `packages/shared/src/kernel/mechanisms.ts:421-433`（`buildHanging`，barWidth 为板宽参数，默认 3.2）。

---

## forest_25_1 ↔ forest_25

### ① 差异对象总数

**20**（Ground 0 格差；Chars 删 12 + 增 1；Objects 增 6 + 改 1）
地图级元数据差（不计入）：`version` 1→1.1、`tiledversion` "1.1.3"→"1.11.2"、`nextobjectid` 31→43（`_1` 为 Tiled 1.11.2 重导出版）。

### ② 逐条差异（脚本原样输出，方向 base→variant）

#### 层 Ground (tilelayer)
- data 逐格对比：**零差异**（1131 格全部一致，含 firstgid 归一化；独立复核 raw gid 逐格比较同为 0 差）。

#### 层 Chars (objectgroup)
- 删除 Chars#5(diamond)[char=wg] id=8 @(1096,688)
- 删除 Chars#5(diamond)[char=wg] id=9 @(896,240)
- 删除 Chars#5(diamond)[char=wg] id=10 @(928,112)
- 删除 Chars#5(diamond)[char=wg] id=11 @(448,208)
- 删除 Chars#5(diamond)[char=wg] id=12 @(32,528)
- 删除 Chars#5(diamond)[char=wg] id=13 @(448,608)
- 删除 Chars#4(diamond)[char=fb] id=14 @(192,240)
- 删除 Chars#4(diamond)[char=fb] id=15 @(192,432)
- 删除 Chars#4(diamond)[char=fb] id=16 @(512,608)
- 删除 Chars#4(diamond)[char=fb] id=17 @(1096,504)
- 删除 Chars#4(diamond)[char=fb] id=18 @(832,240)
- 删除 Chars#4(diamond)[char=fb] id=19 @(864,112)
- 新增 Chars#6(diamond)[char=silver] id=39 @(832,352)
- 其余 3 对象（2 出生点 gid16/17、2 门 gid18/19 中的全部 4 个：gid16,17,18,19 各 1）位置字段零变化。计数核对：base Chars 16 个 = gid{16:1,17:1,18:1,19:1,20:6,21:6}，`_1` 5 个 = gid{16:1,17:1,18:1,19:1,22:1}（raw dump 验证）。

#### 层 Objects (objectgroup)
- 新增 (无gid)[type=hanging] polyline[0,0 0,192] props={barWidth:3, fullRotation:true} id=31 @(640,488)
- 新增 (无gid)[type=hanging] polyline[0,0 0,192] props={barWidth:3, fullRotation:true} id=32 @(416,512)
- 新增 (无gid)[type=hanging] polyline[0,0 0,160] props={barWidth:3, fullRotation:true} id=33 @(720,416)
- 新增 (无gid)[type=hanging] polyline[0,0 0,208] props={barWidth:3, fullRotation:true} id=34 @(896,384)
- 新增 (无gid)[type=hanging] polyline[0,0 0,192] props={barWidth:3, fullRotation:true} id=35 @(960,320)
- 新增 (无gid)[type=hanging] polyline[0,0 0,112] props={barWidth:3, fullRotation:true} id=36 @(928,312)
- 修改 (无gid)[type=hanging] id(base)=29 id(变体)=29 @(688,496)→@(800,456)
  - `x`: 688 → 800
  - `y`: 496 → 456
  - `properties.barWidth`: 9 → 3
  - polyline 本体 [0,0→0,248] 与 fullRotation:true 两文件一致，未列差异（脚本输出中的引号系二次 JSON 序列化显示痕迹，raw dump 确认 barWidth 为数值 9/3）。
- 其余对象：platform×2（id25/id27）与 4 个带 gid 对象零变化。计数核对：Objects 层 base 7 个（带 gid 4 + 无 gid 3），`_1` 13 个（带 gid 4 + 无 gid 9）（raw dump 验证）。

### ③ 差异性质初判

**机关差（吊板机关群整体新增）＋ 收集品删减**，非镜像、非换液、非结构改造（地形 0 差）：
- variant 把 base 的 12 颗双色钻石（fb 6 + wg 6）替换为 1 颗银钻（silver）@(832,352)；
- variant 新增 6 处 hanging 吊板（集中在中上部 x∈[416,960]、y∈[312,512] 区域），并把原唯一吊板右移上移、板宽 9→3（变窄）。
- 机关拓扑从"单吊板"变为"7 吊板阵"，属机关层面的加建改造（比 14↔14_1 单机关差大，未到 12↔12_1 结构改造量级——地形与门位未动）。

### ④ 存疑项

1. **hanging 对象配对依据**：无 gid 对象的对应关系按 Pass0 同 id（base id29 ↔ `_1` id29）判定，为最合理对应（同 id 同 type 同 polyline 长度）但无 Tiled 官方对应保证；若改按最近邻配对（base29↔`_1`id31），增/改的划分细节会不同，但**增 6 + 改 1 的总数不变**。
2. **收集品删减的通关语义**：钻石 12→1 是否改变通关条件/星级判定，本报告只报告对象层事实，未运行游戏验证。
3. 元数据差异（tiledversion/nextobjectid）判断为重导出痕迹，非玩法差异——此为初判。

---

## forest_27_1 ↔ forest_27

### ① 差异对象总数

**23**（Ground 19 格差；Chars 改 2；Objects 改 2）
地图级元数据差（不计入）：`version` 1→1.1、`tiledversion` "1.1.3"→"1.11.2"、`nextobjectid` 30→32、`tilesets` firstgid 重排 `1:Ground, 16:Chars, 23:LargeObjects, 26:Objects` → `1:Ground, 16:Chars, 24:LargeObjects, 27:Objects`（同一 tile 的 raw gid 整体 +1，已归一化，不构成差异）。

### ② 逐条差异（脚本原样输出，方向 base→variant；tile 格附换算像素坐标，32px/格）

#### 层 Ground (tilelayer)
- cell[col=22..26, row=6] ×5 格（像素 x704..832, y192）: 7(Ground#6, type=6) → 6(Ground#5, type=5)
- cell[col=29..32, row=6] ×4 格（像素 x928..1024, y192）: 7(Ground#6, type=6) → 6(Ground#5, type=5)
- cell[col=36, row=26] ×1 格（像素 (1152,832)）: 0(空) → 2(Ground#1, type=1)
- cell[col=37, row=26] ×1 格（像素 (1184,832)）: 0(空) → 1(Ground#0, type=0)
- cell[col=6..10, row=27] ×5 格（像素 x192..320, y864）: 7(Ground#6, type=6) → 6(Ground#5, type=5)
- cell[col=16..18, row=27] ×3 格（像素 x512..576, y864）: 7(Ground#6, type=6) → 1(Ground#0, type=0)
- 合计 19 格（5+4+1+1+5+3）；其余 1112 格零差异。type 数值来源 `assets/tilemaps/tilesets/Ground.json` tileproperties。

#### 层 Chars (objectgroup)
- 修改 Chars#1(char)[char=wg] id(base)=1 id(变体)=1 @(256,128)→@(736,768)
  - `x`: 256 → 736
  - `y`: 128 → 768
- 修改 Chars#0(char)[char=fb] id(base)=2 id(变体)=2 @(736,768)→@(256,128)
  - `x`: 736 → 256
  - `y`: 768 → 128
- 即 wg 与 fb 出生点互换。其余 3 对象（gid18、gid19 出生点、gid22 银钻 @(48,880)）零变化（raw dump 验证）。

#### 层 Objects (objectgroup)
- 修改 Objects#0(pusher) id(base)=24 id(变体)=24 @(640,704)→@(1152,928)（位移 dx=512, dy=224）
  - `x`: 640 → 1152
  - `y`: 704 → 928
  - properties.group=3 两侧一致；raw gid 26→27 系 firstgid 重排（Objects firstgid 26→27），归一化后同为 Objects#0(pusher)，非差异。
- 修改 LargeObjects#2(wind) id(base)=25 id(变体)=25 @(256,592)
  - `properties.group`: 4 → 0
  - length=6、rotation=-90 两侧一致；raw gid 25→26 系 firstgid 重排（LargeObjects 23→24），归一化后同为 LargeObjects#2(wind)。
- 其余 8 对象零变化（platform×3、wind×2、lever×2、ball×1；raw gid 25/26→26/27、28→29、36→37 均为 firstgid 重排归一化后一致）。

### ③ 差异性质初判

**机关差 ＋ 出生点互换 ＋ 地形面类型微调**，非镜像、非换液、未达 12↔12_1 级结构改造（Ground 主体 1112/1131 格不变，无门位/结构体迁建）：
- 双出生点 (256,128) 与 (736,768) 互换（wg 去左上、fb 去右下，对调）；
- pusher（Objects#0）从地图中部 (640,704) 移至右下角 (1152,928)；
- wind @(256,592) 联动分组 group 4→0；
- Ground 19 格：三段地表 type 6→5（共 14 格）、一段 type 6→0（3 格）、右下补 2 个实心格（type 1/0）。

### ④ 存疑项

1. **gid 23 归属歧义（本对特有）**：forest_27 的 firstgid 分配下 Chars（16..23）与 LargeObjects（23..25）区间在 gid23 重叠。已验证两图 Ground 数据无任何 ≥16 的 gid、对象层无 gid23（脚本检查输出：`Ground data gids>=16: 0 | objects with gid==23: 0` 两侧同），**该歧义不影响本次 diff 结论**；脚本按 Tiled 顺序分配原则把 gid23 判给 LargeObjects#0。
2. **Ground type 数值变化的游戏语义**：type 6→5 / 6→0 / 补格 1/0 在引擎中的碰撞、伤害、附着判定差异未查引擎代码，本报告仅报告 tile 数据事实（Ground.json tileproperties 数值），性质初判里的"地形面类型微调"基于此数据层面。
3. **pusher 移位的对象对应**：按 Pass0 同 id（id24↔id24，同 Objects#0 pusher、同 group=3）判定；此为 10 对象层中唯一 pusher，无歧义。
