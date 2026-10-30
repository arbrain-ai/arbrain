// Taller › Historia (28 oct 2026): la historia dejó de ser pestaña suelta del panel y del «+»; arriba el dueño, debajo git como
// VS Code (carriles, +/−, archivos, diff) con su «qué significa»; y la línea «anoche» del reporte de las 05:30.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { barraCambios, carriles, refsPorCommit, significaCommit, SIGNIFICA } from '../../src/features/historia/grafo'
import { lineaAnoche, type Carril } from '../../src/features/historia/modelo'
import { leerGrafo } from '../../src/features/historia/servidor'
import { EN_TALLER } from '../../src/features/cabina/panel/fijadas'
import { aSegmento, SEGMENTOS_TALLER } from '../../src/features/cabina/panel/taller-segmento'
import { SECCIONES_MENU } from '../../src/features/cabina/panel/menu-orden'
import { rutaDe, seccionDe } from '../../src/features/cabina/model'

test('Historia vive en el Taller: segmento propio, fuera del «+» y /historia redirige', () => {
  assert.equal(EN_TALLER.get('historia'), 'historia')
  assert.equal(aSegmento('historia'), 'historia')
  assert.ok(SEGMENTOS_TALLER.some(s => s.id === 'historia' && s.etiqueta === 'Historia'))
  assert.ok(!SECCIONES_MENU.includes('historia'))
  assert.equal(rutaDe({ destino: 'historia' }), '/chat?panel=taller&taller=historia')
  assert.equal(seccionDe({ vista: 'historia' }), null)
})

test('carriles: una línea recta es un solo carril', () => {
  const { filas, ancho } = carriles([{ sha: 'c', padres: ['b'] }, { sha: 'b', padres: ['a'] }, { sha: 'a', padres: [] }])
  assert.equal(ancho, 1)
  assert.deepEqual(filas.map(f => f.col), [0, 0, 0])
  assert.ok(!filas[2].tramos.some(t => t.hasta === 'abajo'), 'el primer commit no sigue hacia abajo')
})

test('carriles: una rama sale de main y vuelve con un merge', () => {
  // m (merge de x en b) ← x (rama) ← a ; m ← b ← a
  const { filas, ancho } = carriles([
    { sha: 'm', padres: ['b', 'x'] }, { sha: 'x', padres: ['a'] }, { sha: 'b', padres: ['a'] }, { sha: 'a', padres: [] },
  ])
  assert.equal(ancho, 2)
  assert.equal(filas[0].merge, true)
  assert.ok(filas[0].tramos.some(t => t.de === 0 && t.a === 1 && t.hasta === 'abajo'), 'el merge abre el carril de la rama')
  assert.equal(filas[1].col, 1, 'la rama va en su carril')
  assert.equal(filas[2].col, 0, 'main sigue en el suyo')
  assert.ok(filas[3].tramos.some(t => t.de === 1 && t.a === 0 && t.desde === 'arriba'), 'en el padre común las dos líneas se juntan')
  assert.notEqual(filas[1].color, filas[2].color, 'cada rama con su color')
})

test('carriles: dos puntas sin merge (worktrees) abren carriles y se juntan en su base', () => {
  const { filas } = carriles([{ sha: 'w1', padres: ['a'] }, { sha: 'w2', padres: ['a'] }, { sha: 'a', padres: [] }])
  assert.deepEqual(filas.map(f => f.col), [0, 1, 0])
})

test('refs: main primero, worktree con su carpeta, rama suelta', () => {
  const r = refsPorCommit([{ rama: 'wt-x', sha: 's' }, { rama: 'main', sha: 's' }, { rama: 'suelta', sha: 't' }], 'main', new Map([['wt-x', 'wt-x-carpeta']]))
  assert.deepEqual(r.get('s')!.map(x => x.tipo), ['main', 'worktree'])
  assert.equal(r.get('s')![1].carpeta, 'wt-x-carpeta')
  assert.equal(r.get('t')![0].tipo, 'rama')
})

test('qué significa: cada pieza técnica trae su línea', () => {
  for (const k of ['commit', 'rama', 'main', 'worktree', 'merge', 'cifras', 'diff'] as const) assert.ok(SIGNIFICA[k].length > 30, k)
  assert.match(significaCommit({ padres: ['a', 'b'], archivos: 3, mas: 10, menos: 2, refs: [] }), /merge/)
  assert.match(significaCommit({ padres: ['a'], archivos: 1, mas: 1, menos: 0, refs: [{ nombre: 'wt-x', tipo: 'worktree' }] }), /worktree/)
  assert.deepEqual(barraCambios(10, 0), { verdes: 5, rojas: 0 })
  assert.deepEqual(barraCambios(0, 0), { verdes: 0, rojas: 0 })
})

test('leerGrafo: lee un repo real con una rama y un worktree, con +/− y archivos por commit', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'grafo-'))
  const g = (...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' })
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@t'); g('config', 'user.name', 'T')
  writeFileSync(path.join(dir, 'a.md'), 'uno\n'); g('add', '.'); g('commit', '-qm', 'primero')
  g('worktree', 'add', '-q', '-b', 'wt-agente', path.join(dir, '..', path.basename(dir) + '-wt'))
  const wt = path.join(dir, '..', path.basename(dir) + '-wt')
  writeFileSync(path.join(wt, 'b.md'), 'dos\ntres\n'); execFileSync('git', ['-C', wt, 'add', '.']); execFileSync('git', ['-C', wt, '-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-qm', 'del agente'])
  writeFileSync(path.join(dir, 'a.md'), 'uno cambiado\n'); g('commit', '-qam', 'en main')
  return leerGrafo(dir).then(x => {
    assert.equal(x.commits.length, 3)
    assert.equal(x.worktrees, 1)
    const agente = x.commits.find(c => c.asunto === 'del agente')!
    assert.deepEqual([agente.archivos, agente.mas, agente.menos], [1, 2, 0])
    assert.equal(agente.refs[0].tipo, 'worktree')
    const main = x.commits.find(c => c.asunto === 'en main')!
    assert.deepEqual([main.mas, main.menos], [1, 1])
    assert.equal(x.ancho, 2)
  })
})

test('anoche: trabajos que se movieron en la ventana, sin contar dos veces, y decisiones = listos', () => {
  const desde = Date.parse('2026-10-27T18:00:00-06:00'), hasta = Date.parse('2026-10-28T05:30:00-06:00')
  const c = (nombre: string, estado: Carril['estado'], cuando: string, juntado?: string) => ({ nombre, estado, ultimo: { cuando, frase: '' }, ...(juntado ? { juntado } : {}) })
  const r = lineaAnoche(
    [{ tipo: 'junta', cuando: '2026-10-28T01:00:00-06:00', frase: 'Se incorporó «Historia»' }, { tipo: 'cambio', cuando: '2026-10-28T02:00:00-06:00', frase: 'algo' }],
    [c('Historia', 'en-main', '2026-10-28T00:50:00-06:00', '2026-10-28T01:00:00-06:00'), c('Play', 'listo', '2026-10-28T02:00:00-06:00'), c('Viejo', 'quieto', '2026-10-20T10:00:00-06:00')],
    desde, hasta)
  assert.deepEqual([r.trabajos, r.decisiones], [2, 1])
  assert.equal(r.texto, 'Anoche: 2 trabajos, 1 decisión tuya (Taller › Historia)')
  assert.equal(lineaAnoche([], [], desde, hasta).texto, 'Anoche: 0 trabajos, 0 decisiones tuyas')
})
