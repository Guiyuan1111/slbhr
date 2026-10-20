#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
level-audit/acceptance-report.py — 40 号档（修复验收取证）对拍拼图 + 逐族判定指标。

输入：
  --ours  我方修复后采集目录（acceptance-capture.mjs --side ours 产物）
  --oracle oracle 采集目录
  --prefix-ref 38 号档 report48b.json（修复前逐关 dl/px 基准，按派发豁免条款引用）
  --pngs  并排拼图输出目录（入库 tools/level-audit/acceptance/）
  --out   判定指标 JSON
  --levels 逗号分隔关卡 id
流程（每关）：
  1. 目标族统计：IceBox*(F1)/hanging_base(F3a)/wind_base_light_on|off(F3b)/pulley_base(F3c)/
     lever_stick_light_on|off(F3d)/moving_platform_light_on|off(V13 tint)——双侧计数、有效可见(ev=false)计数、
     tint 值集合差（oracle sprite.tint vs 我方 tintTopLeft）。
  2. 相机：双侧 cam 值 + compare.py 对拍报告（--cmp 可选）px.align.dx/dy（F2 残差）。
  3. 暂停静帧：pa/pb 结构差（|Δ|>8 占比）全帧 + 面板外框外（box 280..1000 × 160..800 之外）双侧各算。
  4. 菜单光柱：ma/mb 活体差（双侧各自）、oracle-ma vs ours-ma ±40px 对齐结构差。
  5. 并排拼图：static/oracle-a+ours-a、pause/oracle-pa+ours-pa、menu/oracle-ma+ours-ma（640×480 半幅+题注）。
