#!/usr/bin/env python3
# E 部 Objects 层 gid→type 正确解析（按 firstgid 区间归属 tileset）+ Ground type 直方图
import json, os, collections

BASE = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output"
E = os.path.join(BASE, "E")
ELEM = os.path.join(E, "data", "elements")
TUT = os.path.join(E, "data", "tutorials")
TS = os.path.join(E, "assets", "tilemaps", "tilesets")

def tileset_types(name):
    """localId -> type (str)  from tiles{} then tileproperties{}"""
    o = json.load(open(os.path.join(TS, name + ".json")))
    out = {}
    for k, v in (o.get("tiles") or {}).items():
        if "type" in v: out[int(k)] = v["type"]
    for k, v in (o.get("tileproperties") or {}).items():
        if "type" in v: out[int(k)] = v["type"]
    return out

CACHE = {}
def tst(name):
    if name not in CACHE: CACHE[name] = tileset_types(name)
    return CACHE[name]

per_level = {}
obj_hist = collections.Counter()
g_hist = collections.Counter()
cover_where = collections.Counter()

def scan(levels_dir, tag):
    for fn in sorted(os.listdir(levels_dir)):
        if not fn.endswith(".json"): continue
        p = os.path.join(levels_dir, fn)
        d = json.load(open(p))
        # tilesets: (firstgid, name)
        tss = sorted(((ts.get("firstgid", 1), os.path.basename(ts.get("source", "")), ts) for ts in d.get("tilesets", [])))
        def resolve(gid):
            best = None
            for fg, name, _ in tss:
                if gid >= fg and (best is None or fg > best[0]):
                    best = (fg, name)
            if best is None: return f"NO_TS:{gid}"
            fg, name = best
            base = os.path.splitext(name)[0]
            t = tst(base).get(gid - fg)
            return f"{base}:{t}" if t is not None else f"{base}:NO_LOCAL({gid - fg})"
        gl = collections.Counter(); ob = collections.Counter()
        for lyr in d.get("layers", []):
            if "data" in lyr:
                if lyr.get("name") == "Ground":
                    for g in lyr["data"]:
                        if g:
                            r = resolve(g)
                            gl[r] += 1
            else:
                lname = lyr.get("name")
                for o in lyr.get("objects", []):
                    gid = o.get("gid")
                    if gid: ob[resolve(gid)] += 1
                    else: ob[(o.get("type") or "<none>")] += 1
                    if (o.get("type")) == "cover":
                        cover_where[f"{tag}/{fn}"] += 1
        per_level[f"{tag}/{fn}"] = {"ground": dict(gl), "objs": dict(ob)}
        for k, v in gl.items(): g_hist[(tag, k)] += v
        for k, v in ob.items(): obj_hist[(tag, k)] += v

scan(os.path.join(TUT, "levels"), "tutorials")
for elem in sorted(os.listdir(ELEM)):
    scan(os.path.join(ELEM, elem, "levels"), elem)

print("=== Objects-layer resolved (ALL E) ===")
agg = collections.Counter()
for (tag, k), v in obj_hist.items():
    agg[k] += v
for k in sorted(agg): print(f"{k:40s} {agg[k]}")
print("=== Ground resolved ===")
agg2 = collections.Counter()
for (tag, k), v in g_hist.items(): agg2[k] += v
for k in sorted(agg2, key=str): print(f"{k:30s} {agg2[k]}")
print("=== per-level ground special (>9) ===")
for lv, d in sorted(per_level.items()):
    sp = {k: v for k, v in d["ground"].items() if not k.startswith("Ground:0") and not k.startswith("Ground:1") and not k.startswith("Ground:2") and not k.startswith("Ground:3") and not k.startswith("Ground:4") and not k.startswith("Ground:5") and not k.startswith("Ground:6") and not k.startswith("Ground:7")}
    sp = {k: v for k, v in sp.items() if "8" not in k.split(":")[1] and "9" not in k.split(":")[1]}
    if sp: print(lv, sp)
json.dump(per_level, open(os.path.join(os.path.dirname(__file__), "gid_hist2_perlevel.json"), "w"), indent=1)
json.dump({k: v for k, v in cover_where.items()}, open(os.path.join(os.path.dirname(__file__), "cover_where.json"), "w"), indent=1)
print("=== cover per level ===")
for k, v in sorted(cover_where.items()): print(k, v)
