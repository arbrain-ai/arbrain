#!/usr/bin/env python3
"""Renderiza un edicion.json a mp4 (un solo render para todas las versiones).

  render.py versiones/v1.edicion.json [--formato horizontal|vertical] [--calidad borrador|final] [--salida X.mp4]

Hace: cortes + velocidad por tramo (trim/setpts/atempo con fundido de audio de 20 ms en cada union, sin clics),
zooms suaves de enfasis (scale animado + crop), subtitulos como PNG hechos con Pillow y superpuestos con
overlay/enable (ffmpeg no necesita drawtext ni libass), formato 16:9 o 9:16 (recorte con foco_x o fondo difuso),
logo opcional de la ficha de marca.

Limites (rutas ligeras, laptop): 1080p final x264 'veryfast'. Referencia medida: ~0.5x a 1x tiempo real en un
equipo de escritorio reciente; en una laptop sin GPU cuenta con 1x a 2x la duracion del video por formato. El
borrador (720p) va ~2x mas rapido y es lo que se muestra en el visor. Los cortes deben ir en orden cronologico.

Salida: <proyecto>/versiones/<nombre>.mp4 (horizontal) o <nombre>.vertical.mp4. Imprime JSON con duracion y ruta.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from PIL import Image, ImageDraw

import _edicion as E
from _comun import (cargar_fuente, correr, exe, fmt_tiempo, hex_a_rgb, leer_json, normalizar, resolver_fuente, salir, sondear)
from ficha import ficha_o_neutra

EPS = 1e-6


# ---------------------------------------------------------------- dimensiones
def dimensiones(formato: str, calidad: str, info: dict) -> tuple[int, int]:
    if formato == "vertical":
        h = 1920 if calidad == "final" else 1280
        return h * 9 // 16, h
    alto = 1080 if calidad == "final" else 720
    alto = min(alto, info["alto"] or alto)
    alto -= alto % 2
    ancho = alto * 16 // 9
    return ancho - ancho % 2, alto


# ---------------------------------------------------------------- subtitulos PNG
def partir_lineas(texto: str, fuente, ancho_max: int) -> list[str]:
    palabras, lineas, cur = texto.split(), [], ""
    for w in palabras:
        prueba = (cur + " " + w).strip()
        if fuente.getlength(prueba) <= ancho_max or not cur:
            cur = prueba
        else:
            lineas.append(cur)
            cur = w
    if cur:
        lineas.append(cur)
    return lineas


def luminancia(rgb) -> float:
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def png_subtitulo(texto: str, destacar: bool, W: int, H: int, vertical: bool, ficha: dict, estilo: dict, destino: Path):
    """Tamaño y peso CONSTANTES en todos los fotogramas (solo cambia el numero de lineas, max 3). Fondo opaco
    para que nada se vea a traves del recuadro. Zona segura: laterales >= 8 % y, en vertical, fuera del 14 % inferior."""
    pal = ficha.get("paleta", {})
    texto_rgb = hex_a_rgb(pal.get("texto", "#FFFFFF"))
    fondo_rgb = hex_a_rgb(pal.get("fondo", "#101418"), (16, 20, 24))
    primario = hex_a_rgb(pal.get("primario", "#2F80ED"))
    tam = int(H * (0.036 if vertical else 0.046) * estilo.get("escala", 1.0))
    ancho_max = int(W * (0.84 if vertical else 0.70)) - 2 * int(tam * 0.7)
    fuente = cargar_fuente((ficha.get("tipografia") or {}).get("subtitulos"), tam)
    lineas = partir_lineas(texto, fuente, ancho_max)[:3]
    asc, desc = fuente.getmetrics()
    alto_linea = asc + desc
    interlinea = int(tam * 0.18)
    ancho_txt = int(max(fuente.getlength(l) for l in lineas))
    padx, pady = int(tam * 0.7), int(tam * 0.45)
    barra = max(4, int(tam * 0.11))
    hueco_barra = int(tam * 0.3)
    w = ancho_txt + 2 * padx
    h = len(lineas) * alto_linea + (len(lineas) - 1) * interlinea + 2 * pady + barra + hueco_barra  # la barra va siempre: mismo peso
    margen = 4
    img = Image.new("RGBA", (w + 2 * margen, h + 2 * margen), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((margen, margen, margen + w, margen + h), radius=int(tam * 0.45), fill=(*fondo_rgb, int(255 * estilo.get("opacidad_fondo", 1.0))))
    bw = int(w * 0.22)
    by = margen + h - pady - barra
    d.rounded_rectangle((margen + (w - bw) // 2, by, margen + (w + bw) // 2, by + barra), radius=barra // 2, fill=(*primario, 255))
    acento = hex_a_rgb(pal.get("acento", pal.get("primario", "#2F80ED")))
    resaltar = normalizar(E.palabra_enfasis(texto) or "") if destacar else ""
    espacio = fuente.getlength(" ")
    y = margen + pady
    for l in lineas:
        x = margen + (w - fuente.getlength(l)) / 2
        for palabra in l.split(" "):
            rgb = acento if resaltar and normalizar(palabra) == resaltar else texto_rgb
            d.text((x, y), palabra, font=fuente, fill=(*rgb, 255))
            x += fuente.getlength(palabra) + espacio
        y += alto_linea + interlinea
    img.save(destino)
    # horizontal: borde inferior al 95 %; vertical: borde inferior al 80 % (el ultimo 14 % es interfaz de plataformas)
    px = (W - img.width) // 2
    py = int(H * (0.80 if vertical else 0.95)) - img.height
    return img.width, img.height, px, py


def png_tarjeta(texto: str, W: int, H: int, vertical: bool, ficha: dict, destino: Path) -> None:
    """Tarjeta de frase clave: panel a casi pantalla completa con el color primario de la ficha y la frase en grande."""
    pal = ficha.get("paleta", {})
    primario = hex_a_rgb(pal.get("primario", "#2F80ED"))
    claro, oscuro = hex_a_rgb(pal.get("texto", "#FFFFFF")), hex_a_rgb(pal.get("fondo", "#101418"), (16, 20, 24))
    texto_rgb = claro if luminancia(primario) < 150 else oscuro
    # Zona segura: la tarjeta vive en el tercio inferior (fuera de frente y cara). Vertical: de 62 % a 85 %
    # (el ultimo 14 % es interfaz de plataformas). Horizontal: de 62 % a 94 %.
    mx = int(W * (0.08 if vertical else 0.06))
    y_ini, y_fin = (0.62, 0.85) if vertical else (0.62, 0.94)
    alto_panel = int(H * (y_fin - y_ini))
    y0 = int(H * y_ini)
    ancho_panel = W - 2 * mx
    tam = int(H * (0.046 if vertical else 0.072))
    ftip = (ficha.get("tipografia") or {}).get("subtitulos")
    fuente = cargar_fuente(ftip, tam)
    lineas = partir_lineas(texto, fuente, int(ancho_panel * 0.84))
    while tam > 20:
        asc, desc = fuente.getmetrics()
        if len(lineas) <= 4 and len(lineas) * (asc + desc) + (len(lineas) - 1) * int(tam * 0.2) <= alto_panel - int(tam * 1.4):
            break
        tam = int(tam * 0.93)
        fuente = cargar_fuente(ftip, tam)
        lineas = partir_lineas(texto, fuente, int(ancho_panel * 0.84))
    asc, desc = fuente.getmetrics()
    alto_linea, inter = asc + desc, int(tam * 0.2)
    alto_txt = len(lineas) * alto_linea + (len(lineas) - 1) * inter
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((mx, y0, W - mx, y0 + alto_panel), radius=int(tam * 0.6), fill=(*primario, 255))
    y = y0 + (alto_panel - alto_txt) // 2
    for l in lineas:
        d.text(((W - fuente.getlength(l)) / 2, y), l, font=fuente, fill=(*texto_rgb, 255))
        y += alto_linea + inter
    img.save(destino)


# ---------------------------------------------------------------- expresiones de zoom
def expr_envolvente(a: float, b: float, r: float) -> str:
    r = max(0.15, min(r, (b - a) / 2 - 0.01))
    p = f"clip(min((t-{a:.3f})/{r:.3f},({b:.3f}-t)/{r:.3f}),0,1)"
    return f"({p}*{p}*(3-2*{p}))"


def expr_zoom(zs: list[dict]) -> str:
    return "(1" + "".join(f"+{(z['escala'] - 1):.4f}*{expr_envolvente(z['t0'], z['t1'], 0.55)}" for z in zs) + ")"


def expr_foco(zs: list[dict], clave: str, defecto: float) -> str:
    if len(zs) == 1:
        return f"{zs[0].get(clave, defecto):.3f}"
    num = "+".join(f"{z.get(clave, defecto):.3f}*{expr_envolvente(z['t0'], z['t1'], 0.55)}" for z in zs)
    den = "+".join(expr_envolvente(z["t0"], z["t1"], 0.55) for z in zs)
    return f"(({num}+{defecto}*0.001)/({den}+0.001))"


# ---------------------------------------------------------------- construccion
def mapa_a_salida(cortes: list[dict], a: float, b: float) -> tuple[float, float] | None:
    """Intervalo de fuente -> intervalo de salida, dentro del primer tramo con el que se solapa (None si fue cortado)."""
    for (s0, s1, f0, f1, v) in E.lineas(cortes):
        if b > f0 + EPS and a < f1 - EPS:
            a2, b2 = max(a, f0), min(b, f1)
            return s0 + (a2 - f0) / v, s0 + (b2 - f0) / v
    return None


def mapa_extendido(cortes: list[dict], a: float, b: float) -> tuple[float, float] | None:
    """Como mapa_a_salida, pero un intervalo que cruza cortes pequenos se mantiene continuo (un acercamiento
    sostenido sobre varios tramos): del inicio del primer tramo tocado al final del ultimo."""
    tocados = [l for l in E.lineas(cortes) if b > l[2] + EPS and a < l[3] - EPS]
    if not tocados:
        return None
    primero, ultimo = tocados[0], tocados[-1]
    t0 = primero[0] + (max(a, primero[2]) - primero[2]) / primero[4]
    t1 = ultimo[0] + (min(b, ultimo[3]) - ultimo[2]) / ultimo[4]
    return t0, t1


def construir(ed: dict, proyecto: Path, formato: str, calidad: str, trabajo: Path):
    fuente = resolver_fuente(ed, proyecto)
    if not fuente.is_file():
        salir(f"No encuentro la fuente: {fuente}")
    info = sondear(fuente)
    fps = int(ed.get("fps") or min(round(info["fps"] or 30), 30))
    cortes = E.normalizar_cortes(ed["cortes"], fps)
    if not cortes:
        salir("La edicion no tiene cortes.")
    vertical = formato == "vertical"
    vcfg = ed.get("vertical", {})
    desde = 0.0
    if vertical and vcfg.get("duracion_max"):
        palabras = E.cargar_palabras(proyecto, ed)
        cortes, desde, _hasta = E.recortar_a_duracion(cortes, palabras, float(vcfg["duracion_max"]), float(vcfg.get("desde") or 0.0))
        cortes = E.normalizar_cortes(cortes, fps)
    W, H = dimensiones(formato, calidad, info)
    ficha = ficha_o_neutra(str(proyecto))
    reparadas, avisos = E.reparar_frases_clave(ed, E.cargar_palabras(proyecto, ed))
    ed["_avisos"] = {"reparadas": reparadas, "avisos": avisos}
    fade = float(ed.get("audio", {}).get("fade", 0.02))
    tiene_audio = info["tiene_audio"]
    n = len(cortes)

    g: list[str] = []
    # --- tramos
    for i, c in enumerate(cortes):
        a, b, v = c["inicio"], c["fin"], c["velocidad"]
        g.append(f"[0:v]trim=start={a:.4f}:end={b:.4f},setpts=(PTS-STARTPTS)/{v},fps={fps}[v{i}]")
        if tiene_audio:
            largo = (b - a) / v
            f = min(fade, largo / 4)
            tempo = ""
            vv = v
            while vv > 2.0 + EPS:
                tempo += ",atempo=2.0"
                vv /= 2.0
            if abs(vv - 1.0) > EPS:
                tempo += f",atempo={vv:.4f}"
            g.append(f"[0:a]atrim=start={a:.4f}:end={b:.4f},asetpts=PTS-STARTPTS{tempo},"
                     f"afade=t=in:st=0:d={f:.3f},afade=t=out:st={largo - f:.4f}:d={f:.3f},aresample=48000[a{i}]")
    union = "".join(f"[v{i}]" + (f"[a{i}]" if tiene_audio else "") for i in range(n))
    g.append(f"{union}concat=n={n}:v=1:a={1 if tiene_audio else 0}[vc]" + ("[ac]" if tiene_audio else ""))

    # --- formato
    foco = float(vcfg.get("foco_x", 0.5))
    if vertical and vcfg.get("modo") == "fondo_difuso":
        g.append(f"[vc]split=2[bg0][fg0]")
        g.append(f"[bg0]scale={W // 8}:{H // 8},gblur=sigma=4,"
                 f"scale={W}:{H},eq=brightness=-0.1[bg]")
        g.append(f"[fg0]scale={W}:-2[fg]")
        g.append("[bg][fg]overlay=x=(W-w)/2:y=(H-h)/2[vf]")
    elif vertical:
        g.append(f"[vc]scale=-2:{H},crop={W}:{H}:x='min(max(iw*{foco:.3f}-{W}/2,0),iw-{W})':y=0[vf]")
    else:
        g.append(f"[vc]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}:x='(iw-{W})*0.5':y='(ih-{H})*0.5'[vf]")

    # --- zooms
    zs = []
    for z in ed.get("zooms", []):
        m = mapa_extendido(cortes, z["inicio"], z["fin"])
        if m and m[1] - m[0] > 0.8 and z.get("escala", 1) > 1.001:
            zs.append({**z, "t0": m[0], "t1": m[1]})
    zs.sort(key=lambda z: z["t0"])
    for i in range(len(zs) - 1):  # sin solapes
        zs[i]["t1"] = min(zs[i]["t1"], zs[i + 1]["t0"] - 0.05)
    zs = [z for z in zs if z["t1"] - z["t0"] > 0.8]
    actual = "vf"
    if zs:
        zexp, fx, fy = expr_zoom(zs), expr_foco(zs, "foco_x", 0.5), expr_foco(zs, "foco_y", 0.45)
        g.append(f"[vf]scale=w='trunc({W}*{zexp}/2)*2':h='trunc({H}*{zexp}/2)*2':eval=frame:flags=bicubic,"
                 f"crop={W}:{H}:x='min(max((iw-{W})*{fx},0),iw-{W})':y='min(max((ih-{H})*{fy},0),ih-{H})'[vz]")
        actual = "vz"

    entradas: list[Path] = []  # PNG generados (se borran despues)
    # --- tarjetas de frase clave (deslizan desde arriba en 0.2 s; los subtitulos se apartan mientras estan)
    ent_idx = 1
    huecos_tarjeta: list[tuple[float, float]] = []
    for k, t in enumerate(ed.get("tarjetas", [])):
        m = mapa_extendido(cortes, t["inicio"], t["fin"])
        if not m or m[1] - m[0] < 0.8:
            continue
        t0, t1 = m[0], min(m[1], m[0] + 2.5)
        ruta = trabajo / f"tarjeta{k:02d}.png"
        png_tarjeta(t["texto"], W, H, vertical, ficha, ruta)
        entradas.append(ruta)
        huecos_tarjeta.append((t0, t1))
        g.append(f"[{actual}][{ent_idx}:v]overlay=x=0:y='-{H}*pow(1-clip((t-{t0:.3f})/0.2,0,1),3)':"
                 f"enable='between(t,{t0:.3f},{t1:.3f})':format=auto[vt{ent_idx}]")
        actual = f"vt{ent_idx}"
        ent_idx += 1

    # --- subtitulos
    sub_cfg = ed.get("subtitulos", {})
    subs_png = []
    if sub_cfg.get("modo", "ninguno") != "ninguno":
        for k, s in enumerate(sub_cfg.get("frases", [])):
            m = mapa_extendido(cortes, s["inicio"], s["fin"])
            if not m or m[1] - m[0] < 0.25:
                continue
            for (h0, h1) in huecos_tarjeta:  # tarjeta y subtitulo NUNCA coinciden en el tiempo
                if m[0] < h1 and m[1] > h0:
                    m = (m[0], h0 - 0.05) if (m[0] < h0 - 0.45) else (h1 + 0.05, m[1])
            if m[1] - m[0] < 0.45:
                continue
            ruta = trabajo / f"sub{len(subs_png):03d}.png"
            w, h, px, py = png_subtitulo(s["texto"], bool(s.get("destacar")), W, H, vertical, ficha, sub_cfg.get("estilo", {}), ruta)
            entradas.append(ruta)
            subs_png.append((ruta, m[0], m[1], px, py))
    logo = None
    lg = ficha.get("logo")
    if ed.get("marca", {}).get("logo", True) and lg and Path(lg).expanduser().is_file():
        logo = Path(lg).expanduser()

    for (ruta, t0, t1, px, py) in subs_png:
        g.append(f"[{actual}][{ent_idx}:v]overlay=x={px}:y={py}:enable='between(t,{t0:.3f},{t1:.3f})':format=auto[vs{ent_idx}]")
        actual = f"vs{ent_idx}"
        ent_idx += 1
    if logo:
        lw = int(W * (0.1 if not vertical else 0.16))
        g.append(f"[{ent_idx}:v]scale={lw}:-1[lg]")
        g.append(f"[{actual}][lg]overlay=x=W-w-{int(W * 0.03)}:y={int(H * (0.03 if not vertical else 0.07))}:format=auto[vl]")
        actual = "vl"
    g.append(f"[{actual}]format=yuv420p[vout]")
    if tiene_audio:
        af = "loudnorm=I=-16:TP=-1.5:LRA=11," if ed.get("audio", {}).get("loudnorm") else ""
        g.append(f"[ac]{af}aresample=48000[aout]")
    return g, [str(fuente)] + [str(p) for p in entradas] + ([str(logo)] if logo else []), entradas, (W, H, fps, tiene_audio), cortes


def render(ed_ruta: Path, formato: str = "horizontal", calidad: str = "borrador", salida: Path | None = None,
           proyecto: Path | None = None) -> dict:
    ed_ruta = Path(ed_ruta).resolve()
    ed = leer_json(ed_ruta)
    proyecto = Path(proyecto).resolve() if proyecto else ed_ruta.parent.parent
    nombre = ed_ruta.name.replace(".edicion.json", "")
    if salida is None:
        sufijo = "" if formato == "horizontal" else ".vertical"
        salida = ed_ruta.with_name(f"{nombre}{sufijo}.mp4")
    trabajo = proyecto / ".trabajo" / f"{nombre}-{formato}"
    trabajo.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    g, entradas_args, generados, (W, H, fps, tiene_audio), cortes = construir(ed, proyecto, formato, calidad, trabajo)
    script = trabajo / "filtros.txt"
    script.write_text(";\n".join(g), encoding="utf-8")

    cmd = [exe("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", "-i", entradas_args[0]]
    for e in entradas_args[1:]:
        cmd += ["-i", e]
    preset, crf = ("veryfast", "23") if calidad == "borrador" else ("medium", "18")
    mapa = ["-map", "[vout]"] + (["-map", "[aout]"] if tiene_audio else [])
    codec = ["-c:v", "libx264", "-preset", preset, "-crf", crf, "-pix_fmt", "yuv420p", "-r", str(fps)]
    if tiene_audio:
        codec += ["-c:a", "aac", "-b:a", "160k", "-ar", "48000"]
    cola = ["-movflags", "+faststart", str(salida)]
    r = correr(cmd + ["-filter_complex_script", str(script)] + mapa + codec + cola)
    if r.returncode != 0 and b"filter_complex_script" in r.stderr:  # ffmpeg recientes: -/filter_complex archivo
        r = correr(cmd + ["-/filter_complex", str(script)] + mapa + codec + cola)
    if r.returncode != 0:
        salir("El render fallo:\n" + r.stderr.decode("utf-8", "replace")[-3000:] + f"\n(filtros en {script})")
    # limpieza: SOLO lo que este render genero, con lista explicita
    for p in [*generados, script]:
        try:
            Path(p).unlink()
        except FileNotFoundError:
            pass
    try:
        trabajo.rmdir()
        trabajo.parent.rmdir()
    except OSError:
        pass  # no vacio: otra cosa lo usa; no se toca
    dur = sondear(salida)
    return {"avisos": ed.get("_avisos", {}).get("avisos", []), "reparadas": ed.get("_avisos", {}).get("reparadas", []),
            "salida": str(salida), "formato": formato, "calidad": calidad, "resolucion": f"{dur['ancho']}x{dur['alto']}",
            "duracion": round(dur["duracion"], 2), "duracion_esperada": round(E.duracion_salida(cortes), 2),
            "segundos_de_render": round(time.time() - t0, 1)}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("edicion")
    ap.add_argument("--formato", choices=["horizontal", "vertical"], default="horizontal")
    ap.add_argument("--calidad", choices=["borrador", "final"], default="borrador")
    ap.add_argument("--salida")
    ap.add_argument("--proyecto")
    a = ap.parse_args()
    res = render(Path(a.edicion), a.formato, a.calidad, Path(a.salida) if a.salida else None, Path(a.proyecto) if a.proyecto else None)
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
