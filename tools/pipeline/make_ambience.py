"""The game's background sound: birds and a waterfall, looping.

Source: docs/audio/rmultimediaeu-birds-and-waterfall-250309.mp3 (Pixabay).
The recording has deep heartbeat-like thumps in it. They are flattened, not
cut out: the lowest frequencies (where the thumps live) are split off, and
that band alone is turned down only where a thump rises above the steady
rumble, so the waterfall's low roar and all the birdsong stay untouched.
The end is crossfaded into the start so the browser loops it with no join.

Usage:  python tools/pipeline/make_ambience.py
Writes: public/assets/audio/ambience.m4a
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

import numpy as np
from scipy.ndimage import maximum_filter1d, median_filter
from scipy.signal import butter, sosfiltfilt

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs" / "audio" / "rmultimediaeu-birds-and-waterfall-250309.mp3"
OUT = ROOT / "public" / "assets" / "audio" / "ambience.m4a"
SR = 48000
# (lower edge, upper edge) of each band that gets its thumps flattened, in Hz
THUMP_BANDS = [(0, 160), (160, 400)]


def load() -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(SOURCE), "-vn", "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def split(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """The part of x between lo and hi (zero-phase, so the bands add back up exactly)."""
    if lo <= 0:
        sos = butter(4, hi, "lowpass", fs=SR, output="sos")
    else:
        sos = butter(4, [lo, hi], "bandpass", fs=SR, output="sos")
    return sosfiltfilt(sos, x, axis=0)


def flatten_thumps(band: np.ndarray, allow: float = 1.25) -> tuple[np.ndarray, int]:
    """Turn the band down wherever it rises above `allow` x its running level (a thump)."""
    hop = SR // 100  # 10 ms
    e = np.sqrt((band[: len(band) // hop * hop].reshape(-1, hop, 2) ** 2).mean(axis=(1, 2))) + 1e-9
    steady = median_filter(e, size=301)  # 3 s of background level
    gain = np.minimum(1.0, allow * steady / e)
    # hold the dip a little around each thump (no pumping), then smooth it
    gain = -maximum_filter1d(-gain, size=9)
    gain = np.convolve(gain, np.hanning(7) / np.hanning(7).sum(), mode="same")
    loud = e > 2.0 * steady
    thumps = int((loud[1:] & ~loud[:-1]).sum())
    g = np.interp(np.arange(len(band)), np.arange(len(gain)) * hop + hop / 2, gain)
    return band * g[:, None], thumps


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fade", type=float, default=4.0, help="seconds of crossfade at the loop point")
    args = ap.parse_args()
    x = load()
    rest = x.copy()
    out = np.zeros_like(x)
    for lo, hi in THUMP_BANDS:
        b = split(x, lo, hi)
        rest -= b
        flat, n = flatten_thumps(b)
        out += flat
        print(f"  {lo}-{hi} Hz: flattened {n} thumps")
    out += rest  # everything above the thump bands, untouched

    # loop: crossfade the tail into the head
    f = int(args.fade * SR)
    ramp = np.linspace(0, 1, f)[:, None]
    loop = np.concatenate([out[:f] * np.sqrt(ramp) + out[-f:] * np.sqrt(1 - ramp), out[f:-f]])
    gain = min(0.12 / max(1e-9, float(np.sqrt((loop ** 2).mean()))), 0.89 / max(1e-9, float(np.abs(loop).max())))
    loop = (loop * gain).astype(np.float32)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                    "-c:a", "aac", "-b:a", "128k", str(OUT)], input=loop.tobytes(), check=True)
    print(f"{OUT.name}: {len(loop) / SR:.1f}s loop, {OUT.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
