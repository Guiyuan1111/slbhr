# r21 · 把关卡循环曲搬出落定门（2026-10-22）

口径与判据沿用 r20：里程碑只有两个——冷启动 `Menu active` 与**点击建房→`Game active`**；
弱网档里这两段都是**字节账的函数**（r20 §四/§七：闸前富余只有 13.4%/8.0%/5.1%，
每 KB 的价签 4g 2.048ms、fast3g 5.12ms、slow3g 16.384ms）。所以本轮不打算"提示"任何东西，
只做一件字节账上成立的事：**把一笔 1285.4KB 的字节从"挡进房"改成"不挡进房"**。

臂序为 A/B/A（臂C 是臂A 的同代复测，用来框住本机漂移），三臂同档位、同机、同一时间窗；
跨臂 ms 差只有超出同臂带才算差异（带实测见下表，r20 §五之一立的方法）。

## 一、动的是哪一段：进房段里最大的一笔

进房路径在切场景前有一道落定门：`main.ts:451` 的 `await bgWarmSettled()`——
Menu 驻留期的后台暖装（`MenuScene.ts:167` 触发 `BootScene.startBgWarm`）还没落完时，
建房点击会等它，等的是**整批**而不是本关用得到的那几支。

改前那一批在 4g 档跑进房快照时的构成（臂A，round1，`点击→Game` 段合计 **4636.0KB**）：

| 字节 | 条目 | 占进房段 | 首帧是否用得到 |
| --- | --- | --- | --- |
| 1600.6KB | `/assets/fonts/chinese/font.png` | 34.5% | 用得到（HUD/结算文字） |
| **1285.4KB** | `/assets/audio/s/LevelMusic` | **27.7%** | **用不到**：开局曲要到 ready 之后才播 |
| 472.8KB | `atlasses/MechAssets.png` | 10.2% | 用得到 |
| 334.4KB | `atlasses/PopupAssets.png` | 7.2% | 用得到（暂停钮 create 即建） |
| 281.1KB | `Temples/forest/TempleAssets.png` | 6.1% | 用得到 |
| 164.0KB | `/assets/audio/s/LevelMusicFinish` | 3.5% | 见下文（回座同帧要播） |
| 159.9KB | `/assets/audio/s/LevelMusicOver` | 3.4% | 见下文（死亡回声） |
| 93.0KB | `atlasses/GroundAssets.png` | 2.0% | 用得到 |
| ≈245KB | 13 支 sfx | 5.3% | 用得到（首次跳跃即要出声） |

最大两块（`font.png` + `LevelMusic`）占掉该段 **62.3%**，而且共用同一条已饱和的管道——
所以动其中任何一块，另一块以及所有条目都会跟着提前落定。`font.png` 属素材侧（41 号档
缺字形裁决未结，本轮不碰），能动的就是 `LevelMusic` 这一笔。

## 二、实施：循环曲分成"门内"与"门后"两批

三处改动，全部在源码侧，零素材二进制改动：

1. `packages/client/src/audio.ts:79/85`：在既有 `bgmPackOf` 旁加两个声明式切片
   `bgmLoopOf`（`bgm_level` / `bgm_level_speed`）与 `bgmFinishOf`（`bgm_finish` /
   `bgm_finish_speed`），把"一族两支"拆成"循环曲"与"终局曲"两个可分别调度的批。
2. `packages/client/src/scenes/BootScene.ts:104-121`：暖装门内批改为
   `AUDIO_SFX + AUDIO_BGM_OVER + bgmFinishOf(...)`；`load` 的 `complete` 之后
   再挂一个 `delayedCall(1500, thenLoop)` 追取 `bgmLoopOf(...)`，`thenLoop` 先查
   `scene.sys.isActive()`——Menu 已被切走（含切场瞬间竞态）就什么都不做，交给 Game 侧兜底。
   **1500ms 这个节拍是收益成立的前提**：定时器若在落定门之前起,快进路径上循环曲会和
   门内批挤同一条管道,搬运就不发生了（第一版正是这么写的，量之前自己发现并改掉）。
