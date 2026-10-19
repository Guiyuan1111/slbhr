#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
r7f font.png 子集化再生工具（方案 A：保持 font.fnt 与全部坐标逐字不变，仅把未用字形区域像素清零）。

状态（2026-10-19）：休眠工具。r7f 实测四源普查保留 247/260 字形（可清零面积占 canvas 4.07%），
方案 A 实测减幅仅 -5.2%、方案 B 面积上界 ~-5%，均低于 20% 停止线——本轮保留原资产未应用。
本工具与 census.ts 配套入库：未来新增文案/更换字库后，一条命令即可安全再生子集。

用法（两步）：
  node --import tsx scripts/font-subset/census.ts                       # 先刷新保留清单
  python3 scripts/font-subset/subset.py --out TEMP/perfopt7f/font.subset.png
校验通过后再人工覆盖 assets/fonts/chinese/font.png（tracked 规范路径；packages/client/public/
是 sync-assets 同步产物勿手改）并走门禁（visual-diff + det 48/48 + fixtures 6/6）。

安全性：
  - 原始全量 PNG 从钉死的 git blob 取（blob a1d33a2a5b9c987d1d184cf12b2a3c861f663912，
    与 2026-10-19 磁盘文件 md5 18fdc06b47e7893d1e6ae0ebc1263e1b 一致），保证清零后仍可再生；
    也可 --original <file> 显式指定。
  - 输出前逐位校验：所有保留字形矩形与原始 PNG 逐位相同；未保留矩形全零；尺寸不变。
  - 已知边界：清零区域与保留字形相邻处的线性过滤采样在理论上可改变边缘半透明像素
    （透明纹素 RGB 幽灵混色），故应用后必须过 visual-diff 实证。
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSET_DIR = os.path.join(ROOT, "assets", "fonts", "chinese")
FNT_PATH = os.path.join(ASSET_DIR, "font.fnt")
MANIFEST_PATH = os.path.join(ROOT, "scripts", "font-subset", "used-chars.json")
PINNED_BLOB = "a1d33a2a5b9c987d1d184cf12b2a3c861f663912"
REPO_SUBPATH = "gyのFW/assets/fonts/chinese/font.png"  # 相对 git 仓库根（slbhr）


def load_fnt_rects(path):
    txt = open(path, encoding="utf-8").read()
    rects = {}
    for m in re.finditer(r'<char id="(\d+)" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"', txt):
        cid, x, y, w, h = map(int, m.groups())
        rects[cid] = (x, y, w, h)
    if not rects:
        sys.exit(f"subset: {path} 未解析出任何 char 行")
    return rects


def load_original(explicit):
    if explicit:
        return explicit
    repo_root = os.path.dirname(ROOT)  # git 仓库根在上一层（slbhr）
    blob = subprocess.run(
        ["git", "-C", repo_root, "cat-file", "blob", f"HEAD:{REPO_SUBPATH}"],
        check=True, capture_output=True,
    ).stdout
    fd, tmp = tempfile.mkstemp(suffix=".png")
    os.write(fd, blob)
    os.close(fd)
    return tmp


def main():
    ap = argparse.ArgumentParser(description="font.png 子集化（方案 A）再生工具")
    ap.add_argument("--out", required=True, help="输出 PNG 路径（不会原地覆盖生产资产）")
    ap.add_argument("--original", help="显式指定原始全量 PNG（默认从钉死 git blob 取）")
    args = ap.parse_args()

    from PIL import Image  # 延迟导入，--help 不依赖 PIL

    rects = load_fnt_rects(FNT_PATH)
    manifest = __import__("json").load(open(MANIFEST_PATH, encoding="utf-8"))
    keep = set(manifest["chars"])

    orig_path = load_original(args.original)
    orig = Image.open(orig_path).convert("RGBA")
    out = orig.copy()
    px = out.load()

    dropped = [cid for cid in rects if cid not in keep and rects[cid][2] > 0 and rects[cid][3] > 0]
    for cid in dropped:
        x, y, w, h = rects[cid]
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                px[xx, yy] = (0, 0, 0, 0)

    # 逐位校验：保留矩形与原始一致；清零矩形全零
    opx = orig.load()
    zero = (0, 0, 0, 0)
    for cid, (x, y, w, h) in rects.items():
        if w == 0 or h == 0:
            continue
        is_keep = cid in keep
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                a, b = px[xx, yy], opx[xx, yy]
                if is_keep:
                    if a != b:
                        sys.exit(f"subset: 校验失败——保留字形 U+{cid:04X} 像素被改动 ({xx},{yy})")
                elif a != zero:
                    sys.exit(f"subset: 校验失败——清零字形 U+{cid:04X} 残留非零 ({xx},{yy})")
    if out.size != orig.size:
        sys.exit("subset: 校验失败——尺寸变化")

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    out.save(args.out, optimize=True)
    ob = os.path.getsize(orig_path)
    nb = os.path.getsize(args.out)
    if orig_path.startswith(tempfile.gettempdir()):
        os.unlink(orig_path)
    print(f"subset: 保留 {len(keep)}/{len(rects)} 字形（清零 {len(dropped)} 实字形）")
    print(f"subset: {ob} -> {nb} 字节（减幅 {100 * (ob - nb) / ob:.1f}%）→ {args.out}")
    print("subset: 记得 census.ts --check + visual-diff 实证 + sync-assets 后再覆盖生产路径")


if __name__ == "__main__":
    main()
