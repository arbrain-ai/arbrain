"""Frescura de now.md en la edición del alumno (1 nov 2026, sistema nervioso M1).

El daemon no reescribe now.md si solo cambiaría su sello, así que la fecha del archivo se queda atrás: la foto vale si
sigue siendo del daemon y su sello es de hoy. Sin zonas de la base (Windows sin tzdata): `hoy` se pasa explícito.
"""
import hashlib
import importlib.util
import os
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location('agenda_context', ROOT / '.claude/hooks/agenda-context.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

CUERPO = ('# Ahora\n\n> **Domingo 1 de noviembre 2026** (America/Mexico_City)\n\n## Hitos\n- **Mes:** Primer cliente\n\n'
          '## Hoy\n- `12:00` Llamada\n\n## Esta semana\n_Nada agendado._\n\n---\n'
          '> Generado por Arbrain el 1 nov 2026, 07:40 (America/Mexico_City).\n')


def del_daemon(cuerpo=CUERPO):
    return f'<!-- arbrain:now sha256={hashlib.sha256(cuerpo.encode()).hexdigest()} -->\n{cuerpo}'


class FrescuraTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / '.claude/plan').mkdir(parents=True)
        self.now = self.root / '.claude/now.md'
        self.hace_3h = time.time() - 3 * 3600

    def tearDown(self):
        self.tmp.cleanup()

    def escribir(self, texto, mtime):
        self.now.write_text(texto, encoding='utf-8')
        os.utime(self.now, (mtime, mtime))

    def test_del_daemon_y_de_hoy_vale_aunque_el_archivo_tenga_horas(self):
        self.escribir(del_daemon(), self.hace_3h)
        self.assertEqual(M.now_frescura(self.root, self.now.read_text(), self.hace_3h, hoy='2026-11-01'), '')

    def test_de_otro_dia_avisa(self):
        self.escribir(del_daemon(), self.hace_3h)
        aviso = M.now_frescura(self.root, self.now.read_text(), self.hace_3h, hoy='2026-11-02')
        self.assertIn('otro día (2026-11-01)', aviso)

    def test_editado_a_mano_se_mide_por_la_fecha_del_archivo(self):
        tocado = del_daemon().replace('Primer cliente', 'Otro objetivo')
        self.assertFalse(M.now_es_del_daemon(tocado))
        self.assertIn('más de 3 minutos', M.now_frescura(self.root, tocado, self.hace_3h, hoy='2026-11-01'))
        manual = '<!-- manual -->\n' + CUERPO
        self.assertIn('más de 3 minutos', M.now_frescura(self.root, manual, self.hace_3h, hoy='2026-11-01'))
        self.assertEqual(M.now_frescura(self.root, manual, time.time() - 30, hoy='2026-11-01'), '')

    def test_sin_sello_se_mide_como_antes(self):
        semilla = '<!-- arbrain:now pendiente -->\n# Ahora\n\n## Hoy\n_Nada agendado._\n'
        self.assertIn('más de 3 minutos', M.now_frescura(self.root, semilla, self.hace_3h, hoy='2026-11-01'))

    def test_plan_cambiado_despues_de_la_foto(self):
        cal = self.root / '.claude/plan/calendario.json'
        cal.write_text('{}', encoding='utf-8')
        os.utime(cal, (self.hace_3h + 600, self.hace_3h + 600))
        aviso = M.now_frescura(self.root, del_daemon(), self.hace_3h, hoy='2026-11-01')
        self.assertIn('calendario.json', aviso)

    def test_crlf_de_un_checkout_en_windows_sigue_siendo_del_daemon(self):
        self.assertTrue(M.now_es_del_daemon(del_daemon().replace('\n', '\r\n')))

    def test_el_turno_ya_no_lleva_el_aviso_de_3_minutos(self):
        self.escribir(del_daemon(), self.hace_3h)
        texto = M.agenda_context(self.root)
        # El sello es del 1 nov 2026: hoy real puede ser otro día, pero nunca vuelve el aviso de los 3 minutos.
        self.assertNotIn('más de 3 minutos', texto)
        self.assertIn('## Hoy', texto)


if __name__ == '__main__':
    unittest.main()
