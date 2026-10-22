"""Ship the Stomach mini-game's art (Dounia's designs, plus a few pieces made in her style).

  docs/images/Stomach_Design_0.jpg     -> public/assets/stomach/background.webp (x4 upscaled, 2560 wide)
  docs/images/Stomach_Element_1.jpg    -> protein_NN.webp  (single blue beads of her protein chain)
  docs/images/Stomach_Element_3.jpg    -> starch_NN.webp   (single purple beads of her starch chain)
  docs/images/Stomach_Element_4.jpg    -> fat_N.webp       (her fat molecules, whole)
  docs/images/Stomach_Elements_6.jpg   -> scissors.webp    (the blue scissors: pepsin)
  docs/images/Stomach_Elements_5.jpg   -> flask.webp, and the enzymes' portraits
                                          (public/assets/portraits/{pepsin,amylase,lipase}_happy.webp),
                                          cut above their Arabic name plates (names are drawn by the game)
  art/stomach/*.png                    -> ui_card_{churn,acid,pepsin,chyme}.webp, gauge.webp, germ.webp,
                                          chyme.webp (made with ChatGPT image generation in her style;
                                          prompts in content/prompts/stomach/)
  + public/assets/stomach/stomach.json: where the gates are and the inside of the stomach,
    in pixels of the 1280x720 background.

Usage:  python tools/pipeline/pack_stomach.py
"""
from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
IMAGES = ROOT / "docs" / "images"
ART = ROOT / "art" / "stomach"
OUT = ROOT / "public" / "assets" / "stomach"
PORTRAITS = ROOT / "public" / "assets" / "portraits"
ESRGAN = ROOT / ".tools" / "realesrgan" / "realesrgan-ncnn-vulkan.exe"
BG_WIDTH = 2560

# Background layout (1280x720 picture)
CARDIA = (905, 88)    # the gate the food comes in by (from the esophagus)
PYLORUS = (112, 318)  # the golden ring the chyme leaves by (to the small intestine)
# the inside of the stomach, where things float (a polygon, clockwise from the pylorus side)
# (it stops short of the right wall: the step cards are drawn there)
INSIDE = [(250, 240), (470, 222), (620, 168), (760, 150), (1040, 160), (1100, 182), (1125, 260),
          (1130, 480), (1105, 600), (1000, 650), (700, 640), (460, 590), (310, 515), (240, 430), (228, 320)]
# Dounia's interface sheet (1280x853): the pieces, above their name plates (left, top, right, bottom)
SHEET_PIECES = {"flask": (430, 18, 632, 186), "pepsin": (60, 290, 440, 534), "amylase": (460, 300, 810, 544),
                "lipase": (840, 290, 1245, 536)}


def upscale(img: Image.Image, tries: int = 3) -> Image.Image:
    """Real-ESRGAN x4 (it sometimes writes an empty picture: check and retry)."""
    for _ in range(tries):
        with tempfile.TemporaryDirectory() as tmp:
            src, dst = Path(tmp) / "in.png", Path(tmp) / "out.png"
            img.save(src)
            subprocess.run([str(ESRGAN), "-i", str(src), "-o", str(dst), "-n", "realesrgan-x4plus"], check=True, capture_output=True)
            out = Image.open(dst).copy()
        if np.array(out.convert("RGBA"))[..., 3].max() > 0 and np.array(out.convert("L")).max() > 0:
            return out
    raise RuntimeError("upscale kept failing")


def save(im: Image.Image, path: Path, **kw) -> None:
    im.save(path, **kw)
    print(f"{path.relative_to(ROOT)}: {im.width}x{im.height}, {path.stat().st_size / 1e3:.0f} KB")


