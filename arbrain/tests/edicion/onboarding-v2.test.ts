// Onboarding v2 «tu socio estratega» (3 nov 2026, docs/builds/onboarding-v2-2026-11-03/SPEC.md). Prototipo detrás de un
// interruptor APAGADO: estas pruebas cuidan que siga apagado, que no se pierda nada del primer arranque de hoy, que el
// lenguaje sea de negocio y que contar lo que se puede traer no lea contenido ni cuente las sesiones del propio Arbrain.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INTERRUPTOR_V2, onboardingV2Encendido } from '../../src/features/primer-arranque/v2/interruptor'
import { accionDe, alcanzables, DESTINO_V1, ESTADO_V2_VACIO, PASOS_V2, TITULO_V2, type EstadoV2 } from '../../src/features/primer-arranque/v2/pasos'
import { CASILLAS, DATOS_CASILLA, guardar, hechas, OCULTAR_MS, ocultar, progreso, visible } from '../../src/features/primer-arranque/v2/empieza-aqui'
import { PEDIDOS_SOCIO, PLACEHOLDER_SOCIO } from '../../src/features/primer-arranque/v2/prompts'
import { carpetasRecientes, contarClaude, contarCodex, esConversacionClaude, hallazgosLocales, RAICES_CODIGO, type Fs } from '../../src/features/primer-arranque/v2/negocio-local'
import { PASOS } from '../../src/features/primer-arranque/lib/pasos'
import { apiPermitidaEnCliente, paginaPermitidaEnCliente } from '../../src/lib/edicion'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')
const ARCHIVOS_V2 = [
  'src/features/primer-arranque/v2/components/PrimerArranqueV2.tsx', 'src/features/primer-arranque/v2/components/SocioEstratega.tsx',
  'src/features/primer-arranque/v2/pasos.ts', 'src/features/primer-arranque/v2/empieza-aqui.ts', 'src/features/primer-arranque/v2/prompts.ts',
  'src/features/primer-arranque/v2/negocio-local.ts', 'src/features/primer-arranque/v2/demo.ts',
]
const listo = (e: Partial<EstadoV2>): EstadoV2 => ({ ...structuredClone(ESTADO_V2_VACIO), ...e })

test('interruptor: apagado por defecto; solo «1» lo enciende', () => {
  assert.equal(onboardingV2Encendido({}), false)
  for (const v of ['0', 'true', 'si', ' 1', '']) assert.equal(onboardingV2Encendido({ [INTERRUPTOR_V2]: v }), false, v)
  assert.equal(onboardingV2Encendido({ [INTERRUPTOR_V2]: '1' }), true)
})

test('las rutas de vista previa revisan el interruptor y la edición cliente no las deja pasar', () => {
  for (const r of ['src/app/play-lab/bienvenida-v2/page.tsx', 'src/app/(main)/inicio-v2/page.tsx']) {
    const t = fuente(r)
    assert.match(t, /if \(!onboardingV2Encendido\(\)\) notFound\(\)/, r)
  }
  assert.match(fuente('src/app/api/primer-arranque-v2/negocio/route.ts'), /if \(!onboardingV2Encendido\(\)\) return new Response\(null, \{ status: 404 \}\)/)
  assert.match(fuente('src/app/api/primer-arranque-v2/negocio/route.ts'), /isDesktopAuthBypassFromHeaders/)
  for (const p of ['/play-lab/bienvenida-v2', '/inicio-v2']) assert.equal(paginaPermitidaEnCliente(p), false, p)
  assert.equal(apiPermitidaEnCliente('/api/primer-arranque-v2/negocio'), false)
  // La bienvenida de hoy no sabe nada de v2.
  assert.doesNotMatch(fuente('src/app/bienvenida/page.tsx'), /v2|ONBOARDING_V2/)
})

test('cuatro pasos y cada paso del primer arranque de hoy tiene dónde vivir', () => {
  assert.deepEqual([...PASOS_V2], ['entra', 'agente', 'herramientas', 'negocio'])
  for (const p of PASOS) assert.ok(DESTINO_V1[p]?.como.length > 10, `sin destino: ${p}`)
  assert.equal(DESTINO_V1.legal.en, 'entra')
  assert.equal(DESTINO_V1.autonomia.en, 'agente')
})

