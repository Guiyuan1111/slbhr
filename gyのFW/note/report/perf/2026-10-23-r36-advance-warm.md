# r36：换关链字节预热（结算窗灌 HTTP 缓存，链内 158.9→0.4KB，slow3g −2.1s）

> 日期：2026-10-23 · 版本线：0.3.43 · 量具：[`benchmark/perf-advance.mjs`](../../../benchmark/perf-advance.mjs)
> （四档 A/B/A／换臂台，本轮加"武装判胜＋结算窗静网门＋逐资源三段拆账＋驻留快照"）、
> [`advance-warm.test.ts`](../../../packages/client/src/__tests__/advance-warm.test.ts)（6 例静态网）。
>
> 结果：r13 之后换关链（结算「继续」→ 下一关可玩）只剩两类必须现拉的字节——**机关变体 PNG/JSON**
> （每次换关都换）与**房内字体 PNG**（仅 roombase↔blank 变体切换）。本轮在 won 结算窗用
> `fetch(url, { cache: "force-cache" })` 把它们灌进 HTTP 缓存，链上 Phaser 仍按原路径声明：
> 文本 JSON 吃 1 天新鲜期零请求，二进制 PNG 只付一次 304 复验。
> **链内传输 158.9→0.4KB（fast3g/4g/off 均值；slow3g 90.2→0.4KB）**；换关→可玩
> slow3g 匹配 4 轮均值 **4130.3→2017.9ms（−2112.4ms，−51.1%）**、fast3g **A/A′ 中点
> 2316.8→1553.8ms（−763.0ms）**、4g **1833.3→1383.2ms（−450.1ms）**、off **1235.6→1095.3ms（−140.3ms）**。
> 最大单轮收益是字体翻转的 forest_01→02：slow3g 8361.4→1774.4/2602.5ms。纹理驻留与页错不变。

## 一、换关链还剩什么必须现拉

r13 的预烘把地面烘焙移进结算窗，r29/r34 又把结算板与 Temple Finish 移出链；到本轮之前，
`__fwNextLevel` → fade(500ms) → 新关 preload → create 的链上只剩：

| 资源 | 何时必须现拉 | 大小 |
|---|---|---:|
| 机关变体 `MechAssets-<id>.png` | 每次换关（48 关→24 变体，变体由 `mechVariantId(level)` 当场算出） | 1.4–95.2KB |
| 机关变体 `MechAssets-<id>.json` | 同上 | 0.7–1.9KB |
| 房内字体 `font-roombase/blank.png` | 仅当 roombase↔blank 变体翻转（教学两关 blank 795.7KB，其余 46 关 base 209.8KB） | 209.8／795.7KB |
| `font.fnt` | 房内字体声明的一部分 | 同源元数据，服务端 `max-age=86400` |

这些字节不预热也"能玩"，但弱网下它们占满链窗：slow3g 的 forest_01→02 实测链内
222KB、换关→可玩 8431.2ms；95.2KB 的 forest_02→03 也要 4471.9ms。

## 二、实施

