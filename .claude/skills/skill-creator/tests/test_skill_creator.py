"""Pruebas de crear_skill.py y quick_validate.py (solo biblioteca estándar).

    python3 -m unittest discover -s .claude/skills/skill-creator/tests
"""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SKILL = AQUI.parent


def cargar(nombre):
    spec = importlib.util.spec_from_file_location(nombre, SKILL / 'scripts' / f'{nombre}.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


C = cargar('crear_skill')
V = cargar('quick_validate')


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        (self.raiz / '.claude' / 'skills').mkdir(parents=True)
        (self.raiz / 'CAPAS.json').write_text(json.dumps({'skills_del_autor': ['skill-creator', 'canvas']}))

    def tearDown(self):
        self.tmp.cleanup()

    def skill(self, nombre, texto):
        d = self.raiz / '.claude' / 'skills' / nombre
        d.mkdir(parents=True, exist_ok=True)
        (d / 'SKILL.md').write_text(texto, encoding='utf-8')
        return d


class CrearSkill(Base):
    def test_crea_con_prefijo_y_la_plantilla_pasa_el_validador(self):
        ok, msg, d = C.crear('mi-seguimiento-cobros', self.raiz)
        self.assertTrue(ok, msg)
        errores, _ = V.validar(d)
        self.assertEqual(errores, [])
        self.assertIn('name: mi-seguimiento-cobros', (d / 'SKILL.md').read_text(encoding='utf-8'))

    def test_exige_prefijo_salvo_que_se_pida(self):
        ok, msg, _ = C.crear('propuestas', self.raiz)
        self.assertFalse(ok)
        self.assertIn('mi-propuestas', msg)
        ok, _, _ = C.crear('acme-propuestas', self.raiz, sin_prefijo=True)
        self.assertTrue(ok)

    def test_no_usa_el_nombre_de_una_skill_del_autor(self):
        ok, msg, _ = C.crear('canvas', self.raiz, sin_prefijo=True)
        self.assertFalse(ok)
        self.assertIn('skill de Arbrain', msg)

    def test_no_pisa_una_carpeta_existente(self):
        d = self.skill('mi-x', 'mío')
        ok, _, _ = C.crear('mi-x', self.raiz)
        self.assertFalse(ok)
        self.assertEqual((d / 'SKILL.md').read_text(encoding='utf-8'), 'mío')

    def test_rechaza_nombres_invalidos(self):
        for malo in ('Mi-Cosa', 'mi_cosa', 'mi--cosa', 'mi-cosa-', '../mi-x', 'mi-' + 'a' * 70):
            with self.subTest(nombre=malo):
                ok, _, _ = C.crear(malo, self.raiz)
                self.assertFalse(ok)

    def test_subcarpetas(self):
        self.assertEqual(C.main(['mi-reporte', '--con', 'references,scripts', '--raiz', str(self.raiz)]), 0)
        d = self.raiz / '.claude' / 'skills' / 'mi-reporte'
        self.assertTrue((d / 'references').is_dir() and (d / 'scripts').is_dir())
        self.assertEqual(C.main(['mi-otro', '--con', 'videos', '--raiz', str(self.raiz)]), 2)


class Validar(Base):
    DESC = 'Arma el seguimiento de cobros y deja borradores. Usar ante «quién me debe» o «cobranza».'

    def test_buena(self):
        d = self.skill('mi-cobros', f'---\nname: mi-cobros\ndescription: "{self.DESC}"\n---\n\n# Cobros\n\nPasos.\n')
        self.assertEqual(V.validar(d), ([], []))

    def test_bloque_y_metadata_anidada(self):
        d = self.skill('mi-cobros', f'---\nname: mi-cobros\ndescription: >\n  {self.DESC}\n  Segunda línea.\n'
                                    'metadata:\n  version: "1"\n---\n# Cobros\nPasos.\n')
        errores, avisos = V.validar(d)
        self.assertEqual(errores, [])
        self.assertEqual(avisos, [])

    def test_name_distinto_a_la_carpeta(self):
        d = self.skill('mi-cobros', f'---\nname: cobros\ndescription: "{self.DESC}"\n---\nPasos.\n')
        self.assertTrue(any('no coincide' in e for e in V.validar(d)[0]))

    def test_sin_encabezado_o_sin_cierre(self):
        d = self.skill('mi-a', '# Sin encabezado\n')
        self.assertTrue(V.validar(d)[0])
        d = self.skill('mi-b', '---\nname: mi-b\n')
        self.assertIn('no cierra', V.validar(d)[0][0])

    def test_descripcion_con_angulos_o_larga(self):
        d = self.skill('mi-a', '---\nname: mi-a\ndescription: "usa <esto> siempre en cada caso que aparezca algo"\n---\nx\n')
        self.assertTrue(any('«<»' in e for e in V.validar(d)[0]))
        d = self.skill('mi-b', '---\nname: mi-b\ndescription: "' + 'a' * 1100 + '"\n---\nx\n')
        self.assertTrue(any('1024' in e for e in V.validar(d)[0]))

    def test_dos_puntos_sin_comillas(self):
        d = self.skill('mi-a', '---\nname: mi-a\ndescription: Hace esto: y lo otro\n---\nx\n')
        self.assertIn('comillas', V.validar(d)[0][0])

    def test_referencia_que_no_existe(self):
        d = self.skill('mi-a', f'---\nname: mi-a\ndescription: "{self.DESC}"\n---\nLee `references/tono.md`.\n')
        errores, avisos = V.validar(d)
        self.assertEqual(errores, [])
        self.assertTrue(any('references/tono.md' in a for a in avisos))
        (d / 'references').mkdir()
        (d / 'references' / 'tono.md').write_text('x')
        self.assertEqual(V.validar(d), ([], []))

    def test_campo_desconocido_es_aviso_no_error(self):
        d = self.skill('mi-a', f'---\nname: mi-a\ndescription: "{self.DESC}"\nautor: yo\n---\nx\n')
        errores, avisos = V.validar(d)
        self.assertEqual(errores, [])
        self.assertTrue(any('autor' in a for a in avisos))

    def test_la_propia_skill_creator_es_valida(self):
        self.assertEqual(V.validar(SKILL)[0], [])


if __name__ == '__main__':
    unittest.main()
