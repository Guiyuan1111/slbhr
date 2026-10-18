# 性能优化战役 · r5 第五轮实施报告（perfopt5 槽 · 冷启动资产管线）

> 2026-10-18 · perfopt5 槽 · 基线 git `a68c0bc`（r4 终态）→ 本轮终态 `458bff2`（件1），
> 一件一 commit（458bff2 → 476a254 快照入库 → 本报告收尾件）。
> 改动面：`packages/client/src/scenes/{BootScene,MenuScene,GameScene,TempleScene,menus}.ts` +
> `packages/client/src/main.ts`——**纯客户端装载层，零资产内容/零物理/零服务端/零 vendor**。
> 红线全绿：visual-diff 90.67（r3 同带）+ det 48/48（vs r0-baseline）+ fixtures 6/6（oracle-gold
> 24.5357/142.6879 与 r0 逐字同值）+ tsc 零输出 + vitest 85/85 + e2e f01/f12 双 ALL PASS（稳定窗）。

## 〇、一件总表

| # | 改动 | commit | 前 → 后（同机同口径） | 门禁 |
|---|---|---|---|---|
| 件1 | **冷启动装载序整形**——ground/mech/temple/popup 四图集（1.35MB/8req）移出 Boot 关键路径；MenuScene 首帧后 120ms 后台暖装；enterGame 暖装落定门（等暖装完成再切 Game，杜绝双载竞态）；wind/liquid/finish_stone 动画注册随图集迁入 GameScene.create（exists 幂等）；消费方全兜底（GameScene.preload 载四图集 + TempleScene/CompleteScene preload 补缺） | `458bff2` | **冷启 Menu active 769→523.5ms（-32%）**；Menu 传输 4863→3674KB、22→14req（硬口径）；reload Menu 759→532ms；页内 DCL→menuActive 477→309ms；点击建房→Game 567→620~698ms（即点路径，见 §三） | visual-diff 90.67 + det 48/48 + fixtures 6/6 + tsc/vitest 85/85 + e2e 双关 + 邀请深链冒烟 7 纹理键齐备 0 页面错误 |

评估弃件 1 项（imageLoadType，§四）；无回滚件。

## 一、STEP1 剖析：瓶颈定量（工具收容 `note/report/perf/tools/perfopt5/`）

**先证伪三个假设，再钉死真瓶颈**（r4 勘误精神：口径先于结论）：

1. **网络不是瓶颈**：Phaser 3.90 桌面默认 `maxParallelDownloads=32`（Config.js:501），
   19 个资产请求全并行——XHR 窗口仅 **~55ms**（loopback，round2 实测 210→265ms 窗口内
   19 个 loadend 全落），无串行瀑布。
2. **不是 base64 内嵌**：Phaser 3.90 ImageFile 默认 `responseType:'blob'` → objectURL →
   Image（ImageFile.js:68/129），任务书候选「base64 texture 改 URL 直载」前提不成立。
3. **伺服侧无剩余动作**：0.3.21 起 br/gz（文本类）+ 分级缓存已在（index.ts staticGz），
   PNG/JPG 本身不可再压；reload 3KB 全命中证明缓存链路健康。本轮标的=冷启首载，伺服侧不动。

**真瓶颈（页内 ms，probe-decode.mjs 两轮，round2）**：DCL 145.8 → fwReady 146.5 →
场景 boot 222.4 → XHR 全完 265 → **Image onload 串行 282.7→461.1（~180ms）** →
fnt/音频处理 490.8 → menuActive 594.7。分桶表：

| 段 | 耗时 | 内容 |
|---|---|---|
| goto→DCL | 145.8 | phaser 1.48MB 块网络 21ms + **脚本 parse/eval ~120ms**（下载完 21.7 → DCL 145.8） |
| fwReady→场景 boot | 76~104 | Phaser Game boot（SwiftShader headless 的渲染器/上下文初始化） |
| XHR 窗口 | ~55 | 19 请求全并行（如上，非瓶颈） |
| **blob→Image 串行段** | **~180** | 11 张图 onload 逐张完成（25-45ms/张，按图幅）——浏览器图片装载管线串行 |
| 尾处理 | ~30 | font.fnt 解析 + bgm_menu |
| loaderDone→menuActive | 95~104 | buildAnims + MenuScene.create + 首帧（GL 纹理上传） |

**结论：大头是「图片装载管线串行段 + 首帧渲染」，由总像素量决定**（6 图集+font ≈ 90MB
原始 RGBA）。不动资产内容（红线）的前提下，唯一杠杆=**把 Menu 首帧不需要的像素挪出关键路径**。

## 二、件1 设计（装载序整形 + 后台暖装 + 落定门）

- **Menu 首帧必需盘点**（逐场景用例核对）：CharAssets（MenuScene 双角色立绘+glow+idle 动画）、
  MenuAssets、font.png/fnt、TempleHall/Beam/GameName/KiziLogo、bgm_menu——共 14 请求 3.5MB。
  **可延迟**：ground/mech/temple/popup 四图集（GameScene 机关/液体/选关背景/弹窗，1.35MB/8req）。