| 件 | 内容 |
|---|---|
| URL 单点化 | [`BootScene.ts`](../../../packages/client/src/scenes/BootScene.ts) 新增导出 `mechAtlasUrls(id)`（`mech/MechAssets-<id>.{png,json}`）与 `roomFontPng(key)`（roomblank/roombase 二选一）；`loadMechAtlas` 改吃 `const [png,json] = mechAtlasUrls(id)`，`loadRoomFont` 改吃 `load.bitmapFont(key, roomFontPng(key), FONT_FNT)`。装载与预热从此只有一个字面量出处——两处分叉会静默预热另一份文件。 |
| 预热函数 | [`main.ts`](../../../packages/client/src/main.ts) `warmNextLevelBytes(lv, nextFile)`：`mechAtlasUrls(mechVariantId(lv))` 两件恒温；仅当 `roomFontKey(nextFile) !== roomFontKey(currentTempleEntry?.filename)` 时追加 `roomFontPng(nextFont)`。每个 URL `fetch(...,{cache:"force-cache"}).then(r=>r.arrayBuffer()).catch(静默)`——**只碰 HTTP 缓存**，不建纹理、不动动画键；失败无副作用，链上照旧现拉。 |
| 起跳点 | `prefetchNextLevel` 里 `const lvP = fetchLevelCached(nextId)` 一次解析：`lvP.then(lv => { if (phaser) warmNextLevelBytes(lv, next.filename); })` 在关卡 JSON 落地时**立即起跳**；地面烘焙仍留在 500ms 定时器里用同一个 `lvP`。预热不混入建场后资源（音乐/结算板/chars-play），避免与 preload 抢管道。 |
| 变体判定 | 新增 `nextTempleEntry(fromEntry)` 供「继续」与预取共用；`currentTempleEntry` 在 advance 路径（`reloadLevel`）先 `findTempleEntry(levelId)` 再 `__fwInit` 赋值，与 `loadRoomFont` 无参回退读到的条目一致。 |
| 静态网 | [`advance-warm.test.ts`](../../../packages/client/src/__tests__/advance-warm.test.ts) 6 例：48 关→24 变体两件在库；两把字体 PNG 与 `font.fnt` 在库；字面量只许出现在 BootScene（main/Game/overlays 不得自拼）；预热集恰为变体两件＋条件字体；预热体不得出现 `.textures/.anims/load.*/prepareGround/LevelMusic/PopupFinish/chars-play`；预热调用在 500ms 定时器之外。既有 `atlas-slim`／`mech-variants`／`font-prephase` 三处静态网同步改钉单点构造。 |

安全性：预热发生在 won 之后、玩家读结算面板时，不改变任何游戏状态；`force-cache` 命中与
未命中都走浏览器 HTTP 缓存语义，服务端 `staticGz` 策略不变（PNG `max-age=0`+ETag ⇒ 链上
一次 304；JSON/fnt `max-age=86400` ⇒ 零请求）。预热失败完全静默，原有现拉现烘兜底保留。

## 三、量具：先让链窗只含本链字节

弱网下旧量具有两个归因缺陷，本轮先修量具再测：

| 缺陷 | 现象 | 修法 |
|---|---|---|
| 服务端在客户端加载完成前判胜 | `FW_DEBUG_FORCE_DOORS` 在 started 即开门；slow3g 下新关尚未起场就已 won，**下一关预取在链内起跳**，结算窗与链重叠 | 新增 `FW_DEBUG_ARM_WIN=1`：开门改为"武装后生效"，客户端在**本关首个可玩帧之后**发 `debug-arm-win`。仅基准开启；单独 `FW_DEBUG_FORCE_DOORS` 行为不变（e2e 依赖）。 |
| 结算窗尾流未净 | 上一关的 LevelMusic（1.285MB）/MenuMusic 还在下载就点「继续」，链内读数混入他窗字节 | 结算窗静网门：won 后等到"在飞 HTTP=0 且 1.2s 无完成"，并加 2.5s 最短观察窗（won 后预热要先等 level JSON 一个 RTT 才起跳，slow3g 约 400ms）；上限按档位放大。WS 长连接不计入在飞。 |

另补两笔拆账：

- **逐资源三段**：PerformanceResourceTiming 记 URL/传输字节/相对 `callAt` 落点，按
  `chain`（callAt→bakeStart）、`post`（bakeStart→firstRender+1500）、`settle`（won−1000→callAt）
  三窗归类；换关链不再是"剩余 ≈45ms"的黑盒。
- **纹理驻留**：换关落定后读 `textures.list` 的 `w·h·4` 总账与 ≥0.5MiB 逐键，回答"预热/换变体
  有没有留下旧图"。
- **相位采样**：500ms 采 `phase` 与 WS `isOpen`，失败分支落 `phaseLog`；本轮据此定位了旧量具
  "换关后未起场"其实是 started→won 瞬态被轮询错过。

网络档位照抄 perf-load 的隧道表（CDP `Network.emulateNetworkConditions`，只施加在驱动端 A 页）：
off/cable/4g/fast3g/slow3g，等待超时按档位放大。A/B/A 用整包 `dist` 换臂：
臂 A/C = r36 前构建（`index.html` sha1 `1f965273…`、`index-ClQVBqls.js` sha1 `2eb47771…`），
臂 B = 本轮构建（`index.html` `f8a47781…`、`index-Buz65VGF.js` `bb556d1a…`）。

## 四、四档 A/B/A

