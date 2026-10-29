#!/usr/bin/env python3
"""Valida una skill (o todas) sin dependencias: solo la biblioteca estándar de Python.

    python3 .claude/skills/skill-creator/scripts/quick_validate.py .claude/skills/mi-seguimiento-cobros
    python3 .claude/skills/skill-creator/scripts/quick_validate.py --todas

Revisa: que exista SKILL.md con encabezado entre `---`, que `name` y `description` estén, que `name` coincida con la
carpeta y sea kebab-case de máximo 64, que la descripción mida hasta 1024 y no lleve `<` ni `>`, y que existan los
archivos de references/, scripts/ y assets/ que el texto menciona (esto último, como aviso).
Código de salida: 0 lista (puede haber avisos), 1 hay errores, 2 error de uso.
"""
import argparse
import re
import sys
from pathlib import Path

CAMPOS_CONOCIDOS = {'name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility', 'model',
                    'argument-hint', 'disable-model-invocation', 'user-invocable', 'when_to_use', 'version'}
NOMBRE = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')
RENGLONES_MAX = 500
RUTA_INTERNA = re.compile(r'(?<![\w./-])((?:references|scripts|assets)/[\w./-]*\w)')


def _limpiar(valor):
    valor = valor.strip()
    if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in '"\'':
        cuerpo = valor[1:-1]
        return cuerpo.replace('\\"', '"') if valor[0] == '"' else cuerpo.replace("''", "'")
    return valor


def leer_encabezado(texto):
    """Devuelve (campos, renglón donde cierra) o lanza ValueError con el problema en español.

    Lee el subconjunto de YAML que usan las skills: `clave: valor`, valores entre comillas, bloques `>` o `|`
    y claves anidadas (se guardan como texto, no se interpretan).
    """
    texto = texto.lstrip('﻿').replace('\r\n', '\n')
    renglones = texto.split('\n')
    if not renglones or renglones[0].strip() != '---':
        raise ValueError('SKILL.md debe empezar con un encabezado entre renglones «---»')
    fin = next((i for i in range(1, len(renglones)) if renglones[i].strip() == '---'), None)
    if fin is None:
        raise ValueError('el encabezado no cierra: falta el segundo renglón «---»')
    campos, clave, bloque = {}, None, None
    for r in renglones[1:fin]:
        if not r.strip() or r.lstrip().startswith('#'):
            if bloque is not None:
                bloque.append('')
            continue
        if r[0] in ' \t':
            if clave is None:
                raise ValueError(f'renglón con sangría sin clave arriba: «{r.strip()}»')
            if bloque is not None:
                bloque.append(r.strip())
            continue
        m = re.match(r'^([A-Za-z0-9_-]+):(.*)$', r)
        if not m:
            raise ValueError(f'renglón del encabezado sin forma «clave: valor»: «{r.strip()}»')
        if bloque is not None and clave:
            campos[clave] = ' '.join(x for x in bloque if x).strip()
        clave, valor = m.group(1), m.group(2).strip()
        if clave in campos:
            raise ValueError(f'«{clave}» aparece dos veces en el encabezado')
        bloque = None
        if valor in ('>', '|', '>-', '|-', '>+', '|+'):
            bloque = []
            campos[clave] = ''
        elif valor == '':
            campos[clave] = {}  # mapa anidado (metadata) o lista
        else:
            if valor[0] in '"\'' and (len(valor) < 2 or valor[-1] != valor[0]):
                raise ValueError(f'las comillas de «{clave}» no cierran en el mismo renglón')
            if valor[0] not in '"\'' and ': ' in valor:
                raise ValueError(f'«{clave}» lleva «: » sin comillas; enciérralo entre comillas dobles')
            campos[clave] = _limpiar(valor)
    if bloque is not None and clave:
        campos[clave] = ' '.join(x for x in bloque if x).strip()
    return campos, fin


