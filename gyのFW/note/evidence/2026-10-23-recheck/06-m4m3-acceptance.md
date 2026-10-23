# 06 · M4/M3 自动化验收补全（0.3.41 审计档遗留项）

- 日期：2026-10-23
- 执行槽：2 号槽（预处理备料；不做通关路线/门禁/可达性裁决）
- 来源挂账：`note/audit/2026-10-21-code-audit/04-fix-log.md` §3——「剪贴板仅做代码路径与回退审查，未在局域网 HTTP 浏览器手测；速度关 BGM 未做听感验收」
- 验收基线：commit `8b218cf`（含 ec3e057 的 M12 GameScene 相机接线重构；BGM 选曲路径 bgmKey/templeType 未受该重构影响，实测亦验证）
- 纪律：本轮**未修改 GameScene.ts / audio.ts / net.ts**；journey.mjs 仅新增 `bgm` 场景分支 + 头部用法注释 + startServer 环境选择 + 末尾模式清单，未动任何既有场景分支

## 0. 产出物

| 文件 | 说明 |
|---|---|
| `packages/client/src/clipboard.ts` | 新增：`copyText(text): Promise<boolean>`（9fc2bb3 内联回退逻辑原样抽函数） |
| `packages/client/src/__tests__/clipboard.test.ts` | 新增：7 例单测（node 环境最小 stub，无 jsdom） |
| `packages/client/src/main.ts` | 仅改 `#btn-invite` 点击回调一处调用点（import copyText）+ 顶部 import |
| `scripts/e2e/journey.mjs` | 新增 `bgm` 独立场景分支（+97/−2，含注释） |
| `note/evidence/2026-10-23-recheck/06-e2e-bgm.json` | bgm 场景末次运行原始结果（pass=true, 12 checks） |
| `note/evidence/2026-10-23-recheck/06-m4m3-acceptance.md` | 本档 |

提交：任务 A `e6a47e8`（test(client): M4 剪贴板回退抽 clipboard 模块+单测）；任务 B 见本档同提交。

## 1. 任务 A：M4 剪贴板回退自动化

### 1.1 模块行为（clipboard.ts）

`copyText(text)`：空文本守卫直接 `false` → 特性检测 `navigator.clipboard?.writeText` → 可用则 `await writeText`（同步 throw 与 reject 都由 await 捕获）成功返 `true`，失败落回退 → 回退=textarea（readonly/fixed/opacity:0）+`select()+setSelectionRange(0,len)`+`document.execCommand("copy")`，try/catch 包裹、finally 必 `ta.remove()` → 双失败返 `false`。绝不 reject、绝不向外抛。与 9fc2bb3 内联实现逐行等价（新增仅空文本守卫）。

main.ts 调用点（main.ts:536-545 附近）：`void copyText(invite).then((ok) => flash(ok ? "已复制" : "复制失败"))`，按钮反馈语义不变。

### 1.2 用例清单与结果

命令：`npx vitest run packages/client/src/__tests__/clipboard.test.ts` → **7/7 绿**（10ms）。

| # | 用例 | 断言要点 | 结果 |
|---|---|---|---|
| 1 | clipboard API 可用成功 | 返 true；writeText 收到原文；createElement/execCommand 均未被调用（未触回退面） | 绿 |
| 2 | clipboard undefined（局域网 http 主场景）走回退成功 | 返 true；textarea value/readonly/fixed/opacity:0、appendChild、select、setSelectionRange(0,len)、execCommand("copy") 逐项到位；finally remove | 绿 |
| 3 | execCommand 返 false | 判失败返 false 不抛；textarea 照常清理 | 绿 |
| 4 | writeText reject（权限被拒） | 自动落回退并成功返 true | 绿 |
| 5 | 双路径皆抛（reject + execCommand throw） | 异常被捕获返 false，绝不向外抛；textarea 清理 | 绿 |
| 6 | writeText 同步 throw（非 Promise reject） | 同样被 await 捕获落回退成功 | 绿 |
| 7 | 空文本守卫 | 直接 false；writeText/createElement/execCommand 均未触碰 | 绿 |

配套门禁：`npm run typecheck` → **0 错**。

### 1.3 仍不可自动化的部分（如实说明）

- **真实非安全上下文的端上验证仍缺**：e2e 套件走 `http://127.0.0.1`，属浏览器安全上下文，`navigator.clipboard` 恒存在，无法在 Playwright 内复现「clipboard undefined 走 execCommand」的真浏览器行为（Chromium 无「把 localhost 视为非安全上下文」的开关）。该分支已由用例 2-6 在 stub 层行级覆盖，但 `document.execCommand("copy")` 在真实浏览器中返回 false 的实际触发条件（如部分浏览器的弃用告警行为）stub 无法代表。局域网首用时仍建议人工点一次「复制邀请链接」看按钮反馈（预期：已复制）。
- 剪贴板**内容**是否真的进了系统剪贴板：headless 下无真实剪贴板可读断言，不在本轮范围。

## 2. 任务 B：M3 速度关 BGM 键程序化断言

### 2.1 观测面调查结论（只读，未改 GameScene.ts/audio.ts）

**可观测，无需暴露面改造。** 页面侧链路：`window.__fw`（Phaser.Game，既有 e2e 已在用）→ `scene.getScene("Game")` → `sound.isPlaying(key)`（Phaser SoundManager API，GameScene.applyMusicSetting 同款用法，GameScene.ts:509）与 `templeType` 字段（GameScene.create 由 `__fwInit.templeEntry` 同步赋值，GameScene.ts:347-352；`fetchTempleTime` 异步兜底同值）→ 辅助锚点 `cache.audio.exists(key)`（sfx 对缺键静默跳过，GameScene.ts:516-521，故 exists 必须一并断言以排除假阴性）。

