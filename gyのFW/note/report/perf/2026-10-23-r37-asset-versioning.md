# r37：换关链静态资源内容寻址（消掉最后两次 304 复验，slow3g −342ms）

> 日期：2026-10-23 · 版本线：0.3.43 · 量具：[`benchmark/perf-advance.mjs`](../../../benchmark/perf-advance.mjs)
> （沿用 r36 的武装判胜＋结算窗静网门＋逐资源三窗拆账，未改口径）、
> [`asset-versions.test.ts`](../../../packages/client/src/__tests__/asset-versions.test.ts)（4 例）与
> [`staticGz.test.ts`](../../../packages/server/src/__tests__/staticGz.test.ts)（新增 5 例）。
>
> 结果：r36 把换关链的**字节**压到 0.4KB，但剩下的 0.4KB 是两个 300B 的 304 复验——每个都要
> 付一次完整 RTT。本轮给机关变体与房内字体加**内容寻址 URL**（`?v=<sha1-8>`），服务端对带版本
> 参数的静态文件回 `immutable`，链上同样的两个请求改为直接命中 HTTP 缓存。**链内传输
> 0.45→0.00KB**；链上 PNG 的响应时长 slow3g **435–460→10–16ms**、fast3g **169–181→14–21ms**、
> 4g **92–106→11–18ms**、off **14–21→9–16ms**（≈一个 RTT）。
> 换关→可玩 slow3g 匹配 4 轮 **1729.1→1386.7ms（−342.4ms，−19.8%）**、fast3g
> **A/A′ 中点 1477.1→1297.6ms（−179.5ms，−12.1%）**；4g（B−A′ −44.6ms）与 off（+24.6ms）
> 落在臂内散布内，**不主张收益**。结算窗流量、纹理驻留与页错逐档不变。

## 一、r36 留下的 0.4KB 是两次 RTT，不是两次传输

r36 之后换关链（结算「继续」→ 下一关可玩）只剩机关变体与房内字体的字节。结算窗预热把它们
写进 HTTP 缓存，但二进制 PNG 的服务端策略仍是 `max-age=0` + ETag，所以链上 Phaser 声明时
浏览器必须回源复验：

| 链内 PNG | 传输 | 304 响应时长（A/A′） | 说明 |
|---|---:|---:|---|
| `MechAssets-<id>.png` | 300B | off 14–21ms · 4g 92–106ms · fast3g 169–181ms · slow3g 419–469ms | 每次换关都换变体 |
| `font-roombase.png`（仅变体翻转时） | 300B | 同上 | forest_01→02 特有 |

两个复验**并行**发出，所以链窗的净代价≈一个 RTT：off 约 0，4g 约 90ms，fast3g 约 170ms，
slow3g 约 430ms。前一轮的"链内 0.4KB"在字节账上已经见底，这 0.4KB 的代价全在往返时延上。

## 二、机制：字节变则 URL 变

内容寻址的做法是把文件字节的 sha1 前 8 位放进 URL（`?v=xxxxxxxx`）：

- **客户端**只认清单里的 URL；素材字节一变，清单重算，URL 随之改变。
- **服务端**对匹配 `[?&]v=[0-9a-f]{8}(?:&|$)` 的 URL 回 `Cache-Control: public, max-age=31536000, immutable`。
- URL 不变 ⇒ 字节不变 ⇒ 浏览器可以完全不回源；换关链上的两个 PNG 从此和四份图集 JSON 一样是
  纯缓存命中。

范围只覆盖链关键素材：24 个机关变体的 PNG/JSON（48 文件）＋ `font-roombase.png`、
`font-roomblank.png`、`font.fnt`，共 **51 条**。其余静态资源保持原策略（HTML `no-cache`、
未版本化文本 1 天、未版本化二进制 `max-age=0`），没有放宽任何既有缓存边界。

## 三、实施