def cut_white(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Foreground of a picture on a white background: the near-white pixels joined to the
    border are background (white highlights inside a shape stay); a soft one-pixel edge."""
    light = (rgb.min(axis=2) > 222) & ((rgb.max(axis=2).astype(int) - rgb.min(axis=2)) < 28)
    _, lab = cv2.connectedComponents(light.astype(np.uint8), connectivity=4)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border)) & light
    fg = ~bg
    ring = fg & cv2.dilate(bg.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    alpha = np.where(fg, 255, 0).astype(np.float32)
    whiteness = rgb.min(axis=2).astype(np.float32)
    alpha[ring] = np.clip((255 - whiteness[ring]) / (255 - 150) * 255, 60, 255)
    return fg, alpha.astype(np.uint8)


def trim(im: Image.Image) -> Image.Image:
    return im.crop(im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())


def pieces(rgb: np.ndarray, min_area: int = 3000) -> list[Image.Image]:
    """Each separate shape of a white-background sheet, left to right then top to bottom."""
    fg, alpha = cut_white(rgb)
    joined = cv2.dilate(fg.astype(np.uint8), np.ones((9, 9), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(joined, 8)
    out = []
    for i in sorted(range(1, n), key=lambda i: (round(stats[i][1] / 200), stats[i][0])):
        if stats[i][4] < min_area:
            continue
        x, y, w, h = stats[i][:4]
        a = np.where(lab[y:y + h, x:x + w] == i, alpha[y:y + h, x:x + w], 0)
        out.append(trim(Image.fromarray(np.dstack([rgb[y:y + h, x:x + w], a]).astype(np.uint8), "RGBA")))
    return out


def beads(rgb: np.ndarray, grow: float) -> list[Image.Image]:
    """The single beads of a chain: each bead's body is a disc around its centre (its in-radius,
    x `grow` for hexagons); the thin links between beads are left out (the game draws its own)."""
    fg, alpha = cut_white(rgb)
    dist = cv2.distanceTransform(fg.astype(np.uint8), cv2.DIST_L2, 5)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg.astype(np.uint8), 8)
    found = []
    Y, X = np.ogrid[:fg.shape[0], :fg.shape[1]]
    for i in range(1, n):
        if stats[i][4] < 2000:
            continue
        comp = lab == i
        cores = (dist > dist[comp].max() * 0.45) & comp
        m, cl, _, cc = cv2.connectedComponentsWithStats(cores.astype(np.uint8), 8)
        for j in range(1, m):
            core = cl == j
            yy, xx = np.nonzero(core)
            d = dist[core]
            cy, cx = yy[d.argmax()], xx[d.argmax()]
            r = d.max() * grow + 2
            mask = ((Y - cy) ** 2 + (X - cx) ** 2 <= r * r) & comp
            found.append(((cx, cy), mask))
    found.sort(key=lambda f: (round(f[0][1] / 150), f[0][0]))
    return [trim(Image.fromarray(np.dstack([rgb, np.where(m, alpha, 0)]).astype(np.uint8), "RGBA")) for _, m in found]


def ship(im: Image.Image, name: str, height: int, folder: Path = OUT) -> None:
    """Sharpened x4, then shipped at `height` pixels high."""
    big = upscale(im)
    w = round(big.width * height / big.height)
    save(big.resize((w, height), Image.LANCZOS), folder / f"{name}.webp", quality=90, method=6)


def portrait(im: Image.Image, name: str) -> None:
    """A square portrait for the quick-reaction bubble: the top of the character."""
    side = min(im.width, im.height)
    sq = Image.new("RGBA", (side, side), (255, 255, 255, 0))
    sq.alpha_composite(im.crop(((im.width - side) // 2, 0, (im.width - side) // 2 + side, side)))
    big = upscale(sq).resize((256, 256), Image.LANCZOS)
    flat = Image.new("RGBA", big.size, (255, 255, 255, 255))
    flat.alpha_composite(big)
    save(flat.convert("RGB"), PORTRAITS / f"{name}_happy.webp", quality=90, method=6)


def from_art(name: str) -> Image.Image:
    """A generated picture: transparent already, or on white."""
    im = Image.open(ART / f"{name}.png").convert("RGBA")
    a = np.array(im)[..., 3]
    if a.min() < 250:  # it has transparency
        return trim(im)
    rgb = np.array(im.convert("RGB"))
    return pieces(rgb, min_area=20000)[0]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    bg = Image.open(IMAGES / "Stomach_Design_0.jpg").convert("RGB")
    save(upscale(bg).resize((BG_WIDTH, round(bg.height * BG_WIDTH / bg.width)), Image.LANCZOS), OUT / "background.webp", quality=86, method=6)

    protein = beads(np.array(Image.open(IMAGES / "Stomach_Element_1.jpg").convert("RGB")), grow=1.0)
    starch = beads(np.array(Image.open(IMAGES / "Stomach_Element_3.jpg").convert("RGB")), grow=1.16)
    for i, b in enumerate(protein):
        ship(b, f"protein_{i:02d}", 128)
    for i, b in enumerate(starch):
        ship(b, f"starch_{i:02d}", 128)
    fats = pieces(np.array(Image.open(IMAGES / "Stomach_Element_4.jpg").convert("RGB")))
    for i, f in enumerate(fats[:3]):
        ship(f, f"fat_{i}", 220)
    scissors = pieces(np.array(Image.open(IMAGES / "Stomach_Elements_6.jpg").convert("RGB")))
    ship(scissors[0], "scissors", 220)  # the blue pair (left)

    sheet = np.array(Image.open(IMAGES / "Stomach_Elements_5.jpg").convert("RGB"))
    for name, (x0, y0, x1, y1) in SHEET_PIECES.items():
        piece = max(pieces(sheet[y0:y1, x0:x1], min_area=1500), key=lambda p: p.width * p.height)
        if name == "flask":
            ship(piece, "flask", 220)
        else:
            portrait(piece, name)
            ship(piece, name, 300)

    for name in ("card_churn", "card_acid", "card_pepsin", "card_chyme"):
        im = from_art(name)
        save(im.resize((760, round(im.height * 760 / im.width)), Image.LANCZOS), OUT / f"ui_{name}.webp", quality=90, method=6)
    gauge = from_art("gauge").transpose(Image.FLIP_LEFT_RIGHT)  # neutral (green) on the left, very acidic (red) on the right
    save(gauge.resize((640, round(gauge.height * 640 / gauge.width)), Image.LANCZOS), OUT / "gauge.webp", quality=90, method=6)
    for name in ("germ", "chyme"):
        im = from_art(name)
        im.thumbnail((360, 360), Image.LANCZOS)
        save(im, OUT / f"{name}.webp", quality=90, method=6)

    layout = {
        "units": "pixels of the 1280x720 background",
        "size": [bg.width, bg.height],
        "cardia": {"x": CARDIA[0], "y": CARDIA[1]},
        "pylorus": {"x": PYLORUS[0], "y": PYLORUS[1]},
        "inside": [[x, y] for x, y in INSIDE],
        "protein": len(protein), "starch": len(starch), "fat": min(3, len(fats)),
    }
    (OUT / "stomach.json").write_text(json.dumps(layout, indent=1))
    print("stomach.json:", len(protein), "protein beads,", len(starch), "starch beads,", min(3, len(fats)), "fats")


if __name__ == "__main__":
    main()
