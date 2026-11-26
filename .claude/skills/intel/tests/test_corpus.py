"""Pruebas de corpus.py: subtítulos a verbatim, fichas que prueban sus anclas, búsqueda, link al minuto e índice.

    python3 -m unittest discover -s .claude/skills/intel/tests

Todo con un video inventado; no baja nada de internet.
"""
import importlib.util
import io
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("corpus", AQUI.parent / "scripts" / "corpus.py")
C = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(C)

SRT = """1
00:00:01,000 --> 00:00:04,000
Welcome back to the shop.

2
00:00:04,000 --> 00:00:09,000
Today we talk about pricing your first offer.

3
00:02:30,500 --> 00:02:36,000
If you raise prices with thirty days notice, most customers stay.

4
00:02:30,500 --> 00:02:36,000
If you raise prices with thirty days notice, most customers stay.
"""


def correr(*args):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        codigo = C.main(list(args))
    return codigo, out.getvalue(), err.getvalue()


class Corpus(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = os.path.join(self.tmp.name, "taller", "youtube")
        srt = os.path.join(self.tmp.name, "v.srt")
        Path(srt).write_text(SRT, encoding="utf-8")
        codigo, _, _ = correr("texto", srt, "--corpus", self.dir, "--id", "abcdefghijk", "--titulo", "Precios",
                              "--url", "https://www.youtube.com/watch?v=abcdefghijk", "--fecha", "2026-01-15")
        self.assertEqual(codigo, 0)
        self.t = os.path.join(self.dir, "transcripts", "20260115_abcdefghijk.md")

    def tearDown(self):
        self.tmp.cleanup()

    def test_verbatim_sin_repetidos_y_con_minuto(self):
        meta = C.leer_transcript(self.t)
        self.assertEqual(len(meta["lineas"]), 3)
        self.assertEqual(meta["lineas"][2][0], 150)
        self.assertIn("`[02:30]` If you raise prices", Path(self.t).read_text(encoding="utf-8"))

    def test_no_pisa_el_verbatim(self):
        codigo, _, err = correr("texto", self.t, "--corpus", self.dir, "--id", "abcdefghijk", "--titulo", "x",
                                "--fecha", "2026-01-15")
        self.assertEqual(codigo, 1)
        self.assertIn("no se pisa", err)

    def test_buscar_y_link(self):
        codigo, out, _ = correr("buscar", self.dir, "raise prices with thirty")
        self.assertEqual(codigo, 0)
        self.assertIn("https://youtu.be/abcdefghijk?t=150", out)
        self.assertEqual(correr("buscar", self.dir, "no existe esta frase")[0], 1)
        self.assertEqual(correr("link", self.t, "01:02:00")[1].strip(), "https://youtu.be/abcdefghijk?t=3720")

    def _ficha(self, cita_t, cita):
        codigo, out, _ = correr("ficha", self.dir, "abcdefghijk")
        self.assertEqual(codigo, 0)
        f = out.strip()
        txt = Path(f).read_text(encoding="utf-8")
        cuerpo = txt.split("## Para qué abrirlo")[0]
        cuerpo += (
            "## Para qué abrirlo\n- ¿Cuánto aviso dar antes de subir precios?\n\n"
            f"## Ideas clave\n- [{cita_t}] Subir precios con aviso retiene clientes. «{cita}»\n\n"
            "## Mapa por tramos\n- [00:00] Bienvenida y tema\n"
        )
        cuerpo = cuerpo.replace("(la tesis o el valor del video, específica, de 6 a 32 palabras)",
                                "Subir precios con treinta días de aviso retiene a la mayoría de los clientes.")
        Path(f).write_text(cuerpo, encoding="utf-8")
        return f

    def test_validar_acepta_cita_real_y_rechaza_ancla_lejana(self):
        self._ficha("02:30", "most customers stay")
        self.assertEqual(correr("validar", self.dir)[0], 0)
        f = os.path.join(self.dir, "fichas", "20260115_abcdefghijk.md")
        Path(f).write_text(Path(f).read_text(encoding="utf-8").replace("[02:30]", "[09:00]"), encoding="utf-8")
        codigo, out, _ = correr("validar", self.dir)
        self.assertEqual(codigo, 1)
        self.assertIn("corrige el ancla", out)

    def test_validar_rechaza_cita_inventada(self):
        self._ficha("02:30", "customers always leave")
        codigo, out, _ = correr("validar", self.dir)
        self.assertEqual(codigo, 1)
        self.assertIn("no aparece tal cual", out)

    def test_pendientes_e_indice(self):
        self.assertEqual(correr("pendientes", self.dir)[0], 1)
        self._ficha("02:30", "most customers stay")
        self.assertEqual(correr("pendientes", self.dir)[0], 0)
        correr("indice", self.dir, "--titulo", "Taller")
        indice = Path(self.dir, "INDICE.md").read_text(encoding="utf-8")
        self.assertIn("## 2026-01", indice)
        self.assertIn("treinta días de aviso", indice)

    def test_ficha_vieja_si_cambia_el_verbatim(self):
        self._ficha("02:30", "most customers stay")
        Path(self.t).write_text(Path(self.t).read_text(encoding="utf-8") + "`[03:00]` extra line\n", encoding="utf-8")
        codigo, out, _ = correr("validar", self.dir)
        self.assertEqual(codigo, 1)
        self.assertIn("el verbatim cambió", out)


if __name__ == "__main__":
    unittest.main()
