#!/usr/bin/env python3
"""Abre el deck en Chrome sin pantalla, confirma que el motor arrancó sin errores y saca una captura por lámina
(en su último paso) para que la critiques con ojos frescos.

    python3 verificar.py <carpeta-del-deck> [--capturas <carpeta>]

Sale 0 si todo está bien; 1 si hubo un error de JavaScript, el motor no arrancó o falta una captura."""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

CANDIDATOS = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
]


def chrome():
    for c in CANDIDATOS:
        if Path(c).exists():
            return c
    for n in ('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'msedge'):
        r = shutil.which(n)
        if r:
            return r
    sys.exit('No encontré Chrome, Chromium ni Edge. Instala Chrome y vuelve a correr.')


def correr(exe, perfil, *extra):
    base = [exe, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
            f'--user-data-dir={perfil}', '--window-size=1920,1080', '--virtual-time-budget=4000',
            '--enable-logging=stderr', '--v=0', '--allow-file-access-from-files']
    return subprocess.run(base + list(extra), capture_output=True, text=True, timeout=90)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('carpeta')
    ap.add_argument('--capturas')
    a = ap.parse_args()
    deck = Path(a.carpeta).expanduser().resolve()
    index = deck / 'index.html'
    if not index.exists():
        sys.exit(f'No hay index.html en {deck}')
    html = index.read_text(encoding='utf-8')
    n = len(re.findall(r'<section[^>]*class="[^"]*\blamina\b', html))
    exe = chrome()
    url = index.as_uri()
    fallas = []
    with tempfile.TemporaryDirectory() as perfil:
        r = correr(exe, perfil, '--dump-dom', url + '#0.0')
        dom = r.stdout
        errores = [l for l in r.stderr.splitlines() if 'Uncaught' in l or ('CONSOLE' in l and 'rror' in l)]
        m = re.search(r'<body[^>]*data-listo="(\d+)"', dom)
        if not m:
            fallas.append('el motor no arrancó (falta data-listo en <body>)')
        elif int(m.group(1)) != n:
            fallas.append(f'el motor ve {m.group(1)} láminas y el HTML tiene {n}')
        if re.search(r'<body[^>]*data-error=', dom):
            fallas.append('un enactivo lanzó un error: ' + re.search(r'data-error="([^"]*)"', dom).group(1))
        fallas += ['consola: ' + e.strip()[:240] for e in errores]
        caps = Path(a.capturas).expanduser().resolve() if a.capturas else deck / '_capturas'
        caps.mkdir(parents=True, exist_ok=True)
        for k in range(n):
            out = caps / f'lamina-{k:02d}.png'
            if out.exists():
                out.unlink()
            r = correr(exe, perfil, f'--screenshot={out}', f'{url}?captura#{k}.99')
            fallas += ['consola: ' + l.strip()[:240] for l in r.stderr.splitlines() if 'Uncaught' in l]
            if not out.exists() or out.stat().st_size < 2000:
                fallas.append(f'sin captura de la lámina {k}')
    print(f'{n} láminas · capturas en {caps}')
    if fallas:
        print('FALLAS:')
        for f in fallas:
            print(' -', f)
        sys.exit(1)
    print('OK: el deck abre sin errores. Ahora mira cada captura y critícala (references/critico.md).')


if __name__ == '__main__':
    main()
