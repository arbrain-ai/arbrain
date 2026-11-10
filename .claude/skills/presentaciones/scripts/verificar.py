#!/usr/bin/env python3
"""Arma la presentación, la abre en Chrome sin pantalla, busca lo que está mal y saca una captura por lámina.

    python3 verificar.py <carpeta-del-deck> [--capturas <carpeta>]

Revisa cada paso de cada lámina: errores de JavaScript, texto que se sale del cuadro, que no cabe, muy chico o encimado.
Deja lamina-NN.png (en su último paso) y hoja.png (todas juntas) en _capturas/ para que las critiques con ojos frescos.
Sale 0 si todo está bien, 1 si hay algo que arreglar y 2 si no se pudo revisar en esta computadora."""
import argparse
import html
import json
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
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
]


def chrome():
    for c in CANDIDATOS:
        if Path(c).exists():
            return c
    for n in ('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'msedge', 'microsoft-edge'):
        r = shutil.which(n)
        if r:
            return r
    return None


def correr(exe, perfil, *extra, presupuesto=5000):
    base = [exe, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
            f'--user-data-dir={perfil}', '--window-size=1920,1080', f'--virtual-time-budget={presupuesto}',
            '--enable-logging=stderr', '--v=0', '--mute-audio']
    return subprocess.run(base + list(extra), capture_output=True, text=True, timeout=180)


def errores_consola(salida):
    return ['consola: ' + l.strip()[:260] for l in salida.splitlines() if 'Uncaught' in l or ('CONSOLE' in l and 'rror' in l and 'favicon' not in l)]


def hoja(exe, perfil, caps, n):
    """Todas las capturas en una sola imagen, armada con el mismo Chrome (sin dependencias)."""
    celdas = ''.join(f'<figure><img src="lamina-{k:02d}.png"><figcaption>{k}</figcaption></figure>' for k in range(n))
    pagina = caps / '_hoja.html'
    pagina.write_text('<!doctype html><meta charset=utf-8><style>*{margin:0}body{background:#222;display:grid;'
                      'grid-template-columns:repeat(4,1fr);gap:6px;padding:6px;width:2400px}figure{position:relative}'
                      'img{width:100%;display:block}figcaption{position:absolute;left:6px;top:4px;background:#000c;color:#fff;'
                      'font:600 22px system-ui;padding:0 8px;border-radius:4px}</style>' + celdas, encoding='utf-8')
    filas = (n + 3) // 4
    alto = filas * 339 + 12
    salida = caps / 'hoja.png'
    if salida.exists():
        salida.unlink()
    subprocess.run([exe, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={perfil}',
                    f'--window-size=2412,{alto}', f'--screenshot={salida}', pagina.as_uri()],
                   capture_output=True, text=True, timeout=120)
    pagina.unlink(missing_ok=True)


def verificar(deck: Path, capturas=None) -> int:
    """0 = todo bien · 1 = hay algo que arreglar · 2 = no se pudo revisar en esta computadora."""
    if (deck / 'piezas').exists():
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from construir import construir
        construir(deck)
    index = deck / 'index.html'
    if not index.exists():
        sys.exit(f'No hay index.html en {deck}')
    doc = index.read_text(encoding='utf-8')
    sin_codigo = re.sub(r'<script\b.*?</script>|<!--.*?-->', '', doc, flags=re.S)  # el motor nombra la etiqueta en sus comentarios
    n = len(re.findall(r'<section[^>]*class="[^"]*\blamina\b', sin_codigo))
    exe = chrome()
    if not exe:
        print('NO_REVISADO: no encontré Chrome ni Edge en esta computadora.')
        return 2
    url = index.as_uri()
    fallas, avisos = [], []
    with tempfile.TemporaryDirectory() as perfil:
        try:
            r = correr(exe, perfil, '--dump-dom', url + '?auditar#0.0', presupuesto=9000)
        except (OSError, subprocess.TimeoutExpired) as e:
            print(f'NO_REVISADO: Chrome no pudo abrir aquí ({e.__class__.__name__}).')
            return 2
        dom = r.stdout
        if '<body' not in dom:
            print('NO_REVISADO: Chrome no pudo abrir aquí. ' + (r.stderr.strip().splitlines() or [''])[0][:200])
            return 2
        fallas += errores_consola(r.stderr)
        m = re.search(r'<body[^>]*data-listo="(\d+)"', dom)
        if not m:
            fallas.append('el motor no arrancó')
        elif int(m.group(1)) != n:
            fallas.append(f'el motor ve {m.group(1)} láminas y el HTML tiene {n}')
        e = re.search(r'<body[^>]*data-error="([^"]*)"', dom)
        if e:
            fallas.append('un enactivo lanzó un error: ' + html.unescape(e.group(1)))
        au = re.search(r'<body[^>]*data-auditoria="([^"]*)"', dom)
        if au:
            for p in json.loads(html.unescape(au.group(1))):
                linea = f"lámina {p['lamina']} (paso {p['paso']}) · {p['tipo']}: {p['donde']}" + (f" · {p['detalle']}" if p['detalle'] else '')
                (avisos if p['tipo'] == 'letra chica' else fallas).append(linea)
        elif m and (deck / 'piezas').exists():
            fallas.append('la auditoría no terminó')
        caps = Path(capturas).expanduser().resolve() if capturas else deck / '_capturas'
        caps.mkdir(parents=True, exist_ok=True)
        for k in range(n):
            out = caps / f'lamina-{k:02d}.png'
            if out.exists():
                out.unlink()
            r = correr(exe, perfil, f'--screenshot={out}', f'{url}?captura#{k}.99')
            fallas += errores_consola(r.stderr)
            if not out.exists() or out.stat().st_size < 2000:
                fallas.append(f'sin captura de la lámina {k}')
        hoja(exe, perfil, caps, n)
    print(f'{n} láminas · capturas en {caps} · todas juntas en {caps / "hoja.png"}')
    if avisos:
        print('AVISOS:')
        for f in avisos:
            print(' -', f)
    if fallas:
        print('FALLAS:')
        for f in fallas:
            print(' -', f)
        return 1
    print('OK: abre sin errores y nada se sale ni se encima.')
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('carpeta')
    ap.add_argument('--capturas')
    a = ap.parse_args()
    sys.exit(verificar(Path(a.carpeta).expanduser().resolve(), a.capturas))


if __name__ == '__main__':
    main()
