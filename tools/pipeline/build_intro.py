"""Build the intro video from the high-quality clips (docs/videos/part-XX.mp4).

Each clip goes into the time slot its shot had in the original edit (001.MOV),
so the original soundtrack plays unchanged on top. The last shot - the
overlook - is not in the video: at CUT_AT the game itself shows the overlook
(in full quality) while the soundtrack plays on; the video just holds its last
frame until the music ends.

The opening shot (0-5.9 s) uses part-00/part-01 when present, otherwise the
original shot scaled up as a placeholder.

Usage:  python tools/pipeline/build_intro.py
Writes: public/assets/intro/intro_1080.mp4, intro_720.mp4
"""
from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VIDEOS = ROOT / "docs" / "videos"
OUT = ROOT / "public" / "assets" / "intro"
ORIGINAL = VIDEOS / "001.MOV"

CUT_AT = 74.8  # the overlook starts here (keep in sync with INTRO_CUT_AT in src/intro/IntroPlayer.ts)
FPS = 24

# (clip, in-point s, duration s) in order; the durations add up to the original's shot lengths
SHOTS = [
    ("part-02.mp4", 0.00, 5.60),
    ("part-03.mp4", 0.81, 5.15),
    ("part-04.mp4", 0.00, 6.00),
    ("part-05.mp4", 0.00, 6.00),
    ("part-06.mp4", 0.00, 6.00),
    ("part-07.mp4", 0.00, 6.00),
    ("part-08.mp4", 0.10, 4.05),
    ("part-09.mp4", 0.00, 12.05),
    ("part-10.mp4", 0.00, 8.00),
    ("part-11.mp4", 0.00, 6.05),
    ("part-12.mp4", 0.00, 4.00),
]
OPENING = 5.90
# part-09 is 3:2: crop it to 16:9 nearer the top, where the faces are
CROP_TOP_SHARE = {"part-09.mp4": 0.2}


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


def fit(label: str, top_share: float = 0.5) -> str:
    """Scale to cover 1920x1080 and crop (top_share of the excess height is cut from the top)."""
    return (f"scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,"
            f"crop=1920:1080:(iw-1920)/2:(ih-1080)*{top_share},setsar=1,fps={FPS},format=yuv420p{label}")


def main() -> None:
    opening = next((VIDEOS / n for n in ("part-00.mp4", "part-01.mp4") if (VIDEOS / n).exists()), None)
    inputs: list[str] = []
    chains: list[str] = []
    labels: list[str] = []

    if opening:
        inputs += ["-i", str(opening)]
        src, start = 0, 0.0
        print(f"opening: {opening.name}")
    else:
        inputs += ["-i", str(ORIGINAL)]
        src, start = 0, 0.0
        print("opening: placeholder from 001.MOV (drop part-01.mp4 into docs/videos to replace it)")
    chains.append(f"[{src}:v]trim=start={start}:duration={OPENING},setpts=PTS-STARTPTS,{fit('[v0]')}")
    labels.append("[v0]")

    for i, (name, t_in, dur) in enumerate(SHOTS, start=1):
        path = VIDEOS / name
        have = duration(path)
        if t_in + dur > have + 0.02:
            raise SystemExit(f"{name}: needs {t_in + dur:.2f}s but is {have:.2f}s")
        inputs += ["-i", str(path)]
        chains.append(f"[{i}:v]trim=start={t_in}:duration={dur},setpts=PTS-STARTPTS,"
                      f"{fit(f'[v{i}]', CROP_TOP_SHARE.get(name, 0.5))}")
        labels.append(f"[v{i}]")

    total = duration(ORIGINAL)
    hold = total - CUT_AT
    n = len(labels)
    # hold the last picture while the soundtrack finishes (the game shows the overlook meanwhile)
    chains.append(f"{''.join(labels)}concat=n={n}:v=1:a=0,tpad=stop_mode=clone:stop_duration={hold:.3f}[v]")
    inputs += ["-i", str(ORIGINAL)]
    audio = len(SHOTS) + 1

    OUT.mkdir(parents=True, exist_ok=True)
    full = OUT / "intro_1080.mp4"
    cmd = ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(chains),
           "-map", "[v]", "-map", f"{audio}:a", "-t", f"{total:.3f}",
           "-c:v", "libx264", "-preset", "slower", "-crf", "25", "-maxrate", "2.8M", "-bufsize", "5.6M",
           "-profile:v", "high", "-pix_fmt", "yuv420p", "-tune", "animation",
           "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(full)]
    subprocess.run(cmd, check=True)
    small = OUT / "intro_720.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(full), "-vf", "scale=1280:720:flags=lanczos",
                    "-c:v", "libx264", "-preset", "slower", "-crf", "25", "-maxrate", "1.4M", "-bufsize", "2.8M",
                    "-profile:v", "high", "-pix_fmt", "yuv420p", "-tune", "animation",
                    "-c:a", "copy", "-movflags", "+faststart", str(small)], check=True)
    for f in (full, small):
        print(f"{f.name}: {duration(f):.2f}s, {f.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
