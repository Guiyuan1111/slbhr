# r16 · 进房音频按关卡类型选族装载（2026-10-21）

> 战役第 16 轮。方向从 r15 的"响应头契约"切到**进房段的音频字节构成**：开局一次拉进来的 5 支 BGM
> 里，最多只有 2 支会响。零协议、零像素、零音频内容改动——只改"装哪一支"，不改"怎么解码/怎么播"。
> 对齐的是原版 `preloadAudioFiles` 的既有语义（逆向证据见 §二）。

## 一、量具（三件，`c83c805` + `0496baf` + `58b87f7`）

| 量具 | 能力 |
|---|---|
| `benchmark/perf-load.mjs --level <id>` | 档位可选（默认 forest_01）；点击建房时刻取一次**页内时钟**样本 `cold.clickPerfMs`，据此把进房段按 URL 集合差再切成 **暖装（点击前）/ 点击→Game** 两段，三段分别出 `menuPhaseKB`/`warmPhaseKB`/`postClickKB`；音轨逐条按段落账（`audio.{count,totalKB,menuKB,warmKB,postKB,tracks}`）；对比档新增三段打印与"档位不同则告警"（字节类跨档位不可比） |
| `scripts/e2e/audiofamily.mjs`（新门禁） | forest_01(general)+forest_12(speed) 各 7 项断言：本族两支已入 `cache.audio` 且开局曲**在播**、另一族两支**零缓存 + 零请求**、类型无关件（sfx/over/menu）恒在、页面零错误。缓存面与请求面双向对账，防止"声明了但没下"或"下了但没声明"两种漂移 |
| `benchmark/perf-resident.mjs` 音频探针（勘误修复） | 见 §六条 1 |

## 二、归因（基线 `load-r16-base-f01/f12.json`，`bddd85b` 代码）

件A 前，`AUDIO_GAME` 一支清单不分关卡类型地装 **5 支 BGM**，`GameScene.preload` 与暖装同吃这张表：

| 轨道 | 磁盘字节 | 传输 | 谁在用 |
|---|---|---|---|
| `LevelMusic.mp3` | 1,315,960B | 1285.4KB | 仅 general/puzzle 关（`templeType` 非 speed）开局曲 |
| `LevelMusicFinish.mp3` | 167,617B | 164.0KB | 同族终局曲（`won` 相位） |
| `LevelMusic_speed.mp3` | 109,824B | 107.5KB | 仅 speed 关开局曲 |
| `LevelMusicFinish_speed.mp3` | 70,530B | 69.2KB | 仅 speed 关终局曲 |
| `LevelMusicOver.mp3` | 163,438B | 159.9KB | 失败/超时，与关卡类型无关 |
| `LevelMusic_dark.mp3` | 481,698B | — | **本来就不装**（48 关无 dark 类型），本轮维持不动 |

`temple.json` 类型分布：**general 24 / puzzle 14 / speed 10**（speed = forest_03/06/12/14/16/26 + `_1` 四关）。
即 **38/48 关（79%）在为用不到的 speed 族付 176.7KB，10/48 关在为用不到的 general 族付 1449.4KB**。

原版同题的做法（逆向只读证据，`Fireboy-and-Watergirl` bundle:1887237 `preloadAudioFiles`）：按
`levelData.type` 三选一装 BGM。本轮把这条既有语义补齐，不引入新行为。

风险面先查后改（三条）：`GameScene.sfx()` 对缺键是 `if (!this.cache.audio.exists(key)) return;` 静默返回、
不抛；`sound.stopByKey` 对未装载键无害；Phaser 的 Loader/SoundCache 对已在缓存的键静默跳过零传输。
=> **少装一支族不会炸，最多在族判错时少一支曲子**。

## 三、实施（件A，`ac0516f`）

`packages/client/src/audio.ts` 重写清单结构：`AUDIO_SFX`(13) / `AUDIO_BGM_OVER` / `AUDIO_BGM_GENERAL` /
`AUDIO_BGM_SPEED` 四张表 + `bgmFamilyOf(templeType)` / `bgmPackOf(family)` 两个纯函数，`AUDIO_GAME` 删除。
三处消费点各按族取表：

