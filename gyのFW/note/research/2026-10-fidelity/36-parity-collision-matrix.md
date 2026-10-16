# 36 号档：碰撞矩阵全谱对齐（collision-matrix full audit）

> 结论先行：**oracle 侧全部 47 个 b2FixtureDef 定义点逐位提取完毕；我方活跃设备碰撞矩阵逐 fixture 断言 18,446 条全部 PASS（0 FAIL）。P0=0、P1=0，本档未修改任何内核文件。** 用户试玩报告的"有一些碰撞和原版逻辑不一样"不来自 fixture/filter 定义层——定义面已全谱 ✓；差异只能来自行为面残差（见 §7 残余风险与 §8 用户核对清单）。

- 日期：2026-10-16
- oracle：`Fireboy-and-Watergirl/output/A/js/init.eb02fbdab2aa1d24.js`（2,218,873 B，latin1 偏移口径，**严格只读**）
- 我方：`packages/shared/src/kernel/{b2,character,mechanisms,build,world}.ts` + `packages/shared/vendor/box2d.js`（byte-identical 引擎）
- 探针：`tools/collision-census-probe.mjs`（定义面断言）、`tools/collision-behavior-probe.mjs`（行为基线），均入本档卷 `tools/`，可复跑。

---

## §1 方法与口径

1. **oracle 全量普查**：对 bundle 全文扫 `b2FixtureDef`（58 处 token，含引擎原型/日志非定义处）+ `categoryBits`（52 处）+ `groupIndex`（10 处）+ `SetSensor`（2 处），逐点取上下文摘录参数，并按最近邻设备类归属到模块。偏移为 latin1 字节偏移（>1.84M 区 utf-8 偏移 +9，注意口径）。
2. **运行时全量断言**：`collision-census-probe.mjs` 走真实 `parseLevel→World` 链构建 11 个关卡（覆盖 48 关出现的全部设备类型），dump 世界内**每一个** b2Fixture 的 filter/friction/restitution/density/isSensor/shape 类别，逐项对照 oracle 期望表断言。**结果：11 关 / 2,621 fixtures / 24 类 / PASS=18,446 / FAIL=0**，两次运行逐位一致。
3. **行为探针**：5 个典型碰撞对内核实测（§6），输出基线数字供用户报告对照。

## §2 oracle 全表（47 定义点）

### 2.1 引擎与插件层（9 点）

| 偏移 | 归属 | 摘录（关键参数） |
|---|---|---|
| @1412799 | `b2Filter.prototype` | categoryBits=1, maskBits=65535, groupIndex=0 |
| @1413235-1413599 | `b2FixtureDef.prototype`（8 token） | shape=null, userData=null, **friction=0.2, restitution=0, density=0**, isSensor=false, filter=null |
| @1562719 | `Box2D.setBounds` 四墙 | shape=矩形, cat=`worldBoundsFilterCategory`(=32768), mask=65535；墙长含 `pxm(100)`=3.125m 外扩（→ §4 P2-1） |
| @1589758/1590465/1590926/1591624/1592502 | `Body.enable` 各形状缺省 fixture | friction=`world.friction`(0.2), restitution=`world.restitution`(0), density=`world.density`(1)（插件缺省 @1559777） |
| @1594710 | `Body.enable` 多边形数组 | 逐点 friction/bounce/density/filter |

### 2.2 活跃设备定义点（26 点 + 地面工厂）

