"""Pruebas de la pluma de la Radiografía (radiografia.py): nunca inventa, un solo cuello, orden y costos con la cuenta
a la vista, mapa en el estándar del embudo y respeto a lo editado a mano.

    python3 -m unittest discover -s .claude/skills/radiografia/tests

Datos inventados (references/ejemplo.json): nunca de un cliente real.
"""
import copy
import importlib.util
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("radiografia", AQUI.parent / "scripts" / "radiografia.py")
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)
EJEMPLO = json.loads((AQUI.parent / "references" / "ejemplo.json").read_text(encoding="utf-8"))


def correr(*args):
    buf = io.StringIO()
    with redirect_stdout(buf):
        codigo = R.main(list(args))
    return codigo, json.loads(buf.getvalue())


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name) / "cliente"
        self.dir.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def poner(self, datos):
        (self.dir / "radiografia.json").write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")


class Revisar(Base):
    def test_el_ejemplo_pasa_y_esta_marcado_como_ejemplo(self):
        self.assertTrue(EJEMPLO["ejemplo"])
        r = R.revisar(EJEMPLO)
        self.assertTrue(r["ok"], r["errores"])
        self.assertEqual(r["avisos"], [])

    def test_nueva_crea_la_plantilla_y_no_pisa(self):
        codigo, out = correr("nueva", "--carpeta", str(self.dir), "--negocio", "Taller de prueba", "--fecha", "2026-11-16")
        self.assertEqual(codigo, 0, out)
        d = json.loads((self.dir / "radiografia.json").read_text(encoding="utf-8"))
        self.assertEqual([e["etapa"] for e in d["etapas"]], R.ETAPAS)
        codigo, out = correr("nueva", "--carpeta", str(self.dir), "--negocio", "Otro")
        self.assertEqual(codigo, 3)
        self.assertIn("alto", out)

    def test_la_plantilla_vacia_no_se_arma_y_dice_que_falta(self):
        correr("nueva", "--carpeta", str(self.dir), "--negocio", "Taller de prueba", "--fecha", "2026-11-16")
        codigo, out = correr("armar", "--carpeta", str(self.dir))
        self.assertEqual(codigo, 2)
        texto = " ".join(out["errores"])
        for falta in ("meta", "moneda", "que_pasa", "cuello", "arreglos"):
            self.assertIn(falta, texto)
        self.assertFalse((self.dir / "embudo.json").exists())

    def test_un_numero_sin_fuente_o_sin_como_medirlo_no_pasa(self):
        d = copy.deepcopy(EJEMPLO)
        d["etapas"][1]["numero"].pop("fuente")
        d["etapas"][0]["numero"].pop("como_medirlo")
        errores = " ".join(R.revisar(d)["errores"])
        self.assertIn("Nutrición", errores)
        self.assertIn("como_medirlo", errores)

    def test_ventas_perdidas_sin_cuenta_no_pasan(self):
        d = copy.deepcopy(EJEMPLO)
        d["arreglos"][0]["ventas_perdidas"].pop("cuenta")
        self.assertIn("cuenta", " ".join(R.revisar(d)["errores"]))

    def test_avisa_si_ningun_arreglo_ataca_el_cuello_y_si_habla_de_ia(self):
        d = copy.deepcopy(EJEMPLO)
        d["arreglos"] = [a for a in d["arreglos"] if a["etapa"] != "Conversión"]
        d["siguiente_paso"] = "Instalar un agente de IA que conteste por ti."
        avisos = " ".join(R.revisar(d)["avisos"])
        self.assertIn("cuello", avisos)
        self.assertIn("IA", avisos)


class Costos(unittest.TestCase):
    def test_horas_y_costo_con_la_cuenta_del_ejemplo(self):
        t1 = EJEMPLO["tareas_a_mano"][0]  # 35 por semana × 12 minutos
        self.assertEqual(R.horas_mes(t1), 30.3)
        c = R.costo_arreglo(EJEMPLO, EJEMPLO["arreglos"][0])
        self.assertEqual(c["tiempo_mes"], round(30.3 * 14, 2))
        self.assertEqual(c["mensual"], round(30.3 * 14 + 2600, 2))

    def test_sin_costo_por_hora_queda_por_medir_nunca_cero(self):
        d = copy.deepcopy(EJEMPLO)
        d["numeros"] = [n for n in d["numeros"] if n.get("clave") != "costo_hora"]
        c = R.costo_arreglo(d, d["arreglos"][1])
        self.assertIsNone(c["mensual"])
        self.assertTrue(c["por_medir"])
        self.assertIn("costo_hora", " ".join(R.revisar(d)["avisos"]))

    def test_primero_el_cuello_luego_costo_por_esfuerzo_y_al_final_lo_sin_costo(self):
        self.assertEqual([a["id"] for a in R.ordenar(EJEMPLO)], ["a1", "a2", "a3", "a4"])
        d = copy.deepcopy(EJEMPLO)
        d["arreglos"].reverse()
        self.assertEqual([a["id"] for a in R.ordenar(d)], ["a1", "a2", "a3", "a4"])

    def test_el_orden_acordado_manda(self):
        d = copy.deepcopy(EJEMPLO)
        for n, a in zip((4, 3, 2, 1), d["arreglos"]):
            a["orden"] = n
        self.assertEqual([a["id"] for a in R.ordenar(d)], ["a4", "a3", "a2", "a1"])


