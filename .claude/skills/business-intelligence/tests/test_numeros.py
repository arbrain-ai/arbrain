"""Pruebas de numeros.py: no adivina columnas, separa monedas, respeta la zona horaria y no compara lo que no se puede.

    python3 -m unittest discover -s .claude/skills/business-intelligence/tests

Datos inventados: nunca de un negocio real.
"""
import importlib.util
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("numeros", AQUI.parent / "scripts" / "numeros.py")
N = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(N)

CSV = """id,Created date (UTC),Amount,Amount Refunded,Currency,Status,Fee,Customer Email
ch_1,2026-03-01 05:30:00,39.00,0,usd,paid,2.73,ana@ejemplo.com
ch_2,2026-03-01 18:00:00,39.00,39.00,usd,paid,2.73,beto@ejemplo.com
ch_3,2026-03-02 12:00:00,"1,200.50",0,mxn,paid,40,caro@ejemplo.com
ch_4,2026-03-03 12:00:00,39.00,0,usd,failed,0,dani@ejemplo.com
ch_5,2026-03-04 12:00:00,,0,usd,paid,0,eli@ejemplo.com
ch_6,2026-03-05 12:00:00,99.00,0,usd,paid,5,fer@ejemplo.com
ch_7,2026-03-06 12:00:00,99.00,0,usd,paid,5,gabo@ejemplo.com
"""
BASE = ["--fecha", "Created date (UTC)", "--monto", "Amount", "--moneda", "Currency", "--estado", "Status",
        "--estado-ok", "paid", "--reembolso", "Amount Refunded", "--comision", "Fee"]


def correr(*args):
    buf = io.StringIO()
    with redirect_stdout(buf):
        codigo = N.main(list(args))
    return codigo, json.loads(buf.getvalue())


class Pruebas(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.csv = str(Path(self.tmp.name) / "pagos.csv")
        Path(self.csv).write_text(CSV, encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def test_columnas_sin_datos_de_clientes(self):
        codigo, r = correr("columnas", self.csv)
        self.assertEqual(codigo, 0)
        self.assertEqual(r["filas"], 7)
        self.assertNotIn("ana@ejemplo.com", json.dumps(r))

    def test_columna_que_no_existe(self):
        codigo, r = correr("resumen", self.csv, "--fecha", "Fecha", "--monto", "Amount", "--moneda-fija", "USD")
        self.assertEqual(codigo, 2)
        self.assertIn("Fecha", r["error"])

    def test_monedas_separadas_y_neto(self):
        codigo, r = correr("resumen", self.csv, *BASE)
        self.assertEqual(codigo, 0)
        usd, mxn = r["total"]["USD"], r["total"]["MXN"]
        self.assertEqual(usd["cobros"], 4)
        self.assertEqual(usd["bruto"], "276.00")
        self.assertEqual(usd["reembolsos"], "39.00")
        self.assertEqual(usd["neto"], "221.54")  # 276 − 39 − 15.46
        self.assertEqual(mxn["bruto"], "1200.50")
        self.assertEqual(r["cobertura"]["descartes"], {"estado fuera de --estado-ok": 1, "monto ilegible o vacío": 1})

    def test_zona_horaria_mueve_el_dia(self):
        _, r = correr("resumen", self.csv, *BASE, "--zona", "-06:00", "--por", "dia")
        # 2026-03-01 05:30 UTC es 2026-02-28 en UTC-6.
        self.assertIn("2026-02-28", r["por_periodo"])
        self.assertEqual(r["cobertura"]["desde"], "2026-02-28")

    def test_comparar_fuera_de_cobertura(self):
        _, r = correr("comparar", self.csv, *BASE, "--dias", "7")
        self.assertFalse(r["comparable"])
        self.assertTrue(r["razones"])
        self.assertNotIn("cambio_por_moneda", r)

    def test_comparar_dentro_de_cobertura(self):
        _, r = correr("comparar", self.csv, *BASE, "--dias", "3", "--hasta", "2026-03-06")
        self.assertTrue(r["comparable"])
        self.assertEqual(r["actual"]["desde"], "2026-03-04")
        self.assertEqual(r["anterior"]["hasta"], "2026-03-03")
        self.assertIn("aviso", r["cambio_por_moneda"]["USD"])

    def test_hasta_posterior_avisa(self):
        _, r = correr("resumen", self.csv, *BASE, "--hasta", "2026-04-30")
        self.assertTrue(any("no hay dato" in a for a in r["avisos"]))

    def test_montos(self):
        self.assertEqual(str(N.leer_monto("$1.234,50", False)), "1234.50")
        self.assertEqual(str(N.leer_monto("3900", True)), "39")
        self.assertIsNone(N.leer_monto("", False))


if __name__ == "__main__":
    unittest.main()
