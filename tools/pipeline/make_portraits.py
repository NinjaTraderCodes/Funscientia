"""Generated portrait images -> dialogue portraits for the game.

  art/portraits/<who>_<mood>.png  ->  public/assets/portraits/<who>_<mood>.webp

Background removed (rembg), the figure framed square from the top of the head,
saved with transparency at 384 px (sharp in the dialogue ring on 2x screens).

Usage: python make_portraits.py [--only walid_thinking,...]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parents[2]
SIZE = 384


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated names (default: all)")
    args = ap.parse_args()
    only = set(args.only.split(",")) if args.only else None
    session = new_session("isnet-general-use")
    out_dir = ROOT / "public" / "assets" / "portraits"
    out_dir.mkdir(parents=True, exist_ok=True)
    for src in sorted((ROOT / "art" / "portraits").glob("*.png")):
        if only and src.stem not in only:
            continue
        a = np.array(remove(Image.open(src).convert("RGB"), session=session))
        a[..., 3] = np.clip((a[..., 3].astype(np.float32) - 40) * 255 / 170, 0, 255).astype(np.uint8)
        ys, xs = np.where(a[..., 3] > 100)
        top, cx = ys.min(), (xs.min() + xs.max()) / 2
        side = int(min(a.shape[1], (a.shape[0] - top) * 1.0, (xs.max() - xs.min()) * 1.12))
        x0 = int(np.clip(cx - side / 2, 0, a.shape[1] - side))
        y0 = int(max(0, top - side * 0.04))
        crop = Image.fromarray(a).crop((x0, y0, x0 + side, y0 + side))
        crop.resize((SIZE, SIZE), Image.LANCZOS).save(out_dir / f"{src.stem}.webp", quality=90)
        print("portrait", src.stem)


if __name__ == "__main__":
    main()