test('el botón de cada paso: lo legal y la autonomía siguen siendo clickwrap; lo demás tiene salida discreta', () => {
  assert.equal(accionDe('entra', listo({})).habilitada, false)
  assert.equal(accionDe('entra', listo({ cuenta: { email: 'a@b.c', nombre: null } })).habilitada, false)
  assert.equal(accionDe('entra', listo({ cuenta: { email: 'a@b.c', nombre: null }, legal: true })).habilitada, true)

  const sinAgente = accionDe('agente', listo({}))
  assert.deepEqual([sinAgente.habilitada, sinAgente.discreta], [true, true])
  const conAgente = listo({ agentes: { claude: { instalado: true, conectado: true }, codex: { instalado: false, conectado: false } } })
  assert.equal(accionDe('agente', conAgente).habilitada, false, 'sin las casillas de Autónomo no sigue')
  assert.equal(accionDe('agente', { ...conAgente, autonomia: true }).habilitada, true)

  assert.equal(accionDe('herramientas', listo({})).discreta, true)
  assert.equal(accionDe('herramientas', listo({ herramientas: { calendario: true, correo: false, github: false } })).discreta, false)
  assert.equal(accionDe('negocio', listo({})).texto, 'Empezar en blanco')
  assert.equal(accionDe('negocio', listo({ negocio: { chats: 3, carpetas: 0, contado: false } })).texto, 'Armar mi expediente')

  assert.deepEqual(alcanzables(listo({})), ['entra'])
  assert.deepEqual(alcanzables(listo({ cuenta: { email: 'a@b.c', nombre: null }, legal: true })), ['entra', 'agente', 'herramientas', 'negocio'])
})

test('«Empieza aquí»: cinco casillas que se marcan solas, no se desmarcan, se ocultan 8 h y se van al completar', () => {
  assert.deepEqual([...CASILLAS], ['camino', 'meta', 'ritual', 'telefono', 'loop'])
  assert.equal(DATOS_CASILLA.telefono.abre, '/settings?seccion=telefono')
  for (const c of CASILLAS) assert.ok(DATOS_CASILLA[c].pedido || DATOS_CASILLA[c].abre, c)

  const g0 = { hechas: [], ocultaHasta: null }
  let h = hechas(g0, { camino: true })
  assert.deepEqual(progreso(h), { hechas: 1, total: 5, siguiente: 'meta', completa: false })
  const g1 = guardar(g0, h)
  h = hechas(g1, {}) // la señal se perdió: la casilla sigue hecha
  assert.ok(h.has('camino'))
  const ahora = 1_000_000
  const g2 = ocultar(g1, ahora)
  assert.equal(visible(g2, h, ahora + OCULTAR_MS - 1), false)
  assert.equal(visible(g2, h, ahora + OCULTAR_MS + 1), true)
  const todas = hechas(g0, { camino: true, meta: true, ritual: true, telefono: true, loop: true })
  assert.equal(visible(g0, todas, ahora), false)
  assert.equal(hechas({ hechas: ['camino', 'otra' as never], ocultaHasta: null }, {}).size, 1)
})

test('lenguaje de negocio: los cuatro pedidos de Daniel, sin jerga técnica ni rayas largas', () => {
  assert.deepEqual(PEDIDOS_SOCIO.map(p => p.etiqueta), ['Encuentra el cuello de botella de mi negocio', 'Arma mi oferta', 'Diagnostica a un cliente', '¿Dónde se me fuga el dinero?'])
  const visibles = [...PEDIDOS_SOCIO.flatMap(p => [p.etiqueta, p.como, p.pedido]), PLACEHOLDER_SOCIO, ...Object.values(TITULO_V2), ...CASILLAS.flatMap(c => [DATOS_CASILLA[c].titulo, DATOS_CASILLA[c].para])]
  for (const t of visibles) {
    assert.doesNotMatch(t, /\b(token|tokens|oauth|mcp|harness|api key|cli|prompt)\b/i, t)
    assert.doesNotMatch(t, /—/, t)
  }
})

