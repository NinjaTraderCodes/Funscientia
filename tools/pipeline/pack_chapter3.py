"""Ship Chapter 3's chapter cards (resize/encode only).

  art/revision/hall_master.png                       -> chapters/revision.webp (the Memory Game hall)
  art/world/intestine-road/intestine-road_master.png -> chapters/small-intestine-road.webp (the road itself)
  art/chapter3/mission-card.png                      -> chapters/small-intestine-mission.webp
                                                        (Dounia's Chapter3 card, its words painted out)

The Small Intestine mini-game's art is shipped by pack_intestine.py, the Memory Game's by pack_memory.py
(only the Memory Game uses Dounia's Memory_Game_* pictures).
Run: python tools/pipeline/pack_chapter3.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'public' / 'assets'


def ship(source: Path, target: str, width: int) -> None:
    image = Image.open(source).convert('RGB')
    image.thumbnail((width, width), Image.Resampling.LANCZOS)
    out = PUBLIC / target
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out, quality=86, method=6)
    print(f'{target}: {image.width}x{image.height}, {out.stat().st_size // 1024} KB')


ship(ROOT / 'art' / 'revision' / 'hall_master.png', 'chapters/revision.webp', 1920)
ship(ROOT / 'art' / 'world' / 'intestine-road' / 'intestine-road_master.png', 'chapters/small-intestine-road.webp', 1920)
ship(ROOT / 'art' / 'chapter3' / 'mission-card.png', 'chapters/small-intestine-mission.webp', 1920)
