"""Ship the Small Intestine mini-game's art (Dounia's SI_3rdGame_* sheets, plus a few pieces in her style).

  docs/images/SI_3rdGame_01.jpg   -> public/assets/intestine/background.webp (x4 upscaled, 2560 wide)
  docs/images/SI_3rdGame_02.jpg   -> trypsin.webp, peptidase.webp           (her blue scissors)
  docs/images/SI_3rdGame_03.jpg   -> bile.webp, fat_wet.webp, lipase.webp, glycerol.webp, fatty_acid_N.webp
  docs/images/SI_3rdGame_04.jpg   -> amylase.webp, maltase.webp (her purple scissors; maltase tinted
                                     pink, as she suggested, so the two can be told apart)
  docs/images/SI_3rdGame_05..21   -> water.webp, minerals.webp, fibre.webp, vitamin_<x>.webp
  art/intestine/*.png             -> ui_card_{fats,proteins,carbs,absorb}.webp (step cards made with ChatGPT
                                     image generation in the cards' style; prompts in content/prompts/intestine/)
  + public/assets/intestine/intestine.json: the openings, the rings and the inside of the intestine,
    in pixels of the 1280x720 background.
The beads (amino acids, glucose) and the whole fats are the Stomach's (her same art).
Memory_Game_* images are for the revision game only: none is used here.

Usage:  python tools/pipeline/pack_intestine.py
"""
from __future__ import annotations

import json
import sys

import cv2
import numpy as np
from PIL import Image

from pack_stomach import ROOT, cut_white, save, ship, trim, upscale

IMAGES = ROOT / "docs" / "images"
ART = ROOT / "art" / "intestine"
OUT = ROOT / "public" / "assets" / "intestine"
BG_WIDTH = 2560

# Background layout (1280x720 picture)
BILE = (612, 200)        # the green bile duct (from the gallbladder)
PANCREAS = (740, 228)    # the pancreatic duct
WALL = (914, 266)        # the intestinal opening (the wall's own juice)
ENTRY = (115, 305)       # the golden ring the chyme comes in by (from the stomach)
EXIT = (1190, 460)       # the golden ring it leaves by
INSIDE = [(225, 300), (420, 255), (560, 240), (700, 258), (860, 292), (1010, 322), (1105, 380),
          (1120, 520), (1050, 585), (860, 615), (640, 615), (430, 585), (275, 520), (225, 420)]
VILLI_Y = 612            # the lining at the bottom, where nutrients are absorbed

# On each sheet: a point inside each piece (x, y in the 1280-wide sheet), or a box to cut it out of
PIECES = {
    "SI_3rdGame_02": {"trypsin": (610, 110), "peptidase": (640, 470)},
    "SI_3rdGame_03": {"bile": (625, 95), "fat_wet": (620, 470), "lipase": (650, 660), "glycerol": (570, 810),
                      "fatty_acid_0": (700, 765), "fatty_acid_1": (705, 815), "fatty_acid_2": (705, 862)},
    "SI_3rdGame_04": {"amylase": (745, 115), "maltase": (280, 445)},
}
# boxes that keep a piece apart from an arrow drawn into it (left, top, right, bottom)
BOXES = {"fat_wet": (480, 392, 770, 565)}
HOLES = {"trypsin", "peptidase", "lipase", "amylase", "maltase", "fat_wet"}
TRAVELLERS = {"water": "05", "minerals": "06", "fibre": "09", "vitamin_k": "10", "vitamin_d": "11", "vitamin_a": "12",
              "vitamin_e": "13", "vitamin_b3": "14", "vitamin_b9": "15", "vitamin_c": "16", "vitamin_b2": "17",
              "vitamin_b6": "18", "vitamin_b1": "19", "vitamin_b5": "20", "vitamin_b12": "21"}


def piece_at(rgb: np.ndarray, at: tuple[int, int]) -> Image.Image:
    """The shape of a white-background sheet that covers a point."""
    fg, alpha = cut_white(rgb)
    joined = cv2.dilate(fg.astype(np.uint8), np.ones((5, 5), np.uint8))
    _, lab = cv2.connectedComponents(joined, 8)
    x, y = at
    win = lab[max(0, y - 6):y + 7, max(0, x - 6):x + 7]
    ids = win[win > 0]
    if not len(ids):
        raise SystemExit(f"nothing drawn at {at}")
    keep = lab == np.bincount(ids).argmax()
    return trim(Image.fromarray(np.dstack([rgb, np.where(keep, alpha, 0)]).astype(np.uint8), "RGBA"))