- **BootScene.preload 只装首帧必需**；四图集装载入口抽为 `loadGameAtlases()` 共享。
- **MenuScene.create 尾部 delayedCall(120ms) 后台暖装**：先让 Menu 首帧独占渲染/解码，
  再用玩家驻留时间拉齐四图集（120ms=渲染让位与「benchmark 口径测量窗（+40ms 轮询）之后」的平衡点）。
- **enterGame 暖装落定门（`bgWarmSettled()`）**：切 Game 前等暖装落定（complete 或 Menu
  SHUTDOWN 均算落定）——避免「暖装在飞 + GameScene 兜底重复拉同一批」的双载竞态与
  `Texture key already in use` 告警路径；暖装未启动（邀请深链 300ms 自动加入早于 Menu create）
  立即返回走兜底。
- **消费方全兜底（Phaser 语义背书）**：LoaderPlugin `keyExists → File.hasCacheConflict`
  对已入纹理缓存的键**静默跳过**（LoaderPlugin.js:559/497）——GameScene.preload 无条件声明
  四图集、TempleScene/CompleteScene preload 补缺自身图集，任何进入路径都保证 create 前纹理
  完备，行为与旧 Boot 全量装载等价。Menu 被 SHUTDOWN 时其 loader `reset()`（在飞 XHR 不中止、
  孤儿请求照常入缓存，重复键由 `TextureManager.checkKey` 拒绝，首装胜者保留全帧——无危害路径）。
- **动画注册迁移**：wind_base/wind_effect（mech）、liquid_*（ground）、finish_stone_*（popup）
  帧在延迟图集内，`buildAnims` 拆为 `buildMenuAnims`（Boot，chars 系）+ `buildGameAnims`
  （GameScene.create 头，exists 幂等）——注册时机后移但仍在任何消费（play/setFrame）之前。

## 三、主指标前后表（perf-load，硬口径为主）

快照：`load-r5-before`（a68c0bc）vs `load-r5-coldstart`（458bff2）。时长类轮间带
471~588ms（r0 当日 1244/912 同型波动），传输/请求数为跨轮恒定硬口径。

| 指标 | r5-before | r5 终态 | 变化 |
|---|---|---|---|
| 冷启 Menu active | 769ms | **523.5ms**（5 次测量 471/524/533.5/588.5/523.5，中位 524） | **-32%** |
| 冷启 Menu 传输 | 4863KB / 22 req | **3674KB / 14 req** | -1.19MB / -8req（硬口径） |
| reload Menu active / 传输 | 759ms / 3KB | 532ms / 2KB | -30%（首屏集更小） |
| 点击建房→Game | 567.5ms | 620~698ms（带） | +53~131ms，见下注 |
| 进 Game 累计传输 | 6899KB | 6899KB | 持平（总量不变，只改分布） |
| 页内 DCL→menuActive | 477ms | **309ms** | -35%（probe 口径） |
| （分解）bootActive→loaderDone | 275.7ms | **150.9ms** | 串行图片段随 4 图集移出收窄 |
| （分解）loaderDone→menuActive | 95.4ms | **56.2ms** | 首帧 GL 上传负载同步变小 |
| 页面错误 | 0 | 0 | — |

**「点击建房→Game +53~131ms」的定性（诚实披露）**：该指标是机器人即点口径——click 发生在
menuActive+40ms，enterGame 网络握手 ~300ms 后到暖装落定门，等的是暖装尾巴（四图集串行解码
~150ms 中未完成部分）。**真人驻留路径（开始界面停留 >0.5s）暖装早已完成，GameScene.preload
只剩音频（与改前完全相同）**。总旅程（Menu+Game）即点口径 1336→1144ms 仍净 -192ms；
带宽消耗总量零变化。实测波动：门加前后 Game 指标在 615-833ms 带内抖动（暖装尾巴长度依赖
菜单期 CPU 争用），已在快照 meta 中如实落档。

## 四、评估弃件：imageLoadType=HTMLImageElement（候选「预解码/URL 直载」族，未实施）

Phaser 3.60+ 提供 `loader.imageLoadType:"HTMLImageElement"`（Image 元素直载，跳过
XHR→blob→objectURL 两段式中转，ImageFile.js:312「lightweight way」）。实测 A/B（同机同窗）：

| 配置 | Menu active | 点击→Game |
|---|---|---|
| 缺省（XHR blob，r5 终态） | 471~533ms | 615~726ms |
| HTMLImageElement | 494.5ms | 688ms |

带内无收益（blob 中转成本在本体量中不显著，串行瓶颈在浏览器图片装载管线本身）——**弃**，
试验行已回退不入库。

## 五、总验收（终态 458bff2）

- **typecheck 零输出；vitest 85/85；vite build ✓（3.8s）**。
- **visual-diff（首帧完整性门禁）：90.67**（容差 48 匹配率；r3 件1/件2 同带 90.74-90.79，
  HEAD 旧基线 89.42）——装载序改动后首帧渲染完整无缺帧。
