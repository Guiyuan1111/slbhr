# r13 · 换关链：下一关地面预取/预烘 + 地面缓存有界化与纹理免重传

日期：2026-10-21　版本基线：0.3.42（`18a54e8`）　量具：`benchmark/perf-advance.mjs`（本轮新建）、`benchmark/perf-alloc.mjs`（本轮新建）

## 一、选题依据（r12 挂账两笔的处置）

r12 收账时留了两笔挂账：①帧内分配剩余 ~1044KB/s 无函数级归因；②换关纹理重传与下一关预取未量化。
本轮先把①钉死，再据结论决定②的做法。

**①函数级归因（新量具 `perf-alloc.mjs`：CDP `HeapProfiler.startSampling` + source-map-js 还原到 TS/vendor 源）**

| 场景 | 渲染器 | 采样窗口 | colyseus | phaser | **app（我方）** | 首位 self |
| --- | --- | --- | --- | --- | --- | --- |
| forest_01 | WebGL | 12.09s | **76.1%** | 19.2% | 2.9% | `onMessageCallback` @colyseus.js/Room.js:155 → 71.1% |
| forest_01 | Canvas | 10.01s | 0% | **97.1%** | 2.1% | `S` @phaser.js:55970（ImageCanvasRenderer 绘制链）→ 65.5% |
| forest_bonus_2 | WebGL | 12.03s | 41.6% | 54.8% | 2.9% | `onMessageCallback` → 41.2%；`e` @phaser.js:31369 → 24.7% |
| forest_bonus_2 | Canvas | 12.02s | 0.7% | **95.3%** | 2.9% | `S` → 52.9%；两处 `get`（Frame/Texture 取帧）→ 12.5%/9.4% |

结论：**我方 app chunk 在四组口径里恒占 2.1–2.9%**，剩余帧内分配全在 colyseus.js 消息回调与
Phaser 渲染器内部——两者都不是"改我方代码"能收的面（要动得改依赖版本或重写渲染管线，属红线级
风险，收益上限 <3%）。故①判为**库内地板**，不再立项；本轮转向②——换关链是用户每次通关都要付、
且完全在我方可控的一段。

**②换关链取证（新量具 `perf-advance.mjs`）**

`FW_DEBUG_FORCE_DOORS=1` 加速通关 → 双页真服实跑 → 直调 `window.__fwNextLevel`（EndMenu「继续」
handler 本体）→ 分段计时：`fetchMs`（/api/level/ 包装）/`bakeMs`（`buildGround` 包装）/
`sceneStopped→sceneStarted→firstRender`/`worstFrame`/`worstGap`。基线（8 次链，dwell 1200ms）：

- 整关地面烘焙 **均值 71.4ms、中位 73ms**，且 8/8 每次都重烘；
- 关卡 JSON 拉取 **35.7ms**，8/8 每次都走网络；
- 换关瞬间**帧间隔掉帧峰 222.7ms**（链内 77 次掉帧）；
- 「点继续 → 新关首帧」总长 **1239.6ms**，其中黑幕包络（FadeScene 500ms×2）设计下界 1000ms，
  即真实链上工作 ≈240ms。

## 二、量具勘误（首版探针四个 bug，全部定谳后才敢用作基线）

1. **帧内口径测不到本轮的卡顿**：关卡构建跑在 `create` 的 loader 回调里，属**帧间任务**，落在
   `prestep→postrender` 窗外。只量帧内会得到 2–11ms 的"无害帧"，而实际表现为 146–182ms 掉帧。
   → 新增 `worstGap`（上一帧 postrender→本帧 postrender）双口径并记，并按 `gapBuild`/`gapAfter`
   分桶；`__hitches` 全程流水再按"链窗内/空闲窗"归位——把开销挪进结算空闲窗的优化，只看链内会
   读成"没变好"。
2. **归档吞掉重帧**：`postrender` 里先置 `__adv=null` 再累计峰值，烘焙重帧落在归档帧之后被吞。
   → 合并为单一处理器，先累计 `worstFrame/worstGap` 再判 `tail≥2` 归档；`firstRender` 取
   `sceneStarted` 的**次帧**。
3. **驱动循环读到陈旧记录**（run#1/#2 数字完全相同）：循环按 `__advLog` 长度 epoch 等待新记录，
   而非固定等待。
4. **双页同调 `__fwNextLevel` 导致目标关归属错乱**：B 端 `currentTempleEntry` 滞后一拍，发出的
   nextId 重复或过期被服务端丢弃，真换关反而来自 B。→ 只驱动 A 端。
