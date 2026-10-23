# r43：离房交还开始界面独占四图（大厅 32.07→26.50MB）

> 日期：2026-10-23 · 版本线：0.3.43 · 量具：[`benchmark/perf-menu-return.mjs`](../../../benchmark/perf-menu-return.mjs)
> （离房→回 Menu 的重取代价）、[`benchmark/perf-resident.mjs`](../../../benchmark/perf-resident.mjs)（六态驻留）、
> [`benchmark/load-ab-era.sh`](../../../benchmark/load-ab-era.sh)（A/B/A 换臂台）、
> [`menu-release.test.ts`](../../../packages/client/src/__tests__/menu-release.test.ts)（静态网 8 例）、
> [`scripts/e2e/journey.mjs`](../../../scripts/e2e/journey.mjs) 的 `backmenu` 模式（真实返回按钮）。
>
> 结果：temple 首入/重进/三进与 game 态纹理 **−5.58MB**（42.27→36.69、51.79→46.21），
> 大厅离房态 **32.07→26.50MB（−5.57，四图 5.58）**；menu 首帧 32.03MB 两臂相同。
> 重取 4 笔请求全部 **transfer 0B**（`?v=` immutable 磁盘命中），reloadMs 中位
> off **123.4ms**／slow3g **102.4ms**，完整落在既有 500ms 黑幕内。客户端 +417B raw／
> +131B gzip／+103B brotli；冷启动字节与首帧装载点不变。

## 一、为什么：选关态里最后四项只属于 Menu 的资源

r41＋r42 把房内独占的字体、结算变体、关卡 BGM 与 `chars-play` 在离房时交还后，大厅离房态
降到 32.07MB。此时 `texTop` 的构成是：

| 资源 | 驻留 | 消费场景 | 大厅能否交还 |
|---|---:|---|---|
| `chars` | 5.07MiB | 大厅双角色立绘（Menu） | 否（大厅必用） |
| `tree-big`／`tree-all`／`tree-done` | 各 3.41MiB，合计 10.24MiB | 选关树三层结果（Temple / Menu 背景） | 否（选关态背景） |
| `popup` | 2.88MiB | 连接面板（DOM 覆盖层） | 否（大厅入口） |
| `temple` | 2.63MiB | 选关界面（Temple） | 否 |
| **`TempleHall`** | **4.00MiB** | 仅 Menu 全屏背景 | **是** |
| **`Beam`** | **0.51MiB** | 仅 Menu 光柱 ×8 | **是** |
| **`GameName`** | **0.89MiB** | 仅 Menu 标题（及 DOM 标题图的同一字节） | **是** |
| **`KiziLogo`** | **0.18MiB** | 仅 Menu 品牌 logo | **是** |
| **四图合计** | **5.58MiB** | — | — |

四张图由 Boot 阻塞批装载（开始界面首帧必需），但从不被 Temple/Game/结算/设置/制作人员
引用。r43 的改动就是把这 5.58MiB 标记为「Menu 独占」，在 Menu 场景退出时交还，回 Menu 时
经 `preload` 用内容寻址 URL 重取。

## 二、实施

