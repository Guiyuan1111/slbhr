# r15 · 冷启动/入房传输字节与缓存校验契约（2026-10-21）

> 战役第 15 轮。方向从 r12–r14 的"帧时间/驻留字节"切到**线上字节与缓存契约**：
> 本作实际经樱花隧道对外，回环口径的毫秒没有意义，唯一可信的度量是**每 URL 传输字节**。
> 零协议、零物理、零像素语义改动；服务端只改响应头与压缩，det 门禁位级不变即证。

## 一、量具（`benchmark/perf-load.mjs`，`754d136` + `aede24f`）

在既有 DCL/Menu/Game 里程碑之上补三件拆账能力：

| 新增字段 | 含义 |
|---|---|
| `resources.items[]` | 逐 URL：`transferKB`（线上实际字节）/`decodedKB`（解压后）/`startMs`/`endMs`/`phase` |
| `cold.headers[]` | 逐 URL 真实响应头：`status`/`cache-control`/`content-encoding`/`etag`（有/无） |
| `menuPhaseKB` / `gamePhaseKB` | 按 **URL 集合差**归段（Menu 快照的 URL 集之外的算进房段），不用时间对齐 |
| `revalidate` / `revalidateSummary` | Node 侧 `http` + keepAlive 复验探测：对每个幂等 URL 先无条件取一份，再带 `If-None-Match` 取一份，记 `refetchKB → revalKB` 与所有非 304 者 |

**两条口径纪律（勘误①②）**：
①页面 `performance.now()` 与 Node 墙钟**不可比**（导航起点不同、渲染进程时间基不同），
里程碑一律用 Node 墙钟、资源一律用页面时间基，两段之间**不做减法**；
②**复验探测不能在页内 `fetch` 做**——`fetch(..., {cache:"no-store"})` 会剥掉条件请求头，
Blink 实测连手工塞进去的 `If-None-Match` 也不发出，首版据此把 PNG/MP3 读成"带 ETag 仍 200 全量"，
是仪器伪差而非服务缺陷。改到 Node 侧后 47 个 URL 全部 304。

**探测避让**：`/matchmake/*`（会真建一间房）、`blob:`、文档 URL（`/?…`，会重复入房）不入探测集。

## 二、归因（基线 `benchmark/results/load-r15-base.json`，`e5dd5ee` 构建）

冷启动全链 **6942KB / 56 响应**，分两段：**Menu 段 4054KB（21 请求）**、进房段 2889KB（35 请求）。

| 事实 | 数字 |
|---|---|
| 二进制资源占进房+Menu 总传输 | 15 个 ≥64KB 的**未压缩**响应合计 **6148.5KB = 88.8%** |
| br 压缩路径的响应数 / 其中带 ETag | base：**14 / 0**；after：15 / 15 |
| 关卡数据 API | base：`/api/level/forest_01` 16.9KB、`Cache-Control` **缺失**、无压缩 |
| 24h 过期后必须回源的非 immutable 文本 | 8 个（图集 JSON×6、`font.fnt`、`temple.json`）合计 **17.9KB/次**；immutable 三件（`index/colyseus/phaser`）靠换名失效，不参与复验 |
| 单文件最大项 | `font.png` 1600.6KB、`LevelMusic` 1285.4KB、`CharAssets.png` 715.2KB（三者均为 br 无法再压的已压缩载荷） |

由此定出本轮两件可安全落地的事，并**明确排除**一条：

- 件B（契约修复）：0.3.21 把压缩响应改为自持 `res.end(buffer)` 后，**ETag/Last-Modified 一并消失**
  ——`express.static` 的校验器在这条路径上不再可达。凡走过 br/gzip 的文本响应，过期后只能整份重下。
- 件C（字节）：`/api/level/:id` 走 `res.json()`，无 `Cache-Control`、无压缩，是本关 16.6KB 原文上线。
- **排除**：二进制载荷再编码（WebP-lossless / AVIF / MP3 重压）。收益面 88.8%，但触及官方素材像素/听感
  一致性与老浏览器解码面——属兼容性红线，**须用户裁决**，本轮不擅自动手（已列待裁决）。

