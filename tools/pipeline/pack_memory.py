"""Ship the Memory Game's art (Dounia's Memory_Game_* cards). Only the memory game uses these.

  docs/images/Memory_Game_02.jpg        -> public/assets/revision/card_back.webp   (the navy castle back)
  docs/images/Memory_Game_03..20.jpg    -> public/assets/revision/card_<kind>.webp (the picture cards)
  docs/images/Memory_Game_35.jpg        -> public/assets/revision/card_name.webp   (a navy name card, its baked
                                           word painted out: the game writes the name, in EN or AR)
  docs/images/Memory_Game_12.jpg        -> public/assets/revision/card_blank.webp  (a cream picture card, its
                                           glucose painted out: for pictures Dounia has no card for, e.g. fibre)
  art/revision/hall_master.png          -> public/assets/revision/hall.webp        (the "Enzyme Match" hall of
                                           Memory_Game_01 without its cards and HUD; ChatGPT image edit,
                                           prompt in content/prompts/revision/hall.txt)

Usage:  python tools/pipeline/pack_memory.py [--preview]
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from pack_stomach import cut_white, save, trim, upscale  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
IMAGES = ROOT / "docs" / "images"
OUT = ROOT / "public" / "assets" / "revision"
CARD = 400  # shipped card size (shown at about 150 CSS px, sharp at 2x)

# picture cards: kind -> Dounia's file number
PICTURES = {
    "amylase": "03", "pepsin": "04", "lipase": "05",
    "protein": "06", "polypeptide": "07", "peptide": "08", "aminoAcid": "09",
    "starch": "10", "maltose": "11", "glucose": "12",
    "fatVitamins": "13", "waterVitamins": "14", "minerals": "15", "water": "16",
    "fatPieces": "17", "fat": "18", "bile": "19", "emulsifiedFat": "20",
}


def card(path: Path) -> Image.Image:
    """The rounded card alone (its white surround made transparent), square."""
    rgb = np.array(Image.open(path).convert("RGB"))
    _, alpha = cut_white(rgb)
    im = trim(Image.fromarray(np.dstack([rgb, alpha]), "RGBA"))
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return sq.resize((CARD, CARD), Image.LANCZOS)


def blank_card(path: Path, colour: str) -> Image.Image:
    """One of Dounia's cards with its word or picture painted out: in the band the word fills, each column
    of the panel (navy or cream) is blended from the clean panel just above and just below the word, with
    a little of the panel's own grain added back."""
    rgb = np.array(Image.open(path).convert("RGB"))
    H, W = rgb.shape[:2]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(int)
    if colour == "navy":
        flat = (hsv[..., 0] >= 95) & (hsv[..., 0] <= 130) & (hsv[..., 1] > 80)
    else:  # cream (the white surround outside the card is greyer: no colour at all)
        flat = (hsv[..., 1] >= 8) & (hsv[..., 1] <= 70) & (hsv[..., 2] > 215)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(flat.astype(np.uint8), 4)
    panel = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x, y, w, h = stats[panel][:4]
    # the word's band: rows of the panel where it is not navy (plus a margin for its glow and shadow)
    # (a word fills the width; a picture sits in the middle, inside the card's thin inner lines)
    edge = 8 if colour == "navy" else 4
    inside = lab[y:y + h, x + w // edge:x + w - w // edge] == panel
    rows = np.nonzero(inside.mean(axis=1) < 0.97)[0]
    rows = rows[(rows > h * 0.08) & (rows < h * 0.92)] if colour == "navy" else rows[(rows > h * 0.2) & (rows < h * 0.8)]
    y0, y1 = y + rows.min() - int(h * 0.05), y + rows.max() + int(h * 0.05)
    # the panel's columns (inset from its rounded gold frame)
    x0, x1 = x + int(w * 0.015), x + w - int(w * 0.015)
    top = cv2.GaussianBlur(rgb[y0 - 8:y0, x0:x1].astype(np.float32), (0, 0), 3).mean(axis=0)
    bot = cv2.GaussianBlur(rgb[y1:y1 + 8, x0:x1].astype(np.float32), (0, 0), 3).mean(axis=0)
    t = np.linspace(0, 1, y1 - y0)[:, None, None]
    fill = top[None] * (1 - t) + bot[None] * t
    grain = rgb[y0 - (y1 - y0) - 10:y0 - 10, x0:x1].astype(np.float32)
    if grain.shape[0] == fill.shape[0] and y0 - (y1 - y0) - 10 > y + h * 0.06:  # (only from inside the panel)
        fill += grain - cv2.GaussianBlur(grain, (0, 0), 6)
    out = rgb.astype(np.float32).copy()
    region = out[y0:y1, x0:x1]
    keep = (lab[y0:y1, x0:x1] != panel) & ~((hsv[y0:y1, x0:x1, 0] >= 8) & (hsv[y0:y1, x0:x1, 0] <= 40)
                                            | (hsv[y0:y1, x0:x1, 2] < 60))  # the frame at the very edges stays
    edge = np.zeros_like(keep)
    edge[:, :int(w * 0.01)] = True
    edge[:, -int(w * 0.01):] = True
    soft = np.ones((y1 - y0, x1 - x0), np.float32)
    soft[keep & edge] = 0
    ramp = np.minimum(np.arange(y1 - y0), np.arange(y1 - y0)[::-1])[:, None] / 6.0
    soft = np.minimum(soft, np.clip(ramp, 0, 1))[..., None]
    out[y0:y1, x0:x1] = region * (1 - soft) + fill * soft
    out = np.clip(out, 0, 255).astype(np.uint8)
    tmp = ROOT / ".tools" / "work" / f"memory_blank_{colour}.png"
    Image.fromarray(out).save(tmp)
    return card(tmp)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    save(card(IMAGES / "Memory_Game_02.jpg"), OUT / "card_back.webp", quality=90, method=6)
    for kind, n in PICTURES.items():
        save(card(IMAGES / f"Memory_Game_{n}.jpg"), OUT / f"card_{kind}.webp", quality=90, method=6)
    save(blank_card(IMAGES / "Memory_Game_35.jpg", "navy"), OUT / "card_name.webp", quality=92, method=6)
    save(blank_card(IMAGES / "Memory_Game_12.jpg", "cream"), OUT / "card_blank.webp", quality=92, method=6)
    hall = ROOT / "art" / "revision" / "hall_master.png"
    if hall.exists():
        im = Image.open(hall).convert("RGB")
        big = upscale(im)
        save(big.resize((2560, round(2560 * im.height / im.width)), Image.LANCZOS), OUT / "hall.webp", quality=86, method=6)
    else:
        print("no", hall.relative_to(ROOT), "yet")


if __name__ == "__main__":
    main()