test('sin token de la suscripción también en v2 (decisión del 12 oct)', () => {
  for (const r of ARCHIVOS_V2) assert.doesNotMatch(fuente(r), /setup-token|sk-ant-oat|CLAUDE_CODE_OAUTH_TOKEN/, r)
})

/** Un disco de mentira: rutas → { mtime, dir, cabeza }. */
function disco(archivos: Record<string, { m?: number; dir?: boolean; cabeza?: string }>): Fs {
  const hijos = (p: string) => [...new Set(Object.keys(archivos).filter(k => k.startsWith(p + '/')).map(k => k.slice(p.length + 1).split('/')[0]))]
  return {
    readdirSync: (p) => { const h = hijos(p); if (!h.length && !archivos[p]?.dir) throw new Error('ENOENT'); return h },
    statSync: (p) => { const a = archivos[p]; const dir = a?.dir ?? hijos(p).length > 0; if (!a && !dir) throw new Error('ENOENT'); return { mtimeMs: a?.m ?? 0, isDirectory: () => dir } },
    cabeza: (p) => archivos[p]?.cabeza ?? '',
  }
}

test('contar lo que se puede traer: sin sesiones del SDK, sin hilos laterales, sin agentes y solo lo reciente', () => {
  const ahora = 100 * 86_400_000, nuevo = ahora - 86_400_000, viejo = ahora - 60 * 86_400_000
  const persona = '{"type":"user","entrypoint":"cli","isSidechain":false}\n'
  const fs = disco({
    '/h/.claude/projects/negocio/a.jsonl': { m: nuevo, cabeza: persona },
    '/h/.claude/projects/negocio/b.jsonl': { m: nuevo, cabeza: '{"type":"user","entrypoint":"sdk-ts"}\n' },
    '/h/.claude/projects/negocio/agent-1.jsonl': { m: nuevo, cabeza: persona },
    '/h/.claude/projects/otro/c.jsonl': { m: nuevo, cabeza: '{"type":"user","isSidechain":true,"entrypoint":"cli"}\n' },
    '/h/.claude/projects/otro/d.jsonl': { m: viejo, cabeza: persona },
    '/h/.claude/projects/tercero/e.jsonl': { m: nuevo, cabeza: persona },
    '/h/.codex/sessions/2026/11/01/rollout-1.jsonl': { m: nuevo, cabeza: '{"type":"session_meta","payload":{"source":"cli"}}\n' },
    '/h/.codex/sessions/2026/11/01/rollout-2.jsonl': { m: nuevo, cabeza: '{"type":"session_meta","payload":{"source":"exec"}}\n' },
    '/h/.codex/sessions/2026/09/01/rollout-3.jsonl': { m: viejo, cabeza: '{"type":"session_meta","payload":{"source":"vscode"}}\n' },
    '/h/Developer/mi-oferta/.git': { m: nuevo, dir: true },
    '/h/Developer/viejo/.git': { m: viejo, dir: true },
    '/h/Developer/sin-git/x.txt': { m: nuevo },
  })
  const desde = ahora - 30 * 86_400_000
  assert.deepEqual(contarClaude('/h/.claude', desde, fs), { n: 2, proyectos: 2 })
  assert.equal(contarCodex('/h/.codex', desde, fs), 1)
  assert.deepEqual(carpetasRecientes('/h', ahora, fs).map(c => c.nombre), ['mi-oferta', 'viejo'])
  const todo = hallazgosLocales({}, '/h', ahora, 30, fs)
  assert.deepEqual(todo.chats, { claude: 2, codex: 1, proyectos: 2, dias: 30 })
  assert.equal(esConversacionClaude(''), true, 'sin primer registro legible cuenta (no se descarta a ciegas)')
})

test('nunca recorre Documentos ni Escritorio (aviso de permisos de macOS) ni lee más que la cabeza', () => {
  for (const r of RAICES_CODIGO) assert.doesNotMatch(r, /Documents|Desktop|Documentos|Escritorio|Downloads/)
  assert.doesNotMatch(fuente('src/features/primer-arranque/v2/negocio-local.ts'), /readFileSync/)
  assert.equal(join('/h', ''), '/h')
})