class Armar(Base):
    def test_arma_mapa_pagina_y_lienzo(self):
        self.poner(EJEMPLO)
        codigo, out = correr("armar", "--carpeta", str(self.dir))
        self.assertEqual(codigo, 0, out)
        emb = json.loads((self.dir / "embudo.json").read_text(encoding="utf-8"))
        self.assertEqual(emb["esquema"], "arbrain.embudo/v1")
        self.assertEqual([e["etapa"] for e in emb["etapas"]], R.ETAPAS)
        cuellos = [e for e in emb["etapas"] if e["cuello"]["es"]]
        self.assertEqual(len(cuellos), 1)
        self.assertEqual(cuellos[0]["etapa"], "Conversión")
        self.assertTrue(cuellos[0]["cuello"]["evidencia"]["ruta"].endswith("radiografia.json"))
        for e in emb["etapas"]:
            m = e["mide"]
            if m["valor"] is None:
                self.assertFalse(m["hay_numero"])
                self.assertTrue(m["como_medirlo"])
            else:
                self.assertTrue(m["medido_en"])
        bienvenida = next(e for e in emb["etapas"] if e["etapa"] == "Bienvenida")
        self.assertFalse(bienvenida["opera_hoy"])
        self.assertEqual(len(emb["aristas"]), 5)

        md = (self.dir / "radiografia.md").read_text(encoding="utf-8")
        self.assertIn("EJEMPLO INVENTADO", md)
        for seccion in ("Tu negocio hoy, como sistema", "Lo que se repite a mano", "Qué arreglar primero",
                        "Cuánto te cuesta no arreglarlo", "Por medir", "Siguiente paso"):
            self.assertIn(seccion, md)
        self.assertIn("Marketing → **Venta (cuello)** → Entrega → Números", md)
        self.assertIn("3,622 EUR al mes", md)  # 3,024.2 + 324.8 + 273
        self.assertLess(md.index("Cotización el mismo día"), md.index("Cierre de caja con el reporte"))

        spec = json.loads((self.dir / "lienzo.json").read_text(encoding="utf-8"))
        ids = {n["id"] for n in spec["nodes"]}
        self.assertLessEqual({"meta", "marketing", "venta", "entrega", "numeros", "a-mano", "arreglo-1"}, ids)
        venta = next(n for n in spec["nodes"] if n["id"] == "venta")
        self.assertEqual(venta["role"], "risk")
        for n in spec["nodes"]:  # el spec declara qué, nunca dónde
            self.assertFalse({"x", "y", "width", "height", "color"} & set(n))
        for a in spec["edges"]:
            self.assertIn(a["from"], ids)
            self.assertIn(a["to"], ids)

    def test_regenerar_sin_cambios_a_mano_si_pisa(self):
        self.poner(EJEMPLO)
        correr("armar", "--carpeta", str(self.dir))
        d = copy.deepcopy(EJEMPLO)
        d["siguiente_paso"] = "Otra línea."
        self.poner(d)
        codigo, out = correr("armar", "--carpeta", str(self.dir))
        self.assertEqual(codigo, 0, out)
        self.assertIn("Otra línea.", (self.dir / "radiografia.md").read_text(encoding="utf-8"))

    def test_lo_editado_a_mano_no_se_pisa_sin_reemplazar(self):
        self.poner(EJEMPLO)
        correr("armar", "--carpeta", str(self.dir))
        pagina = self.dir / "radiografia.md"
        pagina.write_text(pagina.read_text(encoding="utf-8") + "\nNota del consultor.\n", encoding="utf-8")
        codigo, out = correr("armar", "--carpeta", str(self.dir))
        self.assertEqual(codigo, 3)
        self.assertIn("a mano", out["alto"])
        self.assertIn("Nota del consultor.", pagina.read_text(encoding="utf-8"))
        codigo, _ = correr("armar", "--carpeta", str(self.dir), "--reemplazar")
        self.assertEqual(codigo, 0)
        self.assertNotIn("Nota del consultor.", pagina.read_text(encoding="utf-8"))

    def test_no_pisa_un_embudo_que_no_escribio(self):
        (self.dir / "embudo.json").write_text('{"esquema": "arbrain.embudo/v1", "negocio": "hecho a mano"}', encoding="utf-8")
        self.poner(EJEMPLO)
        codigo, _ = correr("armar", "--carpeta", str(self.dir))
        self.assertEqual(codigo, 3)
        self.assertIn("hecho a mano", (self.dir / "embudo.json").read_text(encoding="utf-8"))

    def test_lienzo_fuera_de_la_app_no_falla(self):
        import os
        self.poner(EJEMPLO)
        antes = {k: os.environ.pop(k, None) for k in ("MISSION_CONTROL_ORIGIN", "ARBRAIN_PASE_AGENTE")}
        try:
            codigo, out = correr("lienzo", "--carpeta", str(self.dir))
        finally:
            for k, v in antes.items():
                if v is not None:
                    os.environ[k] = v
        self.assertEqual(codigo, 0)
        self.assertEqual(out["lienzo"], "sin_app")

    def test_slug_invalido(self):
        codigo, out = correr("revisar", "Mi Cliente")
        self.assertEqual(codigo, 2)
        self.assertIn("slug", out["error"])


if __name__ == "__main__":
    unittest.main()
