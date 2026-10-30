#!/usr/bin/env python3
"""Transcribe un video/audio con palabras y tiempos -> <proyecto>/palabras.json

Proveedor (API compatible con OpenAI /audio/transcriptions), autodetectado por variable de entorno:
  OPENAI_API_KEY  -> openai   (whisper-1)
  GROQ_API_KEY    -> groq     (whisper-large-v3-turbo)
  LEMONFOX_API_KEY-> lemonfox (whisper-1)
Tambien lee un .env en la carpeta del proyecto o en ~/.cerebro/.env. Fuerza uno con --proveedor.

PRIVACIDAD: el audio SALE de tu maquina hacia ese proveedor. La primera vez hay que decirselo al dueño y
registrar su "si" (ficha.py confirmar-proveedor ...). Sin esa confirmacion este script se niega a enviar nada,
salvo que pases --confirmo (solo para material sintetico o ya autorizado).

Alternativas sin enviar audio:
  --palabras archivo.json   usa una transcripcion tuya (verbose_json de Whisper, lista de {w|word,inicio|start,fin|end}
                            o {"palabras":[...]}).
  --local                   usa faster-whisper si esta instalado (pip install faster-whisper; opcional, mas lento).

Uso:
  transcribir.py VIDEO [--proyecto DIR] [--idioma es] [--proveedor groq] [--palabras p.json] [--local] [--confirmo]
"""
from __future__ import annotations

import argparse
import json
import math
import mimetypes
import os
import tempfile
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from _comun import (casa_cerebro, correr, escribir_json, exe, ffmpeg, leer_json, salir, sondear, variable)

PROVEEDORES = {
    "openai": {"var": "OPENAI_API_KEY", "url": "https://api.openai.com/v1/audio/transcriptions", "modelo": "whisper-1"},
    "groq": {"var": "GROQ_API_KEY", "url": "https://api.groq.com/openai/v1/audio/transcriptions", "modelo": "whisper-large-v3-turbo"},
    "lemonfox": {"var": "LEMONFOX_API_KEY", "url": "https://api.lemonfox.ai/v1/audio/transcriptions", "modelo": "whisper-1"},
}
LIMITE_BYTES = int(float(os.environ.get("CEREBRO_STT_LIMITE_MB", "24")) * 1024 * 1024)  # la API admite 25 MB; dejamos margen


def detectar_proveedor(proyecto: Path | None, forzado: str | None = None, solo_nombre: bool = False):
    orden = [forzado] if forzado else ["groq", "openai", "lemonfox"]
    for nombre in orden:
        if nombre and nombre in PROVEEDORES and variable(PROVEEDORES[nombre]["var"], proyecto):
            return nombre if solo_nombre else (nombre, variable(PROVEEDORES[nombre]["var"], proyecto))
    return None if solo_nombre else (None, None)


