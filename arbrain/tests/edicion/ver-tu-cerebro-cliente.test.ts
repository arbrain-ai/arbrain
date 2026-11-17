// Fundador en Windows (15 nov 2026, uno a uno): Memoria › «Ver tu cerebro» salía vacío con «El servidor respondió 404».
// Reproducido en la copia del alumno generada (docs/builds/cliente-cesar-2026-11-16/memoria-404/REPORTE.md): el proxy de
// la edición cliente respondía 404 «No disponible en esta edición» a `/api/cerebro/graph` y `/api/cerebro/node` porque
// no estaban en su lista blanca. Detrás había un segundo tropiezo: aun abierta, la ruta buscaba el cerebro en el repo
// del autor (`BUSINESS_OS_ROOT`, su respaldo, `cwd/..`) y no en `ARBRAIN_HOME`, el cerebro del alumno.
// Este sensor fija las tres cosas: la lista deja pasar lo que pide la pantalla, el grafo sale del cerebro del alumno
// (aunque sea chico: sus primeras memorias y sus habilidades) y, si de verdad falta algo, una frase que dice qué hacer.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'
import { decidirCliente } from '../../src/lib/proxy-cliente'
import { URL_GRAFO, urlNodo } from '../../src/features/cerebro/types'
import { avisoCerebro, sintesisDisponible } from '../../src/features/cerebro/aviso'

const ruta = (url: string) => new URL(url, 'http://x').pathname
const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')

let base: string, cerebro: string
const env = { ...process.env }
before(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'ver-tu-cerebro-')))
  cerebro = join(base, 'cerebro')
  // Un alumno recién instalado, días después: la memoria sembrada, dos memorias suyas y dos habilidades.
  for (const d of ['.claude/memory/user', '.claude/memory/feedback', '.claude/skills/presentaciones', '.claude/skills/oferta']) mkdirSync(join(cerebro, d), { recursive: true })
  writeFileSync(join(cerebro, '.claude/memory/MEMORY.md'), '# Memoria\n\n_Vacía a propósito._\n')
  writeFileSync(join(cerebro, '.claude/memory/user/quien-soy.md'), '# Quién soy\n\nConsultor con quince años en mi industria. Uso `presentaciones` para mis decks.\n')
  writeFileSync(join(cerebro, '.claude/memory/feedback/decks-cortos.md'), '# Decks cortos\n\nDiez láminas como máximo. Ver [quién soy](../user/quien-soy.md).\n')
  writeFileSync(join(cerebro, '.claude/skills/presentaciones/SKILL.md'), '---\nname: presentaciones\ndescription: Arma presentaciones\n---\n# Presentaciones\n')
  writeFileSync(join(cerebro, '.claude/skills/oferta/SKILL.md'), '---\nname: oferta\ndescription: Arma tu oferta\n---\n# Oferta\n')
  process.env.ARBRAIN_EDICION = 'cliente'
  process.env.ARBRAIN_HOME = cerebro
  delete process.env.BUSINESS_OS_ROOT
})
after(() => {
  for (const k of ['ARBRAIN_EDICION', 'ARBRAIN_HOME', 'BUSINESS_OS_ROOT']) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k] }
  rmSync(base, { recursive: true, force: true })
})

test('el proxy del alumno deja pasar lo que pide «Ver tu cerebro» (antes: 404 «No disponible en esta edición»)', () => {
  for (const url of [URL_GRAFO, `${URL_GRAFO}&refresh=1`, urlNodo('memory/user/quien-soy.md')]) {
    assert.equal(apiPermitidaEnCliente(ruta(url)), true, url)
    assert.deepEqual(decidirCliente(ruta(url), true, false), { tipo: 'pasa' }, url)
    assert.equal(decidirCliente(ruta(url), false, false).tipo, 'json', `${url} sin sesión sigue cerrado`)
  }
  // La síntesis llama al CLI de Claude del equipo: en el alumno sigue fuera, y la pantalla no ofrece el botón.
  assert.equal(apiPermitidaEnCliente('/api/cerebro/synthesize'), false)
  assert.equal(sintesisDisponible(true), false)
  assert.equal(sintesisDisponible(false), true)
})

