# forest_29 解析层全量解码（纯 JSON，语义对齐 packages/shared/src/level2.ts；模式同 dump19/dump27）
import json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = r"D:\01_Guiyuan1111\GitHub\slbhr\gyのFW"
doc = json.load(open(ROOT + r"\data\forest\levels\forest_29.json", encoding="utf-8"))

TS = {}
for name in ["Chars", "Objects", "Ground", "LargeObjects"]:
    TS[name] = json.load(open(ROOT + rf"\assets\tilemaps\tilesets\{name}.json", encoding="utf-8"))

refs = {t["source"].split("/")[-1].split(".")[0]: t["firstgid"] for t in doc["tilesets"]}
print("== tileset firstgids:", refs)
COLS, ROWS = doc["width"], doc["height"]

def resolve(gid):
    best = None
    for base, fg in refs.items():
        if fg <= gid and (best is None or fg >= best[1]):
            best = (base, fg)
    return best

def tile_obj_rect(o, w=None, h=None):
    w = o.get("width", w or 64); h = o.get("height", h or 64)
    return {"x": o["x"], "y": o["y"] - h, "w": w, "h": h}

# ---------------- Chars 层 ----------------
print("\n== Chars 层 ==")
fgC = refs["Chars"]
spawn, doors, diamonds = {}, [], []
for o in next(l for l in doc["layers"] if l.get("name") == "Chars")["objects"]:
    gid = o["gid"]; local = gid - fgC
    kind = TS["Chars"]["tiles"][str(local)]["type"]
    char = TS["Chars"]["tileproperties"][str(local)]["char"]
    inst_props = o.get("properties") or {}
    if inst_props: char = inst_props.get("char", char)
    r = tile_obj_rect(o)
    cx, cy = r["x"] + r["w"]/2, r["y"] + r["h"]/2
    line = f"  id={o['id']} gid={gid} local={local} type={kind} char={char} objXY=({o['x']},{o['y']}) wh=({r['w']}x{r['h']}) rect(top)={r}"
    if kind == "char":
        spawn[char] = (r["x"] + r["w"]/2, r["y"] + r["h"])  # 底边中点
        line += f" -> spawn=({spawn[char][0]},{spawn[char][1]})"
    elif kind == "door":
        doors.append((char, r))
        line += f" -> doorRect(top)={r}"
    elif kind == "diamond":
        kindmap = {"fb": "red", "wg": "blue", "silver": "silver", "fbwg": "fbwg"}
        diamonds.append((char, kindmap[char], cx, cy))
        line += f" -> diamond {kindmap[char]} center=({cx},{cy})"
    print(line)

print("spawn:", spawn)
for ch, r in doors: print(f"door[{ch}]: rect={r}  (x{r['x']}..{r['x']+r['w']}, y{r['y']}..{r['y']+r['h']})")
print("diamonds:", len(diamonds))
for d in sorted(diamonds, key=lambda t: (t[2], t[3])): print("  ", d)