3. `packages/client/src/scenes/GameScene.ts:327` 的 `preload` 兜底声明只留 `bgmFinishOf`；
   `create` 末尾（`GameScene.ts:480`）新增 `kickBgmLoop()`：缓存里已有则直接返回，
   否则入队 `bgmLoopOf` 并 `this.load.start()`，用 `load.once("complete", catchUp)` 补起
   create 那一次没成功的播放。`catchUp` 的守卫逐字对齐 create 的调用条件——
   楼梯已播完（`stairsPlayed`）、`bgm_over` 与终局曲都没在播、本关开局曲未在播——
   并在 `SHUTDOWN` 上 `this.load.off("complete", catchUp)`：LoaderPlugin 跨场景重启是
   复用的（`shutdown` 只清队列），`once` 句柄不摘会在下一次重启时被陈旧回调命中。

留在门内的两支是有理由的：`LevelMusicFinish`（164.0KB）在 won 回座时与 `create` **同帧**播放
（`main.ts` 尾部的 L-02 补开结算路径），搬出去就是"结算板已出、终局曲哑"；`LevelMusicOver`
（159.9KB）是死亡回声。13 支 sfx 更是一条都不能搬——首次跳跃落在哪一帧无法预知，
Phaser 的 `sfx()` 对未入缓存的键是**静默跳过**，搬走的代价是玩家第一次跳跃没声音。

## 三、四档 A/B/A 实测：和 r20 的单价表对得上（误差 ≤1.8%）

`点击建房 → Game active`（ms，两轮均值；Δ 为臂A/臂C 均值 − 臂B）：

| 档位 | 臂A 改前 | 臂C 改前复测 | 同臂带 | 臂B 改后 | Δ 实测 | Δ/带 | 预测 Δ（1285.4KB×价签） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4g | 10505 | 10478 | 27 | **7813.5** | **−2678** | 99× | −2632 |
| fast3g | 24845 | 24748 | 97 | **18332** | **−6465** | 66× | −6581 |
| slow3g | 78607.5 | 78726 | 118.5 | **57218.5** | **−21448** | 181× | −21060 |
| off（不节流） | 1427 | 1318 | 109 | 1566 | **+193** | 1.8×（带内） | 0 |

- 三个弱网档的收益是**同臂漂移带的 66–181 倍**，且与 r20 §六 的每 KB 价签吻合到 1.8% 以内——
  这不是新预测被蒙对，而是"进房段按字节计价"这条归因律第三次独立复现（r20 用它判退了预取件）。
- 字节账同步坐实：到 `Game active` 的累计传输 **7076KB → 5791KB**（−1285KB，正好是循环曲那一笔），
  进房段 **4636KB → 3350KB**；请求数 19 → 19（循环曲的请求落在快照之后，不多一次也不少一次）；
  双载列 `doubleDownloads` 三臂全空，条件复验 7061.2KB→**0KB**（没引入任何整份重下）。
- **off 档是"带内、无收益也无回归"**：本机不节流时 1285.4KB 只要 7ms（臂B 快照里循环曲
  完成时刻仅比进房早 34/32ms），搬运在时间上根本不值钱，+193ms 落在 r20 测得的 off 同臂带
  （103–330ms）之内。历轮口径（off 档判"有无回归"）不被本轮破坏。

`Menu active` 里程碑三档全部不动（4g 5746→5788、fast3g 13569→13544、slow3g 42103.5→42139），
符合预期：本轮只挪进房段，不碰冷启动首屏。

## 四、代价侧：字节没有消失，只是不再挡门

搬运不是免费午餐——那 1285.4KB 还是要下，只是下在里程碑之后。用页内 `performance.now()`
单钟取证（r20 §七 的教训：跨 clickPerf 的比较一律先归一到页钟），同一档位跑改前/改后各一遍：

