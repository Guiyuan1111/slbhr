# 38 号档：全关卡视觉元素三层审计（48/48）

- 槽：全关卡视觉元素审计槽（只读审计，零生产 diff；门禁不涉及）。
- 日期：2026-10-20。oracle：`Fireboy-and-Watergirl/`（只读）。我方：`gyのFW`。
- 取证工具（收容于本目录 `tools/level-audit/`）：
  - `audit-data.mjs` — 第 1 层：关卡 JSON canonical-md5 对拍 + 生产 parseLevel 全量实体数独立复算。
  - `audit-runtime.mjs` — 第 2 层采集器：双侧 headless 截图 + 显示列表 dump（`node --import tsx`；我方 3991 / oracle 静态服 8842）。
  - `compare.py` — 第 2+3 层对拍器：显示列表 family 配对 + 对齐像素结构差分。
  - 证据快照：`tools/level-audit/evidence/{report48b.json,data-audit.json,noise.json,table48.md}`。
- 红线遵守：未改任何生产代码；未触碰 `behavior-parity/**`。

## 0. 结论速览

| 层 | 覆盖 | 结论 |
|---|---|---|
| 1 数据层 | 48/48 | **干净**。48 关 JSON + tilesets + temple.json + 全部图集 PNG/帧 JSON canonical 或字节级一致；parseLevel 实体数 47/48 零偏差（唯一异常 forest_05 空 Chars 对象 id=38 系 oracle 数据原生，非我方缺陷） |
| 2 显示列表 | 48/48 | 6 组真实缺失 family（共 524 个精灵）+ 1 组系统性相机 settled scroll 偏移（44/48 关）+ 若干表征性差异（像素等价/每局随机） |
| 3 像素差分 | 48/48 | 结构差分（对齐后）4.7–10.7%（inner 4.8–11.2%，均值 6.89%）；oracle 自噪声底 1.35–2.06% |

**48 关分布：干净 0 / 轻微 2 / 错位 4 / 缺元素 42。**

定性判据：存在真实缺失 family（IceBox*/hanging_base/wind_base_light_on/off/pulley_base/lever_stick_light_on）→ 缺元素；否则 settled shift ≠ (0,0) → 错位；否则 → 轻微。forest_17/17_1 虽无缺失、相机也对齐，但 inner 仍有 7.0/7.2%（地砖变体随机场不同，见 F4），故记"轻微"而非"干净"。

## 1. 方法与口径

### 1.1 第 1 层：数据层
- 口径：对 oracle 原始 JSON 与我方 `packages/server/assets` 关卡数据做规范化（排序化 md5）对比；tileset 引用与 temple.json 单列；图集 PNG 与帧描述 JSON 逐一比对。
- 独立复算：不经 parseLevel，直接按 Tiled 语义重算 Ground tilelayer（含 flip 位）与 Chars/Objects 对象清单，与生产 `parseLevel`（`packages/shared/src/level2.ts`，仅消费 Ground + Chars/Objects/Tutorial_*，"其余层忽略"）输出对账。
- 结果：48/48 canonical 一致、tilesets 一致；实体数 47/48 零偏差。**原版 Tiled JSON 中不存在被丢弃的装饰/背景/视差图层**（第 1 层"掉层"疑虑排除：oracle 装饰/ice 膜均为运行时生成，非数据层内容）。

### 1.2 第 2 层：运行时显示列表
- 采集态（双侧同一语义——"已进场、静止初始、相机收敛"）：
  - 我方：双页 create+join（房间需两人）→ 权威 phase=started → 相机 spring 连续 36 帧稳定 → 400ms 截 A 帧 → 700ms 截 B 帧 → dump。坐标经 `getWorldTransformMatrix()` 取绝对值后 **world−PAD(32)** 折算回关卡坐标。
  - oracle：假钟（VT_INIT 劫持 rAF/setTimeout）泵到菜单 → stubAds → `enterLevel` 门（物理冻结于出生点、开场动画完毕）→ `__vtRelease` → 根 scale+相机连续 30 帧稳定 → 截图 → dump。坐标经 2×2 仿射手动父变换累积（Phaser 2 无可用 world API；`worldTransform` 属性含相机 scroll 不可用）折算回关卡坐标。
