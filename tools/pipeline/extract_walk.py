"""Extract per-character walk-cycle frames from background-removed video frames.

Input : a folder of RGBA PNGs (output of rembg) showing the trio walking away
        from the camera (back view), plus the matching RGB source frames.
Output: for each character, a folder of normalized RGBA frames (same height,
        feet anchored at the bottom centre) covering one seamless walk loop,
        and a JSON file describing the loop.

The trio stands left-to-right as: girl | fox | boy. Masks that touch are split
at the emptiest column inside a search window between neighbours.

Usage:
  python extract_walk.py --seg SEG_DIR --first 37 --last 84 --out OUT_DIR
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

# Column windows (in source-video pixels, 848x464) where the gaps between
# neighbouring characters are searched. Tuned for docs/videos/001.MOV 68.0s+.
GIRL_FOX_WINDOW = (355, 390)
FOX_BOY_WINDOW = (418, 442)
FOX_MIN_Y = 320  # the fox is short; anything above this is a child's arm
CHARACTERS = ("girl", "fox", "boy")


def clean_mask(mask: np.ndarray) -> np.ndarray:
    """Keep the main body and any sizeable attached pieces (hair, ears)."""
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n <= 1:
        return mask
    areas = stats[1:, cv2.CC_STAT_AREA]
    biggest = areas.max()
    keep = np.zeros_like(mask)
    for k, area in enumerate(areas, start=1):
        if area >= 0.03 * biggest:
            keep |= labels == k
    return keep


def split_frame(alpha: np.ndarray) -> dict[str, np.ndarray]:
    solid = alpha > 128
    cols = solid.sum(0)
    c1 = GIRL_FOX_WINDOW[0] + int(np.argmin(cols[GIRL_FOX_WINDOW[0]:GIRL_FOX_WINDOW[1]]))
    c2 = FOX_BOY_WINDOW[0] + int(np.argmin(cols[FOX_BOY_WINDOW[0]:FOX_BOY_WINDOW[1]]))
    h, w = solid.shape
    xs = np.arange(w)[None, :]
    ys = np.arange(h)[:, None]
    regions = {
        "girl": xs < c1,
        "fox": (xs >= c1) & (xs < c2) & (ys >= FOX_MIN_Y),
        "boy": xs >= c2,
    }
    return {name: clean_mask(solid & region) for name, region in regions.items()}


def split_by_columns(alpha: np.ndarray, order: list[str], windows: list[tuple[int, int]],
                     min_y: dict[str, int]) -> dict[str, np.ndarray]:
    """Split left-to-right at the emptiest column inside each window between neighbours."""
    solid = alpha > 128
    cols = solid.sum(0)
    cuts = [0] + [a + int(np.argmin(cols[a:b])) for a, b in windows] + [solid.shape[1]]
    ys = np.arange(solid.shape[0])[:, None]
    xs = np.arange(solid.shape[1])[None, :]
    out = {}
    for name, x0, x1 in zip(order, cuts[:-1], cuts[1:]):
        region = (xs >= x0) & (xs < x1) & (ys >= min_y.get(name, 0))
        out[name] = clean_mask(solid & region)
    return out


def eye_holes(mask: np.ndarray) -> np.ndarray:
    """Small holes fully enclosed in the head (top 40%): cut-out eye-whites and highlights."""
    ys, xs = np.where(mask)
    if not len(ys):
        return np.zeros_like(mask, np.uint8)
    top, h, area = ys.min(), ys.max() - ys.min(), mask.sum()
    n, labels, stats, _ = cv2.connectedComponentsWithStats((~mask).astype(np.uint8), 4)
    edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])))
    out = np.zeros_like(mask, np.uint8)
    for k in range(1, n):
        if k not in edge and stats[k, cv2.CC_STAT_TOP] < top + 0.4 * h and stats[k, cv2.CC_STAT_AREA] < 0.004 * area:
            out[labels == k] = 1
    return cv2.dilate(out, np.ones((3, 3), np.uint8))


def bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def find_loop(signatures: list[np.ndarray], min_p: int, max_p: int) -> tuple[int, int]:
    """Return (start, period) of the most self-similar loop."""
    best = (0, min_p, float("inf"))
    n = len(signatures)
    for p in range(min_p, min(max_p, n - 1) + 1):
        for s in range(0, n - p):
            # compare the loop seam (s vs s+p) and its neighbours for smoothness
            err = float(np.mean(np.abs(signatures[s] - signatures[s + p])))
            if s + 1 < n and s + p + 1 < n:
                err += 0.5 * float(np.mean(np.abs(signatures[s + 1] - signatures[s + p + 1])))
            if err < best[2]:
                best = (s, p, err)
    return best[0], best[1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seg", required=True, type=Path)
    ap.add_argument("--first", type=int, required=True)
    ap.add_argument("--last", type=int, required=True)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--min-period", type=int, default=20)
    ap.add_argument("--max-period", type=int, default=40)
    ap.add_argument("--order", help="comma-separated names left to right, for clips where characters never touch")
    ap.add_argument("--windows", help="x0:x1,... column windows between neighbours (with --order)")
    ap.add_argument("--min-y", help="name=y,... ignore pixels above y for a character")
    ap.add_argument("--prefix", default="walk_", help="output frame name prefix")
    ap.add_argument("--orig", type=Path, help="folder of the ORIGINAL video frames (same names as --seg): "
                    "colours come from there, so cut-out eye-whites can be restored")
    ap.add_argument("--loop", help="name=start,period;... force these loops (reproduce an earlier extraction)")
    args = ap.parse_args()
    order = args.order.split(",") if args.order else None
    windows = [tuple(int(v) for v in w.split(":")) for w in args.windows.split(",")] if args.windows else []
    min_y = {k: int(v) for k, v in (kv.split("=") for kv in args.min_y.split(","))} if args.min_y else {}

    frames = [args.seg / f"f_{i:03d}.png" for i in range(args.first, args.last + 1)]
    rgba = [np.array(Image.open(f).convert("RGBA")) for f in frames]
    if args.orig:
        # background removal blanks the colour under what it cut out: take colours from the video frame
        for a, f in zip(rgba, frames):
            a[..., :3] = np.array(Image.open(args.orig / f.name).convert("RGB"))
    forced = {}
    if args.loop:
        for item in args.loop.split(";"):
            name, v = item.split("=")
            forced[name] = tuple(int(x) for x in v.split(","))
    parts = [split_by_columns(a[:, :, 3], order, windows, min_y) if order else split_frame(a[:, :, 3]) for a in rgba]

    report = {}
    for name in (order or CHARACTERS):
        boxes = [bbox(p[name]) for p in parts]
        heights = np.array([b[3] - b[1] for b in boxes], float)
        feet_x = np.array([(b[0] + b[2]) / 2 for b in boxes], float)
        feet_y = np.array([b[3] for b in boxes], float)
        t = np.arange(len(boxes), dtype=float)
        # Linear trends remove the perspective shrink/drift of walking away,
        # while keeping the natural per-step bob and sway.
        h_trend = np.polyval(np.polyfit(t, heights, 1), t)
        x_trend = np.polyval(np.polyfit(t, feet_x, 1), t)
        y_trend = np.polyval(np.polyfit(t, feet_y, 1), t)

        target_h = int(round(h_trend.max()))
        canvas_w = int(round(max((b[2] - b[0]) / s for b, s in zip(boxes, h_trend / target_h)) * 1.15)) + 8
        canvas_h = int(round(target_h * 1.12)) + 8

        normalized = []
        for a, p, s, cx, fy in zip(rgba, parts, h_trend / target_h, x_trend, y_trend):
            img = a.copy()
            img[:, :, 3] = np.where(p[name], a[:, :, 3], 0)
            if args.orig:
                img[:, :, 3] = np.maximum(img[:, :, 3], eye_holes(p[name]) * 255)
            scale = 1.0 / s
            big = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
            # place trend-feet point at bottom centre of the canvas
            ox = int(round(canvas_w / 2 - cx * scale))
            oy = int(round(canvas_h - 4 - fy * scale))
            out = np.zeros((canvas_h, canvas_w, 4), np.uint8)
            x0, y0 = max(0, -ox), max(0, -oy)
            x1 = min(big.shape[1], canvas_w - ox)
            y1 = min(big.shape[0], canvas_h - oy)
            out[y0 + oy:y1 + oy, x0 + ox:x1 + ox] = big[y0:y1, x0:x1]
            normalized.append(out)

        sigs = [cv2.resize(n_[:, :, 3], (32, 64), interpolation=cv2.INTER_AREA).astype(float) / 255 for n_ in normalized]
        if name in forced:
            start, period = forced[name][0] - args.first, forced[name][1]
        else:
            start, period = find_loop(sigs, args.min_period, args.max_period)

        dest = args.out / name
        dest.mkdir(parents=True, exist_ok=True)
        for old in dest.glob("*.png"):
            old.unlink()
        for k in range(period):
            Image.fromarray(normalized[start + k]).save(dest / f"{args.prefix}{k:02d}.png")
        report[name] = {
            "source_frames": [args.first + start, args.first + start + period - 1],
            "period": period,
            "frame_size": [canvas_w, canvas_h],
            "body_height": target_h,
        }
        print(name, report[name])

    (args.out / "walk_report.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
