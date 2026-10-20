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
        layers = {l["name"]: l for l in m["layers"]}
        bg = layers["background"]
        master = (tmj.parent / bg["image"]).resolve()
        w, h = Image.open(master).size
        hi = master.with_name(master.stem.replace("_master", "") + "_x4.png")
        src = Image.open(hi if hi.exists() else master).convert("RGB")
        ship_h = round(h * SHIP_WIDTH / w)
        src.resize((SHIP_WIDTH, ship_h), Image.LANCZOS).save(OUT / f"{name}.webp", quality=86, method=6)

        place = {"name": name, "image": f"world/{name}", "width": w, "height": h, **props(m),
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
              f"background {SHIP_WIDTH}x{ship_h} from {(hi if hi.exists() else master).name}")


if __name__ == "__main__":
    main()
