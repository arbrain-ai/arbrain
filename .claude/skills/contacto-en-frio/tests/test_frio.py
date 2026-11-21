"""Pruebas de frio.py: registro sin duplicados, marcar, números y revisor. Correr: python3 -m unittest discover tests"""
import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import frio  # noqa: E402


def correr(*args):
    salida = io.StringIO()
    with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(io.StringIO()):
        codigo = frio.main(list(args))
    return codigo, salida.getvalue()


class Registro(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def r(self, *args):
        return correr("--dir", self.d, *args)

    def test_agregar_y_duplicados_por_cada_llave(self):
        self.assertEqual(self.r("agregar", "--negocio", "Clínica Uno", "--ciudad", "Ciudad A",
                                "--correo", "Hola@Uno.com", "--telefono", "+52 55 1234 5678",
                                "--sitio", "https://www.uno.com/contacto")[0], 0)
        self.assertEqual(self.r("agregar", "--negocio", "Otra", "--correo", "hola@uno.com")[0], 3)
        self.assertEqual(self.r("agregar", "--negocio", "Otra", "--telefono", "5512345678")[0], 3)
        self.assertEqual(self.r("agregar", "--negocio", "Otra", "--sitio", "uno.com")[0], 3)
        self.assertEqual(self.r("agregar", "--negocio", "clinica uno", "--ciudad", "ciudad a")[0], 3)
        self.assertEqual(self.r("agregar", "--negocio", "Clínica Uno", "--ciudad", "Ciudad B")[0], 0)

    def test_existe(self):
        self.assertEqual(self.r("existe", "--correo", "x@y.com")[0], 1)
        self.r("agregar", "--negocio", "Dos", "--correo", "x@y.com")
        self.assertEqual(self.r("existe", "--correo", "X@Y.com")[0], 0)

    def test_marcar_y_numeros(self):
        for i in range(4):
            self.r("agregar", "--negocio", f"N{i}", "--correo", f"n{i}@z.com")
        for i in range(4):
            self.r("marcar", "--correo", f"n{i}@z.com", "--estado", "enviado", "--canal", "correo")
        self.r("marcar", "--correo", "n0@z.com", "--estado", "respondio", "--resultado", "positivo")
        self.r("marcar", "--correo", "n1@z.com", "--estado", "rebote")
        self.r("marcar", "--correo", "n2@z.com", "--estado", "no", "--canal", "whatsapp")
        codigo, out = self.r("numeros")
        self.assertEqual(codigo, 0)
        self.assertIn("Rebote:                   25.0%  (1 de 4)", out)
        self.assertIn("Respuesta:                66.7%  (2 de 3)", out)
        self.assertIn("Positivas:                50.0%  (1 de 2)", out)
        self.assertIn("Conversaciones, 7 días:   1", out)
        self.assertIn("sin medir", out)
        filas = frio.leer(Path(self.d) / "contactados.csv")
        self.assertEqual(filas[2]["canal"], "correo+whatsapp")
        self.assertEqual(filas[2]["resultado"], "negativo")

    def test_marcar_sin_registro(self):
        self.assertEqual(self.r("marcar", "--correo", "nadie@z.com", "--estado", "enviado")[0], 2)


class Revisor(unittest.TestCase):
    def revisar(self, texto, *extra):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write(texto)
        try:
            return correr("revisar", f.name, *extra)
        finally:
            Path(f.name).unlink()

    def test_limpio(self):
        texto = ("Asunto: duda rápida\n\nVi que su consultorio tiene 40 reseñas y varias hablan de la espera. "
                 "¿Cómo manejan los mensajes fuera de horario? Me gustaría armarle algo con su información. "
                 "¿Se lo preparo? Escríbame a hola@ejemplo.com si prefiere.")
        codigo, out = self.revisar(texto, "--primer-correo")
        self.assertEqual(codigo, 0, out)

    def test_huellas(self):
        texto = ("Asunto: OFERTA URGENTE garantizada para tu negocio hoy mismo\n\n"
                 "Haz clic aquí https://ejemplo.com y agenda aquí en calendly. "
                 "Responde STOP para darte de baja. {Hola|Buenas} {{nombre}}")
        codigo, out = self.revisar(texto, "--primer-correo")
        self.assertEqual(codigo, 1)
        for pista in ["Asunto de", "trampa en el asunto", "Enlace en el primer correo", "calendario", "STOP",
                      "variación sin resolver", "campos sin llenar"]:
            self.assertIn(pista, out)

    def test_bajaron_no_es_baja(self):
        codigo, out = self.revisar("Sus faltas bajaron de 23% a 7%. ¿Le interesa?")
        self.assertEqual(codigo, 0, out)


if __name__ == "__main__":
    unittest.main()
