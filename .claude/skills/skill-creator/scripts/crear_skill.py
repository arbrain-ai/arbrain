#!/usr/bin/env python3
"""Crea la carpeta de una skill nueva del dueño con su SKILL.md de plantilla. Solo biblioteca estándar.

    python3 .claude/skills/skill-creator/scripts/crear_skill.py mi-seguimiento-cobros
    python3 .claude/skills/skill-creator/scripts/crear_skill.py acme-propuestas --sin-prefijo
    python3 .claude/skills/skill-creator/scripts/crear_skill.py mi-reporte --con references,scripts

Nunca pisa una carpeta que ya existe y se niega a usar el nombre de una skill del autor (CAPAS.json): una versión
nueva de Arbrain la reemplazaría. Sin `--sin-prefijo`, el nombre debe empezar con `mi-`.
Código de salida: 0 creada, 1 no se creó (dice por qué), 2 error de uso.
"""
import argparse
import json
import re
import sys
from pathlib import Path

NOMBRE = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')
PREFIJO = 'mi-'
SUBCARPETAS = ('references', 'scripts', 'assets')

PLANTILLA = '''---
name: {nombre}
description: "TODO: qué hace en una frase y cuándo usarla. Usar ante «frase real del dueño», «otra frase» o «otra más»."
---

# {titulo}

TODO: para qué sirve en dos renglones y qué resultado deja (archivo, borrador, tabla, reporte).

## Candados

- TODO: lo que nunca debe pasar y por qué (duplicar, adivinar un dato…).
- Enviar, publicar, pagar o borrar queda en borrador hasta el «va» del dueño sobre ese texto.

## Pasos

1. TODO: de dónde salen los datos.
2. TODO: qué se hace con ellos.
3. TODO: dónde queda el resultado y qué se le dice al dueño.

## Aprendizajes

- TODO: cada error de la primera vez, en una línea, con su porqué.
'''


def raiz_arbrain(desde):
    """La carpeta que tiene `.claude/` (la copia de Arbrain del dueño)."""
    for d in [desde, *desde.parents]:
        if (d / '.claude').is_dir():
            return d
    return None


def skills_del_autor(raiz):
    try:
        capas = json.loads((raiz / 'CAPAS.json').read_text(encoding='utf-8'))
        return set(x for x in capas.get('skills_del_autor', []) if isinstance(x, str))
    except (OSError, ValueError, AttributeError):
        return set()


def titulo_de(nombre, con_prefijo):
    base = nombre[len(PREFIJO):] if con_prefijo and nombre.startswith(PREFIJO) else nombre
    return base.replace('-', ' ').capitalize()


def crear(nombre, raiz, sin_prefijo=False, con=()):
    """Devuelve (ok, mensaje, ruta)."""
    nombre = nombre.strip()
    if not NOMBRE.match(nombre):
        return False, f'«{nombre}» no sirve como nombre: usa minúsculas, números y guiones (ej. mi-seguimiento-cobros)', None
    if len(nombre) > 64:
        return False, f'el nombre mide {len(nombre)} caracteres; el máximo es 64', None
    if not sin_prefijo and not nombre.startswith(PREFIJO):
        return False, (f'las skills tuyas llevan el prefijo «{PREFIJO}» para no chocar con las de Arbrain: '
                       f'prueba «{PREFIJO}{nombre}» (o usa --sin-prefijo con el nombre de tu negocio)'), None
    if nombre in skills_del_autor(raiz):
        return False, f'«{nombre}» es una skill de Arbrain; una actualización la reemplazaría. Elige otro nombre', None
    destino = raiz / '.claude' / 'skills' / nombre
    if destino.exists():
        return False, f'ya existe {destino}; no la piso. Edítala o elige otro nombre', None
    destino.mkdir(parents=True)
    (destino / 'SKILL.md').write_text(PLANTILLA.format(nombre=nombre, titulo=titulo_de(nombre, not sin_prefijo)),
                                      encoding='utf-8', newline='\n')
    for sub in con:
        (destino / sub).mkdir()
    return True, f'Creada {destino.relative_to(raiz).as_posix()}/SKILL.md: llena cada TODO y valida.', destino


def main(argv=None):
    p = argparse.ArgumentParser(description='Crea una skill nueva del dueño.')
    p.add_argument('nombre', help='nombre de la skill, ej. mi-seguimiento-cobros')
    p.add_argument('--sin-prefijo', action='store_true', help='permite un nombre sin «mi-» (ej. el de tu negocio)')
    p.add_argument('--con', default='', help='subcarpetas a crear, separadas por coma: references,scripts,assets')
    p.add_argument('--raiz', help='carpeta de Arbrain (por defecto, la que contiene .claude/ desde aquí)')
    a = p.parse_args(argv)
    con = [s.strip() for s in a.con.split(',') if s.strip()]
    malas = [s for s in con if s not in SUBCARPETAS]
    if malas:
        print(f'subcarpetas desconocidas: {", ".join(malas)}; las válidas son {", ".join(SUBCARPETAS)}')
        return 2
    raiz = Path(a.raiz).resolve() if a.raiz else (raiz_arbrain(Path.cwd()) or raiz_arbrain(Path(__file__).resolve()))
    if raiz is None or not (raiz / '.claude').is_dir():
        print('No encontré la carpeta .claude/ de tu Arbrain. Corre esto desde tu carpeta de Arbrain.')
        return 2
    ok, mensaje, _ = crear(a.nombre, raiz, a.sin_prefijo, con)
    print(mensaje)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