- 配对：family = 帧名去尾部 4+ 位数字；锚点近邻 ≤48px（动态 family ≤40px）；随机 family（Navy/decor_/fire_/water_/death_smoke/Clock/火 等）不报告。我方 TileSprite（绳/罗马杆）帧名在 Phaser 3 丢失（`__BASE`/UUID 键），按尺寸分类（w≥1000→BackGround、h==20→pulley_rope、h==30→roman_bar、130≤w≤146→roman_base）。
- 判差：缺帧/多帧、位置 >±2px、origin/flip/角/可见性。

### 1.3 第 3 层：像素差分
- 口径：同帧对拍（双侧均静止初始态、零输入）。1280×960 画布。
- 对齐：`best_shift` 在 ±40px 内搜索（1/4 降采样粗搜 `mean_at(dx/4,dy/4)`），对消相机 scroll 差。
- 结构差分：|Δ|>8 像素，减去动态掩码（双侧各自 A/B 双帧差分膨胀 3×3）、减去时钟区 (560..720, 0..100)；inner 另剔除画布四周 48px 带（该带承载相机残差）；热块按 32×32 直方定位。
- 噪声底：oracle 对 oracle 独立两次载入（forest_02/07/13/15）：结构差分 1.35 / 2.00 / 1.98 / 2.06%（inner 1.26 / 2.02 / 1.88 / 1.93）——来源为每局随机 navy、decor 变体与钻石浮动相位。**oracle 砖块变体场每局基本稳定**（两载入间无大块砖差）。

## 2. 48 关总表

列：`关卡 | 结构差分% | inner% | edge% | 定性 | 旗标`（旗标中"IceBox水面层×N"= N 个水体格缺冰膜精灵；"相机shift(dx,dy)"= settled scroll 对齐残差）。

