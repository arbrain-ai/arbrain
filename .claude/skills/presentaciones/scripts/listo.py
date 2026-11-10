#!/usr/bin/env python3
"""Termina la presentación: la arma, la revisa clic por clic y, si deck.json dice "entregar": true, se la abre a su dueño.

    python3 .claude/skills/presentaciones/scripts/listo.py [carpeta]

Sin carpeta toma la presentación en la que se trabajó al último dentro de mi-negocio/presentaciones/. Es el ÚNICO comando
de la skill y siempre se corre igual, para que a su dueño le baste un solo permiso («Permitir siempre»).
Pone lo que falte de la carpeta (motor y tema). Cada presentación se queda con su motor: mejorar la skill no cambia las viejas.
Sale 0 si está bien, 1 si hay algo que arreglar y 2 si no se pudo revisar en esta computadora."""
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from abrir import abrir  # noqa: E402
from verificar import verificar  # noqa: E402

SKILL = Path(__file__).resolve().parent.parent
RAIZ = SKILL.parent.parent.parent
MOTOR = SKILL / 'assets' / 'motor'
PIEZAS_MOTOR = ('motor.js', 'mk.js', 'estilo.css', 'plantilla.html', 'presentador.html')


def reciente(d: Path) -> float:
    return max([d.joinpath('deck.json').stat().st_mtime] + [p.stat().st_mtime for p in d.glob('piezas/*')])


def ultima() -> Path:
    base = RAIZ / 'mi-negocio' / 'presentaciones'
    decks = [p.parent for p in base.glob('*/deck.json')]
    if not decks:
        sys.exit(f'No encontré ninguna presentación en {base}: crea su carpeta con deck.json y piezas/00.html.')
    return max(decks, key=reciente)


def preparar(deck: Path, conf: dict) -> None:
    motor = deck / 'motor'
    if not (motor / 'plantilla.html').exists():
        motor.mkdir(parents=True, exist_ok=True)
        for nombre in PIEZAS_MOTOR:
            shutil.copy2(MOTOR / nombre, motor / nombre)
        shutil.copytree(MOTOR / 'fuentes', motor / 'fuentes', dirs_exist_ok=True)
    if not (deck / 'tema.css').exists():
        tema = MOTOR / 'temas' / f"{conf.get('tema', 'noche')}.css"
        if not tema.exists():
            sys.exit(f"No existe el tema «{conf.get('tema')}»: usa noche o papel, o escribe tema.css en la carpeta.")
        shutil.copy2(tema, deck / 'tema.css')


def main():
    deck = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else ultima()
    if not (deck / 'deck.json').exists():
        sys.exit(f'{deck} no tiene deck.json')
    conf = json.loads((deck / 'deck.json').read_text(encoding='utf-8'))
    preparar(deck, conf)
    print(f'Presentación: {deck}')
    res = verificar(deck)
    if res != 1 and conf.get('entregar'):
        if abrir(deck):
            conf['entregar'] = False
            (deck / 'deck.json').write_text(json.dumps(conf, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    sys.exit(res)


if __name__ == '__main__':
    main()