| 件 | 内容 |
|---|---|
| 清单生成器 | [`scripts/asset-versions.mjs`](../../../scripts/asset-versions.mjs)：按文件名排序列出 51 个文件，逐个算 sha1 前 8 位，生成 [`packages/client/src/asset-versions.ts`](../../../packages/client/src/asset-versions.ts)（`Record<string,string>`）。`--check` 与现有文件逐字节比对，漂移 exit 1。`dev:client` 与 `build` 都先跑生成器（[`package.json`](../../../package.json)），另设 `asset-versions` 脚本供门禁直调。 |
| 客户端单点 | [`BootScene.ts`](../../../packages/client/src/scenes/BootScene.ts) 新增 `versionedAsset(url)`：清单命中则追加 `?v=`，未登记原样返回。`mechAtlasUrls()` 的 PNG/JSON、`roomFontPng()` 的两把字体 PNG、`FONT_FNT` 全部经它构造。r36 已把 URL 字面量收进这三个函数，本轮只改函数内部——装载与结算窗预热继续同源，URL 构造仍只有一个出处。 |
| 服务端版本感知 | [`staticGz.ts`](../../../packages/server/src/staticGz.ts)：新增 `isVersionedUrl()`（仅 8 位小写十六进制）、`cachePolicy(path, versioned)` 与 `fallbackCachePolicy(path, versioned)`。`express.static` 改 `{cacheControl:false}`，让兜底路径（二进制、<1KB 小文本、>8MB、不协商压缩）也由统一策略写头；压缩路径同样传入 `versioned`。HTML 永远 `no-cache`；未版本化二进制仍 `max-age=0`。 |
| 静态网 | [`asset-versions.test.ts`](../../../packages/client/src/__tests__/asset-versions.test.ts) 4 例：逐条重算 51 个文件的 sha1；覆盖面恰为 48 个机关文件＋3 个字体文件、24 个变体；PNG 与同变体 JSON 哈希不同（防两文件共用一枚哈希）；生成器 `--check` 通过；BootScene 的三个 URL 构造器都走 `versionedAsset`，其他客户端文件不得直接 import 清单。`staticGz.test.ts` 新增 5 例覆盖版本正则、版本化文本/二进制 immutable、HTML no-cache、未版本化二进制 `max-age=0`、以及真实 HTTP 头（含压缩文本带/不带 `v`）。`advance-warm.test.ts` 头部口径改为"版本化 URL＋immutable ⇒ 链上零请求、无 304"。 |

## 四、量具与换臂

量具零改动，沿用 r36 的 `perf-advance`：`FW_DEBUG_FORCE_DOORS=1` + `FW_DEBUG_ARM_WIN=1`
（本关首个可玩帧后才武装判胜）、结算窗静网门（在飞 HTTP=0 且 1.2s 静默、2.5s 最短观察窗、
WS 不计入）、逐资源 chain/post/settle 三窗归类、换关后纹理驻留快照、`--dwell 1200`。

A/B/A 用整包 `dist` 换臂：

| 臂 | 构建 | `index.html` sha1 | 主 JS |
|---|---|---|---|
| A／A′（r36 基线） | `packages/client/dist` r36 | `f8a47781…` | `index-Buz65VGF.js` `bb556d1a…`（105,771B） |
| B（本轮） | r37 | `39dbd392…` | `index-uHFsMKYU.js` `8bc175ac…`（108,853B） |

每臂 2 轮；slow3g 臂 A 2 轮、A′ 4 轮、B 4 轮（与 r36 同法区分会话抖动）。关卡序列
forest_01→02→03→04→05，Δ 以 A/A′ 中点对 B（slow3g 以匹配的 4 轮 A′ 对 B 为主口径）。

## 五、四档 A/B/A

| 档 | 臂A | 臂A′ | 臂B | Δ |
|---|---:|---:|---:|---:|
| fast3g | 1501.6／1341.7（均 1421.7） | 1525.8／1539.1（均 1532.4） | 1392.2／1202.9（均 1297.6） | **−179.5ms（−12.1%）**（对 A/A′ 中点） |
| 4g | 1675.8／1595.6（均 1635.7） | 1488.6／1331.7（均 1410.2） | 1460.8／1270.4（均 1365.6） | 中点 −157.4ms；**B−A′ 仅 −44.6ms** ⇒ 不主张 |
| off | 1192.8／1654.9（均 1423.8） | 1218.6／1197.6（均 1208.1） | 1154.4／1310.9（均 1232.7） | **B−A′ +24.6ms** ⇒ 不主张（预期≈0） |
| slow3g | 1976.2／1646.3（均 1811.3） | 1833.3／1958.8／1625.1／1499.2（均 1729.1，中位 1729.2） | 1521.6／1235.8／1489.9／1299.5（均 1386.7，中位 1394.7） | **−342.4ms（−19.8%）**；中位 −334.5ms |

