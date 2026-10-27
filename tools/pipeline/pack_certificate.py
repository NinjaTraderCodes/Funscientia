"""Ship the certificate's picture and the Discovery Book's button.

  art/certificate/plate_master.png -> public/assets/certificate/plate.webp (x4 upscaled, 2048 wide): Dounia's
      certificate (docs/images/Certificate_From_Dounia.jpg) with its words, stars and medal mascot painted out by a
      ChatGPT image edit (prompt in content/prompts/certificate/plate.txt); the game writes the rest (EN/AR).
  art/ui/book_icon.png             -> public/assets/ui/book.webp (the 📖 button; prompt book_icon.txt)

Usage:  python tools/pipeline/pack_certificate.py
"""
from pathlib import Path
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from pack_stomach import ROOT, cut_white, save, trim, upscale  # noqa: E402

PUBLIC = ROOT / "public" / "assets"


def main() -> None:
    (PUBLIC / "certificate").mkdir(parents=True, exist_ok=True)
    (PUBLIC / "ui").mkdir(parents=True, exist_ok=True)
    plate = Image.open(ROOT / "art" / "certificate" / "plate_master.png").convert("RGB")
    big = upscale(plate)
    save(big.resize((2048, round(2048 * plate.height / plate.width)), Image.LANCZOS), PUBLIC / "certificate" / "plate.webp", quality=88, method=6)
    rgb = np.array(Image.open(ROOT / "art" / "ui" / "book_icon.png").convert("RGB"))
    _, alpha = cut_white(rgb)
    icon = trim(Image.fromarray(np.dstack([rgb, alpha]), "RGBA"))
    icon.thumbnail((160, 160), Image.LANCZOS)
    save(icon, PUBLIC / "ui" / "book.webp", quality=90, method=6)


if __name__ == "__main__":
    main()
