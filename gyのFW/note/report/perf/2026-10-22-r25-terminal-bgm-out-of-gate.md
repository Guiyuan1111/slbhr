# r25 · 把两支终局时刻曲搬出落定门（2026-10-22）

口径与判据沿用 r20/r21/r23：里程碑只有冷启动 `Menu active` 与**点击建房→`Game active`**（页钟绝对值
`gameActivePerfMs`），弱网档这两段都是字节账的函数（每 KB 价签 4g 2.048ms、fast3g 5.12ms、
slow3g 16.384ms，`2026-10-22-r20-network-tiers.md:116`）。臂序 A/B/A（臂C＝臂A 同代复测，用来框住本机漂移），
三臂同档位、同机、同一时间窗；跨臂 ms 差只有超出同臂最差带、且大于臂B 自身散布才算差异（闸门③：高漂移档要求
≥8 轮/臂池化）。

- 臂A＝`e35b960`（r23 收口代次：失败曲与本族终局曲仍在落定门内）
- 臂B＝现役（`a3e2ba9`＋`c7d621d`＋`22c17d7`：两支出门，走 r21 那条 1500ms 门后 BGM 批；量具侧 `63b181a`＋`e1229b0`＋`d91ab86`）
- 档位 `forest_01`（general 族），四档串行，同时只有一个浏览器作业

## 一、动的是哪一段：落定门里最后两笔"进房用不到"的字节

进房路径在切场景前有一道落定门：`main.ts` 的 `await bgWarmSettled()`——Menu 驻留期的后台暖装没落完时，
建房点击会等它，等的是**整批**。r21 把循环曲搬出去、r23 把角色播放序列搬出去之后，门里剩下的音频构成是
13 支 sfx（≈245KB，首次跳跃即要出声）＋这两支：

| 字节 | 条目 | 键 | 首帧/第一秒用得到吗 |
| --- | --- | --- | --- |
| 164.0KB | `/assets/audio/s/LevelMusicFinish` | `bgm_finish` | **用不到**：只在通关那一刻（本关最快也要几十秒后） |
| 159.9KB | `/assets/audio/s/LevelMusicOver` | `bgm_over` | **用不到**：只在第一次死亡那一刻 |
| ≈245KB | 13 支 sfx | `sfx_*` | 用得到 |

speed 族那一支更贵也更便宜：`LevelMusicFinish_speed` 只有 68.9KB，但它和 `bgm_over` 一样在门里挡着。
两支出门的面额＝**general 323.3KB／speed 228.5KB**（素材字节；线上实测转移量 323.9KB，含响应头）。

