#!/usr/bin/env python3
"""Arma la presentación: junta motor, tema y láminas en un solo index.html que abre con doble clic, y escribe GUION.md.

    python3 construir.py <carpeta-del-deck> [--solo 3,4]

Fuente: piezas/NN.html (y su piezas/NN.js si tiene enactivo), tema.css, propio.css (opcional), universo.js (opcional),
deck.json (titulo, universo, minutos). Generado: index.html, presentador.html, GUION.md. Se editan las piezas, nunca
index.html."""
import argparse
import base64
import html as H
import json
import re
import shutil
import sys
from pathlib import Path


FUENTES = (('Cormorant', 'cormorant-400', '400', 'normal'), ('Cormorant', 'cormorant-700', '600 700', 'normal'),
           ('Cormorant', 'cormorant-italica', '300 700', 'italic'), ('Inter', 'inter-500', '500', 'normal'),
           ('Inter', 'inter-600', '600', 'normal'), ('Inter', 'inter-700', '700', 'normal'),
           ('Inter', 'inter-800', '800 900', 'normal'), ('Inter', 'inter-500-italica', '500', 'italic'))


def fuentes_css(carpeta: Path) -> str:
    """Las letras van dentro del archivo: se ve igual sin internet y en cualquier computadora."""
    css = []
    for familia, nombre, peso, estilo in FUENTES:
        datos = base64.b64encode((carpeta / f'{nombre}.woff2').read_bytes()).decode()
        css.append(f'@font-face{{font-family:"{familia}";src:url(data:font/woff2;base64,{datos}) format("woff2");'
                   f'font-weight:{peso};font-style:{estilo};font-display:swap}}')
    return '\n'.join(css)


def leer(p: Path) -> str:
    return p.read_text(encoding='utf-8') if p.exists() else ''


def plano(s: str) -> str:
    return H.unescape(re.sub(r'<[^>]+>', '', re.sub(r'<br\s*/?>', ' ', s))).strip()


def guion(titulo: str, piezas: list) -> str:
    g = [f'# Guion · {titulo}', '',
         '> GENERADO desde las notas de cada lámina: para cambiarlo, pídele a Levy que cambie la lámina. «[clic N]» es lo',
         '> que dices en ese clic.', '']
    for n, p in enumerate(piezas):
        h = leer(p)
        sec = re.search(r'<section[^>]*>', h)
        a = dict(re.findall(r'data-([\w-]+)="([^"]*)"', sec.group(0))) if sec else {}
        g.append(f"## {n} · {H.unescape(a.get('titulo', ''))}")
        if a.get('b'):
            g.append(f"*{H.unescape(a['b'])}*" + (f" · min {a['min']}" if a.get('min') else ''))
        g.append('')
        nota = re.search(r'<aside class="notas">(.*?)</aside>', h, re.S)
        for m in re.finditer(r'<p([^>]*)>(.*?)</p>', nota.group(1) if nota else '', re.S):
            paso = re.search(r'data-p="(\d+)"', m.group(1))
            pre = f'[clic {paso.group(1)}] ' if paso and paso.group(1) != '0' else ''
            g.append(pre + plano(m.group(2)))
            g.append('')
    return '\n'.join(g).rstrip() + '\n'


def construir(deck: Path, solo=None) -> Path:
    motor = deck / 'motor'
    if not (motor / 'plantilla.html').exists():
        sys.exit(f'{deck} no tiene motor/: corre listo.py')
    conf = json.loads(leer(deck / 'deck.json') or '{}')
    titulo = conf.get('titulo') or 'Presentación'
    piezas = sorted((deck / 'piezas').glob('[0-9]*.html'), key=lambda p: int(p.stem))
    if not piezas:
        sys.exit('No hay láminas en piezas/ (se llaman 00.html, 01.html…)')
    if solo:
        piezas = [p for p in piezas if int(p.stem) in solo]
        if not piezas:
            sys.exit('--solo no coincide con ninguna lámina')
    laminas, scripts = [], [leer(motor / 'mk.js')]
    if (deck / 'universo.js').exists():
        scripts.append(leer(deck / 'universo.js'))
    for p in piezas:
        cuerpo = leer(p)
        if 'class="lamina' not in cuerpo:
            sys.exit(f'{p.name} no tiene <section class="lamina">')
        laminas.append(f'<!-- ══ {p.name} ══ -->\n{cuerpo}')
        js = p.with_suffix('.js')
        if js.exists():
            scripts.append(f'(function(){{\n"use strict";\n{leer(js)}\n}})();')
    scripts.append(leer(motor / 'motor.js'))
    tags = '\n'.join(f'<script>\n{s}\n</script>' for s in scripts)
    salida = leer(motor / 'plantilla.html')
    # replace en orden fijo y una sola vez: el contenido de un archivo nunca se vuelve a procesar
    for marca, valor in (('{{TITULO}}', H.escape(titulo)),
                         ('{{UNIVERSO}}', H.escape(str(conf.get('universo', 'polvo')))),
                         ('{{MINUTOS}}', str(conf.get('minutos', 0) or 0)),
                         ('/*FUENTES*/', fuentes_css(motor / 'fuentes')),
                         ('/*MOTOR*/', leer(motor / 'estilo.css')),
                         ('/*TEMA*/', leer(deck / 'tema.css')),
                         ('/*PROPIO*/', leer(deck / 'propio.css')),
                         ('<!--LAMINAS-->', '\n\n'.join(laminas)),
                         ('<!--SCRIPTS-->', tags)):
        salida = salida.replace(marca, valor, 1)
    if solo:
        out = deck / '_prueba.html'
    else:
        out = deck / 'index.html'
        shutil.copy2(motor / 'presentador.html', deck / 'presentador.html')
        (deck / 'GUION.md').write_text(guion(titulo, piezas), encoding='utf-8')
    out.write_text(salida, encoding='utf-8')
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('carpeta')
    ap.add_argument('--solo')
    a = ap.parse_args()
    solo = {int(n) for n in a.solo.split(',')} if a.solo else None
    out = construir(Path(a.carpeta).expanduser().resolve(), solo)
    print(f'Armado: {out}')


if __name__ == '__main__':
    main()