# ---------------- Objects 层 ----------------
print("\n== Objects 层 ==")
fgO = refs["Objects"]
for o in next(l for l in doc["layers"] if l.get("name") == "Objects")["objects"]:
    base = dict(id=o["id"], x=o["x"], y=o["y"], w=o.get("width"), h=o.get("height"),
                rot=o.get("rotation", 0), props=o.get("properties"), type=o.get("type"), name=o.get("name"))
    if "gid" in o:
        gid = o["gid"]; local = gid - fgO
        b = resolve(gid)
        tname = TS[b[0]].get("tiles", {}).get(str(local), {}).get("type")
        defaults = TS[b[0]].get("tileproperties", {}).get(str(local), {})
        merged = dict(defaults); merged.update(o.get("properties") or {})
        r = tile_obj_rect(o)
        cx, cy = r["x"] + r["w"]/2, r["y"] + r["h"]/2
        extra = ""
        if tname == "lever":
            sp, on = float(merged.get("startPos", -1)), float(merged.get("onis", 1))
            f0auto = (sp * on) > 0
            extra = f" [merged={merged}] startPos={sp} onis={on} -> f0 autoON={f0auto} (startPos*onis={sp*on:+g})"
            extra += f" [tileset={b[0]} gid体角={'-36' if sp==-1 else '+36'}deg]"
        if tname == "ball":
            extra = " [内核出生 = 中心+(-16,+20.8)px, r=0.4m]"
        if tname == "box":
            extra = " [内核八边形主体 1.77m+四角轮 r0.1]"
        print(f"  gid对象 {base} tileset={b[0]} local={local} typeName={tname} rect(top)={r} center=({cx},{cy}){extra}")
    else:
        line = f"  非gid对象 {base}"
        if o.get("type") == "pulley":
            pts = [(o["x"] + p["x"], o["y"] + p["y"]) for p in o.get("polyline", [])]
            line += f"\n    -> pulley 板1/轮1/轮2/板2 绝对坐标 = {pts}"
            line += f"\n    -> 轮锚点(+64px 下移) = {[(pts[1][0], pts[1][1]+64), (pts[2][0], pts[2][1]+64)]}"
            line += f"\n    -> 绳长1 = 板1y-锚1y = {pts[0][1]-(pts[1][1]+64)}px, 绳长2 = 板2y-锚2y = {pts[3][1]-(pts[2][1]+64)}px"
        if o.get("type") == "platform":
            pr = o.get("properties") or {}
            line += f" -> 竖直交换? w={o.get('width')}m h={o.get('height')}m -> {'竖台(转置28/28x96)' if o.get('width',0)<o.get('height',0) else '横台'}"
        print(line)

# ---------------- Ground 层 ----------------
print("\n== Ground 层 ==")
fgG = refs["Ground"]
data = next(l for l in doc["layers"] if l.get("name") == "Ground")["data"]
tp = TS["Ground"]["tileproperties"]
SYM = {0: "#", 1: "/", 2: "\\", 3: "c", 4: "d", 5: "w", 6: "L", 7: "g", 8: "[", 9: "]", -1: ".", 10: "T", 11: "1", 12: "2", 55: "I"}
grid = [[None] * COLS for _ in range(ROWS)]
hist = {}
for row in range(ROWS):
    for col in range(COLS):
        gid = data[row * COLS + col]
        if gid == 0:
            grid[row][col] = None; continue
        t = tp[str(gid - fgG)]["type"]
        grid[row][col] = t
        hist[t] = hist.get(t, 0) + 1
print("type histogram:", {k: v for k, v in sorted(hist.items(), key=lambda kv: str(kv[0]))})
print("ruler: col 0 =", "".join(str((c // 10) % 10) for c in range(COLS)))
print("       col 1 =", "".join(str(c % 10) for c in range(COLS)))
for row in range(ROWS):
    cells = "".join("·" if grid[row][c] is None else SYM.get(grid[row][c], "?") for c in range(COLS))
    print(f"y{row*32:>4} r{row:>2} {cells}")

# liquid runs（对齐 level2 行扫描语义）
runs = []
for row in range(ROWS):
    rk, rs = None, 0
    for col in range(COLS + 1):
        k = None
        if col < COLS and grid[row][col] in (5, 6, 7):
            k = {5: "water", 6: "lava", 7: "green"}[grid[row][col]]
        if k != rk and rk is not None:
            runs.append((rk, row, rs, col - 1))
        if k != rk:
            rk, rs = k, col
print("\nliquid runs (kind,row,col0,col1,pixelX0,X1,topY,botY):")
for k, row, c0, c1 in runs:
    print(f"  {k}: row{row} col{c0}..{c1} px x[{c0*32},{(c1+1)*32}] y[{row*32},{(row+1)*32}]")

# 逐行跨度表（供蓝图 §1）
print("\n逐行跨度:")
TN = {0: "solid", 1: "/", 2: "\\", 3: "wC", 4: "wD", 5: "water", 6: "lava", 7: "green"}
for row in range(ROWS):
    spans = []
    c = 0
    while c < COLS:
        t = grid[row][c]
        c2 = c
        while c2 + 1 < COLS and grid[row][c2 + 1] == t and t is not None:
            c2 += 1
        if t is not None:
            spans.append(f"c{c}" + (f"-c{c2}({TN.get(t, t)})" if c2 > c else f"({TN.get(t, t)})"))
        c = c2 + 1
    if spans:
        print(f"r{row} y{row*32}-{row*32+32}: " + " ".join(spans))
