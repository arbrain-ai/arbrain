"""Pruebas de la pluma del ritual (plan.py): formato que leen el Calendario y el puente, nunca pisa, nunca inventa.

    python3 -m unittest discover -s .claude/skills/bajar-a-tierra/tests

Datos inventados: nunca de un alumno real.
"""
import importlib.util
import io
import json
import os
import re
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("plan", AQUI.parent / "scripts" / "plan.py")
P = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(P)

SEMILLA_OBJETIVOS = """<!--
  objetivos.md: tu plano de vuelo (mes -> semana -> día).
  ## Noviembre 2026
  **Mes:** ejemplo que no cuenta
-->

# Objetivos

_(Vacío. Dile a Levy «planeemos el mes» y lo llenan juntos.)_
"""
META = """<!-- arbrain:expediente sha256=0 -->
# Mi meta a 90 días y mi norte (Prueba)

- **Meta a 90 días:** 900 USD al mes para el 2027-01-20.
- **Mi nicho natural:** mi propia industria y mi oficio. En mis palabras: «20 años en logística»
"""


CAMINO = """<!-- arbrain:camino sha256=0000000000000000000000000000000000000000000000000000000000000000 -->
---
tipo: project
traido: 2026-10-28
inicio: 2026-10-26
dia: 3
---
# Mi camino en el programa (Prueba)

- **Dónde voy:** día 3 de 90 · semana 1 de 12 · etapa 1 de 5 «Tu cerebro» (semanas 0 y 1).
- **Mis casillas de la semana 1:** 3 de 5 (hechas: 1, 2, 3).
  - Falta la 4: Tu ritual de la mañana y tres encargos reales hechos con tu Levy.
  - Falta la 5: Te presentaste en la comunidad.
- **Mi siguiente paso:** marca tu casilla 4. Tu ritual de la mañana y tres encargos reales.
"""