def largest(rgb: np.ndarray) -> Image.Image:
    fg, alpha = cut_white(rgb)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(cv2.dilate(fg.astype(np.uint8), np.ones((9, 9), np.uint8)), 8)
    keep = lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return trim(Image.fromarray(np.dstack([rgb, np.where(keep, alpha, 0)]).astype(np.uint8), "RGBA"))


def pink(im: Image.Image) -> Image.Image:
    """Purple -> rose pink (maltase), keeping the gold handles and the shading."""
    a = np.array(im).astype(np.float32)
    hsv = cv2.cvtColor(a[..., :3].astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    purple = (hsv[..., 0] > 115) & (hsv[..., 0] < 160) & (hsv[..., 1] > 40)
    hsv[..., 0] = np.where(purple, 168, hsv[..., 0])
    rgb = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
    return Image.fromarray(np.dstack([rgb, a[..., 3]]).astype(np.uint8), "RGBA")


def main(preview: bool = False) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cut: dict[str, Image.Image] = {}
    for sheet, items in PIECES.items():
        rgb = np.array(Image.open(IMAGES / f"{sheet}.jpg").convert("RGB"))
        for name, at in items.items():
            if name in BOXES:
                x0, y0, x1, y1 = BOXES[name]
                cut[name] = largest(rgb[y0:y1, x0:x1])
            else:
                cut[name] = piece_at(rgb, at)
    cut["maltase"] = pink(cut["maltase"])
    for name, num in TRAVELLERS.items():
        cut[name] = largest(np.array(Image.open(IMAGES / f"SI_3rdGame_{num}.jpg").convert("RGB")))
    if preview:
        sheet = Image.new("RGBA", (1600, 900), (40, 40, 60, 255))
        x = y = 0
        for name, im in cut.items():
            im = im.copy()
            im.thumbnail((190, 190))
            sheet.alpha_composite(im, (x, y))
            x += 200
            if x > 1400:
                x, y = 0, y + 210
        sheet.convert("RGB").save(ROOT / ".tools" / "work" / "shots" / "si_cut_preview.jpg", quality=85)
        print({k: v.size for k, v in cut.items()})
        return

    bg = Image.open(IMAGES / "SI_3rdGame_01.jpg").convert("RGB")
    save(upscale(bg).resize((BG_WIDTH, round(bg.height * BG_WIDTH / bg.width)), Image.LANCZOS), OUT / "background.webp", quality=86, method=6)
    heights = {"bile": 240, "fat_wet": 220, "glycerol": 150, "water": 220, "minerals": 200, "fibre": 260}
    for name, im in cut.items():
        h = heights.get(name, 120 if name.startswith("fatty_acid") else 160 if name.startswith("vitamin") else 220)
        # see-through finger rings and gaps between the tails; fat_wet's box also catches a bit of an arrow
        ship(im, name, h, OUT, holes=name in HOLES, whole=name == "fat_wet", keep_left=0.2 if name == "fat_wet" else 0)
    for name in ("card_fats", "card_proteins", "card_carbs", "card_absorb"):
        if not (ART / f"{name}.png").exists():
            print("not made yet:", name)
            continue
        im = largest(np.array(Image.open(ART / f"{name}.png").convert("RGB")))
        save(im.resize((760, round(im.height * 760 / im.width)), Image.LANCZOS), OUT / f"ui_{name}.webp", quality=90, method=6)

    layout = {
        "units": "pixels of the 1280x720 background",
        "size": [bg.width, bg.height],
        "bile": {"x": BILE[0], "y": BILE[1]}, "pancreas": {"x": PANCREAS[0], "y": PANCREAS[1]}, "wall": {"x": WALL[0], "y": WALL[1]},
        "entry": {"x": ENTRY[0], "y": ENTRY[1]}, "exit": {"x": EXIT[0], "y": EXIT[1]},
        "inside": [[x, y] for x, y in INSIDE], "villiY": VILLI_Y,
        "vitamins": sorted(k for k in TRAVELLERS if k.startswith("vitamin")),
    }
    (OUT / "intestine.json").write_text(json.dumps(layout, indent=1))
    print("intestine.json written")


if __name__ == "__main__":
    if "--cards" in sys.argv:  # only the step cards (once they are generated)
        for name in ("card_fats", "card_proteins", "card_carbs", "card_absorb"):
            im = largest(np.array(Image.open(ART / f"{name}.png").convert("RGB")))
            save(im.resize((760, round(im.height * 760 / im.width)), Image.LANCZOS), OUT / f"ui_{name}.webp", quality=90, method=6)
    else:
        main(preview="--preview" in sys.argv)
