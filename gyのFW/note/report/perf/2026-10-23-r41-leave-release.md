# r41：离房交还房内独占资源（大厅纹理 −10.52MiB、音频 PCM −14.99MB）

> 日期：2026-10-23 · 版本线：0.3.43 · 量具：`benchmark/perf-resident.mjs`（驻留 A/B/A）、
> [`benchmark/perf-reentry.mjs`](../../../benchmark/perf-reentry.mjs)（本轮新建，离房→重进代价）、
> [`benchmark/load-ab-era.sh`](../../../benchmark/load-ab-era.sh)（换臂台）、
> [`leave-release.test.ts`](../../../packages/client/src/__tests__/leave-release.test.ts)（9 例静态网）。
>
> 结果：大厅（Temple 选关态）纹理 **53.35→42.83MB（−10.52）**、音频 **21.81→6.82MB（−14.99，键 17→14）**；
> Menu / Temple 首入 / Game 三态与 A 臂逐项相同（32.03 / 42.27 / 51.79MB，音频 6.82 / 6.82 / 21.81MB）。
> 重进代价：可玩时刻 off 档 **+79.0ms**（A 臂内散布 212.5ms、B 臂 175.9ms）→ 不作差异主张；
> slow3g **+155.5ms**（A 臂均值带 181.3ms）→ 同样在带内。字体在 preload 门内恢复；
> 结算变体与 3 支关卡 BGM 在可玩后 **0.16/0.25s（off 均值）**、**0.50s（slow3g）** 恢复。
> 重进线上增量仅 **+0.3KB**（字体 PNG 走 immutable 缓存 0 传输、BGM 走内存缓存 0 传输）；
> 冷启动首进字节 **5220KB／6952KB 逐项不变**。

## 一、为什么：房内独占资源一直留在大厅

`leaveToMenu` 原本只交还 Temple 结算图集（r34），而三组只在房间内使用的资源仍常驻：

| 资源 | 键 | 驻留 | 消费点 | 大厅是否需要 |
|---|---:|---:|---|---|
| 房内字体（两变体互斥） | `font-full`（教学 2 关，114 字）／`font-room`（其余 46 关，27 字） | 8.56MiB（8,974,336B） | 时钟、教学文本、暂停/失败/结算三面板；`GameScene` preload 由 `roomFontKey(level)` 二选一 | 否（大厅用 `font-main`） |
| 结算板变体（三张互斥） | `popup-finish-general`／`-speed`／`-puzzle` | 1.97MiB | 只在结算板出现；`kickPopupFinish` 在 create 后按关卡类型装载 | 否 |
| 关卡 BGM（5 键） | `bgm_level`／`bgm_level_speed`／`bgm_finish`／`bgm_finish_speed`／`bgm_over` | 14.99MB PCM（12.02＋1.50＋1.46 + 两个 speed 变体） | 游玩/终局；GameScene SHUTDOWN 已显式 stop | 否（大厅保留 `bgm_menu` 3.48MB＋13 支 SFX） |

这些资源都满足同一个生命周期条件：**房内独占、互斥变体、重进有既有装载点**。
字体在 `GameScene.preload` 的门内重装（原本进房就装，单人也走到）；结算变体与 BGM 在
`create` 之后的 kick 里重取（r25/r29 已把它们移出落定门）。因此交还不会新增装载时机，
只是把"房间关掉后仍抱着"改成"下次进房按原路径再取"。

## 二、实施