class Plan(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.r = Path(self.tmp.name)
        (self.r / ".claude/plan").mkdir(parents=True)
        (self.r / ".claude/memory/project").mkdir(parents=True)
        (self.r / ".claude/plan/objetivos.md").write_text(SEMILLA_OBJETIVOS, encoding="utf-8")
        (self.r / ".claude/plan/calendario.json").write_text(json.dumps(
            {"version": 1, "zona": "America/Mexico_City", "eventos": [], "tareas": [{"id": "mia", "titulo": "Mía", "fecha": None}],
             "recibos": {"x": 1}}), encoding="utf-8")
        os.environ["ARBRAIN_PLAN_RAIZ"] = str(self.r)

    def tearDown(self):
        os.environ.pop("ARBRAIN_PLAN_RAIZ", None)
        self.tmp.cleanup()

    def correr(self, *args):
        out = io.StringIO()
        with redirect_stdout(out):
            codigo = P.main(list(args))
        return codigo, json.loads(out.getvalue())

    def objetivos(self):
        return (self.r / ".claude/plan/objetivos.md").read_text(encoding="utf-8")

    def test_estado_sin_meta_no_inventa(self):
        codigo, e = self.correr("estado", "--hoy", "2026-10-29")
        self.assertEqual(codigo, 0)
        self.assertFalse(e["meta_90"]["presente"])
        self.assertIsNone(e["meta_90"]["texto"])
        self.assertEqual(e["falta"], "mes")
        self.assertIsNone(e["mes"])  # el ejemplo dentro del comentario no cuenta

    def test_estado_lee_la_meta_y_el_nicho_del_expediente(self):
        (self.r / ".claude/memory/project/meta-90-dias.md").write_text(META, encoding="utf-8")
        _, e = self.correr("estado", "--hoy", "2026-10-29")
        self.assertEqual(e["meta_90"]["fecha"], "2027-01-20")
        self.assertEqual(e["meta_90"]["monto"], "900")
        self.assertIn("logística", e["meta_90"]["nicho"])
        # La semilla pendiente no es meta.
        (self.r / ".claude/memory/project/meta-90-dias.md").write_text("<!-- arbrain:expediente pendiente -->\n- Meta a 90 días: x\n", encoding="utf-8")
        _, e = self.correr("estado", "--hoy", "2026-10-29")
        self.assertFalse(e["meta_90"]["presente"])

    def test_estado_lee_mi_camino_y_recalcula_el_dia(self):
        _, e = self.correr("estado", "--hoy", "2026-10-28")
        self.assertFalse(e["camino"]["presente"])  # sin archivo, nada inventado
        (self.r / ".claude/memory/project/mi-camino.md").write_text(CAMINO, encoding="utf-8")
        _, e = self.correr("estado", "--hoy", "2026-10-28")
        c = e["camino"]
        self.assertTrue(c["presente"] and c["fresco"])
        self.assertEqual((c["dia_hoy"], c["semana_hoy"]), (3, 1))
        self.assertEqual(c["casillas_faltan"], [4, 5])
        self.assertTrue(c["siguiente_paso"].startswith("marca tu casilla 4"))
        # Dos días después sin traerlo de nuevo: el día avanza solo y la foto ya no es de hoy.
        _, e = self.correr("estado", "--hoy", "2026-11-03")
        self.assertEqual((e["camino"]["dia_hoy"], e["camino"]["semana_hoy"], e["camino"]["fresco"]), (9, 2, False))
        # La semilla pendiente no es camino.
        (self.r / ".claude/memory/project/mi-camino.md").write_text("<!-- arbrain:camino pendiente -->\ninicio: 2026-10-26\n", encoding="utf-8")
        self.assertFalse(self.correr("estado", "--hoy", "2026-10-28")[1]["camino"]["presente"])

    def test_cascada_mes_semana_dia_en_el_formato_del_calendario(self):
        self.assertEqual(self.correr("mes", "--texto", "800 USD cobrados", "--hoy", "2026-10-21")[0], 0)
        self.assertEqual(self.correr("estado", "--hoy", "2026-10-21")[1]["falta"], "semana")
        self.assertEqual(self.correr("semana", "--resultado", "Oferta escrita", "--resultado", "10 conversaciones",
                                     "--resultado", "2 diagnósticos", "--hoy", "2026-10-21")[0], 0)
        self.assertEqual(self.correr("estado", "--hoy", "2026-10-21")[1]["falta"], "dia")
        codigo, res = self.correr("dia", "--objetivo", "Escribir la oferta", "--tarea", "Lista de 10", "--tarea", "Borrador",
                                  "--tarea", "Mensaje a 3", "--hora", "09:00", "--hoy", "2026-10-21")
        self.assertEqual(codigo, 0)
        self.assertIsNone(res["estado"]["falta"])
        t = self.objetivos()
        self.assertNotIn("_(Vacío.", t)
        self.assertIn("## Octubre 2026\n**Mes:** 800 USD cobrados", t)
        self.assertIn("### Semana 19-25\n**Foco:** Oferta escrita · 10 conversaciones · 2 diagnósticos", t)
        self.assertRegex(t, r"#### Mié 21\n- \[ \] Escribir la oferta")
        self.assertTrue(t.startswith("<!--"))  # el instructivo queda arriba, intacto
        cal = json.loads((self.r / ".claude/plan/calendario.json").read_text(encoding="utf-8"))
        obj = [x for x in cal["tareas"] if "objetivo" in (x.get("etiquetas") or [])]
        self.assertEqual(len(obj), 1)
        self.assertEqual(obj[0]["fecha"], "2026-10-21")
        self.assertEqual(obj[0]["descripcion"], "- [ ] Lista de 10\n- [ ] Borrador\n- [ ] Mensaje a 3")
        # Con base de zonas, la del calendario (México, -06:00). Sin ella (Python de python.org en Windows), plan.py usa
        # la zona del sistema para esa fecha: es el respaldo correcto, no un error.
        try:
            from zoneinfo import ZoneInfo
            ZoneInfo("America/Mexico_City")
            esperado = "2026-10-21T09:00:00-06:00"
        except Exception:
            import datetime as _dt
            esperado = _dt.datetime(2026, 10, 21, 9, 0).astimezone().isoformat()
        self.assertEqual(cal["eventos"][0]["inicio"], esperado)
        self.assertEqual(cal["recibos"], {"x": 1})  # lo que no es suyo no se toca
        self.assertTrue(any(x["id"] == "mia" for x in cal["tareas"]))
        # Idempotente: repetir no duplica.
        self.correr("dia", "--objetivo", "Escribir la oferta", "--tarea", "Lista de 10", "--tarea", "Borrador",
                    "--tarea", "Mensaje a 3", "--hoy", "2026-10-21")
        self.assertEqual(self.objetivos().count("Escribir la oferta"), 1)
        cal = json.loads((self.r / ".claude/plan/calendario.json").read_text(encoding="utf-8"))
        self.assertEqual(len([x for x in cal["tareas"] if "objetivo" in (x.get("etiquetas") or [])]), 1)

    def test_nunca_pisa_sin_reemplazar(self):
        self.correr("mes", "--texto", "Lo que escribió el dueño", "--hoy", "2026-10-21")
        codigo, res = self.correr("mes", "--texto", "Otra cosa", "--hoy", "2026-10-21")
        self.assertEqual(codigo, 3)
        self.assertIn("Lo que escribió el dueño", res["alto"])
        self.assertIn("Lo que escribió el dueño", self.objetivos())
        self.assertEqual(self.correr("mes", "--texto", "Otra cosa", "--reemplazar", "--hoy", "2026-10-21")[0], 0)
        self.assertIn("**Mes:** Otra cosa", self.objetivos())
        self.assertNotIn("Lo que escribió el dueño", self.objetivos())

    def test_forma(self):
        self.assertEqual(self.correr("semana", "--resultado", "a", "--resultado", "b", "--hoy", "2026-10-21")[0], 2)
        self.assertEqual(self.correr("dia", "--objetivo", "x", "--tarea", "1", "--hoy", "2026-10-21")[0], 2)
        self.assertNotIn("Semana", self.objetivos().split("# Objetivos", 1)[1])

    def test_semana_que_cruza_de_mes_se_parte(self):
        self.correr("semana", "--resultado", "a1", "--resultado", "b1", "--resultado", "c1", "--hoy", "2026-10-29")
        t = self.objetivos()
        self.assertIn("### Semana 26-31\n**Foco:** a1 · b1 · c1", t)
        self.assertIn("## Noviembre 2026\n\n### Semana 1-1\n**Foco:** a1 · b1 · c1", t)
        cuerpo = t.split("# Objetivos", 1)[1]
        self.assertLess(cuerpo.index("## Octubre 2026"), cuerpo.index("## Noviembre 2026"))

    def test_respeta_el_registro_de_la_app_y_lo_escrito_a_mano(self):
        registro = '<!-- arbrain-objectives-v1\n{"version":1,"goals":[{"id":"g","scope":"week","start":"2026-10-19","end":"2026-10-26","title":"Foco de la app","status":"agreed"}],"receipts":{}}\n-->\n'
        (self.r / ".claude/plan/objetivos.md").write_text("# Objetivos\n\n## Octubre 2026\n**Mes:** Mío\n\n## Pendientes\n- [ ] algo\n\n" + registro, encoding="utf-8")
        _, e = self.correr("estado", "--hoy", "2026-10-21")
        self.assertEqual(e["semana"]["texto"], "Foco de la app")
        self.assertEqual(e["mes"], "Mío")
        self.correr("dia", "--objetivo", "Hoy", "--tarea", "1", "--tarea", "2", "--tarea", "3", "--hoy", "2026-10-21")
        t = self.objetivos()
        self.assertTrue(t.rstrip().endswith("-->"))  # el registro sigue al final
        self.assertLess(t.index("#### Mié 21"), t.index("## Pendientes"))

    def test_dia_escrito_a_mano_sin_semana_se_reusa(self):
        (self.r / ".claude/plan/objetivos.md").write_text("# Objetivos\n\n## Octubre 2026\n**Mes:** Tres clientes\n\n#### Hoy 21\n- [ ] Mío de la mañana\n", encoding="utf-8")
        self.correr("semana", "--resultado", "a", "--resultado", "b", "--resultado", "c", "--hoy", "2026-10-21")
        self.correr("dia", "--objetivo", "Otro", "--tarea", "1", "--tarea", "2", "--tarea", "3", "--hoy", "2026-10-21")
        t = self.objetivos()
        self.assertEqual(len(re.findall(r"^#### ", t, re.M)), 1)
        self.assertLess(t.index("### Semana 19-25"), t.index("#### Hoy 21"))
        self.assertIn("- [ ] Mío de la mañana\n- [ ] Otro", t)
        _, e = self.correr("estado", "--hoy", "2026-10-21")
        self.assertEqual(e["dia"]["objetivos"][:2], ["Mío de la mañana", "Otro"])

    def test_calendario_ilegible_no_se_toca(self):
        (self.r / ".claude/plan/calendario.json").write_text("{roto", encoding="utf-8")
        codigo, res = self.correr("dia", "--objetivo", "x", "--tarea", "1", "--tarea", "2", "--tarea", "3", "--hoy", "2026-10-21")
        self.assertEqual(codigo, 4)
        self.assertEqual((self.r / ".claude/plan/calendario.json").read_text(encoding="utf-8"), "{roto")
        self.assertNotIn("#### Mié 21", self.objetivos())  # nada a medias

    def test_lienzos_con_el_plan_y_las_12_semanas(self):
        (self.r / ".claude/memory/project/meta-90-dias.md").write_text(META, encoding="utf-8")
        self.correr("mes", "--texto", "800 USD", "--hoy", "2026-10-21")
        self.correr("semana", "--resultado", "R1", "--resultado", "R2", "--resultado", "R3", "--hoy", "2026-10-21")
        _, res = self.correr("lienzos", "--revisar", "--hoy", "2026-10-21")
        plan = res["specs"][P.LIENZO_PLAN]
        ids = [n["id"] for n in plan["nodes"]]
        self.assertEqual(ids[:1], ["mes"])
        self.assertIn("hoy", ids)
        self.assertEqual(next(n for n in plan["nodes"] if n["id"] == "mes")["caption"], "800 USD")
        self.assertTrue(any(n.get("items") == ["R1", "R2", "R3"] for n in plan["nodes"]))
        doce = res["specs"][P.LIENZO_12]
        self.assertIn("900 USD", doce["nodes"][0]["caption"])
        items = [i for n in doce["nodes"] if n["id"] in ("m1", "m2", "m3") for i in n["items"]]
        self.assertEqual(len(items), 12)
        self.assertTrue(any("R1" in i and "◀ hoy" in i for i in items))
        self.assertTrue(items[0].startswith("Semana 1 (19/10)"))  # la meta está a 13 semanas: empieza hoy
        self.assertTrue(items[-1].startswith("Semana 12 (4/1)"))
        # Con hoy dentro de la ventana, las 12 semanas terminan en la semana de su fecha.
        _, res = self.correr("lienzos", "--revisar", "--hoy", "2026-12-02")
        items = [i for n in res["specs"][P.LIENZO_12]["nodes"] if n["id"] in ("m1", "m2", "m3") for i in n["items"]]
        self.assertTrue(items[-1].startswith("Semana 12 (18/1)"))
        # Fuera de la app no hay lienzo: lo dice, no falla.
        os.environ.pop("MISSION_CONTROL_ORIGIN", None)
        self.assertEqual(self.correr("lienzos", "--hoy", "2026-10-21")[1]["lienzos"], "sin_app")


if __name__ == "__main__":
    unittest.main()