BGM 键选择：`bgmKey()` = `templeType === "speed" ? "bgm_level_speed" : "bgm_level"`（GameScene.ts:486-488）。audio.ts 映射：`bgm_level → LevelMusic.mp3`（1,315,960B, md5 16d66cc4…）、`bgm_level_speed → LevelMusic_speed.mp3`（109,824B, md5 496bd2a3…）——两曲为不同文件，键正确即曲正确（内容级听感仍属人工，见 §2.4）。

### 2.2 场景设计（scripts/e2e/journey.mjs `bgm` 分支）

命令：`node scripts/e2e/journey.mjs bgm --port 3661`（服务端 `FW_DEBUG_FORCE_DOORS=1`，与 journey 模式同分支）。

断言链（双端 A/B）：
1. `forest_01`（temple.json id=1, type=general）双端入房 → started → 任一关卡 BGM 在播 → 快照断言：`bgm_level` 在播、`bgm_level_speed` 不在播（普通关不误切）、`templeType=general`；
2. FORCE_DOORS 通关（phase=won）→ 双端 `__fwNextLevel` 活房间 advance → `forest_02`（type=general；advance 走 main.ts `onLevelId → reloadLevel` 注入 templeEntry 路径）→ 断言仍 `bgm_level` 不误切；
3. 再通关 → advance → `forest_03`（temple.json id=3, **type=speed**, time=25）→ 断言 `bgm_level_speed` 在播、`bgm_level` 不在播、`templeType=speed`。

换关稳定器：advance 后等「`XFade` 已灭（换关 ops 同步执行完：旧 Game SHUTDOWN 停全部 BGM → 新 Game create 选曲）且关卡 BGM 在播」合并条件（35s 超时），此后采样到的在播键必属新关——排除 won 演出（playStairsSequence 停关卡曲播终局曲）与黑幕期残留的采样歧义。advance 链包 try/catch，超时记 check 失败并照常落盘结果（不裸抛丢报告）。

### 2.3 运行结果

- 对 `8b218cf` 构建（隔离 git worktree @ TEMP/m4m3/wt，与并行槽未提交改动隔离）：**12/12 ALL PASS，连续 2 轮**（第 1 轮曾因旧版等待链语义失真失败，改进后两连绿，见 §2.5）。
- 末轮原始断言（06-e2e-bgm.json，均附快照 JSON detail）：

| # | 断言 | detail 要点 | 结果 |
|---|---|---|---|
| 1-2 | forest_01 A 端 BGM 键=bgm_level 且不误切 / templeType=general | `{"templeType":"general","levelBgm":true,"speedBgm":false,"levelInCache":true,"speedInCache":true}` | 绿 |
| 3-4 | forest_01 B 端同上 | 同上 | 绿 |
| 5 | FORCE_DOORS 通关 forest_01 | phase=won | 绿 |
| 6-7 | forest_02（advance 换关）A/B 端仍 bgm_level 不误切 | templeType=general, levelBgm=true, speedBgm=false | 绿 |
| 8 | FORCE_DOORS 通关 forest_02 | phase=won | 绿 |
| 9-10 | forest_03（speed）A/B 端 BGM 切 bgm_level_speed | `{"templeType":"speed","levelBgm":false,"speedBgm":true,"…Cache":true}` | 绿 |
| 11-12 | forest_03（speed）A/B 端 templeType=speed | templeType=speed | 绿 |

结论：**速度关专属曲切换（M3）在键选择层验收通过**——普通关（forest_01/02，含 advance 换关注入路径）不误切，speed 关（forest_03）切 `bgm_level_speed` 且普通曲不在播，双端一致。

### 2.4 仍不可自动化的部分（如实说明）

- **听感验收本体**：本断言覆盖「键选择→文件映射→装载→在播」全链，但不验证音频内容听感（音量/循环接缝/与原版 LevelMusic_speed.mp3 的听感一致性）。键→文件映射与文件字节/md5 已程序化核对（§2.1），若需内容级比对可对 oracle 素材做文件级 diff（本仓库素材即官方原文件，md5 已记录在案）。
- BGM 实际可闻性（浏览器自动播放策略/WebAudio unlock）在 `--mute-audio` headless 下不可断言；isPlaying 为 Phaser 侧状态，不含出声验证。

### 2.5 过程记录（排障）

- 首版等待链为「等关卡 BGM 全停 → 等在播」，在 forest_01 通关后 advance 处 20s 超时。诊断脚本（TEMP/m4m3/bgm_debug.mjs，已随临时目录清理）实测定位：won 时 `playStairsSequence` 已主动停关卡曲（GameScene.ts:1578-1583），「全停」闸在 advance 前即满足，语义失真；且首跑有 GL ReadPixels GPU stall 拖慢帧轮询。改为 §2.2 的 XFade 合并条件后两连绿。该排障未改动任何业务代码，仅调整 e2e 场景等待语义。

## 3. 环境与可复现性

- node v22.22.1，playwright chromium-1243（headless，--mute-audio），端口 3661（3662 仅排障）。
- e2e 运行采用隔离 worktree（`git worktree add TEMP/m4m3/wt 8b218cf` + symlink node_modules + `npm run build`），原因：执行期间主会话正在 GameScene 上有未提交改动（后以 ec3e057 落地），隔离保证验收产物只含已提交状态。主仓库 journey.mjs 补丁与 worktree 内实跑文件逐字节同源（TEMP/m4m3/journey-bgm.patch 生成流程可复现）。
- TEMP/m4m3 已清理。