```text
| forest_01 | 6.2 | 6.3 | 5.7 | 缺元素 | IceBox水面层×5；相机shift(-16,+16) |
| forest_02 | 4.8 | 4.8 | 5.0 | 缺元素 | IceBox水面层×18；hanging_base×2；相机shift(-16,+16) |
| forest_03 | 5.2 | 5.5 | 4.2 | 缺元素 | IceBox水面层×20；wind灯层×2；相机shift(+0,+16) |
| forest_03_1 | 5.3 | 5.5 | 4.2 | 缺元素 | IceBox水面层×20；wind灯层×2；相机shift(+0,+16) |
| forest_04 | 8.2 | 9.6 | 1.7 | 缺元素 | pulley_base×2 |
| forest_04_1 | 8.6 | 9.9 | 2.0 | 缺元素 | pulley_base×2 |
| forest_05 | 8.3 | 8.9 | 5.4 | 缺元素 | IceBox水面层×17；pulley_base×2；相机shift(+0,+16) |
| forest_06 | 6.1 | 6.1 | 6.3 | 缺元素 | IceBox水面层×15；相机shift(-4,-16) |
| forest_06_1 | 6.2 | 6.0 | 6.8 | 缺元素 | IceBox水面层×15；相机shift(-4,-16) |
| forest_07 | 8.4 | 8.5 | 7.9 | 错位 | 相机shift(+16,-16) |
| forest_08 | 6.2 | 6.1 | 6.2 | 缺元素 | IceBox水面层×16；相机shift(-16,-16) |
| forest_09 | 6.0 | 6.2 | 4.9 | 缺元素 | IceBox水面层×28；wind灯层×1；lever杆灯×1；相机shift(-16,-16) |
| forest_09_1 | 6.0 | 6.3 | 4.7 | 缺元素 | IceBox水面层×28；wind灯层×2；lever杆灯×2；相机shift(-16,-16) |
| forest_10 | 5.2 | 5.4 | 4.1 | 缺元素 | IceBox水面层×25；相机shift(-16,-16) |
| forest_11 | 6.4 | 6.6 | 5.2 | 缺元素 | IceBox水面层×10；相机shift(+16,+16) |
| forest_12 | 4.7 | 4.9 | 4.1 | 缺元素 | IceBox水面层×3；hanging_base×3；相机shift(+0,-16) |
| forest_12_1 | 5.3 | 5.6 | 3.8 | 缺元素 | IceBox水面层×3；hanging_base×3；相机shift(+0,-16) |
| forest_13 | 5.8 | 5.9 | 5.3 | 错位 | 相机shift(-16,+16) |
| forest_13_1 | 6.9 | 7.2 | 5.1 | 错位 | 相机shift(-16,+16) |
| forest_14 | 5.4 | 5.3 | 5.7 | 缺元素 | wind灯层×1；相机shift(-16,+16) |
| forest_14_1 | 5.3 | 5.3 | 5.7 | 缺元素 | wind灯层×1；相机shift(-16,+16) |
| forest_15 | 7.5 | 7.7 | 6.5 | 错位 | 相机shift(+16,+16) |
| forest_16 | 7.1 | 7.4 | 5.5 | 缺元素 | IceBox水面层×5；相机shift(+16,+16) |
| forest_17 | 6.1 | 7.0 | 1.7 | 轻微 | — |
| forest_17_1 | 6.3 | 7.2 | 1.8 | 轻微 | — |
| forest_18 | 6.7 | 6.8 | 6.3 | 缺元素 | IceBox水面层×13；相机shift(-16,-16) |
| forest_19 | 6.8 | 6.7 | 7.1 | 缺元素 | IceBox水面层×14；hanging_base×2；相机shift(-16,-16) |
| forest_19_1 | 6.1 | 6.0 | 6.7 | 缺元素 | IceBox水面层×4；hanging_base×2；相机shift(-16,-16) |
| forest_20 | 7.2 | 7.6 | 5.0 | 缺元素 | wind灯层×1；相机shift(+16,-16) |
| forest_21 | 7.8 | 8.0 | 6.4 | 缺元素 | IceBox水面层×4；wind灯层×3；pulley_base×2；lever杆灯×2；相机shift(+16,-16) |
| forest_22 | 7.2 | 7.0 | 7.9 | 缺元素 | wind灯层×5；相机shift(-16,-16) |
| forest_23 | 5.7 | 5.6 | 6.6 | 缺元素 | IceBox水面层×20；相机shift(-16,-16) |
| forest_24 | 10.7 | 11.2 | 8.3 | 缺元素 | pulley_base×1；相机shift(-16,+13) |
| forest_24_1 | 10.3 | 10.8 | 8.2 | 缺元素 | pulley_base×1；相机shift(-16,+13) |
| forest_25 | 5.3 | 5.4 | 4.8 | 缺元素 | IceBox水面层×5；hanging_base×1；wind灯层×1；lever杆灯×1；相机shift(+16,-16) |
| forest_25_1 | 6.2 | 6.4 | 4.8 | 缺元素 | IceBox水面层×5；hanging_base×7；wind灯层×1；lever杆灯×1；相机shift(+16,-16) |
| forest_26 | 6.3 | 6.8 | 3.7 | 缺元素 | IceBox水面层×7；wind灯层×5；相机shift(+0,-16) |
| forest_27 | 7.0 | 7.0 | 6.7 | 缺元素 | wind灯层×3；相机shift(-16,-16) |
| forest_27_1 | 6.9 | 6.9 | 7.0 | 缺元素 | IceBox水面层×14；wind灯层×3；相机shift(-16,-16) |
| forest_28 | 5.6 | 5.4 | 6.7 | 缺元素 | IceBox水面层×23；wind灯层×2；lever杆灯×2；相机shift(-16,-16) |
| forest_29 | 8.0 | 8.4 | 6.1 | 缺元素 | IceBox水面层×10；pulley_base×2；相机shift(+16,-16) |
| forest_30 | 7.8 | 8.0 | 6.6 | 缺元素 | IceBox水面层×19；pulley_base×2；相机shift(+16,-16) |
| forest_31 | 6.4 | 6.3 | 6.9 | 缺元素 | IceBox水面层×15；相机shift(-16,-16) |
| forest_32 | 5.3 | 5.1 | 6.1 | 缺元素 | IceBox水面层×11；相机shift(+16,+16) |
| forest_32_1 | 5.6 | 5.5 | 6.0 | 缺元素 | IceBox水面层×23；相机shift(+16,+16) |
| forest_bonus_1 | 8.3 | 8.9 | 5.3 | 缺元素 | IceBox水面层×8；pulley_base×1；相机shift(+0,+16) |
| forest_bonus_2 | 6.9 | 7.5 | 4.2 | 缺元素 | pulley_base×4；相机shift(+0,+32) |
| forest_bonus_3 | 7.6 | 8.0 | 6.0 | 缺元素 | lever杆灯×1；相机shift(-16,+16) |
```

