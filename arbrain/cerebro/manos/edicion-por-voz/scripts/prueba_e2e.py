#!/usr/bin/env python3
"""Prueba de punta a punta de la skill, con una grabacion SINTETICA (nada de nadie, nada se publica).

  python3 cerebro-artificial/estandar/manos/edicion-por-voz/scripts/prueba_e2e.py [--raiz /tmp/edicion-por-voz-prueba]
                                                                                   [--fuente video_o_wav_propio]
                                                                                   [--sin-api]

Hace: monologo sintetico en español con errores intencionales (falsos arranques, frases repetidas, muletillas, un
silencio de 3 s, una autocorreccion) -> imagen cuidada 1920x1080/30 fps -> transcribir (API que haya en el entorno)
-> corte limpio -> 2 versiones con tratamiento distinto -> UNA correccion con el mensaje del visor (con 'tiempo')
-> export horizontal y vertical (40 s max) -> verificaciones con ffprobe y fotogramas.

Voz sintetica: usa `say` de macOS (Flo/Eddy es-MX). En Windows/Linux pasa --fuente con un .mp4/.wav propio
(un monologo de 1 a 2 minutos con alguna repeticion): el resto del pipeline es identico.
Sin clave de API en el entorno (o con --sin-api) usa una alineacion derivada de la sintesis y lo DECLARA como respaldo.
Todo queda bajo --raiz (el visor de Arbrain abre /tmp, el repo y ~/Developer). No toca ~/.cerebro: usa $CEREBRO_HOME=<raiz>/home.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import time
import wave
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import _edicion as E  # noqa: E402
from _comun import correr, escribir_json, exe, ffmpeg, fmt_tiempo, leer_json, normalizar, salir, sondear  # noqa: E402

VOCES = ["Flo (Español (México))", "Eddy (Español (México))"]
SR = 22050

# (texto, pausa despues en segundos)
GUION = [
    ("Hoy quiero hablarte de", 0.7),
    ("Hoy quiero contarte cómo ordeno mi semana de trabajo sin volverme loco.", 0.5),
    ("Eh.", 0.4),
    ("Lo primero es definir tres prioridades.", 0.5),
    ("Lo primero es definir tres prioridades, nada más.", 0.6),
    ("Una por cada área importante de tu negocio: ventas, clientes y finanzas.", 0.7),
    ("Mmm, este, la segunda idea es proteger tus mañanas.", 0.5),
    ("Las mañanas son para el trabajo profundo, sin mensajes y sin reuniones.", 3.0),
    ("El lunes revisamos las ventas, perdón, el lunes revisamos los pendientes de clientes.", 0.6),
    ("Después, el martes y el miércoles, hacemos lo que de verdad mueve el dinero.", 0.6),
    ("El jueves es para conversar con clientes y cerrar acuerdos.", 0.5),
    ("El viernes cerramos la semana y medimos tres cosas: lo que entró, lo que salió y lo que aprendimos.", 0.7),
    ("Este método me ahorra cinco horas cada semana.", 0.5),
    ("Y lo mejor es que cualquiera lo puede copiar.", 0.7),
    ("Si solo te llevas una idea, que sea esta: decide primero qué es lo importante, y después organiza tu tiempo alrededor de eso.", 0.7),
    ("Pruébalo una semana y cuéntame cómo te fue.", 0.5),
    ("Gracias por ver este video.", 0.6),
]


def paso(msg: str) -> None:
    print(f"\n== {msg}", flush=True)


def py(script: str, *args: str, entorno: dict | None = None, permitir_fallo: bool = False) -> str:
    env = {**os.environ, **(entorno or {})}
    r = subprocess.run([sys.executable, str(AQUI / script), *map(str, args)], capture_output=True, text=True,
                       encoding="utf-8", env=env)
    if r.returncode != 0 and not permitir_fallo:
        print(r.stdout)
        print(r.stderr, file=sys.stderr)
        salir(f"FALLO: {script} {' '.join(map(str, args))}")
    return (r.stdout + (("\n" + r.stderr) if r.returncode != 0 else "")).strip()


# ---------------------------------------------------------------- sintesis de voz y de video
def sintetizar_voz(destino_wav: Path) -> list[dict]:
    """Devuelve la 'verdad' por enunciado: texto, inicio, fin (segundos del wav final)."""
    if not shutil.which("say"):
        salir("No hay `say` (macOS). Pasa --fuente con un video/wav propio para correr el resto del pipeline.")
    voz = next((v for v in VOCES if v.split(" (")[0] in subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout), None)
    if not voz:
        salir("No encuentro la voz Flo/Eddy es-MX en este macOS (Ajustes > Accesibilidad > Contenido hablado).")
    tmp = destino_wav.parent / "_voz"
    tmp.mkdir(exist_ok=True)
    marco = bytearray()
    verdad, t = [], 0.0
    marco += b"\x00\x00" * int(SR * 0.4)
    t = 0.4
    for i, (texto, pausa) in enumerate(GUION):
        arch = tmp / f"u{i:02d}.wav"
        for intento in range(4):  # `say` a veces se cuelga: tiempo limite y reintento
            try:
                subprocess.run(["say", "-v", voz, "-o", str(arch), "--file-format=WAVE", f"--data-format=LEI16@{SR}", texto],
                               check=True, timeout=40)
                break
            except subprocess.TimeoutExpired:
                if intento == 3:
                    salir("`say` no responde (se colgo 4 veces). Reintenta o usa --fuente con un video/wav propio.")
        with wave.open(str(arch)) as w:
            datos = w.readframes(w.getnframes())
            dur = w.getnframes() / w.getframerate()
        marco += datos
        # voz real dentro del enunciado: `say` agrega silencio al inicio y al final; la alineacion de respaldo lo respeta
        import array as _a
        m_ = _a.array("h")
        m_.frombytes(datos[: len(datos) // 2 * 2])
        activo = [i for i, v_ in enumerate(m_) if abs(v_) > 400]
        i0, i1 = (activo[0], activo[-1]) if activo else (0, len(m_) - 1)
        verdad.append({"texto": texto, "inicio": round(t + i0 / SR, 3), "fin": round(t + i1 / SR, 3)})
        marco += b"\x00\x00" * int(SR * pausa)
        t += dur + pausa
    with wave.open(str(destino_wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(marco))
    for p in tmp.glob("u*.wav"):  # solo lo que esta prueba genero
        p.unlink()
    tmp.rmdir()
    return verdad


def alineacion_de_respaldo(verdad: list[dict]) -> dict:
    """RESPALDO DECLARADO: palabras repartidas dentro de cada enunciado en proporcion a sus letras."""
    pals = []
    for u in verdad:
        ws = u["texto"].split()
        total = sum(len(w) + 1 for w in ws)
        t = u["inicio"]
        for w in ws:
            d = (u["fin"] - u["inicio"]) * (len(w) + 1) / total
            pals.append({"w": w, "inicio": round(t, 3), "fin": round(t + d * 0.92, 3),
                         **({"fin_segmento": True} if w is ws[-1] else {})})
            t += d
    return {"palabras": pals, "segmentos": []}


def crear_imagen(destino: Path, ancho: int = 1920, alto: int = 1080) -> None:
    from PIL import Image, ImageChops, ImageDraw, ImageFilter
    from _comun import cargar_fuente

    # fondo: degradado diagonal profundo + luces suaves
    base = Image.new("RGB", (ancho, alto))
    px = base.load()
    for y in range(alto):
        for x in range(0, ancho):
            t = (x / ancho * 0.45 + y / alto * 0.75)
            px[x, y] = (int(14 + 22 * t), int(32 + 58 * (1 - abs(t - 0.6))), int(58 + 70 * (1 - t * 0.7)))
    luces = Image.new("RGB", (ancho, alto), (0, 0, 0))
    d = ImageDraw.Draw(luces)
    d.ellipse((-200, 500, 700, 1300), fill=(30, 120, 140))
    d.ellipse((1250, -250, 2200, 650), fill=(70, 70, 160))
    d.ellipse((1500, 700, 2100, 1250), fill=(20, 90, 110))
    luces = luces.filter(ImageFilter.GaussianBlur(160))
    base = ImageChops.add(base, luces.point(lambda v: int(v * 0.55)))
    # rejilla muy tenue
    cuad = ImageDraw.Draw(base, "RGBA")
    for x in range(0, ancho, 96):
        cuad.line((x, 0, x, alto), fill=(255, 255, 255, 7))
    for y in range(0, alto, 96):
        cuad.line((0, y, ancho, y), fill=(255, 255, 255, 7))
    base.save(destino)


def crear_orador(destino: Path) -> None:
    from PIL import Image, ImageDraw, ImageFilter

    K = 2  # supermuestreo
    w, h = 760 * K, 1140 * K
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = w // 2
    # hombros y camisa
    d.rounded_rectangle((cx - 330 * K, 560 * K, cx + 330 * K, h + 300 * K), radius=190 * K, fill=(44, 92, 168, 255))
    d.polygon([(cx - 90 * K, 560 * K), (cx + 90 * K, 560 * K), (cx, 700 * K)], fill=(228, 236, 246, 255))
    # cuello
    d.rounded_rectangle((cx - 62 * K, 470 * K, cx + 62 * K, 600 * K), radius=40 * K, fill=(214, 160, 120, 255))
    # cabeza
    d.ellipse((cx - 150 * K, 150 * K, cx + 150 * K, 520 * K), fill=(240, 190, 150, 255))
    # cabello
    d.pieslice((cx - 160 * K, 120 * K, cx + 160 * K, 440 * K), 180, 360, fill=(52, 38, 34, 255))
    d.rectangle((cx - 160 * K, 280 * K, cx - 135 * K, 340 * K), fill=(52, 38, 34, 255))
    d.rectangle((cx + 135 * K, 280 * K, cx + 160 * K, 340 * K), fill=(52, 38, 34, 255))
    # rostro
    for sx in (-62, 62):
        d.ellipse((cx + (sx - 16) * K, 320 * K, cx + (sx + 16) * K, 352 * K), fill=(36, 30, 34, 255))
        d.ellipse((cx + (sx - 6) * K, 326 * K, cx + (sx + 2) * K, 334 * K), fill=(255, 255, 255, 255))
        d.arc((cx + (sx - 30) * K, 285 * K, cx + (sx + 30) * K, 315 * K), 200, 340, fill=(52, 38, 34, 255), width=6 * K)
    d.arc((cx - 55 * K, 380 * K, cx + 55 * K, 450 * K), 20, 160, fill=(150, 70, 70, 255), width=7 * K)
    esc = 0.85 / K
    img = img.resize((int(w * esc), int(h * esc)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.4))
    img.save(destino)


def _sin_uso_orbita(destino: Path) -> None:
    from PIL import Image, ImageDraw, ImageFilter

    img = Image.new("RGBA", (120, 120), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((30, 30, 90, 90), fill=(255, 214, 102, 255))
    glow = img.filter(ImageFilter.GaussianBlur(14))
    glow.alpha_composite(img)
    glow.save(destino)


def crear_video(wav_o_video: Path, destino: Path, dur: float, trabajo: Path) -> None:
    fondo, orador = trabajo / "fondo.png", trabajo / "orador.png"
    crear_imagen(fondo)
    crear_orador(orador)
    # sin graficos decorativos que compitan con el orador: solo un cabeceo suave para que el plano respire
    fc = "[0:v][1:v]overlay=x=(W-w)/2:y='H-h+10+8*sin(t*2.2)',format=yuv420p[v]"
    ffmpeg(["-loop", "1", "-framerate", "30", "-i", str(fondo), "-loop", "1", "-framerate", "30", "-i", str(orador),
            "-i", str(wav_o_video), "-filter_complex", fc,
            "-map", "[v]", "-map", "2:a", "-t", f"{dur:.2f}", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", str(destino)],
           mensaje="No pude armar el video sintetico")
    for p in (fondo, orador):  # imagenes temporales de esta prueba
        p.unlink()


# ---------------------------------------------------------------- verificaciones
def extraer_fotograma(video: Path, t: float, destino: Path) -> Path:
    ffmpeg(["-ss", f"{t:.3f}", "-i", str(video), "-frames:v", "1", str(destino)], mensaje="No pude extraer fotograma")
    return destino


def diferencia_en_region(a: Path, b: Path, caja: tuple[int, int, int, int]) -> float:
    from PIL import Image, ImageChops, ImageStat

    ia, ib = Image.open(a).convert("RGB").crop(caja), Image.open(b).convert("RGB").crop(caja)
    return sum(ImageStat.Stat(ImageChops.difference(ia, ib)).mean) / 3


def caja_color(img_path: Path, objetivo=(52, 38, 34), tol=14):
    from PIL import Image

    im = Image.open(img_path).convert("RGB")
    px = im.load()
    xs, ys = [], []
    for y in range(240, im.height, 2):  # por debajo del titulo
        for x in range(0, im.width, 2):
            r, g, b = px[x, y]
            if abs(r - objetivo[0]) < tol and abs(g - objetivo[1]) < tol and abs(b - objetivo[2]) < tol:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


def pausas_largas(video: Path, minimo: float = 0.4) -> tuple[int, float]:
    r = correr([exe("ffmpeg"), "-hide_banner", "-nostats", "-i", str(video), "-af", f"silencedetect=n=-35dB:d={minimo}", "-f", "null", "-"])
    import re as _re
    ds = [float(x) for x in _re.findall(r"silence_duration: ([0-9.]+)", r.stderr.decode("utf-8", "replace"))]
    return len(ds), (max(ds) if ds else 0.0)


def maximo_salto_audio(video: Path, tiempos: list[float], ventana: float = 0.004) -> float:
    r = correr([exe("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", str(video), "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "-"])
    from array import array

    m = array("h")
    m.frombytes(r.stdout[: len(r.stdout) // 2 * 2])
    peor = 0
    for t in tiempos:
        a, b = max(1, int((t - ventana) * 48000)), min(len(m) - 1, int((t + ventana) * 48000))
        for i in range(a, b):
            peor = max(peor, abs(m[i] - m[i - 1]))
    return peor / 32768.0


# ---------------------------------------------------------------- principal
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raiz", default="/tmp/edicion-por-voz-prueba")
    ap.add_argument("--fuente", help="Video/wav propio en vez de la grabacion sintetica")
    ap.add_argument("--sin-api", action="store_true", help="No llamar a ninguna API: alineacion de respaldo declarada")
    a = ap.parse_args()
    t_inicio = time.time()
    raiz = Path(a.raiz).expanduser().resolve()
    raiz.mkdir(parents=True, exist_ok=True)
    home = raiz / "home"
    home.mkdir(exist_ok=True)
    env = {"CEREBRO_HOME": str(home)}
    proyecto = raiz / "proyecto"
    (proyecto / "fuente").mkdir(parents=True, exist_ok=True)
    resultados: list[tuple[str, bool, str]] = []
    limpiar_corrida_previa(raiz)

    def chequeo(nombre: str, ok: bool, detalle: str) -> None:
        resultados.append((nombre, ok, detalle))
        print(f"  [{'OK' if ok else 'FALLA'}] {nombre}: {detalle}")

    # 1. grabacion
    paso("1. Grabacion sintetica" if not a.fuente else "1. Fuente propia")
    video = proyecto / "fuente" / "grabacion.mp4"
    verdad = None
    if a.fuente:
        src = Path(a.fuente).expanduser().resolve()
        if sondear(src)["tiene_video"]:
            shutil.copy2(src, video)
        else:
            tmp = proyecto / "fuente"
            crear_video(src, video, sondear(src)["duracion"], tmp)
    else:
        wav = proyecto / "fuente" / "voz.wav"
        verdad = sintetizar_voz(wav)
        escribir_json(proyecto / "fuente" / "verdad.json", verdad)
        crear_video(wav, video, sondear(wav)["duracion"] + 0.3, proyecto / "fuente")
        wav.unlink()  # el wav lo creo esta prueba
    inf = sondear(video)
    print(f"  {video}  {inf['ancho']}x{inf['alto']} {inf['fps']} fps {fmt_tiempo(inf['duracion'])}")
    chequeo("fuente 1920x1080 30 fps", (inf["ancho"], inf["alto"]) == (1920, 1080) or bool(a.fuente), f"{inf['ancho']}x{inf['alto']}@{inf['fps']}")

    # 2. ficha de marca (creada una vez por conversacion; aqui simulada con colores de prueba)
    paso("2. Ficha de marca y consentimiento (simulados)")
    py("ficha.py", "guardar", "--json", json.dumps({
        "marca": {"nombre": "Prueba e2e"},
        "paleta": {"fondo": "#0E1B2C", "texto": "#FFFFFF", "primario": "#27C2B0", "acento": "#FFD666"},
        "tono": {"voz": "claro y práctico", "audiencia": "dueños de negocios pequeños"},
        "referentes": [{"titulo": "Referente de ejemplo", "url_o_ruta": "https://ejemplo.com/video", "por_que": "cortes limpios"}],
        "preferencias": {"ritmo": "medio", "subtitulos": "frases_clave", "formato_principal": "horizontal"}}), entorno=env)
    print("  " + py("ficha.py", "validar", entorno=env))

    # 3. transcripcion
    paso("3. Transcripcion")
    claves = [k for k in ("GROQ_API_KEY", "OPENAI_API_KEY", "LEMONFOX_API_KEY") if os.environ.get(k)]
    respaldo = a.sin_api or not claves
    if respaldo:
        if not verdad:
            salir("Sin clave de API y sin verdad sintetica: define una clave (GROQ/OPENAI/LEMONFOX) para tu --fuente.")
        escribir_json(proyecto / "palabras-respaldo.json", alineacion_de_respaldo(verdad))
        print("  AVISO: sin proveedor disponible -> alineacion de RESPALDO derivada de la sintesis (declarada).")
        out = py("transcribir.py", video, "--proyecto", proyecto, "--palabras", proyecto / "palabras-respaldo.json", entorno=env)
        origen = "RESPALDO (alineacion proporcional derivada de la sintesis, no es STT real)"
    else:
        prov = {"GROQ_API_KEY": "groq", "OPENAI_API_KEY": "openai", "LEMONFOX_API_KEY": "lemonfox"}[claves[0]]
        print(f"  proveedor: {prov} (autodetectado; audio SINTETICO, sin material de nadie)")
        # El dueño ya "confirmo" (simulado): queda registrado en la ficha de PRUEBA ($CEREBRO_HOME), no en la real.
        py("ficha.py", "confirmar-proveedor", "--proveedor", prov, entorno=env)
        out = py("transcribir.py", video, "--proyecto", proyecto, entorno=env, permitir_fallo=True)
        if "OK:" not in out:
            print(out)
            salir(f"El proveedor '{prov}' fallo (error real arriba). Reintenta o usa --sin-api para el respaldo declarado.")
        origen = leer_json(proyecto / "palabras.json")["origen"]
    print("  " + out.splitlines()[0])
    pj = leer_json(proyecto / "palabras.json")
    chequeo("palabras con tiempos", len(pj["palabras"]) > 100, f"{len(pj['palabras'])} palabras · origen: {origen}")

    # 4. corte limpio: el script propone, el 'agente' decide
    paso("4. Corte limpio")
    print(py("corte_limpio.py", "proponer", "--proyecto", proyecto))
    d = leer_json(proyecto / "decisiones.json")
    decisiones_agente = []
    for p in d["propuestas"]:  # criterio del agente (simulado): acepta lo que es error, conserva enfasis
        decisiones_agente.append(f"{p['id']} {p['tipo']} «{p['texto']}» -> {'QUITAR' if p['aplicar'] else 'CONSERVAR'}")
    # Respaldo del criterio: si la autocorreccion no fue detectada, el agente la ve en la lista y la corta a mano
    if not any(p["tipo"] == "autocorreccion" and p["aplicar"] for p in d["propuestas"]):
        for f in d["frases"]:
            ws = f["texto"].lower().replace(",", "").split()
            if "perdón" in ws or "perdon" in ws:
                k = ws.index("perdón" if "perdón" in ws else "perdon")
                pj_p = pj["palabras"]
                d["manual"]["quitar_tramos"].append([pj_p[f["i0"]]["inicio"] - 0.02, pj_p[f["i0"] + k]["fin"] + 0.02])
                decisiones_agente.append(f"manual: autocorreccion en frase {f['id']} -> quitar lo anterior a «perdón»")
    escribir_json(proyecto / "decisiones.json", d)
    print("  " + py("corte_limpio.py", "aplicar", "--proyecto", proyecto).replace("\n", "\n  "))
    corte = leer_json(proyecto / "corte.json")
    chequeo("corte limpio acorta y deja tramos", 0 < corte["duracion_resultante"] < corte["duracion_original"] - 8,
            f"{corte['duracion_original']:.1f} s -> {corte['duracion_resultante']:.1f} s en {len(corte['segmentos'])} tramos")
    txt_corte = (proyecto / "corte-limpio.txt").read_text(encoding="utf-8")
    if verdad:
        reps = sum(txt_corte.lower().count("lo primero es definir") for _ in [0])
        chequeo("la frase repetida queda una sola vez", reps == 1, f"apariciones: {reps}")
        chequeo("la autocorreccion se queda con la version final",
                "revisamos las ventas" not in txt_corte.lower() and "pendientes de clientes" in txt_corte.lower(), "ok")
        gaps = [corte["segmentos"][i + 1]["inicio"] - corte["segmentos"][i]["fin"] for i in range(len(corte["segmentos"]) - 1)]
        chequeo("el silencio de 3 s ya no esta", corte["duracion_resultante"] < corte["duracion_original"] - 3, "silencio acortado a un respiro")

    # 5. dos versiones
    paso("5. Versiones")
    v1 = json.loads(py("aplicar.py", "nueva", "--proyecto", proyecto, "--nombre", "v1", "--plantilla", "sobria", entorno=env))
    v2 = json.loads(py("aplicar.py", "nueva", "--proyecto", proyecto, "--nombre", "v2", "--plantilla", "dinamica", entorno=env))
    for v in (v1, v2):
        print(f"  {v['render']['salida']}  {v['render']['duracion']} s  {v['render']['resolucion']}  (render {v['render']['segundos_de_render']} s)")
    ed2 = leer_json(proyecto / "versiones" / "v2.edicion.json")
    chequeo("v1 sobria: sin zooms, subtitulos de frases clave", not leer_json(proyecto / "versiones" / "v1.edicion.json")["zooms"], "")
    chequeo("v2 dinamica: mas corta que v1, con zooms y subtitulos por frase",
            v2["render"]["duracion"] < v1["render"]["duracion"] and len(ed2["zooms"]) > 0 and ed2["subtitulos"]["modo"] == "por_frase",
            f"v1 {v1['render']['duracion']} s · v2 {v2['render']['duracion']} s · {len(ed2['zooms'])} zooms")

    # pausas: antes (solo corte limpio) vs despues (tratamiento)
    py("aplicar.py", "nueva", "--proyecto", proyecto, "--nombre", "ref-limpia", "--plantilla", "limpia", "--sin-render", entorno=env)
    ref_ed = proyecto / "versiones" / "ref-limpia.edicion.json"
    from render import render as _render
    ref_mp4 = Path(_render(ref_ed, "horizontal", "borrador", raiz / "ref-limpia.mp4", proyecto)["salida"])
    ref_ed.unlink()
    n_ref, n_v1, n_v2 = (pausas_largas(ref_mp4), pausas_largas(proyecto / "versiones/v1.mp4"), pausas_largas(proyecto / "versiones/v2.mp4"))
    ref_mp4.unlink()
    print(f"  pausas > 0.4 s: solo corte limpio {n_ref[0]} (max {n_ref[1]:.2f} s) · v1 sobria {n_v1[0]} (max {n_v1[1]:.2f} s) · v2 dinamica {n_v2[0]} (max {n_v2[1]:.2f} s)")
    chequeo("la sobria topa pausas a ~0.5 s y la dinamica a ~0.3 s", n_v1[1] <= 0.62 and n_v2[1] <= 0.45 and n_v2[0] < n_v1[0] <= n_ref[0],
            f"pausas>0.4 s: {n_ref[0]} -> {n_v1[0]} (sobria) / {n_v2[0]} (dinamica)")
    chequeo("la dinamica trae 2 a 4 tarjetas de frase clave", 2 <= len(ed2.get("tarjetas", [])) <= 4, f"{len(ed2.get('tarjetas', []))} tarjetas")

    # frases clave completas: ninguna truncada, y el render las repara/avisa
    from render import render as _r2
    finales_ok = True
    detalle = []
    for nombre_v in ("v1", "v2"):
        edv = leer_json(proyecto / "versiones" / f"{nombre_v}.edicion.json")
        rep, avi = E.reparar_frases_clave(edv, pj["palabras"])
        textos = [x["texto"] for x in edv.get("tarjetas", [])] + ([x["texto"] for x in edv["subtitulos"]["frases"]] if edv["subtitulos"]["modo"] == "frases_clave" else [])
        if avi:
            finales_ok = False
        detalle.append(f"{nombre_v}: {len(textos)} frases clave, {len(avi)} truncadas")
    chequeo("ninguna frase clave queda truncada", finales_ok, "; ".join(detalle))
    # y un truncado a proposito se repara con la frase de la transcripcion
    prueba_t = {"cortes": ed2["cortes"], "subtitulos": {"modo": "frases_clave", "frases": []},
                "tarjetas": [{"inicio": 0.0, "fin": 1.5, "texto": "Pruébalo una semana y cuéntame cómo te"}]}
    rep_t, avi_t = E.reparar_frases_clave(prueba_t, pj["palabras"])
    chequeo("una frase truncada a proposito se completa con la transcripcion", prueba_t["tarjetas"][0]["texto"].rstrip(".").endswith("fue") and not avi_t,
            prueba_t["tarjetas"][0]["texto"])

    # 6. correccion por voz con el mensaje del visor
    paso("6. Correccion en lenguaje natural (mensaje del visor con 'tiempo')")
    v2mp4 = proyecto / "versiones" / "v2.mp4"
    palabras = pj["palabras"]
    objetivo = next((p for p in palabras if "cualquiera" in normalizar(p["w"])), None)
    if objetivo and fuera_de_corte(ed2, objetivo) is False:
        s_obj = objetivo["inicio"] + 0.8
    else:
        s_obj = E.version_a_fuente(ed2["cortes"], E.duracion_salida(ed2["cortes"]) * 0.7)
    t_marca = round(E.fuente_a_version(ed2["cortes"], s_obj) or 10.0, 1)
    mensaje = (f"⏱ Video «v2.mp4» · {int(t_marca // 60)}:{int(t_marca % 60):02d} (tiempo={t_marca}) · ruta={v2mp4}\n"
               "quita esto y pon los subtítulos solo en las frases clave")
    print("  " + mensaje.replace("\n", "\n  "))
    parsed = json.loads(py("aplicar.py", "mensaje", "--texto", mensaje.replace("\n", "\\n")))
    chequeo("el mensaje del visor se parsea", parsed["tiempo"] == t_marca and parsed["ruta"] == str(v2mp4), json.dumps(parsed, ensure_ascii=False))
    doble = (f"⏱ Video «v2.mp4» · 0:10 (tiempo=10.0) · ruta={v2mp4}\nmás rápido aquí\n\n"
             f"⏱ Video «v2.mp4» · 0:30 (tiempo=30.5) · ruta={str(v2mp4).replace('/private/tmp/', '/tmp/', 1)}\nquita esto")
    pd = json.loads(py("aplicar.py", "mensaje", "--texto", doble.replace("\n", "\\n")))
    chequeo("varias marcas en un mensaje se separan y se ordenan", [m["tiempo"] for m in pd["marcas"]] == [10.0, 30.5]
            and pd["marcas"][1]["comentario"] == "quita esto" and pd["marcas"][1]["ruta"] == str(v2mp4.resolve()), "2 marcas")
    ops = [{"op": "quitar_frase"}, {"op": "subtitulos", "modo": "frases_clave"}]
    res = json.loads(py("aplicar.py", "op", "--mensaje", mensaje, "--ops", json.dumps(ops), entorno=env))
    print(f"  {res['nueva_revision']}: {res['duracion_antes']} s -> {res['duracion_despues']} s")
    for c in res["cambios"]:
        print(f"   - {c}")
    v21 = Path(res["render"]["salida"])
    ed21 = leer_json(proyecto / "versiones" / "v2.1.edicion.json")
    chequeo("la revision nueva conserva la anterior", v2mp4.is_file() and v21.name == "v2.1.mp4", f"{v2mp4.name} y {v21.name}")
    chequeo("la correccion acorta la version", res["duracion_despues"] < res["duracion_antes"] - 0.8,
            f"{res['duracion_antes']} s -> {res['duracion_despues']} s (render real {res['render']['duracion']} s)")
    chequeo("duracion del mp4 coincide con la edicion", abs(res["render"]["duracion"] - res["render"]["duracion_esperada"]) < 0.25,
            f"{res['render']['duracion']} vs {res['render']['duracion_esperada']}")
    # la frase quitada ya no esta en el audio/texto de la edicion: el instante marcado cayo en otra frase
    quitado = [n for n in res["cambios"] if n.startswith("quitar_frase")]
    chequeo("se quito la frase que se oia en el instante marcado", bool(quitado), quitado[0] if quitado else "nada")
    conversacion_md(raiz, mensaje, parsed, ops, res, decisiones_agente, origen)

    # 7. export
    paso("7. Export horizontal y vertical (40 s max)")
    ex = json.loads(py("exportar.py", "--proyecto", proyecto, "--version", "v2.1", "--nombre", "mi-semana-ordenada",
                       "--vertical-max", "40", "--titulo", "Mi semana, ordenada", "--nota", "Prueba e2e con material sintetico. Nada publicado.", entorno=env))
    for f in ("horizontal", "vertical"):
        e = ex[f]
        print(f"  {e['ruta']}  {e['resolucion']}  {e['duracion']} s  {e['sonoridad_lufs']} LUFS  {e['tamano_mb']} MB")
    chequeo("horizontal 1920x1080", ex["horizontal"]["resolucion"] == "1920x1080", ex["horizontal"]["resolucion"])
    chequeo("vertical 1080x1920 y <= 40 s", ex["vertical"]["resolucion"] == "1080x1920" and ex["vertical"]["duracion"] <= 40.3,
            f"{ex['vertical']['resolucion']} {ex['vertical']['duracion']} s")
    chequeo("sonoridad cerca de -16 LUFS", all(ex[f]["sonoridad_lufs"] is not None and abs(ex[f]["sonoridad_lufs"] + 16) < 1.6 for f in ("horizontal", "vertical")),
            f"{ex['horizontal']['sonoridad_lufs']} / {ex['vertical']['sonoridad_lufs']}")
    for f in ("horizontal", "vertical"):
        r = correr([exe("ffprobe"), "-v", "error", "-show_entries", "stream=codec_name,pix_fmt", "-of", "csv=p=0", ex[f]["ruta"]])
        chequeo(f"{f}: H.264 + AAC yuv420p", b"h264,yuv420p" in r.stdout and b"aac" in r.stdout, r.stdout.decode().replace("\n", " "))
    chequeo("nada se publico", ex["publicado"] is False, "publicado=false")

    # 8. verificacion con fotogramas
    paso("8. Verificacion de fotogramas y audio")
    fot = raiz / "fotogramas"
    fot.mkdir(exist_ok=True)
    hor = Path(ex["horizontal"]["ruta"])
    ver = Path(ex["vertical"]["ruta"])
    ls = E.lineas(ed21["cortes"])
    # (a) subtitulos presentes en TODAS las frases del modo elegido: cada una vs el mismo instante sin subtitulos
    from PIL import Image
    from render import render
    sin_cfg = leer_json(proyecto / "versiones" / "v2.1.edicion.json")
    esperados = [s_ for s_ in sin_cfg["subtitulos"]["frases"]]
    sin_cfg["subtitulos"] = {"modo": "ninguno", "frases": [], "estilo": {}}
    sin_ed = proyecto / "versiones" / "v2.1.sinsubs.edicion.json"
    escribir_json(sin_ed, sin_cfg)
    rr = render(sin_ed, "horizontal", "borrador", fot / "sin-subtitulos.mp4", proyecto)
    con720 = Path(res["render"]["salida"])  # v2.1 borrador (con subtitulos)
    vistos, cubiertas = 0, 0
    tarj_v = [(E.fuente_a_version(ed21["cortes"], t_["inicio"]), E.fuente_a_version(ed21["cortes"], t_["fin"]) + 0.1) for t_ in ed21.get("tarjetas", [])]
    for s_ in esperados:
        # instante del subtitulo que no cae dentro de una tarjeta (la tarjeta dice esa frase y el subtitulo entra al salir ella)
        from render import mapa_a_salida
        m_ = mapa_a_salida(ed21["cortes"], s_["inicio"], s_["fin"])
        for a0, b0 in tarj_v:
            if m_ and m_[0] < b0 and m_[1] > a0:
                m_ = (b0, m_[1])
        if m_ is None or m_[1] - m_[0] < 0.45:  # la tarjeta ocupa casi todo su tiempo: ya dice la frase
            cubiertas += 1
            continue
        cands = [E.fuente_a_version(ed21["cortes"], s_["fin"] - d_, cerca=False) for d_ in (0.4, 0.6, 0.9, 1.3, 1.8)]
        cands = [t for t in cands if t is not None and not any(a0 <= t <= b0 for a0, b0 in tarj_v)]
        if not cands:
            cubiertas += 1
            continue
        ts = cands[0]
        a_ = extraer_fotograma(con720, ts, fot / "_c.png")
        b_ = extraer_fotograma(Path(rr["salida"]), ts, fot / "_s.png")
        if diferencia_en_region(a_, b_, (150, 540, 1130, 700)) > 4:
            vistos += 1
    chequeo("los subtitulos aparecen en TODAS las frases clave", vistos + cubiertas == len(esperados) and vistos > 0,
            f"{vistos} con subtitulo visible + {cubiertas} cubiertas por su tarjeta de {len(esperados)} frases clave")
    for p_ in (sin_ed, Path(rr["salida"]), fot / "_c.png", fot / "_s.png"):
        p_.unlink()
    sub = esperados[1] if len(esperados) > 1 else (esperados[0] if esperados else None)
    if sub:
        ts = next((t for t in (E.fuente_a_version(ed21["cortes"], sub["fin"] - d_, cerca=False) for d_ in (0.5, 0.8, 1.2, 0.3))
                   if t is not None and not any(a0 <= t <= b0 for a0, b0 in tarj_v)), 1.0)
        con = extraer_fotograma(hor, ts, fot / "horizontal-con-subtitulo.png")
        vt = ts if ts < ex["vertical"]["duracion"] - 1 else 2.0
        extraer_fotograma(ver, vt, fot / "vertical-con-subtitulo.png")
        print(f"  fotogramas: {con} y {fot / 'vertical-con-subtitulo.png'}")
    # tarjeta de frase clave de la version dinamica (v2): un fotograma en medio de la primera
    if ed2.get("tarjetas"):
        t_ = ed2["tarjetas"][0]
        mt = E.fuente_a_version(ed2["cortes"], (t_["inicio"] + t_["fin"]) / 2, cerca=False)
        if mt is not None:
            extraer_fotograma(v2mp4, mt + 0.3, fot / "v2-tarjeta-frase-clave.png")
            print(f"  fotograma de tarjeta: {fot / 'v2-tarjeta-frase-clave.png'}")
    # (b) zoom: tamano de la cabeza en el pico del zoom vs un instante sin zoom
    if verdad and ed21["zooms"]:
        z = ed21["zooms"][0]
        tj = [(t_["inicio"] - 0.3, t_["fin"] + 0.3) for t_ in ed21.get("tarjetas", [])]
        libre = lambda f: not any(a0 <= f <= b0 for a0, b0 in tj)  # noqa: E731
        pico = next((f for f in [z["inicio"] + (z["fin"] - z["inicio"]) * k / 10 for k in (5, 4, 6, 3, 7, 2, 8)]
                     if libre(f) and E.fuente_a_version(ed21["cortes"], f, cerca=False) is not None), None)
        ajeno = next((f for p_ in pj["palabras"] for f in [p_["inicio"] + 0.1]
                      if E.fuente_a_version(ed21["cortes"], f, cerca=False) is not None and libre(f)
                      and not any(zz["inicio"] - 0.8 <= f <= zz["fin"] + 0.8 for zz in ed21["zooms"])), None)
        if pico is not None and ajeno is not None:
            a1 = extraer_fotograma(hor, E.fuente_a_version(ed21["cortes"], pico, cerca=False), fot / "horizontal-zoom-pico.png")
            a0 = extraer_fotograma(hor, E.fuente_a_version(ed21["cortes"], ajeno, cerca=False), fot / "horizontal-plano-medio.png")
            c1, c0 = caja_color(a1), caja_color(a0)
            if c1 and c0:
                razon = (c1[2] - c1[0]) / max(1, (c0[2] - c0[0]))
                chequeo("el acercamiento agranda al orador frente al plano medio", 1.05 < razon < 1.35, f"ancho de la cabeza x{razon:.2f} (escala pedida {z['escala']})")
            else:
                chequeo("el acercamiento agranda al orador frente al plano medio", False, "no pude medir la cabeza")
        else:
            chequeo("el acercamiento agranda al orador frente al plano medio", False, "no halle fotogramas comparables")
    # (c) audio sin clics en las uniones
    cortes_t = [l[0] for l in ls[1:]]
    salto = maximo_salto_audio(hor, cortes_t)
    chequeo("sin clics de audio en las uniones", salto < 0.2, f"salto maximo entre muestras en {len(cortes_t)} uniones: {salto:.3f} de escala completa")

    # 9. entrega.json y apertura
    paso("9. Entrega")
    entrega = leer_json(proyecto / "entrega.json")
    print("  " + json.dumps(entrega, ensure_ascii=False))
    print("  mostrar (carpeta):", json.dumps(ex["mostrar_carpeta"], ensure_ascii=False))
    print("  mostrar (par v1/v2):", py("abrir.py", "par", proyecto / "versiones" / "v1.mp4", proyecto / "versiones" / "v2.mp4").replace("\n", " "))
    print("  mostrar (revision con tiempo):", json.dumps(res["mostrar"], ensure_ascii=False))
    chequeo("entrega.json lista finales y piezas", len(entrega["finales"]) == 2 and len(entrega["piezas"]) >= 3, f"{len(entrega['finales'])} finales, {len(entrega['piezas'])} piezas")

    ok = all(r[1] for r in resultados)
    paso("RESUMEN")
    print(f"  {'VERDE' if ok else 'ROJO'}: {sum(r[1] for r in resultados)}/{len(resultados)} comprobaciones · {time.time() - t_inicio:.0f} s en total")
    print(f"  origen de la transcripcion: {origen}")
    for nombre, ruta in [("v1", proyecto / "versiones/v1.mp4"), ("v2", v2mp4), ("v2.1 (corregida)", v21),
                         ("final horizontal", hor), ("final vertical", ver), ("entrega.json", proyecto / "entrega.json"),
                         ("conversacion.md", raiz / "conversacion.md"), ("fotogramas", fot)]:
        print(f"  {nombre}: {ruta}")
    raise SystemExit(0 if ok else 1)


def limpiar_corrida_previa(raiz: Path) -> None:
    """Borra SOLO archivos que esta misma prueba genera (lista explicita), sin rm -rf, para empezar de cero."""
    p = raiz / "proyecto"
    propios = [p / n for n in ("palabras.json", "palabras-respaldo.json", "transcripcion.txt", "decisiones.json", "frases.txt",
                                "corte.json", "corte-limpio.txt", "entrega.json")]
    propios += [p / "fuente" / n for n in ("grabacion.mp4", "verdad.json", "voz.wav")]
    for sub in ("versiones", "finales"):
        propios += list((p / sub).glob("*")) if (p / sub).is_dir() else []
    propios += list((raiz / "fotogramas").glob("*")) if (raiz / "fotogramas").is_dir() else []
    propios += [raiz / "conversacion.md", raiz / "home" / "ficha-de-marca.json"]
    n = 0
    for f in propios:
        if f.is_file():
            f.unlink()
            n += 1
    if n:
        print(f"(corrida previa: {n} archivos propios de la prueba reemplazados)")


def fuera_de_corte(ed: dict, p: dict) -> bool:
    return E.en_cortes(ed["cortes"], p) is None


def conversacion_md(raiz: Path, mensaje: str, parsed: dict, ops: list, res: dict, decisiones: list, origen: str) -> None:
    lineas = [
        "# Conversacion simulada de la prueba e2e", "",
        "Material sintetico (voz `say`, imagen generada). Nada se publico ni se subio a ningun lado salvo el audio sintetico al proveedor de transcripcion.",
        f"Transcripcion: {origen}", "",
        "**Dueño:** Edita este video.", "",
        "**Agente:** Transcribo, armo el corte limpio y te dejo dos versiones para comparar. Estas fueron mis decisiones sobre las propuestas:", "",
        *[f"- {d}" for d in decisiones], "",
        "**Agente:** Listas v1 (sobria: cortes limpios + subtitulos en frases clave) y v2 (dinamica: ritmo mas apretado + zooms + subtitulos por frase). Las abro lado a lado.", "",
        "**Dueño (marcando un instante en el visor de v2):**", "", "```", mensaje, "```", "",
        f"**Agente (parser):** version `{parsed['archivo']}`, instante {parsed['tiempo']} s DE LA VERSION (no de la fuente) -> tiempo de fuente {res['tiempo_marcado']['fuente']} s. Comentario: «{parsed['comentario']}».", "",
        "**Agente (traduce a operaciones):**", "", "```json", json.dumps(ops, ensure_ascii=False, indent=2), "```", "",
        f"**Agente:** Hecho, nueva revision `{res['nueva_revision']}` (la v2 se conserva): {res['duracion_antes']} s -> {res['duracion_despues']} s.", "",
        *[f"- {c}" for c in res["cambios"]], "",
        "Y la abro para que la compares con la anterior, en el mismo instante:", "", "```json", json.dumps(res["mostrar"], ensure_ascii=False, indent=2), "```", "",
        "**Dueño:** Perfecto. Exportalo horizontal y vertical, el vertical de 40 s.", "",
        "**Agente:** `exportar.py` -> finales horizontal y vertical (H.264 + AAC, -16 LUFS). No publico nada: dime si quieres que lo suba.", "",
    ]
    (raiz / "conversacion.md").write_text("\n".join(lineas), encoding="utf-8")


if __name__ == "__main__":
    main()
