# forest_31 解析层全量解码（纯 JSON，语义对齐 packages/shared/src/level2.ts）
import json, io, sys, math
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = r"D:\01_Guiyuan1111\GitHub\slbhr\gyのFW"
doc = json.load(open(ROOT + r"\data\forest\levels\forest_31.json", encoding="utf-8"))

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
        extra = ""
        if tname == "lever":
            sp, on = float(merged.get("startPos", -1)), float(merged.get("onis", 1))
            f0auto = (sp * on) > 0
            extra = f" [merged={merged}] startPos={sp} onis={on} -> f0 autoON={f0auto} (startPos*onis={sp*on:+g})"
            extra += f" [tileset={b[0]} gid体角={'-36' if sp==-1 else '+36'}deg]"
        if tname == "box":
            extra = " -> box 八边形56.6px"
        print(f"  gid对象 {base} tileset={b[0]} local={local} typeName={tname} rect(top)={r} center=({cx},{cy}){extra}")
    else:
        t = o.get("type")
        if t == "platform":
            pr = o.get("properties") or {}
            dx, dy = pr.get("dx", 4), pr.get("dy", 0)
            grp = pr.get("group", 0)
            dtheta = pr.get("dtheta"); offy = pr.get("offsetY")
            w_, h_ = o.get("width", 128), o.get("height", 32)
            ccx, ccy = o["x"] + w_/2, o["y"] + h_/2
            swap = (w_/32 < h_/32)
            note = "竖直(交换,实体28.4x128 中心同)" if swap else "水平"
            rot_note = ""
            if dtheta is not None:
                anchorY = ccy + (offy or 0) * 32  # 物理 anchor=pos-(0,offY) → 屏幕 pivotY = cy + offY*32
                rot_note = f" 旋转 dtheta={dtheta} offsetY={offy} pivot=({ccx},{anchorY}) f0竖直板; ON(若组有信号)=屏幕逆时针90°→水平东伸 pivot东{abs(offy or 0)*32}px"
            print(f"  platform id={o['id']} xy=({o['x']},{o['y']}) wh=({w_}x{h_}) {note} center=({ccx},{ccy}) dx={dx} dy={dy} group={grp} ON位移px=({-32*dx},{-32*dy}){rot_note} props={pr}")
        elif t == "pulley":
            pts = [(o["x"]+p["x"], o["y"]+p["y"]) for p in o["polyline"]]
            a1 = (pts[1][0], pts[1][1]+64); a2 = (pts[2][0], pts[2][1]+64)
            l1 = math.hypot(pts[0][0]-a1[0], pts[0][1]-a1[1]); l2 = math.hypot(pts[3][0]-a2[0], pts[3][1]-a2[1])
            print(f"  pulley id={o['id']} pts(板1/轮1/轮2/板2)={pts} 锚1={a1} 锚2={a2} 绳长1={l1:.1f} 绳长2={l2:.1f} 总={l1+l2:.1f} ratio=1")
        else:
            print(f"  非gid对象 {base}")

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

# liquid runs
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

# 逐行跨度表（供蓝图）
print("\n== 逐行跨度 ==")
NAMES = {0: "solid", 1: "/", 2: "\\", 3: "wC", 4: "wD", 5: "water", 6: "lava", 7: "green"}
for row in range(ROWS):
    spans = []
    c = 0
    while c < COLS:
        v = grid[row][c]
        c2 = c
        while c2 + 1 < COLS and grid[row][c2+1] == v:
            c2 += 1
        if v is not None:
            nm = NAMES.get(v, str(v))
            if c2 > c:
                spans.append(f"c{c}-c{c2}({nm})")
            else:
                spans.append(f"c{c}({nm})")
        c = c2 + 1
    print(f"r{row:>2} y{row*32:>4}-{row*32+32:>4}: " + " ".join(spans))
