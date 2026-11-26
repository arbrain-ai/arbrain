#!/usr/bin/env python3
"""Lienzo vivo: la base de cualquier lienzo con CAPÍTULOS a la derecha (cámara, encuadres, recorrido) y piezas vivas.

Estándar: `.claude/skills/canvas/references/capitulos.md`. La primera skill que lo usa es `mapa-vivo`; sirve igual para
un panel, una clase, un mapa de proceso o cualquier lienzo que se vaya a recorrer.

Como biblioteca (desde el script de otra skill):

    sys.path.insert(0, ".claude/skills/canvas/scripts"); import lienzo_vivo as LV
    P = LV.Pagina("Mi mapa")
    c = P.capitulo("norte", "Mi norte", col=0, fila=0, tema="Mi norte", ceja="1 · a dónde voy", tesis="…")
    P.pieza("ondas", c.x0, c.y, c.ancho, "doc:<ruta>/ondas.html", ficha)        # un mecanismo vivo
    P.imagen("norte:foto", c.x0, c.baja(900), 1600, "<ruta>/img/escena.png", tema=c.tema)   # una imagen, sin deformarla
    P.logo("norte:wa", c.x0, c.baja(140), 140, "<ruta>/logos/whatsapp.png", tema=c.tema)    # un logo REAL (archivo de la marca)
    P.escribir(manifiesto=Path("…/lienzo.manifiesto.json"))                      # crea o actualiza, respetando la mano

Como comando (un lienzo de capítulos desde un spec declarativo, sin coordenadas):

    python3 .claude/skills/canvas/scripts/lienzo_vivo.py armar <spec.json> [--ensayo]
    python3 .claude/skills/canvas/scripts/lienzo_vivo.py capitulos <spec.json>      # qué capítulos y encuadres saldrían

Reglas que el código hace cumplir:
- Cada capítulo es un marco con la proporción de la pantalla (16:9): al volar a él cabe ENTERO, proyectado o compartido.
- Todo lo que escribe lleva su marca (`gen`) y su firma de geometría (`gsig`). Lo que una mano movió, editó, bloqueó o
  borró se respeta TAL CUAL en la corrida siguiente; lo que la mano agregó nunca se toca.
- Escribe por la API del Lienzo de la app (pase del agente); fuera de la app dice `sin_app` y no escribe nada.
- Sin dependencias: Python 3 de fábrica. En Windows usa `python` si `python3` no existe.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ESQUEMA_LIENZO = 4
# El encuadre de un capítulo: la proporción de la pantalla. 4800 de ancho deja leer un título de 190 desde la vista completa.
ANCHO, ALTO = 4800, 2700
HUECO = 420            # aire entre capítulos
MARGEN = 170           # aire dentro del capítulo, por lado
MORADO, AMBAR, ROJO, GRIS = "#9D3CF5", "#C97A00", "#D92D20", "#7C8190"   # tintas que se leen en claro y en oscuro
GEOM = ("x", "y", "width", "height", "rotation", "zIndex")
TINTES = {"neutro", "morado", "ambar", "verde", "azul", "rosa", "rojo"}

# Ancho medio por letra (fracción del tamaño) de las familias del Lienzo. Aproximado a propósito: sirve para cortar
# renglones con un margen; el Lienzo pinta el texto con sus letras reales.
_ANCHO = {
    "montserrat": {400: .545, 500: .552, 600: .566, 700: .582, 800: .596, 900: .606},
    "roboto-slab": {400: .560, 700: .592, 800: .604, 900: .614},
    "jetbrains-mono": {400: .600, 700: .610},
}


def raiz() -> Path:
    if os.environ.get("ARBRAIN_RAIZ"):
        return Path(os.environ["ARBRAIN_RAIZ"])
    return Path(__file__).resolve().parents[4]


def ancho_texto(t: str, tam: float, peso: int = 600, familia: str = "montserrat", espaciado: float = 0) -> float:
    tabla = _ANCHO.get(familia, _ANCHO["montserrat"])
    k = min(tabla, key=lambda p: abs(p - peso))
    mayus = sum(1 for c in t if c.isupper() or c.isdigit()) / max(1, len(t))
    return len(t) * tam * tabla[k] * (1.0 + 0.11 * mayus) + espaciado * len(t)


def cortar(t: str, ancho: float, tam: float, peso: int = 600, familia: str = "montserrat") -> list[str]:
    """Corta en renglones a lo ancho en unidades del lienzo, no por número de letras."""
    lineas, cur = [], ""
    for p in str(t).split():
        cand = (cur + " " + p).strip()
        if cur and ancho_texto(cand, tam, peso, familia) > ancho:
            lineas.append(cur)
            cur = p
        else:
            cur = cand
    if cur:
        lineas.append(cur)
    return lineas or [""]


def firma(e: dict) -> str:
    return "·".join(str(round(float(e.get(k) or 0), 1)) for k in GEOM)


def tocado_a_mano(p: dict) -> bool:
    """¿Este elemento, como está guardado, lo colocó o lo editó una mano? Ante la duda, sí: conservar cuesta poco."""
    if p.get("mano") or p.get("locked") or (p.get("origin") or {}).get("pinned"):
        return True
    f = p.get("gsig")
    return f is None or f != firma(p)


def ficha_de(html: str) -> dict:
    """La ficha (`application/pieza+json`) de una pieza ya armada."""
    m = re.search(r'<script type="application/pieza\+json">\s*(\{.*?\})\s*</script>', html, re.S)
    if not m:
        raise ValueError("La pieza no trae su ficha (application/pieza+json).")
    return json.loads(m.group(1))


IMAGEN_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif")
MAX_PIEZA = 512 * 1024          # el Lienzo no lee una pieza más grande (features/canvas/piezas/formato.ts)
MAX_IMAGENES = 24               # ni más imágenes por pieza


def proporcion(ruta: Path | str) -> tuple[int, int]:
    """(ancho, alto) en px de un PNG, JPEG, WebP o GIF, leyendo solo su cabecera (sin dependencias)."""
    import struct
    b = Path(ruta).read_bytes()[:256 * 1024]
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", b[16:24])
    if b[:6] in (b"GIF87a", b"GIF89a"):
        return struct.unpack("<HH", b[6:10])
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        k = b[12:16]
        if k == b"VP8 ":
            w, h = struct.unpack("<HH", b[26:30]); return w & 0x3FFF, h & 0x3FFF
        if k == b"VP8L":
            v = int.from_bytes(b[21:25], "little"); return (v & 0x3FFF) + 1, ((v >> 14) & 0x3FFF) + 1
        if k == b"VP8X":
            return int.from_bytes(b[24:27], "little") + 1, int.from_bytes(b[27:30], "little") + 1
    if b[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(b):
            if b[i] != 0xFF:
                i += 1; continue
            m = b[i + 1]
            if m in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", b[i + 5:i + 9]); return w, h
            i += 2 + struct.unpack(">H", b[i + 2:i + 4])[0]
    raise ValueError(f"No reconozco el formato de la imagen: {ruta} (PNG, JPEG, WebP o GIF).")


def ruta_imagen(ruta: str | Path) -> tuple[Path, str]:
    """Una imagen que el Lienzo puede leer: (ruta absoluta, ruta relativa a la raíz de Arbrain). Si no existe, error."""
    r = str(ruta)
    if r.startswith("doc:"):
        r = r[4:]
    p = Path(r).expanduser()
    p = (p if p.is_absolute() else raiz() / p).resolve()
    if p.suffix.lower() not in IMAGEN_EXT:
        raise ValueError(f"No es una imagen (PNG, JPEG, WebP o GIF): {ruta}")
    if not p.is_file():
        raise ValueError(f"La imagen no existe: {ruta}")
    try:
        rel = p.relative_to(raiz().resolve()).as_posix()
    except ValueError as e:
        raise ValueError(f"La imagen debe vivir dentro de la carpeta de Arbrain ({raiz()}): {ruta}") from e
    return p, rel


# Las raíces de disco que el Lienzo de la app sabe cargar (`urlDeCarga`, features/canvas/render/images.ts): la carpeta
# de usuarios de macOS, los volúmenes montados y «~». Se arman por partes: así ninguna ruta de usuario va escrita de corrido.
_RAICES_DEL_LIENZO = tuple("/" + d + "/" for d in ("Users", "Volumes")) + ("~/",)


def carga_del_disco(ruta: str | Path) -> bool:
    """¿El Lienzo de la app carga esta imagen nativa desde el disco? Si no, la imagen va dentro de una pieza."""
    return Path(ruta).as_posix().startswith(_RAICES_DEL_LIENZO)


def imagen_de(ruta: str | Path) -> dict:
    """Lo que una pieza necesita de una imagen: `{ruta, ancho, alto}` (ruta relativa a la raíz; px reales). Va en sus
    datos, y la ruta en `imagenes=` de `armar_pieza`, para que el Lienzo se la entregue sin red."""
    p, rel = ruta_imagen(ruta)
    w, h = proporcion(p)
    return {"ruta": rel, "ancho": w, "alto": h}


def armar_pieza(id_: str, titulo: str, fuente_js: str, kit_js: str, datos: dict, pasos: int = 0,
                imagenes: list | None = None) -> str:
    """Una pieza viva en el formato del Lienzo: un solo .html con su ficha, el kit, la pieza y SUS datos adentro.

    `fuente_js` es un módulo `export default function montar(raiz, ctx, datos)` con `const W = …, H = …` (su tamaño lógico).
    La pieza no puede pedir nada a la red ni a la app: por eso los datos viajan escritos en el archivo.
    `imagenes`: rutas (relativas a la raíz de Arbrain) de las imágenes que dibuja. Van en su ficha y el Lienzo se las
    entrega antes de montarla (`ctx.imagen(ruta)` en la pieza; en el kit, `imagen()` y `logo()`).
    """
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,40}", id_):
        raise ValueError(f"El id de una pieza va en minúsculas y con guiones: «{id_}».")
    m = re.search(r"const W = (\d+), H = (\d+)", fuente_js)
    if not m:
        raise ValueError(f"{id_}: la pieza debe declarar «const W = …, H = …».")
    def sin_modulo(s: str) -> str:
        s = re.sub(r"^import [\s\S]*? from .*$", "", s, flags=re.M)
        s = re.sub(r"^export default function ", "function ", s, flags=re.M)
        return re.sub(r"^export ", "", s, flags=re.M)
    ficha = {"id": id_, "titulo": titulo, "ancho": int(m.group(1)), "alto": int(m.group(2)), "fondo": "transparente"}
    if pasos:
        ficha["pasos"] = int(pasos)
    if imagenes:
        rels = []
        for r in imagenes:
            rel = ruta_imagen(r["ruta"] if isinstance(r, dict) else r)[1]
            if rel not in rels:
                rels.append(rel)
        if len(rels) > MAX_IMAGENES:
            raise ValueError(f"{id_}: una pieza lleva a lo sumo {MAX_IMAGENES} imágenes ({len(rels)}).")
        ficha["imagenes"] = rels
    # `</` dentro de un JSON incrustado cerraría el <script>: se escapa.
    crudo = json.dumps(datos, ensure_ascii=False).replace("</", "<\\/")
    html = f"""<script type="application/pieza+json">
{json.dumps(ficha, ensure_ascii=False)}
</script>

