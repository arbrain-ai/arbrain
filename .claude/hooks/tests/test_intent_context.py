import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location('intent_context', ROOT / '.claude/hooks/intent-context.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class IntentContextTests(unittest.TestCase):
    def test_real_requests(self):
        cases = [
            ('volví del gym, ponme en contexto', 'Decisiones / memoria'),
            ('qué tengo hoy en el calendario', 'Agenda / tareas / objetivos'),
            ('buenos días', 'Bajar a tierra (mes, semana, día)'),
            ('bájame a tierra el mes', 'Bajar a tierra (mes, semana, día)'),
            ('bájame a tierra la semana', 'Bajar a tierra (mes, semana, día)'),
            ('¿qué sigo?', 'Mi camino en el programa'),
            ('Levy, ¿en qué voy?', 'Mi camino en el programa'),
            ('subí el diario', 'Diario'),
            ('dibuja esto en el lienzo', 'Diagramas y lienzo'),
            ('arregla el árbol de archivos de mi cerebro artificial', 'Operación del sistema'),
            ('qué hablamos en la conversación pasada', 'Búsqueda histórica'),
            ('hazme una imagen para el post', 'Imágenes'),
            ('lee este libro conmigo', 'Leer un libro o curso'),
            ('mejora la skill de agenda', 'Mejorar una skill'),
            ('crea una skill de mi seguimiento de cobros', 'Crear una skill'),
            ('documenta este proceso para la próxima', 'Crear una skill'),
            ('veamos mi negocio como sistema viable', 'Sistema viable'),
            ('audita el sistema', 'Auditoría'),
        ]
        for prompt, name in cases:
            with self.subTest(prompt=prompt):
                hits = M.resolve(prompt)
                self.assertIn(name, [h['name'] for h in hits])
                self.assertLessEqual(len(hits), 2)
                self.assertFalse(any(h['missing'] for h in hits))

    def test_no_noise_and_word_boundaries(self):
        for prompt in ['hola hermano', 'buenas tardes', 'conversiones inventadas', 'mi agendaextra']:
            self.assertEqual(M.intent_context(prompt), '')

    def test_bounded_mixed_request(self):
        prompt = ' '.join(p for _, phrases, _ in M.ROUTES for p in phrases)
        self.assertEqual(len(M.resolve(prompt)), 2)
        self.assertLessEqual(len(M.intent_context(prompt)), M.MAX_CHARS)

    def test_missing_is_visible(self):
        with tempfile.TemporaryDirectory() as tmp:
            text = M.intent_context('recuérdame lo que decidimos', Path(tmp))
            self.assertIn('RUTA AUSENTE', text)

    def test_live_catalog_fallback(self):
        self.assertIn('.claude/skills/canvas/SKILL.md', M.find('diagrama'))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            p = root / '.claude/skills/example/SKILL.md'
            p.parent.mkdir(parents=True)
            p.write_text('---\nname: example\ndescription: telescopio naranja\n---\n')
            self.assertIn('.claude/skills/example/SKILL.md', M.find('telescopio', root))
            p.write_text('---\nname: example\ndescription: otro tema\n---\n')
            self.assertEqual(M.find('telescopio', root), [])

    def test_actual_shared_hook_output(self):
        proc = subprocess.run([sys.executable, str(ROOT / '.claude/hooks/memory-recall.py')],
                              input=json.dumps({'prompt': 'recuerda esto por favor'}), text=True,
                              capture_output=True, timeout=12)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        text = json.loads(proc.stdout)['hookSpecificOutput']['additionalContext']
        self.assertIn('RUTAS POR INTENCIÓN', text)
        # Desde la v0.2 now.md es de la capa del dueño: existe después de sembrar (arbrain/cerebro/sembrar.py).
        if (ROOT / '.claude/now.md').exists():
            self.assertIn('AGENDA COMPARTIDA DEL TURNO', text)
        else:
            self.assertIn('AGENDA NO DISPONIBLE', text)
        self.assertIn('memory-manager/SKILL.md', text)

    def test_router_failure_keeps_agenda_and_recall(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            hooks = root / '.claude/hooks'
            hooks.mkdir(parents=True)
            memory = root / '.claude/memory'
            memory.mkdir()
            (memory / 'MEMORY-indice.md').write_text('- `project/demo.md` — recuerdo. **T:** vsl.\n')
            (hooks / 'memory-recall.py').write_bytes((ROOT / '.claude/hooks/memory-recall.py').read_bytes())
            (hooks / 'agenda-context.py').write_text('def agenda_context(): return "AGENDA_PRESERVADA"\n')
            proc = subprocess.run([sys.executable, str(hooks / 'memory-recall.py')],
                                  input=json.dumps({'prompt': 'vsl'}), capture_output=True,
                                  text=True, timeout=5)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            text = json.loads(proc.stdout)['hookSpecificOutput']['additionalContext']
            self.assertIn('RUTAS POR INTENCIÓN NO DISPONIBLES', text)
            self.assertIn('AGENDA_PRESERVADA', text)
            self.assertIn('project/demo.md', text)


if __name__ == '__main__':
    unittest.main()
