"""Pruebas del censo (censo.py): enlaces por mes, llamados con su posición y límites a la vista.

    python3 -m unittest discover -s .claude/skills/ideal-funnels/tests

Un canal inventado de dos videos; no baja nada.
"""
import importlib.util
import io
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("censo", AQUI.parent / "scripts" / "censo.py")
C = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(C)

VIDEO = """# {titulo}

- **Video ID:** `{id}`
- **URL:** https://www.youtube.com/watch?v={id}
- **Fecha:** {fecha}
- **Duracion:** 10:00
- **Subs:** auto (en)

## Descripción

{desc}

---

## Transcript

`[00:10]` hello and welcome
`[05:00]` {habla}
`[09:30]` see you next time
"""


class Censo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = Path(self.tmp.name, "taller", "youtube", "transcripts")
        t.mkdir(parents=True)
        (t / "20260105_aaaaaaaaaaa.md").write_text(VIDEO.format(
            titulo="Uno", id="aaaaaaaaaaa", fecha="2026-01-05",
            desc="Join the community: https://www.skool.com/taller\nTemplate: https://bit.ly/x",
            habla="grab the free template in my community"), encoding="utf-8")
        (t / "20260210_bbbbbbbbbbb.md").write_text(VIDEO.format(
            titulo="Dos", id="bbbbbbbbbbb", fecha="2026-02-10", desc="Sin enlaces.", habla="today we build a thing"),
            encoding="utf-8")
        self.corpus = str(Path(self.tmp.name, "taller"))

    def tearDown(self):
        self.tmp.cleanup()

    def test_cuenta_por_mes(self):
        r = C.censo(self.corpus, {"comunidad": "community"})
        ene, feb = r["meses"]["2026-01"], r["meses"]["2026-02"]
        self.assertEqual(ene["videos"], 1)
        self.assertEqual(dict(ene["dominios"]), {"skool.com": 1, "bit.ly": 1})
        self.assertEqual(ene["acortadores"], 1)
        self.assertEqual(ene["llamados"]["comunidad"]["videos"], 1)
        self.assertEqual(ene["llamados"]["comunidad"]["mediana_pct"], 50)
        self.assertEqual(feb["llamados"]["comunidad"]["videos"], 0)
        self.assertIsNone(feb["llamados"]["comunidad"]["mediana_pct"])

    def test_reporte_dice_sus_limites_y_filtra_fechas(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            self.assertEqual(C.main([self.corpus, "--llamado", "comunidad=community", "--desde", "2026-02"]), 0)
        md = buf.getvalue()
        self.assertIn("no ve tarjetas en pantalla", md)
        self.assertNotIn("| 2026-01 |", md)
        self.assertIn("| 2026-02 |", md)

    def test_errores_de_uso(self):
        self.assertEqual(C.main([os.path.join(self.tmp.name, "vacio")]), 2)
        self.assertEqual(C.main([self.corpus, "--llamado", "sin-igual"]), 2)
        self.assertEqual(C.main([self.corpus, "--llamado", "malo=(abierto"]), 2)


if __name__ == "__main__":
    unittest.main()
