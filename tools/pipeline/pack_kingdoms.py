"""Ship the emblems of the kingdoms still to come (shown, locked, in the Discovery Book and the finale).

  art/kingdoms/emblem_<name>.png -> public/assets/kingdoms/<name>.webp  (ChatGPT image generation through the
                                    Codex CLI; prompts in content/prompts/kingdoms/)
Usage:  python tools/pipeline/pack_kingdoms.py
"""
from pathlib import Path
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from pack_stomach import ROOT, cut_white, save, trim  # noqa: E402

OUT = ROOT / "public" / "assets" / "kingdoms"
SIZE = 256


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for src in sorted((ROOT / "art" / "kingdoms").glob("emblem_*.png")):
        rgb = np.array(Image.open(src).convert("RGB"))
        _, alpha = cut_white(rgb)
        im = trim(Image.fromarray(np.dstack([rgb, alpha]), "RGBA"))
        im.thumbnail((SIZE, SIZE), Image.LANCZOS)
        save(im, OUT / f"{src.stem.replace('emblem_', '')}.webp", quality=90, method=6)


if __name__ == "__main__":
    main()
