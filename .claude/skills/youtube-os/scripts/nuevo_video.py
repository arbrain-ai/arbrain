#!/usr/bin/env python3
"""Crea la carpeta de un video y emite su ESTRUCTURA.md (ficha de la pieza y lista antes de grabar).

Por qué existe: la estructura de un video tiene que aparecer justo al abrir el proyecto, no cuando alguien se
acuerda de buscarla. Un dato que hay que ir a buscar no existe.

Uso (desde la raíz del repo o desde cualquier carpeta dentro de él):
  python3 .claude/skills/youtube-os/scripts/nuevo_video.py "tema del video" [--slug mi-slug] [--prueba]
      [--raiz contenido/youtube] [--fecha AAAA-MM-DD]

Sin dependencias: solo la biblioteca estándar. Lee, si existe, la ficha del canal
(.claude/memory/project/youtube/canal.md) para tomar la carpeta de los videos y el destino de la llamada a la acción.
Nunca sobrescribe una carpeta que ya existe. Deja un .gitignore en el proyecto para que los videos (que pesan gigas)
no entren a git; guiones, miniaturas y textos sí se versionan.
"""
import argparse
import datetime
import json
import re
import sys
import unicodedata
from pathlib import Path

SUBCARPETAS = ["guion", "raw", "edicion", "miniaturas", "visuales", "publicacion", "finales"]
FICHA = Path(".claude/memory/project/youtube/canal.md")
# Los videos pesan gigas: no se versionan (un crudo en git rompe el push). Guiones, miniaturas y la ficha sí.
GITIGNORE = """# Medios pesados del video: viven en disco, no en git.
*.mp4
*.mov
*.mkv
*.m4v
*.webm
*.wav
*.aiff
*.flac
.trabajo/
"""

ESTRUCTURA = """# Preparación del video: {tema}

Emitido el {fecha}. Crear esta carpeta no significa que el dueño eligió este video: anota su elección antes de
tratarlo como compromiso.

## La pieza

- Elegido por el dueño: (fecha y sus palabras)
- Formato: (demostración / opinión / dolor / caso)
- Pregunta del espectador:
- Promesa del título y cuándo se paga (antes del minuto 3):
- Prueba que se va a mostrar:
- Mapa de los 8 tiempos: guion/guion.md
- Llamada a la acción: {cta}
- Regalo (si lo hay) y dónde vive: {regalos}
- Cierre: la lección y el puente a otro video
- Duración objetivo:

## Antes de grabar

- [ ] El dueño eligió este video (no es solo una propuesta).
- [ ] Guion revisado por él; los [DATO: …] llenos o quitados.
- [ ] La demo está ensayada y funciona hoy.
- [ ] El destino de la llamada abre; el regalo existe y abre.
- [ ] Nada privado a la vista en pantalla: notificaciones apagadas, sin correos, llaves ni datos de clientes.
- [ ] Prueba de 10 segundos: la cámara manda imagen, el micrófono suena limpio y la pantalla se graba aparte
      (edicion-de-video, references/grabacion.md).

## Después de grabar

El material va a raw/. El corte y el export siguen edicion-de-video. Antes de publicar, título, miniatura y
descripción se validan contra el corte final (youtube-os, references/publicar.md).
"""


def raiz_repo(desde: Path) -> Path:
    for p in [desde, *desde.parents]:
        if (p / ".git").exists() or (p / ".claude").is_dir():
            return p
    return desde


def slugificar(texto: str) -> str:
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", t)).strip("-")[:60] or "video"


def leer_ficha(repo: Path) -> dict:
    """Saca de la ficha del canal los campos que usa la estructura. Campos ausentes quedan vacíos."""
    ruta = repo / FICHA
    if not ruta.is_file():
        return {}
    datos = {}
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^- ([^:]+):\s*(.*)$", linea.strip())
        if m and m.group(2).strip() and not m.group(2).strip().startswith("("):  # «(…)» = hueco de la plantilla
            datos[m.group(1).strip().lower()] = m.group(2).strip()
    return datos


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Crea la carpeta de un video con su ESTRUCTURA.md")
    ap.add_argument("tema")
    ap.add_argument("--slug")
    ap.add_argument("--prueba", action="store_true", help="experimento que no se publica (va a pruebas/)")
    ap.add_argument("--raiz", help="carpeta de los videos, con proyectos/ y pruebas/ adentro (por defecto, la de la ficha o contenido/youtube)")
    ap.add_argument("--fecha", help="fecha del slug, AAAA-MM-DD (por defecto, hoy)")
    a = ap.parse_args(argv)

    repo = raiz_repo(Path.cwd().resolve())
    ficha = leer_ficha(repo)
    fecha = a.fecha or datetime.date.today().isoformat()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha):
        print("✗ --fecha debe ser AAAA-MM-DD", file=sys.stderr)
        return 2

    # La carpeta de los videos contiene proyectos/ y pruebas/ (campo «Carpeta de los videos» de la ficha).
    raiz = a.raiz or ficha.get("carpeta de los videos") or "contenido/youtube"
    raiz = raiz.strip().strip("`").rstrip("/")
    if raiz.endswith("/proyectos") or raiz == "proyectos":  # tolera que la ficha apunte a la carpeta de proyectos
        raiz = str(Path(raiz).parent)
    base = (repo / raiz).resolve()
    if repo not in [base, *base.parents]:
        print(f"✗ la raíz {raiz} queda fuera del repo", file=sys.stderr)
        return 2

    nombre = f"{fecha}-{a.slug or slugificar(a.tema)}"
    proyecto = base / ("pruebas" if a.prueba else "proyectos") / nombre
    if proyecto.exists():
        print(f"✗ ya existe {proyecto}", file=sys.stderr)
        return 1
    for sub in SUBCARPETAS:
        (proyecto / sub).mkdir(parents=True, exist_ok=True)

    cta = ficha.get("destino de la llamada a la acción") or "(falta en la ficha del canal: pregúntalo una vez)"
    regalos = ficha.get("dónde viven los regalos") or "(falta en la ficha del canal)"
    (proyecto / "ESTRUCTURA.md").write_text(
        ESTRUCTURA.format(tema=a.tema, fecha=fecha, cta=cta, regalos=regalos), encoding="utf-8")
    (proyecto / ".gitignore").write_text(GITIGNORE, encoding="utf-8")
    (proyecto / "proyecto.json").write_text(json.dumps(
        {"slug": nombre, "tema": a.tema, "creado": fecha, "prueba": a.prueba, "elegido_por_el_dueno": None},
        ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"✓ {proyecto.relative_to(repo)}")
    print(f"  · {len(SUBCARPETAS)} subcarpetas, ESTRUCTURA.md y .gitignore (los videos no entran a git)")
    if not ficha:
        print("  · sin ficha del canal: créala con youtube-os/references/canal.md")
    print(f"  Léela antes de grabar: {(proyecto / 'ESTRUCTURA.md').relative_to(repo)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