- **det `--compare r0-baseline`：48/48 位级一致**（本轮纯客户端，此为惯例兜底）；
  **fixtures 6/6 PASS**（maxDev 与 r0 逐字同值）。
- **e2e（repeat3 × --offset -15，静窗）**：forest_01 **ALL PASS**（39466/39989/39487ms，
  历史带内）；forest_12 **ALL PASS**（13464/13468/13465ms，历史带内）。
- **抖动事件与 A/B 归因（诚实记录）**：本轮先后两个窗 f01 各出 1/3 FAIL（均 run3，形态=
  111 派发全部完成、角色冻于中途 (1200,350)、phase 恒 started——与 r1 §五/r3 §四/r4 §五已录
  「输入注入抖动」签名同族）。A/B 取证：基线 worktree `a68c0bc`（独立构建同口径）3/3 PASS、
  HEAD 静窗复跑 3/3 PASS；另 journey rejoin 3/3、邀请深链冒烟 7 纹理键齐备 0 页面错误。
  判定=重启后环境窗抖动带内事件非本件回归（改动面为装载时序，不触输入链；f12 全程无抖动）。
- **邀请深链定向冒烟**（smoke-invite.mjs，收容档）：A 建房 + B `?room&pw` 自动加入——双端
  Game active、7 纹理键（含四延迟图集，走 GameScene 兜底）齐备、帧推进正常、0 页面错误。
- **真实双端冒烟：不适用**——本轮未动伺服侧（无压缩/缓存头变更，响应头清单无前后差）。

## 六、红线核对

- 资产内容零改动（git diff 面仅 5 个场景文件 + main.ts 装载/时序层）；det/patch 字节不受影响
  （纯客户端），det 48/48 + fixtures 6/6 兜底全绿。
- git：件1 + 快照 + 工具收容 + 报告各独立 commit，无 co-author、无 add -A、无 reset。
- TEMP/perfopt5 已清（剖析工具 3 件收容 `note/report/perf/tools/perfopt5/`，ROOT 已改 5 级
  上行、node --check 过）；A/B worktree `base`（a68c0bc）经 `git worktree remove` 正规撤注；
  无残留服务器/浏览器进程。

## 七、下一轮（第六轮）候选

1. **【数据最厚】Menu 首帧集内再压缩**：剩余大头=font.png 1.6MB/2048²（中文字库位图，
   Menu「开始游戏」4 字即需要它）+ CharAssets 732KB/1024×2048（立绘）。不动资产红线下
   无杠杆；若放宽到「资产重排」（font 按需子集化/立绘单独小图集），需用户裁决破红线。
2. 脚本段 ~120ms（phaser 1.48MB parse/eval）：r2 已判拆分不值；新证据=本轮未推翻，维持。
3. GameScene 音频批（2.8MB/18req）可同款后台暖装（Menu 驻留期预拉），Game 即点路径可再
   -50~100ms；收益小、改动面同款，列为低优先顺手件。

## 八、复现

```bash
node --import tsx benchmark/perf-load.mjs --no-build --compare r5-before   # 冷启主口径
node --import tsx note/report/perf/tools/perfopt5/probe-decode.mjs 2      # 页内里程碑/串行解码剖析
node --import tsx note/report/perf/tools/perfopt5/smoke-invite.mjs        # 邀请深链冒烟
node --import tsx note/report/perf/tools/perfopt5/trace-load.mjs 2        # 资源瀑布/里程碑（trace 限制见头注）
npm run typecheck && npm test && npm run build                             # 静态/单测/构建
node scripts/e2e/route.mjs --level forest_01 --repeat 3 --offset -15       # e2e（空机时段！）
node scripts/e2e/route.mjs --level forest_12 --repeat 3 --offset -15
node --import tsx benchmark/perf-determinism.mjs --compare r0-baseline     # 位级门（兜底）
node --import tsx scripts/e2e/routetool/fixture-runner.mjs                 # fixtures 6/6
node --import tsx benchmark/visual-diff.mjs                                # 首帧完整性
```

提交链：`458bff2`（件1）→ `476a254`（双快照）→ 收尾件（工具收容 + 本报告 + handoff + README）。

## 九、一句话总结

**瓶颈定量翻案：网络（55ms 全并行）与 base64（3.90 已是 blob 路径）均非瓶颈，真凶是图片装载
管线串行段（~180ms）与首帧渲染（~100ms），由总像素量决定——件1 装载序整形把 Menu 首帧不需要的
四图集（1.35MB）移出关键路径 + 首帧后 120ms 后台暖装 + 暖装落定门：冷启 Menu 769→523.5ms
（-32%）、传输 4863→3674KB/22→14req、reload -30%；门禁 visual-diff 90.67/det 48/48/
fixtures 6/6/e2e 双关静窗全绿 + 邀请深链兜底冒烟；imageLoadType 经 A/B 数据弃件。**
