# r7f font.png 子集化——普查完成、两方案均低于停止线、保留原资产

- 日期：2026-10-19　槽位：r7 轮 f 槽（font 子集化）　基线 HEAD：aea9d69
- 结论先行：**未应用任何子集化，生产资产零改动**（`assets/fonts/chinese/font.png` 两处副本 md5 均为 `18fdc06b47e7893d1e6ae0ebc1263e1b`，与 HEAD blob 一致）。普查与方案 A 实测显示收益上限远低于派发设定的 20% 停止线，按"如实回报并保留原资产"规则收兵；普查工具、保留清单、防护网测试入库备用。

## 〇、授权记录

- 用户已明确授权破"资产内容红线"做 font 子集化——仅限本项目私用，不得外发衍生资产。
- 实际执行中**未走到需要破线的一步**：未生成也未提交任何衍生 font 资产；本轮入库的只有普查工具/清单/测试/报告（全是自研文本件）。
- 资产版本事实：规范资产在 `assets/fonts/chinese/`（git tracked，`gyのFW/.gitignore` 只排除同步产物 `packages/client/public/`）；`packages/client/public/` 是 `scripts/sync-assets.mjs` 的复制目标，手改会被 `npm run dev/build` 的 sync 覆盖。
- 量具口径修正：font.png 实为 **2191×1024 RGBA**（font.fnt `scaleW=2191 scaleH=1024`），非派发消息猜测的 2048²。

## 一、字形普查（四源保守口径）

工具：`scripts/font-subset/census.ts`（零 npm 依赖；词法级字符串字面量扫描，注释不收——只有字面量才可能被渲染）。

| 源 | 范围 | 去重字符数 |
|---|---|---|
| ① client | `packages/client/src` 全部字符串字面量（含模板串静态段） | 395 |
| ② server/shared/data | `packages/{server,shared}/src` 字面量 + `data/` JSON 解析后全部字符串值/键 | 439 / 159（data） |
| ③ tools | `scripts/` + `benchmark/` 字面量与 JSON（e2e 注入文本面） | 915 |
| ④ oracle | `../Fireboy-and-Watergirl` 全部 JSON 解析后字符串值（358 文件，只读） | 284 |

- 并集 1082 字符；与 font.fnt 的 260 字形求交 → **保留 247，可清零 13**（`\r` 宽 0 无像素 + `勇和圣寒尚思操攻特看说谢` 12 个实字形）。
- 教学文本链路核实：`GameScene.ts:1184` 用 FONT_MAIN 渲染 `level.tutorials[].texts`，文本来自我方 Tiled 图 `layer.objects[].text.text`（data/tutorials/levels/forest_01.json、data/forest/levels/forest_bonus_1.json 等 33 条）。
- **普查方法论教训两条（已固化进 census.ts 注释与逻辑）**：
  1. 我方 Tiled 图把中文存成 `\uXXXX` 转义（原始字节全 ASCII），raw 文本扫描会整体漏掉教学文本——必须 JSON.parse 后取字符串值。首版普查栽在这里（data 源 0 非 ASCII 假象）。
  2. 普查工具自身（含 MUST_RENDER 固化串）若在扫描范围内，"MUST_RENDER ⊆ 保留集"断言自密封恒真——负测实证后已把 `scripts/font-subset/` 与 `font-subset.test.ts` 排除出扫描面。

## 二、方案与减幅（全部实测）

保留清单下被清零字形面积 91,291px，占 canvas 4.07%；保留字形占声明字形总面积 94.79%（1,662,613 / 1,753,904px），字形总面积占 canvas 78.17%。

