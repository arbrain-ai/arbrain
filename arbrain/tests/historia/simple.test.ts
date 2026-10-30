// Historia simple (29 oct 2026). Daniel: «¿por qué no veo cambiar aquí donde dice worktree, merge, rama y commit? No cambia en lo
// absoluto. Además no me interesa ver tanta data». Las piezas de la leyenda son lentes sobre el grafo y los merges de sincronía
// se esconden de fábrica; los que meten una rama se leen en humano («Se unió x»).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { carriles, leerMerge, luz, tituloDe, vistaGrafo, type CommitGrafo, type Lente, type RefGrafo } from '../../src/features/historia/grafo'

const c = (sha: string, padres: string[], asunto = sha, refs: RefGrafo[] = []): CommitGrafo => ({
  sha, corto: sha, padres, asunto, quien: 'levy', quienNombre: 'Levy', cuando: '2026-10-29T08:00:00-06:00', archivos: 1, mas: 1, menos: 0, refs,
})
const MAIN: RefGrafo = { nombre: 'main', tipo: 'main' }
const WT: RefGrafo = { nombre: 'wt-agente', tipo: 'worktree', carpeta: 'wt-agente' }

test('leerMerge: sincronía con main en sus formas, unión de una rama y mensajes que no se leen', () => {
  for (const m of [
    "Merge remote-tracking branch 'origin/main' into brief-del-uno-a-uno",
    "Merge remote-tracking branch 'origin/main'",
    'Merge origin/main en release-0213 (queda el arreglo del visor)',
    'Merge origin/main (diseño unificado) en harness-noche',
    'Merge main en perro-telemetria (conexion.md)',
    "Merge branch 'main' of https://github.com/fulano/repo",
    "Merge branch 'main' into historia-simple",
  ]) assert.deepEqual(leerMerge(m), { tipo: 'sincronia' }, m)
  assert.deepEqual(leerMerge("Merge branch 'hn-historia' into harness-noche"), { tipo: 'union', rama: 'hn-historia', destino: 'harness-noche' })
  assert.deepEqual(leerMerge("Merge branch 'historia-simple' into main"), { tipo: 'union', rama: 'historia-simple' })
  assert.deepEqual(leerMerge("Merge branch 'historia-simple'"), { tipo: 'union', rama: 'historia-simple' })
  assert.equal(leerMerge('unificado: fusiona ui-noche sobre main'), null)
  assert.equal(leerMerge('Historia sin solapamientos'), null)
})

test('tituloDe: un merge que mete una rama se lee «Se unió x»; un commit normal conserva su mensaje', () => {
  assert.equal(tituloDe({ asunto: "Merge branch 'historia-simple' into main", padres: ['a', 'b'] }), 'Se unió historia-simple')
  assert.equal(tituloDe({ asunto: "Merge branch 'hn-play' into harness-noche", padres: ['a', 'b'] }), 'Se unió hn-play a harness-noche')
  assert.equal(tituloDe({ asunto: "Merge remote-tracking branch 'origin/main' into x", padres: ['a', 'b'] }), 'Se puso al día con main')
  assert.equal(tituloDe({ asunto: 'merge: zoom + nav colapsable', padres: ['a', 'b'] }), 'merge: zoom + nav colapsable')
  // Sin dos padres no es merge aunque el mensaje lo parezca.
  assert.equal(tituloDe({ asunto: "Merge branch 'x' into main", padres: ['a'] }), "Merge branch 'x' into main")
})

// La forma real del repo: un agente trae origin/main a su rama (S) y main avanza hasta su punta (t). Debajo, una unión clásica (u).
//   t (main) ← S = merge(a1, m1) ; a1 ← m0 ; m1 ← m0 ; u = merge(m0', x) …
const repo = () => [
  c('t', ['s'], 'Guardián de disco', [MAIN]),
  c('s', ['a1', 'm1'], "Merge remote-tracking branch 'origin/main' into brief"),
  c('w', ['m1'], 'Trabajo del agente', [WT]),
  c('m1', ['u'], 'Lo que ya estaba en main'),
  c('a1', ['u'], 'Brief del uno a uno'),
  c('u', ['m0', 'x'], "Merge branch 'historia-pulir' into main"),
  c('x', ['m0'], 'Historia sin solapamientos'),
  c('m0', [], 'Primero'),
]

test('vistaGrafo: esconde la sincronía y quien la apuntaba se dibuja hacia sus padres', () => {
  const v = vistaGrafo(repo())
  assert.equal(v.ocultos, 1)
  assert.ok(!v.commits.some(x => x.sha === 's'))
  const t = v.commits.find(x => x.sha === 't')!
  assert.deepEqual(t.enlaces, ['a1', 'm1'], 'la punta de main hereda los padres del merge escondido')
  assert.equal(t.merge, false, 'no se vuelve merge por heredar dos padres')
  assert.deepEqual(t.padres, ['s'], 'sus padres de git no se tocan (el detalle los muestra)')
  assert.equal(v.filas.length, v.commits.length)
  assert.equal(v.commits.find(x => x.sha === 'u')!.titulo, 'Se unió historia-pulir')
})

