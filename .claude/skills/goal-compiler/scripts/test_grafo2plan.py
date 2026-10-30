import copy
import unittest
from grafo2plan import compilar, render_md


def graph():
    return dict(titulo='Prueba', slug='prueba', nodos=[
        dict(id=x, label=x) for x in ('raw', 'edit', 'review')], aristas=[
        dict(id='cut', **{'from': 'raw'}, to='edit', label='cortar', tipo='script'),
        dict(id='check', **{'from': 'edit'}, to='review', label='revisar', tipo='agente'),
        dict(id='retry', **{'from': 'review'}, to='edit', label='corregir', tipo='agente',
             plan_role='feedback', condition='Si la revisión falla')], lazos=[])


class PlannerTest(unittest.TestCase):
    def test_feedback_preserved_without_mutating_source(self):
        g = graph(); before = copy.deepcopy(g)
        p = compilar(g)
        self.assertEqual(g, before)
        self.assertEqual([a['id'] for f in p for a in f['retornos']], ['retry'])
        self.assertEqual([t['id'] for f in p for x in f['grupos'] for t in x['transformaciones']], ['cut', 'check'])
        self.assertIn('Si la revisión falla', render_md(g, p))

    def test_unclassified_cycle_fails_closed(self):
        g = graph(); del g['aristas'][-1]['plan_role']
        with self.assertRaises(SystemExit): compilar(g)

    def test_feedback_requires_condition(self):
        g = graph(); del g['aristas'][-1]['condition']
        with self.assertRaises(ValueError): compilar(g)

    def test_root_gate_is_not_lost(self):
        g = graph(); g['lazos'] = [dict(id='root', sobre='nodo:raw', label='source')]
        self.assertEqual(compilar(g)[0]['gates'][0]['id'], 'root')

    def test_feedback_gate_attaches_to_source(self):
        g = graph(); g['lazos'] = [dict(id='return', sobre='arista:retry', label='return')]
        self.assertEqual(compilar(g)[-1]['gates'][0]['id'], 'return')

    def test_missing_anchor_fails(self):
        g = graph(); g['lazos'] = [dict(id='lost', sobre='nodo:missing')]
        with self.assertRaises(ValueError): compilar(g)

    def test_duplicate_edge_fails(self):
        g = graph(); g['aristas'].append(g['aristas'][0].copy())
        with self.assertRaises(ValueError): compilar(g)


if __name__ == '__main__': unittest.main()
