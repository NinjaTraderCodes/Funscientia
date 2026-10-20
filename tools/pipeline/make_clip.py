"""Generate a short image-to-video clip with Wan 2.2 on a Hugging Face ZeroGPU Space.

Free with a Hugging Face account (`hf auth login`), within the daily ZeroGPU quota.

Usage:
  python make_clip.py --image docs/references/video-start-frames/boy_front.png \
      --prompt-file content/prompts/walk_front.txt --out docs/walk-clips/boy_front_wan.mp4 [--seconds 5]
"""
from __future__ import annotations

import argparse
import shutil
import time
from pathlib import Path

from gradio_client import Client, handle_file
from huggingface_hub import get_token

SPACE = "zerogpu-aoti/wan2-2-fp8da-aoti-faster"
NEGATIVE = ("open mouth, talking, teeth, turning around, stopping, running, jumping, camera shake, zoom, cuts, "
            "floor shadow, background objects, extra people, blurry, deformed hands, extra limbs, walking backwards")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True, type=Path)
    ap.add_argument("--prompt-file", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--seconds", type=float, default=5.0)
    ap.add_argument("--steps", type=int, default=6)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    prompt = " ".join(args.prompt_file.read_text(encoding="utf-8").split())

    t0 = time.time()
    client = Client(SPACE, token=get_token(), verbose=False)
    video, seed = client.predict(
        handle_file(str(args.image)), prompt, args.steps, NEGATIVE, args.seconds, 1, 1, args.seed, False,
        api_name="/generate_video",
    )
    path = video["video"] if isinstance(video, dict) else video
    shutil.copy(path, args.out)
    print(f"saved {args.out} ({args.out.stat().st_size / 1e6:.1f} MB) seed {seed} in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
