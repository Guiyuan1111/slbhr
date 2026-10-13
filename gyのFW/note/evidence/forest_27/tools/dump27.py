# forest_27 解析层全量解码（纯 JSON，语义对齐 packages/shared/src/level2.ts；模式同 dump19/dump25）
# 用法: python dump27.py
import json, io, sys, math
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = r"D:\01_Guiyuan1111\GitHub\slbhr\gyのFW"
doc = json.load(open(ROOT + r"\data\forest\levels\forest_27.json", encoding="utf-8"))

TS = {}
for name in ["Chars", "Objects", "Ground", "LargeObjects"]:
    TS[name] = json.load(open(ROOT + rf"\assets\tilemaps\tilesets\{name}.json", encoding="utf-8"))

refs = {t["source"].split("/")[-1].split(".")[0]: t["firstgid"] for t in doc["tilesets"]}
print("== tileset firstgids:", refs)
COLS, ROWS = doc["width"], doc["height"]
print("== map:", COLS, "x", ROWS, "tiles @", doc["tilewidth"], "px =", COLS*32, "x", ROWS*32, "px")

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
    line = f"  id={o['id']} gid={gid} local={local} type={kind} char={char} objXY=({o['x']},{o['y']}) rect(top)={r}"
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
for ch, r in doors: print(f"door[{ch}]: rect={r}  (x{r['x']}..{r['x']+r['w']}, y{r['y']}..{r['y']+r['h']})  底传感条=({r['x']},{r['y']+r['h']})-({r['x']+r['w']},{r['y']+r['h']+8}) Door铰点=({r['x']+32},{r['y']+r['h']})")
print("diamonds:", len(diamonds), " kinds:", {k: sum(1 for d in diamonds if d[1]==k) for k in set(d[1] for d in diamonds)})
for d in sorted(diamonds, key=lambda t: (t[1], t[2], t[3])): print("  ", d)

