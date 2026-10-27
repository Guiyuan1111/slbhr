# r42：离房交还角色序列帧（大厅纹理 42.83→32.07MB）

> 日期：2026-10-23 · 版本线：0.3.43 · 量具：[`benchmark/perf-reentry.mjs`](../../../benchmark/perf-reentry.mjs)
> （离房→重进代价）、[`benchmark/load-ab-era.sh`](../../../benchmark/load-ab-era.sh)（A/B/A 换臂台）、
> [`leave-release.test.ts`](../../../packages/client/src/__tests__/leave-release.test.ts)（静态网 13 例）、
> [`scripts/e2e/charsplay.mjs`](../../../scripts/e2e/charsplay.mjs)（用例三：离房→重进）。
>
> 结果：大厅（Temple 选关态）纹理 **42.83→32.07MB（−10.76，其中 `chars-play` 10.75）**，音频
> **6.82MB／14 键不变**；menu / temple 首入 / game 三态与 A 臂逐项相同（32.03 / 42.27 / 51.79MB，
> 音频 6.82 / 6.82 / 21.81MB）。重进线上只多 **0.3KB**（PNG 走一次 304 复验，JSON 内存命中）；
> `chars-play` 与十一式动画在可玩后 **+111.7–270.5ms（off）**、**+454.9–473.4ms（slow3g）** 恢复。
> 可玩时刻 off **−26.8ms**（A 带 10.1ms、B 散布 149.6ms）、slow3g **−210.4ms**（A 带 356.7ms），
> 两档均不作收益或回归主张；冷启动 **5220KB 传输／6952KB 解码**不变。

## 一、为什么：最后一张房内独占纹理

r41 把房内字体、结算变体与关卡 BGM 在离房时交还后，大厅里最大的房内独占项只剩 `chars-play`
（CharAssetsPlay，442.4KB PNG／10.75MiB 解码画布，182 帧）。它被房内十一式序列动画消费：

| 资源 | 键 | 驻留 | 消费点 | 大厅是否需要 |
|---|---:|---:|---|---|
| 角色播放序列帧 | `chars-play` ＋ 11 个全局动画键（`fire/water_*` 五式×2 ＋ `smoke`，共 163 帧） | 10.75MiB | 跑/跳/落/升/楼梯/烟雾序列；`buildCharAnims` 注册，`AnimationState` 按角色状态取键 | 否（大厅角色用 `chars`／`chars-entry`，不引用该键） |

与字体/BGM 不同，这张图有一层**全局动画键的失效模式**：Phaser `Animation` 在 `create` 时已把
帧名解析成具体 `Frame` 对象；纹理一卸，这些 `Frame.data` 即为 `null`，而 `buildSeq` 的 `exists`
幂等卫又拒绝重建——重进后会复现 r39 那类 `sourceSize` 空引用/画面定格静默回归。因此交还必须
**先摘十一式全局键、再卸纹理**，让重进时的 `ensureCharAnims` 在 `filecomplete` 之后从新纹理
完整重建。重取链是既有的：`GameScene.create` 里 `kickCharsPlay`（缺图则 `loadCharsPlay`）＋
`ensureCharAnims`（等图集到位后 `buildCharAnims`），不需要新增装载时机。

## 二、实施

