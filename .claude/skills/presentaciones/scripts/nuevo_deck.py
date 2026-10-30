#!/usr/bin/env python3
"""Crea un deck nuevo en una carpeta: motor, presentador, tema y un demo de 4 láminas listo para reescribir.

    python3 nuevo_deck.py <carpeta> [--tema noche|papel|<ruta a tu .css>] [--titulo "Mi clase"]

La carpeta queda autocontenida: se abre con doble clic en index.html (sin servidor, sin internet).
No pisa una carpeta que ya tenga index.html."""
import argparse
import shutil
import sys
from pathlib import Path

MOTOR = Path(__file__).resolve().parent.parent / 'assets' / 'motor'


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('carpeta')
    ap.add_argument('--tema', default='noche')
    ap.add_argument('--titulo', default='Mi presentación')
    a = ap.parse_args()
    dest = Path(a.carpeta).expanduser().resolve()
    if (dest / 'index.html').exists():
        sys.exit(f'Ya hay un deck en {dest}: no lo piso. Elige otra carpeta.')
    dest.mkdir(parents=True, exist_ok=True)
    for nombre in ('motor.js', 'estilo.css', 'enactivos.js', 'presentador.html'):
        shutil.copy2(MOTOR / nombre, dest / nombre)
    tema = MOTOR / 'temas' / f'{a.tema}.css'
    if not tema.exists():
        tema = Path(a.tema).expanduser()
    if not tema.exists():
        sys.exit(f'No encuentro el tema «{a.tema}» (usa noche, papel o la ruta a un .css).')
    shutil.copy2(tema, dest / 'tema.css')
    html = (MOTOR / 'index.html').read_text(encoding='utf-8').replace('TITULO_DEL_DECK', a.titulo)
    (dest / 'index.html').write_text(html, encoding='utf-8')
    print(f'Deck creado: {dest / "index.html"}')


if __name__ == '__main__':
    main()
