#!/usr/bin/env python3
"""Prueba del cliente de transcripcion contra un servidor SIMULADO (sin red, sin claves reales).

Verifica: multipart correcto (model, response_format=verbose_json, timestamp_granularities[]=word, language, file),
cabecera Authorization, troceo cuando el audio pasa el limite (se fuerza un limite diminuto) y suma de desfases.
  python3 prueba_transcribir_simulado.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
from email import message_from_bytes
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

AQUI = Path(__file__).resolve().parent
visto: list[dict] = []


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        cuerpo = self.rfile.read(int(self.headers["Content-Length"]))
        msg = message_from_bytes(b"Content-Type: " + self.headers["Content-Type"].encode() + b"\r\n\r\n" + cuerpo)
        campos: dict[str, list[str]] = {}
        archivo = 0
        for parte in msg.get_payload():
            nombre = parte.get_param("name", header="content-disposition")
            if nombre == "file":
                archivo = len(parte.get_payload(decode=True))
            else:
                campos.setdefault(nombre, []).append(parte.get_payload(decode=True).decode())
        visto.append({"auth": self.headers.get("Authorization"), "campos": campos, "bytes": archivo})
        resp = {"text": "hola mundo", "segments": [{"start": 0.0, "end": 1.0, "text": "hola mundo"}],
                "words": [{"word": "hola", "start": 0.1, "end": 0.5}, {"word": "mundo", "start": 0.6, "end": 0.9}]}
        b = json.dumps(resp).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)


def main() -> None:
    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        wav = t / "a.wav"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=300:duration=60",
                        "-ar", "16000", "-ac", "1", str(wav)], check=True)
        env = {**os.environ, "GROQ_API_KEY": "clave-de-mentira", "CEREBRO_HOME": str(t / "home"),
               "CEREBRO_STT_URL": f"http://127.0.0.1:{srv.server_port}/v1/audio/transcriptions", "CEREBRO_STT_LIMITE_MB": "0.12"}
        r = subprocess.run([sys.executable, str(AQUI / "transcribir.py"), str(wav), "--proyecto", str(t / "p"), "--confirmo"],
                           capture_output=True, text=True, env=env)
        print(r.stdout, r.stderr)
        assert r.returncode == 0, "transcribir fallo"
        sin_confirmar = subprocess.run([sys.executable, str(AQUI / "transcribir.py"), str(wav), "--proyecto", str(t / "p2")],
                                       capture_output=True, text=True, env=env)
        assert sin_confirmar.returncode == 3 and "ALTO" in sin_confirmar.stderr, "debe negarse a enviar sin confirmacion"
        pj = json.loads((t / "p" / "palabras.json").read_text())
        assert len(visto) >= 2, f"esperaba troceo, hubo {len(visto)} llamada(s)"
        v = visto[0]
        assert v["auth"] == "Bearer clave-de-mentira"
        assert v["campos"]["response_format"] == ["verbose_json"]
        assert "word" in v["campos"]["timestamp_granularities[]"]
        assert v["campos"]["language"] == ["es"]
        inicios = [p["inicio"] for p in pj["palabras"]]
        assert inicios == sorted(inicios) and inicios[-1] > 10, f"desfases mal sumados: {inicios}"
        print(f"OK: {len(visto)} trozos enviados, campos multipart correctos, desfases sumados ({inicios[0]} ... {inicios[-1]}), "
              "se niega a enviar sin confirmacion (codigo 3).")


if __name__ == "__main__":
    main()