# ---------------------------------------------------------------- audio
def extraer_audio(video: Path, destino_dir: Path) -> Path:
    """Audio mono 16 kHz comprimido (voz): ~32 kbps => ~14 MB por hora."""
    salida = destino_dir / "audio.mp3"
    r = correr([exe("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", "-i", str(video), "-vn", "-ac", "1",
                "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k", str(salida)])
    if r.returncode != 0:
        salida = destino_dir / "audio.m4a"
        ffmpeg(["-i", str(video), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "40k", str(salida)],
               mensaje="No pude extraer el audio")
    return salida


def trocear(audio: Path, destino_dir: Path) -> list[tuple[Path, float]]:
    """Devuelve [(archivo, desfase_en_segundos)]. Un solo trozo si cabe en el limite."""
    if audio.stat().st_size <= LIMITE_BYTES:
        return [(audio, 0.0)]
    dur = sondear(audio)["duracion"]
    n = math.ceil(audio.stat().st_size / (LIMITE_BYTES * 0.8))
    paso = math.ceil(dur / n)
    trozos = []
    for i in range(n):
        ini = i * paso
        if ini >= dur:
            break
        salida = destino_dir / f"trozo{i:03d}{audio.suffix}"
        ffmpeg(["-ss", str(ini), "-t", str(paso), "-i", str(audio), "-c", "copy", str(salida)], mensaje="No pude trocear el audio")
        trozos.append((salida, float(ini)))
    return trozos


# ---------------------------------------------------------------- HTTP multipart
def _multipart(campos: list[tuple[str, str]], archivo: Path) -> tuple[bytes, str]:
    borde = "----cerebro" + uuid.uuid4().hex
    partes: list[bytes] = []
    for k, v in campos:
        partes.append(f'--{borde}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode("utf-8"))
    tipo = mimetypes.guess_type(archivo.name)[0] or "application/octet-stream"
    partes.append((f'--{borde}\r\nContent-Disposition: form-data; name="file"; filename="{archivo.name}"\r\n'
                   f"Content-Type: {tipo}\r\n\r\n").encode("utf-8"))
    partes.append(archivo.read_bytes())
    partes.append(f"\r\n--{borde}--\r\n".encode("utf-8"))
    return b"".join(partes), f"multipart/form-data; boundary={borde}"


def llamar_api(prov: str, clave: str, archivo: Path, idioma: str | None) -> dict:
    cfg = dict(PROVEEDORES[prov])
    cfg["url"] = os.environ.get("CEREBRO_STT_URL") or cfg["url"]  # solo para pruebas con un servidor simulado
    campos = [("model", cfg["modelo"]), ("response_format", "verbose_json"),
              ("timestamp_granularities[]", "word"), ("timestamp_granularities[]", "segment")]
    if idioma:
        campos.append(("language", idioma))
    cuerpo, ctype = _multipart(campos, archivo)
    req = urllib.request.Request(cfg["url"], data=cuerpo, method="POST",
                                 headers={"Authorization": f"Bearer {clave}", "Content-Type": ctype,
                                          "User-Agent": "cerebro-edicion-por-voz/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detalle = e.read().decode("utf-8", "replace")[:600]
        salir(f"El proveedor '{prov}' respondio HTTP {e.code}: {detalle}")
    except Exception as e:  # red caida, DNS, timeout
        salir(f"No pude hablar con '{prov}': {e}")


# ---------------------------------------------------------------- normalizacion
def _palabra(p: dict, desfase: float) -> dict | None:
    w = p.get("w") or p.get("word") or p.get("palabra") or p.get("text")
    ini = p.get("inicio", p.get("start"))
    fin = p.get("fin", p.get("end"))
    if w is None or ini is None or fin is None:
        return None
    return {"w": str(w).strip(), "inicio": round(float(ini) + desfase, 3), "fin": round(float(fin) + desfase, 3)}


def normalizar_respuesta(resp: dict | list, desfase: float = 0.0) -> tuple[list[dict], list[dict]]:
    if isinstance(resp, list):
        pals, segs = resp, []
    else:
        pals = resp.get("palabras") or resp.get("words") or []
        segs = resp.get("segmentos") or resp.get("segments") or []
        if not pals:  # algunos proveedores anidan las palabras dentro de los segmentos
            for s in segs:
                pals += s.get("words", [])
    palabras = [x for x in (_palabra(p, desfase) for p in pals) if x and x["w"]]
    segmentos = []
    for s in segs:
        if "start" in s or "inicio" in s:
            segmentos.append({"inicio": round(float(s.get("start", s.get("inicio"))) + desfase, 3),
                              "fin": round(float(s.get("end", s.get("fin"))) + desfase, 3),
                              "texto": str(s.get("text", s.get("texto", ""))).strip()})
    return palabras, segmentos


def marcar_fin_de_segmento(palabras: list[dict], segmentos: list[dict]) -> None:
    for s in segmentos:
        cand = [p for p in palabras if p["inicio"] >= s["inicio"] - 0.15 and p["fin"] <= s["fin"] + 0.15]
        if cand:
            cand[-1]["fin_segmento"] = True


def transcribir_local(video: Path, idioma: str | None) -> tuple[list[dict], list[dict]]:
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError:
        salir("--local necesita faster-whisper (pip install faster-whisper). Es opcional; la ruta por defecto es la API.")
    modelo = WhisperModel(os.environ.get("WHISPER_MODELO", "small"), compute_type="int8")
    segs, _ = modelo.transcribe(str(video), language=idioma, word_timestamps=True)
    palabras, segmentos = [], []
    for s in segs:
        segmentos.append({"inicio": round(s.start, 3), "fin": round(s.end, 3), "texto": s.text.strip()})
        for w in s.words or []:
            palabras.append({"w": w.word.strip(), "inicio": round(w.start, 3), "fin": round(w.end, 3)})
    return palabras, segmentos


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("--proyecto", help="Carpeta del proyecto (por defecto <video>-edicion junto al video)")
    ap.add_argument("--idioma", default="es")
    ap.add_argument("--proveedor", choices=list(PROVEEDORES))
    ap.add_argument("--palabras", help="Transcripcion propia (json) en vez de llamar a una API")
    ap.add_argument("--local", action="store_true", help="faster-whisper local (opcional)")
    ap.add_argument("--confirmo", action="store_true", help="El dueño ya autorizo el envio (o el material es sintetico)")
    a = ap.parse_args()

    video = Path(a.video).expanduser().resolve()
    if not video.is_file():
        salir(f"No existe el video: {video}")
    proyecto = Path(a.proyecto).expanduser().resolve() if a.proyecto else video.with_name(video.stem + "-edicion")
    proyecto.mkdir(parents=True, exist_ok=True)
    info = sondear(video)
    if not info["tiene_audio"]:
        salir("El archivo no tiene pista de audio: no hay nada que transcribir.")

    origen = ""
    if a.palabras:
        palabras, segmentos = normalizar_respuesta(leer_json(a.palabras))
        origen = f"archivo propio ({Path(a.palabras).name})"
    elif a.local:
        palabras, segmentos = transcribir_local(video, a.idioma)
        origen = "faster-whisper local"
    else:
        prov, clave = detectar_proveedor(proyecto, a.proveedor)
        if not prov:
            salir("No encontre ninguna clave: define OPENAI_API_KEY, GROQ_API_KEY o LEMONFOX_API_KEY (entorno, "
                  f"{proyecto / '.env'} o {casa_cerebro() / '.env'}), o usa --palabras / --local.")
        # Consentimiento: una vez, guardado en la ficha.
        from ficha import cargar

        ficha = cargar(str(proyecto)) or {}
        if not a.confirmo and ficha.get("privacidad", {}).get("proveedor_confirmado") != prov:
            salir(f"ALTO: el audio de este video se enviaria a '{prov}'. Dile al dueño que su audio sale de su equipo hacia "
                  f"'{prov}' para transcribirse y pregunta si esta de acuerdo. Si dice que si, corre:\n"
                  f"  python3 ficha.py confirmar-proveedor --proveedor {prov}\n"
                  "y vuelve a lanzar este comando. (Si prefiere no enviar audio: --palabras o --local.)", codigo=3)
        with tempfile.TemporaryDirectory(prefix="cerebro-audio-") as tmp:
            tmpd = Path(tmp)
            audio = extraer_audio(video, tmpd)
            trozos = trocear(audio, tmpd)
            palabras, segmentos = [], []
            for i, (arch, desfase) in enumerate(trozos, 1):
                print(f"Transcribiendo trozo {i}/{len(trozos)} con {prov} ...", flush=True)
                resp = llamar_api(prov, clave, arch, a.idioma)
                p, s = normalizar_respuesta(resp, desfase)
                if not p:
                    salir(f"'{prov}' no devolvio palabras con tiempos (¿soporta timestamp_granularities=word?). "
                          f"Respuesta: {json.dumps(resp, ensure_ascii=False)[:400]}")
                palabras += p
                segmentos += s
        origen = f"{prov} ({PROVEEDORES[prov]['modelo']})"

    if not palabras:
        salir("La transcripcion quedo vacia.")
    palabras.sort(key=lambda x: x["inicio"])
    marcar_fin_de_segmento(palabras, segmentos)
    salida = {"fuente": str(video), "idioma": a.idioma, "duracion": round(info["duracion"], 3), "origen": origen,
              "palabras": palabras, "segmentos": segmentos}
    escribir_json(proyecto / "palabras.json", salida)
    (proyecto / "transcripcion.txt").write_text(" ".join(p["w"] for p in palabras) + "\n", encoding="utf-8")
    print(f"OK: {len(palabras)} palabras · origen: {origen}\nproyecto: {proyecto}\npalabras: {proyecto / 'palabras.json'}")


if __name__ == "__main__":
    main()