输出：--out JSON（逐关逐族指标）+ stdout 摘要表。文字模型不判像素，一切数字供档卷引用。
"""
import argparse
import json
import os
import re
import sys
from PIL import Image, ImageChops, ImageStat, ImageDraw

PAD = 32
TARGET_FAMS = [
    "IceBox", "IceBoxLeft", "IceBoxRight",
    "hanging_base", "wind_base_light_on", "wind_base_light_off",
    "pulley_base", "lever_stick_light_on", "lever_stick_light_off",
    "moving_platform_light_on", "moving_platform_light_off",
]
# 面板框（PauseMenu board：PopupBackground0000 1082×642 @ board(99,159) origin(0,0) →
# 99..1181 × 159..801；外扩 20px 余量。outside 判定=框外全画面，双侧同口径）
BOX = (79, 139, 1201, 821)


def famof(e):
    f = e.get("f")
    if f:
        return re.sub(r"\d{4,}$", "", f)
    return "__tex:" + str(e.get("tex"))


def load_dl(path):
    with open(path) as f:
        return json.load(f)


def gray(path):
    return Image.open(path).convert("L")


def diff_stats(a, b, thr=8, box=None):
    """|Δ|>thr 像素占比（box=(l,t,r,b) 只统计框外）。"""
    if a.size != b.size:
        b = b.resize(a.size)
    d = ImageChops.difference(a, b)
    if box:
        l, t, r, bm = box
        mask = Image.new("L", a.size, 0)
        # 框内置 0（忽略），框外置 255（统计）
        draw = ImageDraw.Draw(mask)
        draw.rectangle([0, 0, a.size[0], box[1]], fill=255)
        draw.rectangle([0, box[3], a.size[0], a.size[1]], fill=255)
        draw.rectangle([0, 0, box[0], a.size[1]], fill=255)
        draw.rectangle([box[2], 0, a.size[0], a.size[1]], fill=255)
        d = ImageChops.composite(d, Image.new("L", a.size, 0), mask)
    h = d.point(lambda p: 255 if p > thr else 0).histogram()
    tot = sum(h)
    return round(h[255] / tot * 100, 3) if tot else 0.0


def best_shift(A, B, rng=40, coarse=4):
    """compare.py 同法逐字移植：B 平移 (dx,dy) 后与 A 的平均差最小者，返回 (mean, dx, dy)。
    粗搜在 1/4 缩图上做，细搜回全图 ±coarse；transform 填充法无 crop 边界伪差。"""
    def mean_at(dx, dy, Ai=A, Bi=B):
        BB = Bi.transform(Bi.size, Image.AFFINE, (1, 0, dx, 0, 1, dy))
        h = ImageChops.difference(Ai, BB).histogram()
        return sum(i * c for i, c in enumerate(h)) / (Ai.size[0] * Ai.size[1])
    As = A.reduce(4)
    Bs = B.reduce(4)
    best = (mean_at(0, 0, As, Bs), 0, 0)
    for dy in range(-rng, rng + 1, coarse):
        for dx in range(-rng, rng + 1, coarse):
            s = mean_at(dx / 4, dy / 4, As, Bs)
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


def fam_stats(dump):
    """目标族 → {count, ev_false, tints:[..]}"""
    out = {}
    for e in dump.get("dl", []):
        fam = famof(e)
        if fam in TARGET_FAMS:
            s = out.setdefault(fam, {"count": 0, "ev_false": 0, "tints": []})
            s["count"] += 1
            if e.get("ev") is False:
                s["ev_false"] += 1
            t = e.get("tint")
            if t is not None:
                s["tints"].append(int(t))
    return out


def stitch(paths_labels, outpath, width=640):
    imgs = []
    for p, label in paths_labels:
        im = Image.open(p).convert("RGB")
        im = im.resize((width, int(im.height * width / im.width)))
        imgs.append((im, label))
    H = max(im.height for im, _ in imgs) + 26
    W = sum(im.width for im, _ in imgs) + 4 * (len(imgs) - 1)
    canvas = Image.new("RGB", (W, H), (16, 16, 16))
    x = 0
    for im, label in imgs:
        canvas.paste(im, (x, 26))
        x += im.width + 4
    d = ImageDraw.Draw(canvas)
    x = 0
    for im, label in imgs:
        d.text((x + 4, 6), label, fill=(240, 240, 240))
        x += im.width + 4
    canvas.save(outpath)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ours", required=True)
    ap.add_argument("--oracle", required=True)
    ap.add_argument("--prefix-ref")
    ap.add_argument("--pngs", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cmp")
    ap.add_argument("--levels", required=True)
    a = ap.parse_args()
    os.makedirs(a.pngs, exist_ok=True)

    cmp_report = {}
    if a.cmp and os.path.exists(a.cmp):
        with open(a.cmp) as f:
            for row in json.load(f):
                cmp_report[row["id"]] = row
    prefix_ref = {}
    if a.prefix_ref and os.path.exists(a.prefix_ref):
        with open(a.prefix_ref) as f:
            for row in json.load(f):
                prefix_ref[row["id"]] = row

    report = []
    for lid in a.levels.split(","):
        entry = {"id": lid}
        # --- static dl 族统计 ---
        o_path = os.path.join(a.oracle, f"{lid}.dl.json")
        u_path = os.path.join(a.ours, f"{lid}.dl.json")
        if os.path.exists(o_path) and os.path.exists(u_path):
            odump, udump = load_dl(o_path), load_dl(u_path)
            ost, ust = fam_stats(odump), fam_stats(udump)
            fams = {}
            for fam in TARGET_FAMS:
                if fam in ost or fam in ust:
                    o, u = ost.get(fam, {"count": 0, "ev_false": 0, "tints": []}), ust.get(fam, {"count": 0, "ev_false": 0, "tints": []})
                    tint_o, tint_u = sorted(set(o["tints"])), sorted(set(u["tints"]))
                    fams[fam] = {
                        "oracle": o["count"], "ours": u["count"],
                        "oracle_ev_false": o["ev_false"], "ours_ev_false": u["ev_false"],
                        "tint_oracle": tint_o, "tint_ours": tint_u,
                        "tint_eq": tint_o == tint_u,
                    }
            entry["families"] = fams
            entry["cam"] = {"ours": udump.get("cam"), "oracle": odump.get("cam"),
                            "oracle_rootXY": odump.get("rootXY"), "ours_scenes": udump.get("scenes")}
        pre = prefix_ref.get(lid)
        if pre:
            entry["prefix_ref"] = {
                "px_align": pre.get("px", {}).get("align"),
                "struct_inner_pct": pre.get("px", {}).get("struct_inner_pct"),
                "families_missing": {f: v.get("oracle", 0) - v.get("paired", 0)
                                     for f, v in pre.get("dl", {}).get("families", {}).items()
                                     if f in TARGET_FAMS and v.get("oracle", 0) - v.get("paired", 0) > 0},
            }
        if lid in cmp_report:
            px = cmp_report[lid].get("px", {})
            entry["post_align"] = px.get("align")
            entry["post_struct_inner_pct"] = px.get("struct_inner_pct")
            entry["post_struct_pct"] = px.get("struct_pct")
        # --- pause 对 ---
        op, up = os.path.join(a.oracle, f"{lid}-pa.png"), os.path.join(a.ours, f"{lid}-pa.png")
        if os.path.exists(op) and os.path.exists(os.path.join(a.oracle, f"{lid}-pb.png")):
            entry["pause_oracle"] = {
                "diff_full": diff_stats(gray(op), gray(os.path.join(a.oracle, f"{lid}-pb.png"))),
                "diff_outside_board": diff_stats(gray(op), gray(os.path.join(a.oracle, f"{lid}-pb.png")), box=BOX),
            }
        if os.path.exists(up) and os.path.exists(os.path.join(a.ours, f"{lid}-pb.png")):
            entry["pause_ours"] = {
                "diff_full": diff_stats(gray(up), gray(os.path.join(a.ours, f"{lid}-pb.png"))),
                "diff_outside_board": diff_stats(gray(up), gray(os.path.join(a.ours, f"{lid}-pb.png")), box=BOX),
            }
        # --- 菜单对（双侧各一次，取 MENU-* 或 <lid>-m*）---
        om_a = os.path.join(a.oracle, f"{lid}-ma.png")
        om_b = os.path.join(a.oracle, f"{lid}-mb.png")
        um_a = os.path.join(a.ours, "MENU-ma.png")
        um_b = os.path.join(a.ours, "MENU-mb.png")
        entry["menu"] = {}
        if os.path.exists(om_a) and os.path.exists(om_b):
            entry["menu"]["oracle_self_diff"] = diff_stats(gray(om_a), gray(om_b))
        if os.path.exists(um_a) and os.path.exists(um_b):
            entry["menu"]["ours_self_diff"] = diff_stats(gray(um_a), gray(um_b))
        if os.path.exists(om_a) and os.path.exists(um_a):
            A, B = gray(um_a), gray(om_a)
            mean_after, dx, dy = best_shift(A, B)
            entry["menu"]["cross_align"] = {"dx": dx, "dy": dy, "mean_after": round(mean_after, 2),
                                            "struct_gt8_pct": diff_stats(A, B)}
        # --- 拼图 ---
        try:
            oa, ua = os.path.join(a.oracle, f"{lid}-a.png"), os.path.join(a.ours, f"{lid}-a.png")
            if os.path.exists(oa) and os.path.exists(ua):
                stitch([(oa, f"oracle {lid} static-a"), (ua, f"ours {lid} static-a")],
                       os.path.join(a.pngs, f"{lid}-static-sbs.png"))
            opb, upb = os.path.join(a.oracle, f"{lid}-pa.png"), os.path.join(a.ours, f"{lid}-pa.png")
            if os.path.exists(opb) and os.path.exists(upb):
                stitch([(opb, f"oracle {lid} pause"), (upb, f"ours {lid} pause")],
                       os.path.join(a.pngs, f"{lid}-pause-sbs.png"))
            if os.path.exists(om_a) and os.path.exists(um_a):
                stitch([(om_a, "oracle menu"), (um_a, "ours menu")],
                       os.path.join(a.pngs, f"MENU-sbs.png"))
        except Exception as e:
            entry["stitch_error"] = str(e)
        report.append(entry)
        # stdout 摘要
        fams = entry.get("families", {})
        fs = " ".join(f"{f}:{v['oracle']}/{v['ours']}" + ("" if v["tint_oracle"] == v["tint_ours"] == [] else f"(tint{'=' if v['tint_eq'] else '≠'})")
                      for f, v in fams.items())
        print(f"{lid:16s} align={entry.get('post_align')} {fs}")
        if "pause_ours" in entry:
            print(f"{'':16s} pause diff ours={entry['pause_ours']['diff_full']}/outside={entry['pause_ours']['diff_outside_board']}"
                  f" oracle={entry.get('pause_oracle', {}).get('diff_full')}/outside={entry.get('pause_oracle', {}).get('diff_outside_board')}")

    with open(a.out, "w") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print("WROTE", a.out)


if __name__ == "__main__":
    main()