## 三、实施（两件，逐件独立提交）

| 件 | commit | 改法 |
|---|---|---|
| B 压缩路径补 ETag/条件请求 | `a29dde3` | `packages/server/src/staticGz.ts` 新增导出 `entityTag(st, encoding)`（**编码写进标签**：`"br-<mtimeHex>-<sizeHex>"`，同一 URL 的 br/gzip/identity 三种表示不可互换校验）、`matchesEtag`（弱标签 `W/` 剥除、逗号列表、`*`）、`isFresh`（ETag 优先，回落 `If-Modified-Since` 按 1 秒下限比较）。头部顺序改为先 `Content-Type/Cache-Control/Vary/ETag/Last-Modified`，命中即 `304` 且**不带** `Content-Encoding/Content-Length`（RFC 7232 §4.1）。压缩缓存失效键由 `mtime` 扩为 **mtime+size**，防同毫秒原地改写读到旧压缩包。 |
| C 关卡数据 API 协商压缩 | `fbc8ba3` | 新增 `packages/server/src/jsonRes.ts`：`sendJson(req,res,payload)` 序列化一次 → 内容寻址 ETag `"json-"+sha256[0:24]`（**编码无关**，与件B 的 mtime+size 标签不同族：原地可改的数据只能用内容做身份）→ `no-cache` + `Vary: Accept-Encoding` → 命中 `If-None-Match` 即 304；否则按客户端报价 br q5 / gzip6，且**仅当压缩后更小、原文 ≥1KB** 才带 `Content-Encoding`。`/api/levels`、`/api/level/:id` 接入；404/500 路径不动（错误详情仍只进服务端日志）。 |

**为什么 br q5 不落缓存**：现场测得 59,943B 文本 br q5 = 1.03ms、gzip6 = 0.56ms（此前 9.33ms 读数是 JIT 预热伪影）。
关卡 JSON 单房单次请求，服务端重压成本远低于 15KB 线上字节，故 `jsonRes` 不做包缓存，保持内容寻址的正确性优先。

**新增回归**：`packages/server/src/__tests__/staticGz.test.ts` 由 15 例扩到 **24 例**（br→200 再 304 且 0 体、
br 与 gzip 标签互不相同且跨编码必须 200、弱标签/列表/`*`、`If-Modified-Since` 前/后、原地改写换标签、
`entityTag` 稳定值）；新件 `jsonRes.test.ts` **6 例**（br/gzip/identity 三径、<1KB 不压、跨编码 ETag 相同、
payload 变更换 ETag、304 空体、头部策略）。

## 四、收益（同机同口径，`load-r15-base` → `load-r15-after`）

| 指标 | base | after | 差 |
|---|---|---|---|
| 关卡数据 API 传输（`/api/level/forest_01`，两轮一致） | 16.9KB | **1.8KB** | **−89.3%**（解码后 16.6KB 逐字不变） |
| 进房段传输 | 2889KB | 2873KB | −16KB（＝上面那 15.1KB，其余不动） |
| Menu 段传输 / 请求数 | 4054KB / 21 | 4054KB / 21 | 0（本轮不触及二进制载荷，符合预期） |
| br 响应带校验器 | 0/14 | **15/15** | 契约修复 |
| 复验探测（47 幂等 URL） | — | **6912KB → 0KB，非 304 者 0 个** | 全链可条件复用 |
| 其中"修复前只能整份重下"的子集 | 14 个无校验器文本响应 = **388.2KB**（解码 1911.2KB） | 0KB | 本轮回补的真实暴露面 |
| 页面错误 | 0 | 0 | — |

**隧道口径换算（把字节说成人话）**：2Mbps（≈250KB/s）下，单关数据 16.9→1.8KB 意味着每次进关少等约 **60ms**，
逐关浏览 20 关少约 1.1s；修复前的 14 个文本响应在硬刷新/过期场景要重下 388.2KB ≈ **1.55s**，现在 0。

