# 41 · 中文字形覆盖缺口：空白字分两群，一群照抄原版、一群是我方自创（41-chinese-font-glyph-coverage）

> 触发：r18 字体两段化把"进房前只需 75 个字符"量化时（[报告](../../report/perf/2026-10-21-r18-font-two-phase.md) §七），
> 逐码位核 `font.fnt` 发现其中 22 个没有字形。本档把"这是原版的观感还是我方的缺口"定谳。
> **本文所有断言均由本会话逐条复算/比对得出，并附可复跑命令。**
> 只取证、未改码；处置需用户裁决。

## 一、素材同一性（逐字节）

| 侧 | 文件 | 结论 |
|---|---|---|
| 官方 | `Fireboy-and-Watergirl/output/A/assets/fonts/chinese/font.png` | 1,638,701 B |
| 我方 | `packages/client/public/assets/fonts/chinese/font.png` | **`cmp` 无差**＝官方那份中文字体图集原样入包 |
| 官方 | `…/chinese/font.fnt` | `<char>` 261 条（id=32 重复两次，皆 0×0 空格）⇒ 去重 260 个码位 |
| 我方 | `…/chinese/font.fnt` | 码位集合与字段**逐条相同**，唯一差异是**行尾 CRLF→LF**（`cmp` 首差在第 7 字节） |

复跑（官方树 `Fireboy-and-Watergirl/` 是 `gyのFW/` 的同级目录；下列命令均**从工作树根 `/…/slbhr` 执行**）：

```bash
cmp Fireboy-and-Watergirl/output/A/assets/fonts/chinese/font.png \
    gyのFW/packages/client/public/assets/fonts/chinese/font.png        # 静默＝逐字节相同
cmp Fireboy-and-Watergirl/output/A/assets/fonts/chinese/font.fnt \
    gyのFW/packages/client/public/assets/fonts/chinese/font.fnt        # 首差第 7 字节＝CRLF→LF
```

⇒ 字形覆盖面的天花板由**官方资产**决定，我方没有削减过任何字形。

## 二、官方中文版自己就会画空白

关键前提：**原版中文包不是 DOM 渲染，而是同一张 canvas 位图字**。官方把这份中文字体注册成四个键，
全部指向同一 png+fnt（`note/reverse/oracle-a/init.beautified.js:77922-77925`）：

```js
this.game.load.bitmapFont("font",            "assets/fonts/chinese/font.png", "assets/fonts/chinese/font.fnt");
this.game.load.bitmapFont("fontStone",       …同…);
this.game.load.bitmapFont("font_large",      …同…);
this.game.load.bitmapFont("fontStone_large", …同…);
```

而 `utils/lang/ch`（`note/reverse/oracle-a/modules/utils_lang_ch.js`，`init.beautified.js:77980-78008`）是内置**中文字典**
（`Play: "开始游戏"`、`congratulations: "恭喜！"`…），`utils_lang_Lang.js` 把它挂成 `game.lang.locale()`；
文案取到之后走 `game.make.bitmapText(..., "font", …)`——即上面那张 260 字形的图集
（`States_Complete_GameCompleteMenu.js:17,20`；`States_Credits_CreditsMenu.js:22-23`；`States_Settings_SettingsMenu.js:28,52`）。

把**官方自己的字典值**拿去查**官方自己的图集**，缺口如下（§四脚本可复跑）：

| 官方字典键 | 官方中文值 | 官方 A 图集渲染结果 |
|---|---|---|
| `congratulations` | 恭喜！ | 「恭喜」两字空白，只剩「！」 |
| `you_completed` | 你完成了比赛 | 「你比赛」空白 |
| `credits_to` | 所有学分都会去 | 「所学去」空白 |
| `unlock_all` | Unlock all levels! | `U` `k` `!` 空白（ASCII 侧本来就不全） |

⇒ **原版的中文界面本身就带空白字洞**，这不是我方独有现象。图集是"按当时用到的部分文本反推生成"的产物，
不是全量字库：260 码位＝217 汉字 + 43 ASCII，ASCII 侧仅
`space " & , 0-9 : ? A D J O P S T V W a b c d e g i l m n o p r s t u v`（缺 `L`、`.`、`k`、`!` 等）。

官方另有变体：`output/E/assets/fonts/chinese/font.fnt` **315 码位**，比 A 多出 55 个汉字
（含 恭、喜、你、比、赛、学、所、去、头、路…），但同时也**丢了 A 有的 `c`、`g` 两个 ASCII**；
且 E **仍然没有** 设、置、音、乐、效、员、基、于、本、复、刻、原、版、暂。