- `GameScene.preload`：`loadAudioPack(this, bgmPackOf(bgmFamilyOf(this.templeType)))`——`init()` 早于
  `preload()` 执行且同步填好 `templeType`，所以**本关自己那一支族一定在换关淡出窗内补齐**（`create` 前落缓存），
  不存在"进关没音乐"的窗口。
- `BootScene.startBgWarm`（驻留期后台暖装）：`warmBgmFamily` 模块态 + `setWarmBgmFamily(type)`，默认 general。
- `main.ts`：`?level=` 深链场景下 URL 已知但关卡类型未知，用 `predictWarmBgmFamily(urlLevel)` 在
  `loadTempleLevels()` 的 microtask 落地后把族纠正为实际类型——暖装定时器 +120ms 才启动，纠正点在其之前；
  预测错族时 `GameScene.preload` 就是补齐点（代价仅"猜错的一族"，见 §五边界）。

## 四、收益（同机同口径，base→after，两轮均值）

| 指标 | forest_01（general） | forest_12（speed 深链） |
|---|---|---|
| 音轨条数 / 传输 | 19 条 / 2165.3KB → **17 条 / 1988.6KB**（**−176.7KB**） | 20 条 / 2165.3KB → **17 条 / 715.9KB**（**−1449.4KB**） |
| 点击→Game 段传输 | 2873KB → **2697KB**（−176KB，−6.1%） | 2872KB → **1423KB**（**−1449KB，−50.5%**） |
| 冷启动全链累计 | 6927KB → **6751KB**（−2.5%） | 6926KB → **5477KB**（−20.9%） |
| Menu 段 / Menu 请求数 | 4054KB / 21 → 4054KB / 21 | 同（本轮不触及 Menu 面，符合预期） |
| 解码后 PCM 驻留（game 态） | 24.96MB/19 键 → **21.81MB/17 键**（−3.15MB） | 24.96MB/19 键 → **11.44MB/17 键**（**−13.52MB**） |
| 页面错误 | 0 | 0 |

驻留拆解（`resident-r16-*`）与传输一一对得上：general 关少 `bgm_level_speed` 2.53MB + `bgm_finish_speed` 0.63MB
= 3.16MB；speed 关少 `bgm_level` 12.02MB + `bgm_finish` 1.50MB = 13.52MB。

**按关卡类型加权的全量收益**：48 关全逛一遍 = 38×176.7KB + 10×1449.4KB = **20.7MB**，单次进房平均 **≈442KB**。

**诚实边界（三条）**：
1. **不主张任何毫秒**。`Menu active 741.5→745.5`（f01）、`640→782.5`（f12，超噪声带，属跨进程复测漂移，
   本轮无任何 Menu 面改动可解释它，故按噪声处理）、`点击→Game 1323→1274.5`/`1303.5→1248.5` 全部在
   本机 ±120ms 噪声带内。本轮收益口径只有字节。
2. **harness 里"暖装（点击前）"段恒 0KB**：机器人点得太快（点击在页钟 1011ms，暖装 +120ms 才启动），
   暖装字节全落进"点击→Game"段。真人有停留时这些字节本就发生在点击前，进房段本来就不该为它们付费——
   本轮省的是**必然发生在进房路径上**的那部分族字节。
3. **`heapGCMB` 不动**（game 态 22.9→22.9）。Chromium 的 AudioBuffer PCM 记在 JS 堆外，
   所以 −13.52MB 是**WebAudio 持有的解码缓冲**，不是 V8 堆；报告不把它说成堆驻留收益。

## 五、排除的件B 与边界

分析后**不做**：把 `bgm_finish`/`bgm_over`（general 324KB / speed 229KB）从进房路径挪到 `won`/`gameover`
到达再取。理由：弱网下换关/结算时该轨可能真·缺席，用户会听到"通关没音乐"，这是**行为回归**，
而弱网手测本就在挂账里没做——不能拿"自动化门禁全绿"去论证一个测不到的场景。兼容性红线优先于 324KB。