| 变体 | 字节 | 减幅 | 说明 |
|---|---|---|---|
| 原版 | 1,638,701 | — | XMP/dpi 元数据已在，RGBA 全量 |
| v2 仅重存（剥元数据 + PIL optimize） | 1,622,024 | -1.0% | 原 PNG 压缩已近饱和 |
| **v3 方案 A（清零 12 实字形，fnt/坐标逐字不动）** | **1,553,047** | **-5.2%** | 派发口径的方案 A 实测 |
| v4 = v3 + 全图 alpha==0 像素 RGB 归零 | 1,317,058 | -19.6% | 越出方案 A 字母（动了保留字形矩形内的透明像素）；Phaser 默认 LINEAR 过滤下透明纹素 RGB 有"幽灵混色"理论风险，未采用 |
| 方案 B（重排小图集） | ≈1.55MB | 上界 ≈-5% | 面积数学封死：保留字形面积占 94.79%，重排省不出 20% |

**判定：A=-5.2%、B 上界 ≈-5%，双双低于 20% 停止线 → 保留原资产，不破线。**（派发预期 -1.2MB 级收益的前提是字库含大量未用字形；实测原版 260 字形几乎全部仍被四源普查覆盖——它是按原版游戏实显集子集化的，我方复刻显示同一批文本。）

## 三、门禁（红线仪式，改动为零仍全跑）

| 门禁 | 命令 | 结果 |
|---|---|---|
| typecheck | `npm run typecheck` | 绿 |
| vitest | `npm run test` | 89/89（5 文件，含本槽新增 4 断言） |
| det 位级一致 | `node --import tsx benchmark/perf-determinism.mjs --compare r0-baseline` | 48/48（48 关合计 2.0s） |
| fixtures | `node --import tsx scripts/e2e/routetool/fixture-runner.mjs` | 6/6 PASS |
| visual-diff | `node --import tsx benchmark/visual-diff.mjs` | 90.01（基线 89.42 同带；结果快照 `benchmark/results/visual-{original,ours}.png` 已刷新） |
| perf-load r7-font | 未跑 | **不适用**：资产零改动，跑了就是测恒等；如未来应用 v3，预期收益仅冷启传输约 -85KB（占 font.png 当前 3674KB 总传输的 -2.3%），请求数/时点不变 |

## 四、入库件与再生方法

```
scripts/font-subset/census.ts        # 四源普查（CLI：node --import tsx scripts/font-subset/census.ts [--check]）
scripts/font-subset/subset.py        # 方案 A 再生工具（python3+PIL；从钉死 git blob 取原始 PNG，逐位校验）
scripts/font-subset/used-chars.json  # 保留清单（247 码点 + fnt 字形集指纹 + 分源计数）
packages/client/src/__tests__/font-subset.test.ts   # 防护网 4 断言（负测验证会红）
note/report/perf/2026-10-19-r7-font-subset.md       # 本报告
```

未来要真正子集化时（例如新增文案后字形集变化、或改用方案 B）：

```bash
node --import tsx scripts/font-subset/census.ts                                  # 1. 刷新保留清单
python3 scripts/font-subset/subset.py --out TEMP/<槽>/font.subset.png            # 2. 生成子集（不动生产）
# 3. visual-diff 实证（清零区与保留字形相邻处 LINEAR 过滤边缘需实证）→ 通过后覆盖
#    assets/fonts/chinese/font.png（tracked 规范路径，勿手改 public/ 同步产物）→ commit
# 4. 门禁：typecheck + vitest + det 48/48 + fixtures 6/6 + visual-diff 同带
```

防护网语义：新增会渲染的文案而不重跑普查 → 断言 2 红（清单漂移）；普查扫描器对会渲染的字符失明 → 断言 1 红（MUST_RENDER 固化串兜底，已排除自密封）；font.fnt 被换 → 断言 3 红。

## 五、存疑与挂账

- 12 个可清零字形（`勇和圣寒尚思操攻特看说谢`）在四源中零出现，判定为原版 UI 变体残留；若未来关卡 JSON/文案引入它们，census 重跑 + subset 再生即可覆盖，无风险敞口。
- v4（alpha0-RGB 归零，-19.6%）未采用：即便 LINEAR 过滤的幽灵混色被 visual-diff 实证无害，也仍低于 20% 停止线，不值得动保留字形矩形内的像素。
- 本轮未动 `benchmark/perf-client.mjs`（工作树中其改动属 r7r 渲染探针槽，非本槽产物）。
