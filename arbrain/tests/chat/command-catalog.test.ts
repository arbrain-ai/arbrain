import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  CATALOGO_BASE, comandoDeMensaje, filtrarComandos, fusionarCatalogo, normalizarRemoto, pideArgumentos, textoRelleno,
  type ComandoCatalogo,
} from '../../src/features/chat/lib/command-catalog'

const sdk = (name: string, description: string, extra: Partial<ComandoCatalogo> = {}): ComandoCatalogo =>
  ({ name, description, section: 'nativos', kind: 'sdk', ...extra })

const remoto: ComandoCatalogo[] = [
  sdk('/code-review', 'Revisa el diff en busca de bugs'),
  sdk('/rename', 'Renombra la conversación', { argumentHint: '[nombre]' }),
  sdk('/goal', 'Set a goal (SDK)', { section: 'modos' }),
  sdk('/habit-system', 'Agenda, tareas y hábitos de Daniel', { section: 'skills', origin: 'proyecto' }),
  sdk('/pdf', 'Leer y crear PDFs', { section: 'skills', origin: 'plugin', aliases: ['documento'] }),
  { name: '@Explore', description: 'Explora el código', section: 'agentes', kind: 'agent' },
]
const catalogo = fusionarCatalogo({ remoto })

test('base: los 16 comandos de siempre siguen y no hay duplicados', () => {
  const viejos = ['/clear', '/compact', '/status', '/skills', '/memory', '/mcp', '/todos', '/tasks', '/agents', '/context', '/model', '/effort', '/fast', '/ultracode', '/usage', '/help']
  const nombres = CATALOGO_BASE.map((c) => c.name)
  for (const v of viejos) assert.ok(nombres.includes(v), v)
  assert.equal(new Set(nombres).size, nombres.length)
})

test('fusión: gana lo local sobre el SDK y el orden de secciones es fijo', () => {
  const goal = catalogo.filter((c) => c.name === '/goal')
  assert.equal(goal.length, 1)
  assert.equal(goal[0].kind, 'mode')
  assert.match(goal[0].description, /Objetivo/)
  const orden = ['modos', 'arbrain', 'nativos', 'skills', 'agentes']
  const idx = catalogo.map((c) => orden.indexOf(c.section))
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b))
  // modos conserva el orden fijo (/goal primero), nativos va alfabético
  assert.equal(catalogo[0].name, '/goal')
  const nativos = catalogo.filter((c) => c.section === 'nativos').map((c) => c.name)
  assert.deepEqual(nativos, ['/code-review', '/rename'])
})

test('fusión: nombres del init se suman sin duplicar y sin los internos', () => {
  const m = fusionarCatalogo({
    remoto,
    initNames: ['compact', 'rename', 'mi-skill', '__remote-workflow', 'heapdump', 'workflow-launch-exec', 'init', '/otra'],
  })
  const nombres = m.map((c) => c.name)
  assert.equal(nombres.filter((n) => n === '/compact').length, 1)
  assert.equal(nombres.filter((n) => n === '/rename').length, 1)
  assert.equal(m.find((c) => c.name === '/mi-skill')?.section, 'skills')
  assert.equal(m.find((c) => c.name === '/init')?.section, 'nativos')
  assert.ok(nombres.includes('/otra'))
  assert.ok(!nombres.some((n) => n.includes('__') || n.includes('heapdump') || n.includes('workflow-launch-exec')))
})

test('normalizarRemoto descarta filas inválidas u ocultas', () => {
  const l = normalizarRemoto([{ name: '/ok', description: 'x', section: 'skills', kind: 'sdk' }, { name: '', section: 'skills', kind: 'sdk' },
    { name: '/raro', section: 'inventada', kind: 'sdk' }, { name: '/__interno', section: 'nativos', kind: 'sdk' }, null, 7])
  assert.deepEqual(l.map((c) => c.name), ['/ok'])
  assert.deepEqual(normalizarRemoto('no es lista'), [])
})

