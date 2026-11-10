#!/usr/bin/env python3
"""Le abre la presentación a su dueño en el navegador (Chrome si lo tiene). python3 abrir.py <carpeta-del-deck>"""
import os
import platform
import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path


def abrir(deck: Path) -> bool:
    index = deck / 'index.html'
    if os.environ.get('ARBRAIN_SIN_ABRIR'):  # pruebas automáticas: no abre ventanas
        print(f'ABIERTA (simulado): {index}')
        return True
    sistema = platform.system()
    try:
        if sistema == 'Darwin':
            chrome = Path('/Applications/Google Chrome.app').exists()
            r = subprocess.run(['open', '-a', 'Google Chrome', str(index)] if chrome else ['open', str(index)], check=False, capture_output=True)
            if r.returncode != 0:
                raise OSError(r.stderr.decode(errors='replace')[:200])
        elif sistema == 'Windows':
            os.startfile(str(index))  # navegador predeterminado
        else:
            exe = shutil.which('google-chrome') or shutil.which('chromium')
            if exe:
                subprocess.Popen([exe, index.as_uri()], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            elif not webbrowser.open(index.as_uri()):
                raise OSError('sin navegador')
    except OSError as e:
        print(f'NO_ABIERTA: {index} ({e})')
        return False
    print(f'ABIERTA: {index}')
    return True


def main():
    if len(sys.argv) < 2:
        sys.exit('Uso: python3 abrir.py <carpeta-del-deck>')
    deck = Path(sys.argv[1]).expanduser().resolve()
    if not (deck / 'index.html').exists():
        sys.exit(f'No hay index.html en {deck}')
    sys.exit(0 if abrir(deck) else 1)


if __name__ == '__main__':
    main()