| 件 | 内容 | commit |
|---|---|---|
| 清单与装载 | [`BootScene.ts`](../../../packages/client/src/scenes/BootScene.ts) 增 `MENU_ONLY_IMAGES`（键＋`versionedAsset` 路径四对）、`MENU_ONLY_KEYS`、`loadMenuOnlyImages`（`textures.exists` 卫）与 `releaseMenuOnlyImages`（逐键 `textures.remove`）；Boot `preload` 的四条内联 `load.image` 收拢为一次 `loadMenuOnlyImages(this.load)` | `d9759b7` |
| 交还与重取 | [`MenuScene.ts`](../../../packages/client/src/scenes/MenuScene.ts) 新增 `preload()`：同一清单、存在即跳过；`create()` 第一句注册 `SHUTDOWN` 一次性交还。Play→Temple（`fadeSwitch`）与 DOM 建房/受邀（`enterGame` 的 `sm.stop("Menu")`）两条出口共用同一释放点 | `d9759b7` |
| 内容寻址扩展 | [`asset-versions.mjs`](../../../scripts/asset-versions.mjs) 清单 51→**55 条**（四图入库）；同时把 [`index.html`](../../../packages/client/index.html) 的 DOM 标题图 `src` 重写为同一个 `?v=`（见 §五），`--check` 一并校验 TS 与 HTML | `d9759b7` |
| 静态网 | [`menu-release.test.ts`](../../../packages/client/src/__tests__/menu-release.test.ts) 8 例：键/路径表一致、四路径在清单且 8 位 sha1、index.html 同版本、Boot 唯一首装点、Menu preload 重取与存在卫、SHUTDOWN 注册先于显示对象、交还实现的存在卫/只删四键、其余场景零引用 | `d9759b7` |
| 重取量具 | [`perf-menu-return.mjs`](../../../benchmark/perf-menu-return.mjs)：Menu→Temple 等树烘焙落定 → 记录四键交还 → `scene.start("Menu")` 计时到四键回归且尺寸正确 → 读 resource timing 的 transfer/encoded；支持 `--net` 四档 | `d9759b7` |
| e2e | [`journey.mjs`](../../../scripts/e2e/journey.mjs) 增 `backmenu`：首入四图尺寸正确 → 进房后四键 absent → 离房回选关仍 absent → 真实点返回按钮 → 四图按原尺寸重取、零页错 | `d9759b7` |
| 门禁稳定 | [`font-prephase.test.ts`](../../../packages/client/src/__tests__/font-prephase.test.ts) 两条重负载逐字节用例显式 20s 超时（整包并行下默认 5s 偶发超时；判定逻辑零改动） | `586c859` |

**为什么交还挂在 SHUTDOWN 而不是离房入口**：与 r41/r42 的单点 `leaveToMenu` 不同，Menu 有两条
真实出口——Play 走 `fadeSwitch → scene.start("Temple")`，DOM 建房/受邀走 `enterGame` 的
`sm.stop("Menu")`。把交还绑在场景自身的 `SHUTDOWN` 上，两条路径自动覆盖，且释放发生在显示
列表销毁的同一帧，不存在「纹理先没了、Menu 精灵还在画」的窗口。

## 三、驻留 A/B/A

臂 A/C＝r42 收口代次 `599ff68`，臂 B＝现役；三份快照 `resident-r43-res-{a1,b,a2}.json`。
数值为 `textures.list` 逐源 `w·h·4` 总账（含透明边距），单位 MB。

| 态 | 臂 A1 | 臂 B | 臂 A2 | Δ（B−A） |
|---|---:|---:|---:|---:|
| menu（暖装落定） | 32.03 | 32.03 | 32.03 | 0 |
| temple 首入（冷烘） | 42.27 | **36.69** | 42.27 | **−5.58** |
| temple 重进（命中） | 42.27 | **36.69** | 42.27 | **−5.58** |
| temple 三进（命中） | 42.27 | **36.69** | 42.27 | **−5.58** |
| game（开局静止） | 51.79 | **46.21** | 51.79 | **−5.58** |
| **temple 离房后（冷烘）** | **32.07** | **26.50** | **32.07** | **−5.57** |

- 差额就是四图的 5.58MiB；离房态的 0.01 是逐项四舍五入。
- A 臂 `texTop` 在进房后仍有 `TempleHall 4.00`；B 臂该项消失，离房态剩余最大项为
  `chars 5.07`、`tree-big/tree-all/tree-done` 各 3.41、`popup 2.88`、`temple 2.63`。
- `heapGCMB` 两臂各态为 11.6–11.7（menu）／22.2–22.3（temple 三态）／18.6–18.7（game）／
  23.8（离房），差值在 GC 噪声内：这四张是浏览器解码后的图像源，驻留在 GPU/解码器侧，
  不计入 JS 堆；口径与 r38–r42 的 `texMB` 一致。
- 音频 6.82MB／14 键、DOM 64 节点、地面 LRU 与树结果位图（10.24MB）两臂全同。
- 四图在 B 臂进房后的 `texTop` 中消失；e2e `backmenu` 另行断言四键在进房后与离房后均
  absent、回 Menu 后按原尺寸回归。A 臂进房后仍见 `TempleHall 4.00`。全部快照 `errors=[]`。

## 四、重取代价