| 件 | 内容 | commit |
|---|---|---|
| 键表 | [`BootScene.ts`](../../../packages/client/src/scenes/BootScene.ts) 增 `CHAR_PLAY_ANIM_KEYS`（11 键），与 [`buildCharAnims`](../../../packages/client/src/scenes/BootScene.ts) 的注册集一一对应 | `35cd1d3` |
| 交还 | [`GameScene.ts`](../../../packages/client/src/scenes/GameScene.ts) 增静态纯函数 `releaseCharsPlay(textures, anims)`：逐键 `anims.exists` 后卫 `anims.remove`，再 `textures.remove(ATLAS_CHARS_PLAY)`；顺序不可反（见 §一） | `35cd1d3` |
| 接线 | [`main.ts`](../../../packages/client/src/main.ts) 的 `leaveToMenu` 在 `releasePopupFinish` 之后、`sm.start("Temple")` 之前调用 | `35cd1d3` |
| 静态网 | [`leave-release.test.ts`](../../../packages/client/src/__tests__/leave-release.test.ts) 增 4 例：摘键先于卸图、键表三方一致（声明／测试清单／`buildCharAnims` 模板解析）、重取链完整（create→kick→ensure→build）、大厅零消费（Menu/Temple/Settings 不引用纹理、装载器或 11 键） | `35cd1d3` |
| 重进量具 | `perf-reentry` 增 `playKey`／`charAnimKeys` 字段：`presenceSnapshot` 记 `play` 与 11 键，落定门要求二者齐备，watch 记 `playMs`／`charAnimsMs`，离房断言 `released.play`、重进断言 `restored.play/charAnims` | `bfc21f3` |
| e2e | [`charsplay.mjs`](../../../scripts/e2e/charsplay.mjs) 增用例三：双人建/入同房 → 离房（等入场黑幕退场后触发）→ 大厅断言纹理与 11 键全部交还、字体/结算变体已交还、`bgm_menu` 仍在 → 用原房间码重进 → 163 帧全部来自新纹理、零 `__BASE`／零 stale Frame → 跑动零新增 Missing animation／TEX_WARN／页错 | `b59147d`、`f32e92a` |

**e2e 首跑超时的根因不是产品缺陷**：`leaveToMenu` 的 `fadeSwitch` 在入场黑幕（`XFade`）仍活动时
会整体丢弃离房触发（[`transition.ts`](../../../packages/client/src/scenes/transition.ts) 的 fading gate）。
首版用例在 `Game active` 后立刻调用，黑幕尚在 400ms 窗口内，离房被丢、Game 未停。用例改为
先等 `XFade` 不再活动再离房，并改双人房让 `started` 相位与真实 join 重进都发生；产品代码零改动。

## 三、驻留 A/B/A

臂 A/C＝r41 收口代次 `cae8578`，臂 B＝现役。三份快照 `resident-r42-resident-{a,b,a2}.json`
（`perf-reentry` 内嵌的驻留采样，六态同场交替）。

| 态 | 臂 A 纹/音/键 | 臂 B 纹/音/键 | A2 纹/音/键 | 结论 |
|---|---|---|---|---|
| menu（暖装落定） | 32.03 / 6.82 / 14 | 32.03 / 6.82 / 14 | 32.03 / 6.82 / 14 | 相同 |
| temple 首入（冷烘） | 42.27 / 6.82 / 14 | 42.27 / 6.82 / 14 | 42.27 / 6.82 / 14 | 相同 |
| temple 重进（命中） | 42.27 / 6.82 / 14 | 42.27 / 6.82 / 14 | 42.27 / 6.82 / 14 | 相同 |
| temple 三进（命中） | 42.27 / 6.82 / 14 | 42.27 / 6.82 / 14 | 42.27 / 6.82 / 14 | 相同 |
| game（开局静止） | 51.79 / 21.81 / 17 | 51.79 / 21.81 / 17 | 51.79 / 21.81 / 17 | 相同 |
| **temple 离房后（冷烘）** | **42.83 / 6.82 / 14** | **32.07 / 6.82 / 14** | **42.83 / 6.82 / 14** | **−10.76 / 0** |

- 差额就是 `chars-play` 一项：A 臂大厅 `texTop` 首项 `chars-play 10.75`；B 臂该项消失，
  剩余最大项为 `chars 5.07`、`TempleHall 4.00`、三张树结果各 3.41、`popup 2.88`、`temple 2.63`、
  `menu 1.66`。音频两臂同为 `bgm_menu 3.48` ＋ 13 支 SFX，共 6.82MB／14 键。
- 三份快照离房态 `presence`：A 臂 `play=true` 且 11 键全在；B 臂 `play=false` 且 11 键全 false。
- r41＋r42 合计：大厅离房态从 r41 前的 **53.35MB** 降到 **32.07MB**（纹理 −21.28MiB），
  音频从 21.81 降到 6.82MB（−14.99）。

## 四、重进代价

流程：进房 → 等字体/结算/循环 BGM/终局 BGM/`chars-play`/11 键全部落定（r42 落定门）→ 静置 1.2s
拍基线 → 离房回大厅 → 真实点击 `#btn-create` 重进。`t0` 取点击捕获，8ms tick 记首次出现。

