"""Split a place background into parallax layers: far / mid / near.

  far  = the whole picture (distant kingdom and sky show through mid's holes)
  mid  = everything but the distance (path, gardens) - the ground characters walk on
  near = foreground objects (big bushes, overhanging leaves) drawn IN FRONT of
         characters; mid is inpainted (LaMa) underneath them so nothing doubles
         when the layers shift

Depth comes from Depth Anything V2 (ONNX, CPU). The walkable path is never put
into the near layer (it would cover the characters' feet).

Usage:
  python place_layers.py --image art/world/road/road_master.png --out art/world/road \
      --depth-model .tools/depth_anything_v2_small.onnx --lama .tools/lama_fp32.onnx \
      --esrgan .tools/realesrgan/realesrgan-ncnn-vulkan.exe [--far 0.22 --near 0.62]
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from make_plate import lama_fill  # noqa: E402
from split_layers import estimate_depth  # noqa: E402


def path_mask(rgb: np.ndarray) -> np.ndarray:
    """Pink-cream cobblestones (the walkable road) by colour."""
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(int)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    m = (((h <= 16) | (h >= 170)) & (s >= 40) & (s <= 175) & (v >= 200)).astype(np.uint8)
    return cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))


def main_road(rgb: np.ndarray) -> np.ndarray:
    """The walkable road only: the largest path-coloured region (pink flowers elsewhere are not road)."""
    pm = path_mask(rgb)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(pm, 8)
    if n <= 1:
        return pm
    road = (labels == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    return cv2.morphologyEx(road, cv2.MORPH_CLOSE, np.ones((41, 41), np.uint8))


def keep_big(mask: np.ndarray, min_area: int) -> np.ndarray:
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    out = np.zeros_like(mask, np.uint8)
    for k in range(1, n):
        if stats[k, cv2.CC_STAT_AREA] >= min_area:
            out[labels == k] = 1
    return out


def solid(near: np.ndarray, road: np.ndarray) -> np.ndarray:
    """Whole foreground objects: close the gaps between depth fragments and fill their holes.

    A near layer full of holes slides over the mid layer's copy of the same bush,
    which reads as a picture inside a picture; solid objects slide as one piece.
    """
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))
    closed = cv2.morphologyEx(near.astype(np.uint8), cv2.MORPH_CLOSE, k)
    h, w = closed.shape
    flood = np.pad(closed, 1).copy()
    cv2.floodFill(flood, np.zeros((h + 4, w + 4), np.uint8), (0, 0), 2)
    filled = (flood[1:-1, 1:-1] != 2).astype(np.uint8)
    # the gaps may not bridge onto the walkable road (it would cover the characters' feet)
    return keep_big(((filled & (road == 0)) | near).astype(np.uint8), 4000)


def inpaint(rgb: np.ndarray, hole: np.ndarray, lama: Path) -> np.ndarray:
    session = ort.InferenceSession(str(lama), providers=["CPUExecutionProvider"])
    out = rgb.copy()
    h, w = hole.shape
    todo = hole.copy()
    for cx in list(range(256, w - 256, 200)) + [w - 256]:
        x0 = cx - 256
        win = np.zeros_like(todo)
        win[:, x0:x0 + 512] = todo[:, x0:x0 + 512]
        if win.any():
            out = lama_fill(session, out, win, cx)
            todo[:, x0:x0 + 512] = 0
    return out


def upscale(esrgan: Path, src: Path, dst: Path, tries: int = 3) -> None:
    """x4 upscale, verified: the upscaler sometimes drops whole tiles (they come back
    transparent), so every pixel opaque in the source must still be opaque."""
    want = np.array(Image.open(src).convert("RGBA"))[..., 3] > 200
    for attempt in range(1, tries + 1):
        subprocess.run([str(esrgan), "-i", str(src), "-o", str(dst), "-n", "realesrgan-x4plus"], check=True, capture_output=True)
        got = np.array(Image.open(dst).convert("RGBA"))[..., 3]
        lost = want & (cv2.resize(got, (want.shape[1], want.shape[0]), interpolation=cv2.INTER_AREA) < 20)
        if lost.sum() < 50:
            return
        print(f"  upscale of {src.name} lost {int(lost.sum())} px (try {attempt}), retrying")
    raise SystemExit(f"upscale keeps losing pixels: {dst}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--depth-model", required=True, type=Path)
    ap.add_argument("--lama", required=True, type=Path)
    ap.add_argument("--esrgan", required=True, type=Path)
    ap.add_argument("--far", type=float, default=0.22, help="depth below this = far")
    ap.add_argument("--near", type=float, default=0.62, help="depth above this (and not path) = near")
    ap.add_argument("--walkway", help="x,y;x,y;... outline of the walkable path, when it cannot be found by colour "
                    "(e.g. a pink path between pink walls); nothing on it goes into the near layer")
    ap.add_argument("--keep-mid", action="append", default=[], help="x0,y0,x1,y1 box forced into the mid layer "
                    "(e.g. a far-away destination the path leads into, which must not slide off the path)")
    args = ap.parse_args()

    rgb = np.array(Image.open(args.image).convert("RGB"))
    H, W = rgb.shape[:2]
    depth = estimate_depth(args.depth_model, rgb)
    if args.walkway:
        pts = np.array([[float(v) for v in p.split(",")] for p in args.walkway.split(";")], np.int32)
        walk = np.zeros((H, W), np.uint8)
        cv2.fillPoly(walk, [pts], 1)
        road = cv2.dilate(walk, np.ones((25, 25), np.uint8))
    else:
        road = cv2.dilate(main_road(rgb), np.ones((25, 25), np.uint8))

    far = (depth < args.far).astype(np.uint8)
    for box in args.keep_mid:
        x0, y0, x1, y1 = (int(v) for v in box.split(","))
        far[y0:y1, x0:x1] = 0
    far = keep_big(far, 2000)
    near = keep_big(((depth > args.near) & (road == 0)).astype(np.uint8), 4000)
    near = cv2.morphologyEx(near, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    near = solid(near, road)
    mid = (1 - far).astype(np.uint8)

    feather = lambda m, r: np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), r), 0, 1)
    stem = args.image.stem.replace("_master", "")
    args.out.mkdir(parents=True, exist_ok=True)

    # mid: inpaint under the near objects, transparent where the distance shows
    mid_rgb = inpaint(rgb, cv2.dilate(near, np.ones((15, 15), np.uint8)), args.lama)
    mid_a = (feather(cv2.dilate(mid, np.ones((5, 5), np.uint8)), 2.5) * 255).astype(np.uint8)
    near_a = (feather(near, 1.5) * 255).astype(np.uint8)
    layers = {
        "far": np.dstack([rgb, np.full((H, W), 255, np.uint8)]),
        "mid": np.dstack([mid_rgb, mid_a]),
        "near": np.dstack([rgb, near_a]),
    }
    for name, img in layers.items():
        src = args.out / f"{stem}_{name}.png"
        Image.fromarray(img).save(src)
        upscale(args.esrgan, src.resolve(), (args.out / f"{stem}_{name}_x4.png").resolve())
        print(f"{name}: {int((img[..., 3] > 128).mean() * 100)}% opaque")

    preview = Image.fromarray(rgb).convert("RGBA")
    tint = np.zeros((H, W, 4), np.uint8)
    tint[far > 0] = (60, 90, 255, 110)
    tint[near > 0] = (255, 60, 60, 140)
    preview.alpha_composite(Image.fromarray(tint))
    preview.convert("RGB").resize((W // 2, H // 2)).save(args.out / f"{stem}_layers_preview.jpg", quality=85)


if __name__ == "__main__":
    main()
