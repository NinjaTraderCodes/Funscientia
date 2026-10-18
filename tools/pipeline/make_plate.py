"""Build a clean background plate from a video frame.

Removes the characters (found with rembg) and the burned-in watermarks using
the LaMa inpainting model (ONNX, runs on CPU), then writes the clean plate plus
the character mask used, so the game can place sprites exactly where the
characters stood.

Usage:
  python make_plate.py --frame overlook.png --lama lama_fp32.onnx --out plate.png
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image
from rembg import new_session, remove

# Watermark boxes in 848x464 source pixels (x0, y0, x1, y1) for docs/videos/001.MOV.
WATERMARKS = [(0, 356, 90, 464), (712, 374, 848, 460)]
LAMA_SIZE = 512


def lama_fill(session: ort.InferenceSession, img: np.ndarray, mask: np.ndarray, cx: int) -> np.ndarray:
    """Inpaint a 512x512 window centred horizontally on cx (bottom-aligned)."""
    h, w = mask.shape
    pad = max(0, LAMA_SIZE - h)
    img_p = cv2.copyMakeBorder(img, pad, 0, 0, 0, cv2.BORDER_REFLECT)
    mask_p = cv2.copyMakeBorder(mask, pad, 0, 0, 0, cv2.BORDER_CONSTANT, value=0)
    x0 = int(np.clip(cx - LAMA_SIZE // 2, 0, w - LAMA_SIZE))
    win = img_p[-LAMA_SIZE:, x0:x0 + LAMA_SIZE]
    m = mask_p[-LAMA_SIZE:, x0:x0 + LAMA_SIZE]
    inp_img = win.astype(np.float32).transpose(2, 0, 1)[None] / 255.0
    inp_mask = (m > 0).astype(np.float32)[None, None]
    names = [i.name for i in session.get_inputs()]
    out = session.run(None, {names[0]: inp_img, names[1]: inp_mask})[0][0]
    out = out.transpose(1, 2, 0)
    if out.max() <= 1.5:
        out = out * 255.0
    out = np.clip(out, 0, 255).astype(np.uint8)
    # only replace masked pixels; keep the rest of the window untouched
    filled = np.where(m[..., None] > 0, out, win)
    result = img_p.copy()
    result[-LAMA_SIZE:, x0:x0 + LAMA_SIZE] = filled
    return result[pad:]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frame", required=True, type=Path)
    ap.add_argument("--lama", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--dilate", type=int, default=7)
    args = ap.parse_args()

    rgb = np.array(Image.open(args.frame).convert("RGB"))
    cut = np.array(remove(Image.fromarray(rgb), session=new_session("isnet-general-use")))
    chars = (cut[:, :, 3] > 40).astype(np.uint8)
    # ignore stray detections far from the trio (petals, flying books)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(chars, 8)
    keep = np.zeros_like(chars)
    for k in range(1, n):
        x, y, w, h, area = stats[k]
        if area > 400 and y + h > rgb.shape[0] * 0.6:
            keep[labels == k] = 1
    chars = keep
    Image.fromarray(chars * 255).save(args.out.with_name(args.out.stem + "_charmask.png"))

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (args.dilate * 2 + 1,) * 2)
    hole = cv2.dilate(chars, kernel)
    for x0, y0, x1, y1 in WATERMARKS:
        hole[y0:y1, x0:x1] = 1

    session = ort.InferenceSession(str(args.lama), providers=["CPUExecutionProvider"])
    img = rgb.copy()
    # one window per hole cluster, left to right
    n, labels, stats, cents = cv2.connectedComponentsWithStats(hole, 8)
    for k in sorted(range(1, n), key=lambda k: stats[k, 0]):
        cx = int(stats[k, 0] + stats[k, 2] / 2)
        img = lama_fill(session, img, (labels == k).astype(np.uint8), cx)
    Image.fromarray(img).save(args.out)
    print("plate written:", args.out)


if __name__ == "__main__":
    main()
