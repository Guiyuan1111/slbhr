#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
compare-temple.py — 选关树滤镜还原门禁对拍（oracle 截图 vs 我方截图，1280×960）。
用法：python3 compare-temple.py <oracle.png> <ours.png> [out.json]

判据（派发门禁）：
  1. 结构化采样：47 条边 t∈{0.35,0.5,0.65} 三点（距节点≥50px 跳过端点邻近），
     每点取 中线 / 中线±3.2px 法向；逐通道 |ours−oracle| ≤ 10/255；
  2. 中线期望值：0.85×tint（灰 127.5 四舍五入 → temple=(77~78,59~60,14)、gold=(216~218,181~183,27)）；
  3. 凹凸方向：±3.2px 两点亮度相对中线升降符号与 oracle 一致（|Δ|≥6 才计）；
  4. 密集区：树画布区域 (122..1157, 48..911) 全像素逐通道偏差直方，
     排除节点按钮盘 r=26 / NEW! 文本区 / 底部文本（按钮层非本槽范围）。

对齐：oracle 滤镜纹理 1036.8 逻辑宽（内容 1037 texel 压缩回 1036.8），画布左缘 121.6；
我方 CanvasTexture 1036×864 整数贴图（左缘 122）。整图亚像素平移用金边质心实测，
采样我方图时按 (x+dx, y+dy) 双线性补偿。
"""
import json
import math
import sys
from PIL import Image

ORACLE_JSON = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output/A/data/forest/temple.json"
W, H = 1280, 960
K = 0.9 * H          # 864
C = min(1.2 * K, 0.9 * W)  # 1036.8
TINT_TEMPLE = (0x5B, 0x46, 0x10)
TINT_GOLD = (0xFF, 0xD6, 0x20)

def node_xy(lv):
    return (lv["x"] * C - C / 2 + W / 2, lv["y"] * K - K / 2 + H / 2)

def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]

def sample_bilinear(img, x, y):
    if x < 0 or y < 0 or x > img.width - 1 or y > img.height - 1:
        return None
    x0, y0 = int(x), int(y)
    fx, fy = x - x0, y - y0
    px = img.load()
    out = []
    for c in range(3):
        v = (px[x0, y0][c] * (1 - fx) * (1 - fy) + px[x0 + 1, y0][c] * fx * (1 - fy)
             + px[x0, y0 + 1][c] * (1 - fx) * fy + px[x0 + 1, y0 + 1][c] * fx * fy)
        out.append(v)
    return out

def build_probe_points(nodes):
    """密集/拟合共用的采样点集：树画布区域，排除节点盘 r=26、NEW!、返回、显示关卡数。"""
    pts = []
    for y in range(48, 912):
        for x in range(122, 1158):
            if x >= 1080 and y >= 895:
                continue  # 显示关卡数
            if 680 <= x <= 800 and 690 <= y <= 740:
                continue  # NEW!
            if x <= 220 and y >= 830:
                continue  # 返回（我方返回按钮位置更低，一并排除）
            if any((x - qx) ** 2 + (y - qy) ** 2 < 26 ** 2 for qx, qy in nodes):
                continue  # 节点按钮盘
            pts.append((x, y))
    return pts


def fit_affine(oi, mi, nodes):
    """全局仿射拟合：oracle 屏坐标 x 处内容 ≈ 我方图 (x + a + (b-1)·(x-122), y) 双线性采样。
    动机：oracle 滤镜管线经 FilterTexture（texel 宽≠逻辑宽）回贴，水平存在 ~1e-3 级
    系统性尺度差 + 亚像素平移；垂直 dy≡0（多窗口实测峰值均在 0）。
    网格搜索最大化 |diff|≤10 全通道匹配率，确定性可复现。"""
    pxo, pxm = oi.load(), mi.load()
    pts = build_probe_points(nodes)[::9]
    def rate(a, b):
        ok = tot = 0
        for (x, y) in pts:
            i = x + a + (b - 1.0) * (x - 122.0)
            x0 = int(i)
            fx = i - x0
            v = [pxm[x0, y][c] * (1 - fx) + pxm[x0 + 1, y][c] * fx for c in range(3)]
            w = pxo[x, y]
            tot += 1
            if all(abs(w[c] - v[c]) <= 10 for c in range(3)):
                ok += 1
        return ok / tot
    best = None
    for b in [0.99850 + i * 0.00025 for i in range(17)]:
        for a in [0.0 + j * 0.25 for j in range(5)]:
            r = rate(a, b)
            if best is None or r > best[0]:
                best = (r, a, b)
    return best  # (rate, a, b)

def main():
    oracle_path, ours_path = sys.argv[1], sys.argv[2]
    out_json = sys.argv[3] if len(sys.argv) > 3 else "compare-result.json"
    oi = Image.open(oracle_path).convert("RGB")
    mi = Image.open(ours_path).convert("RGB")
    assert oi.size == (W, H) and mi.size == (W, H), "size mismatch"

    data = json.load(open(ORACLE_JSON))
    levels = data["levels"]
    by_oid = {lv["_id"]: lv for lv in levels}
    states = {}
    for lv in levels:
        fn = lv["filename"].split("/")[-1]
        if fn == "forest_01.json":
            states[lv["_id"]] = 2  # 1 星通关
        elif fn == "forest_02.json":
            states[lv["_id"]] = 1  # 解锁未通关
        else:
            states[lv["_id"]] = 0

    nodes = [node_xy(lv) for lv in levels]

    # ---- 对齐：全局仿射拟合 ----
    rate, A, B = fit_affine(oi, mi, nodes)
    print(f"对齐（全局仿射）：x' = x + {A:.2f} + ({B - 1:.5f})·(x−122)，拟合匹配率 {100 * rate:.2f}%")
    dx, dy = 0.0, 0.0  # 兼容 JSON 字段

    def ours_at(x, y):
        return sample_bilinear(mi, x + A + (B - 1.0) * (x - 122.0), y)

    # ---- 结构化边采样 ----
    rows = []
    dir_agree = dir_total = 0
    mid_ok = mid_total = 0
    worst = []
    for e in data["edges"]:
        a, b = by_oid[e["source"]], by_oid[e["target"]]
        ax, ay = node_xy(a)
        bx, by = node_xy(b)
        ln = math.hypot(bx - ax, by - ay)
        ux, uy = (bx - ax) / ln, (by - ay) / ln
        nx, ny = -uy, ux
        gold = states[a["_id"]] + states[b["_id"]] > 2
        tint = TINT_GOLD if gold else TINT_TEMPLE
        exp_mid = [round(0.85 * t) for t in tint]
        for t in (0.35, 0.5, 0.65):
            px_, py_ = ax + (bx - ax) * t, ay + (by - ay) * t
            if any(math.hypot(px_ - qx, py_ - qy) < 50 for qx, qy in nodes):
                continue
            po = sample_bilinear(oi, px_, py_)
            pm = ours_at(px_, py_)
            if not po or not pm:
                continue
            chans = [abs(po[c] - pm[c]) for c in range(3)]
            ok = all(v <= 10 for v in chans)
            mid_ok += ok
            mid_total += 1
            rows.append({"edge": e["id"], "t": t, "gold": gold, "mid_diff": chans, "ok": ok})
            # 中线期望（双侧均查，信息性）
            for tag, p in (("oracle", po), ("ours", pm)):
                for c in range(3):
                    if not (exp_mid[c] - 2 <= p[c] <= exp_mid[c] + 2):
                        rows[-1].setdefault("mid_expect_miss", []).append([tag, c, round(p[c], 1), exp_mid[c]])
            # 方向
            l0 = lum(po)
            lm0 = lum(pm)
            for s in (-3.2, 3.2):
                qa = sample_bilinear(oi, px_ + nx * s, py_ + ny * s)
                qb = ours_at(px_ + nx * s, py_ + ny * s)
                if not qa or not qb:
                    continue
                da, db = lum(qa) - l0, lum(qb) - lm0
                if abs(da) >= 6 and abs(db) >= 6:
                    dir_total += 1
                    if (da > 0) == (db > 0):
                        dir_agree += 1
                    else:
                        rows[-1]["dir_mismatch"] = [round(da, 1), round(db, 1)]
            if sum(chans) > (worst[0]["sum"] if worst else 0):
                worst = sorted(worst + [{"sum": sum(chans), "edge": e["id"], "t": t, "diff": chans}], key=lambda r: -r["sum"])[:8]

    # ---- 密集区 ----
    dense_tot = dense_ok = 0
    chan_sum = [0, 0, 0]
    dense_worst = []
    pxt, pxm = oi.load(), mi.load()
    near_edge = far_edge = 0
    for (x, y) in build_probe_points(nodes):
        a = pxt[x, y]
        b = ours_at(x, y)
        d = [abs(a[c] - b[c]) for c in range(3)]
        dense_tot += 1
        ok = all(v <= 10 for v in d)
        dense_ok += ok
        for c in range(3):
            chan_sum[c] += d[c]
        if not ok:
            # 贴边分类：oracle 5×5 亮度梯度 > 20 视为边缘带
            lum0 = lum(a)
            g = 0.0
            for ddy in (-2, -1, 0, 1, 2):
                for ddx in (-2, -1, 0, 1, 2):
                    xx, yy = x + ddx, y + ddy
                    if 0 <= xx < W and 0 <= yy < H:
                        g = max(g, abs(lum(pxt[xx, yy]) - lum0))
            if g > 20:
                near_edge += 1
            else:
                far_edge += 1
        s = d[0] + d[1] + d[2]
        if s > (dense_worst[0]["s"] if dense_worst else 0):
            dense_worst = sorted(dense_worst + [{"s": s, "x": x, "y": y, "o": a, "m": [round(v, 1) for v in b]}], key=lambda r: -r["s"])[:12]

    # ---- 汇总 ----
    print("\n== 结构化边采样（中线 |diff|≤10/通道） ==")
    print(f"通过 {mid_ok}/{mid_total}")
    midmiss = [r for r in rows if "mid_expect_miss" in r]
    print(f"中线期望 0.85×tint ±2 未中：{len(midmiss)} 点（见 JSON）")
    print(f"凹凸方向一致：{dir_agree}/{dir_total}")
    print("最差点（结构化）：", json.dumps(worst[-3:], ensure_ascii=False))
    print("\n== 密集区（树画布区域，排除按钮盘/文本） ==")
    print(f"像素 {dense_tot}，|diff|≤10 全通道：{dense_ok} ({100 * dense_ok / dense_tot:.2f}%)")
    print(f"失配 {dense_tot - dense_ok} 中贴边(5×5梯度>20) {near_edge}，远边 {far_edge}")
    print("通道均差：", [round(v / dense_tot, 3) for v in chan_sum])
    print("最差 6：")
    for r in dense_worst[:6]:
        print(" ", r["x"], r["y"], "oracle", r["o"], "ours", r["m"], "diff", [abs(r["o"][c] - r["m"][c]) for c in range(3)])

    json.dump({
        "align": {"a": A, "b": B, "fit_rate": rate, "dx": dx, "dy": dy},
        "structured": {"mid_ok": mid_ok, "mid_total": mid_total, "dir_agree": dir_agree, "dir_total": dir_total,
                       "mid_expect_miss": len(midmiss), "rows": rows},
        "dense": {"total": dense_tot, "ok": dense_ok, "pct": 100 * dense_ok / dense_tot,
                  "chan_mean": [v / dense_tot for v in chan_sum],
                  "near_edge_bad": near_edge, "far_edge_bad": far_edge, "worst": dense_worst},
    }, open(out_json, "w"), ensure_ascii=False, default=float)
    print("\nJSON ->", out_json)

if __name__ == "__main__":
    main()