## 三、我方空白调用点分群定谳

先给判据：一段中文文案如果**官方 bundle 里搜得到同字面**，则它的空白属于"原版观感"；
如果**官方压根没有这段文本**（原版此处是图标、图片位图帧或英文），则空白是我方自创文案的缺口。
`grep -rl` 全变体 A 目录（含 `js/init.eb02fbdab2aa1d24.js` 打包体）逐条命中数：

```
音乐 0  设置 0  音效 0  制作人员 0        ← 全树零命中
恭喜 1  你完成了比赛 1  所有学分都会去 1   ← 命中的那 1 处即 utils/lang/ch 字典
```

| 群 | 我方调用点 | 文案 | 260 图集 | 判定 |
|---|---|---|---|---|
| **G1 我方自创** | `menus.ts:29` | 设置 | 两字全缺 | 原版 SettingsMenu 只有一个 `"or"` 字面（`:28`）＋ Ok 钮，标题与"音乐/音效"文字标签**不存在**（开关是图集图标）⇒ 我方移植时新增的中文标签，图集里从来没有 |
| **G1** | `menus.ts:62,63` | 音乐 / 音效 | 三字全缺 | 同上 |
| **G1** | `menus.ts:80` | 制作人员 | 缺「员」 | 原版 CreditsMenu 标题位不是这串字；我方自拟 |
| **G1** | `menus.ts:81` | 本复刻基于原版游戏 | 缺「本复刻基于原版」7 字 | 我方自拟致谢行 |
| **G1** | `transition.ts:26,43` | `Loading...` | 缺 `L` 与 `.` | 原版 `States_Common_LoaderBar.js:19,25,28` 是 **PreloaderAssets 纯 sprite**（`LoaderBar/LoaderHolder/LoaderTitle` 帧），**没有任何文本**⇒ 整串是我方造的，且照抄官方字面也补不出 `L`/`.` |
| **G2 与原版同形** | `menus.ts:124` | 恭喜！ | 缺「恭喜」 | **与官方 `congratulations: "恭喜！"` 逐字相同**，官方走同一图集 ⇒ 原版 A/B/C/D 同样只显「！」；`output/E` 的 315 图集可补齐 |
| **G2′ 我方改写放大** | `menus.ts:125` | 你完成了全部挑战 | 缺「你全部挑战」 | 官方原串是「你完成了比赛」（缺 3 字）；我方改写成同义中文后缺字从 3 涨到 5，洞是我方挖大的 |

⇒ 结论必须**分两群各自表态**，不能用一句"都是我方缺口"或"都忠实原版"覆盖：
- **G2（1 处）**：空白是原版观感，照抄即一致；且有官方现成修法（换 E 的 315 字图集）。
- **G1（5 处）**：原版没有这段文本，图集自然没有这些字 ⇒ 我方呈现层缺口，**任何官方图集都补不出**（含 E）。
- **G2′（1 处）**：形式上属我方缺口（改写入洞），语义上属原版有过的洞。

另外确认与 r18 无关：子集 `font-prephase.png` 的字符集 ⊆ 全量 260，
`font-prephase.test.ts:185` 钉的是"进房前每个字面字符都在**声明清单**内"（清单＝75 字符，含无字形者），
所以上表所有空白在两段化之前就存在，**r18 没有新增任何一个洞**。

## 四、可复跑核法

```bash
python3 - <<'PY'
import re
def ids(p): return {int(m) for m in re.findall(r'<char id="(\d+)"', open(p,encoding="utf-8",errors="replace").read())}
A=ids("Fireboy-and-Watergirl/output/A/assets/fonts/chinese/font.fnt")   # 260
E=ids("Fireboy-and-Watergirl/output/E/assets/fonts/chinese/font.fnt")   # 315
for s in ["设置","音乐","音效","制作人员","本复刻基于原版游戏","Loading...",
          "恭喜！","你完成了比赛","你完成了全部挑战","所有学分都会去"]:
    a="".join(dict.fromkeys(c for c in s if ord(c) not in A))
    e="".join(dict.fromkeys(c for c in s if ord(c) not in E))
    print(f"{s!r:20} A缺{a!r:10} E缺{e!r}")
PY
# 归属判据（命中数 0 ⇒ 我方自创；1 ⇒ 官方字典自带）
grep -rl 音乐 Fireboy-and-Watergirl/output/A | wc -l     # 0
grep -rl 恭喜 Fireboy-and-Watergirl/output/A | wc -l     # 1（utils/lang/ch）
```