test('vistaGrafo: con sincronías a la vista no esconde nada; la punta de una rama nunca se esconde', () => {
  assert.equal(vistaGrafo(repo(), { sincronias: true }).ocultos, 0)
  const conPunta = [c('s', ['a', 'b'], "Merge remote-tracking branch 'origin/main' into wt-agente", [WT]), c('a', ['b']), c('b', [])]
  const v = vistaGrafo(conPunta)
  assert.equal(v.ocultos, 0)
  assert.equal(v.commits[0].titulo, 'Se puso al día con main')
  // La etiqueta de un agente ya unido a main no lo detiene: su sincronía también es ruido.
  const unida = [c('t', ['s'], 'Punta', [MAIN]), c('s', ['a', 'b'], "Merge remote-tracking branch 'origin/main' into wt-agente", [WT]), c('a', ['b']), c('b', [])]
  assert.equal(vistaGrafo(unida).ocultos, 1)
})

test('vistaGrafo: cada commit sabe su línea (main por primer padre, agente desde su worktree, lo demás rama)', () => {
  const v = vistaGrafo(repo())
  const l = Object.fromEntries(v.commits.map(x => [x.sha, x.linea]))
  assert.deepEqual(l, { t: 'main', w: 'agente', m1: 'rama', a1: 'main', u: 'main', x: 'rama', m0: 'main' })
  // El carril que baja de un commit de main es de main; el que abre una unión hacia la rama que entra, de la rama.
  const fu = v.filas[v.commits.findIndex(x => x.sha === 'u')]
  assert.ok(fu.merge)
  assert.ok(fu.tramos.some(t => t.desde === 'punto' && t.de === t.a && t.linea === 'main'))
  assert.ok(fu.tramos.some(t => t.desde === 'punto' && t.de !== t.a && t.linea === 'rama'))
  const fw = v.filas[v.commits.findIndex(x => x.sha === 'w')]
  assert.ok(fw.tramos.filter(t => t.desde === 'punto' && t.de === fw.col).every(t => t.linea === 'agente'), 'el carril del agente es suyo')
})

test('carriles: sin quién diga la línea, todo es rama y el merge se puede declarar aparte', () => {
  const { filas } = carriles([{ sha: 'b', padres: ['a', 'z'], merge: false }, { sha: 'a', padres: [] }])
  assert.equal(filas[0].merge, false)
  assert.ok(filas.every(f => f.linea === 'rama' && f.tramos.every(t => t.linea === 'rama')))
})

test('luz: cada lente ilumina lo que nombra y atenúa lo demás', () => {
  const punto = (linea: 'main' | 'agente' | 'rama', merge = false) => ({ tipo: 'punto' as const, linea, merge })
  const tramo = (linea: 'main' | 'agente' | 'rama') => ({ tipo: 'tramo' as const, linea })
  const fila = (linea: 'main' | 'agente' | 'rama', merge = false) => ({ tipo: 'fila' as const, linea, merge })
  const ref = (r: RefGrafo['tipo']) => ({ tipo: 'ref' as const, ref: r })
  // Sin lente, y con +/− (que solo muestra su columna), nada cambia.
  for (const l of [null, 'cifras'] as (Lente | null)[]) for (const p of [punto('main'), tramo('rama'), fila('agente'), ref('worktree')]) assert.equal(luz(l, p), undefined)
  // commit: los puntos.
  assert.equal(luz('commit', punto('rama')), 'si'); assert.equal(luz('commit', tramo('main')), 'no'); assert.equal(luz('commit', fila('main')), undefined)
  // rama: los carriles en paralelo y sus etiquetas, no main.
  assert.equal(luz('rama', tramo('agente')), 'si'); assert.equal(luz('rama', tramo('rama')), 'si'); assert.equal(luz('rama', tramo('main')), 'no')
  assert.equal(luz('rama', ref('rama')), 'si'); assert.equal(luz('rama', ref('main')), 'no'); assert.equal(luz('rama', punto('rama')), 'no')
  // main: su línea, sus puntos, sus renglones y su etiqueta.
  assert.equal(luz('main', tramo('main')), 'si'); assert.equal(luz('main', tramo('agente')), 'no')
  assert.equal(luz('main', punto('main')), 'si'); assert.equal(luz('main', fila('rama')), 'no'); assert.equal(luz('main', ref('main')), 'si')
  // worktree: los carriles de los agentes.
  assert.equal(luz('worktree', tramo('agente')), 'si'); assert.equal(luz('worktree', tramo('rama')), 'no'); assert.equal(luz('worktree', ref('worktree')), 'si'); assert.equal(luz('worktree', ref('rama')), 'no')
  // merge: los puntos de unión y sus renglones.
  assert.equal(luz('merge', punto('main', true)), 'si'); assert.equal(luz('merge', punto('main')), 'no'); assert.equal(luz('merge', fila('rama', true)), 'si'); assert.equal(luz('merge', tramo('main')), 'no')
})

test('la vista: renglón sin autor, título a dos líneas, +/− solo con su lente y la leyenda como lente', () => {
  const fuente = readFileSync(path.join(__dirname, '../../src/features/historia/GrafoGit.tsx'), 'utf8')
  const css = readFileSync(path.join(__dirname, '../../src/features/historia/grafo.module.css'), 'utf8')
  assert.doesNotMatch(fuente, /className=\{g\.autor\}/, 'fuera la columna de quién lo hizo')
  assert.match(fuente, /vistaGrafo\(/)
  assert.match(fuente, /lente === 'cifras' && <Cifras/)
  assert.match(fuente, /data-lente=\{lente/)
  assert.match(css, /-webkit-line-clamp: 2/)
})
