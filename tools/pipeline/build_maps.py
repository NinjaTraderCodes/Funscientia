"""Convert Tiled maps (content/maps/*.tmj) into game-ready place files.

For each map:
  - the background image layer is resized for shipping -> public/assets/world/<map>.webp
    (uses an x4 upscale next to the master if present: <master>_x4.png)
  - objects (walkable polygon, spawn, hotspots, NPCs, props) and map properties
    are flattened to public/assets/world/<map>.place.json, in master-image pixels

Edit the map in Tiled (free), then run:  python tools/pipeline/build_maps.py
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "content" / "maps"
OUT = ROOT / "public" / "assets" / "world"
SHIP_WIDTH = 2560


def props(obj: dict) -> dict:
    return {p["name"]: p["value"] for p in obj.get("properties", [])}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for tmj in sorted(SRC.glob("*.tmj")):
        m = json.loads(tmj.read_text(encoding="utf-8"))
        name = tmj.stem
        # every image layer ships as its own webp; Tiled's parallaxx sets how fast it scrolls
        images = [l for l in m["layers"] if l["type"] == "imagelayer"]
        layers = []
        w = h = None
        for l in images:
            master = (tmj.parent / l["image"]).resolve()
            if w is None:
                w, h = Image.open(master).size
            hi = master.with_name(master.stem.replace("_master", "") + "_x4.png")
            src = Image.open(hi if hi.exists() else master)
            src = src.convert("RGBA" if src.mode in ("RGBA", "LA", "P") else "RGB")
            ship_h = round(h * SHIP_WIDTH / w)
            key = f"{name}_{l['name']}" if len(images) > 1 else name
            par = float(l.get("parallaxx", 1.0))
            src.resize((SHIP_WIDTH, ship_h), Image.LANCZOS).save(OUT / f"{key}.webp", quality=86, method=6)
            layers.append({"image": f"world/{key}", "parallax": par,
                           "front": bool(props(l).get("front", False))})
        place = {"name": name, "image": layers[0]["image"], "layers": layers, "width": w, "height": h, **props(m),
                 "walkable": [], "spawn": None, "hotspots": [], "npcs": [], "props": []}
        for layer in m["layers"]:
            if layer["type"] != "objectgroup":
                continue
            for o in layer["objects"]:
                kind = o.get("type") or o.get("class", "")
                if "polygon" in o:
                    place["walkable"] = [[round(o["x"] + p["x"], 1), round(o["y"] + p["y"], 1)] for p in o["polygon"]]
                    continue
                entry = {"name": o["name"], "x": o["x"], "y": o["y"], **props(o)}
                if kind == "spawn":
                    place["spawn"] = entry
                elif kind == "hotspot":
                    place["hotspots"].append(entry)
                elif kind == "npc":
                    place["npcs"].append(entry)
                elif kind == "prop":
                    place["props"].append(entry)
        (OUT / f"{name}.place.json").write_text(json.dumps(place, indent=1), encoding="utf-8")
        print(f"{name}: {len(place['walkable'])}-point walkable, {len(place['hotspots'])} hotspots, "
              f"{len(layers)} image layer(s): " + ", ".join(f"{l['image']} x{l['parallax']}" for l in layers))


if __name__ == "__main__":
    main()