test('filtro: subcadena, no solo prefijo, e ignora acentos y mayúsculas', () => {
  assert.ok(filtrarComandos(catalogo, 'review').some((c) => c.name === '/code-review'))
  assert.ok(filtrarComandos(catalogo, 'HABIT').some((c) => c.name === '/habit-system'))
  assert.ok(filtrarComandos(catalogo, 'conversacion').some((c) => c.name === '/rename'), 'descripción sin acento')
  assert.deepEqual(filtrarComandos(catalogo, 'zzzz'), [])
})

test('filtro: ranking prefijo > subcadena en nombre > alias > descripción dentro de la sección', () => {
  const items: ComandoCatalogo[] = [
    sdk('/zeta-plan', 'x'), sdk('/pla', 'x'), sdk('/a', 'hace plan raro'), sdk('/b', 'x', { aliases: ['planear'] }), sdk('/plano', 'x'),
  ]
  assert.deepEqual(filtrarComandos(items, '/plan').map((c) => c.name), ['/plano', '/zeta-plan', '/b', '/a'])
})

test('filtro: agrupa por sección y «@» solo trae agentes; alias encuentra', () => {
  const todos = filtrarComandos(catalogo, '')
  assert.equal(todos.length, catalogo.length)
  assert.deepEqual(filtrarComandos(catalogo, '@').map((c) => c.name), ['@Explore'])
  assert.deepEqual(filtrarComandos(catalogo, '@exp').map((c) => c.name), ['@Explore'])
  assert.deepEqual(filtrarComandos(catalogo, 'documento').map((c) => c.name), ['/pdf'])
  const secciones = filtrarComandos(catalogo, 'e').map((c) => c.section)
  const orden = ['modos', 'arbrain', 'nativos', 'skills', 'agentes']
  const idx = secciones.map((s) => orden.indexOf(s))
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b))
})

test('comandoDeMensaje reconoce «/palabra args» del catálogo y no texto normal', () => {
  assert.equal(comandoDeMensaje(catalogo, '/habit-system revisa mi semana')?.name, '/habit-system')
  assert.equal(comandoDeMensaje(catalogo, '/clear')?.name, '/clear')
  assert.equal(comandoDeMensaje(catalogo, '/documento')?.name, '/pdf', 'por alias')
  assert.equal(comandoDeMensaje(catalogo, 'hola /clear'), null)
  assert.equal(comandoDeMensaje(catalogo, '/noexiste'), null)
})

test('selección: qué se envía y qué rellena el composer', () => {
  const por = (n: string) => [...catalogo, ...CATALOGO_BASE].find((c) => c.name === n)!
  assert.equal(pideArgumentos(por('/status')), false)
  assert.equal(pideArgumentos(por('/fast')), false)
  assert.equal(pideArgumentos(por('/compact')), false)
  assert.equal(pideArgumentos(por('/goal')), true)
  assert.equal(pideArgumentos(por('/loop')), true)
  assert.equal(pideArgumentos(por('/habit-system')), true)
  assert.equal(pideArgumentos(por('/rename')), true)
  assert.equal(pideArgumentos(por('/code-review')), false)
  assert.equal(textoRelleno(por('/goal')), '/goal ')
  assert.equal(textoRelleno(por('@Explore')), 'Usa el subagente Explore para ')
})

test('modo plan: no se ofrece mientras el daemon no lo implemente', () => {
  assert.ok(!catalogo.some((c) => c.name === '/plan'))
})

test('fusión: con catálogo remoto de Codex se descartan los modos solo de Claude', () => {
  const codex: ComandoCatalogo[] = [
    { name: '/goal', description: 'x', section: 'modos', kind: 'mode' },
    { name: '/model', description: 'x', section: 'modos', kind: 'mode' },
  ]
  const nombres = fusionarCatalogo({ remoto: codex }).filter((c) => c.section === 'modos').map((c) => c.name)
  assert.deepEqual(nombres, ['/goal', '/model'])
})

test('filtro: la coincidencia exacta de nombre gana a cualquier sección', () => {
  const items: ComandoCatalogo[] = [
    { name: '/status', description: 'revisa el init del sistema', section: 'arbrain', kind: 'local' },
    sdk('/init', 'Inicializa'),
  ]
  assert.equal(filtrarComandos(items, '/init')[0].name, '/init')
})
