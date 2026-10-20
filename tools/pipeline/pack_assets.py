"""Turn processed masters into game-ready assets (public/assets/...).

Reads high-resolution masters from a work folder and writes:
  public/assets/characters/<name>.webp + <name>.json   (Phaser JSON-hash atlas)
  public/assets/characters/characters.json             (animation manifest)
  public/assets/world/overlook.webp + overlook.json    (plate + scene layout)

Gameplay code only reads the manifests, so better source art (new walk
cycles, higher-resolution plates) can replace these files without touching
game code: re-run this script and reload.

Usage:
  python pack_assets.py --work .tools/work --out public/assets --esrgan .tools/realesrgan/realesrgan-ncnn-vulkan.exe
"""
from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

# --- Scene layout, in "world units" = pixels of the 848x464 intro frame at 76.2s
# Standing poses at 76.2s: (x, y, w, h) bounding boxes from rembg.
IDLE_BOXES = {"girl": (335, 318, 45, 124), "fox": (389, 368, 43, 75), "boy": (442, 317, 52, 131)}
# Camera rect of the video's very last frame, expressed in world units
# (SIFT + RANSAC similarity fit between the last frame and the 76.2s frame).
END_FRAME_RECT = {"x": 30.72, "y": -6.57, "w": 789.14, "h": 431.34}
# The camera dollies towards the trio at the end of the video: relative to the
# background, the characters are 1.717x larger, scaled about this pivot.
END_FRAME_PARTY = {"pivot": [420.5, 321.5], "scale": 1.717}
WALKABLE = [[190, 464], [215, 425], [270, 408], [400, 404], [560, 408], [625, 420], [660, 464]]
HORIZON_Y = 250  # ground-plane vanishing line used for depth scaling
PLATE_TOP_PAD = 16  # world units mirrored above the frame so the end-frame rect fits