| 4g 路径 | 进房时刻（页钟） | 循环曲就绪时刻 | 出声时刻 | "进房且有声"端到端 |
| --- | --- | --- | --- | --- |
| 快进（停 0s）**改前** | 16800 | 16055（进房前 745ms） | 16800 | 16800 |
| 快进（停 0s）**改后** | **14090** | 16839（进房后 **2749ms**） | 16839 | 16839（+39ms） |
| 驻留 14s 再建房 **改前** | 21772 | 进房前已就绪 | 21772（同刻） | 21772 |
| 驻留 14s 再建房 **改后** | 21767 | 21042（进房前 725ms） | 21767（**同刻**） | 21767 |

读法：

- **快进路径**：可玩时刻提前 2710ms，代价是进房后有 **2.7s 的无声窗口**（曲在 13876ms 起请求、
  16671ms 落，随后 `catchUp` 立刻补播）。端到端"进房且有声"只挪了 **+39ms**——
  管道饱和时字节守恒，这正是 r20 归因律的形状：把字节从门内搬到门外，换来的正是门外那一段
  不再等它。弱网下"早 2.7s 能操作"与"早 2.7s 有 BGM"只能选一个，本轮选择前者。
- **驻留路径（正常玩法）不受影响**：只要玩家在 Menu 停到门内批落定 +1500ms，`thenLoop`
  就已经把循环曲取完，进房即有声——4g 驻留 14s 的进房耗时 1741ms（改前同路径 1782ms）、
  出声与进房同帧；off 驻留 6s 的进房 995ms、曲早 639ms 就绪。两条路径都没有回归。
- 页面错误：四档 12 份快照 + 探针共 26 次导航全部为 0。

## 五、量具与判据（本轮新增两列）

`benchmark/perf-load.mjs` 加一条**通过条件**而不是读数：
`loopDeferred`——本关循环曲（`/s/LevelMusic` 或 `/s/LevelMusic_speed`，锚定结尾故不会误取
Finish/Over）要么在进房快照里整条缺席（还在飞），要么完成时刻晚于进房时刻。
12 份快照回放的实际输出：

```
4g-a 门内 −979ms | 4g-c 门内 −983ms     4g-b 门外（快照时还在飞）
fast3g-a 门内 −1362ms | −1306ms         fast3g-b 门外（快照时还在飞）
slow3g-a 门内 −2629ms | −2667ms         slow3g-b 门外（快照时还在飞）
off-a 门内 −1370ms                       off-b 门内 −34ms（临界，见下）
```

- 改后弱网三档一律"门外"，改前两档一律"门内且早 1.0–2.7s"——判据的方向与 ms 表完全一致。
- `off-b` 读 −34ms：**不是**"没搬出去"，而是搬运在本地速度下与进房同时完成。这一列只回答
  "循环曲还挡不挡门"，不回答"省了多少"，读数时别混。
- 顺手证伪一条自己写错的假设：原先以为"快照时仍在飞"会留下 `responseEnd=0` 的 pending 条目，
  实测音轨走 **XHR，Resource Timing 只在请求完成时才入表**，所以表现是整条缺席而非 pending
  （12 份快照 `pendingCount` 恒为 0）。`pending` 列保留给 img/script 等非 XHR 条目，
  但循环曲这类音轨的取证只能靠"快照里根本没有"。
- `benchmark/load-ab-era.sh` 的备份/恢复改成**保路径**（`$BK/<原相对路径>`），收尾核验
  `$FILES` 与 HEAD 逐字节一致；旧写法把三个文件拍平进一个目录，恢复时会把
  `scenes/BootScene.ts`、`scenes/GameScene.ts` 顶到 `src/` 根上——本轮开测前修掉（`b65279d`）。

## 六、门禁（末轮套件，全部按退出码 / ALL PASS 判定）