### 可玩时刻（点击→Game active，ms）

| 档 | 轮次/臂 | Ā1 | B̄ | Ā2 | Δ＝B̄−mid(Ā) | A 带 | B 散布 | 判定 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| off | 4 | 1002.5（206.4） | 970.7（149.6） | 992.4（57.5） | **−26.8** | 10.1 | 149.6 | Δ在 A 带外方向偏快，但＜B 散布与 A 臂内散布 ⇒ 不足判定为收益 |
| slow3g | 2 | 1786.8（193.9） | 1754.8（155.1） | 2143.5（511.0） | **−210.4** | 356.7 | 155.1 | Δ在 A 带内 ⇒ 不主张 |

逐轮：off B 984.9/1031.5/881.9/984.3 对 A1 1053.8/957.2/1102.7/896.3、A2 1009.2/1009.1/999.4/951.7；
slow3g B 1832.3/1677.2 对 A1 1689.8/1883.7、A2 2399.0/1888.0。slow3g A2 首轮 2399.0ms 是慢网
跑间漂移（A2 自身散布 511.0ms），两档均按 r40 起的三闸门口径记录方向、不作收益或回归主张。

### 复原时刻（相对可玩时刻，ms）

| 资源 | off B（4 轮均值） | slow3g B（2 轮均值） | A 臂 |
|---|---:|---:|---|
| 房内字体 | **0**（与 Game active 同刻，preload 门内） | **0** | 点击前已常驻 |
| `chars-play` ＋ 11 键 | **+198.9**（111.7–270.5） | **+464.2**（454.9–473.4） | 点击时已在（watch 记 0） |
| 结算变体 | **+277.1**（263.1–310.0） | **+526.4**（517.2–535.6） | 点击前已常驻 |
| 关卡 BGM 开始播放 | **+279.4**（263.1–310.0） | **+526.4**（517.2–535.6） | 点击前已常驻 |

- off B 逐轮 `chars-play`：+181.1／+111.7／+270.5／+232.2；slow3g：+473.4／+454.9。
  11 键与纹理同刻（差 ≤0.1ms）。
- slow3g 的 `CharAssetsPlay.png` 请求 start→end 413.7–426.9ms（0.3KB 304 复验＋442.4KB 解码），
  即在可玩后约 0.46s 闭窗；off 档同项 2.7–5.5ms。
- 复原结果：每轮结束页内 **62.03MB／21.81MB／17 键**，字体、结算、BGM、`chars-play`、11 键
  五组标记全 true，与 A 臂房内态逐项相同；全部快照 `errors=[]`、`ok=true`。
- 线上增量：重进窗口 A **1.1KB → B 1.4KB（+0.3KB）**，请求 14→16 条。`CharAssetsPlay.png`
  无 `?v=` 版本参数（r37 清单只覆盖 mech 变体与字体），走一次 **304 复验 0.3KB**；
  `CharAssetsPlay.json` 0KB 为内存缓存命中。解码仍为 PNG 442.4KB＋JSON 52.6KB。
- 冷启动未变：两臂首进 `totalTransferKB=5220`、`totalDecodedKB=6952/6953`（差 1KB 为 JS 体积），
  初始态 51.79/21.81/17。

### e2e 功能取证（用例三，off）

离房后：`hasPlay=false`、11 键全 false、字体/结算变体 false、`bgm_menu=true`；
重进后：`hasPlay=true`、11 键齐、163 帧全部 `textureKey="chars-play"`、逐帧 `Frame.name ==
textureFrame`（零 `__BASE`）、在场角色对象几何全部对上产物 JSON；重建后跑动 900ms
**零新增 Missing animation／TEX_WARN／页面错误**。

## 五、客户端字节

| 代 | 入口 | raw | gzip-9 | brotli-11 |
|---|---|---:|---:|---:|
| A（r41 收口 `cae8578`） | `index-lL2vswjt.js` | 109,635B | 37,017B | 31,927B |
| B（现役） | `index-CwNMklE2.js` | 109,934B | 37,108B | 32,092B |
| Δ | — | **+299B** | **+91B** | **+165B** |