<style>
  /* Generada: se edita su fuente (los datos o la pieza .js) y se vuelve a armar; este archivo se reescribe. */
  :scope {{ background: transparent; }}
</style>

<script>
// ── kit de las piezas vivas ──
{sin_modulo(kit_js)}
// ── la pieza ──
{sin_modulo(fuente_js)}
// ── sus datos ──
const __datos = {crudo}
// ── el puente con el Lienzo ──
const __ctx = {{
  tema: pieza.tema,
  paso: pieza.paso,
  ir: (d) => pieza.ir(d),
  animar: (fn) => pieza.animar(fn),
  alPaso: (fn) => pieza.alPaso(fn),
  imagen: (r) => (typeof marca !== 'undefined' && marca && marca.imagen ? marca.imagen(r) : ''),
}}
const __pieza = montar(raiz, __ctx, __datos)
pieza.alTema((t) => __pieza.tema(t))
</script>
"""
    if len(html.encode("utf-8")) > MAX_PIEZA:
        raise ValueError(f"{id_}: la pieza armada pesa {len(html.encode('utf-8')) // 1024} KB y el Lienzo lee hasta 512 KB. "
                         "Las imágenes no van escritas adentro: decláralas en `imagenes=`.")
    return html


class Capitulo:
    """Un capítulo ya colocado: su caja, su zona útil y un cursor que baja (`y`) conforme le pones cosas."""

    def __init__(self, P: "Pagina", id_: str, titulo: str, tema: str, x: float, y: float, w: float, h: float):
        self.P, self.id, self.titulo, self.tema = P, id_, titulo, tema
        self.caja = (x, y, w, h)
        self.x0, self.ancho = x + MARGEN, w - 2 * MARGEN
        self.y, self.fondo = y + MARGEN, y + h - MARGEN

    def baja(self, alto: float, aire: float = 60) -> float:
        """Reserva `alto` y devuelve la `y` donde empieza."""
        y = self.y
        self.y += alto + aire
        return y

    @property
    def libre(self) -> float:
        return self.fondo - self.y


class Pagina:
    def __init__(self, nombre: str, columnas: int = 2):
        self.nombre, self.columnas = nombre, max(1, columnas)
        self.els: list[dict] = []
        self.ids: set[str] = set()
        self.caps: list[Capitulo] = []
        self.ahora = int(time.time() * 1000)
        self.origen = (0, 0)
        self.avisos: list[str] = []

    # ── plomería ──
    def _base(self, id_: str, tipo: str, x: float, y: float, w: float, h: float, z: int, tema: str | None) -> dict:
        if id_ in self.ids:
            raise ValueError(f"id duplicado en la página: «{id_}»")
        self.ids.add(id_)
        e = {"id": id_, "type": tipo, "x": round(x, 1), "y": round(y, 1), "width": round(w, 1), "height": round(h, 1),
             "rotation": 0, "zIndex": z, "opacity": 1, "locked": False, "version": 1, "gen": True,
             "createdAt": self.ahora, "updatedAt": self.ahora}
        if tema:
            e["tema"] = tema
        self.els.append(e)
        return e

    # ── capítulos: un marco 16:9 por parte, en rejilla, numerado en orden de lectura ──
    def capitulo(self, id_: str, titulo: str, col: int | None = None, fila: int | None = None, tema: str | None = None,
                 tinte: str = "neutro", ceja: str | None = None, tesis: str | None = None, color: str = MORADO) -> Capitulo:
        n = len(self.caps)
        col = n % self.columnas if col is None else col
        fila = n // self.columnas if fila is None else fila
        x = self.origen[0] + col * (ANCHO + HUECO)
        y = self.origen[1] + fila * (ALTO + HUECO)
        tema = tema or titulo
        if tinte not in TINTES:
            raise ValueError(f"tinte desconocido: {tinte}")
        m = self._base(f"cap:{id_}", "frame", x, y, ANCHO, ALTO, -8, tema)
        m.update({"title": titulo, "role": "tray", "tint": tinte, "capitulo": n + 1,
                  "trazo": {"style": "solid", "width": 4, "radius": 64, "explicit": True}})
        c = Capitulo(self, id_, titulo, tema, x, y, ANCHO, ALTO)
        self.caps.append(c)
        # La cabeza: la ceja (qué número y de qué va), el nombre enorme (se lee desde la vista completa) y la tesis.
        if ceja:
            self.texto(f"{id_}:ceja", c.x0 + 6, c.baja(48, 26), ceja.upper(), 40, 800, color=color, espaciado=7, tema=tema)
        yt = c.baja(232, 46)
        self.texto(f"{id_}:titulo", c.x0, yt, titulo, 190, 900, familia="roboto-slab", tema=tema)
        if tesis:
            # la tesis va a la derecha del nombre si cabe en tres renglones; si no, debajo
            xt = c.x0 + ancho_texto(titulo, 190, 900, "roboto-slab") * 1.04 + 150
            libre = c.x0 + c.ancho - xt
            ls = cortar(tesis, libre, 60, 600) if libre > 1200 else []
            if ls and len(ls) <= 3:
                self.texto(f"{id_}:tesis", xt, yt + (232 - 60 * 1.3 * len(ls)) / 2 + 8, tesis, 60, 600, cursiva=True, ancho=libre,
                           opacidad=.72, tema=tema)
            else:
                ls = cortar(tesis, c.ancho * .9, 60, 600)
                self.texto(f"{id_}:tesis", c.x0 + 6, c.baja(60 * 1.3 * len(ls), 60), tesis, 60, 600, cursiva=True,
                           ancho=c.ancho * .9, opacidad=.72, tema=tema)
        return c

    def titular(self, id_: str, texto: str, bajada: str | None = None, ceja: str | None = None, color: str = AMBAR) -> None:
        """El título de la página, encima de la rejilla de capítulos (se llama DESPUÉS de crear los capítulos)."""
        ancho = self.columnas * ANCHO + (self.columnas - 1) * HUECO
        y = self.origen[1] - 300
        if bajada:
            ab = min(ancho * .62, ancho_texto(bajada, 78, 600) * 1.04)
            ls = cortar(bajada, ab, 78, 600)
            y -= 78 * 1.3 * len(ls)
            self.texto(f"{id_}:bajada", self.origen[0] + 8, y, bajada, 78, 600, cursiva=True, ancho=ab, opacidad=.72)
            y -= 60
        tam = 330
        while tam > 150 and ancho_texto(texto, tam, 900, "roboto-slab") > ancho * .96:
            tam -= 10
        y -= tam * 1.22
        self.texto(f"{id_}:t", self.origen[0], y, texto, tam, 900, familia="roboto-slab")
        if ceja:
            self.texto(f"{id_}:ceja", self.origen[0] + 8, y - 92, ceja.upper(), 50, 800, color=color, espaciado=9)

    # ── nativos: lo que el dueño edita con su mano ──
    def texto(self, id_: str, x: float, y: float, texto: str, tam: float = 44, peso: int = 600, familia: str = "montserrat",
              ancho: float | None = None, color: str | None = None, cursiva: bool = False, alinear: str = "left",
              z: int = 16, interlineado: float = 1.3, opacidad: float = 1, espaciado: float = 0, tema: str | None = None,
              aparece: str | None = None) -> dict:
        ls = cortar(texto, ancho, tam, peso, familia) if ancho and alinear == "left" else [str(texto)]
        w = ancho or max(ancho_texto(l, tam, peso, familia, espaciado) for l in ls) * 1.04
        e = self._base(id_, "text", x, y, w, tam * interlineado * len(ls), z, tema)
        estilo = {"size": tam, "family": familia, "weight": peso}
        if cursiva:
            estilo["italic"] = True
        if len(ls) > 1:
            estilo["lineHeight"] = interlineado
        if espaciado:
            estilo["letterSpacing"] = espaciado
        e.update({"text": " ".join(ls), "lines": ls, "align": alinear, "style": estilo, "opacity": opacidad})
        if color:
            e["color"] = {"text": color, "explicit": True}
        if aparece:
            e["aparece"] = aparece
        return e

    def tarjeta(self, id_: str, x: float, y: float, w: float, h: float, tinte: str = "neutro", estilo: str = "solid",
                grosor: float = 5, radio: float = 36, z: int = -4, tema: str | None = None, aparece: str | None = None) -> dict:
        """Una tarjeta del color del tema (un marco con tinte): firme = `solid`, abierta = `dashed`, idea = `dotted`."""
        e = self._base(id_, "frame", x, y, w, h, z, tema)
        e.update({"title": "", "role": "tray", "tint": tinte if tinte in TINTES else "neutro", "aireOk": True,
                  "trazo": {"style": estilo, "width": grosor, "radius": radio, "explicit": True}})
        if aparece:
            e["aparece"] = aparece
        return e

    def frase(self, id_: str, x: float, y: float, w: float, h: float, ceja: str, texto: str, estado: str = "firmado",
              sello: str | None = None, tema: str | None = None, tam: float = 62) -> dict:
        """Una frase del dueño en su tarjeta: la ceja dice qué es, el sello dice su estado. Editable a mano."""
        k = estado_de(estado)
        tinte, trazo, color = {"firmado": ("ambar", "solid", AMBAR), "opera": ("morado", "solid", MORADO),
                               "abierto": ("ambar", "dashed", AMBAR), "pendiente": ("neutro", "dashed", None),
                               "idea": ("neutro", "dotted", None)}[k]
        t = self.tarjeta(f"{id_}:caja", x, y, w, h, tinte, trazo, tema=tema)
        self.texto(f"{id_}:ceja", x + 56, y + 46, ceja.upper(), 36, 800, color=color, espaciado=6, tema=tema)
        rot = (sello or ROTULO[k]).upper()
        self.texto(f"{id_}:sello", x + w * .42, y + 48, rot, 33, 800, ancho=w * .58 - 56, alinear="right",
                   color=color, espaciado=5, opacidad=1 if color else .6, tema=tema)
        cuerpo = texto or ("falta escribirla" if k == "pendiente" else "una idea, todavía")
        while tam > 40 and len(cortar(cuerpo, w - 112, tam, 650)) * tam * 1.3 > h - 170:
            tam -= 4
        self.texto(f"{id_}:t", x + 56, y + 126, cuerpo, tam, 650, cursiva=True, ancho=w - 112, opacidad=1 if texto else .55, tema=tema)
        return t

    def enlace(self, id_: str, x: float, y: float, w: float, h: float, texto: str, destino: str, tema: str | None = None) -> dict | None:
        """Una tarjeta nativa que abre un documento (`doc:<ruta>`) u otro lienzo (`page:<id>`) dentro de la app."""
        if not str(destino).startswith(("doc:", "page:")):
            return None
        e = self._base(id_, "shape", x, y, w, h, 6, tema)
        tam = 46
        ls = cortar(texto, w - 90, tam, 700)[:1]
        e.update({"shape": "rect", "role": "form", "tint": "neutro", "link": destino, "openOnClick": True, "name": texto, "textAlign": "left",
                  "trazo": {"style": "solid", "width": 5, "radius": 30, "explicit": True},
                  "text": [{"kind": "title", "x": 44, "y": round((h - tam * 1.25 * len(ls)) / 2), "text": " ".join(ls), "lines": ls,
                            "style": {"size": tam, "family": "montserrat", "weight": 700}, "width": round(w - 90), "height": round(tam * 1.25 * len(ls))}]})
        return e

    def leyenda(self, id_: str, x_derecha: float, y: float, nota: str | None = "lo punteado todavía no es un hecho: se dibuja como está") -> None:
        """Los cuatro estados, con su trazo, alineados a la derecha en `x_derecha` (junto al título de la página)."""
        w, h, g = 430, 104, 34
        x = x_derecha - 4 * w - 3 * g
        # Figuras, no marcos: un marco suelto fuera de un capítulo se anunciaría en el índice como un capítulo más.
        for i, (k, color, trazo) in enumerate((("firmado", AMBAR, "solid"), ("abierto", AMBAR, "dashed"),
                                               ("pendiente", GRIS, "dashed"), ("idea", GRIS, "dotted"))):
            e = self._base(f"{id_}:{k}", "shape", x + i * (w + g), y, w, h, 4, None)
            e.update({"shape": "rect", "role": "card", "color": {"fill": "transparent", "stroke": color, "explicit": True},
                      "trazo": {"style": trazo, "width": 6, "radius": 52, "explicit": True}})
            self.texto(f"{id_}:{k}:t", x + i * (w + g), y + 29, k.upper(), 37, 800, ancho=w, alinear="center", espaciado=6, color=color)
        if nota:
            self.texto(f"{id_}:nota", x, y - 66, nota, 36, 600, ancho=4 * w + 3 * g, alinear="right", cursiva=True, opacidad=.6)

    def pieza(self, id_: str, x: float, y: float, ancho: float, liga: str, ficha: dict, tema: str | None = None,
              aparece: str | None = None, z: int = 2) -> dict:
        """Una pieza viva (`doc:<ruta>/pieza.html`) a `ancho` unidades; el alto sale de la proporción de su ficha."""
        alto = ancho * ficha["alto"] / ficha["ancho"]
        e = self._base(f"pieza-{id_}", "embed", x, y, ancho, alto, z, tema)
        e.update({"url": f"pieza:{ficha['id']}", "pieza": liga if liga.startswith("doc:") else f"doc:{liga}",
                  "name": ficha.get("titulo") or id_, "interactive": False})
        if aparece:
            e["aparece"] = aparece
        return e

    # ── imágenes y logos nativos: se mueven con la cámara, pertenecen a su capítulo y respetan su proporción ──
    def imagen(self, id_: str, x: float, y: float, ancho: float, ruta: str | Path, tema: str | None = None,
               aparece: str | None = None, z: int = 3, nombre: str | None = None, alto: float | None = None) -> dict:
        """Una imagen del repo como elemento nativo (`image`). El alto sale de su proporción: nunca se deforma (con `alto`,
        cabe dentro de la caja `ancho × alto` y se centra). `aparece: "<capítulo>"` la guarda hasta que el recorrido llega."""
        p, rel = ruta_imagen(ruta)
        w, h = proporcion(p)
        if alto:
            k = min(ancho / w, alto / h)
            ancho, x, y = w * k, x + (ancho - w * k) / 2, y + (alto - h * k) / 2
        e = self._base(id_, "image", x, y, ancho, ancho * h / w, z, tema)
        # El Lienzo carga una ruta del disco por `/api/canvas/imagen`, solo bajo sus raíces (`carga_del_disco`).
        e.update({"src": p.as_posix(), "name": nombre or Path(rel).stem, "ruta": rel})
        if not carga_del_disco(p):
            self.avisos.append(f"«{id_}»: el Lienzo de esta máquina no carga imágenes nativas desde {p.parent}; "
                               "ponla dentro de una pieza (`imagenes=` en armar_pieza).")
        if aparece:
            e["aparece"] = aparece
        return e

    def logo(self, id_: str, x: float, y: float, alto: float, ruta: str | Path, tema: str | None = None,
             aparece: str | None = None, z: int = 12, nombre: str | None = None) -> dict:
        """Un logo REAL: el archivo de la marca (de su sitio o de un banco como Simple Icons), nunca dibujado por un
        modelo de imagen ni de memoria. Si el archivo no existe es un error: un logo que falta no se fabrica."""
        try:
            p, _ = ruta_imagen(ruta)
        except ValueError as e:
            raise ValueError(f"Logo que falta: {ruta}. No se fabrica: trae el archivo real de la marca o no va.") from e
        w, h = proporcion(p)
        e = self.imagen(id_, x, y, alto * w / h, p, tema=tema, aparece=aparece, z=z, nombre=nombre or p.stem)
        e["logo"] = True
        return e

    def tira_logos(self, id_: str, x: float, y: float, alto: float, rutas: list, aire: float = 70, tema: str | None = None,
                   aparece: str | None = None, rotulos: list | None = None) -> float:
        """Una fila de logos reales a la misma altura (así se nombra una herramienta). Devuelve el ancho que ocupó."""
        cx = x
        for i, r in enumerate(rutas):
            e = self.logo(f"{id_}:{i + 1}", cx, y, alto, r, tema=tema, aparece=aparece)
            if rotulos and i < len(rotulos) and rotulos[i]:
                self.texto(f"{id_}:{i + 1}:r", cx - 40, y + alto + 22, rotulos[i], 34, 700, ancho=e["width"] + 80,
                           alinear="center", tema=tema, aparece=aparece)
            cx += e["width"] + aire
        return cx - aire - x

    # ── revisar: lo que se puede saber sin abrir la app ──
    def revisar(self) -> list[str]:
        av = list(self.avisos)
        cajas = [(c.titulo, c.caja) for c in self.caps]
        for c in self.caps:
            if c.y > c.fondo + 1:
                av.append(f"«{c.titulo}»: el contenido se sale {round(c.y - c.fondo)} u por abajo del capítulo.")
        for e in self.els:
            if e["type"] == "frame" and e["id"].startswith("cap:"):
                continue
            cx, cy = e["x"] + e["width"] / 2, e["y"] + e["height"] / 2
            dentro = [t for t, (x, y, w, h) in cajas if x <= cx <= x + w and y <= cy <= y + h]
            if dentro:
                x, y, w, h = next(c for t, c in cajas if t == dentro[0])
                if e["x"] < x - 1 or e["x"] + e["width"] > x + w + 1 or e["y"] + e["height"] > y + h + 1:
                    av.append(f"«{e['id']}» se sale del capítulo «{dentro[0]}».")
        if len(self.caps) < 2:
            av.append("Un lienzo con menos de dos capítulos no tiene índice ni recorrido: declara al menos dos.")
        return av

    def camara(self) -> dict:
        xs = [e["x"] for e in self.els] or [0]
        ys = [e["y"] for e in self.els] or [0]
        x1 = max((e["x"] + e["width"] for e in self.els), default=0)
        y1 = max((e["y"] + e["height"] for e in self.els), default=0)
        w, h = x1 - min(xs), y1 - min(ys)
        return {"x": round(min(xs) + w / 2), "y": round(min(ys) + h / 2), "zoom": round(min(1400 / max(w, 1), 800 / max(h, 1)), 4)}

    def encuadres(self) -> list[dict]:
        """Los capítulos en orden, con la zona (`x,y,ancho,alto`) que sirve para enseñarlos o fotografiarlos."""
        return [{"n": i + 1, "id": f"cap:{c.id}", "titulo": c.titulo, "tema": c.tema,
                 "zona": ",".join(str(round(v)) for v in c.caja)} for i, c in enumerate(self.caps)]

    # ── escribir: por la API del Lienzo, fusionando con lo que la mano ya tocó ──
    def fusionar(self, previos: list[dict], manifiesto: dict | None) -> tuple[list[dict], dict]:
        prev = {e["id"]: e for e in previos}
        mios = {e["id"] for e in self.els}
        antes = set(manifiesto["ids"]) if manifiesto and manifiesto.get("ids") else {p["id"] for p in previos if p.get("gen")}
        tumbas = set((manifiesto or {}).get("borrados") or [])
        salida, cuenta = [], {"nuevos": 0, "actualizados": 0, "de_la_mano": 0, "no_repuestos": 0, "retirados": 0, "ajenos": 0}
        for e in self.els:
            p = prev.get(e["id"])
            if p is None:
                if e["id"] in tumbas or e["id"] in antes:        # lo escribí antes y ya no está: lo borró una mano
                    tumbas.add(e["id"]); cuenta["no_repuestos"] += 1
                    continue
                salida.append(e); cuenta["nuevos"] += 1
                continue
            tumbas.discard(e["id"])
            if tocado_a_mano(p):
                q = dict(p); q["mano"] = True                     # la marca es permanente: ya es suyo
                if e.get("pieza"):                                # lo único que sigue siendo del guion: a qué archivo apunta
                    q["pieza"] = e["pieza"]; q["url"] = e.get("url", q.get("url"))
                salida.append(q); cuenta["de_la_mano"] += 1
            else:
                salida.append(e); cuenta["actualizados"] += 1
        for pid, p in prev.items():
            if pid in mios:
                continue
            if pid in antes and p.get("gen") and not tocado_a_mano(p):
                cuenta["retirados"] += 1                          # un resto mío que nadie tocó
            else:
                salida.append(p); cuenta["ajenos"] += 1           # lo puso o lo movió una mano: se queda
        for e in salida:
            e["gsig"] = firma(e)
        return salida, {**cuenta, "borrados": sorted(tumbas)}

    def escribir(self, manifiesto: Path | None = None, ensayo: bool = False, pagina_id: str | None = None,
                 carpeta: str | None = None) -> dict:
        man = json.loads(manifiesto.read_text(encoding="utf-8")) if manifiesto and manifiesto.exists() else None
        pagina_id = pagina_id or (man or {}).get("paginaId")
        base = os.environ.get("MISSION_CONTROL_ORIGIN", "").rstrip("/")
        if not base or not os.environ.get("ARBRAIN_PASE_AGENTE"):
            if ensayo:
                els, cuenta = self.fusionar([], man)
                return {"lienzo": "ensayo", "elementos": len(els), **cuenta, "avisos": self.revisar()}
            return {"lienzo": "sin_app", "detalle": "Solo dentro de la app Arbrain (falta MISSION_CONTROL_ORIGIN o el pase del "
                    "agente). Lo armado queda en su carpeta; el lienzo se dibuja al correrlo desde la app."}
        creada = False
        if not pagina_id:
            st, lista = _pedir("GET", f"{base}/api/canvas/pages")
            if st != 200:
                return {"lienzo": "no_responde", "detalle": f"El lienzo respondió {st}."}
            pag = next((p for p in lista.get("paginas") or [] if p.get("nombre") == self.nombre), None)
            if pag:
                pagina_id = pag["id"]
            elif ensayo:
                els, cuenta = self.fusionar([], man)
                return {"lienzo": "ensayo", "crearia": self.nombre, "elementos": len(els), **cuenta, "avisos": self.revisar()}
            else:
                cuerpo = {"nombre": self.nombre}
                if carpeta:
                    cuerpo["folderId"] = carpeta
                st, nueva = _pedir("POST", f"{base}/api/canvas/pages", cuerpo)
                pagina_id = (nueva.get("pagina") or {}).get("id") if st == 200 else None
                if not pagina_id:
                    return {"lienzo": "no_se_creo", "detalle": f"Crear la página respondió {st}."}
                creada = True
        st, r = _pedir("GET", f"{base}/api/canvas/pages/{pagina_id}")
        if st != 200 or not r.get("pagina"):
            return {"lienzo": "no_responde", "detalle": f"Leer la página respondió {st}.", "paginaId": pagina_id}
        pag = r["pagina"]
        if pag.get("esV4") is False:
            return {"lienzo": "otro_formato", "detalle": "Esa página es de un lienzo anterior: no se escribe encima.", "paginaId": pagina_id}
        previos = pag.get("elements") or []
        bloqueados = [e["id"] for e in previos if e.get("locked") and e.get("gen")]
        els, cuenta = self.fusionar(previos, None if creada else man)
        out = {"lienzo": self.nombre, "paginaId": pagina_id, "creada": creada, "elementos": len(els), **cuenta,
               "bloqueados": bloqueados, "avisos": self.revisar(), "capitulos": self.encuadres()}
        if ensayo:
            return {**out, "lienzo": "ensayo"}
        cuerpo = {"elements": els, "camera": pag.get("camera") if previos else self.camara(), "nombre": self.nombre,
                  "baseVersion": pag.get("version", 0)}
        st, w = _pedir("PUT", f"{base}/api/canvas/pages/{pagina_id}", cuerpo)
        if st == 409:
            return {**out, "lienzo": "choque", "detalle": "Alguien guardó la página mientras tanto: vuelve a correrlo."}
        if st != 200 or not w.get("ok"):
            return {**out, "lienzo": "no_se_escribio", "detalle": f"Guardar respondió {st}: {w.get('error', '')}"}
        st, r2 = _pedir("GET", f"{base}/api/canvas/pages/{pagina_id}")          # el acuse dice que escribió; esto, qué quedó
        quedo = len((r2.get("pagina") or {}).get("elements") or [])
        if quedo != len(els):
            return {**out, "lienzo": "relectura_distinta", "detalle": f"Escribí {len(els)} elementos y leí {quedo}."}
        if manifiesto:
            guardar(manifiesto, json.dumps({"paginaId": pagina_id, "nombre": self.nombre, "ids": sorted(e["id"] for e in els if e.get("gen")),
                                            "borrados": cuenta["borrados"]}, ensure_ascii=False, indent=1) + "\n")
        return {**out, "version": w.get("version")}


# ── estados: los mismos cuatro en nativos y en piezas ──
ROTULO = {"firmado": "firmado", "opera": "opera hoy", "abierto": "abierto", "pendiente": "pendiente", "idea": "idea"}


def estado_de(x) -> str:
    """`firmada`, `borrador`, `vacía`, `por medir`… → firmado | opera | abierto | pendiente | idea."""
    import unicodedata
    s = "".join(c for c in unicodedata.normalize("NFD", str(x or "")) if unicodedata.category(c) != "Mn").lower().strip()
    if re.match(r"(firmad|decidid|medid|hecho|listo)", s):
        return "firmado"
    if re.match(r"(opera|activo|funciona|vivo)", s):
        return "opera"
    if re.match(r"(abiert|borrador|en curso|por decidir)", s):
        return "abierto"
    if re.match(r"(idea|mas adelante|algun dia)", s):
        return "idea"
    return "pendiente"


def guardar(ruta: Path, texto: str) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=ruta.parent, prefix=f".{ruta.name}.")
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
        f.write(texto)
    os.replace(tmp, ruta)
    try:
        os.chmod(ruta, 0o644)          # mkstemp nace 0600: lo generado se puede leer y compartir como cualquier archivo
    except OSError:
        pass


def _pedir(metodo: str, url: str, cuerpo: dict | None = None) -> tuple[int, dict]:
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, method=metodo, headers={
        "Authorization": f"Bearer {os.environ.get('ARBRAIN_PASE_AGENTE', '')}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0, {}


# ── el comando: un lienzo de capítulos desde un spec declarativo ──
def desde_spec(spec: dict, carpeta: Path) -> Pagina:
    """`{nombre, titular?, bajada?, columnas?, capitulos: [{id, titulo, tema?, ceja?, tesis?, tinte?, bloques: [...]}]}`.

    Bloques: `{"tipo": "texto", "texto", "tam"?}` · `{"tipo": "frases", "lista": [{ceja, texto, estado, sello?}]}` ·
    `{"tipo": "pieza", "ruta": "<relativa al spec o doc:…>"}` · `{"tipo": "imagen", "ruta", "ancho"? (fracción), "aparece"?}` ·
    `{"tipo": "logos", "lista": [rutas], "alto"?, "rotulos"?}`. Se apilan de arriba abajo; cero coordenadas.
    """
    P = Pagina(spec.get("nombre") or "Lienzo", int(spec.get("columnas") or 2))
    for i, c in enumerate(spec.get("capitulos") or []):
        cid = c.get("id") or f"c{i + 1}"
        cap = P.capitulo(cid, c.get("titulo") or f"Capítulo {i + 1}", tema=c.get("tema"), tinte=c.get("tinte") or "neutro",
                         ceja=c.get("ceja"), tesis=c.get("tesis"))
        for j, b in enumerate(c.get("bloques") or []):
            bid, tipo = f"{cid}:b{j + 1}", b.get("tipo")
            if tipo == "texto":
                tam = float(b.get("tam") or 56)
                ls = cortar(b.get("texto") or "", cap.ancho, tam, 600)
                P.texto(bid, cap.x0, cap.baja(tam * 1.3 * len(ls)), b.get("texto") or "", tam, 600, ancho=cap.ancho, tema=cap.tema)
            elif tipo == "frases":
                lista = (b.get("lista") or [])[:4]
                if lista:
                    w = (cap.ancho - 60 * (len(lista) - 1)) / len(lista)
                    alto = float(b.get("alto") or 460)
                    y = cap.baja(alto)
                    for k, f in enumerate(lista):
                        P.frase(f"{bid}:{k + 1}", cap.x0 + k * (w + 60), y, w, alto, f.get("ceja") or "", f.get("texto") or "",
                                f.get("estado") or "pendiente", f.get("sello"), tema=cap.tema)
            elif tipo == "pieza":
                ruta = str(b.get("ruta") or "")
                arch = raiz() / ruta[4:] if ruta.startswith("doc:") else (carpeta / ruta).resolve()
                ficha = ficha_de(arch.read_text(encoding="utf-8"))
                try:
                    liga = "doc:" + arch.resolve().relative_to(raiz().resolve()).as_posix()
                except ValueError as e:
                    raise ValueError(f"La pieza debe vivir dentro de la carpeta de Arbrain: {arch}") from e
                ancho = cap.ancho * float(b.get("ancho") or 1)
                P.pieza(f"{cid}-{j + 1}", cap.x0, cap.baja(ancho * ficha["alto"] / ficha["ancho"]), ancho, liga, ficha, tema=cap.tema)
            elif tipo == "imagen":
                ruta = str(b.get("ruta") or "")
                arch = raiz() / ruta[4:] if ruta.startswith("doc:") else (carpeta / ruta).resolve()
                w, h = proporcion(ruta_imagen(arch)[0])
                ancho = cap.ancho * float(b.get("ancho") or 1)
                P.imagen(bid, cap.x0, cap.baja(ancho * h / w), ancho, arch, tema=cap.tema, aparece=b.get("aparece"))
            elif tipo == "logos":
                alto = float(b.get("alto") or 120)
                rutas = [raiz() / r[4:] if str(r).startswith("doc:") else (carpeta / str(r)).resolve() for r in b.get("lista") or []]
                if rutas:
                    P.tira_logos(bid, cap.x0, cap.baja(alto + (70 if b.get("rotulos") else 0)), alto, rutas, tema=cap.tema,
                                 rotulos=b.get("rotulos"))
            else:
                raise ValueError(f"Bloque desconocido en «{cap.titulo}»: {tipo}")
    if spec.get("titular"):
        P.titular("pagina", spec["titular"], spec.get("bajada"), spec.get("ceja"))
    return P


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Un lienzo con capítulos a la derecha, encuadres de pantalla y piezas vivas.")
    sub = ap.add_subparsers(dest="orden", required=True)
    for nombre in ("armar", "capitulos"):
        p = sub.add_parser(nombre)
        p.add_argument("spec")
        if nombre == "armar":
            p.add_argument("--ensayo", action="store_true")
    a = ap.parse_args(argv)
    try:
        ruta = Path(a.spec).expanduser().resolve()
        P = desde_spec(json.loads(ruta.read_text(encoding="utf-8")), ruta.parent)
        if a.orden == "capitulos":
            out, codigo = {"capitulos": P.encuadres(), "avisos": P.revisar()}, 0
        else:
            out = P.escribir(manifiesto=ruta.with_suffix(".manifiesto.json"), ensayo=a.ensayo)
            codigo = 0
    except (FileNotFoundError, ValueError, KeyError) as e:
        out, codigo = {"error": str(e)}, 2
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return codigo


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