5. **预取的 `fetchEnd` 落进下一条记录**（`fetchMs=null / fetchCount=0` 孤儿）：fetch 包装记录
   `owner = W.__adv`，仅当仍属同一记录才写入；`pageErrors` 一并捕获于 context 关闭前。

另有一处**实现级自查**（写测试前发现，未上线即修）：LRU `put()` 可能把刚烘出来、调用方马上要用
的那张 canvas 判为最久未用并逐出（`width=0` → 地面当场变黑）。已加"新条目与正绑定条目不可逐出"
两条保护，并落成单测。

## 三、实施（三件，均为纯客户端改动，零协议、零物理交集）

1. **`packages/client/src/scenes/groundCache.ts`（新建，预算 24MB 的按字节记账 LRU）**
   把原先的"单槽地面缓存"（`{levelId, canvas} | null`）换成按字节记账的 LRU：预算
   `GROUND_CACHE_BUDGET = 24MB`，`canvasBytes = w·h·4`；逐出序为插入序（`Map` 自然序）即
   LRU 触达序，逐出时立刻 `width=height=0` 归还像素缓冲。两条不变量：**正绑定为 `groundTex`
   源的那张不逐出**（否则在用纹理变 0×0）、**刚 put 的新条目不逐出**（否则调用方拿到空 canvas）。
   抽出成独立模块的用意是可单测——`groundCache.test.ts` 6 例覆盖记账、逐出序、两条保护、
   重复键覆盖与容量不足时的行为。
2. **`GameScene` 烘焙与绑定解耦**：原 `buildGround()` 内联的 5-canvas 烘焙链抽为纯静态
   `bakeGroundCanvas(level, textures)`（只读图集与关卡数据，不触场景状态、不碰纹理 manager），
   于是可以在**任何时刻**预烘。新增 `GameScene.prepareGround(levelId, level, textures)` 只填缓存、
   不绑纹理，因此下一关地面不会画进当前关卡。
3. **结算期预取（`packages/client/src/main.ts`）**：`onPhase(won)` 分支在 `openEndMenu()` 之后调
   `prefetchNextLevel()`——延后 500ms（避开 EndMenu 开板与星碑动效）拉下一关 JSON（走既有
   `fetchLevelCached`）并 `prepareGround` 预烘。下一关 id 由新增的 `nextTempleLevelId()` 统一供给，
   与 `__fwNextLevel` 换关共用同一算法（两处若分叉，预烘的就是另一关，等于白烘）。离房
   （`leaveToMenu`）清定时器；预取失败静默（`fetchLevelCached` 自行逐出该键，换关链现拉现烘）。
4. **纹理免重传**：`buildGround()` 改为"取缓存 → 无则烘 → 绑定"。同 canvas 已绑为 `groundTex`
   时**整段跳过** `textures.remove` + `addCanvas`——此前重开同关会重付一次 ≈5MB 全幅
   `texImage2D` 上传（1312×992×4）。

红线自查（跳过 `textures.remove` 会不会毁掉缓存里的 canvas）：Phaser 3.90 `TextureSource.destroy()`
对 canvas 源调 `CanvasPool.remove(image)`，而该方法只把**注册进池**的 canvas 抽成 1×1；本仓库五张
烘焙 canvas 全部 `document.createElement("canvas")`，从不入池 → 像素安全。另由
`scripts/e2e/groundcache.mjs`（本轮从 TEMP 收编为常驻取证件）用像素指纹 + `textures.remove` 计数器在
真机复证（见 §六）。

## 四、收益（dwell 1200ms 档，8 次链同机同口径）

| 指标 | 前 | 后 | Δ |
| --- | --- | --- | --- |
| 烘焙均值 ms | 71.4 | **16.9** | **−76.3%** |
| 烘焙中位 ms | 73.0 | **12.0** | −83.6% |
| 链内网络均值 ms | 35.7 | **0** | −100%（零网络换关 **8/8**） |
| →create 完成 ms | 1138.7 | 949.0 | −16.7% |
| **点继续→可玩帧 ms** | 1239.6 | **1045.0** | **−15.7%** |
| 峰帧均值 / 最大 ms | 7.8 / 13.3 | 3.1 / 5.7 | −60.3% / −57.1% |
| 峰隔（帧间隔）均值 / 最大 ms | 169 / 222.7 | 144 / 198 | −14.8% / −11.1% |
| 链内掉帧次数 / 峰 ms | 77 / 222.7 | 72 / 198 | −6.5% / −11.1% |
| 空闲掉帧次数 / 峰 ms | 210 / 445.7 | 196 / 337.3 | −6.7% / −24.3% |
| 起场后峰隔 ms | 115 | 117.5 | +2.2%（噪声，见 §五） |