| 设备 | oracle 偏移 | fixture 参数（cat/mask/fr/rest/dens/sensor） | 我方 file:line | 判定 |
|---|---|---|---|---|
| 地面（工厂） | @1801085 | cat=1, mask=4369(0x1111), fr=0.8, rest=0, isSensor=参, userData=参 | `build.ts:89` | ✓ |
| 世界墙 ×4 | @1562719 | cat=32768, mask=65535 | `build.ts:251-265` | ✓ 参数；半长 P2-1 |
| 角色 portal 圆 | @1817616 | cat=4096, mask=4096, groupIndex=**-1**, fr=0, dens=0 | `character.ts:90-98` | ✓ |
| 角色 torso 圆 | @1816395（def 复用区） | cat=16, mask=4353, fr=0 | `character.ts:100-106` | ✓ |
| 角色 feet 圆 | @1816395（def 复用区） | cat=16, mask=4353, fr=0.5 | `character.ts:108-115` | ✓ |
| 角色 trapezoid | @1817127 | cat=16, mask=4353, fr=0, **dens=1.4** | `character.ts:117-129` | ✓ |
| 液体 sensor 带 | @1661791 | cat=1, mask=61695(0xF0FF), fr=0.7, **isSensor**, userData{type:"liquid"} | `build.ts:124` | ✓ |
| 液体冰带 | @1662470 | cat=1, mask=0, fr=0, userData{type:"ice"} | `build.ts:137` | ✓ |
| 液体致死带 | @1663598 | cat=1, mask=4369, fr=0.7, **isSensor**, userData{type:"liquid_death"} | `build.ts:149` | ✓ |
| 钻石 | @1640399 | fr=0.7, rest=0, dens=0, isSensor；userData 先 `"diamond-"+f` 后覆写 lightProperties | `build.ts:273` | ✓ 物理；userData P2-2 |
| 门 | @1643469 | fr=0.7, rest=0, dens=0, isSensor, userData `"door-"+char` | `build.ts:292` | ✓ 物理；userData P2-2 |
| box 主体 | @1634836 | fr=`properties.friction ?? 0.4`, rest=0, dens=`options.density`(普通0.45/重0.8) | `mechanisms.ts:356` 区 | ✓ |
| box 八角圆 | @1635364 | cat=17, mask=4097, fr=`circleFriction`(0.1/0.05), dens=0 | `mechanisms.ts:393` 区 | ✓ |
| box portal 圆 | @1636008 | cat=4096, mask=4096, fr=0.5, dens=0, portal-sensor | `mechanisms.ts:401` 区 | ✓ |
| ball 主体 | @1625097 | fr=0.2, **rest=0.1**, dens=2.3, cat=17（mask 缺省 65535） | `mechanisms.ts:412` 区（:420） | ✓ |
| ball portal 圆 | @1625762 | cat=4096, mask=4096, fr=0.5, dens=0, portal-sensor | `mechanisms.ts:426` | ✓ |
| lever 杆 | @1654585 | cat=1, mask=61695, fr=0.7, rest=0, **dens=1.6** | `mechanisms.ts:102-112` | ✓ |
| pusher 推杆 | @1706415 | cat=1, mask=61695, fr=0.7, rest=0, dens=0.1, userData "pusher" | `mechanisms.ts:177-190` | ✓ |
| platform 板 | @1676783 | **cat=256, mask=4369**, fr=0.7, rest=0, dens=0；`properties.dtheta≠null → dens=0.5`+revolute | `mechanisms.ts:276-286` | ✓ |
| hanging 摆板 | @1647952 | cat=**65535**, mask=65535, fr=0.4, rest=0, dens=2.5 | `mechanisms.ts:471` | ✓ |
| pulley 板 | @1701180 | fr=0.4, rest=0, **dens=3**（filter 缺省 1/65535） | `mechanisms.ts:497` 区 | ✓ |
| roman 摆杆 | @1710025 | cat=1, mask=65535, fr=0.7, rest=0, dens=0.1（梯形顶面内收 2px） | `mechanisms.ts:562-573` | ✓ |
| roman 底座 | @1710980 | cat=1, mask=65535, fr=0.7, rest=0, dens=0.1（三角 (−1,0)(0,k)(1,0)） | `mechanisms.ts:577-591` | ✓ |
| window 板 | @1740907 | 静态；cat=1, mask=61695, fr=0.7, rest=0, dens=0, userData lightProperties | `mechanisms.ts:694` 区 | ✓ 物理；userData P2-3 |
| wind 体 | @1733338 | fr=0.4, rest=0, dens=0.2（filter 缺省 1/65535） | `mechanisms.ts:632` | ✓ |
| wind sensor | @1733987 | isSensor=true, userData lightProperties transparent（filter 缺省） | `mechanisms.ts:635-641` 区 | ✓ |

