"""Split a clean plate into a far (background) and a near (foreground) layer.

The intro's camera dollies towards the characters, so near things (the ledge
they stand on, bushes, overhanging leaves) move and grow faster than the far
kingdom. To reproduce that in-game, near pixels go to their own layer and the
far layer is inpainted where the near layer used to cover it.

Depth comes from Depth Anything V2 Small (ONNX, CPU); inpainting from LaMa.

Usage:
  python split_layers.py --plate plate.png --depth-model depth.onnx --lama lama.onnx --out-dir layers/
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

from make_plate import WATERMARKS, lama_fill

NEAR_THRESHOLD = 0.55  # normalized inverse depth; 1 = closest
FEATHER_PX = 2


def match_exposure_local(src: np.ndarray, ref: np.ndarray, paste: np.ndarray, usable: np.ndarray) -> np.ndarray:
    """Shift each pasted patch by the median colour difference measured in a thin
    ring just outside it (where both shots show the same, well-aligned scenery).
    Local and robust: parallax elsewhere in the frame cannot skew it."""
    out = src.astype(np.float32)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(paste.astype(np.uint8), 8)
    for k in range(1, n):
        comp = (labels == k).astype(np.uint8)
        ring = cv2.dilate(comp, np.ones((17, 17), np.uint8)) & (1 - cv2.dilate(comp, np.ones((3, 3), np.uint8)))
        ring = ring.astype(bool) & usable
        if ring.sum() < 300:
            continue
        diff = np.median(ref[ring].astype(np.float32) - src[ring].astype(np.float32), axis=0)
        if np.abs(diff).max() > 15:  # large shifts mean misaligned content, not exposure
            continue
        sel = comp.astype(bool)
        out[sel] += diff
        print(f"  patch {k}: {int(stats[k, 4])} px, colour shift {np.round(diff, 1).tolist()}")
    return np.clip(out, 0, 255).astype(np.uint8)


def estimate_depth(model: Path, rgb: np.ndarray) -> np.ndarray:
    session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
    h, w = rgb.shape[:2]
    # input sides must be multiples of 14 (ViT patch size)
    tw, th = 14 * round(w * 1.22 / 14), 14 * round(h * 1.22 / 14)
    x = cv2.resize(rgb.astype(np.float32) / 255.0, (tw, th), interpolation=cv2.INTER_CUBIC)
    x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    d = session.run(None, {"pixel_values": x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
    d = cv2.resize(d, (w, h), interpolation=cv2.INTER_CUBIC)
    return (d - d.min()) / (d.max() - d.min() + 1e-6)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plate", required=True, type=Path)
    ap.add_argument("--depth-model", required=True, type=Path)
    ap.add_argument("--lama", required=True, type=Path)
    ap.add_argument("--out-dir", required=True, type=Path)
    ap.add_argument("--end-frame", type=Path, help="video's last frame (closer shot)")
    ap.add_argument("--end-affine", help="a,b,c,d,e,f: last-frame px -> plate px")
    ap.add_argument("--charmask", type=Path, help="character mask of the plate frame")
    ap.add_argument("--pivot", default="420.5,321.5")
    ap.add_argument("--dolly", type=float, default=1.717)
    ap.add_argument("--top-leaf-rows", type=int, default=14)
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    rgb = np.array(Image.open(args.plate).convert("RGB"))
    depth = estimate_depth(args.depth_model, rgb)
    Image.fromarray((depth * 255).astype(np.uint8)).save(args.out_dir / "depth.png")

    near = (depth > NEAR_THRESHOLD).astype(np.uint8)
    near = cv2.morphologyEx(near, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    # drop small islands; keep the ledge, bushes and leaves
    n, labels, stats, _ = cv2.connectedComponentsWithStats(near, 8)
    keep = np.zeros_like(near)
    for k in range(1, n):
        if stats[k, cv2.CC_STAT_AREA] > 150:
            keep[labels == k] = 1
    near = keep
    if args.top_leaf_rows:
        # tiny overhanging leaf tips at the top edge are too thin for the depth
        # model; up there everything else is sky, so warm-coloured pixels are leaves
        band = rgb[: args.top_leaf_rows].astype(int)
        leafy = (band[:, :, 0] - band[:, :, 2]) > 25
        near[: args.top_leaf_rows] |= cv2.dilate(leafy.astype(np.uint8), np.ones((5, 5), np.uint8))

    alpha = cv2.GaussianBlur(near.astype(np.float32), (0, 0), FEATHER_PX)
    near_rgba = np.dstack([rgb, (np.clip(alpha, 0, 1) * 255).astype(np.uint8)])
    Image.fromarray(near_rgba).save(args.out_dir / "near.png")

    # generous margin: soft leaf edges blur several pixels into the sky
    hole = cv2.dilate(near, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    far = rgb.copy()
    h, w = hole.shape

    if args.end_frame:
        # The video's last frame was shot closer, past the ledge: it shows the real
        # far scenery behind it. Warp it into plate coordinates and use those pixels.
        m = np.array([float(v) for v in args.end_affine.split(",")]).reshape(2, 3)
        last = np.array(Image.open(args.end_frame).convert("RGB"))
        lh, lw = last.shape[:2]
        warped = cv2.warpAffine(last, m, (w, h), flags=cv2.INTER_CUBIC)
        valid = np.zeros((lh, lw), np.uint8)
        valid[2:-2, 2:-2] = 1
        for x0, y0, x1, y1 in WATERMARKS:  # burned-in logos are not scenery
            valid[y0:y1, x0:x1] = 0
        # in the last frame the trio stands in front of the scenery: mask them out
        px, py = (float(v) for v in args.pivot.split(","))
        k = args.dolly
        to_end = np.array([[k, 0, px * (1 - k)], [0, k, py * (1 - k)]])
        chars_end = cv2.warpAffine(np.array(Image.open(args.charmask).convert("L")), to_end, (w, h))
        chars_end = cv2.dilate((chars_end > 20).astype(np.uint8), np.ones((15, 15), np.uint8))
        valid_w = cv2.warpAffine(valid, m, (w, h), flags=cv2.INTER_NEAREST)
        valid_w = cv2.erode(valid_w, np.ones((5, 5), np.uint8))
        paste = (hole > 0) & (valid_w > 0) & (chars_end == 0)
        # The two shots differ slightly in exposure; fit a per-channel gain/bias on
        # scenery both frames show, so pasted pixels match and leave no seams.
        usable = (valid_w > 0) & (hole == 0) & (chars_end == 0)
        warped = match_exposure_local(warped, far, paste, usable)

    # 1) inpaint the whole hole first, so no near-layer pixels (leaves) remain
    session = ort.InferenceSession(str(args.lama), providers=["CPUExecutionProvider"])
    todo = hole.copy()
    for cx in range(256, w + 256, 168):
        cx = min(cx, w - 256)
        x0 = cx - 256
        win_hole = np.zeros_like(todo)
        win_hole[:, x0:x0 + 512] = todo[:, x0:x0 + 512]
        if win_hole.any():
            far = lama_fill(session, far, win_hole, cx)
            todo[:, x0:x0 + 512] = 0
        if cx == w - 256:
            break

    # 2) then lay the real pixels from the last frame on top, feathered into the fill
    if args.end_frame:
        inner = cv2.erode(paste.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        soft = np.minimum(cv2.GaussianBlur(inner.astype(np.float32), (0, 0), 2.0), paste.astype(np.float32))[..., None]
        far = (warped * soft + far * (1 - soft)).astype(np.uint8)
        print("pixels taken from the last video frame:", int(paste.sum()))
    Image.fromarray(far).save(args.out_dir / "far.png")
    print("layers written to", args.out_dir)


if __name__ == "__main__":
    main()