每臂 2 轮起（slow3g 臂 B 共 8 轮、基线 A′ 4 轮，用于区分抖动）；`--dwell 1200`＝"看一眼结算
再点继续"。Δ 用 A/A′ 中点对 B；slow3g 用匹配的 4 轮 A′ vs 4 轮 B 为主口径，首轮 2+2 作旁证。

| 档 | 臂A（2 轮） | 臂A′（对照） | 臂B（新） | Δ（fast3g/4g/off＝B−A/A′中点；slow3g＝B−A′ 匹配 4 轮） |
|---|---:|---:|---:|---:|
| fast3g | 2609.2／1969.1（均 2289.1） | 2740.0／1949.0（均 2344.5） | 1749.5／1358.2（均 1553.8） | **−763.0ms（−32.9%）** |
| slow3g | 8431.2／4471.9（均 6451.6） | 8361.4／4318.3／2088.6／1753.0（均 4130.3） | 2602.5／2080.2／1718.9／1670.1（均 2017.9） | **−2112.4ms（−51.1%，对 A′ 匹配 4 轮）** |
| 4g | — | 1973.9／1692.8（均 1833.3） | 1326.9／1439.4（均 1383.2） | **−450.1ms（−24.6%）** |
| off | — | 1209.4／1261.7（均 1235.6） | 1038.1／1152.5（均 1095.3） | **−140.3ms（−11.4%）** |

slow3g 臂 B 池化 8 轮（r1/r2/r4 三个会话）：1774.4／3333.8／2441.0／1720.5／2602.5／
2080.2／1718.9／1670.1，均值 2167.7、中位 1927.3；基线 A′ 4 轮中位 3203.4 → 中位差 **−1276.1ms**。
逐关配对（A′ vs B r4）更能看出面额来自哪里：

| 换关 | 链内基线字节 | A′ | B | Δ |
|---|---:|---:|---:|---:|
| forest_01→02（字体翻转 210KB＋11KB） | 222KB | 8361.4 | 2602.5 | **−5758.9ms** |
| forest_02→03（变体 95.2KB） | 95.9KB | 4318.3 | 2080.2 | **−2238.1ms** |
| forest_03→04（变体 23.6KB） | 24.4KB | 2088.6 | 1718.9 | −369.7ms |
| forest_04→05（变体 17.7KB） | 18.5KB | 1753.0 | 1670.1 | −82.9ms |

小变体的收益趋近固定开销（fade 1000ms＋304 往返）：链内字节归零后，剩余主要是两把调色板
级 PNG 的 304 复验（各 300B，一次 RTT）与 Phaser 装载/解码本身。

## 五、逐资源账：字节去哪了

链窗（callAt→bakeStart）逐资源（fast3g 臂 B）：

| 轮 | 链内 | 结算窗（won 后落点） |
|---|---:|---|
| #1 forest_01→02 | **0.6KB**（两个 PNG 各 300B 的 304；四份图集 JSON、变体 JSON 与 `font.fnt` 传输 0B） | 223KB：`MechAssets-6e517153.png` 11KB@237ms、`font-roombase.png` 210KB@238ms |
| #2 forest_02→03 | **0.3KB**（PNG 304 ＋ JSON/ fnt 0B） | 97.5KB：`MechAssets-84cba11e.png` 95KB@137ms |

四档臂 B 的链内均值全部 **0.4KB**；基线臂 A/A′ 为 **158.9KB**（fast3g/4g/off）与
**90.2KB**（slow3g 4 轮：222／95.9／24.4／18.5KB）。结算窗均值：fast3g 1358KB（含 #1 的
LevelMusic 尾流）、slow3g 690.4KB、4g/off 160.3KB——预热字节确实落在结算窗，且不与建场后
资源（post 窗 0.4–245.2KB）混流。

二进制 PNG 的 304 是设计内成本：`staticGz` 对 PNG 保持 `max-age=0`+ETag，预热只保证"链上
不传图体"，不能消除复验。若未来要把 304 也降到 0，需要改二进制缓存策略，属于红线内的一致性
改动，本轮不做。

## 六、驻留、掉帧与稳定性

