# r26 · 三张进房图集零消费帧原地清零（2026-10-22）

口径与判据沿用 r20/r21/r23/r25：里程碑只有冷启动 `Menu active` 与**点击建房→`Game active`**（页钟绝对值
`gameActivePerfMs`），弱网档这两段都是字节账的函数（每 KB 价签 4g 2.048ms、fast3g 5.12ms、slow3g 16.384ms，
`2026-10-22-r20-network-tiers.md:116`）。臂序 A/B/A（臂C＝臂A 同代复测，用来框住本机漂移），
三臂同档位、同机、同一时间窗；跨臂 ms 差只有超出同臂最差带、且大于臂B 自身散布才算差异（闸门③：高漂移档
off/cable 要求 ≥8 轮/臂池化，本轮仍为 2 轮/臂 ⇒ off 只作回归对照，不主张）。

- 臂A＝`c56832f`（0.3.43 现役：三张进房图集加载**官方 PNG**）
- 臂B＝现役（`2c45c79`＋`2343f0a`＋`6c38772`：Slim PNG 产物、装载换 URL、静态网）
- 档位 `forest_01`（general 族），四档串行，同时只有一个浏览器作业

## 一、动的是哪一段：三张图集里**永不参演**的帧

r24 的教训是"图集帧字节等价 ≠ 上屏等价"：Canvas 位图字按**绝对源矩形** `drawImage`，降采样核相位依赖
坐标（[2026-10-22-r24-room-font-subset.md](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/note/report/perf/2026-10-22-r24-room-font-subset.md)）。
所以本轮不重排、不缩放、不换图集尺寸，只做一件事：**把永不绘制的帧矩形在原地清零**。

- 每一张活帧的 `frame` 矩形、图集尺寸、官方 JSON 全部不动 ⇒ 所有活帧的采样相位与坐标逐字节不变；
- 清零的只是"48 关的任何一帧都不会引用"的矩形 ⇒ 上屏像素不可能变化；
- 解码尺寸不变 ⇒ 纹理驻留与 GPU 上传字节不变（§四）。

三张图集的账（素材字节，官方 PNG → Slim PNG）：

| 图集 | 尺寸 | 声明帧 | keep | blank | 清零像素占比 | 官方 → Slim | 省 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `MechAssets` | 2048² | 163 | 67 | **96** | 42.7% | 472.5 → **152.9KB** | −319.6KB（67.6%） |
| `TempleAssets` | 1024×2048 | 60 | 56 | **4** | 9.9% | 280.9 → **229.5KB** | −51.3KB（18.3%） |
| `PopupAssets` | 2048² | 111 | 80 | **31** | 13.9% | 334.1 → **249.3KB** | −84.8KB（25.4%） |
| 合计 | — | 334 | 203 | **131** | — | 1087.4 → **631.7KB** | **−455.7KB（−41.9%）** |

清零像素占比低于字节占比（mech 42.7%→67.6%），因为被清零的 portal/机关家族是高熵美术，压得比平均更狠。

