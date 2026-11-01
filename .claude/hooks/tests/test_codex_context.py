"""Codex recibe lo mismo que CLAUDE.md importa (1 nov 2026, sistema nervioso M3): MEMORY, RETRATO, meta, camino y now.

Con el techo único de 8,000 de antes, si MEMORY.md + now.md se pasaban, Codex no recibía ninguno.
"""
import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location('codex_context', ROOT / '.claude/hooks/codex-context.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class CodexContextTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / '.claude/memory/project').mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def poner(self, rel, texto):
        (self.root / rel).write_text(texto, encoding='utf-8')

    def test_los_cinco_llegan_aunque_juntos_pasen_el_techo_viejo(self):
        self.poner('.claude/memory/MEMORY.md', '# Esencia\n' + 'regla viva\n' * 400)
        self.poner('.claude/memory/RETRATO.md', '# Retrato\n' + 'cómo decide\n' * 400)
        self.poner('.claude/memory/project/meta-90-dias.md', '# Mi meta a 90 días\n- **Meta a 90 días:** sin número todavía\n')
        self.poner('.claude/memory/project/mi-camino.md', '# Mi camino\n- Día 7 de 90\n')
        self.poner('.claude/now.md', '# Ahora\n\n## Hoy\n- `12:00` Llamada\n')
        texto, notas = M.context(self.root)
        self.assertGreater(len(texto), 8000)
        for rel in M.FILE_BUDGETS:
            if rel.endswith('PERSONALIDAD.md'):
                continue  # opcional: solo existe cuando viaja la personalidad del autor
            self.assertIn(f'Fuente: {rel}', texto)
        self.poner('.claude/memory/PERSONALIDAD.md', '# Personalidad\n')
        self.assertIn('Fuente: .claude/memory/PERSONALIDAD.md', M.context(self.root)[0])
        self.assertNotIn('supera el presupuesto', texto)

    def test_meta_y_camino_pendientes_no_son_error(self):
        self.poner('.claude/memory/MEMORY.md', '# Esencia\n')
        self.poner('.claude/memory/RETRATO.md', '# Retrato\n')
        self.poner('.claude/now.md', '# Ahora\n')
        _, notas = M.context(self.root)
        self.assertFalse([n for n in notas if 'meta-90-dias' in n or 'mi-camino' in n])

    def test_un_archivo_que_se_pasa_no_tumba_a_los_demas(self):
        self.poner('.claude/memory/MEMORY.md', 'x' * 9000)
        self.poner('.claude/memory/RETRATO.md', '# Retrato\n')
        self.poner('.claude/now.md', '# Ahora\n')
        texto, notas = M.context(self.root)
        self.assertIn('Fuente: .claude/memory/RETRATO.md', texto)
        self.assertTrue(any('MEMORY.md' in n and 'presupuesto' in n for n in notas))


if __name__ == '__main__':
    unittest.main()
