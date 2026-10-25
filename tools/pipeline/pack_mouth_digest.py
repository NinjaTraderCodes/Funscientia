"""Ship the art of the Mouth's round 4 (digest the starch, after Dounia's MouthGame_AddedStep_* sheets).

  docs/images/MouthGame_AddedStep_02.jpg -> public/assets/mouth/amylase_scissors.webp (her purple scissors)
  art/mouth/card_digest.png              -> public/assets/mouth/ui_card_digest.webp (step card 4, made with
                                            ChatGPT image generation in the cards' style;
                                            prompt in content/prompts/mouth/card_digest.txt)
The starch units are the Stomach's (public/assets/stomach/starch_NN.webp, from her starch chain).

Usage:  python tools/pipeline/pack_mouth_digest.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from pack_stomach import ROOT, pieces, save, ship

IMAGES = ROOT / "docs" / "images"
OUT = ROOT / "public" / "assets" / "mouth"


def main() -> None:
    sheet = np.array(Image.open(IMAGES / "MouthGame_AddedStep_02.jpg").convert("RGB"))
    scissors = max(pieces(sheet), key=lambda p: p.width * p.height)  # the scissors, on their own sheet
    ship(scissors, "amylase_scissors", 220, OUT, holes=True)

    card = pieces(np.array(Image.open(ROOT / "art" / "mouth" / "card_digest.png").convert("RGB")), min_area=20000)[0]
    save(card.resize((760, round(card.height * 760 / card.width)), Image.LANCZOS), OUT / "ui_card_digest.webp", quality=90, method=6)


if __name__ == "__main__":
    main()
