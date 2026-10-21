"""Build the hero (start) page's looping background video and its still frame.

The clip (docs/videos/heropage_video.mp4) does not end where it starts. Instead
of crossfading the end into the start (two pictures on top of each other for a
second - it looks smeared), it plays forward and then backward: every frame is
a real frame, and the loop has no seam at all.

The sound (the portal's shimmer) is raised to a gentle level and made to loop
seamlessly over the same length: copies overlapped with crossfades, the end
folded into the start. Browsers only play it once the visitor has interacted
with the page (see src/main.ts).

Usage:  python tools/pipeline/build_hero.py
Writes: public/assets/hero/hero_1080.mp4, hero_720.mp4, hero_poster.jpg
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs" / "videos" / "heropage_video.mp4"
OUT = ROOT / "public" / "assets" / "hero"
SR = 48000
LEVEL = 0.05  # target loudness (RMS) of the shimmer: present, never loud
FADE = 1.0  # seconds of crossfade between overlapped copies of the sound


def probe(path: Path, entry: str) -> str:
    return subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", entry, "-of", "csv=p=0", str(path)],
                          capture_output=True, text=True, check=True).stdout.strip()


def duration(path: Path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                                capture_output=True, text=True, check=True).stdout)


def looped_sound(length_s: float) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(SOURCE), "-vn", "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)
    f = int(FADE * SR)
    ramp = np.linspace(0, 1, f)[:, None]
    n = int(round(length_s * SR))
    # copies of the sound, each overlapping the one before by FADE seconds
    bed = x.copy()
    while len(bed) < n + f:
        bed = np.concatenate([bed[:-f], bed[-f:] * np.sqrt(1 - ramp) + x[:f] * np.sqrt(ramp), x[f:]])
    bed = bed[: n + f]
    # fold the overhang into the start: the loop has no join
    bed[:f] = bed[:f] * np.sqrt(ramp) + bed[n:n + f] * np.sqrt(1 - ramp)
    bed = bed[:n]
    gain = min(LEVEL / max(1e-9, float(np.sqrt((bed ** 2).mean()))), 0.89 / max(1e-9, float(np.abs(bed).max())))
    return (bed * gain).astype(np.float32)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    fps = eval(probe(SOURCE, "stream=r_frame_rate"))  # e.g. 24/1
    frames = int(probe(SOURCE, "stream=nb_frames"))
    # forward, then backward without repeating the two end frames: 2n - 2 frames
    loop_frames = 2 * frames - 2
    loop_s = loop_frames / fps
    graph = (f"[0:v]split=2[f][b];[b]reverse,trim=start_frame=1:end_frame={frames - 1},setpts=PTS-STARTPTS[r];"
             f"[f][r]concat=n=2:v=1:a=0,format=yuv420p[v]")
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "sound.f32"
        wav.write_bytes(looped_sound(loop_s).tobytes())
        for name, scale, crf, rate in (("hero_1080.mp4", "1920:1080", 24, "2.4M"), ("hero_720.mp4", "1280:720", 25, "1.2M")):
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SOURCE), "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", str(wav),
                            "-filter_complex", f"{graph};[v]scale={scale}:flags=lanczos[o]",
                            "-map", "[o]", "-map", "1:a", "-c:v", "libx264", "-preset", "slower", "-crf", str(crf),
                            "-maxrate", rate, "-bufsize", rate.replace("M", "") + "M", "-profile:v", "high", "-pix_fmt", "yuv420p",
                            "-c:a", "aac", "-b:a", "96k", "-t", f"{loop_s:.4f}", "-movflags", "+faststart", str(OUT / name)], check=True)
            print(f"{name}: {duration(OUT / name):.2f}s ({loop_frames} frames), {(OUT / name).stat().st_size / 1e6:.2f} MB")
    # the still shown before the video starts: the loop's own first frame, so nothing jumps
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(OUT / "hero_1080.mp4"), "-frames:v", "1", "-vf", "scale=1600:-2", "-q:v", "5",
                    str(OUT / "hero_poster.jpg")], check=True)
    print(f"hero_poster.jpg: {(OUT / 'hero_poster.jpg').stat().st_size / 1e3:.0f} KB")


if __name__ == "__main__":
    main()
