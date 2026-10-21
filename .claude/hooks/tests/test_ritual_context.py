import importlib.util
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location('agenda_context', ROOT / '.claude/hooks/agenda-context.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)
TZ = ZoneInfo('America/Mexico_City')


def at(day, hour, minute=0):
    return datetime(2026, 10, day, hour, minute, tzinfo=TZ)


class RitualContextTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_ventana_20h(self):
        self.assertEqual(M.ritual_context(self.root, at(10, 19, 59), {}), '')
        self.assertIn('Ritual pendiente: bajar a tierra', M.ritual_context(self.root, at(10, 20, 0), {}))

    def test_una_vez_por_dia_y_reaparece_manana(self):
        self.assertTrue(M.ritual_context(self.root, at(10, 20, 5), {}))
        self.assertEqual(M.ritual_context(self.root, at(10, 21, 0), {}), '')
        self.assertEqual(M.ritual_context(self.root, at(10, 23, 59), {}), '')
        self.assertTrue(M.ritual_context(self.root, at(11, 20, 1), {}))

    def test_no_en_crons(self):
        self.assertEqual(M.ritual_context(self.root, at(10, 21), {'CLAUDECLAW_SOURCE': 'cron'}), '')
        # un cron no consume el aviso del día
        self.assertTrue(M.ritual_context(self.root, at(10, 21), {}))

    def test_hecho_no_se_inyecta(self):
        M.ritual_marcar_hecho(self.root, at(10, 20, 30))
        self.assertEqual(M.ritual_context(self.root, at(10, 21), {}), '')
        self.assertTrue(M.ritual_context(self.root, at(11, 20, 10), {}))


if __name__ == '__main__':
    unittest.main()