分布：缺元素 42 / 错位 4（07、13、13_1、15）/ 轻微 2（17、17_1）/ 干净 0。

## 3. Top 问题清单（修复建议仅存档，未实施）

### F1（影响面最大）：水体冰膜层整体缺失 — 423 精灵 / 31 关
- **现象数字**：`missing` 计数 IceBox×255 + IceBoxLeft×84 + IceBoxRight×84 = 423；31/48 关携带（水体格每格 1 个，含左右边缘变体）。带水关卡 inner 抬升约 2–5 个百分点。
- **根因归因**：oracle 在运行时对每个水体格额外渲染一层静态冰膜精灵（帧 `IceBox0000` / `IceBoxLeft0000` / `IceBoxRight0000`，位于水面行下方 +2px，**绘制在水之上层**）；我方 `buildLiquids` 只渲染单层水体（水面帧），管线中无"水体格生成冰膜覆盖"规则。该层不在 Tiled 数据中（第 1 层已证数据一致），属 oracle 运行时生成内容。
- **修复建议**：`GameScene.buildLiquids` 水段按 oracle 规则补发 IceBox 精灵（含左右边缘判别与 +2px y 偏移、深度置于水面之上）。帧在我方同款图集内即可用。**成本 M**（需复刻 oracle 的边缘格判别规则与深度序；改动局限 buildLiquids）。

### F2：相机 settled scroll 系统性偏移 — 44/48 关 + 冻结 zoom 差
- **现象数字**：settled scroll 对齐残差直方：(-16,-16)×13、(-16,+16)×7、(+16,-16)×7、(+16,+16)×5、(0,+16)×4、(0,-16)×3、(-4,-16)×2、(-16,+13)×2、(0,+32)×1、(0,0)×4。另：冻结（未开始）预览态 zoom 我方 0.9231 vs oracle 1.0（1280×960 实测）。
- **根因归因**：我方 CameraManager 把"双角色中点"钳制进世界边界（关卡 + 2·PAD = 1312×992），oracle 收敛后钉在关卡矩形中心（关卡矩形语义）。钳制边界语义不同 → 收敛后恒定偏移，±16px 为主（量化来源与两侧相机 scroll 取整相关）。疑似 0.3.29-F4 相机重写引入（存疑待核：无带日期证据链证明该偏移的引入时点）。
- **修复建议**：将钳制矩形对齐 oracle 语义（关卡矩形，即 world−PAD），或 settle 后钉关卡中心。**成本 S–M**（仅 CameraManager；但会整体平移现有 visual-diff 门禁基线，需同步重录基线，且涉及手感需另行立项验证）。

### F3：机构子精灵缺失/错挂 — 4 组共 82 精灵 / 覆盖 24 关
- **F3a hanging_base**：oracle 吊板容器 = `hanging_platform0000` + `hanging_base0000`（同位双精灵）；我方只画 platform（`GameScene.ts:680`），base 全缺。7 关 20 精灵（02/12/12_1/19/19_1/25/25_1）。**修复：buildMechs 吊挂段补一张同位精灵，成本 S。**
- **F3b wind 灯层**：oracle 风区 = base + light + effect 三件；我方只有 base（`GameScene.ts:762`）+ effect，`wind_base_light_on/off0000` 灯层全缺。14 关 33 精灵（on 25 / off 8）。**修复：风区构建与 `wind_base` 播放同步补灯层精灵，成本 S。**
- **F3c pulley_base 错锚**：oracle 把 `pulley_base0000` 挂在吊板（绳端）位置；我方挂在固定轮锚点（`GameScene.ts:691-692`），10 关 19 精灵系统性错位约 20–40px。另有轮体镜像号差（我方 ±10 外向 vs oracle ±9.8 内向，像素等价表征差）。**修复：改锚点公式；需先核 oracle 锚点推导，成本 M。**
- **F3d lever_stick_light 永不换帧**：`stepLevers`（`GameScene.ts:1681`）只翻 `lever_base_light` 的 on/off 帧；`lever_stick_light` 建于 606 行恒为 `lever_stick_light_off0000`，而 oracle 对 ON 杆渲染 `lever_stick_light_on0000` 且**不随杆旋转**（a=0 覆盖层），我方则随杆 setAngle。7 关 10 精灵。**修复：stepLevers 状态分支补 stickLight 换帧（并改为不旋转覆盖层），成本 S。**