blank 集合的构成（名单即 `DEAD_RULES`，[scripts/atlas-slim/needs.mjs:70](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/scripts/atlas-slim/needs.mjs#L70)）：

| 图集 | 家族/条目 | 帧数 |
| --- | --- | --- |
| mech | `portal` 73、`beamer` 3、`infinitemirror` 2、`rotmirror` 4、`slider` 2、`SliderDot` 1、`SliderTrack` 1、`timed_pusher` 4、`lightpusher` 3、`BoxMirror` 1、`BackgroundCover` 1、`pusher_block_silver` 1 | 96 |
| temple | `Icon0000` / `Icon0001` / `Icon0002` / `Diamond1_Bkg_Empty0000` | 4 |
| popup | `FinishStoneDark` 22（无 dark 关）＋ `Clock` / `CursorToggle` / `DeviceItemRenderer` / `FingerRing*` ×3 / `MuteButton` ×2 / `_default` 9 | 31 |

**keep 集怎么来的（三层，缺一不可）**：

1. **48 关运行期需求**：动态 import 与游戏同源的 `parseLevel`，逐关算机关/平台/装饰需求；装饰移植
   `GameScene.buildDecorations` 的同一条 `seedrandom("ASDFA")` 链（`z=round(3r+3.5)`、7×7 窗口、2×2 occupied），
   复现每个关卡会画出的 `decor_*` 帧。48 关的关卡类型另有断言：只允许 `general/speed/puzzle`——
   出现 dark 就直接抛错，因为 `FinishStoneDark` 已被清零。
2. **固定消费点**：风区两族动画、庙宇四角背景/前景/钟/终点角色、暂停/弹窗底/箭头/勾叉/星级图标、
   结算石碑三族（`seq4(...,0,21)`）等，由约 55 条**内容钉**（文件＋行内字面量/序号）钉住。
3. **门外消费**：`MenuBackground0000`（菜单背景）与 `Confetti0000-0003` 不在房内路径，但会被别处绘制，
   因此明确留在 keep。

护栏是**先白名单后验收**：blank 只允许落在 `DEAD_RULES` 内（[needs.mjs:358](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/scripts/atlas-slim/needs.mjs#L358)），
生成器再断言 blank 与 keep **矩形不相交**（[build-slim-atlas.mjs:54](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/scripts/atlas-slim/build-slim-atlas.mjs#L54)）——
图集里若有别名帧共用矩形，清零 blank 会伤到 keep，这一条把它拦死。像素验收三条：
keep 帧在官方/Slim 同一坐标逐字节相同、blank 帧矩形全 0、blank 之外逐像素 0 差异；
再由 `--check` 重建三张 PNG 与在库产物比字节（门禁里有）。

## 二、实施：只换 PNG URL，官方 JSON 与所有坐标不动

改动面三个装载点，机制零新增：

1. **常量**（[BootScene.ts:49](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/BootScene.ts#L49)）：
   `ATLAS_MECH_PNG` / `ATLAS_TEMPLE_PNG` / `ATLAS_POPUP_PNG` 指向 Slim PNG；注释里写死"三处装载必须同一 URL"。
2. **三处装载**：`BootScene.loadGameAtlases`（[BootScene.ts:109](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/BootScene.ts#L109)）、
   `TempleScene.preload`（[TempleScene.ts:56](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/TempleScene.ts#L56)）、
   `CompleteScene.preload`（[menus.ts:102](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/menus.ts#L102)），
   JSON 仍是官方 `*.json`。先跑的一处把纹理装进缓存，其余按"键已存在"静默跳过；三处同一 URL 才不会让
   Slim 是否生效取决于装载序。
3. **Phaser 侧语义已核**：`AtlasJSONFile` 用的是**显式加载的 PNG 键**，JSON 的 `meta.image` 不参与
   （[AtlasJSONFile.js:101](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/node_modules/phaser/src/loader/filetypes/AtlasJSONFile.js#L101)），
   所以官方 JSON 配 Slim PNG 合法。

`packages/client/src/__tests__/atlas-slim.test.ts` 是常驻静态网（11 例）：冻结三张图集的 keep/blank 计数、
48 关类型集合、`MenuBackground`/`Confetti` 在 keep、逐关装饰非空且不含 blank 帧、装载 URL 收敛
（客户端源码里不再出现官方 PNG 路径）、像素三账与生成器逐字节可复现。**缺键的失效模式是静默的**
（`GameScene.sfx()` 的 `exists` 卫同款思路：Phaser 对已声明帧不会报缺帧），所以这张网必须存在，
通用门禁看不见"画错帧"之外更隐蔽的"画了空帧"。

## 三、四档 A/B/A：面额兑现 94.7%～100.7%，off 档不主张

`node benchmark/load-ab-bands.mjs <档> r26 gameActivePerfMs menuActiveMs`（12 份快照在 `benchmark/results/load-r26-ab-*`）。

| 档 | 臂A→臂B `gameActivePerfMs` | Δ（B̄−mid(Ā,Ĉ)） | 最差带 | 臂B 自身散布 | 三闸门 | 面额 | 兑现 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4g | 12011 → 11102ms | **−884.0ms** | 202ms | 149ms | ①②过 ⇒ 可主张（4.4×带） | −933.3ms | 94.7% |
| fast3g | 27603 → 25230ms | **−2348.8ms** | 215ms | 30ms | ①②过 ⇒ 可主张（10.9×带） | −2333.2ms | 100.7% |
| slow3g | 85380 → 77887ms | **−7515.0ms** | 151ms | 45ms | ①②过 ⇒ 可主张（49.8×带） | −7466.1ms | 100.7% |
| off | 2203 → 2048ms | −194.8ms | 154ms | 112ms | ①②过、③不过（n=2/臂）⇒ **不主张** | —（off 无价签） | — |

- 与 r20 单价表第六次吻合：三档误差 −5.3%／+0.7%／+0.7%（"面额"按 455.7KB × 档位价签）。
  4g 的 94.7% 是"账上 455.7KB 里有一部分在门内本来就与别的字节并行"的常态兑现结构，与 r25 的 94.2% 同型。
- `Menu active` 四档全部落在带内（4g −23.5／fast3g −27.3／slow3g −74.5／off −0.3ms，臂B 散布 124/96/86/61ms）——
  Menu 阻塞窗本轮未动（1727KB／18 条，两臂恒定），这是本轮自带的对照组。
- off 档为什么仍不主张：面额本身≈0（不节流时 455.7KB 在落定门的排队时间可忽略），臂B 2 轮散布 112ms
  仍大于 Δ；历轮同款判据（r21/r23/r25 的 off 档亦为带内/不足判定）。

字节窗口（三档节流一致）：

| 项 | 臂A/C | 臂B | Δ |
| --- | --- | --- | --- |
| Menu 窗（阻塞批） | 1727KB / 18条 | 1727KB / 18条 | **0.0KB / 0条** |
| 房内窗（点击→落定） | 3207KB / 39条 | **2752KB / 39条** | **−455KB / 0条** |
| 到落定累计 | 4934KB / 57条 | **4478KB / 57条** | **−456KB / 0条** |
| 解码字节（Content-Length 之和） | 6838KB | 6383KB | −455KB |

逐文件（4g 第 2 轮，`post` 相位；off 档同值）：

| 文件 | 臂A | 臂B | Δ |
| --- | --- | --- | --- |
| `/assets/atlasses/MechAssets[Slim].png` | 472.8KB | **153.2KB** | −319.6KB |
| `/assets/atlasses/Temples/forest/TempleAssets[Slim].png` | 281.1KB | **229.8KB** | −51.3KB |
| `/assets/atlasses/PopupAssets[Slim].png` | 334.4KB | **249.6KB** | −84.8KB |

- **请求数不变（39→39）**，省下的是纯字节，不是减少往返；Menu 窗一个字节都没动。
- off 档的房内窗总量在 4617／4804／5259KB 之间摆动（三臂各两轮均值），请求 42 条——
  不节流时门后延迟批的一部分会在点击前落完，驻留路径的"落点抖动"历轮同款（r25 §三注、r24 §三）。
  逐文件表里的三笔在 off 档同样读到 −455.7KB，字节缩减本身与档位无关；**off 的窗口总量不作主张**。

## 四、驻留与代价侧：Δ0

量具＝`benchmark/perf-resident.mjs`（臂A＝c56832f 装载源码＋重建，臂B＝HEAD＋重建；快照 `resident-r26-a/b`）。

| 状态 | 纹理 MB（A/B） | 音频 MB（A/B） | heapGC MB（A/B） |
| --- | --- | --- | --- |
| menu | 84 / 84 | 6.82 / 6.82 | 12 / 12 |
| temple 首入 | 98.94 / 98.94 | 6.82 / 6.82 | 27.2 / 27.3 |
| temple 重进 | 98.94 / 98.94 | 6.82 / 6.82 | 27.3 / 27.2 |
| game | 93.39 / 93.39 | 21.81 / 21.81 | 23.3 / 23.1 |
| temple 离房后 | 98.94 / 98.94 | 21.81 / 21.81 | 29 / 28.7 |

- 三张图集解码尺寸未变（生成器断言 Slim 与官方同宽高），纹理逐源 `w·h·4` 两臂逐项相同；
  heapGC 的 ≤0.3MB 差是同臂噪声，不构成"驻留变化"。
- 无新增请求、无新增常驻对象、无新增解码；官方 PNG 仍留在 `public/` 与 dist 里（生成器需要它们），
  但运行时不再有任何 URL 指向它们（静态网断言客户端源码里官方 PNG 路径为 0）。
- 行为面零改动：清零帧从不被绘制；若未来出现新的消费者，`DEAD_RULES` 白名单＋静态网会先失败，
  不会静默画空帧。

## 五、门禁（末轮套件）

串行执行（浏览器类步骤互斥，vitest 不与 regression 抢 `zz_probe` 夹具），**FAIL=0**，本机约 11 分钟：

| 步骤 | 读数 |
| --- | --- |
| typecheck | 0 错 |
| `build-slim-atlas --check` | 三张 Slim PNG 与重建逐字节（152.9／229.5／249.3KB） |
| `split-char-atlas --check` | 六件逐字节（53 帧 152.1KB ＋ 7 帧 28.3KB ＋ 182 帧 442.4KB） |
| `reflow-prephase --check` | png 字节一致 ✓ fnt 字节一致 ✓ |
| build | ✓ built in 4.42s |
| vitest | **22 文件／241 用例**全过（r25 220 ＋ r24 font-room 10 ＋ 本轮静态网 11） |
| det（`perf-determinism --compare r32`） | **48/48** 关位级一致 |
| `prephase-canvas` | **5/5 态逐字节**（menu 803758B／temple 279816B／temple-numbers 448929B／settings 327020B／credits 378072B）；产物哈希 `index-BZ9iZU0M`→`index-CL_bTxBJ` 换代后像素仍逐字节 |
| `domskin` | 4/4 逐字节（232567／240320／235029／153209B） |
| `audiofamily`（off） | **22 项 ✓**（缺键静音窗口的既有判据全过） |
| `charsplay`（off） | 21 项 ✓（含停答阴性对照） |
| `treebake` | 9/9 金样一致 |
| `groundcache` | 6/6 |
| `journey` refresh／wonrefresh／deathretry／rejoin | 3/3 · **6/6** · **4/4** · 3/3 |
| `route` forest_01／forest_12 | won=true，winAt 39490／12978ms（r25 为 39469／13430ms，玩法时点未动） |
| `regression`（zz_probe walkin-doors，`--expect-win`） | won=true errors=0 sync=0 缺帧警告=0 |

- 像素面是"活帧坐标不动"直接兑现的：canvas 五态与 domskin 四态都是**逐字节**，det 48 关是**位级**。
- 这条改动的失效模式（某帧被误清零而仍被绘制）在冷启动/像素门禁里只表现为"某处透明"，不会报错；
  真正的护栏是 §二 的静态网与 48 关需求回算，门禁只是第二道。

## 六、剩余面额与下一轮

三张图集从落定门里的 **1087.4KB 降到 631.7KB**（−455.7KB）。r26 之后房内窗的大件构成
（off 档快照 `phase=post` 逐项账）：

| 字节 | 条目 | 归属轮次 | 名义价（4g/fast3g/slow3g，ms） |
| --- | --- | --- | --- |
| 1600.6KB | `/assets/fonts/chinese/font.png` | r24（像素判负，已回退） | −3278／−8195／−26224 |
| 442.7KB | `CharAssetsPlay.png` | r23 已出门，仍在房内窗 | −907／−2267／−7252 |
| 249.3KB | `PopupAssetsSlim.png` | r26 已清零 | 本轮已计入 |
| 229.5KB | `TempleAssetsSlim.png` | r26 已清零 | 本轮已计入 |
| 153.2KB | `MechAssetsSlim.png` | r26 已清零 | 本轮已计入 |
| 93.0KB | `GroundAssets.png` | — | −190／−476／−1524 |

（单价出自 `2026-10-22-r20-network-tiers.md:116`；价签是"若这笔从关键路径消失"的上限，不是实测收益。）

下一轮的候选（按可做性排序）：

1. **MechAssets 按关装载**（r26 件0 的 planB）：48 关只需 34–53 帧、24 种不同子集；清零后还可以在
   Slim 基础上再按关拆，但需要"关卡确定后装载"的新机制，收益要按 Slim 重算（旧测算对官方整张是门内 −373.9KB）。
2. **PopupAssets 结算板拆张**：结算是房内后期事件，与 r23 chars-play 同型，可按消费点拆出结算板。
3. **MenuAssets 同类清零**：菜单段最后一笔非必要图集，但 `Button` 名是动态拼接，先要把消费口径钉死。
4. **font.png 房内子集**：面额最大（1600.6KB），但 26/36px 的降采样相位等价性仍未解决（r24 判负），
   必须先用 `font-phase-probe` 过关才能 ship。