- **纹理驻留**（换关落定后 `textures.list`，`w·h·4`）：fast3g 63.4→63.4MB、slow3g 63.2→63.2MB、
  4g/off 64.4→64.4MB——**逐档持平**。预热只写 HTTP 缓存，不建纹理，链上没有多留一份解码画布。
- **掉帧**：fast3g 链内峰隔 267.1／166.7ms（基线 200.3／231.7）；4g 166.5／182.5（基线
  241.9／431.3）；off 175.1／215.5（基线 163.2／174.5）；slow3g 臂 B 出现 906–1173ms 的
  单次 preload 停顿，但基线 A′ 同会话第 4 轮也有 955.2ms 停顿（两者链内字节分别为 18.5KB
  与 0.3KB），且 slow3g 链内掉帧次数 B 53 次 vs A′ 101 次——判为环境抖动，不归因于预热。
- **页错**：2 轮臂全部 0。4 轮 slow3g 会话（A′ 与 B 各一次）均出现 Phaser 内部
  `TypeError: Cannot read properties of null (reading 'sourceSize')`（A′ 48 条、B 61 条），
  两个臂同型同量级，**不是本轮引入**；留作下一轮候选（换关时旧纹理帧被动画/显示对象引用）。
- **相位**：`phaseLog` 确认每轮 won 都落在新关 firstRender 之后；`pageErrors` 无预热相关异常。

## 七、末轮门禁

| 项 | 结果 |
|---|---|
| typecheck | 0 错 |
| build | `index.html` 26.14KB；`index-Buz65VGF.js` 105.77KB／gzip 36.05KB（r35 105.35KB／35.95KB） |
| vitest | **28 文件／304 例**（新增 advance-warm 6 例；三处既有静态网改钉单点构造） |
| 十项生成器 `--check` | `shrink-menu-main`／`split-temple-atlas`／`build-slim-atlas`／`split-char-atlas`／`split-popup-finish`／`split-mech-atlas`／`shrink-popup-main`／`reflow-prephase`／`build-font-blank`／`build-dom-skin` 全部逐字节 |
| det `--compare r0-baseline` | **48/48 位级一致** |
| fixtures | 6/6 PASS |
| prephase-canvas | 5/5 逐字节 |
| roomtext forest_01／forest_12 | 6/6／5/5 面逐字节 |
| domskin | 4/4 |
| audiofamily（off） | ALL PASS |
| charsplay（off） | ALL PASS（窗口期良性降级 2 条） |
| treebake／groundcache | ALL PASS／ALL PASS |
| journey journey／refresh／wonrefresh／deathretry／rejoin | 7/7 · 3/3 · 6/6 · 4/4 · 3/3 |
| route forest_01／forest_12 | 各 1 轮 won=true（winAt 39,491／12,982ms） |
| regression（zz_probe walkin-doors） | won=true，errors=0，sync=0，缺帧=0 |

## 八、结论

- **收益**：换关链内传输 **158.9→0.4KB**（slow3g 90.2→0.4KB）；换关→可玩 slow3g
  **−2112.4ms（−51.1%）**、fast3g **−763.0ms**、4g **−450.1ms**、off **−140.3ms**。
  收益随链内面额单调：字体翻转 222KB → −5.8s，95KB 变体 → −2.2s，18–24KB 变体 → −0.1~0.4s。
- **兼容**：URL 构造单点化，装载与预热必须同源；预热只碰 HTTP 缓存，不建纹理/动画，失败静默
  回落到原现拉；预热集不含建场后资源。48 关确定性、六份 fixture、前场五态、房内文本、树烘焙、
  四条旅程＋advance 旅程、双关路线、回归与十项生成器复现全部通过。
- **代价**：二进制 PNG 链上仍有一次 304（300B×2）；结算窗多出 160–223KB 预热流量（原本也要
  在链上付）；`perf-advance` 的"武装判胜"与静网门仅基准使用，产品默认路径不变；4 轮 slow3g
  会话暴露的 Phaser `sourceSize` 空引用为基线既有问题，已列为下一轮候选。
- **下一轮候选**：换关时 `sourceSize` 空引用的根因（旧纹理帧在动画/显示对象上的引用时序）；
  二进制 PNG 的 304 消除（缓存策略一致性评估）；换关落定后的 Temple Finish 保留/释放再账。
  素材再编码（任务 #42）仍是用户保留项，未经裁决不动。
