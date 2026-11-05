#!/usr/bin/env python3
"""Sincronía imagen-sonido de un video: energía de ataque del audio junto a cada corte.

Uso: python3 sincronia.py <video.mp4>
Requiere ffmpeg, numpy y librosa (instálalos en un entorno aparte: python3 -m venv .venv && .venv/bin/pip install
numpy librosa). Vara: las piezas que más asombraron quedan entre 2.2x y 3.2x; si baja de ~2x, empujar.
"""
import subprocess, sys, tempfile, os, re
import numpy as np, librosa

v = sys.argv[1]
log = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", v, "-vf",
    "select='gt(scene,0.3)',showinfo", "-an", "-f", "null", "-"],
    capture_output=True, text=True).stderr
cuts = np.array([float(x) for x in re.findall(r"pts_time:([0-9.]+)", log)])
with tempfile.TemporaryDirectory() as t:
    wav = os.path.join(t, "a.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", v, "-vn", "-ac", "1", "-ar", "22050", wav], check=True)
    y, sr = librosa.load(wav, sr=22050)
dur = len(y) / sr
print(f"duración {dur:.1f}s · cortes {len(cuts)} · {len(cuts) / dur * 60:.1f} cortes/min")
if len(cuts) < 5:
    sys.exit("pocos cortes: pieza continua, la medición por cortes no aplica")
env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=256)
fr = sr / 256
lags = np.arange(-0.5, 0.51, 1 / fr)
prof = []
for L in lags:
    idx = ((cuts + L) * fr).astype(int)
    idx = idx[(idx >= 0) & (idx < len(env))]
    prof.append(env[idx].mean() / env.mean())
prof = np.array(prof)
i = prof.argmax()
print(f"pico de ataque {prof[i]:.2f}x la media a {lags[i] * 1000:+.0f} ms del corte "
      f"(en 0 ms: {prof[np.argmin(abs(lags))]:.2f}x)")