我方静态防护网已把进房前那 75 个字符钉成清单：`packages/client/src/__tests__/font-prephase.test.ts`（11 例）
＋ `scripts/font-subset/prephase-chars.json`；文案改字而清单未同步，测试即红。

## 五、勘误两份委托取证（都不可采信，方向相反）

本轮派子 agent 取证两次，结论互斥，**两处均有虚构**，本档一律以本地复算为准：

1. 第一份：`assets/f32b179ea656fe4c.png`、`assets/060b76656504f76d.png`、`assets/851a860d3b70b782.jpg`、
   `GameStrings.js:117`、`index.html:5 lang="zh"`、`:51 .font{MS YaHei}` **逐条不存在**（官方 assets 下无此文件名；
   我方 `font.fnt` 的 sha256 也不是它给的 `b8529149…`；它把 bundle 的**字节数**当行数、**字节偏移**当行号）。
   它的"官方用 DOM/系统字体渲染中文"经本地复核为**无据**：`grep -rl YaHei` 在官方变体 A 全树 **0 命中**，
   该字面只出现在我方 `packages/client/index.html:28,313,494` 的 DOM 皮肤 CSS 里；
   官方中文文案确实走 `bitmapText(…,"font",…)`（§二），与 DOM 无关。
2. 第二份方向对（"原版自己也空白"成立，§二 的字典/图集对拍即它提出后由本地复算确认的），
   但它两处外延**核验为假**：① 它暗示换 `output/E` 图集能顺带解决设置/音效一类标签——实测 E 仍缺
   设、置、音、乐、效、员、基、于、本、复、刻、原、版、暂；② 它说 E 补上 `Loading...` 的 `.` 与 `L`——
   实测 E 有 `.`（但我方 `overlays.ts:186` 用的是官方繁体「暫停」，两侧都有、本就不是洞），**`L` 两侧都缺**，
   而且 E 反而丢了 A 有的 `c`、`g`。⇒ 换图集不是免费午餐，它只补 G2 那一类字。

⇒ 教训入档：子 agent 报告的每个文件路径、哈希与命中数都必须回本地 `ls`/`sha256sum`/`cmp`/`grep -c` 复核后才可写入文档；
它的**方向性结论**（无论"都是我方缺口"还是"都忠实原版"）都不构成证据，只有逐码位集合运算构成。

## 六、处置选项（待用户裁决，未动码）

按群分别裁，不必一刀切：

1. **G2（恭喜！）**：两条零风险路——(a) 维持现状（与原版 A/B/C/D 同形，属"忠实"）；
   (b) 把官方 `output/E` 的 315 字图集作为**字形来源**，把 恭/喜 两帧逐字节抄进我方图集＋`.fnt`
   （E 已证明这两个字的官方墨迹存在，代价是资产换代与一次 prephase-canvas 换代流程）。
   注意 (b) 只补 2 个字，**不能**顺带补 G1。
2. **G2′（你完成了全部挑战）**：**改回官方原串「你完成了比赛」**可把缺字从 5 降回 3（零新墨、零资产改动），
   或改写到 260 字集内凑出全显说法（例如逐条试「完成」类近义词）。
3. **G1（设置/音乐/音效/制作人员/致谢行/Loading…）**：四选一——
   ① **改文案到官方 260 字集内（推荐，零新墨、零资产改动、仍在 canvas 路径）**：约束可满足但需逐条试，
   例如「制作人员」只差「员」而「设置」两字全缺（可能得换成图集内已有的说法或退回图标）；
   官方压根没这些标签，无对照物，措辞由我方定。
   ② **为缺失字合成字形**（生成新墨＋改 `.fnt`）：外观有意变更，须走 prephase-canvas 换代三步流程，
   且破坏"我方 `font.png` 与官方逐字节全等"这条既有事实（§一）。
   ③ **退回非 canvas 呈现**（DOM/系统字体画这些标签）：与"界面文字统一走位图字"的现有形态不一致，属结构改动。
   ④ 维持空白：用户看到标题/开关行缺字。
4. 任何选择都**不影响** r19 字体图集重排（重排只动帧坐标、不动字形墨迹）；但选 ② 会让重排产物的换代流程多一道。

关联：性能面见 [战役总结 §十五/§十六](../../report/perf/2026-10-18-campaign-summary.md) 与
[r18 报告 §九](../../report/perf/2026-10-21-r18-font-two-phase.md)。
