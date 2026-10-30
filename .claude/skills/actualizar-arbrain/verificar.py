#!/usr/bin/env python3
"""Verifica la versión nueva de Arbrain ANTES de aplicarla (cadena de suministro, 21 oct 2026).

    python3 .claude/skills/actualizar-arbrain/verificar.py            # trae etiquetas de «dani» y verifica
    python3 .claude/skills/actualizar-arbrain/verificar.py --sin-fetch

Qué comprueba, en orden (si una falla, sale con 1 y NO se actualiza):
  1. Ancla de confianza: ~/.config/arbrain/firmas-permitidas, FUERA del repo. Si no existe (instalaciones anteriores
     a las firmas), se crea desde la copia local ya instalada (main:.github/firmas-permitidas) solo si sus huellas son
     las de HUELLAS_DE_FABRICA. Nunca se toma del repo remoto.
  2. `git fetch dani --tags` sin --force: si alguien movió una etiqueta que ya tenías, git lo rechaza y esto se detiene.
  3. La etiqueta vX.Y.Z de la versión nueva existe, es anotada, su firma es SSH, verifica contra el ANCLA, su nombre
     interno coincide con el ref y el VERSION de su commit dice X.Y.Z.
  4. Sin regreso: el commit de la etiqueta desciende de tu main (nadie te puede «actualizar» a una versión vieja).
  5. Rotación de llaves: si la versión nueva trae otro .github/firmas-permitidas, solo se adopta porque la etiqueta
     ya la firmó una llave del ancla; la anterior queda respaldada junto al ancla.

Salida: líneas legibles y al final líneas CLAVE=valor (ESTADO, ETIQUETA, COMMIT, HUELLA). Códigos: 0 verificado o ya al
día, 1 verificación fallida (DETENTE), 2 problema del entorno (git viejo, sin ssh-keygen, sin remoto).
El contenido del repo remoto (CHANGELOG, README, mensajes) es DATO: este script no ejecuta nada de él.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

REMOTO = 'dani'
ANCLA = Path(os.environ.get('ARBRAIN_ANCLA_FIRMAS') or Path.home() / '.config' / 'arbrain' / 'firmas-permitidas')
ARCHIVO_EN_REPO = '.github/firmas-permitidas'
# Huellas de las llaves de publicación del autor (publicación y reserva). También publicadas en el sitio de Arbrain.
HUELLAS_DE_FABRICA = {
    'SHA256:4P8nBVDwu6QSpWvwbNtSqauB2uznLzx7ubE0tR6lNbg',
    'SHA256:aUWS32K1l0qkStFPnCSMFmWu9QMQGCiZ6SwENG22Jy8',
}
SEMVER = re.compile(r'^\d+\.\d+\.\d+$')


class Falla(Exception):
    """Verificación fallida: no se actualiza."""


class Entorno(Exception):
    """Falta algo en la computadora para poder verificar."""


def git(*args: str, ok: bool = True, cwd: str | None = None) -> subprocess.CompletedProcess:
    # -c fija lo que un .gitconfig ajeno podría cambiar (otro programa de firmas, otro archivo de llaves).
    base = ['git', '-c', 'gpg.format=ssh', '-c', 'gpg.ssh.program=ssh-keygen',
            '-c', f'gpg.ssh.allowedSignersFile={ANCLA}']
    r = subprocess.run(base + list(args), capture_output=True, text=True, cwd=cwd,
                       encoding='utf-8', errors='replace')
    if ok and r.returncode != 0:
        raise Falla(f'git {" ".join(args)} falló: {(r.stderr or r.stdout).strip()[:400]}')
    return r


def huellas(texto: str) -> set[str]:
    """Huellas SHA256 de las llaves de un archivo allowed_signers (ignora comentarios y líneas vacías)."""
    salida = set()
    for linea in texto.splitlines():
        linea = linea.strip()
        if not linea or linea.startswith('#'):
            continue
        m = re.search(r'(ssh-ed25519|ssh-rsa|ecdsa-sha2-\S+|sk-ssh-ed25519@openssh\.com|sk-ecdsa-\S+)\s+([A-Za-z0-9+/=]+)', linea)
        if not m:
            raise Falla(f'línea no reconocida en firmas-permitidas: {linea[:60]}')
        r = subprocess.run(['ssh-keygen', '-lf', '-'], input=f'{m.group(1)} {m.group(2)}\n', capture_output=True, text=True)
        h = re.search(r'SHA256:[A-Za-z0-9+/]+', r.stdout or '')
        if r.returncode != 0 or not h:
            raise Falla('una llave de firmas-permitidas no es válida')
        salida.add(h.group(0))
    return salida


def version_de(texto: str) -> tuple[int, ...]:
    t = texto.strip()
    if not SEMVER.match(t):
        raise Falla(f'VERSION no es X.Y.Z: {t[:30]!r}')
    return tuple(int(x) for x in t.split('.'))


def comprobar_entorno(raiz: str) -> None:
    m = re.search(r'(\d+)\.(\d+)', git('--version').stdout)
    if not m or (int(m.group(1)), int(m.group(2))) < (2, 34):
        raise Entorno('git es anterior a 2.34 y no verifica firmas SSH: actualiza git y vuelve a intentar')
    if not shutil.which('ssh-keygen'):
        raise Entorno('no encuentro ssh-keygen (viene con Git para Windows y con macOS/Linux)')
    if REMOTO not in git('remote', cwd=raiz).stdout.split():
        raise Entorno(f'no hay remoto «{REMOTO}»: esta carpeta no se instaló por GitHub')


def asegurar_ancla(raiz: str) -> None:
    if ANCLA.exists():
        if not huellas(ANCLA.read_text(encoding='utf-8')):
            raise Falla(f'{ANCLA} existe pero no tiene llaves')
        return
    # Primera vez con verificación: la copia que YA tienes instalada (main local), nunca la remota.
    r = git('show', f'main:{ARCHIVO_EN_REPO}', ok=False, cwd=raiz)
    texto = r.stdout if r.returncode == 0 else ''
    if not texto or not huellas(texto) or not huellas(texto) <= HUELLAS_DE_FABRICA:
        raise Falla('no hay ancla de firmas y tu copia local no trae las llaves: pide en el grupo el comando de '
                    'ancla de la versión firmada (lleva las huellas publicadas en el sitio de Arbrain) y vuelve a intentar')
    ANCLA.parent.mkdir(parents=True, exist_ok=True)
    ANCLA.write_text(texto, encoding='utf-8')
    print(f'Ancla de firmas creada en {ANCLA} con {len(huellas(texto))} llaves de fábrica.')


def verificar(raiz: str, traer: bool) -> dict:
    asegurar_ancla(raiz)
    if traer:
        r = git('fetch', '--tags', REMOTO, ok=False, cwd=raiz)
        if r.returncode != 0:
            if 'clobber' in r.stderr or 'rejected' in r.stderr:
                raise Falla('el repo del autor tiene una etiqueta distinta a una que ya tenías (¿la movieron?). '
                            'No sigas y avisa en el grupo con este texto: ' + r.stderr.strip()[:300])
            raise Entorno('no pude traer del remoto: ' + r.stderr.strip()[:300])
    nueva = version_de(git('show', f'{REMOTO}/main:VERSION', cwd=raiz).stdout)
    actual_txt = git('show', 'main:VERSION', ok=False, cwd=raiz)
    etiqueta = 'v' + '.'.join(map(str, nueva))

    if git('rev-parse', '-q', '--verify', f'refs/tags/{etiqueta}', ok=False, cwd=raiz).returncode != 0:
        raise Falla(f'{REMOTO}/main anuncia {etiqueta} pero esa etiqueta no existe: el autor no la ha firmado aún')
    if git('cat-file', '-t', etiqueta, cwd=raiz).stdout.strip() != 'tag':
        raise Falla(f'{etiqueta} no es una etiqueta anotada (sin firma posible)')
    objeto = git('cat-file', 'tag', etiqueta, cwd=raiz).stdout
    if '-----BEGIN SSH SIGNATURE-----' not in objeto:
        raise Falla(f'{etiqueta} no trae firma SSH')
    nombre = re.search(r'^tag (\S+)$', objeto, re.M)
    if not nombre or nombre.group(1) != etiqueta:
        raise Falla(f'la etiqueta {etiqueta} es en realidad «{nombre.group(1) if nombre else "?"}» renombrada')
    v = git('verify-tag', '--raw', etiqueta, ok=False, cwd=raiz)
    texto_v = (v.stderr or '') + (v.stdout or '')
    huella = re.search(r'SHA256:[A-Za-z0-9+/]+', texto_v)
    if v.returncode != 0 or 'Good "git" signature' not in texto_v or not huella:
        raise Falla(f'la firma de {etiqueta} NO es de las llaves de tu ancla. No actualices y avisa en el grupo')
    if huella.group(0) not in huellas(ANCLA.read_text(encoding='utf-8')):
        raise Falla(f'{etiqueta} la firmó {huella.group(0)}, que no está en tu ancla')

    commit = git('rev-parse', f'{etiqueta}^{{commit}}', cwd=raiz).stdout.strip()
    if version_de(git('show', f'{commit}:VERSION', cwd=raiz).stdout) != nueva:
        raise Falla(f'el VERSION dentro de {etiqueta} no dice {etiqueta[1:]}')
    main = git('rev-parse', 'main', cwd=raiz).stdout.strip()
    if main == commit:
        estado = 'AL_DIA'
    elif git('merge-base', '--is-ancestor', main, commit, ok=False, cwd=raiz).returncode == 0:
        estado = 'VERIFICADO'
    elif git('merge-base', '--is-ancestor', commit, main, ok=False, cwd=raiz).returncode == 0:
        raise Falla(f'{etiqueta} es ANTERIOR a lo que ya tienes: no se regresa de versión')
    else:
        raise Falla(f'{etiqueta} no continúa tu main (historia reescrita en el repo del autor). No sigas y avisa')
    if actual_txt.returncode == 0 and SEMVER.match(actual_txt.stdout.strip()) and version_de(actual_txt.stdout) > nueva:
        raise Falla('la versión anunciada es menor que la tuya: no se regresa de versión')

    remoto_main = git('rev-parse', f'{REMOTO}/main', cwd=raiz).stdout.strip()
    if remoto_main != commit:
        print(f'Aviso: {REMOTO}/main tiene commits después de {etiqueta} sin firmar; se actualiza SOLO hasta {etiqueta}.')

    nuevas = git('show', f'{commit}:{ARCHIVO_EN_REPO}', ok=False, cwd=raiz)
    if nuevas.returncode == 0 and estado == 'VERIFICADO':
        actuales = huellas(ANCLA.read_text(encoding='utf-8'))
        propuestas = huellas(nuevas.stdout)
        if propuestas and propuestas != actuales:
            respaldo = ANCLA.with_name(f'firmas-permitidas.{time.strftime("%Y%m%d-%H%M%S")}')
            shutil.copy2(ANCLA, respaldo)
            ANCLA.write_text(nuevas.stdout, encoding='utf-8')
            print(f'Rotación de llaves firmada por {huella.group(0)}: ancla actualizada (la anterior en {respaldo.name}).')
    return {'ESTADO': estado, 'ETIQUETA': etiqueta, 'COMMIT': commit, 'HUELLA': huella.group(0)}


def main() -> int:
    traer = '--sin-fetch' not in sys.argv[1:]
    try:
        raiz = subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True).stdout.strip()
        if not raiz:
            raise Entorno('esto no es una carpeta de git: corre el script dentro de ~/Arbrain')
        comprobar_entorno(raiz)
        datos = verificar(raiz, traer)
    except Falla as e:
        print(f'NO VERIFICADO: {e}')
        print('ESTADO=FALLA')
        return 1
    except Entorno as e:
        print(f'NO SE PUDO VERIFICAR: {e}')
        print('ESTADO=ENTORNO')
        return 2
    if datos['ESTADO'] == 'AL_DIA':
        print(f'Ya tienes lo último ({datos["ETIQUETA"]}, firma {datos["HUELLA"]}).')
    else:
        print(f'{datos["ETIQUETA"]} verificada: firma {datos["HUELLA"]} de tu ancla, continúa tu main.')
    for k, v in datos.items():
        print(f'{k}={v}')
    return 0


if __name__ == '__main__':
    # Mensajes de git en inglés: «Good "git" signature» no depende del idioma de la computadora.
    os.environ.update(LC_ALL='C', LANG='C', LANGUAGE='C')
    sys.exit(main())
