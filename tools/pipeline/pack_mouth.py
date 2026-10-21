"""Ship the Mouth mini-game's art (Dounia's designs).

  docs/images/Mini-Game_Mouth_Background.jpg -> public/assets/mouth/background.webp (x4 upscaled, 2560 wide)
  docs/images/Mini-Game_Mouth_Objects.jpg    -> public/assets/mouth/ui_<piece>.webp  (cut off the green screen)
  her prototype's sprites.png                -> public/assets/mouth/<sprite>.webp     (hammer, tongue, foods)
  Mini-Game_Mouth_Bolus.png / _Tongue_Ouch.png -> bolus.webp, tongue_ouch.webp (made in her style with
    ChatGPT image generation; prompts in content/prompts/mouth/)
  + public/assets/mouth/mouth.json: where the holes, the throat and the tongue's ring are,
    in pixels of the 1280x853 background.

Usage:  python tools/pipeline/pack_mouth.py
"""
from __future__ import annotations

import json
import subprocess
import tempfile
import zipfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
IMAGES = ROOT / "docs" / "images"
PROTO_ZIP = ROOT / "docs" / "games-codes" / "Funscientia_Mouth_Hammer_Source.zip"
OUT = ROOT / "public" / "assets" / "mouth"
ESRGAN = ROOT / ".tools" / "realesrgan" / "realesrgan-ncnn-vulkan.exe"
BG_WIDTH = 2560

# Background layout (1280x853 picture). Holes: back row of 4, front row of 5 - the centre
# of each hole's opening, where a food stands, and its width.
HOLES = [
    (380, 449, 136), (583, 428, 110), (749, 468, 159), (960, 443, 138),
    (275, 518, 167), (524, 500, 176), (664, 549, 140), (901, 537, 192), (1130, 507, 174),
]
THROAT = (703, 285)  # the far arch, where the swallowed food goes (the uvula hangs above it)
RING = (1232, 300)   # the golden ring on the right: the tongue's door
# saliva meter, as shares of its picture: the channel (left, top, bottom) and where its drawn water ends
SALIVA_CHANNEL = (352 / 1592, 98 / 378, 282 / 378)
SALIVA_WATER_END = 1308 / 1592
SALIVA_CHANNEL_END = 1548 / 1592

# The objects sheet: pieces in reading order, as found on the green screen
UI_PIECES = ["timer", "score", "pause", "saliva_bar", "spray", "card_chew", "card_mix", "card_moisten"]
# Prototype sprite sheet: 3 x 3 cells
SPRITES = [["hammer", "tongue", "brownie"], ["bread", "carrot", "broccoli"], ["cheese", "bread_b", "bread_c"]]


def upscale(img: Image.Image) -> Image.Image:
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / "in.png", Path(tmp) / "out.png"
        img.save(src)
        subprocess.run([str(ESRGAN), "-i", str(src), "-o", str(dst), "-n", "realesrgan-x4plus"], check=True, capture_output=True)
        return Image.open(dst).copy()


def save(im: Image.Image, name: str, **kw) -> None:
    path = OUT / name
    im.save(path, **kw)
    print(f"{path.relative_to(ROOT)}: {im.width}x{im.height}, {path.stat().st_size / 1e3:.0f} KB")


def key_green(rgb: np.ndarray) -> np.ndarray:
    """RGBA with the green screen made transparent (soft edge, green spill removed)."""
    r, g, b = (rgb[..., i].astype(np.float32) for i in range(3))
    greenness = g - np.maximum(r, b)
    alpha = np.clip(1 - (greenness - 40) / 80, 0, 1)
    # spill: edge pixels tinted by the screen lose their extra green
    g2 = np.where(greenness > 0, np.minimum(g, np.maximum(r, b) + 10), g)
    out = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
    return out


def largest_piece(cell: Image.Image) -> Image.Image:
    """Keep one sprite's own picture: its largest shape plus anything touching it
    (neighbours in the prototype's sheet overlap a few pixels into each cell)."""
    a = np.array(cell)[..., 3]
    solid = (a > 8).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(cv2.dilate(solid, np.ones((7, 7), np.uint8)), 8)
    keep = labels == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    out = np.array(cell).copy()
    out[..., 3] = np.where(keep, out[..., 3], 0)
    im = Image.fromarray(out, "RGBA")
    return im.crop(im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())