（Node zlib，level 9／quality 11，与 r39–r41 同口径。）

## 六、兼容与边界

- **释放只在离房**：`leaveToMenu` 是唯一入口；房内换关 `advance`、重开、结算继续都不经过，
  静态网钉住单一调用点。Game 活跃期间纹理与动画完整，帧绑定不受影响。
- **重进窗口合法且是已知形态**：Game active 时 `chars-play` 尚未到，十一式键不存在；此时按住
  方向键会走 r23 的良性降级（`Missing animation` 日志＋保持当前帧，入场姿势由 preload 的
  `chars-entry` 提供），纹理＋JSON 到位后 `ensureCharAnims` 立即重建。off 窗口 +111.7–270.5ms，
  slow3g 见 §四。e2e 断言的是"等到位后零新增缺失"，不是把窗口删掉。
- **摘键先于卸图**：`releaseCharsPlay` 内顺序由静态网钉死；否则重进时 `buildSeq` 的 `exists`
  卫会跳过重建，stale Frame 一路带播（r39 同类）。
- **大厅零消费**：Menu/Temple/Settings 不引用 `chars-play`、`loadCharsPlay` 或 11 键；
  `bgm_menu` 与 13 支 SFX 不受牵连。
- **304 而非 immutable**：`chars-play` 未进 r37 内容寻址清单，重进多 0.3KB 复验；若将来纳入
  清单则归零。当前不值得为此单开一轮。

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
| build | `index-CwNMklE2.js` 109,934B／gzip 37,108B |
| vitest | 32 文件/343 例全绿（leave-release 13 例，含 r42 新增 4 例） |
| det `--compare r0-baseline` | 48/48 位级一致 |
| fixtures | 6/6 PASS（oracle-gold maxDev 142.6879） |
| prephase-canvas | 5/5 PASS（产品指纹换代，像素逐字节不变） |
| roomtext forest_01／forest_12 | 6/6／5/5 面逐字节 |
| domskin／treebake／groundcache | 4/4／ALL PASS／ALL PASS |
| audiofamily | ALL PASS（两族互斥、终局时刻曲到齐窗口 0ms） |
| charsplay | ALL PASS（用例三：离房交还纹理＋11 键、重进 163 帧零 stale Frame、零新增告警） |
| journey | journey 7/7 · refresh 3/3 · wonrefresh 6/6 · deathretry 4/4 · rejoin 3/3 |
| route forest_01／forest_12 | 各 1 轮 won（winAt 39,517ms／12,986ms） |
| regression（zz_probe walkin-doors） | won=true，errors=0，sync=0，缺帧=0 |
| tilesprite forest_01／forest_24 | 1/1、8/8 对象 PASS；私有画布 1×1 |
| finish-anims | 8/8（general 变体重载、星碑动画、继续换关、全程 0 页错） |
| 重进与驻留门禁 | 6 份重进快照 18 轮 `errors=[]`；B 臂 `released.play` 全 true，18 轮 post 态 `play`＋11 键全 true；A 臂 `released.play` 全 false（未交还，符合两臂定义） |

门禁维护：`GameScene.ts` 增 `releaseCharsPlay` 后行号下移，`scripts/font-subset/room.mjs` 的时钟两钉
1640→1649、1678→1687，`font-roomblank.test.ts` 的 PARAMETERISED 1540→1549（逐行核对内容未变）。

## 八、结论

- **收益**：大厅离房驻留 **−10.76MB 纹理**（`chars-play` 整项），音频与键数不变；menu／temple
  首入／game 三态与冷启动字节逐项不变；r41＋r42 合计大厅从 53.35MB 降到 32.07MB。
- **代价**：重进线上 +0.3KB；`chars-play` 与 11 键在可玩后 0.11–0.27s（off）恢复，窗口内输入
  走既有良性降级。可玩时刻 off −26.8ms，未超 B 臂散布与 A 臂内散布，不作主张。
- **兼容**：摘键先于卸图 + 唯一离房入口 + 大厅零消费三张静态网；e2e 用例三覆盖离房/重进的
  纹理、键、帧解析与输入窗口；全套门禁见 §七。
