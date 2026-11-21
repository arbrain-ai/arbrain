"""Pruebas de finanzas.py: partida doble, báscula por moneda, correcciones sin borrar y nada inventado.

    python3 -m unittest discover -s .claude/skills/finance-os/tests

Datos inventados: nunca de una persona real.
"""
import importlib.util
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("finanzas", AQUI.parent / "scripts" / "finanzas.py")
F = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(F)


class Pruebas(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def c(self, *args, codigo=0):
        buf = io.StringIO()
        with redirect_stdout(buf):
            r = F.main(["--carpeta", self.dir, *args])
        salida = json.loads(buf.getvalue())
        self.assertEqual(r, codigo, salida)
        return salida

    def montar(self):
        self.c("iniciar", "--moneda-base", "MXN", "--umbral", "5000")
        self.c("cuenta", "agregar", "Banco", "--tipo", "banco", "--moneda", "MXN")
        self.c("cuenta", "agregar", "Tarjeta", "--tipo", "credito", "--moneda", "MXN")
        self.c("cuenta", "agregar", "Pasarela", "--tipo", "pasarela", "--moneda", "USD")
        self.c("cuenta", "agregar", "Por cobrar", "--tipo", "por_cobrar", "--moneda", "MXN")
        self.c("foto", "--fecha", "2026-01-31", "--saldo", "Banco=100000", "--saldo", "Tarjeta=-5000",
               "--saldo", "Pasarela=2000", "--saldo", "Por cobrar=0", "--tc", "USD=17")

    def test_iniciar_no_pisa(self):
        self.c("iniciar", "--moneda-base", "MXN")
        self.assertIn("No se pisan", self.c("iniciar", "--moneda-base", "MXN", codigo=2)["error"])

    def test_foto_exige_todas_las_cuentas(self):
        self.montar()
        r = self.c("foto", "--fecha", "2026-02-28", "--saldo", "Banco=1", codigo=2)
        self.assertIn("Faltan saldos", r["error"])

    def test_bascula_deriva_el_gasto(self):
        self.montar()
        # Febrero: entran 3000 USD a la pasarela; se cambian 1000 USD a 17300 MXN; se presta 10000;
        # se paga la tarjeta con 5,000 (transferencia); un gasto grande de 8,000 y un fijo de 600.
        self.c("mov", "--fecha", "2026-02-10", "--tipo", "ingreso", "--cuenta", "Pasarela", "--monto", "3000",
               "--categoria", "ventas", "--nota", "ventas de febrero")
        self.c("mov", "--fecha", "2026-02-12", "--tipo", "transferencia", "--cuenta", "Pasarela", "--monto", "1000",
               "--contracuenta", "Banco", "--contramonto", "17300", "--nota", "retiro")
        self.c("mov", "--fecha", "2026-02-13", "--tipo", "prestamo", "--cuenta", "Banco", "--monto", "10000",
               "--contracuenta", "Por cobrar")
        self.c("mov", "--fecha", "2026-02-14", "--tipo", "transferencia", "--cuenta", "Banco", "--monto", "5000",
               "--contracuenta", "Tarjeta", "--nota", "pago tarjeta")
        self.c("mov", "--fecha", "2026-02-20", "--tipo", "gasto", "--cuenta", "Banco", "--monto", "8000",
               "--categoria", "equipo", "--nota", "computadora")
        self.c("fijo", "agregar", "Internet", "--dia", "5", "--monto", "600", "--cuenta", "Tarjeta",
               "--categoria", "servicios")
        # Saldos reales al 28: Banco 100000+17300-10000-5000-8000-20000 (hormiga) = 74300
        # Tarjeta: -5000 + 5000 - 600 (internet) - 3400 (hormiga) = -4000 ; Pasarela 2000+3000-1000-50 (comisión) = 3950
        self.c("foto", "--fecha", "2026-02-28", "--saldo", "Banco=74300", "--saldo", "Tarjeta=-4000",
               "--saldo", "Pasarela=3950", "--saldo", "Por cobrar=10000", "--tc", "USD=17.5")
        r = self.c("bascula")
        mxn, usd = r["por_moneda"]["MXN"], r["por_moneda"]["USD"]
        self.assertEqual(mxn["gasto_derivado"], "32000.00")   # 8000 + 600 + 20000 + 3400
        self.assertEqual(mxn["desglose"]["registrado"], "8000.00")
        self.assertEqual(mxn["desglose"]["fijos_esperados"], "600.00")
        self.assertEqual(mxn["desglose"]["hormiga"], "23400.00")
        self.assertEqual(usd["gasto_derivado"], "50.00")      # la comisión que nadie registró
        self.assertEqual(r["consolidado"]["gasto_derivado"], "32875.00")  # 32000 + 50 × 17.5
        resumen = self.c("resumen")
        self.assertEqual(resumen["runway"]["confianza"], "baja (un solo tramo)")

    def test_ingreso_faltante_se_nota(self):
        self.montar()
        self.c("foto", "--fecha", "2026-02-28", "--saldo", "Banco=150000", "--saldo", "Tarjeta=-5000",
               "--saldo", "Pasarela=2000", "--saldo", "Por cobrar=0")
        r = self.c("bascula")
        self.assertIn("negativo", r["por_moneda"]["MXN"]["aviso"])

    def test_transferencia_entre_monedas_exige_lo_que_llego(self):
        self.montar()
        r = self.c("mov", "--tipo", "transferencia", "--cuenta", "Pasarela", "--monto", "100",
                   "--contracuenta", "Banco", codigo=2)
        self.assertIn("contramonto", r["error"])

    def test_foto_del_futuro(self):
        self.montar()
        r = self.c("foto", "--fecha", "2999-01-01", "--saldo", "Banco=1", codigo=2)
        self.assertIn("futuro", r["error"])

    def test_categoria_invalida_lista_las_validas(self):
        self.montar()
        r = self.c("mov", "--tipo", "gasto", "--cuenta", "Banco", "--monto", "9000", "--categoria", "tacos", codigo=2)
        self.assertIn("despensa", r["error"])

    def test_duplicado_y_lote_todo_o_nada(self):
        self.montar()
        self.c("mov", "--fecha", "2026-02-20", "--tipo", "gasto", "--cuenta", "Banco", "--monto", "8000",
               "--categoria", "equipo", "--nota", "computadora")
        lote = Path(self.dir) / "lote.csv"
        lote.write_text("fecha,tipo,cuenta,monto,categoria,nota,fuente\n"
                        "2026-02-21,gasto,Tarjeta,120,despensa,super,estado-de-cuenta\n"
                        "2026-02-20,gasto,Banco,8000,equipo,computadora,\n", encoding="utf-8")
        r = self.c("lote", str(lote), codigo=2)
        self.assertIn("No escribí nada", r["error"])
        movs = (Path(self.dir) / "movimientos.csv").read_text(encoding="utf-8").strip().splitlines()
        self.assertEqual(len(movs), 2)  # encabezado + el primero

    def test_correccion_reemplaza_sin_borrar(self):
        self.montar()
        m = self.c("mov", "--fecha", "2026-02-20", "--tipo", "gasto", "--cuenta", "Banco", "--monto", "8000",
                   "--categoria", "equipo")["agregados"][0]["id"]
        self.c("mov", "--fecha", "2026-02-20", "--tipo", "gasto", "--cuenta", "Banco", "--monto", "6500",
               "--categoria", "equipo", "--corrige", m, "--nota", "devolvieron 1500")
        vigentes = F.movimientos_vigentes(Path(self.dir))
        self.assertEqual([v["monto"] for v in vigentes], ["6500"])
        texto = (Path(self.dir) / "movimientos.csv").read_text(encoding="utf-8")
        self.assertIn("8000", texto)

    def test_probar_no_escribe(self):
        self.montar()
        self.c("mov", "--tipo", "gasto", "--cuenta", "Banco", "--monto", "9000", "--categoria", "equipo", "--probar")
        self.assertEqual(len(F.movimientos_vigentes(Path(self.dir))), 0)

    def test_cerrar_no_borra(self):
        self.montar()
        self.c("cuenta", "cerrar", "Por cobrar")
        cuentas = self.c("cuentas")["cuentas"]
        self.assertEqual([c["activa"] for c in cuentas if c["nombre"] == "Por cobrar"], ["no"])


if __name__ == "__main__":
    unittest.main()