def split_saliva(bar: Image.Image) -> None:
    """Dounia's meter comes filled: make an empty bar (water repainted with the channel's
    navy) and the water on its own, which the game reveals up to the saliva level."""
    im = np.array(bar).astype(np.float32)
    h = im.shape[0]
    x0, x1 = round(SALIVA_CHANNEL[0] * bar.width), round(SALIVA_WATER_END * bar.width)
    y0, y1 = round(SALIVA_CHANNEL[1] * h), round(SALIVA_CHANNEL[2] * h)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    water = (b >= r) & (b > 140) & (im[..., 3] > 100)  # blue water and its white highlights; navy is darker
    region = np.zeros(water.shape, bool)
    region[y0:y1, x0:x1 + 4] = True
    water &= region
    soft = cv2.GaussianBlur(water.astype(np.float32), (0, 0), 1.2)
    navy = im[:, round(0.88 * bar.width), :3]  # the empty end's colour, row by row (keeps its shading)
    empty = im.copy()
    # the whole channel up to just past the drawn water takes the empty end's colour
    # (water, its highlights and its edge lines alike) - only the gold frame stays as drawn
    channel = np.zeros(water.shape, np.float32)
    channel[y0:y1, x0:x1 + 14] = 1
    channel *= (r <= b + 30)  # gold is much redder than blue: leave it
    channel = cv2.GaussianBlur(channel, (0, 0), 1.0) * (r <= b + 30)
    empty[..., :3] = im[..., :3] * (1 - channel[..., None]) + navy[:, None, :] * channel[..., None]
    save(Image.fromarray(empty.clip(0, 255).astype(np.uint8), "RGBA"), "ui_saliva_empty.webp", quality=90, method=6)
    strip = im[y0:y1, x0:x1 + 4].copy()
    strip[..., 3] = soft[y0:y1, x0:x1 + 4] * 255
    save(Image.fromarray(strip.clip(0, 255).astype(np.uint8), "RGBA"), "ui_saliva_water.webp", quality=90, method=6)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # background: sharpened x4, shipped at 2560 wide
    bg = Image.open(IMAGES / "Mini-Game_Mouth_Background.jpg").convert("RGB")
    big = upscale(bg)
    save(big.resize((BG_WIDTH, round(bg.height * BG_WIDTH / bg.width)), Image.LANCZOS), "background.webp", quality=86, method=6)

    # interface pieces: off the green screen, each its own image (x2 of the sheet's size)
    sheet = np.array(Image.open(IMAGES / "Mini-Game_Mouth_Objects.jpg").convert("RGB"))
    rgba = key_green(sheet)
    solid = (rgba[..., 3] > 128).astype(np.uint8)
    solid = cv2.dilate(solid, np.ones((9, 9), np.uint8))  # join an icon to its bar
    n, labels, stats, _ = cv2.connectedComponentsWithStats(solid, 8)
    boxes = [tuple(stats[i][:4]) for i in range(1, n) if stats[i][4] > 3000]
    # reading order: rows (by top), then left to right
    boxes.sort(key=lambda b: (round(b[1] / 120), b[0]))
    if len(boxes) != len(UI_PIECES):
        raise SystemExit(f"found {len(boxes)} pieces on the objects sheet, expected {len(UI_PIECES)}")
    for name, (x, y, w, h) in zip(UI_PIECES, boxes):
        piece = Image.fromarray(rgba[y:y + h, x:x + w], "RGBA")
        piece = upscale(piece)
        piece = piece.resize((w * 2, h * 2), Image.LANCZOS)
        if name == "saliva_bar":
            split_saliva(piece)
        else:
            save(piece, f"ui_{name}.webp", quality=90, method=6)
        if name == "score":
            # the gold star badge on its own (results stars)
            save(piece.crop((0, 0, piece.height, piece.height)), "ui_star.webp", quality=90, method=6)

    # sprites from the prototype (hammer, tongue, foods), each trimmed to its picture
    with zipfile.ZipFile(PROTO_ZIP) as z:
        with z.open("assets/sprites.png") as f:
            atlas = Image.open(f).convert("RGBA")
            atlas.load()
    cw, ch = atlas.width / 3, atlas.height / 3
    for row, names in enumerate(SPRITES):
        for col, name in enumerate(names):
            cell = atlas.crop((round(col * cw), round(row * ch), round((col + 1) * cw), round((row + 1) * ch)))
            save(largest_piece(cell), f"{name}.webp", quality=90, method=6)

    for src, name in (("Mini-Game_Mouth_Bolus.png", "bolus"), ("Mini-Game_Mouth_Tongue_Ouch.png", "tongue_ouch")):
        im = Image.open(IMAGES / src).convert("RGBA")
        im = im.crop(im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())
        im.thumbnail((480, 480), Image.LANCZOS)
        save(im, f"{name}.webp", quality=90, method=6)

    layout = {
        "units": "pixels of the 1280x853 background",
        "size": [bg.width, bg.height],
        "holes": [{"x": x, "y": y, "w": w} for x, y, w in HOLES],
        "throat": {"x": THROAT[0], "y": THROAT[1]},
        "ring": {"x": RING[0], "y": RING[1]},
        # the saliva meter's water fills from `from` to `to` (shares of the empty bar's width)
        "saliva": {"from": SALIVA_CHANNEL[0], "to": SALIVA_CHANNEL_END, "top": SALIVA_CHANNEL[1], "bottom": SALIVA_CHANNEL[2]},
    }
    (OUT / "mouth.json").write_text(json.dumps(layout, indent=1))
    print("mouth.json:", len(HOLES), "holes")


if __name__ == "__main__":
    main()