| 件 | 内容 |
|---|---|
| 音频 | [`audio.ts`](../../../packages/client/src/audio.ts) 增 `GAME_BGM_KEYS`（5 键）与 `releaseGameBgms(sound, cache)`：逐键先 `sound.removeByKey` 再 `cache.remove`。顺序不能反——Phaser 3.90 的 `WebAudioSound.destroy()` 要先把 `audioBuffer` 置空并断开节点，先删缓存会让仍挂着的实例失去底座。 |
| 纹理 | [`GameScene.ts`](../../../packages/client/src/scenes/GameScene.ts) 增 `releaseRoomFont(textures)`／`releasePopupFinish(textures)`：两变体/三变体逐个 `exists` 后卫 `textures.remove`。与既有 `releaseTempleFinish` 并列，都是静态纯函数，便于静态网钉调用点。 |
| 接线 | [`main.ts`](../../../packages/client/src/main.ts) 的 `leaveToMenu` 在停 Game、切 Temple 前依次调用 `releaseTempleFinish → releaseRoomFont → releasePopupFinish → releaseGameBgms`，随后才 `sm.start("Temple")`。顺序保证 Temple 首帧前大厅已回到基线。 |
| 重装 | 不加新时机：字体仍由 `BootScene.loadRoomFont` 在 `GameScene.preload` 装；结算仍由 `kickPopupFinish`；BGM 仍由 `kickBgmLoop`/`kickBgmTerminal` 在 create 后取。原有 `sfx()` 的 `cache.audio.exists` 卫保证 kick 未落时静音而不抛错。 |
| 静态网 | [`leave-release.test.ts`](../../../packages/client/src/__tests__/leave-release.test.ts) 9 例：调用顺序、单一离房入口、`GAME_BGM_KEYS` 恰为 SHUTDOWN stop 列表减去 `bgm_menu`/SFX、大厅零消费、`removeByKey` 先于 `cache.remove`、两处重装声明存在、`FINISH_ATLAS_KEYS` 三项、create 后 kick、Temple 离房不误伤大厅资源。 |

**为什么不会把结算动画的绑定弄脏（r39 的教训）**：`finish_stone_*` 动画在 create 时已把帧解析成
具体 Frame；但本轮交还发生在**结算板已关闭、Game 场景已停**之后，下一次进房 `EndMenu.create`
会重新 `buildFinishAnims` 并在注册前摘旧键（r39 修复）。字体同理：`roomFont` 每次进房重新取，
BitmapText 对象随场景销毁，不存在跨场景缓存。静态网把"唯一入口"和"大厅零消费"都钉死，
将来若有人在大厅引用这些键会直接红。

## 三、驻留 A/B/A

臂 A/C＝r41 前源码（`2c5b6f2`），臂 B＝现役。三份快照 `resident-r41-resident-{a,b,a2}.json`；

| 态 | 臂 A 纹/音/键 | 臂 B 纹/音/键 | A2 纹/音/键 | 结论 |
|---|---|---|---|---|
| menu（暖装落定） | 32.03 / 6.82 / 14 | 32.03 / 6.82 / 14 | 32.03 / 6.82 / 14 | 相同 |
| temple 首入（冷烘） | 42.27 / 6.82 / 14 | 42.27 / 6.82 / 14 | 42.27 / 6.82 / 14 | 相同 |
| game（开局静止） | 51.79 / 21.81 / 17 | 51.79 / 21.81 / 17 | 51.79 / 21.81 / 17 | 相同 |
| **temple 离房后（冷烘）** | **53.35 / 21.81 / 17** | **42.83 / 6.82 / 14** | **53.35 / 21.81 / 17** | **−10.52 / −14.99** |

- 纹理差额：`font-full` **8.56** ＋ `popup-finish-general` **1.97** ＝ 10.53MiB（快照四舍五入后差 10.52）。
- 音频差额：`bgm_level` **12.02** ＋ `bgm_finish` **1.50** ＋ `bgm_over` **1.46** ＝ 14.98MB（快照差 14.99）。
- `heapGCMB`：大厅 A **24.0/24.1**、B **23.9**——纹理与 PCM 不在 JS 堆内，驻留收益按解码字节记账，
  不体现在 GC 后堆值；`churnMB` 35.8 vs 36.4/21.9（冷烘流水，随机波动），`peakJobMB` 11.97 三臂相同。
- 大厅剩余 42.83MB 里最大项是 `chars-play` 10.75、`chars` 5.07、`TempleHall` 4.00、树结果 10.24；
  本轮不动这些，大厅与房间共用的部分保持原样。

## 四、重进代价（本轮新量具）

`perf-reentry` 用单人房测：`phase=started` 需要双人到齐，而字体 preload、结算/BGM kick 都与 phase 无关；
单人可避开 slow3g 下第二个页面的带宽竞争。流程：进房 → 等延迟装载落定 → 离房回大厅 → 真实点击
`#btn-create` 重进 → 记录 `t0` 后各资源的首次出现/播放时刻与页内快照。

