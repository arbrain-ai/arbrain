"""Utilidades compartidas de la skill edicion-por-voz.

Solo biblioteca estandar de Python 3 + Pillow + ffmpeg/ffprobe en el PATH.
Funciona en macOS, Linux y Windows: pathlib, subprocess con listas, sin bash.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


# ---------------------------------------------------------------- consola
def configurar_consola() -> None:
    """Salida UTF-8 tambien en la consola de Windows."""
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except Exception:
            pass


configurar_consola()


def salir(mensaje: str, codigo: int = 1) -> "NoReturn":  # type: ignore[name-defined]
    print(mensaje, file=sys.stderr)
    raise SystemExit(codigo)


# ---------------------------------------------------------------- ffmpeg
def exe(nombre: str) -> str:
    ruta = shutil.which(nombre)
    if not ruta:
        salir(
            f"No encuentro '{nombre}' en el PATH. Instala ffmpeg (macOS: brew install ffmpeg; "
            "Windows: winget install Gyan.FFmpeg; Linux: apt install ffmpeg) y vuelve a intentar."
        )
    return ruta


def correr(args: list[str], *, capturar: bool = True, entrada: bytes | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        [str(a) for a in args],
        input=entrada,
        stdout=subprocess.PIPE if capturar else None,
        stderr=subprocess.PIPE if capturar else None,
    )


def ffmpeg(args: list[str], *, mensaje: str = "ffmpeg fallo") -> subprocess.CompletedProcess:
    r = correr([exe("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", *args])
    if r.returncode != 0:
        salir(f"{mensaje}:\n{r.stderr.decode('utf-8', 'replace')[-2500:]}")
    return r


def sondear(ruta: str | Path) -> dict:
    """Devuelve duracion, ancho, alto, fps, tiene_audio de un archivo de video/audio."""
    r = correr([exe("ffprobe"), "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(ruta)])
    if r.returncode != 0:
        salir(f"ffprobe no pudo leer {ruta}: {r.stderr.decode('utf-8', 'replace')[-500:]}")
    datos = json.loads(r.stdout.decode("utf-8"))
    info = {"duracion": float(datos.get("format", {}).get("duration") or 0), "ancho": 0, "alto": 0,
            "fps": 0.0, "tiene_audio": False, "tiene_video": False}
    for s in datos.get("streams", []):
        if s.get("codec_type") == "video" and not info["tiene_video"] and s.get("codec_name") not in ("png", "mjpeg"):
            info["tiene_video"] = True
            info["ancho"], info["alto"] = int(s.get("width", 0)), int(s.get("height", 0))
            try:
                n, d = s.get("avg_frame_rate", "0/1").split("/")
                info["fps"] = round(float(n) / float(d), 3) if float(d) else 0.0
            except Exception:
                pass
            rot = (s.get("tags") or {}).get("rotate")
            if rot in ("90", "270"):
                info["ancho"], info["alto"] = info["alto"], info["ancho"]
        if s.get("codec_type") == "audio":
            info["tiene_audio"] = True
    return info


# ---------------------------------------------------------------- tiempo
def fmt_tiempo(t: float) -> str:
    t = max(0.0, float(t))
    m, s = divmod(t, 60)
    h, m = divmod(int(m), 60)
    return f"{h}:{m:02d}:{s:04.1f}" if h else f"{m}:{s:04.1f}"


def parse_tiempo(txt: str | float | int) -> float:
    """Acepta segundos (130.4), '2:10', '1:02:10' o '130,4'."""
    if isinstance(txt, (int, float)):
        return float(txt)
    txt = str(txt).strip().replace(",", ".")
    if ":" in txt:
        total = 0.0
        for parte in txt.split(":"):
            total = total * 60 + float(parte)
        return total
    return float(txt)


# ---------------------------------------------------------------- json
def leer_json(ruta: str | Path):
    return json.loads(Path(ruta).read_text(encoding="utf-8"))


def escribir_json(ruta: str | Path, datos) -> Path:
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return ruta


# ---------------------------------------------------------------- .env y ficha
def casa_cerebro() -> Path:
    """Carpeta de configuracion del dueño: CEREBRO_HOME o ~/.cerebro."""
    return Path(os.environ.get("CEREBRO_HOME") or (Path.home() / ".cerebro"))


def leer_dotenv(ruta: Path) -> dict[str, str]:
    salida: dict[str, str] = {}
    if not ruta.is_file():
        return salida
    for linea in ruta.read_text(encoding="utf-8", errors="replace").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        k, v = linea.split("=", 1)
        k = k.replace("export ", "").strip()
        salida[k] = v.strip().strip('"').strip("'")
    return salida


def variable(nombre: str, proyecto: Path | None = None) -> str | None:
    """Busca una variable: entorno > .env del proyecto > ~/.cerebro/.env. Nunca la imprime."""
    if os.environ.get(nombre):
        return os.environ[nombre]
    for envf in ([proyecto / ".env"] if proyecto else []) + [casa_cerebro() / ".env"]:
        v = leer_dotenv(envf).get(nombre)
        if v:
            return v
    return None


# ---------------------------------------------------------------- proyecto
def raiz_proyecto(ruta: str | Path) -> Path:
    return Path(ruta).expanduser().resolve()


def carpeta_versiones(proyecto: Path) -> Path:
    return proyecto / "versiones"


def resolver_fuente(ed: dict, proyecto: Path) -> Path:
    f = Path(ed["fuente"]).expanduser()
    if not f.is_absolute():
        f = proyecto / f
    return f


# ---------------------------------------------------------------- tipografia
CANDIDATAS_NEGRITA = [
    # macOS
    "/System/Library/Fonts/HelveticaNeue.ttc", "/System/Library/Fonts/Avenir Next.ttc",
    "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial Unicode.ttf",
    # Windows
    "C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/calibrib.ttf",
    # Linux
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
]


def cargar_fuente(preferida: str | None, tam: int):
    """Carga una fuente TrueType en negrita. 'preferida' puede ser ruta o nombre de archivo."""
    from PIL import ImageFont

    intentos: list[str] = []
    if preferida:
        intentos.append(preferida)
    intentos += CANDIDATAS_NEGRITA
    for cand in intentos:
        try:
            if cand.lower().endswith(".ttc"):
                # En una coleccion buscamos la cara en negrita.
                mejor = None
                for i in range(0, 14):
                    try:
                        f = ImageFont.truetype(cand, tam, index=i)
                    except Exception:
                        break
                    estilo = (f.getname()[1] or "").lower()
                    if estilo in ("bold", "negrita", "heavy", "demi bold", "semibold"):
                        return f
                    if mejor is None:
                        mejor = f
                if mejor is not None:
                    return mejor
            else:
                return ImageFont.truetype(cand, tam)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size=tam)  # Pillow >= 10.1
    except Exception:
        return ImageFont.load_default()


def hex_a_rgb(h: str, defecto=(255, 255, 255)) -> tuple[int, int, int]:
    h = (h or "").lstrip("#")
    if re.fullmatch(r"[0-9a-fA-F]{6}", h):
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return defecto


# ---------------------------------------------------------------- texto
def normalizar(txt: str) -> str:
    import unicodedata

    txt = unicodedata.normalize("NFD", txt.lower())
    txt = "".join(c for c in txt if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9ñ ]+", " ", txt).strip()