族判错的实际后果：temple.json 若与 `?level=` 深链预测不一致，至多暖装阶段猜错一族，
`GameScene.preload` 在换窗内补齐本族、`sfx()` 缺键静默，**不崩、不静音本关开局曲**（门禁 7 项正向覆盖）。

## 六、勘误与血泪（三条）

1. **`cache.audio` 的枚举入口只有 `getKeys()`**。SoundCache 的账本 `entries` 是 List 包装（own keys 只有
   `entries`/`size`），r14 探针读不存在的 `cache.audio.keys`、第一版修复改成 `Object.keys(entries)` **都恒得 0**，
   于是 r14/r15 的所有驻留报告里 `音 0/2键` 都是仪器伪差。已用页内运行时探针确认 `getKeys()` 返回 17 个键、
   条目是 `AudioBuffer`（`bgm_level`：1,575,383 帧 ×2 声道 ×4B ≈ 12.02MB @48kHz）后修正（`0496baf`）。
   **r14/r15 报告正文没有引用过 audioMB，故无需勘误正文**；旧快照的该字段一律不作数。
2. **门禁不能用 `cache.audio.set()` 注入阳性对照**——Phaser 3.90 SoundCache 没有 `set`，首版据此崩溃。
   阳性对照改为**请求面**断言（`performance.getEntriesByType("resource")` 里本族 URL 有请求、另一族零请求），
   比伪造缓存更贴近"少下载"这件事本身。
3. **A/B 的 `meta.git` 会骗人**：取 base 快照用的是"5 个客户端文件回退 `bddd85b` → 构建 → 测"的手法，
   HEAD 全程是 `ac0516f`，所以 base 快照的 `meta.git` 记的是检出点而非内容提交。已在快照提交信息里写明，
   共用快照对比时先看内容回退记录，别只看 `meta.git`。

## 七、门禁（全绿）

typecheck 0 错、`npm run build` 通过、**vitest 191/191**（18 文件）、**det 48/48 位级一致（对现役基线 r32）**、
**audiofamily ALL PASS（14/14，新门禁首跑）**、treebake 9/9、groundcache 6/6、journey 8 模式全过、
route f01 ALL PASS（winAt 39507ms，带内）、visual-diff **90.07%**（带 90.0–92.9 内）、
perf-client canvas **60.4fps / 1039KB·s⁻¹**（对 r15 的 1042 零帧内回归）、perf-advance 5/5 零网络·链均值 1020.2ms。
页面错误全程 0。

## 八、挂账（r17 起）

- **待用户裁决（不变，面额最大）**：二进制载荷再编码——`font.png` 1600.6KB、图集 PNG 合计 1814.1KB、
  `LevelMusic` 1285.4KB 等 15 个 ≥64KB 未压缩响应 = 6148.5KB（冷启动总传输 88.8%）。触及官方素材像素/听感
  一致性与老浏览器解码面，属兼容性红线，不擅自动手。件A 后 speed 关的这条线只剩 general 族不在路径上，
  general 关的 1285.4KB 开局曲仍是单关最大项。
- **r17 候选（本轮量具已给证据）**：件A 后 speed 关进房段 1423KB 里音频仍占 565.8KB，其中 `LevelMusicOver`
  159.9KB 属"失败才用"，但它与族无关、且件B 同因排除；下一个可动的面是**四张图集 PNG 的分场景装载**
  （temple 态用不到 game 图集，反之亦然）。
- perf-load 的**隧道节流档**（`--rtt`/CDP network emulate）仍未实现：本轮 −1449KB 在 2Mbps 下约合**每次进
  speed 关少等 5.8s**，但这是换算不是实测。
- 既有：真机 GPU 口径 `texMB`/烘焙峰值、`prepareGround/buildGround` 命中计数、换关链剩余 ≈45ms、
  服务端 tick 侧候选、LAN 剪贴板/BGM 听感/真机触屏与弱网手测、M12 相机/shared DTO 拆分。

版本仍 0.3.42（战役轮随 0.3.43 发版一并收口）。总账见 `2026-10-18-campaign-summary.md` §十三。