流程：进房 → 等树烘焙落定 → 拍「已交还」基线 → `Temple.scene.start("Menu")` 打点 →
Menu active 且四键纹理在位 → 停表；同时读该窗口四条 resource timing。off 4 轮/臂、
slow3g 3 轮/臂，A/B/A 同场交替。

### reloadMs（scene.start → Menu 可渲染且四图在位，ms）

| 档 | 臂 | 各轮 | 中位 | A 带（|Ā1−Ā2|） | 判定 |
|---|---|---:|---:|---:|---|
| off | A1 | 130.8／68.6／123.7／66.1 | 123.7 | — | — |
| off | **B** | 154.6／99.8／123.4／121.4 | **123.4** | — | 在 A 带内 |
| off | A2 | 5.6／4.3／120.9／5.0 | 5.6 | 118.1 | B 的中位在带内，但 A 臂自身双峰 ⇒ 不做方向主张 |
| slow3g | A1 | 107.8／120.4／115.4 | 115.4 | — | — |
| slow3g | **B** | 101.5／102.4／115.8 | **102.4** | — | 快于 A 中位（不是回归） |
| slow3g | A2 | 30.7／151.3／160.2 | 151.3 | 35.9 | B 低于 A1/A2 的中位，仍落在 A 臂内散布（30.7–160.2） |

- A 臂不卸图，`scene.start("Menu")` 只有场景重建；其读数在 off 呈 5ms／120ms 双峰，
  说明该量具的被测对象在本机有 0–130ms 量级的场景启动噪声，B 的 100–155ms 不能全部
  归给四图装载。可主张的是**上界**：四图重取的 resource 侧耗时合计仅 12.6–19.1ms。
- 资源窗口（B，slow3g）：`TempleHallForest.jpg` 3.7–5.0ms、`Beam.png` 3.2–4.5ms、
  `GameNameForest.png` 3.3–4.6ms、`branding_logo_kizi.png` 3.1–4.3ms；**全部 transfer=0B**。
- 交还/重取的状态序列（B，每轮）：四图 `5.58 → 0 → 5.58MB`；A 臂恒 `5.58 → 5.58 → 5.58MB`。
- 重取发生在 `fadeSwitch` 的 500ms 淡出窗口内，100–155ms 上界仍有余量；e2e `backmenu`
  用真实返回按钮验证了四图按原尺寸（1366×768／159×846／860×270／319×144）回归。

## 五、冷启动与重复下载

- **首帧不变**：四图仍在 Boot 阻塞批里装载，menu 首帧 32.03MB 两臂相同；冷启动的总传输与
  解码字节不变（未新增/删除任何首装文件）。
- **DOM 同源 URL 必须同版本**：`index.html` 有一枚 `<img class="menu-logo" src="/assets/images/GameNameForest.png">`
  用于登录面板标题。r43 若只给 Boot 的四条 URL 加 `?v=`，同一字节会在冷启动被下载两遍
  （未带 v 的 DOM URL 与带 v 的 Boot URL）：GameNameForest 109,049B，slow3g 档约多付
  **+1.7s** 传输窗。生成器因此把 HTML 中与清单同源的 `src="精确路径"` 一并改写成同一个
  `?v=401f4b91`，并由 `asset-versions --check` 与静态测试双重钉住。
- 服务端缓存分级未改：带 `v` 的请求 immutable，不带 `v` 的请求维持原策略。四图哈希：
  TempleHall `4250127c`、Beam `0aba164c`、GameName `401f4b91`、KiziLogo `a7f1205a`。
- 线上字节：四图 **646.4KiB**（426,676＋64,607＋109,049＋61,532B），解码 **5.58MiB**。
  回 Menu 的重取在**同一页面会话内**必然命中磁盘缓存（四图在首入 Menu 时已下载），
  实测 4 笔请求 0B 即此；若磁盘缓存被清空，四图会重下 646.4KiB，极端弱网下黑幕会延长到
  装载完成——这是本方案的边界，不是常规路径。

## 六、客户端字节

| 代 | 入口 | raw | gzip-9 | brotli-11 |
|---|---|---:|---:|---:|
| A（r42 收口 `599ff68`） | `index-CwNMklE2.js` | 109,934B | 37,108B | 32,092B |
| B（现役） | `index-DB_13DUZ.js` | 110,351B | 37,239B | 32,195B |
| Δ | — | **+417B** | **+131B** | **+103B** |