**明确不主张的**：`menuActiveMs 800→716`、`点击建房→Game 1424.5→1477ms`、`reload 615.5→831.5ms`
三项**全部落在本机 ±120ms 噪声带内**，本轮不据此声称任何延迟收益；本轮的收益口径只有字节与头部契约。

## 五、门禁（全绿）

`npm run build`（4.42s，产物三 chunk 不变）、typecheck 0 错、**vitest 18 文件 191/191**（含 staticGz 24、jsonRes 6）、
**det 48/48 位级一致（对比现役基线 r32）**、**treebake 9/9**（三层金样 3784598315/64705792/1703026984 逐位命中、
重进免重传双证、阳性对照）、groundcache 6/6、journey 7/7、pause 11/11、leave 3/3、refresh 3/3、
wonrefresh 6/6、rejoin 3/3、rolesplit 6/6、deathretry 4/4、route f01 ALL PASS（winAt 39504ms，带内）、
visual-diff **91.54%**（带 90.0–92.9 内）、perf-client canvas 60.6fps / 1042KB·s⁻¹（对 r14 的 1044 零帧内回归）、
perf-advance 5/5 零网络·烘焙均值 19.3ms·链均值 1049.3ms。

## 六、勘误与血泪（三条）

1. **两个时钟不可比**：资源计时来自页面时间基，里程碑来自 Node 墙钟，任何"Menu active 减去首个请求"的
   跨基减法都是伪数据。归段改用 URL 集合差。
2. **页内 `fetch(cache:"no-store")` 会剥离条件请求头**（Blink 行为），用它测"服务端是否支持 304"必然得到
   假阴性，差点据此把件B 判成无效。校验类探测必须走 Node `http`。
3. **首版 `gamePhaseKB` 恒为 0**：phase 是打在 Menu 快照上的，进房段新增 URL 从未被赋值。改从
   `resourcesAfterGame.items` 反算并**重取基线**，否则报告里进房段是空的。

## 七、挂账（r16 起）

- **待用户裁决**：二进制载荷再编码——WebP-lossless / AVIF 对图集 PNG、MP3 重压对音频。
  面额已量：15 个 ≥64KB 未压缩响应 = 6148.5KB（总传输的 88.8%），其中 `font.png` 1600.6KB、
  `LevelMusic` 1285.4KB、四张图集 PNG 合计 1814.1KB。触及官方素材一致性与老浏览器解码面，不动。
- **下一轮候选（本轮量具已给证据）**：进房段 1214→1298ms 一次性拉 22 个请求 / 2.87MB，其中
  `LevelMusicFinish`(164KB)、`LevelMusicOver`(159.9KB)、`LevelMusic_speed`(107.5KB)、
  `LevelMusicFinish_speed`(69.2KB) 属**结算/速度模式才用**的轨，共 500.6KB 压在开局关键路径上；
  按"开局必需 / 相位到达再取"分池可直减进房段 ≈17%。
- `font.png` 线已用数字关闭（alpha 包围盒 98.7% 裁剪无收益、6264 个唯一 RGBA 色不能走调色板、
  libpng L9 已接近现产物尺寸、字形子集实测 −5.2% 低于 20% 停线）。
- perf-load 的**隧道节流档**（`--rtt` / CDP network emulate）仍未实现——本轮所有字节收益都是
  "换算"而非"实测延迟"，这条是口径缺口。
- 既有：真机 GPU 口径 `texMB`/烘焙峰值、`prepareGround/buildGround` 命中计数、换关链剩余 ≈45ms、
  服务端 tick 侧候选、LAN 剪贴板/BGM 听感/真机触屏弱网手测。

版本仍 0.3.42（战役轮随 0.3.43 发版一并收口）。总账见 `2026-10-18-campaign-summary.md` §十二。