def validar(carpeta):
    """Devuelve (errores, avisos) de la skill en `carpeta`."""
    carpeta = Path(carpeta).resolve()
    errores, avisos = [], []
    if not carpeta.is_dir():
        return [f'no existe la carpeta {carpeta}'], avisos
    skill = carpeta / 'SKILL.md'
    if not skill.is_file():
        return ['falta SKILL.md en la carpeta'], avisos
    try:
        texto = skill.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        return ['SKILL.md no está en UTF-8'], avisos
    try:
        campos, fin = leer_encabezado(texto)
    except ValueError as e:
        return [str(e)], avisos

    nombre = campos.get('name')
    if not isinstance(nombre, str) or not nombre.strip():
        errores.append('falta «name» en el encabezado')
    else:
        nombre = nombre.strip()
        if not NOMBRE.match(nombre):
            errores.append(f'«name: {nombre}» debe ir en minúsculas, números y guiones, sin guion al inicio, al final ni doble')
        if len(nombre) > 64:
            errores.append(f'«name» mide {len(nombre)} caracteres; el máximo es 64')
        if nombre != carpeta.name:
            errores.append(f'«name: {nombre}» no coincide con la carpeta «{carpeta.name}»; deben ser iguales')

    desc = campos.get('description')
    if not isinstance(desc, str) or not desc.strip():
        errores.append('falta «description» en el encabezado')
    else:
        desc = desc.strip()
        if len(desc) > 1024:
            errores.append(f'la descripción mide {len(desc)} caracteres; el máximo es 1024')
        if '<' in desc or '>' in desc:
            errores.append('la descripción no puede llevar «<» ni «>»')
        if len(desc) < 60:
            avisos.append('la descripción es muy corta: di qué hace, cuándo usarla y con qué frases se pide')

    extra = sorted(set(campos) - CAMPOS_CONOCIDOS)
    if extra:
        avisos.append(f'campos que Claude no usa en el encabezado: {", ".join(extra)} (muévelos a «metadata»)')

    cuerpo = texto.replace('\r\n', '\n').split('\n')[fin + 1:]
    if not any(r.strip() for r in cuerpo):
        errores.append('SKILL.md no tiene instrucciones debajo del encabezado')
    elif len(cuerpo) > RENGLONES_MAX:
        avisos.append(f'SKILL.md tiene {len(cuerpo)} renglones; pasa lo largo a references/ (ideal: menos de {RENGLONES_MAX})')

    faltan = sorted({r.rstrip('.') for r in RUTA_INTERNA.findall('\n'.join(cuerpo))
                     if '*' not in r and not (carpeta / r.rstrip('.')).exists()})
    for r in faltan:
        avisos.append(f'el texto menciona «{r}» y no existe dentro de la skill (si es de otra skill, ignóralo)')

    for sub in ('references', 'scripts', 'assets'):
        d = carpeta / sub
        if d.is_dir() and not any(p for p in d.iterdir() if p.name != '.gitkeep'):
            avisos.append(f'{sub}/ está vacía: bórrala o llénala')
    return errores, avisos


def raiz_skills(desde):
    for d in [desde, *desde.parents]:
        if (d / '.claude' / 'skills').is_dir():
            return d / '.claude' / 'skills'
    return None


def main(argv=None):
    p = argparse.ArgumentParser(description='Valida una skill de Arbrain.')
    p.add_argument('carpeta', nargs='?', help='carpeta de la skill (la que tiene SKILL.md)')
    p.add_argument('--todas', action='store_true', help='valida todas las skills de .claude/skills/')
    a = p.parse_args(argv)
    if a.todas:
        raiz = raiz_skills(Path.cwd()) or raiz_skills(Path(__file__).resolve())
        if raiz is None:
            print('No encontré .claude/skills/ desde esta carpeta.')
            return 2
        carpetas = sorted(d for d in raiz.iterdir() if d.is_dir() and not d.name.startswith('.'))
    elif a.carpeta:
        carpetas = [Path(a.carpeta)]
    else:
        p.print_usage()
        return 2
    con_error = 0
    for c in carpetas:
        errores, avisos = validar(c)
        estado = 'ERROR' if errores else 'OK'
        print(f'{estado}  {c.name}')
        for e in errores:
            print(f'   - {e}')
        for v in avisos:
            print(f'   aviso: {v}')
        con_error += bool(errores)
    if len(carpetas) > 1:
        print(f'\n{len(carpetas) - con_error} de {len(carpetas)} skills sin errores.')
    elif not con_error:
        print('La skill está lista.')
    return 1 if con_error else 0


if __name__ == '__main__':
    sys.exit(main())