| 门禁 | 结果 |
| --- | --- |
| `npm run typecheck` | RC=0，0 错 |
| `npm run test`（vitest） | RC=0，19 文件 / **203 用例**全过（58.1s） |
| `npm run build` | ✓ 4.54s，dist 入口 `index-DO17UCYQ.js`（sha256 前缀 `5df20450e964f6da`）——**就是 A/B/A 臂B 被实测的那份产物** |
| 确定性门禁 `perf-determinism --compare r32` | ✓ **48/48 关位级一致**（物理/协议面本轮零改动，仍照跑） |
| `rel="preload"` 计数 | 源码 0 处、dist 0 处（r20 判退的预取件没有残留） |
| audiofamily | **14/14**：forest_01 `playing=bgm_level`、forest_12 `playing=bgm_level_speed`（都是延迟批兜底后真在播），另一族两支零缓存＋零请求，audio 请求 17 条 |
| journey | refresh 3/3 · wonrefresh 6/6 · deathretry 4/4 · rejoin 3/3 |
| route（全自动通关） | forest_01 won（winAt 39538ms）· **forest_12 won（winAt 13470ms）**——speed 族真通关，终局曲/结算路径未被破坏 |
| 逐像素 | prephase-canvas ALL PASS · domskin ALL PASS（4/4）· treebake 金样一致 · groundcache ALL PASS |
| 生成器 | `reflow-prephase --check` RC=0（png/fnt 字节可复现）· `png-opt --check` RC=0（面额 147.6KB，写盘 0）· `build-font-prephase --check` **RC=1（r19 换代护栏，设计内拒绝）** |
| 阴性对照 | `FW_NET_NOOP=1` 仍按设计抛"节流档位静默失效"，RC=1 |
| 传输面 | `doubleDownloads` 三臂全空 · 条件复验 7061.2KB→**0KB** · 四档 12 快照 + 4 次探针 + e2e 全程**页面错误 0** |

## 七、剩余面额与下一轮

搬运已经搬到边际：门内 3329.6KB（4g 臂B）的构成是 `font.png` 1600.6KB（**48%，素材侧**）＋
四张首帧图集 1181.4KB ＋ 出声不可延迟的 sfx/终局曲/失败曲 487.6KB。代码侧还能再搬的只有
`LevelMusicFinish`+`LevelMusicOver` 这 323.9KB（4g −663ms / fast3g −1658ms / slow3g −5307ms），
但代价分别是"won 回座时终局曲哑"和"开局 3s 内死亡则失败回声哑"——本轮不再往里走，等这条
代价由用户裁定是否可接受。sfx 那 245KB 判退：Phaser 对未入缓存的键是静默跳过，搬走就是
玩家第一次跳跃没声音。

- **待用户裁决（面额最大，三条都在素材侧）**：①`png-opt --apply` 无损重编 14 个 PNG **−147.6KB**
  （4g −303ms / fast3g −756ms / slow3g −2421ms）；②`font.png` 按需子集 ↔ [41 号档](../research/2026-10-fidelity/41-chinese-font-glyph-coverage.md)
  22 个缺字形（G1/G2/G2′）；③官方 mp3 再编码——`LevelMusic` 1285.4KB 是本轮之后唯一还能"变少"
  而不是"搬运"的大笔。
- **本轮引入的行为变化（可一键回滚）**：快进路径在弱网下有"已可玩但无 BGM"的窗口——
  4g **实测 2749ms**；fast3g/slow3g 未单独实测，按同一单价表换算为 6581ms / 21060ms
  （臂B 快照里循环曲在进房时"整条缺席"，只说明它落在里程碑之后，不给出到达时刻）。
  驻留路径不受影响（实测出声与进房同帧）。若产品判断要"音乐优先"，把 `bgmLoopOf`
  放回门内批即可（单提交 `1eefcf1` 回滚）。
- **下一轮战线**：Menu 段那 2441KB 里 `CharAssets.png`（715.2KB）与 `TempleHallForest.jpg`
  （417.0KB）是 `Menu active` 里程碑上最晚落定的两笔——它们是否真的要在 Menu 首帧之前就位，
  正在读码取证（r22 件0）。若是习惯性地放在阻塞批里，面额与本轮同量级。
- 沿用挂账：真机 GPU 显存口径拿不到（VM 内软件光栅）；r20 §七 的进房尾段 140–215ms 拆解
  （`fadeSwitch` / `create` / `isActive` 翻转）非关键，继续挂账。

