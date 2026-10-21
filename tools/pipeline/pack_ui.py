"""Ship the interface art from docs/images (logo, logo symbol, avatar portraits).

  funscientia_logo.png          -> public/assets/hero/logo.webp        (hero page, loading screen)
  funscientia_logo_symbole.png  -> public/favicon-32.png, public/icon-180.png, public/icon-192.png
  avatar_{boy,girl,fox}.png     -> public/assets/avatars/{boy,girl,fox}.webp  (Choose Your Avatar)

Usage:  python tools/pipeline/pack_ui.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "docs" / "images"
PUBLIC = ROOT / "public"


def fit(im: Image.Image, width: int) -> Image.Image:
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS) if im.width > width else im


def trim(im: Image.Image) -> Image.Image:
    """Crop away fully transparent margins."""
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    return im.crop(box) if box else im


def save(im: Image.Image, path: Path, **kw) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, **kw)
    print(f"{path.relative_to(ROOT)}: {im.width}x{im.height}, {path.stat().st_size / 1e3:.0f} KB")


def main() -> None:
    logo = trim(Image.open(SRC / "funscientia_logo.png").convert("RGBA"))
    save(fit(logo, 1400), PUBLIC / "assets" / "hero" / "logo.webp", quality=90, method=6)

    symbol = trim(Image.open(SRC / "funscientia_logo_symbole.png").convert("RGBA"))
    side = max(symbol.size)
    square = Image.new("RGBA", (side, side))
    square.paste(symbol, ((side - symbol.width) // 2, (side - symbol.height) // 2))
    for size, name in ((32, "favicon-32.png"), (180, "icon-180.png"), (192, "icon-192.png")):
        save(square.resize((size, size), Image.LANCZOS), PUBLIC / name, optimize=True)

    for who in ("boy", "girl", "fox"):
        im = Image.open(SRC / f"avatar_{who}.png").convert("RGB")
        save(fit(im, 512), PUBLIC / "assets" / "avatars" / f"{who}.webp", quality=86, method=6)


if __name__ == "__main__":
    main()