# ---------------- Objects 层 ----------------
print("\n== Objects 层 ==")
for o in next(l for l in doc["layers"] if l.get("name") == "Objects")["objects"]:
    if "gid" in o:
        gid = o["gid"]
        b = resolve(gid)
        local = gid - b[1]
        tname = TS[b[0]].get("tiles", {}).get(str(local), {}).get("type")
        defaults = TS[b[0]].get("tileproperties", {}).get(str(local), {})
        merged = dict(defaults); merged.update(o.get("properties") or {})
        r = tile_obj_rect(o, o.get("width"), o.get("height"))
        cx, cy = r["x"] + r["w"]/2, r["y"] + r["h"]/2
        extra = f" [tile默认={defaults} merged={merged}]"
        if tname == "lever":
            sp, on = float(merged.get("startPos", -1)), float(merged.get("onis", 1))
            f0auto = (sp * on) > 0
            extra += f" startPos={sp:+g} onis={on:+g} -> JSON静态推断f0自动翻转={f0auto}（内核probe为准）"
            extra += f" 支点=({cx},{cy+22.4}) 初相角度推断: startPos+1->体角+36deg(尖{cx+36.7:.1f},{cy+22.4-50.5:.1f}) / -1->体角-36deg(尖{cx-36.7:.1f},{cy+22.4-50.5:.1f})"
        if tname == "pusher":
            extra += f" pusher中心=({cx:.0f},{cy:.0f}) 梯形贴图底边过体心"
        if tname == "ball":
            bx, by = cx - 16, cy + 20.8
            extra += f" ball体心=({bx},{by}) r=12.8px"
        if tname == "wind":
            rot = o.get("rotation", 0)
            rotDeg = rot + 90.0
            eAng = math.radians(-rotDeg)
            ex = -48*math.cos(eAng) - 32*math.sin(eAng)
            ey = -48*math.sin(eAng) + 32*math.cos(eAng)
            bx, by = r["x"] + ex, r["y"] + r["h"] - ey
            bodyAng = math.radians(rot + 90.0)
            dirx, diry = -math.sin(bodyAng), math.cos(bodyAng)  # b2 系 dir=(0,1) 旋转后
            L = float(merged.get("length", 10))
            sx_, sy_ = -32*dirx, -32*diry  # b2(+x,+y)->屏幕(-32x,-32y)
            # 风柱传感器（随体角旋转后世界系矩形近似：体角 0 时直接读）
            ca, sa = math.cos(bodyAng), math.sin(bodyAng)
            half_w, half_l = 1.3, L/2
            clocl = (0, L/2 + 0.5)
            corn = [(-half_w, clocl[1]-half_l), (half_w, clocl[1]-half_l), (half_w, clocl[1]+half_l), (-half_w, clocl[1]+half_l)]
            wpts = []
            for lx, ly in corn:
                wx = bx + (-32)*(ca*lx - sa*ly)
                wy = by + (-32)*(sa*lx + ca*ly)
                wpts.append((round(wx,1), round(wy,1)))
            print(f"  gid对象 id={o['id']} gid={gid} tileset={b[0]} local={local} typeName={tname} objXY=({o['x']},{o['y']}) rect(top)={r} rot={rot}{extra}")
            print(f"    wind体心(screen)=({bx:.2f},{by:.2f}) 体角={math.degrees(bodyAng):.3f}deg 屏幕风向(每单位力)={sx_:.3f},{sy_:.3f} len={L}m={L*32:.0f}px 风柱宽2.6m=83.2px")
            print(f"    风柱传感器世界四角={wpts}")
            continue
        print(f"  gid对象 id={o['id']} gid={gid} tileset={b[0]} local={local} typeName={tname} objXY=({o['x']},{o['y']}) rect(top)={r} center=({cx},{cy}) rot={o.get('rotation',0)}{extra}")
    else:
        t = o.get("type")
        line = f"  非gid对象 id={o['id']} type={t} objXY=({o['x']},{o['y']}) wh=({o.get('width')}x{o.get('height')}) props={o.get('properties')}"
        if t == "platform":
            p = o.get("properties") or {}
            dx = p.get("dx", 4); dy = p.get("dy", 0)
            grp = p.get("group", 0)
            w, h = o.get("width", 128), o.get("height", 32)
            cx, cy = o["x"] + w/2, o["y"] + h/2
            if "dtheta" in p:
                anch = (cx, cy - 32*(p.get("offsetY", 0) or 0)*-1)  # anchor = 中心 + 屏幕上移 32*offsetY? 实为 b2: pos-(0,offsetY) → 屏幕 y-32*offsetY
                anch = (cx, cy + 32*(p.get("offsetY", 0) or 0))     # b2 y - offsetY → 屏幕 y + 32*offsetY
                line += f" -> [旋转平台 dtheta={p['dtheta']}deg offsetY={p.get('offsetY')}m] f0碰撞体=28x96 @( {cx-14:.0f}-{cx+14:.0f}, {o['y']}-{o['y']+h} ) 中心=({cx},{cy}) 锚点=({anch[0]},{anch[1]}) 关节限位[0,+{p['dtheta']}deg] ON=体角0->-90deg(屏幕逆时针90) group={grp} dx/dy旋转分支不使用"
            else:
                on_dx, on_dy = -32*dx, -32*dy
                line += f" -> [平移平台] f0碰撞体=28x96 @( {o['x']+2}-{o['x']+30}, {o['y']}-{o['y']+h} ) 中心=({cx},{cy}) group={grp} ON位移(=−32·(dx,dy))=({on_dx},{on_dy})px 速度128px/s(±2m/s)"
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
print("type histogram:", {str(k): v for k, v in sorted(hist.items(), key=lambda kv: str(kv[0]))})
print("ruler: col 0 =", "".join(str((c // 10) % 10) for c in range(COLS)))
print("       col 1 =", "".join(str(c % 10) for c in range(COLS)))
for row in range(ROWS):
    cells = "".join("·" if grid[row][c] is None else SYM.get(grid[row][c], "?") for c in range(COLS))
    print(f"y{row*32:>4} r{row:>2} {cells}")

print("\n逐行跨度表（同型连续段）：")
def nm(t):
    return {0:"solid",1:"/",2:"\\",3:"wC",4:"wD",5:"water",6:"lava",7:"green"}.get(t, str(t))
for row in range(ROWS):
    segs = []
    c = 0
    while c < COLS:
        t = grid[row][c]
        c0 = c
        while c < COLS and grid[row][c] == t: c += 1
        if t is not None:
            segs.append(f"c{c0}{'-c'+str(c-1) if c-1>c0 else ''}({nm(t)})")
    print(f"r{row:>2} y{row*32:>4}-{row*32+32:>4}: " + (" ".join(segs) if segs else "(全空)"))

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