**量具修正**：首版在首进后只等 2.5s 就离房，slow3g 下 `LevelMusic`（1.28MB，≈20s）尚未落定，
cycle 1 量到的是"半装房间"（初始缺 `bgm_level`、纹理缺 `chars-play`，交还标记被在飞请求搅乱）。
现改为：等字体＋结算＋循环 BGM＋终局 BGM 全部在缓存后，再静置 1.2s 才拍基线；
首轮 slow3g 快照因此作废，下表全部用修正后的口径重跑。

### 可玩时刻（点击→Game active，ms）

| 档 | 轮次/臂 | Ā1 | B̄ | Ā2 | Δ＝B̄−mid(Ā) | A 带 | B 散布 | 判定 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| off | 4 | 831.7（散布 212.5） | 939.0（175.9） | 888.3（46.2） | **+79.0** | 56.7（|Ā1−Ā2|） | 175.9 | Δ超带但＜臂 B 散布与 A 臂内散布 ⇒ 不足判定 |
| slow3g | 2 | 1672.7（234.2） | 1918.9（85.5） | 1854.0（178.6） | **+155.5** | 181.3 | 85.5 | Δ＜A 带 ⇒ 不主张 |

逐轮：off B 897.2/934.1/874.4/1050.3 对 A1 877.4/955.9/750.0/743.4、A2 872.0/904.9/865.1/911.3；
slow3g B 1961.6/1876.1 对 A1 1789.8/1555.6、A2 1943.3/1764.7。B 的方向偏慢：off 的 +79.0ms 超出
|Ā1−Ā2| 带 56.7ms，但小于臂 B 自身散布 175.9ms 与 A 臂内散布 212.5ms；slow3g 的 +155.5ms 则在 A 带内。
按 r40 起的三闸门口径**不足判定为回归**，也不主张时序收益；能确定的是重进多做了字体解码
（8.56MB 纹理）与结算/BGM 重取，其可见代价是结算/BGM 比可玩晚 0.16–0.50s。

### 复原时刻（相对可玩时刻，ms）

| 资源 | off B（4 轮均值） | slow3g B（2 轮均值） | A 臂 |
|---|---:|---:|---|
| 房内字体 | **0**（与 Game active 同刻，preload 门内） | **0** | 点击前已常驻 |
| 结算变体 | **+164.3**（152.7–178.4） | **+502.4**（473.6–531.1） | 点击前已常驻 |
| 关卡 BGM 开始播放 | **+246.6**（178.4–294.2） | **+502.4** | 点击前已常驻 |

- 复原结果：每轮结束页内 **62.03MB／21.81MB／17 键**，字体、结算、BGM 三组标记全 true，
  与 A 臂的房内态逐项相同；9 份重进快照 `errors=[]`、`ok=true`。
- 线上增量：重进窗口 **A 0.8KB → B 1.1KB（+0.3KB）**。B 的字体 `font-roomblank.png` 解码 777KB
  但 `transferSize=0`（immutable 命中）；`PopupFinishGeneral.png` 走 304 再确认（0.3KB）；
  `LevelMusic*` 三件解码 1285.1＋159.6＋163.7KB 全为内存缓存命中（0 传输）。
- 冷启动未变：两臂首进 `totalTransferKB=5220`、`totalDecodedKB=6952`，初始态 51.79/21.81/17。

## 五、客户端字节

| 代 | 入口 | raw | gzip-9 | brotli-11 |
|---|---|---:|---:|---:|
| A（r41 前） | `index-CFDkosYR.js` | 109,237B | 36,904B | 31,910B |
| B（现役） | `index-lL2vswjt.js` | 109,635B | 37,017B | 31,927B |
| Δ | — | **+398B** | **+113B** | **+17B** |

增量来自 4 个文件的新函数/常量/import 与注释；Node zlib，level 9／quality 11（与 r39/r40 同口径）。

## 六、兼容与边界

- **释放只在离房**：`leaveToMenu` 是唯一入口；Game 场景活跃期间纹理/音频仍完整，动画帧绑定不受影响。
  将来新增"房间内清资源"路径必须同时处理 r39 的动画重绑问题，静态网会拦住大厅消费。
- **重装窗口合法**：结算变体与 BGM 在可玩后 0.16–0.50s 才回来。结算板要等到通关/失败才出现，
  BGM 的缺失由 `sfx()` 的 exists 卫降级为静音而非异常；字体在门内恢复，HUD/教学不会缺字。