### F4：地砖变体随机场序列不同 — 每关 inner 底噪
- **现象数字**：对齐后 inner 全关 4.8–11.2%（均值 6.89%），无缺失、相机对齐的 forest_17/17_1 仍有 7.0/7.2%；而 oracle 自噪声底仅 1.35–2.06%。
- **根因归因**：两侧砖块变体场各自确定但序列不同——我方 `mulberry32(0x1a2b3c)`（`GameScene.ts:459`）的取用次序与 oracle RNG 流不一致；oracle 每局砖场基本稳定（自对拍砖场无大块差）。
- **修复建议**：逆向 oracle 精确 RNG（疑似 seedrandom 系，且与 navy/decor 生成交织，取用次序依赖载入顺序）——**成本 L、风险高**；或接受为有意分歧并在档卷记录口径。属观感噪声，不影响可玩性。

### F5（不行动项）：像素等价/每局随机的表征差
- 吊/滑平台负宽镜像技巧（sx<0，像素等价）；绳 TileSprite 角 ±90 符号；钻石浮动相位（每局随机）；decor 我方烘焙单画布 vs oracle 逐精灵（`decosTexture`，像素等价）；navy 每局随机；滑轮自旋装饰角差。
- 取证器伪差说明：报告里 `pulley_rope "missing"×33` 是我方 dump 侧 TileSprite 帧名丢失（Phaser 3 UUID 键）造成的仪器伪差，绳实际已渲染（像素上绳区域无热块），不计入缺失定性。

## 4. 与视觉 95.20 历史口径的关系

- 95.20 为整图相似度单值口径，未做平移对齐，相机 settled scroll 偏移（44/48 关）会被计入且占主导。本审计的对齐仪器把该偏移单独剥离后，剩余差分 4.7–11.2% 由地砖变体场（F4）与 6 组缺失 family（F1/F3）构成。**两者不矛盾：95.20 是粗口径混合值，本次是新仪器下的分解结论。**
- F2 若为 0.3.29-F4 相机重写引入（存疑待核），则 95.20 测量时点可能尚无该系统偏移；修复 F2 后重测的整图相似度预计显著抬升，但需另行立项验证（本槽不做终判）。

## 5. 复现方式

```bash
# 第 1 层（纯文件对拍，无需起服）
node note/research/2026-10-fidelity/tools/level-audit/audit-data.mjs

# 第 2+3 层采集（需我方服 3991 + oracle 静态服 8842；跑批 ≤2 并发）
node --import tsx note/research/2026-10-fidelity/tools/level-audit/audit-runtime.mjs

# 对拍（显示列表 + 像素）
python3 note/research/2026-10-fidelity/tools/level-audit/compare.py <ours_dir> <oracle_dir> out.json
```

- 详细证据：`tools/level-audit/evidence/report48b.json`（48 关逐关 dl+px 全量）、`data-audit.json`（第 1 层）、`noise.json`（噪声底）、`table48.md`（§2 同源）。
- 纪律记录：跑批期间临时截图/dump（约 110MB）已按 TEMP 纪律清理；本目录证据为小型 JSON/MD 快照。

## §6 实施记录（2026-10-20，auditfix 槽）

### F1 复核：前提被 oracle 字节推翻，按修正语义落地（fa27b8b）

