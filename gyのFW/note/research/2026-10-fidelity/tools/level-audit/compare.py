#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
level-audit/compare.py — 38 号档对拍器：显示列表逐元素匹配 + 对齐后像素结构差分。

输入：audit-runtime.mjs 两侧产物目录（ours/ oracle/，各含 <id>.dl.json / <id>-a.png / <id>-b.png）。
流程：
  1. 显示列表：oracle level 坐标 vs 我方 world−PAD 坐标（同为锚点坐标，直比）。
     family=帧名去尾号；近邻 ≤48px 配对 → 缺失/多余/Δ 位置·角·缩放·翻转·可见性。
     动态族（角色/Navies/decor/液体/玻璃罩）只比存在与粗位。
  2. 像素：我方图在 ±40px 内搜最优平移（对消相机 scroll 系统差），对齐后
     diff>8 且 双侧各自 a/b 帧稳定（动态掩码，膨胀1px）的像素=结构差。
     32×32 分块直方 → top 区块坐标（换算回 level 坐标供归因）。
  3. 定级：干净(<0.05%) | 轻微(<0.6%) | 错位(有系统平移或块差集中) | 缺元素(dl missing>0)。
输出：汇总 JSON（--out）+ stdout 总表。
用法：python3 compare.py <oursDir> <oracleDir> [--out report.json] [--shots-dir None]
"""
import json
import os
import re
import sys
from PIL import Image, ImageChops

PAD = 32
DYNAMIC_FAMILY = re.compile(r"^(fire_|water_|Navy|decor_|WindBox|wind_effect)")
LIQ = re.compile(r"^(WaterBox|FireBox|GreenBox)")

def family(frame, tex):
    if not frame:
        if tex in ("groundTexture", "groundTex"):
            return "__ground"
        if tex == "decosTexture":
            return "__decor_baked"
        if tex in ("MenuAssets",):
            return "__menu"
        return "__other:" + str(tex)
    return re.sub(r"\d{4,}$", "", frame)

def load_dl(path):
    with open(path) as f:
        return json.load(f)

def ours_elements(dl):
    """我方元素 → {family: [entries]}；世界坐标 −PAD = level 系。跳过 Graphics/纹理缺失。
    TileSprite 的帧名在 Phaser3 侧丢失（独立纹理 __BASE），按尺寸归类：
    1248×928=背景、h20=绳、h30=roman_bar、w138=roman_base。"""
    out = {}
    for e in dl["dl"]:
        if e.get("t") == "Graphics":
            continue
        fam = family(e.get("f"), e.get("tex"))
        if fam == "__BASE":
            if e.get("t") == "TileSprite":
                w, h = e.get("w") or 0, e.get("h") or 0
                if w >= 1000:
                    fam = "BackGround"
                elif h == 20:
                    fam = "pulley_rope"
                elif h == 30:
                    fam = "roman_bar"
                elif 130 <= w <= 146:
                    fam = "roman_base"
                else:
                    fam = "TileSprite?"
            else:
                continue
        if fam == "__other:__MISSING" or fam == "_default":
            continue
        out.setdefault(fam, []).append({
            "x": e["x"] - PAD, "y": e["y"] - PAD, "a": e.get("a", 0),
            "sx": e.get("sx", 1), "sy": e.get("sy", 1), "fx": e.get("fx", False),
            "v": e.get("v", True), "al": e.get("al", 1), "f": e.get("f"), "tex": e.get("tex"),
        })
    return out

def oracle_elements(dl):
    """oracle 绝对坐标（含 root=−levelCenter·scale）→ level 系：level=(abs−rootXY)/rootScale。"""
    rs = dl.get("rootScale") or 1
    rx, ry = (dl.get("rootXY") or [0, 0])
    out = {}
    for e in dl["dl"]:
        if e.get("t") == 6:  # Graphics
            continue
        fam = family(e.get("f"), e.get("tex"))
        if fam == "__other:None" or fam == "_default":
            continue
        out.setdefault(fam, []).append({
            "x": (e["x"] - rx) / rs, "y": (e["y"] - ry) / rs, "a": e.get("a", 0),
            "sx": e.get("sx", 1), "sy": e.get("sy", 1), "fx": bool(e.get("fx", False)),
            "v": e.get("v", True), "al": e.get("al", 1), "f": e.get("f"), "tex": e.get("tex"), "path": e.get("path", ""),
        })
    return out

def match_family(olist, ulist, coarse):
    """近邻贪心配对，返回 pairs/missing/extra。coarse=宽容差（动态族）。"""
    pairs, missing, extra = [], [], list(ulist)
    for o in olist:
        best, bi = None, None
        for i, u in enumerate(extra):
            tol = coarse
            d = ((o["x"] - u["x"]) ** 2 + (o["y"] - u["y"]) ** 2) ** 0.5
            if d <= tol and (best is None or d < best):
                best, bi = d, i
        if bi is None:
            missing.append(o)
        else:
            u = extra.pop(bi)
            pairs.append((o, u, best))
    return pairs, missing, extra

NOREPORT_FAMS = re.compile(r"^(Navy|decor_|fire_|water_|death_smoke|__decor_baked|__ground|__menu|TileSprite\?|火|Clock|PauseButton)")

def dl_compare(odl, udl):
    oe, ue = oracle_elements(odl), ours_elements(udl)
    fams = sorted(set(oe) | set(ue))
    report = {"families": {}, "missing": [], "extra": [], "extra_hidden": [], "misaligned": []}
    static_pos_bad = 0
    for fam in fams:
        if fam.startswith("__other"):
            continue
        oo, uu = oe.get(fam, []), ue.get(fam, [])
        coarse = 40 if (DYNAMIC_FAMILY.match(fam) or LIQ.match(fam) or fam in ("__menu", "__decor_baked", "pulley_rope")) else 48
        pairs, missing, extra = match_family(oo, uu, coarse)
        info = {"oracle": len(oo), "ours": len(uu), "paired": len(pairs)}
        worst = 0
        for o, u, d in pairs:
            dx, dy = abs(o["x"] - u["x"]), abs(o["y"] - u["y"])
            if not coarse and max(dx, dy) > 2:
                static_pos_bad += 1
                report["misaligned"].append({"fam": fam, "f": o.get("f"), "oracle": [round(o["x"], 1), round(o["y"], 1)], "ours": [round(u["x"], 1), round(u["y"], 1)], "d": round(d, 1)})
            worst = max(worst, d)
            if DYNAMIC_FAMILY.match(fam):
                continue
            sc_bad = any(abs(o[k] - u[k]) > 0.03 for k in ("sx", "sy")) if (">" not in str(o.get("path", ""))) else False
            if (abs(o["a"] - u["a"]) > 1.5 or sc_bad
                    or o["fx"] != u["fx"] or o["v"] != u["v"]):
                report["misaligned"].append({"fam": fam, "f": o.get("f"), "kind": "attr",
                                             "oracle": [round(o["x"], 1), round(o["y"], 1), o["a"], o["sx"], o["sy"], o["fx"], o["v"]],
                                             "ours": [round(u["x"], 1), round(u["y"], 1), u["a"], u["sx"], u["sy"], u["fx"], u["v"]]})
        info["worst_d"] = round(worst, 1)
        if not NOREPORT_FAMS.match(fam):
            for o in missing:
                (report["missing"] if o["v"] else report["extra_hidden"]).append({"fam": fam, "f": o.get("f"), "at": [round(o["x"], 1), round(o["y"], 1)], "v": o["v"]})
            for u in extra:
                (report["extra"] if u["v"] else report["extra_hidden"]).append({"fam": fam, "f": u.get("f"), "at": [round(u["x"], 1), round(u["y"], 1)], "v": u["v"]})
        report["families"][fam] = info
    report["static_pos_bad"] = static_pos_bad
    return report

def gray(path):
    return Image.open(path).convert("L")

def best_shift(A, B, rng=40, coarse=4):
    """B 平移 (dx,dy) 后与 A 的平均差最小者。返回 (mean, dx, dy)。
    粗搜在 1/4 缩图上做（相机 scroll 系统差对消），细搜回全图 ±coarse。"""
    npx = A.size[0] * A.size[1]
    def mean_at(dx, dy, Ai=A, Bi=B):
        BB = Bi.transform(Bi.size, Image.AFFINE, (1, 0, dx, 0, 1, dy))
        h = ImageChops.difference(Ai, BB).histogram()
        return sum(i * c for i, c in enumerate(h)) / (Ai.size[0] * Ai.size[1])
    As = A.reduce(4)
    Bs = B.reduce(4)
    best = (mean_at(0, 0, As, Bs), 0, 0)
    for dy in range(-rng, rng + 1, coarse):
        for dx in range(-rng, rng + 1, coarse):
            s = mean_at(dx / 4, dy / 4, As, Bs)  # 缩图位移=全图/4
            if s < best[0]:
                best = (s, dx, dy)
    _, bx, by = best
    best = (mean_at(bx, by), bx, by)
    for dy in range(by - coarse + 1, by + coarse):
        for dx in range(bx - coarse + 1, bx + coarse):
            s = mean_at(dx, dy)
            if s < best[0]:
                best = (s, dx, dy)
    return best

def diff_mask(A, B, thr=8):
    d = ImageChops.difference(A, B)
    return d.point(lambda v: 255 if v > thr else 0)

def clock_mask(img):
    """HUD 时钟区（两侧秒差恒不同相）：canvas (560..720, 0..100) 记动态。"""
    from PIL import ImageDraw
    m = Image.new("L", img.size, 0)
    dr = ImageDraw.Draw(m)
    dr.rectangle((560, 0, 720, 100), fill=255)
    return m

def dilate(m):
    return m.filter(__import__("PIL.ImageFilter", fromlist=["MaxFilter"]).MaxFilter(3))

def block_hist(mask, bs=32, thr_frac=0.30):
    """32×32 分块：块内 diff 像素数 >30% 记为热块。返回 [(中心x,中心y,count)，按 count 降序]。"""
    W, H = mask.size
    blocks = {}
    for y in range(0, H, bs):
        for x in range(0, W, bs):
            c = mask.crop((x, y, min(x + bs, W), min(y + bs, H))).histogram()
            n = sum(v for v in c if v > 0)
            if n > bs * bs * thr_frac:
                blocks[(x, y)] = n
    return sorted(((x + bs // 2, y + bs // 2, n) for (x, y), n in blocks.items()), key=lambda t: -t[2])

def pixel_compare(ours_dir, oracle_dir, lid):
    A_ours = gray(os.path.join(ours_dir, f"{lid}-a.png"))
    B_ours = gray(os.path.join(ours_dir, f"{lid}-b.png"))
    A_or = gray(os.path.join(oracle_dir, f"{lid}-a.png"))
    B_or = gray(os.path.join(oracle_dir, f"{lid}-b.png"))
    raw = ImageChops.difference(A_ours, A_or)
    rh = raw.histogram()
    npx = A_ours.size[0] * A_ours.size[1]
    raw_gt8 = sum(c for i, c in enumerate(rh) if i > 8)
    mean0, dx, dy = best_shift(A_ours, A_or)
    Aor_al = A_or.transform(A_or.size, Image.AFFINE, (1, 0, dx, 0, 1, dy))
    Bor_al = B_or.transform(B_or.size, Image.AFFINE, (1, 0, dx, 0, 1, dy))
    d_al = ImageChops.difference(A_ours, Aor_al)
    hal = d_al.histogram()
    al_gt8 = sum(c for i, c in enumerate(hal) if i > 8)
    # 动态掩码：任一侧双帧不稳处
    dyn = ImageChops.lighter(ImageChops.lighter(dilate(diff_mask(A_ours, B_ours)), dilate(diff_mask(Aor_al, Bor_al))), clock_mask(A_ours))
    # 结构差 = 对齐后 >8 且不在动态掩码
    gt8_mask = d_al.point(lambda v: 255 if v > 8 else 0)
    struct = ImageChops.subtract(gt8_mask, dyn)
    sh = struct.histogram()
    struct_cnt = sum(sh[1:])
    hot = block_hist(struct)
    BAND = 48
    W, H = struct.size
    inner = struct.crop((BAND, BAND, W - BAND, H - BAND))
    ih = inner.histogram()
    inner_cnt = sum(ih[1:])
    inner_n = inner.size[0] * inner.size[1]
    edge_cnt = struct_cnt - inner_cnt
    return {
        "raw_gt8_pct": round(raw_gt8 / npx * 100, 3),
        "raw_mean": round(sum(i * c for i, c in enumerate(rh)) / npx, 2),
        "align": {"dx": dx, "dy": dy, "mean_after": round(mean0, 2)},
        "aligned_gt8_pct": round(al_gt8 / npx * 100, 3),
        "struct_pct": round(struct_cnt / npx * 100, 3),
        "struct_inner_pct": round(inner_cnt / inner_n * 100, 3),
        "struct_edge_pct": round(edge_cnt / (npx - inner_n) * 100, 3),
        "hot_blocks": [{"xy": h[0:2], "cnt": h[2]} for h in hot[:8]],
    }

def main():
    ours_dir, oracle_dir = sys.argv[1], sys.argv[2]
    out_path = None
    if "--out" in sys.argv:
        out_path = sys.argv[sys.argv.index("--out") + 1]
    ids = sorted(f[:-8] for f in os.listdir(ours_dir) if f.endswith(".dl.json"))
    rows = []
    for lid in ids:
        row = {"id": lid}
        try:
            odl = load_dl(os.path.join(oracle_dir, f"{lid}.dl.json"))
            udl = load_dl(os.path.join(ours_dir, f"{lid}.dl.json"))
            row["cam_ours"] = udl.get("cam")
            row["cam_oracle"] = {"rootScale": odl.get("rootScale"), **odl.get("cam", {})}
            row["dl"] = dl_compare(odl, udl)
            if os.path.exists(os.path.join(ours_dir, f"{lid}-a.png")) and os.path.exists(os.path.join(oracle_dir, f"{lid}-a.png")):
                row["px"] = pixel_compare(ours_dir, oracle_dir, lid)
        except Exception as e:
            row["error"] = f"{type(e).__name__}: {e}"
        rows.append(row)
        sp = row.get("px", {}).get("struct_pct")
        msg = f"{lid:18s} struct={sp if sp is not None else '?':>7}%  align={row.get('px', {}).get('align')}"
        if row.get("dl"):
            msg += f"  dl miss={len(row['dl']['missing'])} extra={len(row['dl']['extra'])} mis={row['dl']['static_pos_bad']}"
        if row.get("error"):
            msg += "  ERROR " + row["error"][:80]
        print(msg)
    if out_path:
        with open(out_path, "w") as f:
            json.dump(rows, f, ensure_ascii=False, indent=1)
        print("written", out_path)

if __name__ == "__main__":
    main()
