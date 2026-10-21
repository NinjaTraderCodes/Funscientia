"""Cut an idle animation (e.g. the fennec sniffing or sitting) out of a Wan clip.

Unlike walk cycles, idles change the body's shape (sitting makes it shorter),
so every frame keeps ONE crop and ONE scale - the camera in the clip is still -
and the first frame (the standing pose) sets the size. Background removed with
rembg, colours taken from the original frame, upscaled x4 like the walk frames.

Writes <out>/idle_XX.png and <out>/timing.json:
  {"fps": 16, "segments": {...}, "anchor": [x, y], "standBody": px}
  segments name ranges of the saved frames, e.g. once=[0, 49] (play once), or
  in=[0, 33] (sit down) + loop=[33, 53] (stay sitting); played backwards, "in" stands up.

Usage:
  python tools/pipeline/extract_idle.py --clip docs/walk-clips/fox_idle_sit_wan.mp4 \
      --out art/characters/fox/idle_sit --last 3.31 --segments in=0:2.06,loop=2.06:3.31
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import new_session, remove

sys.path.insert(0, str(Path(__file__).parent))
from place_layers import upscale  # noqa: E402  (verified x4: retries when tiles come back empty)

ESRGAN = Path(__file__).resolve().parents[2] / ".tools" / "realesrgan" / "realesrgan-ncnn-vulkan.exe"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--last", type=float, required=True, help="last second of the clip to keep")
    ap.add_argument("--segments", required=True, help="name=from:to,... in seconds")
    ap.add_argument("--fps", type=int, default=16)
    args = ap.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(args.clip), "-t", f"{args.last + 0.5 / args.fps:.3f}",
                        "-vf", f"fps={args.fps}", str(tmp / "f_%03d.png")], check=True)
        files = sorted(tmp.glob("f_*.png"))
        session = new_session("isnet-general-use")
        cut = []
        for f in files:
            rgb = Image.open(f).convert("RGB")
            alpha = np.array(remove(rgb, session=session))[..., 3]
            cut.append(np.dstack([np.array(rgb), alpha]))
        print(f"{len(cut)} frames cut out")

        # one crop for all frames: everywhere the fox goes in this clip, plus a margin
        solid = np.stack([c[..., 3] > 100 for c in cut]).any(0)
        ys, xs = np.where(solid)
        m = 12
        x0, y0 = max(0, xs.min() - m), max(0, ys.min() - m)
        x1, y1 = min(solid.shape[1], xs.max() + 1 + m), min(solid.shape[0], ys.max() + 1 + m)
        args.out.mkdir(parents=True, exist_ok=True)
        for old in args.out.glob("idle_*.png"):
            old.unlink()
        for k, c in enumerate(cut):
            src = tmp / f"c_{k:03d}.png"
            Image.fromarray(c[y0:y1, x0:x1], "RGBA").save(src)
            upscale(ESRGAN, src.resolve(), (args.out / f"idle_{k:02d}.png").resolve())

    # the standing first frame: its size and where it stands, in the saved (x4) frames
    a0 = np.array(Image.open(args.out / "idle_00.png"))[..., 3] > 100
    fy, fx = np.where(a0)
    stand_body = int(fy.max() - fy.min() + 1)
    anchor = [float((fx.min() + fx.max()) / 2), float(fy.max() + 1)]
    segments = {}
    for item in args.segments.split(","):
        name, span = item.split("=")
        a, b = (float(v) for v in span.split(":"))
        segments[name] = [int(round(a * args.fps)), min(len(cut) - 1, int(round(b * args.fps)))]
    timing = {"fps": args.fps, "segments": segments, "anchor": anchor, "standBody": stand_body,
              "source": args.clip.name}
    (args.out / "timing.json").write_text(json.dumps(timing, indent=1))
    print(f"saved {len(cut)} frames to {args.out}, segments {segments}, standing body {stand_body}px")


if __name__ == "__main__":
    main()