- **推翻证据**：Liquid 构造 `iceGraphics.visible = !1`（@1666560）；仅 55 型瓦片触发 `f.type=5, f.startFrozen=!0`（@1661093）；可见唯一路径=initialFreeze（@1667800，`iceGraphics.visible=!0` 且 `liquidGraphics.visible=!1`）或光束 freeze。森林 58 份地图（含 tutorials）55 型瓦片 **0 用例**（Ground.json localId 14=type55，全量 gid 扫两轮含 flip 位掩码）+ beamer 0 用例（14 号档 §1.4）⇒ **oracle 森林冰膜恒不可见**。
- **伪差机理**：本档对拍器 DUMP_ORACLE 记 `v: o.visible !== false` 只看子精灵自身 visible、未合成祖先组可见性（Phaser 2 组隐藏不改子 flag）——IceBox 精灵自身 visible=true 但整组隐藏 → 被判 missing(v:true)。与 §3 F5 pulley_rope TileSprite 帧名丢失同族仪器伪差。旁证：forest_01 像素差分水区（row28 x848-976）无热块；IceBox 记录坐标 y=行心+4 与 iceGraphics.position.y=4 精确同源。
- **落地**：buildLiquids 每水体格补 IceBoxLeft/IceBox/IceBoxRight 0000 静帧隐藏覆盖层（容器 +4px、水面之上、visible=false，单宽格 Left+Right 同格叠放与 createIceGraphics 无条件双建一致）——像素零影响、显示列表对齐，庙域冻结机制（55 型解析+冻结物理）未接线随开荒。委托方「落地后水体关分数上行」预期按此修正为「不变化」，实测确认。
- 修正表：§2 旗标「IceBox水面层×N」31 关全部由「缺失」改判「仪器伪差（隐藏层）」；§3 F1 根因归因改写如上。

### F3 四件落地

- F3a hanging_base（8ad63f6）：@1646952 字证吊板容器=platform+base 同位双精灵（base 自然宽、后 addChild 盖 platform、随板位姿）——已补，7 关 20 精灵。
- F3b wind 灯层（4cc9886）：Device 基类 lightFrame 机制（@1620378 子精灵、setupLight 双帧组色 tint @1620676、updateLight 先于 updateState @1622404）——已补 on/off 换帧+组色 tint，14 关 33 精灵。
- F3c pulley_base（e6111e5）：@1699887 字证 base1/base2 为 platform1/2 动板容器首子精灵（随板动、板底衬、underGround 层序 绳→平台[base,plat]→轮）——锚点由静态轮锚改双板位。本档「错位约 20–40px」修正为「板与锚点全距」（forest_04 oracle (79.6,875.9) vs 旧我方 (80,114)）；10 关 19 精灵。轮体 ±10 镜像差维持 F5 不动。
- F3d lever_stick_light（64b099d）：@1653884 字证 stick_light 入 lights 列表随 state 换 on/off 帧——换帧已补。**本档「不随杆旋转（a=0 覆盖层）」系对拍器只记局部角的仪器语义**：字节面 stick_light 为旋转体 m 的子精灵（@1653790 addChild），随杆旋转；我方随杆 setAngle 行为保持。

### F2 落地（83a8bef）

- checkBounds @1845100 字证：钳制域=关卡矩形 [0,W]×[0,H]（屏域全 realW/realH、无 PAD）；W·h<realW → root 钉 realW/2−W·h/2（关卡居中、与焦点无关——W·h<realW 时 left/right 旗恒有一真）；否则钳 F=mid·h∈[W·h−realW/2, realW/2]。我方世界域等价式已注释进 updateCamTarget。
- 落地实测（visual-diff forest_01 idle@60，39 号档新口径）：最优平移 (5,−6)→(0,0)、零偏移项 80.7→92.0；det 48/48、census 18,446 PASS、e2e f01/f12 PASS（相机纯渲染面零物理交集实证）。§3 F2 结案。
- 44/48 关 settled shift 直方（§2 旗标「相机shift」）随本修全部归零（标准关 settled 恒 (16,16)）。

### 门禁与 commit 链

- 每批 tsc 0 / det 48/48 @r0-baseline / census 18,446 PASS / vitest 95/95；行为批 e2e f01+f12 repeat1 PASS、journey pause 9/9、visual-diff 90.77→92.84→92.01→92.03（带内）。
- commit：fa27b8b(F1)→8ad63f6(F3a)→4cc9886(F3b)→e6111e5(F3c)→64b099d(F3d)→04005a5(V13)→6884ba8(V9/V10)→3477519(V17)→83a8bef(F2)→884457a(音效)。
- 本档 F4（地砖变体 RNG）未动，维持 §3 原判（成本 L 风险高）；F5 不动。
