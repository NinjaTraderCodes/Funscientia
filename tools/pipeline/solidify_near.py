"""Re-make an existing place's near layer as whole foreground objects (see
place_layers.main_road and solid) and re-inpaint the mid layer under them,
keeping the far layer and the mid layer's outline as they are.

Usage:
  python solidify_near.py --dir art/world/road --lama .tools/lama_fp32.onnx \
      --esrgan .tools/realesrgan/realesrgan-ncnn-vulkan.exe       --depth-model .tools/depth_anything_v2_small.onnx [--near 0.62]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from place_layers import inpaint, keep_big, main_road, solid, upscale
from split_layers import estimate_depth


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, type=Path)
    ap.add_argument("--lama", required=True, type=Path)
    ap.add_argument("--esrgan", required=True, type=Path)
    ap.add_argument("--depth-model", required=True, type=Path)
    ap.add_argument("--near", type=float, default=0.62)
    args = ap.parse_args()
    stem = args.dir.name
    rgb = np.array(Image.open(args.dir / f"{stem}_master.png").convert("RGB"))
    old_near = np.array(Image.open(args.dir / f"{stem}_near.png"))[..., 3] > 128
    mid_a = np.array(Image.open(args.dir / f"{stem}_mid.png"))[..., 3]
    road = cv2.dilate(main_road(rgb), np.ones((25, 25), np.uint8))
    depth = estimate_depth(args.depth_model, rgb)
    near = keep_big(((depth > args.near) & (road == 0)).astype(np.uint8), 4000)
    near = solid(cv2.morphologyEx(near, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)), road)

    feather = lambda m, r: np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), r), 0, 1)
    mid_rgb = inpaint(rgb, cv2.dilate(near, np.ones((15, 15), np.uint8)), args.lama)
    layers = {
        "mid": np.dstack([mid_rgb, mid_a]),
        "near": np.dstack([rgb, (feather(near, 1.5) * 255).astype(np.uint8)]),
    }
    for name, img in layers.items():
        src = args.dir / f"{stem}_{name}.png"
        Image.fromarray(img).save(src)
        upscale(args.esrgan, src.resolve(), (args.dir / f"{stem}_{name}_x4.png").resolve())
    print(f"{stem}: near {old_near.mean() * 100:.1f}% -> {near.mean() * 100:.1f}% of the picture")


if __name__ == "__main__":
    main()
