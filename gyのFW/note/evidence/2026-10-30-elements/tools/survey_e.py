#!/usr/bin/env python3
# E 部（elements）全量普查：temple/levels/objects/gid/cover
# 只读 oracle，输出 JSON 到 stdout
import json, os, sys, collections

ORACLE = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl"
E = os.path.join(ORACLE, "output", "E")
ELEM = os.path.join(E, "data", "elements")
TUT = os.path.join(E, "data", "tutorials")

out = {"game": None, "elements": {}, "tutorials": None}

out["game"] = json.load(open(os.path.join(E, "game.json"), encoding="utf-8"))

def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)

# tutorials 结构
tut = {}
if os.path.isdir(TUT):
    for root, dirs, files in os.walk(TUT):
        for fn in sorted(files):
            if fn.endswith(".json"):
                rel = os.path.relpath(os.path.join(root, fn), TUT)
                tut[rel] = "json"
out["tutorials_files"] = sorted(tut)

gid_counter = collections.Counter()   # (element, layer, gid) -> count
cover_records = []
level_index = []  # per element temple levels vs files

for elem in sorted(os.listdir(ELEM)):
    edir = os.path.join(ELEM, elem)
    if not os.path.isdir(edir):
        continue
    rec = {"temple": None, "levels": {}, "objects": collections.Counter(),
           "ground_gids": collections.Counter(), "layers": collections.Counter(),
           "non_gid_types": collections.Counter(), "tilesets": set(), "size": set()}
    tp = os.path.join(edir, "temple.json")
    if os.path.exists(tp):
        rec["temple"] = load(tp)
    lv = os.path.join(edir, "levels")
    for fn in sorted(os.listdir(lv)):
        if not fn.endswith(".json"):
            continue
        data = load(os.path.join(lv, fn))
        fields = {k: data.get(k) for k in ("id","x","y","filename","time","mobileTime","type","width","height")}
        fields["width"] = data.get("width"); fields["height"] = data.get("height")
        ents = []
        for lyr in data.get("layers", []):
            lname = lyr.get("name")
            ltype = lyr.get("type", "tile" if "data" in lyr else "?")
            rec["layers"][(lname, "tile" if "data" in lyr else "obj")] += 1
            if "data" in lyr:  # tile layer
                for g in lyr["data"]:
                    if g:
                        rec["ground_gids"][(lname, g)] += 1
            else:  # object group
                for o in lyr.get("objects", []):
                    t = o.get("type") or ""
                    rec["objects"][t] += 1
                    if "gid" not in o or not o.get("gid"):
                        rec["non_gid_types"][t] += 1
                    if t == "cover":
                        cover_records.append({"elem": elem, "file": fn,
                                              "name": o.get("name"), "type": o.get("type"),
                                              "gid": o.get("gid"), "x": o.get("x"), "y": o.get("y"),
                                              "w": o.get("width"), "h": o.get("height"),
                                              "visible": o.get("visible"),
                                              "point": o.get("point"),
                                              "properties": o.get("properties")})
                    if t and (o.get("gid") is None):
                        ents.append({"name": o.get("name"), "type": t, "keys": sorted(o.keys()),
                                     "props": o.get("properties")})
        # tilesets
        ts = []
        for t in data.get("tilesets", []):
            ts.append(t.get("source") or t.get("name"))
            rec["tilesets"].add(t.get("source") or t.get("name"))
        rec["levels"][fn] = {"fields": fields, "tilesets": ts,
                             "non_gid_obj_count": len(ents)}
        rec["size"].add(f'{data.get("width")}x{data.get("height")}')
    # counters -> plain
    rec["objects"] = dict(rec["objects"])
    rec["ground_gids"] = {f"{k[0]}|{k[1]}": v for k, v in sorted(rec["ground_gids"].items())}
    rec["layers"] = {f"{k[0]}|{k[1]}": v for k, v in sorted(rec["layers"].items())}
    rec["non_gid_types"] = dict(rec["non_gid_types"])
    rec["tilesets"] = sorted(rec["tilesets"])
    rec["size"] = sorted(rec["size"])
    out["elements"][elem] = rec

out["cover_records"] = cover_records
out["cover_total"] = len(cover_records)
json.dump(out, sys.stdout, ensure_ascii=False, indent=1, sort_keys=True)