### 2.3 死代码设备定义点（14 点，48 关 0 对象 → 记 P2-4 不实现）

Beamer @1627543（{1,65535,fr0.7}）；BoxMirror @1638825（fr0 镜面）；LightPusher @1658002/1658759；InfiniteMirror @1651196/1651631/1651823；Portal @1686487/1687000/1695833（fakeWall）；RotMirror @1713429/1713883/1714313/1714559；Slider @1719900（fr0+prismatic）；Snow @1723895（{1,**mask16**,fr1,ice}）；TimedPusher/BackgroundCover 无 fixture。

## §3 我方对照结论

- **逐 fixture 运行时断言**（`tools/collision-census-probe.mjs`，期望表即 §2 的机器可读形式）：11 关 2,621 fixtures，**PASS 18,446 / FAIL 0**。凡 48 关实际出现的设备×关卡组合，filter/friction/restitution/density/isSensor 与 oracle 逐位一致。
- filter 组合语义复核（对用户可感碰撞面的特查）：
  - **角色×机关承载**：CHAR_MASK=4353 含 bit8(256)=PLATFORM_CAT → 角色**站得上**升降平台/转臂/摆板；PROP_CAT=17 与 CHAR_MASK 共享 bit0 → box/ball 与角色**相撞**（球撞人走此位）；LIQUID_SENSOR_MASK=61695 含 bit4(16) → 液体 sensor **收得到角色**、不含 bit8-11 → **不与平台/关联机关误触发**；groupIndex=-1 仅角色自撞对（portal 圆）禁用——全部与 oracle 一致。
  - **单向/穿行面**：液体冰带 mask=0（只作为渲染/逻辑标记，不参与碰撞）；window cat1/61695 静态板。
- **✗ 计数：0**。差异全部为 P2（§4）。

## §4 逐位差异清单（全部 P2，不修）

| # | 内容 | oracle | 我方 | 影响 |
|---|---|---|---|---|
| P2-1 | 世界墙半长 | `pxm(n.height)+m`（=(H+200)/32+3.125，@1562719 pxm(100)） | `H/32+3.125`（`build.ts:259,261`） | 差 200px 全在可玩区外，实体不可达；det 无感 |
| P2-2 | userData 字节差 | door `"door-fb"/"door-wg"`；diamond userData 被覆写为 lightProperties | 我方统一 `{type:"door"|"diamond", char}` | 分发语义等价（world.ts classifyContact 按 fixture 参数/类型分发），物理零差 |
| P2-3 | window userData | lightProperties transparent @1740907 | 无 userData | 光照/渲染属性，物理等价 |
| P2-4 | 死代码设备 14 定义点 | 存在 | 未实现 | 48 关 0 对象；若后续关卡数据出现再实现 |

## §5 修复

**无。P0=0、P1=0。** 本槽零内核改动（`git status` 仅并行槽文件与本档卷/探针新增）。此前各档（rpa/rpb/rpd/25/30-35 号）已消化全部 P0/P1，本档全谱复核确认收敛。

## §6 行为探针基线（内核实测，dt=1/60 固定步，两次运行逐位一致）

探针：`tools/collision-behavior-probe.mjs`（复跑 `npx tsx <file>`，基线快照 `tools/collision-behavior-probe-baseline.txt`）。