- **slow3g**：A/A′ 两臂均值差 82.2ms，匹配口径 Δ 是其 4.2 倍；B 四轮全部低于 A′ 四轮中的
  三轮，只有 A′ 最快一轮（1499.2）高于 B 最慢一轮（1521.6）附近。主张成立。
- **fast3g**：B 两轮均低于两臂均值；A/A′ 均值差 110.7ms，Δ 为中点差的 1.6 倍。属于方向性
  证据，不做强主张。
- **4g / off**：臂内散布（4g A/A′ 差 225.5ms；off A 两轮差 462.1ms）远大于预期收益
  （≈90ms／≈0ms），本轮读数与机制一致但不可分离，**不写收益**。

机制与数值互相印证：省下的正好是一个 RTT——slow3g 400ms 档实测 −342ms、fast3g 150ms 档
−180ms、4g 80ms 档 −45~−157ms、off ≈0。

## 六、逐资源账：304 变成了缓存命中

链窗（callAt→bakeStart）逐资源响应时长与传输（多轮汇总）：

| 档 | 臂 | 链内 PNG `d`／传输 | 链内字节 |
|---|---|---|---|
| off | A/A′ | 14–21ms／300B | 0.45KB |
| off | B | **9–16ms／0B** | **0.00KB** |
| 4g | A/A′ | 92–106ms／300B | 0.45KB |
| 4g | B | **11–18ms／0B** | **0.00KB** |
| fast3g | A/A′ | 169–181ms／300B | 0.45KB |
| fast3g | B | **14–21ms／0B** | **0.00KB** |
| slow3g | A/A′ | 419–469ms／300B | 0.38–0.45KB |
| slow3g | B | **10–16ms／0B** | **0.00KB** |

- 臂 A/A′ 每次换关有 1–2 个 300B 的 304：forest_01→02 是机关 PNG＋字体 PNG 两件
  （0.6KB），其余换关只有机关 PNG（0.3KB），均值 0.45KB；slow3g A′ 均 0.38KB。
- 臂 B 的链内条目仍在（8 条 Resource Timing），但传输全为 0：四份图集 JSON、机关变体 JSON
  与 `font.fnt` 是 1 天新鲜期命中，机关/字体 PNG 变成 immutable 命中。**没有 304。**
- 结算窗均值不变：fast3g **1358.0→1357.8KB**、slow3g **690.4→690.3KB**、4g/off **160.3KB**；
  post 窗 fast3g 0.4KB、slow3g 61.4KB、4g/off 122.6KB 也与基线一致。预热流量只是换了缓存
  策略，没有多下或少下字节。
- 代表轮（fast3g B #1，forest_01→02）：结算窗里 `MechAssets-6e517153.png?v=56c795d7`
  11.0KB、`font-roombase.png?v=15fddcdb` 210.1KB，链窗对应 URL 均 0B；#2（forest_02→03）
  结算窗 `MechAssets-84cba11e.png?v=b78c9b90` 95.2KB，链窗 0B。

## 七、驻留、掉帧与页错

- **纹理驻留**（换关落定后 `textures.list` 的 `w·h·4` 总账）：fast3g 63.4→63.4MB、
  4g/off 64.4→64.4MB、slow3g 63.2→63.2MB，逐档持平。版本参数只影响 HTTP 缓存键，
  不建纹理、不增解码画布。
- **链内掉帧**：fast3g B 20 次／峰 244.2ms（A 20／203.0，A′ 17／316.5）；4g B 17／279.7
  （A 26／222.7，A′ 22／226.9）；off B 16／207.8（A 18／212.2，A′ 21／185.7）；slow3g B
  39／1610.1（A′ 48／1034.2）。次数不高于基线，峰值落在会话抖动带内，无新增归因。
- **页错**：fast3g/4g/off 两臂全 0。slow3g 会话出现既有 Phaser
  `TypeError: Cannot read properties of null (reading 'sourceSize')`：A′ 53 条、B 89 条，
  与 r36 两臂同型（r36 A′ 48／B 61），**不是本轮引入**；候选根因仍是换关时旧纹理帧被动画/
  显示对象引用的时序，留作下一轮。