判据与 r21 同形：**没有一帧、没有一秒靠它**。这两支的消费点只有一个——
`GameScene.playStairsSequence()` 尾部的 `this.sfx(this.finishKey())`（[packages/client/src/scenes/GameScene.ts:1719](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/GameScene.ts#L1719)）
与死亡分支的 `this.sfx("bgm_over")`（[:1823](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/GameScene.ts#L1823)），
两者都在进房之后若干秒才可能发生。

## 二、实施：两支并入 r21 的门后 BGM 批，排在循环曲之后

改动面三个文件，没有新机制——全部复用 r21 为循环曲立的那套（门后批＋缺键兜底＋补起＋SHUTDOWN 摘监听）。

1. **名单**（[packages/client/src/audio.ts:97](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/audio.ts#L97)）：新增 `bgmTerminalOf(family) = [...AUDIO_BGM_OVER, ...bgmFinishOf(family)]`，
   即"终局时刻曲"这一族的口径只有一个声明处。`bgmFinishOf` 的文档同步改写为 r25 口径。
2. **落定门**（[packages/client/src/scenes/BootScene.ts:217](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/BootScene.ts#L217)）：门里只剩 `loadAudioPack(scene, AUDIO_SFX)`。
   出闸后的 1500ms 批（`thenLoop`，[:175-179](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/BootScene.ts#L175)）
   在循环曲之后追加 `bgmTerminalOf(warmBgmFamily)`——顺序是刻意的：**画面 > 循环曲 > 终局曲**
   （循环曲 create 即播，终局曲几十秒后才可能播）。
3. **房内兜底**（[packages/client/src/scenes/GameScene.ts:549](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/GameScene.ts#L549)）：新增 `kickBgmTerminal()`，
   create 里排在 `kickCharsPlay()`、`kickBgmLoop()` 之后（[:494-496](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/GameScene.ts#L494)）。
   驻留路径两键已在 `cache.audio` ⇒ 当场返回，零请求零延后；快速进房/邀请深链那条路才补发。
   `preload()` 同步只留 sfx 一批（[:322](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/GameScene.ts#L322)）。
4. **补起只给终局曲**：`catchUpFinish` 三道卫——没进过通关演出（`!stairsPlayed`）不补、已离开 `won` 相位不补、
   已被失败曲或自己占住不补。失败曲**不补**：它是时刻绑定的一次性音，晚到几秒再放会把"已经重生在跑"盖成失败音。
   通关侧不同——`create` 同帧的 won 补演（`prevPhase === "won"` → `playStairsSequence()`）与楼梯演出都处在
   "那一局的结尾正在进行/刚结束"，曲子晚到仍是那句结尾，比整段静音更贴原意。

**Phaser 音频的一条既有性质决定了这轮护栏必须怎么写**：`GameScene.sfx()` 首行是 `cache.audio.exists(key)` 卫
（[:581](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/GameScene.ts#L581)）——
缺键时**静默跳过，不抛不警告**。于是这类改动的失效模式对冷启动、像素、det、regression 全部不可见。
护栏因此做成静态网＋专用 e2e，而不是靠通用门禁"应该能抓到"。

## 三、四档 A/B/A 实测：面额兑现 94%～101%，off 档不主张

`node benchmark/load-ab-bands.mjs <档> r25 gameActivePerfMs menuActiveMs`（12 份快照在 `benchmark/results/load-r25-ab-*`）。

| 档 | 臂A→臂B `gameActivePerfMs` | Δ（B̄−mid(Ā,Ĉ)） | 最差带 | 臂B 自身散布 | 三闸门 | 面额 | 兑现 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4g | 12438 → 11807ms | **−623.8ms** | 127ms | 155ms | ①②过 ⇒ 可主张（4.9×带） | −662.1ms | 94.2% |
| fast3g | 29157 → 27557ms | **−1610.8ms** | 90ms | 39ms | ①②过 ⇒ 可主张（17.9×带） | −1655.3ms | 97.3% |
| slow3g | 90702 → 85365ms | **−5362.8ms** | 140ms | 179ms | ①②过 ⇒ 可主张（38.3×带） | −5297.0ms | 101.2% |
| off | 1952 → 1863ms | −79.0ms | 36ms | **108ms** | ②不过 ⇒ **不足判定，不主张** | ≈−0.2ms | — |

- 与 r20 单价表第五次吻合：三档误差 −3.2%／+0.4%／+1.2%（slow3g 略超面额，本机管道下 2 轮/臂的带只有 140ms，不构成反驳）。
- `Menu active` 四档全部落在带内或"不足判定"（4g +47.8／fast3g +5.3／slow3g +67.5／off +41.3ms，臂B 散布 123/71/33/47ms）——
  Boot 阻塞批本轮未动，这是本轮自带的对照组。
- off 档为什么读不出收益：不节流时门内那 323.9KB 的过网时刻在页钟 0.9s 左右，而落定门本身要等的东西更多，
  臂B 的 2 轮散布（108ms）比 Δ（79ms）还大，闸门②直接拦住。历轮同款（r21/r23 的 off 档亦为带内）。

字节账（三档节流一致）：

| 项 | 臂A/C | 臂B | Δ |
| --- | --- | --- | --- |
| Menu 窗（阻塞批） | 1727KB / 18条 | 1727KB / 18条 | **0.0KB / 0条** |
| 房内窗（点击→落定） | 3531KB / 41条 | **3207KB / 39条** | **−324KB / −2条** |
| 到落定累计 | 5258KB | 4934KB | −324KB |
| 门内音频（`bgmTerminalPreGateKB`） | 323.9KB | **0KB** | −323.9KB |
| 门后落点（`bgmTerminalInWindow`） | `before-gate`（6/6 轮） | `none`（6/6 轮） | 见 §五 |

臂A 那两支在门内的过网时刻比落定门早 3.2s／6.9s／21.1s（4g/fast3g/slow3g）——它们不是"最后一个到的"，
但落定门等的是**整批**，所以它们照样把这 323.9KB 的排队时间算进了进房路径。搬出门后字节没有消失，
只是不再挡门：会话总量与驻留量都不变（§四）。

- 上表的门内音频只适用于节流档。**off 档臂B 读数是 0 与 323.9KB 各一轮**（均值 161.9KB），
  落点字段同为 `after-gate(+2ms)`／`before-gate(−4ms)` 混读——不节流时 Menu 驻留期的门后批在点击之前就跑完了，
  两支在锚点前已在缓存，读起来与"还在门内"同形。这是 r21 立的驻留路径设计行为，不是漏网；
  真正的门内构成由 §五 的静态网断言钉住（`BootScene` 门里只剩 `AUDIO_SFX` 一批）。
- off 档"到落定"在 5700KB 与 6986KB 之间摆动（双臂都有这两值，均值同为 6343KB）。逐条比对差额只有一项：
  r21 出门的循环曲 `LevelMusic` 1285.4KB 在快照那一刻到没到（`phase=post`）；URL 集合两臂完全相同。
  这是 off 档自带的落点抖动、与本轮无关，也是 §三 判据把 off 档归入"不主张"的又一个理由。

## 四、代价侧：两支终局时刻曲与循环曲的到位窗口

量具＝`scripts/e2e/audiofamily.mjs`（本轮加节流档，见 §五）。锚点＝`started` 那一刻的页钟，
每支曲各自记录**首次进 `cache.audio`** 的时刻；同一轮里 `cache.audio` 有键即视为"到位"，
之后由 `kickBgmLoop` 补起、由 `catchUpFinish` 补终局曲。off 档另附网络侧 `responseEnd−锚点`（负＝锚点之前）。

| 档 | forest_01（general）循环 / 失败 / 终局 | forest_12（speed）循环 / 失败 / 终局 | 终局时刻曲到齐窗口 | 到位后循环曲在播 | 臂A 同项对照 |
| --- | --- | --- | --- | --- | --- |
| off | 0 / 0 / 0ms | 0 / 0 / 0ms | **0ms** | ✓ | 0ms（网络侧 −2966/−3857ms，锚点前） |
| 4g | 7796 / 4109 / 4109ms | 3884 / 4218 / 3635ms | **4109／4218ms** | ✓ | 循环 8027／4453ms，两支 0ms |
| fast3g | 32746 / 20654 / 20739ms | 19314 / 20131 / 18402ms | **20739／20131ms** | ✓ | 循环 33784／20073ms，两支 0ms |
| slow3g | 119986 / 78144 / 78234ms | 74144 / 76793 / 71710ms | **78234／76793ms** | ✓ | 未跑（理由见下） |

（slow3g 两列取自补测轮：forest_01 循环曲 119986ms、失败 78144、终局 78389；表内失败／终局为初轮读数，
两轮差异在同档散布内。循环曲 119986ms 那一轮的网络侧 `LevelMusic` responseEnd＝119598ms，与缓存读数差 388ms，
是 Phaser 解码入缓存的那一拍。）

- **窗口就是代价的形状**：进房后这 4.2s／20.4s／77.5s（4g/fast3g/slow3g）里，
  ①死亡 ⇒ `bgm_over` 缺键 ⇒ `GameScene.sfx()` 首行 `exists` 卫静默跳过（[GameScene.ts:581](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/GameScene.ts#L581)），
  **没有失败音**，画面/重生/操作一律不受影响；②通关 ⇒ `catchUpFinish` 在曲子到位那一刻补起，
  代价是结尾音乐晚到最多一个窗口长度，而不是整段静音。off 档两者都是 0ms（驻留期门后批已跑完）。
- 失败曲不补是**裁定**而非遗漏：一次性音晚响会把"已经重生在跑"盖成失败音，
  与 r21 循环曲"晚响一秒优于永远不响"的取舍方向相反，因为循环曲是持续音。
- 循环曲没有被这 323.9KB 挤出可用范围：四档两臂的循环曲窗口两两对比
  （4g 8027→7796／4453→3884，fast3g 33784→32746／20073→19314），臂B 反而更早，
  差值都在同臂散布内；slow3g forest_12 的 74144ms 与 forest_01 的"未到"之差是
  `LevelMusic` 1285.4KB 与 `LevelMusic_speed` 107.3KB 的字节差，不是本轮引入的排队。
- slow3g forest_01 的循环曲在旧上限 87.2s 内未到 ⇒ 那是**量具的账算错**（详见 §五），
  本轮把上限按实测有效吞吐重算后补测该窗口。
- 臂A 的 slow3g 代价侧未跑：臂A 两支在门内，`started` 时必然已到位（§三 的
  `bgmTerminalInWindow=before-gate` 6/6 轮、过网时刻比门早 21.1s，4g/fast3g 的 audiofamily 也读到 0ms），
  再跑一次 6 分钟的慢档只是把已证两次的恒等式复述一遍。

字节守恒（本轮不省字节，只把它从门前挪到门后）：

| 项 | 证据 |
| --- | --- |
| 两支仍然被下载 | audiofamily 四档 12 个用例的"请求面终局时刻曲有请求"全过（Resource Timing 里有 `LevelMusicOver`/`LevelMusicFinish*`） |
| 会话集合不变 | 臂A/C 到落定 59 条、臂B 57 条 ⇒ 差的正是这两支，它们落在落定之后（§三 表） |
| 驻留不变 | 两支的解码体积不受装载时刻影响；perf-resident 无 `bgm*` 相关的分桶变化，本轮也未新增任何常驻对象 |
| Menu 阻塞窗不动 | 四档双臂 1727KB/18 条恒定 ⇒ 收益全部来自落定门那一段 |

## 五、量具与判据（本轮新增）

1. **`perf-load` 三态字段**：`bgmTerminalInWindow ∈ none | before-gate | after-gate` + `bgmTerminalPreGateKB`。
   三态是必需的，因为 Resource Timing 有视野截止——请求在飞时 XHR 条目**整条缺席**，
   "没到"与"没请求过"在布尔值上读不出区别。判据必须双向：臂B 读到 `none`（6/6）＋臂A 读到 `before-gate`（6/6），
   任何一侧单边的断言都能被"恒真/恒假"的空数组骗过去（`[].every()` 恒真）。
2. **`audiofamily` 加节流档**（`node scripts/e2e/audiofamily.mjs [port] [net]`）：off 档 `arriveMs≈0` 会把窗口当成不存在，
   窗口长度只有节流档能读，档位口径与 `charsplay.mjs` 逐字同式（`WAIT_SCALE` 只放大等待、不放宽判据）。
3. **4g 首轮 4 项 FAIL 的复盘——把设计行为当成硬断言**：原判据"进房即读 `bgm_over` 恒在"与"开局曲进房即在播"
   在节流档必然红（r21/r25 出门之后，进房那一刻它们在飞是**设计**）。改法不是松判据，
   而是换成有界断言：`CAP 内入缓存`（不许永远不来）＋`到位后真在播`（补起生效）。
4. **窗口不能串三次 `waitForFunction` 量**：第一次超时之后，第二次读到的"自锚点毫秒"会把上一次的空等整段算进去——
   本轮就这么读出过"循环曲入缓存窗口 119741ms"这种不可能的数。改成页内一次性观察器
   （`startRecord` 以 `started` 的页钟为唯一锚点，每键各记首次 sightings，`readRecord` 一次读回），
   并把网络侧 `responseEnd` 一并读回，用来区分"到得晚"与"根本没请求"。
5. **到位窗口的上限要按实测算，不能按档位名义带宽推**：`LevelMusic.mp3` 实际 1315960B（1285.4KB），
   `LevelMusic_speed.mp3` 只有 109824B（107.3KB）——slow3g 下 forest_12 三支在 76.8s 全部到位，
   forest_01 的循环曲却在旧上限 87.2s 内仍未到位（两支终局曲 78.2s 到位）。按名义 62.5KB/s，
   进房后那 2051.7KB 音频批应当 ≈32.8s 跑完，读数却超过 87s ⇒ 有效吞吐远低名义：
   本用例同时挂着房主与加入者两个节流上下文，落定后这一页还要付 `font.png` 1600.6KB、
   `CharAssetsPlay` 442.7KB 等一大票字节，队列不是按音频单算的。旧公式 `2×(2051KB ÷ 名义down)` 因此
   会把"慢但正确"读成超时——本轮把上限改成按实测窗口重取，并把"未到"当成量具问题而非产品问题来处理。
6. **缺键的失效模式是静音**：`GameScene.sfx()` 首行 `exists` 卫静默跳过 ⇒ 冷启动/像素/det/regression 全部看不见，
   所以护栏＝静态网（`__tests__/char-atlas-split.test.ts` 里 5 条 r25 断言钉住门内只剩 sfx、门后批顺序与兜底调用）
   ＋本专用 e2e，而不是"通用门禁应该能抓到"。

## 六、门禁（末轮套件）

串行 19 步，口径照 r22 §八／r23 §十（vitest 不与 regression 抢 `zz_probe` 夹具、浏览器类步骤互斥），
**FAIL=0**，本机 09:52:39→09:59:35（约 7 分钟）：

| 步骤 | 读数 |
| --- | --- |
| typecheck | 0 错 |
| `split-char-atlas --check` | 六件逐字节（53 帧 152.1KB ＋ 7 帧 28.3KB ＋ 182 帧 442.4KB） |
| `reflow-prephase --check` | png 字节一致 ✓ fnt 字节一致 ✓ |
| build | ✓ built in 3.97s |
| vitest | **20 文件／220 用例**全过（r23 为 215，＋5 正是本轮静态网那五条） |
| det（`perf-determinism --compare r32`） | **48/48** 关位级一致 |
| `prephase-canvas` | **5/5 态逐字节**（menu 803758B／temple 279816B／temple-numbers 448929B／settings 327020B／credits 378072B）；产物哈希 `index-BZ9iZU0M`(041e2a8cb4a09f79)→`index-CxewXNds`(51fd59b7b3080ae7) 换代后像素仍逐字节 ⇒ 本轮改动不触像素 |
| `domskin` | 4/4 逐字节（wide-error 235029B／narrow-idle 153209B 等） |
| `audiofamily`（off） | **22 项 ✓**：门内 sfx 十三支逐键在场、两支门后有界到位、循环曲到位即在播、另一族零请求、页面零错误 |
| `charsplay`（off） | 21 项 ✓（含停答阴性对照） |
| `treebake` | 9/9 金样一致 |
| `groundcache` | 6/6 |
| `journey` refresh／wonrefresh／deathretry／rejoin | 3/3 · **6/6** · **4/4** · 3/3 |
| `route` forest_01／forest_12 | won=true，winAt 39469／13430ms（r23 为 39463／13428ms，玩法时点未动） |
| `regression`（zz_probe walkin-doors，`--expect-win`） | won=true errors=0 sync=0 缺帧警告=0 |

- 值得单记的一条：**deathretry 4/4 与 wonrefresh 6/6 都在 off 档跑**，那里两支在 `started` 前就已在缓存，
  所以它们**证明不了**弱网窗口里的补起路径——那条路径的证据只有 §四 的节流档 audiofamily 与 §五 的静态网。
  通用门禁对"缺键＝静音"这条失效模式不可见（§二 末），这是本轮再次确认的口径事实。

## 七、剩余面额与下一轮

**落定门的音频侧到此清空**。门里现在只剩 `AUDIO_SFX` 十三支（≈245KB，[BootScene.ts:217](file:///home/gy/.qoder/worktrees/app/679a6b/slbhr/gy%E3%81%AEFW/packages/client/src/scenes/BootScene.ts#L217)），
而 sfx 里最晚出声的一支也要求跳跃/推箱/水声在进房第一秒就有声——不满足"没有一帧、没有一秒靠它"，出口项已用尽。
r21（循环曲 1285.4KB）＋r23（chars-play 442.4KB）＋r25（两支 323.9KB）三连之后，落定门等的整批里
音频从 2051.7KB 降到 245KB。

落定之后这一段还剩这些大件（本轮 off 档快照逐项账，`phase=post`）：

| 字节 | 条目 | 归属轮次 | 名义价（4g/fast3g/slow3g，ms） |
| --- | --- | --- | --- |
| 1600.6KB | `/assets/fonts/chinese/font.png` | r24（房内按关出子集） | −3278／−8195／−26224 |
| 472.8KB | `MechAssets.png` | r26+（按关装载） | −968／−2421／−7746 |
| 334.4KB | `PopupAssets.png` | r26+（结算板拆张） | −685／−1712／−5479 |
| 281.1KB | `TempleAssets.png` | r26+ | −576／−1439／−4605 |
| 442.7KB | `CharAssetsPlay.png` | r23 已出门，仍在房内窗 | −907／−2267／−7252 |

（单价 2.048／5.12／16.384 ms/KB 出自 `2026-10-22-r20-network-tiers.md:116`；价签是"若这笔从关键路径消失"的上限，
不是任何一轮的实测收益。font.png 的 8.56MB 驻留已在 r19 判为不可动，r24 只动"进房到底需不需要全量"这件事。）

本轮代价若将来要再压（三条途径，都还没做）：
①把两支排在循环曲**之前**入队——终局时刻曲窗口从 4.2/20.7/78.2s 收到接近 0，代价换成循环曲窗口 +323.9KB；
②#42 素材再编码裁决：`ffprobe` 读这两支是 44.1kHz／stereo／**320kbps** 的 4.0s／4.1s 短曲（所以才是 159.6／163.7KB），
同族里 `LevelMusicFinish_speed` 只有 22.05kHz／mono／160kbps——若按 #42 裁到 mono/96kbps，general 面额 323.9KB → ≈94KB（两支 8.1s × 96kbps ÷ 8）；
再编码属用户保留项，本轮没动任何素材字节；
③接近死亡/通关时预取——需要状态机预判，成本高，收益只在弱网那一段窗口。
