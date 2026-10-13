# forest_24 解析层全量解码（纯 JSON，语义对齐 packages/shared/src/level2.ts；模式同 dump19.py）
import json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = r"D:\01_Guiyuan1111\GitHub\slbhr\gyのFW"
doc = json.load(open(ROOT + r"\data\forest\levels\forest_24.json", encoding="utf-8"))

TS = {}
for name in ["Chars", "Objects", "Ground", "LargeObjects"]:
    try:
        TS[name] = json.load(open(ROOT + rf"\assets\tilemaps\tilesets\{name}.json", encoding="utf-8"))
    except FileNotFoundError:
        TS[name] = None

refs = {t["source"].split("/")[-1].split(".")[0]: t["firstgid"] for t in doc["tilesets"]}
print("== tileset firstgids:", refs)
COLS, ROWS = doc["width"], doc["height"]
print("== map:", COLS, "x", ROWS, "@", doc["tilewidth"], "=", COLS*32, "x", ROWS*32, " tiled", doc["tiledversion"], "nextobjectid", doc["nextobjectid"])

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
        spawn[char] = (r["x"] + r["w"]/2, r["y"] + r["h"])
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
        print(f"  gid对象 {base} tileset={b[0]} local={local} typeName={tname} rect(top)={r} center=({cx},{cy}) merged={merged}")
    else:
        extra = ""
        if o.get("polyline"):
            pts = [(o["x"] + p["x"], o["y"] + p["y"]) for p in o["polyline"]]
            extra = f" absPolyline={pts}"
        if o.get("polygon"):
            pts = [(o["x"] + p["x"], o["y"] + p["y"]) for p in o["polygon"]]
            extra = f" absPolygon={pts}"
        print(f"  非gid对象 {base}{extra}")

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

# 逐行跨度表
print("\nrow spans（c=col*32px; wC=楔C wD=楔D）:")
for row in range(ROWS):
    segs = []
    c0 = 0
    while c0 < COLS:
        v = grid[row][c0]
        c1 = c0
        while c1 + 1 < COLS and grid[row][c1 + 1] == v and v is not None:
            c1 += 1
        while c1 + 1 < COLS and grid[row][c1 + 1] is None and v is None:
            c1 += 1
        if v is not None:
            name = {0: "solid", 1: "/", 2: "\\", 3: "wC", 4: "wD", 5: "water", 6: "lava", 7: "green"}.get(v, str(v))
            segs.append(f"c{c0}({name})" if c0 == c1 else (f"c{c0}-c{c1}({name})" if v != 0 else f"c{c0}-c{c1}(solid)"))
        c0 = c1 + 1
    print(f"r{row:>2} y{row*32:>4}-{row*32+32:>4}: " + " ".join(segs))

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