- **单人与双人**：本轮代价量具为单人房。双人重进会多一个加入页的请求，但资源是本页缓存/内存命中，
  不改变释放语义；既有 `journey rejoin/refresh/wonrefresh` 门禁覆盖双人座位路径。
- **大厅音频**：只释放 5 支关卡 BGM；`bgm_menu` 与 13 支 SFX 原样保留，`leaveToMenu` 里菜单曲仍在播。

## 七、末轮门禁

| 项 | 结果 |
|---|---|
| typecheck | 0 错 |
| `asset-versions --check` | 51 条逐字节一致 |
| `shrink-ground-atlas --check` | 两件逐字节（634×584，151 真帧／192 别名） |
| `build-slim-atlas --check` | 四张 Slim 逐字节 |
| `split-char-atlas --check` | 六件逐字节（53+7+182 帧） |
| `split-temple-atlas --check` | 四件逐字节（Core 14＋46 别名／Finish 42 帧） |
| `split-popup-finish --check` | 六件逐字节 |
| `split-mech-atlas --check` | 24 变体逐字节 |
| `shrink-menu-main --check` | 两件逐字节 |
| `shrink-popup-main --check` | 两件逐字节 |
| `reflow-prephase --check` | png／fnt 字节一致 |
| `build-font-blank --check` | 两变体 PASS |
| `build-dom-skin --check` | 字节一致 |
| build | `index-lL2vswjt.js` 109,635B／gzip 37,017B |
| vitest | 32 文件/339 例全绿（含 leave-release 9 例） |
| det `--compare r0-baseline` | 48/48 位级一致 |
| fixtures | 6/6 PASS（oracle-gold maxDev 142.6879） |
| prephase-canvas | 5/5 PASS |
| roomtext forest_01／forest_12 | 6/6／5/5 面逐字节 |
| domskin | 4/4 |
| audiofamily／charsplay | ALL PASS |
| treebake／groundcache | ALL PASS |
| journey | journey 7/7 · refresh 3/3 · wonrefresh 6/6 · deathretry 4/4 · rejoin 3/3 |
| route forest_01／forest_12 | 各 1 轮 won（winAt 39,567ms／12,987ms） |
| regression（zz_probe walkin-doors） | won=true，errors=0，sync=0，缺帧=0 |
| tilesprite forest_01／forest_24 | 1/1＋1/1、8/8 对象 PASS；私有画布 1×1 |
| finish-anims | 8/8（general 变体重载、星碑动画、继续换关、全程 0 页错） |
| 重进门禁 | off 4 轮×2 臂、slow3g 2 轮×2 臂，9 份快照 `errors=[]`，复原全 true |

门禁维护：`GameScene.ts` 因新增两个静态释放函数行数 +13，`scripts/font-subset/room.mjs` 的时钟两钉
1627→1640、1665→1678，`font-roomblank.test.ts` 的 PARAMETERISED 1527→1540（逐行核对内容未变）。

## 八、结论

- **收益**：大厅驻留 **−10.52MiB 纹理 −14.99MB PCM**，Menu/Temple/Game 三态与首进字节完全不变；
  重进线上只多 **0.3KB**，字体在门内恢复，结算/BGM 在可玩后 0.16–0.50s 内恢复。
- **代价**：可玩时刻 off +79.0ms、slow3g +155.5ms，均未超出 A 臂漂移带（212.5／181.3ms），
  不作回归主张，也不主张时序收益；客户端 +398B raw／+113B gzip。
- **兼容**：释放只在 `leaveToMenu`，进房装载点全部沿用；9 例静态网钉死单一入口、键集合与
  大厅零消费；全套门禁与双人旅程/重连路径全绿。
- **边界**：单人房代价口径；若后续把释放扩展到房间内（而非离房），必须同时处理 r39 的
  动画帧重绑或提供失效钩子。
- **下一轮候选**：`chars-play`（10.75MB）常驻面的按需收缩、`groundTex` 4.96MB 逐关画布释放口径、
  Temple Finish 保留/释放再账；4g 档小于 100ms 的收益需更多轮次。素材再编码（任务 #42）
  仍是用户保留项，未经裁决不动。