## 八、代价与安全性

| 项 | 结果 |
|---|---|
| 客户端体积 | `index-uHFsMKYU.js` 105,771→**108,853B**（+3,082B，+2.9%），gzip-9 35,932→**36,736B**（+804B，+2.2%）；增量=51 条清单与 URL 构造。HTML 26,141B 大小不变（仅资源名换哈希）。 |
| 构建链 | `build`／`dev:client` 先跑清单生成器；素材替换后若忘了重建，`asset-versions --check` 与单测会失败，不会静默发布旧哈希。 |
| 缓存边界 | 仅带 `v=<8位小写hex>` 的 URL 升为 immutable；其他查询串、非 8 位、含大写十六进制一律走原策略。HTML 恒 `no-cache`；未版本化二进制恒 `max-age=0`；未版本化文本恒 1 天。 |
| 服务端兜底 | `express.static` 关掉自带的 `Cache-Control` 后，小文件/超限/不压缩三条兜底路径都由 `fallbackCachePolicy` 显式写头，`staticGz.test.ts` 用真实 HTTP 响应覆盖了二进制与小文本两条。 |
| 兼容 | 版本参数由服务端正则严格限定；Phaser 的装载键不含查询串，纹理/动画键不变；预取、换关、重开同关的缓存语义不变。 |

## 九、末轮门禁

| 项 | 结果 |
|---|---|
| typecheck | 0 错 |
| build | `index-uHFsMKYU.js` 108,853B／gzip 36,736B；`index.html` 26,141B |
| vitest | **29 文件／313 例**（新增 asset-versions 4 例、staticGz 5 例；304→313） |
| 生成器 `--check` | `shrink-menu-main`／`split-temple-atlas`／`split-char-atlas`／`split-popup-finish`／`split-mech-atlas`／`shrink-popup-main`／`build-slim-atlas`／`reflow-prephase`／`build-font-blank`／`build-dom-skin` 逐字节，`asset-versions` 51 条逐字节 |
| det `--compare r0-baseline` | **48/48 位级一致** |
| fixtures | 6/6 PASS |
| prephase-canvas | 5/5 逐字节（产物换代提示 `index-uHFsMKYU` 与基线同像素） |
| roomtext forest_01／forest_12 | 6/6／5/5 面逐字节 |
| domskin | 4/4 |
| audiofamily（off） | ALL PASS |
| charsplay（off） | ALL PASS（窗口期良性降级 2 条） |
| treebake／groundcache | ALL PASS／ALL PASS |
| journey journey／refresh／wonrefresh／deathretry／rejoin | 7/7 · 3/3 · 6/6 · 4/4 · 3/3 |
| route forest_01／forest_12 | 各 1 轮 won=true（winAt 39,502／12,973ms） |
| regression（zz_probe walkin-doors） | won=true，errors=0，sync=0，缺帧=0 |

## 十、结论

- **收益**：r36 的链内残余 0.4KB 实质是两次 304 的往返。内容寻址后链内传输 **0.45→0.00KB**，
  链上 PNG 响应时长压缩到缓存命中级别（slow3g 435–460→10–16ms），换关→可玩 slow3g
  **−342.4ms（−19.8%）**、fast3g **−179.5ms（−12.1%，方向性）**；4g/off 在散布内不主张。
  收益随 RTT 单调，与"并行两个 304＝一个 RTT"的机制吻合。
- **兼容**：版本参数只覆盖 51 个链关键文件；未版本化资源的缓存策略逐条保持原值；HTML 仍
  no-cache；纹理/动画键与游戏状态不受影响。48 关位级一致、六份 fixture、前场五态、房内文本、
  树烘焙、四条旅程＋advance 旅程、双关路线、回归与十一项生成器复现全部通过。
- **代价**：客户端 +804B gzip；构建链多一步清单生成；素材替换必须重建（测试与 `--check` 兜底）。
- **下一轮候选**：Phaser `sourceSize` 空引用根因（旧纹理帧在动画/显示对象上的引用时序，两臂
  同型、基线既有）；换关落定后 Temple Finish 的保留/释放再账；4g 档需要更多轮次才能判定
  小于 100ms 的收益。素材再编码（任务 #42）仍是用户保留项，未经裁决不动。