test('el grafo sale del cerebro del alumno (ARBRAIN_HOME), no del repo donde corre la web', async () => {
  const { buildGraph } = await import('../../src/features/cerebro/server/graph')
  const g = await buildGraph(true, ['memoria', 'skills', 'documentos'])
  assert.equal(g.ok, true)
  // Los mensajes solo cuentan nodos: si esto falla, nunca imprime títulos de una memoria ajena.
  const titulos = g.nodes.map((n) => n.title)
  assert.ok(titulos.includes('Quién soy') && titulos.includes('Decks cortos'), `sus dos memorias no están entre ${g.nodes.length} nodos`)
  const skills = g.nodes.filter((n) => n.type === 'skill').map((n) => n.title).sort()
  assert.ok(skills.length === 2 && skills[0] === 'oferta' && skills[1] === 'presentaciones', `habilidades: ${skills.length}, se esperaban sus 2`)
  // Nada del repo del autor (la web del test corre dentro de él: antes caía en `cwd/..`).
  assert.ok(g.nodes.length <= 6, `solo lo del alumno: ${g.nodes.length} nodos`)
  // Lo conecta: la memoria nombra la habilidad y el feedback enlaza la memoria.
  assert.ok(g.edges.length >= 2, `conexiones: ${g.edges.length}`)
})

test('el panel de una neurona lee el archivo del alumno', async () => {
  const { buildGraph, getNodeDetail } = await import('../../src/features/cerebro/server/graph')
  const g = await buildGraph(true, ['memoria', 'skills', 'documentos'])
  const id = g.nodes.find((n) => n.title === 'Quién soy')!.id
  const d = await getNodeDetail(id)
  assert.match(d?.content ?? '', /Consultor con quince años/)
})

test('cerebro sin carpeta: no responde ok, y la pantalla lo dice en una frase con qué hacer (nunca un código solo)', async () => {
  const { buildGraph } = await import('../../src/features/cerebro/server/graph')
  process.env.ARBRAIN_HOME = join(base, 'no-existe')
  try {
    const g = await buildGraph(true, ['memoria', 'skills', 'documentos'])
    assert.equal(g.ok, false)
    const aviso = avisoCerebro({ grafo: g, error: null, cliente: true })
    assert.ok(aviso && !/Studio|\b404\b|servidor respondió/i.test(aviso), aviso ?? '')
    assert.match(aviso!, /Arbrain/)
  } finally { process.env.ARBRAIN_HOME = cerebro }
})

test('los avisos del alumno: vacío invita a conversar, error explica y nunca nombra el Studio', () => {
  const meta = { generatedAt: '2026-11-16T00:00:00Z', fileCount: 0, isolatedCount: 0, brokenRefs: [], tagCounts: {} }
  const vacio = avisoCerebro({ grafo: { ok: true, nodes: [], edges: [], meta }, error: null, cliente: true })
  assert.match(vacio ?? '', /Levy/)
  const caido = avisoCerebro({ grafo: null, error: { status: 404 }, cliente: true })
  assert.ok(caido && !/Studio|\b404\b/.test(caido), caido ?? '')
  assert.match(caido!, /actualiza mi Arbrain/)
  // Con nodos no hay aviso; y en la instalación del autor sus textos de siempre.
  assert.equal(avisoCerebro({ grafo: { ok: true, nodes: [{} as never], edges: [], meta }, error: null, cliente: true }), null)
  assert.match(avisoCerebro({ grafo: { ok: false, nodes: [], edges: [], meta }, error: null, cliente: false }) ?? '', /Studio/)
})

test('la pantalla usa esos avisos y en el alumno no promete el disco del Studio', () => {
  const vista = fuente('src/features/cerebro/components/VerTuCerebro.tsx')
  assert.match(vista, /avisoCerebro\(/)
  assert.match(vista, /sintesisDisponible\(/)
  assert.doesNotMatch(vista, /\{tr\('El cerebro vive en el disco del Studio/)
})