读数要点：
- **换关链已逼近设计下界**。黑幕包络 1000ms 是 FadeScene 500ms×2 的固定值，"点继续→可玩帧"
  从 1239.6ms 降到 1045.0ms，意味着链上真实工作从 ≈240ms 压到 ≈45ms——剩余主要是场景创建本身，
  不是烘焙或网络。
- **`bakeMs` 的口径要先说清**：它包的是整段 `buildGround`——缓存未命中＝整幅烘焙，命中＝仅剩
  `remove`+`addCanvas` 的重绑与 ≈5.2MB 上传。本档 8 条链 `fetchCount` 全为 0（JSON 由预取走内存
  缓存），逐条 bake 为 6.3/6.4/7.9/8.2/8.3/12.0/18.4/19.4ms，只有 forest_03 一条 56.3ms；同尺寸
  画幅（八关皆 39×29 格 → canvas 1312×992）排除"面积解释"，而 56.3ms 与该档整幅烘焙下沿
  （before 档最低 57.3ms）相当，故读作该次预取未及落定。探针没有命中标志，这一点只能这样间接判，
  已列为 §七 量具精修项。
- "空闲掉帧"一栏是**开销搬家后的落点**，本就该变重才说明预烘真的在干活；本轮两档都记它，
  是为了不让"链内变好"被读成"整机变好"。

## 五、最坏情况（dwell 120ms＝玩家秒点「继续」，预取尚未起跳）

`r13-prefetch2-fast` vs `r13-before-fast`，同机同口径各 8 次链：

| 指标 | 前 | 后 | Δ |
| --- | --- | --- | --- |
| 烘焙均值 ms | 88.5 | **30.2** | **−65.9%** |
| 烘焙中位 ms | 93.5 | 47.0 | −49.7% |
| 链内网络均值 ms | 80.7 | 56.6 | −29.9% |
| 零网络次数 | 0/8 | 0/8 | —（秒点时预取来不及供 JSON） |
| →create 完成 ms | 1183.3 | 1171.2 | −1.0% |
| **点继续→可玩帧 ms** | 1272.7 | 1266.6 | **−0.5%** |
| 峰帧均值 / 最大 ms | 4.8 / 6.5 | 6.1 / **13.8** | +27.1% / **+112%** |
| 峰隔（帧间隔）均值 / 最大 ms | 165 / 190.5 | 165.5 / 186.5 | +0.3% / −2.1% |
| 链内掉帧次数 / 峰 ms | 86 / 190.5 | 85 / 186.5 | −1.2% / −2.1% |
| 起场后峰隔 ms | 115 | **131.5** | **+14.3%** |
| 空闲掉帧次数 / 峰 ms | 151 / 530.7 | 177 / **667.8** | +17.2% / **+25.8%** |

读数要点：
- **秒点档仍有 −65.9% 烘焙，原因不是"预取抢在前面烘了下一关"**：won 时刻起跳的 500ms 定时器读到的
  `currentTempleEntry` 仍是旧关，算出的 `nextId` 恰是玩家已经在进入的那一关。同一次烘焙只是从链上
  搬进了过场窗口，所以墙钟几乎不动（−0.5%，被 1000ms 黑幕包络淹没），而绝对工作量与峰隔确有改善。
- **搬家的落点必须摊开**：帧内峰 6.5→13.8ms、起场后峰隔 115→131.5ms、空闲掉帧 151→177 次/峰
  530.7→667.8ms。即"秒点＋过场＋新关头 1–2 秒"这段窗口多承担了一次 ≈5.2MB 画布的烘焙。口径是
  headless SwiftShader 软件渲染，真机 GPU 下缩放未知，列为挂账。
- 秒点档 bakeMs 分成两簇（6–10ms 与 47–58ms）；因探针无命中标志，本表只给分布不下"命中/未命中"的
  逐条结论（同 §四 勘误，量具精修见 §七）。

## 六、正确性门禁（最终态复跑）