| # | 碰撞对 | 场景 | 基线数字 |
|---|---|---|---|
| 1 | 角色站升降平台 | tutorials forest_01 平台@(32,480) dy=-3，state1 上行 96px | 全程相对滑移 ≤0.03px（f20 0.03 / f40-f120 0.01-0.03）；落稳 feet=1 |
| 2 | 走出地面边缘 | forest_02 col3/row17 右缘 x=128 | f15 走行 152.87px/s（feet=1）→ f30 出边 feet=0、vy=268.62 → f45 落 lower 平台 feet=1；**出边即坠、无隐形延伸** |
| 3 | 入液体致死 sensor | forest_02 green row15 col10（上方 9 行净空）直落 | 死亡帧 f46；致死线=液面+5.76px=485.76，末帧脚圆底 493.71（越线即杀）；isOnLiquid=true |
| 4 | 角色推 box | tutorials forest_01 box mass=1.4 | boxvx：f25 94.58 → f50 120.84 → f75 129.71 → f100 178.12 px/s（连续推力下加速，非瞬移） |
| 5 | ball 滚地撞角色 | forest_20 col10..15 平地带，球贴地 vx=240px/s | 启动滑摩后纯滚 159.84px/s（=2/3×240，实心盘转动惯量比，物理正确）；f≈55 击中，球速 159.84→74.18→0，角色获 74.18px/s 同速推移 +15.66px 后摩擦停住；球-人最小中心距 30.44px |

> 探针 5 排障记录：物理 −x=屏幕 +x（双负镜像）曾致抛向反（240×⅔=159.84 纯滚速成为判别标记）；wind sensor 区会吃球速（forest_bonus_3 候选被拒）；抛体走廊需逐点采样球半径 12.8px 余量——均写入探针注释。

## §7 门禁结果

| 门禁 | 命令 | 结果 |
|---|---|---|
| typecheck | `npm run --silent typecheck` | exit 0 |
| 单测 | `npx vitest run` | **85/85 PASS**（4 files） |
| 确定性 | `node --import tsx benchmark/perf-determinism.mjs --compare r32` | **✓ 全部 48 关位级一致（对比 r32）**——零漂（本槽零内核改动的预期结果） |
| e2e 绿关 | `node scripts/e2e/route.mjs --level <lv> --repeat 3 --offset -15` | **forest_12 / forest_07 / forest_15 / forest_26 全部 3 轮 ALL PASS** |

e2e 红关说明（非本槽引入）：forest_02/03/04/06/32 路线在 HEAD 失败。归因：这些路线调优于 10-11~10-13，其后内核保真修复落了多刀（7024dd5 hanging 轴点——det 对 02/12/12_1/19/19_1/25/25_1 漂、72c2bd0 windWidth+BoxedDevice、907ba54 转臂限位+hanging 锚点、d4a1084 roman 枢轴、2e71d31 BALL.radius 勘误），物理更准导致旧路线失配。路线重调正由并行槽进行中（r05g2@forest_05、auto-build2@forest_01、forest_02 v8 定产）。det 位级一致证明内核未被本槽触碰。

## §8 残余风险与用户核对清单

定义面收敛后，"和原版不一样"的候选来源只剩**已建档的行为面残差**：

1. **变步长 P1-D2**（32 号档）：我方固定 1/60；oracle `min(0.04, elapsed)` 变步长——长时悬挂/长坡滑行类场景可累积可见差。
2. **平台 ghost 穿透**（25 号档）：极高速相对运动下薄板穿透窗口。
3. **wind 残差 P2**（33 号档）：风力上限/边界行为微差。
4. 死代码设备 P2-4（当前 48 关无对象，无感）。

**请用户再遇碰撞差异时提供**：① 关卡名与位置（截图更好）② 操作角色与操作序列（按键/时序）③ 期望行为 vs 实际行为。有了这三样可直接映射到 §6 探针的同构碰撞对，量化"差多少"，并判定属于上述哪条残差（或发现新面）。

## §9 产物与边界

- 档卷内产物：`tools/collision-census-probe.mjs`、`tools/collision-behavior-probe.mjs`、`tools/collision-behavior-probe-baseline.txt`
- 本槽纪律遵守：oracle 只读；未触碰 TEMP/autobuild、TEMP/r05g、TEMP/main25 及并行槽文件（routes/forest_01.autosearch.json、routes/forest_05.json、note/evidence/forest_05/）；TEMP/rcm 已清理。
- 前序档：30（platform/pusher/lever）、31（hanging/pulley/roman/window）、32（character/liquid/door/diamond）、33（portal/mirror/wind/props）、34（ball）、35（简化根因）——本档为其定义面总账。