SHIP_PLATE_WIDTH = 2560
SHIP_WALK_BODY_PX = 330  # character body height inside walk frames (texture px)
SHIP_IDLE_BODY_PX = 560  # idle frames are also shown big in the opening shot
WALK_FPS = 30
WALK_FRAME_STEP = 2  # keep every 2nd source frame: 15 fps loops, half the texture memory
# walk direction -> folder of extracted, x4-upscaled loops (one sub-folder per character)
# direction -> (folder, frame step, playback fps). "work:" folders are under --work/<folder>/<name>,
# "art:" folders are art masters under --art/characters/<name>/<folder>.
WALK_SOURCES = {
    "back": ("art:walk_back|work:chars_x4", WALK_FRAME_STEP, WALK_FPS // WALK_FRAME_STEP),
    # art masters (ChatGPT/Codex) win over the old intro extractions when present
    "front": ("art:walk_front|work:chars_front_x4", WALK_FRAME_STEP, WALK_FPS // WALK_FRAME_STEP),
    # ChatGPT/Codex side walk (facing left): 16 frames over one stride, timed by timing.json
    "side": ("art:walk_side", 1, 16),
}
VIEW_LIGHT_MATCH = 0.75  # how strongly turnaround views take on the scene's light (0..1)
VIEW_FACINGS: dict[str, dict[str, str]] = {}


def esrgan_x4(exe: Path, rgba: Image.Image) -> Image.Image:
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / "in.png", Path(tmp) / "out.png"
        rgba.save(src)
        subprocess.run([str(exe), "-i", str(src), "-o", str(dst), "-n", "realesrgan-x4plus"],
                       check=True, capture_output=True)
        return Image.open(dst).convert("RGBA").copy()


def lab_stats(img: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mask = img[:, :, 3] > 200
    lab = cv2.cvtColor(img[:, :, :3], cv2.COLOR_RGB2LAB).astype(np.float32)
    px = lab[mask]
    return px.mean(0), px.std(0) + 1e-3


def color_match(img: np.ndarray, ref_mean: np.ndarray, ref_std: np.ndarray, src_mean, src_std, amount=1.0):
    lab = cv2.cvtColor(img[:, :, :3], cv2.COLOR_RGB2LAB).astype(np.float32)
    matched = (lab - src_mean) / src_std * ref_std + ref_mean
    lab = lab + amount * (matched - lab)
    rgb = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB)
    out = img.copy()
    out[:, :, :3] = rgb
    return out


def tighten_alpha(img: np.ndarray, lo: int = 50, hi: int = 210, erode: int = 2) -> np.ndarray:
    """Remove the soft background halo that matting leaves around edges."""
    a = img[:, :, 3].astype(np.float32)
    if erode:
        a = cv2.erode(a, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (erode * 2 + 1,) * 2))
    a = np.clip((a - lo) * 255.0 / (hi - lo), 0, 255)
    out = img.copy()
    out[:, :, 3] = a.astype(np.uint8)
    return out


def body_box(img: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(img[:, :, 3] > 100)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def fit_frame(img: np.ndarray, body_px: int, ref_body: int, canvas: tuple[int, int], feet_y: int,
              center_x: float | None = None) -> np.ndarray:
    """Scale so that ref_body source px -> body_px, feet at feet_y, centred on x.

    center_x (source px) fixes the horizontal anchor for a whole animation, so
    swinging legs do not shift the body; without it each frame is centred on its own box.
    """
    s = body_px / ref_body
    big = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    x0, y0, x1, y1 = body_box(big)
    out = np.zeros((canvas[1], canvas[0], 4), np.uint8)
    cx = center_x * s if center_x is not None else (x0 + x1) / 2
    ox = int(round(canvas[0] / 2 - cx))
    oy = feet_y - y1
    sx0, sy0 = max(0, -ox), max(0, -oy)
    sx1, sy1 = min(big.shape[1], canvas[0] - ox), min(big.shape[0], canvas[1] - oy)
    out[sy0 + oy:sy1 + oy, sx0 + ox:sx1 + ox] = big[sy0:sy1, sx0:sx1]
    return out


def torso_center_x(img: np.ndarray) -> float:
    """Horizontal centre of the upper body (25-55% of height), which barely moves while walking."""
    x0, y0, x1, y1 = body_box(img)
    band = img[y0 + int(0.25 * (y1 - y0)): y0 + int(0.55 * (y1 - y0)), :, 3] > 100
    xs = np.where(band.any(0))[0]
    return float((xs.min() + xs.max()) / 2) if len(xs) else (x0 + x1) / 2


def pack_atlas(frames: dict[str, np.ndarray], image_name: str, pad: int = 2):
    """Simple shelf packer -> (RGBA atlas, Phaser JSON-hash dict)."""
    items = sorted(frames.items(), key=lambda kv: -kv[1].shape[0])
    total = sum((f.shape[1] + pad) * (f.shape[0] + pad) for _, f in items)
    width = min(4096, max(512, int(np.sqrt(total) * 1.15)))
    x = y = shelf_h = 0
    placed = {}
    for name, f in items:
        h, w = f.shape[:2]
        if x + w > width:
            x, y, shelf_h = 0, y + shelf_h + pad, 0
        placed[name] = (x, y)
        x += w + pad
        shelf_h = max(shelf_h, h)
    height = y + shelf_h
    if height > 4096:
        raise SystemExit(f"atlas {image_name} too tall ({height}px); lower the ship size")
    atlas = np.zeros((height, width, 4), np.uint8)
    meta = {}
    for name, f in items:
        px, py = placed[name]
        h, w = f.shape[:2]
        atlas[py:py + h, px:px + w] = f
        meta[name] = {
            "frame": {"x": px, "y": py, "w": w, "h": h},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
            "sourceSize": {"w": w, "h": h},
        }
    data = {"frames": meta, "meta": {"image": image_name, "size": {"w": width, "h": height}, "scale": "1"}}
    return atlas, data


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--esrgan", required=True, type=Path)
    ap.add_argument("--art", type=Path, default=Path("art"), help="hand-made / generated art masters")
    args = ap.parse_args()

    chars_out = args.out / "characters"
    world_out = args.out / "world"
    chars_out.mkdir(parents=True, exist_ok=True)
    world_out.mkdir(parents=True, exist_ok=True)

    global VIEW_FACINGS
    views_file = args.art / "characters" / "views.json"
    VIEW_FACINGS = {k: v for k, v in json.loads(views_file.read_text()).items() if k != "about"} if views_file.exists() else {}
    cut = Image.open(args.work / "overlook_cut.png").convert("RGBA")
    manifest = {"version": 1, "characters": {}}

    for name, (bx, by, bw, bh) in IDLE_BOXES.items():
        print("packing", name)
        pad = 4
        idle_src = cut.crop((bx - pad, by - pad, bx + bw + pad, by + bh + pad))
        idle = tighten_alpha(np.array(esrgan_x4(args.esrgan, idle_src)), erode=3)
        idle_body = body_box(idle)
        idle_ref = idle_body[3] - idle_body[1]

        # match the walk frames (garden / midday light) to the sunset-lit overlook pose
        ref_mean, ref_std = lab_stats(idle)

        def resolve(source: str) -> tuple[str, Path] | None:
            """First existing source of an 'a|b' list -> (kind, folder)."""
            for option in source.split("|"):
                kind, folder = option.split(":")
                root = args.work / folder / name if kind == "work" else args.art / "characters" / name / folder
                if any(root.glob("walk_*.png")):
                    return kind, root
            return None

        def load_walk(source: str, step: int) -> list[np.ndarray]:
            found = resolve(source)
            if not found:
                return []
            kind, root = found
            files = sorted(root.glob("walk_*.png"))[:: (1 if kind == "art" else step)]
            imgs = [tighten_alpha(np.array(Image.open(f).convert("RGBA"))) for f in files]
            if not imgs:
                return []
            m, sd = lab_stats(imgs[0])
            return [color_match(i, ref_mean, ref_std, m, sd) for i in imgs]

        def load_timing(source: str) -> dict | None:
            """timing.json of an art walk: per-frame durations and strides per loop."""
            found = resolve(source)
            if not found or found[0] != "art":
                return None
            t = found[1] / "timing.json"
            return json.loads(t.read_text()) if t.exists() else None

        walk_sets = {d: (load_walk(src, step), fps, load_timing(src)) for d, (src, step, fps) in WALK_SOURCES.items()}
        walk_sets = {d: v for d, v in walk_sets.items() if v[0]}

        def canvas_for(body_px: int, ref: int, imgs: list[np.ndarray]) -> tuple[tuple[int, int], int]:
            s = body_px / ref
            w = max(body_box(i)[2] - body_box(i)[0] for i in imgs) * s
            return (int(w * 1.1) + 8, int(body_px * 1.08) + 8), int(body_px * 1.08) + 4

        idle_canvas, idle_feet = canvas_for(SHIP_IDLE_BODY_PX, idle_ref, [idle])
        frames: dict[str, np.ndarray] = {}
        walk_anims = {}
        for d, (walks, fps, durations) in walk_sets.items():
            ref = int(np.median([body_box(w)[3] - body_box(w)[1] for w in walks]))
            canvas, feet = canvas_for(SHIP_WALK_BODY_PX, ref, walks)
            # one horizontal anchor for the whole loop: the mean torso centre
            centre = float(np.mean([torso_center_x(w) for w in walks]))
            prefix = "walk_" if d == "back" else f"walk_{d}_"
            for k, w in enumerate(walks):
                frames[f"{prefix}{k:02d}"] = fit_frame(w, SHIP_WALK_BODY_PX, ref, canvas, feet, centre)
            walk_anims[f"walk_{d}"] = {"prefix": prefix, "count": len(walks), "fps": fps,
                                       "bodyPx": SHIP_WALK_BODY_PX, "originY": feet / canvas[1]}
            if durations:
                walk_anims[f"walk_{d}"]["durations"] = durations["durations_ms"]
                walk_anims[f"walk_{d}"]["strides"] = durations.get("strides", 1)
        frames["idle"] = fit_frame(idle, SHIP_IDLE_BODY_PX, idle_ref, idle_canvas, idle_feet)

        # standing poses for every direction, from the Gemini turnaround sheet
        views = {}
        facings = VIEW_FACINGS.get(name, {})
        for view, facing in facings.items():
            path = args.art / "characters" / name / f"{view}.png"
            if not path.exists():
                continue
            img = tighten_alpha(np.array(Image.open(path).convert("RGBA")), erode=1)
            # studio-lit sheet -> warm overlook light, matched to this character's intro pose
            v_mean, v_std = lab_stats(img)
            img = color_match(img, ref_mean, ref_std, v_mean, v_std, amount=VIEW_LIGHT_MATCH)
            ref = body_box(img)[3] - body_box(img)[1]
            canvas, feet = canvas_for(SHIP_WALK_BODY_PX, ref, [img])
            frames[f"view_{view}"] = fit_frame(img, SHIP_WALK_BODY_PX, ref, canvas, feet)
            views[view] = {"frame": f"view_{view}", "bodyPx": SHIP_WALK_BODY_PX,
                           "originY": feet / canvas[1], "facing": facing}
        atlas, data = pack_atlas(frames, f"{name}.webp")
        Image.fromarray(atlas).save(chars_out / f"{name}.webp", quality=88, method=6)
        (chars_out / f"{name}.json").write_text(json.dumps(data))

        manifest["characters"][name] = {
            "atlas": f"characters/{name}",
            "animations": {
                **walk_anims,
                "idle_back": {"frame": "idle", "bodyPx": SHIP_IDLE_BODY_PX,
                              "originY": idle_feet / idle_canvas[1]},
            },
            "views": views,
            # where the character stands at the start, in world units
            "start": {"x": bx + bw / 2, "y": by + bh, "bodyHeight": bh},
            "source": {"walk_back": "001.MOV from 68.0s @30fps", "walk_front": "001.MOV 0.0-5.5s @30fps",
                       "idle": "001.MOV frame at 76.2s", "views": "Gemini turnaround sheets"},
        }

    (chars_out / "characters.json").write_text(json.dumps(manifest, indent=2))

    print("packing layers")
    # far: the kingdom, with a mirrored strip on top so the end-frame rect fits
    far = Image.open(args.work / "layers" / "far_x4.png").convert("RGB")
    top = int(round(PLATE_TOP_PAD * far.width / 848))
    arr = np.array(far)
    far = Image.fromarray(np.concatenate([arr[top:0:-1], arr], axis=0))
    far_h = int(round(far.height * SHIP_PLATE_WIDTH / far.width))
    far.resize((SHIP_PLATE_WIDTH, far_h), Image.LANCZOS).save(world_out / "overlook_far.webp", quality=86, method=6)
    # near: ledge, bushes and leaves (transparent elsewhere); moves with the trio's dolly
    near = Image.open(args.work / "layers" / "near_x4.png").convert("RGBA")
    near_h = int(round(near.height * SHIP_PLATE_WIDTH / near.width))
    near.resize((SHIP_PLATE_WIDTH, near_h), Image.LANCZOS).save(world_out / "overlook_near.webp", quality=88, method=6)
    old = world_out / "overlook.webp"
    if old.exists():
        old.unlink()

    world = {
        "version": 2,
        "units": "pixels of the 848x464 intro frame at 76.2s",
        "layers": {
            "far": {"image": "world/overlook_far", "x": 0, "y": -PLATE_TOP_PAD, "w": 848, "h": 464 + PLATE_TOP_PAD},
            "near": {"image": "world/overlook_near", "x": 0, "y": 0, "w": 848, "h": 464},
        },
        "videoFrame": {"w": 848, "h": 464},
        "endFrameRect": END_FRAME_RECT,
        "endFrameParty": END_FRAME_PARTY,
        "overviewRect": {"x": 0, "y": 0, "w": 848, "h": 464},
        "walkable": WALKABLE,
        "horizonY": HORIZON_Y,
    }
    (world_out / "overlook.json").write_text(json.dumps(world, indent=2))
    print("done")


if __name__ == "__main__":
    main()