| 门禁 | 结果 | 与本轮改动的关系 |
| --- | --- | --- |
| `npm run typecheck` | PASS | 还原实现态后复跑 |
| `npm test` | **178/178**（17 文件）PASS | 服务端权威/时序用例零改动 |
| `perf-determinism --compare r0-baseline` | **48/48 关位级一致** | 物理与协议零触碰的直接证据 |
| `journey.mjs journey` | **7/7** PASS | 全链换关 |
| `journey.mjs deathretry` | **4/4** PASS | 同关重开＝缓存命中路径 |
| `journey.mjs refresh` | **3/3** PASS | 同上 |
| `journey.mjs wonrefresh` | **6/6** PASS | won 相位重进结算，预取定时器不参与 |
| `route.mjs forest_03 --repeat 3` | **3/3** PASS（winAt 15045/15049/15059ms） | 墙钟键盘回放 + 真服 |
| `route.mjs forest_02 --repeat 3` | 3/3 FAIL —— **非本轮回归**（判定见下） | — |
| `visual-diff`（两次采样） | 0.9062 / 0.9056 | 新方法学带 0.900–0.929、run-to-run ±2pt → 带内 |
| `perf-client` | Canvas 60.7fps、分配 **1025KB/s**、camZoom 30、setScale 90 | 对 r12 优化后（1044/31/93）帧内零回归 |
| `scripts/e2e/groundcache.mjs`（本轮新增，最终态复跑） | **6/6** PASS | 源 canvas 1312×992；重开后地面像素 hash 297589047→297589047 逐位一致、`textures.remove` 计数 0（免重传路径成立）；负向对照（手动 remove 后计数器 +1）证明计数器活着 |

forest_02 的 FAIL 判定：本轮初跑 3/3 FAIL（`died=gameover @65.2s`，fb=(414,459) wg=(220,445)）后，
先查台账确认它是**用户已裁定的挂起关**（结构性镜面机会上限 ≈95.6%，路线不计绿，见
`note/handoff/archive-2026-10.md`），不应作为门禁；为排除本轮嫌疑另做对照——`git checkout f7dfe6e`
（r13 前）取基线版 `GameScene.ts/main.ts` 重新构建后跑同一路线 3 轮，**同样 3/3 FAIL 且签名逐字相同**
（@65215/65213/65227ms，fb=(414,459) wg=(220,445)）→ 既有状态。对照完毕 `git checkout HEAD --` 还原
（`git status` 两文件 0 处差异）并以实现态重建 dist，复跑 `route.mjs forest_03` 2/2 PASS
（winAt 15049/15060ms，与对照前的 15045/15049/15059ms 同量级）。
**样本报勘**：路线门禁取样不得含 forest_02，本轮改用 forest_03（绿）＋基线对照（证明非回归）。


## 七、残留与挂账

- 内存换时间：预算 24MB ⇒ 常驻 4–5 关地面 canvas（单关 ≈5.2MB），此前单槽 ≈5MB。逐出即刻归还
  像素缓冲，上限有界。真机烘焙内存峰值仍是 0.3.42 起挂账的老账（LAN 剪贴板/BGM 听感同批）。
- 秒点档的开销搬家（不是重复劳动）：`nextId` 在 won 时刻定死，500ms 后定时器起跳时玩家虽已点继续，
  但 `currentTempleEntry` 尚未推进，算出的仍是"链上正要进的那一关"——因此这次烘焙与链上需求同图，
  只把它从链窗挪进了过场窗（表现为 §五 的空闲掉帧 +26%、起场后峰隔 +14.3%）。真正的精修是让预取
  在触发时重算 `nextTempleLevelId` 并与 `currentTempleEntry` 比对，避免已过场时白烘；本轮不做。
- 量具精修：`bakeMs` 覆盖整段 `buildGround`，而 `prepareGround` 的预烘不落任何计数器（只体现在
  `hitchIdle`），探针又无命中标志 → §四/§五 的 bake 分布只能间接判命中。下轮给 `prepareGround`
  与 `buildGround` 各加 hit/miss 计数，把"均值下降"读成"命中率"。
- 真机口径缺口：本轮全部数字出自 headless SwiftShader（软件渲染）。纹理上传与烘焙在真机 GPU 上的
  占比会更低，秒点档的搬家代价同样会缩水——与既有的"真机烘焙内存峰值/BGM 听感/LAN 剪贴板"同批挂账。
- 帧内分配剩余 <3% 在我方，其余为 colyseus.js / Phaser 内部；再压需动依赖或管线，红线风险 > 收益。
- 换关链剩余 ≈45ms（超出黑幕下界部分）主要是 Game 场景创建与图集取用，非烘焙/网络。

## 八、一句话总账

帧内分配判至库内地板（我方仅 2.1–2.9%）后，本轮收在用户每次都付、且完全可控的换关链上：
地面烘焙 71.4→16.9ms、链内网络 35.7→0ms（8/8 零网络）、点继续→可玩帧 1239.6→1045ms（−15.7%，
已逼近 1000ms 黑幕下界）；秒点档墙钟不劣化（−0.5%，峰隔 −2.1%），代价是把一次烘焙搬进过场窗
（软件渲染口径下空闲掉帧 +26%，真机口径挂账）。物理与协议零触碰（det 48/48 位级一致、178 例
单测与 journey/retry/refresh 全绿、地面像素逐位一致）。