（Node zlib，level 9／quality 11，与 r39–r42 同口径。）

## 七、兼容与边界

- **释放点唯一且自动覆盖两条出口**：`SHUTDOWN` 注册在 `create()` 第一句，先于任何
  `this.add.*`；静态测试钉住注册顺序与「只删四键、不清同前缀键」。
- **重取幂等**：`MenuScene.preload` 先 `textures.exists` 再 `load.image`。首次进 Menu 时四图
  已在 Boot 批里，preload 为 no-op；只有真实离房回来才发请求。
- **大厅零消费**：Temple / Game / Settings / Credits / Complete / XFade 不引用四键
  （`menu-release.test.ts` 扫描 `scenes/*.ts` 与 `main.ts`），交还后不会出现缺纹理。
- **内容寻址是重取零字节的前提**：四图纳入 r37 清单后，回 Menu 的 URL 与首装完全一致且
  immutable，实测 transfer=0B；若沿用无 v 的 URL，slow3g 下至少多一次 304 往返
  （约 400ms RTT），会吃掉黑幕余量。
- **DOM 与 Boot 同字节同 URL**：生成器同步 `index.html` 的精确 `src`，`--check` 失败即
  说明两处版本漂移；这是防止冷启动双载的硬约束。

## 八、末轮门禁

| 项 | 结果 |
|---|---|
| typecheck | 0 错 |
| `asset-versions --check` | 55 条与 index.html 同步项逐字节一致 |
| 其余十一项 `--check` | 地面 2 件（634×584，151 真帧）、Slim 4 件、角色六件、Temple 四件、结算六件、机关 24 变体、菜单 2 件、弹窗 2 件、prephase 2 件、字体 blank 2 件、DOM 皮肤逐字节 |
| build | `index-DB_13DUZ.js` 110,351B／gzip 37,239B |
| vitest | **33 文件/351 例全绿**（menu-release 8 例） |
| det `--compare r0-baseline` | 48/48 位级一致 |
| fixtures | 6/6 PASS（oracle-gold maxDev 142.6879） |
| prephase-canvas | 5/5 逐字节（产物换代提示，像素不变） |
| roomtext forest_01／forest_12 | 6/6／5/5 面逐字节 |
| domskin | 4/4 逐字节 |
| audiofamily | ALL PASS（off） |
| charsplay | ALL PASS（用例三：离房交还纹理＋11 键、重进 163 帧零 stale Frame） |
| treebake／groundcache | ALL PASS（9/9、6/6） |
| journey | 9 模式全过：journey 7/7 · pause 11/11 · leave 3/3 · refresh 3/3 · wonrefresh 6/6 · rejoin 3/3 · deathretry 4/4 · rolesplit 6/6 · **backmenu 6/6** |
| route forest_01／forest_12 | 各 1 轮 won（winAt 39,515ms／13,466ms） |
| regression（zz_probe walkin-doors） | won=true，errors=0，sync=0，缺帧=0 |
| tilesprite forest_01／forest_24 | 1/1、8/8 对象 PASS；私有画布 1×1 |
| finish-anims | 8/8（general 变体重载、星碑动画、继续换关、全程 0 页错） |

门禁维护：vitest 的 `font-prephase` 两条重负载逐字节用例在整包并行下会超过默认 5s
（本文件单跑 2.6s），本轮显式钉 20s（`586c859`）；判定逻辑零改动。

## 九、结论

- **收益**：temple（首入/重进/三进）与 game 四态纹理各 **−5.58MB**，大厅离房态
  **32.07→26.50MB**；menu 首帧与冷启动字节不变。r41–r43 三轮合计把大厅离房态从
  **53.35MB 降到 26.50MB**。
- **代价**：回 Menu 4 笔 immutable 请求 0B，reloadMs 100–155ms 上界，落在 500ms 黑幕内；
  客户端 +417B raw／+131B gzip；磁盘缓存被清空时存在 646.4KiB 重下的边界。
- **兼容**：SHUTDOWN 单点交还 + preload 幂等重取 + 大厅零消费 + 四图内容寻址与
  `index.html` 同版本，四道静态/动态网；e2e `backmenu` 用真实返回按钮覆盖完整回路；
  全套门禁见 §八。
