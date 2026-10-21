# r19 件1 换代证据（0.3.43）

prephase-canvas 门禁在 r19 件1（字体图集重排）换过一次基线。这批文件就是那次换代的证据，
与 `manifest.json` 的 `provenance`（含 `--reason` 原文）配套看。

| 文件 | 是什么 |
| --- | --- |
| `forensics.json` | `node scripts/e2e/pixel-forensics.mjs` 对"上一代基线 vs 新一代基线"逐像素取证的机器可读结果（每态差异像素数、按通道计数、最大差、均值、渐变/平坦归属、包围盒、热点行） |
| `<态>-diff.png` | `magick compare -compose src -highlight-color red`：黑底上把有差异的像素标红（五态各一张，全图 1280×960） |

读法与判读（口径写在 `scripts/e2e/pixel-forensics.mjs` 头注）：

- 五态合计差异 **2,635 像素**（占 5×1,228,800 的 0.018%），R/G/B **最大差均为 1**、平均 0.3；
- **100.00% 落在"3x3 邻域有渐变"的抗锯齿边缘像素上，平坦区差异 0 个**——若某个字框被搬错、
  被清零或被邻帧墨污染，必然在平坦区留下成块差异，这里没有；
- α 一栏标 **n/a**：本门禁的基线 PNG 是浏览器截图（colour type 2，不含 α），"α 相同"在这种
  配对上是同义反复，不能当透明度证据。透明度由资产层断言覆盖：重排把每个保留字形的
  "帧 ∪ 4px 环带"整区域逐字节搬源（含 α），并把未保留声明全部指向同一块透明块，
  这些是 `scripts/font-subset/reflow-prephase.mjs` 的硬字节断言。
- `magick compare` 报的 AE（1945/32/270/17/373＝2,637）比 `forensics.json` 多 2 个像素，
  两套解码口径对极个别像素的取整不同；门禁判据始终是 PNG 字节的 SHA-256，不是 AE。
